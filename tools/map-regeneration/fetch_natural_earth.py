"""Fetches Natural Earth 1:50m admin-0 countries (GeoJSON, public domain) and
writes .work/ne_indexed.json - just the geometry for our 179 gameplay country
ids, resolved from the raw ISO_A2 property (with a couple of manual
ADM0_A3-based overrides for entries Natural Earth marks ISO_A2 "-99").

Also caches the full raw fetch at .work/ne_50m_raw.json (~4.5MB) since a few
other steps (Somaliland merge, land-other territories) need to look up
features beyond the 179 gameplay ids too.

Run this once (or whenever you want a fresh pull from the source); it skips
re-fetching if the cache already exists.
"""
import json
import os
import re
import urllib.request

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WORK_DIR = os.path.join(os.path.dirname(__file__), '.work')
COUNTRIES_JS = os.path.join(REPO_ROOT, 'js', 'data', 'countries.js')

URL = 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_admin_0_countries.json'
RAW_CACHE = os.path.join(WORK_DIR, 'ne_50m_raw.json')

# Natural Earth marks these two ISO_A2 "-99" (a known quirk for entities with
# complex/disputed sovereignty status) - resolved via the 3-letter code instead
ADM0_A3_OVERRIDE = {'FRA': 'fr', 'NOR': 'no'}


def load_raw():
    if os.path.exists(RAW_CACHE):
        with open(RAW_CACHE, encoding='utf-8') as f:
            return json.load(f)
    with urllib.request.urlopen(URL, timeout=30) as r:
        data = json.loads(r.read())
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(RAW_CACHE, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    return data


def resolve_id(props):
    iso = (props.get('ISO_A2') or '').lower()
    if iso and iso not in ('-99', ''):
        return iso
    return ADM0_A3_OVERRIDE.get(props.get('ADM0_A3'))


def get_our_ids():
    with open(COUNTRIES_JS, encoding='utf-8') as f:
        content = f.read()
    return set(re.findall(r'id:\s*"([a-z]{2})"', content))


def build_index():
    our_ids = get_our_ids()
    data = load_raw()
    by_id = {}
    dupes = {}
    for feat in data['features']:
        cid = resolve_id(feat['properties'])
        if not cid or cid not in our_ids:
            continue
        if cid in by_id:
            dupes.setdefault(cid, [by_id[cid]['name']]).append(feat['properties'].get('NAME'))
            continue
        geom = feat['geometry']
        by_id[cid] = {'name': feat['properties'].get('NAME'), 'type': geom['type'], 'coordinates': geom['coordinates']}
    missing = sorted(our_ids - set(by_id.keys()))
    return by_id, missing, dupes


def main():
    os.makedirs(WORK_DIR, exist_ok=True)
    by_id, missing, dupes = build_index()
    print('resolved:', len(by_id), '/', len(by_id) + len(missing))
    if missing:
        print('missing (needs an override or manual handling):', missing)
    if dupes:
        print('duplicate matches (needs a look):', dupes)
    out_path = os.path.join(WORK_DIR, 'ne_indexed.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(by_id, f)
    print('wrote', out_path)


if __name__ == '__main__':
    main()
