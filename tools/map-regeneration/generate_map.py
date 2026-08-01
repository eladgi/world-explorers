"""Main pipeline: regenerates the map's country shapes from Natural Earth
1:50m data, replacing assets/world-map.svg's `d` attributes in place.

Prerequisites (run once, in order):
  1. pip install shapely
  2. python parse_current_map.py     -> .work/parsed_bboxes.json
  3. python fetch_natural_earth.py   -> .work/ne_indexed.json + ne_50m_raw.json

Then: python generate_map.py         -> writes .work/world-map-OUTPUT.svg

See README.md for the full story and how to review/apply the output.
"""
import json
import os
import re

from shapely.geometry import shape, Polygon
from shapely.ops import unary_union

from svgpath import parse_d, emit_d_absolute
import global_transform as gt
from ring_select import parts_of, lat_corrected_area, cluster_parts, MIN_VISIBLE_PX

WORK_DIR = os.path.join(os.path.dirname(__file__), '.work')
PROJECT_SVG = gt.PROJECT_SVG  # same repo-root-relative assets/world-map.svg path
OUTPUT_SVG = os.path.join(WORK_DIR, 'world-map-OUTPUT.svg')

# --- point budget ---
MIN_PTS, MAX_PTS = 50, 180
POINT_MULTIPLIER = 3
HARD_CEILING = 900  # true safety valve for genuinely huge/complex countries, not a normal target
BORDER_BUFFER_PX = 0.8
AREA_OVERLAP_EPS = 0.02  # px^2 - numerical-noise floor, not a "is this a real problem" threshold

LAND_OTHER_IDS = ['ad', 'ag', 'ai', 'aw', 'bb', 'bm', 'cw', 'eh', 'fj', 'fo', 'gd', 'gf',
                   'gp', 'hk', 'ic', 'kn', 'ky', 'li', 'mq', 'ms', 'nr', 'pf', 'pn', 'ps',
                   're', 'sx', 'tc', 'tl', 'to', 'vg', 'vi', 'yt']

# approximate real-world centroid (lon, lat) for the handful of small
# territories not present as separate admin-0 features in Natural Earth at
# any resolution - used only to translate their EXISTING old shape to the
# right spot, not to add new detail
MANUAL_LONLAT = {
    'gf': (-53.1, 3.9), 'gp': (-61.55, 16.25), 'ic': (-15.6, 28.3),
    'mq': (-61.0, 14.6), 're': (55.5, -21.1), 'yt': (45.2, -12.8),
}


def load_json(name):
    with open(os.path.join(WORK_DIR, name), encoding='utf-8') as f:
        return json.load(f)


# Natural Earth represents Somaliland (unrecognized, de facto independent) as
# its own separate feature, not part of "Somalia" - our data has no separate
# id for it (not a gameplay country, not a tracked land-other territory
# either), so leaving it out opened a real gap between Djibouti and Somalia
# where the old map (which draws Somalia as one unified shape, matching most
# general-audience world maps) had none. Fold it into "so"'s own geometry
# before clustering so the combined shape closes that gap.
def merge_somaliland(entry):
    with open(os.path.join(WORK_DIR, 'ne_50m_raw.json'), encoding='utf-8') as f:
        raw = json.load(f)
    somaliland = next(f for f in raw['features'] if f['properties'].get('NAME') == 'Somaliland')
    sl_geom = somaliland['geometry']
    sl_polys = sl_geom['coordinates'] if sl_geom['type'] == 'MultiPolygon' else [sl_geom['coordinates']]
    so_polys = entry['coordinates'] if entry['type'] == 'MultiPolygon' else [entry['coordinates']]
    return {'type': 'MultiPolygon', 'coordinates': so_polys + sl_polys}


def select_kept_parts(ne_entry):
    """Clusters this country's Natural Earth parts by proximity, keeps the
    cluster containing the largest (anchor) part, drops sub-pixel remainders
    (never the anchor itself). Returns (parts, kept_idxs sorted anchor-first,
    anchor_part)."""
    geom = shape({'type': ne_entry['type'], 'coordinates': ne_entry['coordinates']})
    parts = parts_of(geom)
    if len(parts) == 1:
        return parts, [0], parts[0]
    areas = [lat_corrected_area(Polygon(p.exterior.coords)) for p in parts]
    anchor_idx = max(range(len(parts)), key=lambda i: areas[i])
    clusters = cluster_parts(parts)
    anchor_cluster = next(c for c in clusters if anchor_idx in c)
    kept = set(anchor_cluster)
    too_small = set()
    for i in kept:
        if i == anchor_idx:
            continue
        b = parts[i].bounds
        x0, y0 = gt.project(b[0], b[1])
        x1, y1 = gt.project(b[2], b[3])
        if max(abs(x1 - x0), abs(y1 - y0)) < MIN_VISIBLE_PX:
            too_small.add(i)
    kept -= too_small
    return parts, sorted(kept, key=lambda i: -areas[i]), parts[anchor_idx]  # anchor first


def simplify_one_ring(ring_pts_xy, tol):
    if len(ring_pts_xy) <= 4:
        return ring_pts_xy
    poly = Polygon(ring_pts_xy)
    if not poly.is_valid:
        poly = poly.buffer(0)
        if poly.is_empty or poly.geom_type != 'Polygon':
            return ring_pts_xy
    simplified = poly.simplify(tol, preserve_topology=True)
    if simplified.is_empty or simplified.geom_type != 'Polygon':
        return ring_pts_xy
    pts = list(simplified.exterior.coords)
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def compute_target_max(old_point_count, raw_rings):
    """Budget proportional to how much real detail is actually available (up
    to ~15 points/kept-part average, capped by what Natural Earth actually
    has), not a flat per-part minimum - an earlier flat-floor version became
    the dominant constraint for archipelago countries with 100+ kept parts
    (Indonesia), forcing a shared tolerance so aggressive it flattened even
    the largest islands to ~4-point diamonds. Also never regresses below the
    country's own existing point count, even for already-detailed countries
    (US, Canada, Russia) that would otherwise get capped down by MAX_PTS."""
    base = max(MIN_PTS, old_point_count, min(MAX_PTS, old_point_count * POINT_MULTIPLIER))
    raw_total = sum(len(r) for r in raw_rings)
    generous = min(raw_total, len(raw_rings) * 15)
    return min(max(base, generous), HARD_CEILING)


def drop_overlapping_secondary_rings(rings):
    """Merges (unions) any non-primary ring that genuinely overlaps AREA with
    the primary (largest) ring, into the primary - rather than dropping it.
    Two different bugs led here: (a) using `.intersects()` instead of an
    area check wrongly caught rings that only TOUCH (e.g. Somaliland
    deliberately glued onto Somalia above) and deleted them, and (b) even a
    genuine overlap shouldn't delete real area - independently simplifying a
    country's coastline can "cut a corner" through a small offshore island
    that never overlapped in the raw data (confirmed on Brazil); the fix is
    to fuse the island into the mainland (no hole, no deleted area), not
    remove it."""
    if len(rings) <= 1:
        return rings
    try:
        primary_poly = Polygon(rings[0])
        if not primary_poly.is_valid:
            primary_poly = primary_poly.buffer(0)
    except Exception:
        return rings
    kept = []
    for ring in rings[1:]:
        try:
            p = Polygon(ring)
            if not p.is_valid:
                p = p.buffer(0)
            if primary_poly.intersection(p).area > AREA_OVERLAP_EPS:
                merged = unary_union([primary_poly, p])
                if merged.geom_type == 'Polygon':
                    primary_poly = merged
                    continue
        except Exception:
            pass
        kept.append(ring)
    primary_pts = list(primary_poly.exterior.coords)
    if primary_pts[0] == primary_pts[-1]:
        primary_pts = primary_pts[:-1]
    return [primary_pts] + kept


def simplify_rings_to_budget(rings_px, target_max):
    """Binary-searches ONE shared tolerance across all of a country's rings
    (not an even point-count split, which starves complex archipelagos) to
    use as much of the point budget as available."""
    lo = 0.0
    best = [simplify_one_ring(r, lo) for r in rings_px]
    if sum(len(r) for r in best) > target_max:
        hi = 3.0
        hi_total = sum(len(simplify_one_ring(r, hi)) for r in rings_px)
        while hi_total > target_max and hi < 5000:
            hi *= 2
            hi_total = sum(len(simplify_one_ring(r, hi)) for r in rings_px)
        best = [simplify_one_ring(r, hi) for r in rings_px]
        for _ in range(25):
            mid = (lo + hi) / 2
            candidate = [simplify_one_ring(r, mid) for r in rings_px]
            total = sum(len(r) for r in candidate)
            if total <= target_max:
                best = candidate
                hi = mid
            else:
                lo = mid
    return drop_overlapping_secondary_rings(best)


def buffer_close_gaps(rings_px):
    """Expands only the PRIMARY (mainland) ring by a small fixed amount so
    sub-pixel-to-low-single-digit-pixel gaps from independent simplification
    (two neighbors technically touch somewhere but diverge elsewhere, e.g.
    Pakistan-China) get covered - a slight overlap between two opaque
    same-styled fills is invisible, unlike a gap. Deliberately does NOT
    buffer secondary rings: doing so uniformly caused archipelago countries
    (Australia, Canada, Philippines, Greece...) to have their many close
    islands start overlapping EACH OTHER. Real international borders are
    overwhelmingly on the mainland shape anyway."""
    if not rings_px:
        return rings_px
    out = [rings_px[0]]
    try:
        poly = Polygon(rings_px[0])
        if not poly.is_valid:
            poly = poly.buffer(0)
        buffered = poly.buffer(BORDER_BUFFER_PX, resolution=1, join_style=2)
        if not buffered.is_empty:
            if buffered.geom_type == 'MultiPolygon':
                buffered = max(buffered.geoms, key=lambda g: g.area)
            pts = list(buffered.exterior.coords)
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            out = [pts]
    except Exception:
        pass
    out.extend(rings_px[1:])
    return drop_overlapping_secondary_rings(out)  # buffering can newly overlap a secondary ring


def project_rings(parts, kept_idxs):
    raw_rings = []
    for i in kept_idxs:
        ext_lonlat = list(parts[i].exterior.coords)
        if ext_lonlat[0] == ext_lonlat[-1]:
            ext_lonlat = ext_lonlat[:-1]
        raw_rings.append([gt.project(lon, lat) for lon, lat in ext_lonlat])
    return raw_rings


def combined_centroid_px(parts, kept_idxs):
    """Area-weighted centroid of the kept parts in the global pixel space -
    the correct target position when falling back to repositioning an old
    (higher-detail) shape instead of using Natural Earth's own points."""
    total_area = cx = cy = 0.0
    for i in kept_idxs:
        p = parts[i]
        a = p.area
        x, y = gt.project(p.centroid.x, p.centroid.y)
        cx += x * a
        cy += y * a
        total_area += a
    if total_area == 0:
        x, y = gt.project(*parts[kept_idxs[0]].centroid.coords[0])
        return x, y
    return cx / total_area, cy / total_area


_OLD_SVG_CONTENT = None


def _old_svg():
    global _OLD_SVG_CONTENT
    if _OLD_SVG_CONTENT is None:
        with open(PROJECT_SVG, encoding='utf-8') as f:
            _OLD_SVG_CONTENT = f.read()
    return _OLD_SVG_CONTENT


def reposition_old_shape(cid, old_bboxes, new_cx, new_cy):
    """Keeps the EXISTING shape's own points (used when they're better detail
    than Natural Earth has for this id) but translates them so the centroid
    lands at the correct globally-projected position - correct position
    always wins over maximum detail. Without this, a country left in its old
    coordinates would visibly drift once everything else moves to the new
    global transform (confirmed: Puerto Rico ended up near Brazil)."""
    m = re.search(r'data-id="' + cid + r'"[\s\S]{0,80}?\sd="([^"]*)"', _old_svg())
    subpaths = parse_d(m.group(1))
    old_bbox = old_bboxes[cid]['bbox']
    old_cx = (old_bbox['minx'] + old_bbox['maxx']) / 2
    old_cy = (old_bbox['miny'] + old_bbox['maxy']) / 2
    dx, dy = new_cx - old_cx, new_cy - old_cy
    return [[(p[0] + dx, p[1] + dy) for p in sp] for sp in subpaths]


def reposition_unresolved(cid, old_bboxes):
    """No Natural Earth coverage at all for this id - translate the existing
    shape using a manually-looked-up approximate real-world lon/lat."""
    lon, lat = MANUAL_LONLAT[cid]
    new_cx, new_cy = gt.project(lon, lat)
    return reposition_old_shape(cid, old_bboxes, new_cx, new_cy)


def process_country(cid, entry, old_point_count, old_bboxes, buffer_gaps=True):
    parts, kept_idxs, _anchor = select_kept_parts(entry)
    raw_rings = project_rings(parts, kept_idxs)
    raw_total = sum(len(r) for r in raw_rings)

    if raw_total < old_point_count:
        # Natural Earth's raw detail for this id is worse than what we
        # already have - keep the better shape, just moved to the correct position
        new_cx, new_cy = combined_centroid_px(parts, kept_idxs)
        return reposition_old_shape(cid, old_bboxes, new_cx, new_cy)

    target_max = compute_target_max(old_point_count, raw_rings)
    rings = simplify_rings_to_budget(raw_rings, target_max)
    if buffer_gaps:
        rings = buffer_close_gaps(rings)
    return rings


def process_all():
    old_bboxes = load_json('parsed_bboxes.json')
    ne = load_json('ne_indexed.json')

    final_rings = {}
    for cid, entry in ne.items():
        if cid == 'za':
            continue  # handled after 'ls' below, needs Lesotho's final points
        if cid == 'so':
            entry = merge_somaliland(entry)
        final_rings[cid] = process_country(cid, entry, old_bboxes[cid]['num_points'], old_bboxes)

    # South Africa: exterior normally, hole = Lesotho's own final points -
    # both already live in the same global pixel space, so this is a direct
    # reuse (guarantees the two boundaries coincide exactly, no seam)
    za_parts, za_kept, _ = select_kept_parts(ne['za'])
    za_raw = project_rings(za_parts, za_kept)
    za_target = compute_target_max(old_bboxes['za']['num_points'], za_raw)
    za_rings = simplify_rings_to_budget(za_raw, za_target)
    za_rings = buffer_close_gaps(za_rings)
    za_rings.append(list(final_rings['ls'][0]))  # unbuffered - exact match to Lesotho
    final_rings['za'] = za_rings

    return final_rings, old_bboxes


def process_land_other():
    """Lighter-weight pass for the 32 non-gameplay territories - reprojected
    through the SAME global transform so they stay seamlessly aligned with
    their gameplay neighbors (otherwise e.g. Western Sahara would gap
    against Morocco the same way gameplay countries gapped against each
    other before the global-transform fix)."""
    old_bboxes = load_json('parsed_bboxes.json')
    with open(os.path.join(WORK_DIR, 'ne_50m_raw.json'), encoding='utf-8') as f:
        raw = json.load(f)
    by_iso = {}
    for feat in raw['features']:
        iso = (feat['properties'].get('ISO_A2') or '').lower()
        if iso and iso not in ('-99', '') and iso in LAND_OTHER_IDS and iso not in by_iso:
            by_iso[iso] = {'type': feat['geometry']['type'], 'coordinates': feat['geometry']['coordinates']}

    final = {}
    for cid, entry in by_iso.items():
        parts, kept_idxs, _anchor = select_kept_parts(entry)
        raw_rings = project_rings(parts, kept_idxs)
        old_pc = old_bboxes[cid]['num_points']
        if sum(len(r) for r in raw_rings) < old_pc:
            new_cx, new_cy = combined_centroid_px(parts, kept_idxs)
            final[cid] = reposition_old_shape(cid, old_bboxes, new_cx, new_cy)
            continue
        target_max = max(20, min(80, old_pc * 2))
        rings = simplify_rings_to_budget(raw_rings, target_max)
        final[cid] = buffer_close_gaps(rings)

    # 6 small French departments (French Guiana, Guadeloupe, Martinique,
    # Réunion, Mayotte) plus the Canary Islands aren't present as separate
    # admin-0 features in Natural Earth at any resolution - reposition their
    # existing shape only, using a manual approximate lon/lat
    unresolved = [cid for cid in LAND_OTHER_IDS if cid not in by_iso]
    for cid in unresolved:
        final[cid] = reposition_unresolved(cid, old_bboxes)
    return final, unresolved


def emit_new_svg(final_rings):
    with open(PROJECT_SVG, encoding='utf-8') as f:
        content = f.read()
    replaced = 0
    for cid, rings in final_rings.items():
        subpaths = [[tuple(p) for p in ring] for ring in rings]
        new_d = emit_d_absolute(subpaths, decimals=1)
        pattern = re.compile(r'(data-id="' + cid + r'"[\s\S]{0,80}?\sd=")([^"]*)(")')
        new_content, n = pattern.subn(lambda m: m.group(1) + new_d + m.group(3), content, count=1)
        if n != 1:
            raise RuntimeError(f'failed to splice {cid}: matched {n} times (expected 1)')
        content = new_content
        replaced += 1
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(OUTPUT_SVG, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'replaced {replaced} paths, wrote {OUTPUT_SVG}')
    print(f'output size: {len(content)/1024:.1f} KB (was {os.path.getsize(PROJECT_SVG)/1024:.1f} KB)')


if __name__ == '__main__':
    final_rings, old_bboxes = process_all()
    print(f'gameplay countries regenerated: {len(final_rings)}')

    land_other_rings, unresolved = process_land_other()
    print(f'land-other regenerated: {len(land_other_rings)}, position-corrected only (no NE data): {unresolved}')

    all_rings = {**final_rings, **land_other_rings}
    totals = {cid: sum(len(r) for r in rings) for cid, rings in final_rings.items()}
    old_totals = {cid: old_bboxes[cid]['num_points'] for cid in final_rings}
    print('\nsample point counts (old -> new):')
    for cid in ['is', 'mt', 'cy', 'fr', 'no', 'za', 'ls', 'id', 'br', 'pk', 'cn']:
        if cid in totals:
            print(f'  {cid}: {old_totals[cid]} -> {totals[cid]}')
    avg_ratio = sum(totals.values()) / sum(old_totals.values())
    print(f'\noverall ratio: {avg_ratio:.2f}x')

    emit_new_svg(all_rings)
