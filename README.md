# מגלי עולם (World Explorers)

A Hebrew-language geography game for elementary-school kids, built around
one shared interactive world map.

**Play it: https://world-explorers.gidron.org**

## Modes

- **חקר (Explore)** — free pan/zoom/click around the map, no scoring.
- **נחש את המדינה (Guess the Country)** — given a name, click it on the map.
- **נחש לפי הצורה (Guess by Shape)** — given just a silhouette, name the country.
- **התאם דגל (Flag Match)** — match flags to countries.
- **התאם בירה (Capital Match)** — match capitals to countries.
- **חידון (Trivia)** — multiple-choice geography quiz.

Progress (stars per country, streaks, badges) is saved locally in the
browser (`localStorage`) — nothing is sent to a server.

## Running it locally

No build step, no install, no server required:

1. Clone or download the repo.
2. Double-click `index.html` (or open it directly in a browser via a
   `file://` URL).

That's it. This is a deliberate constraint of the project — see
[`CLAUDE.md`](CLAUDE.md) if you're going to make changes, since it rules out
a few things you might otherwise reach for (ES modules, `fetch()` for local
files, a bundler).

## Tech stack

Plain HTML/CSS/JavaScript. No framework, no build tool, no dependencies to
install. The one external asset is the [flag-icons](https://github.com/lipis/flag-icons)
CSS library, loaded from a CDN in `index.html`.

## Deployment

Static hosting via GitHub Pages, custom domain via the `CNAME` file at the
repo root. Pushing to `main` deploys — there's no separate build/publish
step.

## Credits

- Country shapes: derived from [Natural Earth](https://www.naturalearthdata.com/)
  public-domain 1:50m cultural vector data. See
  [`tools/map-regeneration/`](tools/map-regeneration/) for the pipeline that
  built `assets/world-map.svg` from it.
- Flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT license).
- Population figures are approximate.

## License

MIT — see [`LICENSE`](LICENSE).

## For future development

See [`CLAUDE.md`](CLAUDE.md) for architecture notes, project conventions,
and a list of non-obvious gotchas worth knowing before changing
`js/worldmap.js` or the map data.
