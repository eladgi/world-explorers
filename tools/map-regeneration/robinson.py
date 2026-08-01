"""Standard Robinson projection (piecewise-linear interpolation of the
published 5-degree table - the same approach used by D3.js/PROJ; visually
indistinguishable from higher-order interpolation at this map's scale).

Used instead of a naive equirectangular (x=lon, y=lat) projection because
the original map source is also Robinson-projected, so this keeps the same
familiar, realistically-proportioned world silhouette instead of stretching
Greenland/Canada/Russia near the poles.
"""
import math

# (latitude, X length-factor, Y value) at 5-degree intervals, 0-90
_TABLE = [
    (0, 1.0000, 0.0000), (5, 0.9986, 0.0620), (10, 0.9954, 0.1240),
    (15, 0.9900, 0.1860), (20, 0.9822, 0.2480), (25, 0.9730, 0.3100),
    (30, 0.9600, 0.3720), (35, 0.9427, 0.4340), (40, 0.9216, 0.4958),
    (45, 0.8962, 0.5571), (50, 0.8679, 0.6176), (55, 0.8350, 0.6769),
    (60, 0.7986, 0.7346), (65, 0.7597, 0.7903), (70, 0.7186, 0.8435),
    (75, 0.6732, 0.8936), (80, 0.6213, 0.9394), (85, 0.5722, 0.9761),
    (90, 0.5322, 1.0000),
]

X_CONST = 0.8487
Y_CONST = 1.3523


def _interp(lat_abs):
    if lat_abs >= 90:
        return _TABLE[-1][1], _TABLE[-1][2]
    idx = int(lat_abs // 5)
    lat0, x0, y0 = _TABLE[idx]
    lat1, x1, y1 = _TABLE[idx + 1]
    f = (lat_abs - lat0) / (lat1 - lat0)
    return x0 + (x1 - x0) * f, y0 + (y1 - y0) * f


def project(lon, lat):
    """lon/lat in degrees -> Robinson (x, y). y grows northward (like lat)."""
    lat_abs = min(abs(lat), 90)
    xf, yf = _interp(lat_abs)
    x = X_CONST * xf * math.radians(lon)
    y = Y_CONST * yf * (1 if lat >= 0 else -1)
    return x, y


if __name__ == '__main__':
    print('equator, lon=180:', project(180, 0))
    print('north pole:', project(0, 90))
    print('null island:', project(0, 0))
    print('Reykjavik ~(-21.9, 64.1):', project(-21.9, 64.1))
