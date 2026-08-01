"""ONE global transform shared by every single point on the map (gameplay
countries and land-other territories alike). This is the actual fix for the
border-gap bug that a per-country independent fit caused: per-country fits
don't preserve shared borders between neighbors, but a single global
transform applied uniformly to Natural Earth's internally-consistent lon/lat
data preserves every real shared border exactly, by construction.
"""
import os
import re
import robinson

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PROJECT_SVG = os.path.join(REPO_ROOT, 'assets', 'world-map.svg')

# Robinson's natural extent at the full globe (lon -180..180, lat -90..90):
# X in [-2.6663, 2.6663], Y in [-1.3523, 1.3523] (see robinson.py sanity check)
_ROB_HALF_W = robinson.X_CONST * 1.0 * 3.141592653589793
_ROB_HALF_H = robinson.Y_CONST * 1.0


def _read_target_dims():
    """Reads the current map's own viewBox so this stays correct even if the
    base SVG's dimensions ever change. Falls back to the known current
    values (0 0 2000 1001) if the file isn't found (e.g. running standalone)."""
    try:
        with open(PROJECT_SVG, encoding='utf-8') as f:
            head = f.read(2000)
        m = re.search(r'viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"', head)
        if m:
            return float(m.group(1)), float(m.group(2))
    except OSError:
        pass
    return 2000.0, 1001.0


TARGET_W, TARGET_H = _read_target_dims()

# "contain" fit (uniform scale, matches the tighter-fitting axis) so world
# proportions stay correct, not stretched to exactly fill both axes
_scale_x = TARGET_W / (2 * _ROB_HALF_W)
_scale_y = TARGET_H / (2 * _ROB_HALF_H)
SCALE = min(_scale_x, _scale_y)

OFFSET_X = TARGET_W / 2.0
OFFSET_Y = TARGET_H / 2.0


def project(lon, lat):
    rx, ry = robinson.project(lon, lat)
    x = OFFSET_X + rx * SCALE
    y = OFFSET_Y - ry * SCALE  # SVG y grows down, Robinson y grows north -> flip
    return x, y


if __name__ == '__main__':
    print('target dims:', TARGET_W, TARGET_H, '| scale:', SCALE)
    print('world corners:')
    print(' ', project(-180, 90), project(180, 90))
    print(' ', project(-180, -90), project(180, -90))
    print('Reykjavik ~(-21.9,64.1):', project(-21.9, 64.1))
