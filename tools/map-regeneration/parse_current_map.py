"""Parses the CURRENT assets/world-map.svg and writes .work/parsed_bboxes.json
- each country's pixel bbox and point count in the map's existing coordinate
space. This is the "ground truth" the rest of the pipeline positions and
budgets everything against, so a country's own footprint on the map never
regresses in position or (usually) in detail.

Run this first, before generate_map.py, whenever assets/world-map.svg has
changed since the last regeneration.
"""
import json
import os
import re

from svgpath import parse_d, bbox_of_subpaths

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SVG_PATH = os.path.join(REPO_ROOT, 'assets', 'world-map.svg')
WORK_DIR = os.path.join(os.path.dirname(__file__), '.work')


def main():
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(SVG_PATH, encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(r'data-id="([a-z]{2})"[\s\S]{0,80}?\sd="([^"]*)"')
    matches = pattern.findall(content)
    print('matched paths:', len(matches))

    results = {}
    errors = []
    for cid, d in matches:
        try:
            subpaths = parse_d(d)
            results[cid] = {
                'bbox': bbox_of_subpaths(subpaths),
                'num_subpaths': len(subpaths),
                'num_points': sum(len(sp) for sp in subpaths),
            }
        except Exception as e:
            errors.append((cid, str(e)))

    print('parsed OK:', len(results), '| errors:', len(errors))
    for cid, err in errors:
        print('  ERROR', cid, err)

    out_path = os.path.join(WORK_DIR, 'parsed_bboxes.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f)
    print('wrote', out_path)


if __name__ == '__main__':
    main()
