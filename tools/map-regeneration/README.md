# Map regeneration tools

The scripts used to upgrade `assets/world-map.svg`'s country shapes from the
original ~20-vertex-per-small-country simplification to detail sourced from
[Natural Earth](https://www.naturalearthdata.com/) 1:50m data, while keeping
everything working with the game's existing coordinate space, zoom logic,
and the 32 non-gameplay "land-other" territories.

Not part of the shipped game — these are offline, one-time (or occasional)
generation scripts. Nothing here is loaded by `index.html`.

## Why this exists / what it actually does

The game's map is a single SVG embedded as a JS string constant. Every
country is a flat `<path id="xx">` with no `<g>` wrapping (required by
`js/worldmap.js`'s `path[id]` selector and its silhouette-mode `d`-attribute
reads — see the comments in `generate_map.py` and `ring_select.py` for the
specific constraints this pipeline works within).

Small countries only had a handful of vertices in the original data because
it was simplified for a good *whole-world* view, not for looking accurate
once you zoom into one country. This pipeline re-derives each country's
shape from Natural Earth's much higher-resolution data, while:

- keeping every country roughly where and how big it already was (via one
  shared global Robinson projection — **not** a per-country fit, which was
  tried first and broke shared borders between neighbors; see below),
- never making a country's detail *worse* than it already is,
- correctly excluding a country's own overseas exclaves (e.g. French
  Guiana isn't pulled into France's shape) while still keeping real
  archipelagos intact (Indonesia's islands aren't scattered/dropped),
- keeping the map's existing `.land-other` territories aligned with their
  gameplay-country neighbors.

**This took three rounds to get right, and each round's failure is worth
reading before touching this code again:**

1. **First attempt used a per-country independent transform** (fit each
   country's own bbox to its own old slot on the map). Looked fine per
   country in isolation, but broke **shared borders between neighbors** —
   visible gaps across the whole map, worst in dense regions. Reverted
   before ever shipping. *Always screenshot the whole-world view, not just
   individual countries, when touching this.*
2. **Shipped, then found archipelago countries got worse, not better.** A
   naive "guarantee a minimum point count per kept island part" safety
   floor became the *dominant* constraint for countries with 100+ real
   parts (Indonesia), forcing simplification aggressive enough to flatten
   even the largest islands (Java, Sumatra) to ~4-point diamonds. Fixed by
   budgeting proportional to how much detail is actually available, not a
   flat per-part floor — see `compute_target_max()`.
3. **Shipped again, then found real borders still gapped, a country had an
   internal hole, and several small islands were positioned in the wrong
   country entirely.** Three separate bugs:
   - Countries where Natural Earth's raw detail was worse than the existing
     map were left in the *old* map's coordinate system while everything
     else moved to the new global transform — they drifted to visibly wrong
     positions (Puerto Rico ended up near Brazil). **Fix: never leave a
     shape in the old coordinate system — reposition it even when keeping
     its old (better) points.**
   - Independently simplifying a country's coastline can "cut a corner"
     through a small offshore island that never overlapped in the raw data,
     rendering as a hole under the map's `evenodd` fill-rule (found on
     Brazil). **Fix: detect post-simplification area overlap between a
     country's own rings and fuse (union) them, don't just drop one — an
     `.intersects()`-based drop is wrong too, since it's also true for
     rings that only *touch* by design (Somaliland glued onto Somalia).**
   - Two countries' polygons touching at *some* point doesn't mean their
     whole real border aligns (Pakistan-China had a visible gap despite
     `distance() == 0`). **Fix: buffer each country's primary/mainland ring
     outward slightly to close residual gaps — deliberately not the
     secondary island rings too, or archipelago countries' many close
     islands start overlapping each other.**

4. **A later session reported small countries sitting inside the wrong
   neighbor** (Singapore inside Cambodia, São Tomé and Príncipe inside
   Nigeria) **plus stray "dot" artifacts** (a sub-pixel sliver ring in south
   India, another in northern China). Two separate causes:
   - The `generate_map.py` code already *had* the correct fix (repositioning
     via each country's own Natural-Earth-derived centroid, not the stale
     old-map bbox), but the pipeline had apparently been re-run at some
     point after the round-3 commit and its output was never actually
     re-applied to `assets/world-map.svg` — roughly 150 small
     countries/territories (mostly island nations and `land-other`
     territories) were left at positions from an earlier, less-correct run,
     some over 150px off in this map's coordinate space. **Confirmed by
     projecting each country's real-world lon/lat through the current
     `global_transform` directly and comparing to both the committed and
     regenerated positions** — not just eyeballing it, since most of these
     countries have no land borders and so aren't caught by
     `check_border_continuity`. **Lesson: after changing anything in this
     pipeline, always diff the regenerated output against the currently
     *committed* file and re-apply — a correct fix sitting only in `.work/`
     helps no one.**
   - `MIN_VISIBLE_PX` (in `ring_select.py`) was `1.0`, letting through
     secondary island rings whose projected bbox was just over 1px in its
     *largest* dimension while near-zero in the other — real, but
     rendering as a meaningless speck rather than a recognizable shape.
     Raised to `2.0`. This is a judgment call, not a correctness bug: real
     archipelago nations (Indonesia, Philippines, Solomon Islands, Bahamas,
     etc.) still legitimately keep plenty of sub-2px islands after this
     change, since the threshold only drops parts smaller than that, never
     the anchor/primary shape.

**Standing lesson**: verify with a more skeptical eye than "the specific bug
just reported is fixed." Every round above fixed exactly the reported
symptom while a different bug of the same general class was already present
or got introduced by the fix itself. Before trusting a regenerated map: a
whole-world screenshot, several regional screenshots, `verify_map.py`'s
border-distance check across *all* real neighbor pairs, its self-overlap
check, AND a diff of regenerated vs. currently-committed positions (small
countries with no land borders won't show up in the border-distance check
at all) — not just the one thing someone happened to notice.

## Prerequisites

```bash
pip install shapely
```

(`shapely` ships prebuilt wheels for Windows/Mac/Linux — no compiler
needed.) Internet access is needed once, to fetch Natural Earth's data
(cached locally afterward, see below).

## Running it

All commands from this directory (`tools/map-regeneration/`):

```bash
python parse_current_map.py     # reads assets/world-map.svg -> .work/parsed_bboxes.json
python fetch_natural_earth.py   # fetches Natural Earth data -> .work/ne_indexed.json (+ ne_50m_raw.json cache)
python generate_map.py          # runs the full pipeline -> .work/world-map-OUTPUT.svg
python verify_map.py            # sanity-checks .work/world-map-OUTPUT.svg
```

`.work/` is where every intermediate file and the final output land — it's
gitignored, safe to delete anytime, and gets recreated by re-running the
steps above. Re-running `fetch_natural_earth.py` reuses the cached raw fetch
(`.work/ne_50m_raw.json`, ~4.5MB) if present; delete that file to force a
fresh pull from Natural Earth.

**Applying the result**: `verify_map.py`'s checks passing is necessary but
not sufficient — actually look at the map in a browser before replacing
`assets/world-map.svg`. There is no automated substitute for a whole-world
screenshot and clicking through a few countries, per the lessons above.

```bash
cp .work/world-map-OUTPUT.svg ../../assets/world-map.svg
# then regenerate assets/world-map.js (a verbatim template-literal wrap -
# see the comment at the top of assets/world-map.js for the exact format)
# and bump the ?v=N cache-busting query string in index.html
```

## Files

| File | Purpose |
|---|---|
| `parse_current_map.py` | Parses the *current* map SVG → each country's existing pixel bbox/point count (the "ground truth" everything else is positioned/budgeted against) |
| `fetch_natural_earth.py` | Fetches & caches Natural Earth 1:50m data, indexed by our country ids |
| `svgpath.py` | Minimal parser/emitter for the map's restricted SVG path syntax (`M`/`m`/`l`/`z`, plus `L` for this pipeline's own output) |
| `robinson.py` | Standard Robinson map projection (lon/lat → projected x/y) |
| `global_transform.py` | Fits the Robinson projection to the current map's `viewBox` — the ONE shared transform every country uses |
| `ring_select.py` | Decides which Natural Earth polygon parts belong to each country (proximity clustering — keeps real archipelagos, drops overseas exclaves) |
| `generate_map.py` | The main pipeline — ties everything together, writes the final SVG |
| `verify_map.py` | Post-generation sanity checks (structural validity, self-overlap, border continuity) |
