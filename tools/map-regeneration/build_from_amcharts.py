"""Builds assets/world-map.svg from an amCharts SVG Map Generator export
instead of re-deriving shapes from raw Natural Earth data (see README.md
for why: the from-scratch Natural Earth pipeline needed its own
projection/simplification/archipelago-clustering math, and every one of
those steps turned out to be a place a real bug could hide - four rounds
of them, documented below and in README.md). amCharts' own map data is
already simplified to a sane point budget and their generator does its
own correct Robinson projection, so this script's job shrinks to: parse
their SVG, relabel ids, patch the one territory they don't have, and
verify.

Prerequisites: a `.work/amcharts_robinson_worldHigh.svg` export from
https://dojo.amcharts.com/svg-map-generator/ with:
  Map = World (High), Proj = Robinson
(see README.md for exact steps - the download is a browser interaction,
not scriptable from here).

Usage: python build_from_amcharts.py -> writes .work/world-map-OUTPUT.svg
"""
import os
import re
import sys

from svgpath import parse_d, emit_d_absolute

WORK_DIR = os.path.join(os.path.dirname(__file__), '.work')
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CURRENT_SVG = os.path.join(REPO_ROOT, 'assets', 'world-map.svg')
SOURCE_SVG = os.path.join(WORK_DIR, 'amcharts_robinson_worldHigh.svg')
OUTPUT_SVG = os.path.join(WORK_DIR, 'world-map-OUTPUT.svg')

# amCharts' World (High) has no Natural Earth admin-0 feature for these -
# same gap the old Natural-Earth-based pipeline had. Repositioned from the
# CURRENT map's existing shape via a locally-fit transform (see
# reposition_via_local_fit) rather than dropped.
UNRESOLVED = {
    'ic': ['ma', 'pt', 'es', 'mr'],  # Canary Islands -> nearby compact refs
}


def load_source_paths():
    with open(SOURCE_SVG, encoding='utf-8') as f:
        content = f.read()
    # preserves source document order, which matters: Lesotho already comes
    # after South Africa in amCharts' own ordering, so it draws on top and
    # renders correctly with no evenodd-hole trick needed (unlike the old
    # Natural Earth pipeline, which had to reconstruct that hole by hand).
    matches = re.findall(r'<path d="([^"]*)" class="land" id="([A-Za-z]{2})"', content)
    return [(cid.lower(), d) for d, cid in matches]


def load_current_paths():
    with open(CURRENT_SVG, encoding='utf-8') as f:
        content = f.read()
    return dict(re.findall(r'data-id="([a-z]{2})"[\s\S]{0,80}?\sd="([^"]*)"', content))


def centroid(subpaths):
    pts = subpaths[0]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def fit_affine(old_pts, new_pts):
    """Least-squares 2D affine fit (new = A*old + b) from paired points.
    Pure Python (no numpy dependency) - solves the two independent 3x3
    normal-equation systems for x and y via Cramer's rule."""
    n = len(old_pts)
    sx = sy = sxx = sxy = syy = 0.0
    for x, y in old_pts:
        sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y
    M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]

    def solve_for(target_vals):
        tx = ty = tc = 0.0
        for (x, y), t in zip(old_pts, target_vals):
            tx += x * t; ty += y * t; tc += t
        rhs = [tx, ty, tc]

        def det3(m):
            return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
        d = det3(M)
        coefs = []
        for col in range(3):
            Mc = [row[:] for row in M]
            for r in range(3):
                Mc[r][col] = rhs[r]
            coefs.append(det3(Mc) / d)
        return coefs  # [a, b, c] such that new = a*x + b*y + c

    new_x_vals = [p[0] for p in new_pts]
    new_y_vals = [p[1] for p in new_pts]
    return solve_for(new_x_vals), solve_for(new_y_vals)


def apply_affine(coef_x, coef_y, x, y):
    nx = coef_x[0] * x + coef_x[1] * y + coef_x[2]
    ny = coef_y[0] * x + coef_y[1] * y + coef_y[2]
    return nx, ny


def reposition_via_local_fit(cid, ref_ids, current_paths, source_by_id):
    """Translate/rescale cid's EXISTING shape (from the currently-committed
    map) using an affine transform fit only from nearby compact reference
    countries present in both coordinate systems - a global fit across all
    ~210 shared countries was tried first and had 60-120px residuals for
    large/irregular countries (US, Russia, India...) since a simple
    vertex-average centroid is a poor stand-in for their true visual
    center; restricting to a few small, nearby, compact countries keeps
    residuals under ~8px, which is what actually matters for a small
    territory's local position."""
    old_pts = [centroid(parse_d(current_paths[r])) for r in ref_ids]
    new_pts = [centroid(parse_d(source_by_id[r])) for r in ref_ids]
    coef_x, coef_y = fit_affine(old_pts, new_pts)
    old_subpaths = parse_d(current_paths[cid])
    return [[apply_affine(coef_x, coef_y, x, y) for x, y in ring] for ring in old_subpaths]


def build():
    source_paths = load_source_paths()
    source_by_id = dict(source_paths)
    current_paths = load_current_paths()

    # amCharts' export has 251 territories - many more than this game
    # tracks (American Samoa, Vatican City, Svalbard...). Only keep ids
    # this map actually uses (the 211 in the currently-committed file),
    # preserving amCharts' own document order among those.
    wanted = set(current_paths) | set(UNRESOLVED)
    final = {}
    order = []
    for cid, d in source_paths:
        if cid not in wanted:
            continue
        order.append(cid)
        final[cid] = parse_d(d)

    for cid, ref_ids in UNRESOLVED.items():
        order.append(cid)
        final[cid] = reposition_via_local_fit(cid, ref_ids, current_paths, source_by_id)

    missing_from_current = [cid for cid in current_paths if cid not in final]
    if missing_from_current:
        print('WARNING: ids present in current map but not emitted:', missing_from_current)

    with open(SOURCE_SVG, encoding='utf-8') as f:
        m = re.search(r'viewBox="([^"]*)"', f.read())
    view_box = m.group(1) if m else '0 0 1000 500'

    parts = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
             '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">' % view_box]
    for cid in order:
        d = emit_d_absolute(final[cid], decimals=1)
        parts.append('<path id="%s" data-id="%s" d="%s" />' % (cid, cid, d))
    parts.append('</svg>')
    content = '\n'.join(parts)

    os.makedirs(WORK_DIR, exist_ok=True)
    with open(OUTPUT_SVG, 'w', encoding='utf-8') as f:
        f.write(content)
    print('wrote %d paths to %s' % (len(order), OUTPUT_SVG))
    print('output size: %.1f KB' % (len(content) / 1024))


if __name__ == '__main__':
    build()
