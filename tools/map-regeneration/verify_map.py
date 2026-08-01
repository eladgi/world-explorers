"""Verifies a generated map SVG before it's applied to assets/world-map.svg.
Checks the specific failure modes found (the hard way) while building this
pipeline - see README.md for the story behind each one:

  1. structural: still exactly 211 `path[id]` elements, every `d` parses
  2. self-overlap: no country's own rings overlap each other (would render
     as an unwanted hole under the map's evenodd fill-rule) - except South
     Africa/Lesotho, which is an intentional hole
  3. border continuity: every real neighbor pair (from js/data/countries.js's
     own `borders` field) actually touches - catches the border-gap class of
     bug, though note a `distance()==0` pass only proves SOME contact, not
     that the whole border aligns (see README for the Pakistan-China caveat)

Usage: python verify_map.py [path-to-svg]  (defaults to .work/world-map-OUTPUT.svg)
"""
import json
import os
import re
import sys

from shapely.geometry import Polygon

from svgpath import parse_d

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WORK_DIR = os.path.join(os.path.dirname(__file__), '.work')
COUNTRIES_JS = os.path.join(REPO_ROOT, 'js', 'data', 'countries.js')

DEFAULT_SVG = os.path.join(WORK_DIR, 'world-map-OUTPUT.svg')
AREA_OVERLAP_EPS = 0.02


def load_matches(svg_path):
    with open(svg_path, encoding='utf-8') as f:
        content = f.read()
    pattern = re.compile(r'data-id="([a-z]{2})"[\s\S]{0,80}?\sd="([^"]*)"')
    return dict(pattern.findall(content))


def check_structural(matches):
    print('=== structural ===')
    print('path count:', len(matches), '(expect 211)')
    errors = 0
    for cid, d in matches.items():
        try:
            sp = parse_d(d)
            if not sp or any(len(s) < 3 for s in sp):
                errors += 1
                print('  degenerate:', cid)
        except Exception as e:
            errors += 1
            print('  parse error:', cid, e)
    print('parse errors:', errors)
    return errors == 0


def check_self_overlap(matches):
    print('\n=== self-overlap (would render as an unwanted hole) ===')
    issues = []
    for cid, d in matches.items():
        sp = parse_d(d)
        if len(sp) < 2:
            continue
        try:
            primary = Polygon(sp[0])
            if not primary.is_valid:
                primary = primary.buffer(0)
        except Exception:
            continue
        for i, ring in enumerate(sp[1:], 1):
            try:
                p = Polygon(ring)
                if not p.is_valid:
                    p = p.buffer(0)
                if primary.intersection(p).area > AREA_OVERLAP_EPS and cid != 'za':
                    issues.append((cid, i))
            except Exception:
                pass
    print('countries with overlapping rings:', len(issues))
    for row in issues[:20]:
        print(' ', row)
    return len(issues) == 0


def check_border_continuity(matches):
    print('\n=== border continuity (real neighbor pairs from countries.js) ===')
    with open(COUNTRIES_JS, encoding='utf-8') as f:
        countries_js = f.read()
    entries = re.findall(r'\{\s*id:\s*"([a-z]{2})"[\s\S]{0,2000}?borders:\s*\[([^\]]*)\]', countries_js)
    border_pairs = set()
    for cid, borders_str in entries:
        for nid in re.findall(r'"([a-z]{2})"', borders_str):
            border_pairs.add(tuple(sorted((cid, nid))))

    def to_parts(d):
        out = []
        for s in parse_d(d):
            if len(s) < 3:
                continue
            p = Polygon(s)
            if not p.is_valid:
                p = p.buffer(0)
            out.append(p)
        return out

    shapes = {cid: to_parts(d) for cid, d in matches.items()}
    gaps = []
    for a, b in sorted(border_pairs):
        pa, pb = shapes.get(a), shapes.get(b)
        if not pa or not pb:
            continue
        dist = min(x.distance(y) for x in pa for y in pb if not x.is_empty and not y.is_empty)
        gaps.append((a, b, dist))
    gaps.sort(key=lambda x: -x[2])
    print('pairs checked:', len(gaps))
    print('worst 10:')
    for a, b, d in gaps[:10]:
        print(f'  {a}-{b}: {d:.3f}px')
    big = [g for g in gaps if g[2] > 3.0]
    print(f'gap > 3px: {len(big)} (note: India-Lanka/similar water-separated pairs are EXPECTED here, not bugs)')
    return len(big)


def main():
    svg_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SVG
    matches = load_matches(svg_path)
    ok_structural = check_structural(matches)
    ok_overlap = check_self_overlap(matches)
    big_gap_count = check_border_continuity(matches)

    print('\n=== summary ===')
    print('structural OK:', ok_structural)
    print('no unwanted self-overlaps:', ok_overlap)
    print('border gaps > 3px:', big_gap_count, '(review each - some are real water separations)')


if __name__ == '__main__':
    main()
