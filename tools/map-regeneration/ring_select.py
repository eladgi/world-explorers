"""Decides which Natural Earth polygon parts belong to each country's shape.

Clusters parts by geographic proximity (connected components on a bbox-gap
graph) rather than filtering by distance from a single anchor part - a
single-anchor version was tried first and wrongly dropped Indonesia's
2nd/3rd-largest islands, since the anchor island wasn't central to the
archipelago's spread. Proximity clustering correctly keeps long real
archipelagos (Indonesia, Philippines, Japan - each island reasonably close
to its neighbor, chaining into one cluster) while still dropping genuine
overseas exclaves (France's Caribbean/Indian Ocean territories - no
stepping-stone islands bridging the gap, so they form their own smaller,
disconnected cluster).
"""
import math

GAP_THRESHOLD_DEG = 8.0  # tuned: bridges real inter-island gaps, not continental colonial distances
MIN_VISIBLE_PX = 2.0  # a kept secondary part whose max dimension is smaller
# than this after projection reads as a stray dot, not a recognizable island,
# at this map's scale - drop it (never drops the anchor itself, even if tiny,
# e.g. Malta's whole old-map footprint is only ~2px across - deleting a real
# gameplay country is worse than keeping it small). Raised from 1.0 after
# specks were found sitting in South India and northern China at 1.0.


def parts_of(geom):
    if geom.geom_type == 'Polygon':
        return [geom]
    if geom.geom_type == 'MultiPolygon':
        return list(geom.geoms)
    raise ValueError('unexpected geom type: ' + geom.geom_type)


def lat_corrected_area(exterior_poly):
    """Shoelace area in lon/lat degrees is biased toward overweighting
    high-latitude rings (a degree of longitude covers less real ground near
    the poles) - correct for this before comparing ring sizes."""
    miny, maxy = exterior_poly.bounds[1], exterior_poly.bounds[3]
    mean_lat = (miny + maxy) / 2.0
    return exterior_poly.area * math.cos(math.radians(mean_lat))


def bbox_gap(b1, b2):
    """0 if bboxes overlap/touch, else the gap between nearest edges (in
    degrees)."""
    dx = max(b1[0] - b2[2], b2[0] - b1[2], 0)
    dy = max(b1[1] - b2[3], b2[1] - b1[3], 0)
    return math.hypot(dx, dy)


class _UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def cluster_parts(parts, gap_threshold=GAP_THRESHOLD_DEG):
    n = len(parts)
    bounds = [p.bounds for p in parts]
    uf = _UnionFind(n)
    for i in range(n):
        for j in range(i + 1, n):
            if bbox_gap(bounds[i], bounds[j]) <= gap_threshold:
                uf.union(i, j)
    clusters = {}
    for i in range(n):
        r = uf.find(i)
        clusters.setdefault(r, []).append(i)
    return list(clusters.values())
