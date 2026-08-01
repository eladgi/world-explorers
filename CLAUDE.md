# מגלי עולם (World Explorers) — notes for working on this repo

Hebrew-language geography game for elementary-school kids. Six modes built
around one shared interactive world map: Explore, Guess the Country, Guess
by Shape, Flag Match, Capital Match, and a Trivia quiz.

Read this before making changes — most of it is hard-won context from real
bugs, not speculative advice.

## Hard constraints — do not violate these

- **No build step, no framework, no bundler.** Must work by literally
  double-clicking `index.html` (`file://`) with zero install, *and* work
  identically when served over `https://` (it's also deployed to GitHub
  Pages). This is why:
  - No `fetch()` for local resources and no `type="module"` — both are
    blocked under `file://` in Chrome. Every JS file is a plain
    `<script src="...">` tag in `index.html`, loaded in dependency order.
  - The world map SVG is embedded as a JS string constant
    (`assets/world-map.js` wraps `assets/world-map.svg` **verbatim** in a
    template literal — byte-for-byte, no build tool does this, it's done by
    a script in `tools/map-regeneration/` or by hand). Same reasoning:
    can't `fetch()` the `.svg` file directly under `file://`.
  - Country data (`js/data/countries.js`) is a plain JS array, not JSON
    fetched at runtime.
- **Every module is `App.<Name>`**, an IIFE assigned onto a shared global
  `window.App` object, returning a small public API. No ES module
  import/export anywhere. Look at any existing file (e.g. `js/progress.js`)
  for the pattern before adding a new one.
- **Cache-busting**: every local `<script src="...">`/`<link href="...">`
  in `index.html` carries a shared `?v=N` query string. **Bump every
  occurrence together** whenever you change a JS/CSS file:
  ```bash
  sed -i 's/v=OLD/v=NEW/g' index.html
  ```
  The in-app preview/testing browser tool caches `file://` resources
  aggressively across reloads — if an edit doesn't seem to take effect while
  testing, this is almost always why. Verify via `document.styleSheets`
  rule counts or `document.scripts` directly, not by trusting
  `document.querySelector(...).href` (it can show the new URL while the
  stale content is still what's actually applied).

## Architecture

- **`index.html`** — the shell: header, mode-select grid, one `<section>`
  per view (hidden/shown by `js/menu.js`), footer credits, then every
  `<script>` tag in load order.
- **`js/worldmap.js` (`App.Map`)** — the one shared interactive map
  component every mode uses. Handles rendering, pan/zoom (pinch/drag/wheel
  via Pointer Events), country click routing, neighbor/selection state
  classes, on-map name labels, and country silhouettes (for the shape-guess
  mode). See its own header comments for the SVG structure it depends on.
- **`js/data/countries.js`** — 179 `COUNTRIES` entries
  (`id`/`name_he`/`capital_he`/`languages_he`/`population`/`continent`/
  `difficulty`/`fact_he`/`fact2_he`/`borders`), lowercase ISO alpha-2 ids.
  The map SVG has 211 shapes total; the other 32 (small territories: French
  Guiana, Hong Kong, Andorra, etc.) render as neutral non-interactive
  `.land-other` shapes with no gameplay data. If asked to "add more
  countries," the shapes already exist — it's just new `COUNTRIES` rows.
- **`js/progress.js` (`App.Progress`)** — localStorage-backed stars (0-3 per
  country, only ever increases), mistake tracking (powers "practice my weak
  countries"), streaks, and badges (computed on the fly from stars/streak
  state on every read — **never stored**, so there's no schema/migration
  risk when adding a new badge).
- **`js/menu.js` (`App.Menu`)** — navigation: main menu → shared
  continent/difficulty setup screen → the chosen mode. `renderEndActions()`
  gives every graded mode's end screen the same 3-button row (replay /
  change settings / home). `showView()` triggers a shared fade/rise CSS
  transition.
- **`js/polish.js`** — `App.Mascot` (owl speech bubble), `App.Confetti`,
  `App.Speech` (Web Speech API read-aloud, `he-IL`, no-ops silently if
  unsupported).
- **`js/audio.js` (`App.Audio`)** — Web Audio API synthesized tones, no
  sound files. Deliberately sparse: only fires on correct/incorrect
  answers and celebration moments (streak milestones, new badge, perfect
  score) — **never on plain navigation/clicks**, per explicit user
  feedback that a generic click sound was "too annoying." Respects a mute
  toggle (`localStorage` key below).
- Five graded modes (`guess.js`, `shapeguess.js`, `flagmatch.js`,
  `capitalmatch.js`, `trivia.js`) share the same shape: two-tier hints,
  streak tracking, `App.Progress.recordAnswer()`, `renderEndActions()`.
  `explore.js` is the odd one out (no right/wrong, so no progress
  recording, no streak).

### localStorage keys (deliberately separate, don't merge them)

| Key | Owner | Why separate |
|---|---|---|
| `migley-olam-progress-v1` | `App.Progress` | stars/mistakes/streak |
| `migley-olam-tutorial-seen-v1` | `App.Tutorial` | so resetting progress in the Passport screen doesn't also re-trigger onboarding |
| `migley-olam-audio-muted-v1` | `App.Audio` | same isolation reasoning |

## Known-sharp-edges checklist (read before touching these areas)

- **`setPointerCapture`**: never call it on a bare `pointerdown` — if a
  plain tap captures the pointer, the browser retargets the resulting
  native `click` to the capturing element (the SVG root) instead of the
  tapped country, so clicking silently does nothing. Only capture once a
  drag/pinch is actually detected (past `DRAG_THRESHOLD`).
- **Touch tap selection** (`js/worldmap.js`'s `onPointerUp`) fires directly
  from `pointerup` for `pointerType === "touch"`, not from the browser's
  synthesized `click` — confirmed on real Android hardware that relying on
  native click-after-touch is unreliable with custom pointer-event
  handling. Desktop/mouse is untouched (still uses the native click path).
- **`:hover` CSS rules** must be wrapped in `@media (hover: hover)` — on
  iOS Safari, the first tap on any element with an unconditional `:hover`
  rule is consumed just to simulate the hover state, so it looks like
  everything needs a double-tap.
- **`vector-effect: non-scaling-stroke`** is required on `.country`/
  `.land-other` borders, or stroke width balloons visually once you zoom in.
- **Country name labels** (`App.Map.setLabel`) use a real point-in-polygon
  visual center (`isPointInFill`-based sampling), not the bbox center —
  bbox center falls in open ocean for long curved countries like Chile.
  Labels also do lightweight collision avoidance (skip a new label if it'd
  overlap one already placed this round) — see `worldmap.js` comments.
- **Auto-zoom** (`focusCountry`/`focusCountries`) has a floor
  (`MIN_FOCUS_WIDTH_DIVISOR`) so it can never zoom in tighter than the
  map's own manual-pinch-zoom ceiling — without it, tiny countries (Cyprus,
  Malta) filled the whole screen with no surrounding context.
- **Audio**: don't add per-click/per-navigation sounds. Confirmed
  unwanted by the user once already.

## The world map data (`assets/world-map.svg` / `.js`)

If you're asked to touch the *country shapes* themselves (not just the
interactive behavior around them) — **read
[`tools/map-regeneration/README.md`](tools/map-regeneration/README.md)
first.** That pipeline (Natural Earth data → this map's coordinate system)
went through three rounds of real, shipped bugs before it was right:

1. Fitting each country's shape independently broke shared borders between
   neighbors (visible gaps across the whole map).
2. A naive "protect small islands from losing all detail" safety floor
   backfired and flattened the *largest* islands in archipelago countries
   instead.
3. Countries left in the old coordinate system (because new data would have
   been a detail downgrade) drifted to visibly wrong positions once
   everything else moved to the new one; independently-simplified coastlines
   created an unwanted hole in Brazil; some real borders still had a small
   visible gap despite technically touching at one point.

Every one of these looked fixed after addressing the specific symptom
reported, while a different bug of the same general class was already
present or got introduced by the fix itself. **Verification for any future
change here needs to include**: a whole-world screenshot (not just the
country you changed), `tools/map-regeneration/verify_map.py`'s
border-continuity check across *all* real neighbor pairs (not just the ones
someone happened to notice), and a self-overlap check.

## Deployment

Live at **world-explorers.gidron.org**, served via **GitHub Pages** from
`https://github.com/eladgi/world-explorers` (`main` branch, repo root — no
build/publish step, Pages serves the static files directly). `CNAME` file
at the repo root holds the custom domain.

Commit + push is the deploy mechanism now, not a separate step — after
verified local changes, push them. **Always `git fetch`/check `git status`
first**: the domain owner occasionally makes small edits directly on
GitHub's web UI (e.g. removing/re-adding the `CNAME` to force a Let's
Encrypt cert re-issue), which need merging in, not overwriting.

## Working with this user

- When you offer several improvement directions for something (via a
  multi-select question), expect **all or most to be picked** — scope any
  resulting plan for the combined total, not just the top recommendation.
- Emoji are the app's deliberate icon language throughout the UI (mode
  cards, mascot, badges) — this is an intentional design choice for this
  project specifically, not a default to second-guess.
- For any change to `assets/world-map.svg`/`.js`, `js/worldmap.js`, or
  anything touching click/pointer handling: test in the actual browser
  (click-through, not just code review) before calling it done — several
  real bugs in this project's history only showed up that way.
