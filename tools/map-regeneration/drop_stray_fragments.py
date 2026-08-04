"""One-off fix: remove specific stray antimeridian-wraparound subpaths that
were blowing up the US and New Zealand bounding boxes (85-91% of the whole
map width), which made App.Map.focusCountry()'s auto-zoom pull back far
too much and made these countries look tiny in Guess-mode hints.

Root cause: these countries have real islands that cross the antimeridian
(Aleutians for the US, likely the Chatham Islands for NZ). A single tiny
fragment (a handful of points) for each got projected onto the opposite
edge of the map instead of continuing the natural island chain, isolated
by ~800-900px from everything else in the same path. Confirmed via
find_stray_fragments.py: removing just these two subpaths shrinks the US
bbox from 875px (85% of map) to ~278px (27%), and NZ from 939px (91%) to
~67px (6.5%) -- matching their real compact geography. Everything else in
each path (mainland US + the rest of the Aleutian chain; NZ's main
islands) is untouched.

Not part of the regular build pipeline -- a targeted, verified one-time
patch. See find_stray_fragments.py for the diagnostic this is based on.
"""
import re

SVG_PATH = "assets/world-map.svg"
JS_PATH = "assets/world-map.js"

# (country id, exact "M ... Z " subpath text to remove) -- located via
# find_stray_fragments.py's reported bbox, then matched back to its exact
# source text so removal is an unambiguous literal string replace.
TARGETS = [
    ("us", "M 940.9,433.1 L 941.7,433.2 L 943,433.6 L 942.3,433.8 L 942.1,434 L 941.1,433.5 Z "),
    ("nz", "M 60.2,747.5 L 59.7,747.8 L 60.7,748.5 L 60.4,748.7 L 59.8,748.3 L 59.8,748 L 58.8,747.5 L 59.2,747.4 Z "),
]


def remove_subpath(d, exact_subpath):
    if d.count(exact_subpath) != 1:
        raise SystemExit(f"expected exactly 1 occurrence, found {d.count(exact_subpath)}: {exact_subpath!r}")
    new_d = d.replace(exact_subpath, "")
    return new_d.strip(), exact_subpath


def main():
    svg = open(SVG_PATH, encoding="utf-8").read()

    for cid, anchor in TARGETS:
        m = re.search(r'(<path\b[^>]*\bid="' + cid + r'"[^>]*\bd=")([^"]+)(")', svg)
        if not m:
            raise SystemExit(f"path not found for id={cid}")
        d = m.group(2)
        new_d, removed = remove_subpath(d, anchor)
        print(f"{cid}: removed subpath ({len(removed)} chars): {removed[:80]}...")
        svg = svg[:m.start(2)] + new_d + svg[m.end(2):]

    open(SVG_PATH, "w", encoding="utf-8", newline="\n").write(svg)
    print(f"wrote {SVG_PATH}")

    js = "const WORLD_MAP_SVG = `" + svg + "`;\n"
    open(JS_PATH, "w", encoding="utf-8", newline="\n").write(js)
    print(f"wrote {JS_PATH}")


if __name__ == "__main__":
    main()
