"""One-off diagnostic: find countries whose path bbox is blown up by a stray
outlier subpath (antimeridian-wraparound islands plotted on the wrong edge
of the map), which makes App.Map.focusCountry() zoom out far too much.

Not part of the regular build pipeline -- run manually when investigating
bbox-inflation bugs like the US/New Zealand one from 2026-08-04.
"""
import re

SVG_PATH = "assets/world-map.svg"


def get_paths(svg):
    out = {}
    for m in re.finditer(r'<path\b([^>]*)/?>', svg):
        attrs = m.group(1)
        idm = re.search(r'\bid="([a-z]{2})"', attrs)
        dm = re.search(r'\bd="([^"]+)"', attrs)
        if idm and dm:
            out[idm.group(1)] = dm.group(1)
    return out


def subpath_boxes(d):
    subs = ["M" + s for s in d.split("M")[1:]]
    boxes = []
    for sp in subs:
        nums = list(map(float, re.findall(r"-?\d+\.?\d*", sp)))
        xs, ys = nums[0::2], nums[1::2]
        boxes.append((min(xs), max(xs), min(ys), max(ys), len(xs)))
    return boxes


def main():
    svg = open(SVG_PATH, encoding="utf-8").read()
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    vb_x, vb_y, vb_w, vb_h = map(float, vb.split())

    paths = get_paths(svg)
    flagged = []
    for cid, d in paths.items():
        boxes = subpath_boxes(d)
        if len(boxes) < 2:
            continue
        # main cluster = union bbox of the largest-area subpath only, as anchor
        main = max(boxes, key=lambda b: (b[1] - b[0]) * (b[3] - b[2]))
        main_cx = (main[0] + main[1]) / 2
        outliers = []
        for b in boxes:
            if b is main:
                continue
            cx = (b[0] + b[1]) / 2
            dist = abs(cx - main_cx)
            area = (b[1] - b[0]) * (b[3] - b[2])
            # flag only small/insignificant fragments (few points, tiny area)
            # sitting far away from the main landmass -- large real fragments
            # (e.g. Russia's Chukotka peninsula, legitimately split by the
            # antimeridian) are deliberately NOT flagged.
            if dist > vb_w * 0.15 and b[4] <= 20 and area < 50:
                outliers.append(b)
        if outliers:
            full_minx = min(b[0] for b in boxes)
            full_maxx = max(b[1] for b in boxes)
            flagged.append((cid, full_maxx - full_minx, len(outliers), outliers))

    flagged.sort(key=lambda t: -t[1])
    print(f"viewBox width = {vb_w:.1f}\n")
    for cid, width, n_out, outliers in flagged:
        pct = width / vb_w * 100
        print(f"{cid}: bbox width {width:.1f} ({pct:.0f}% of map) -- {n_out} outlier subpath(s)")
        for o in outliers:
            print(f"    outlier bbox: x[{o[0]:.1f},{o[1]:.1f}] y[{o[2]:.1f},{o[3]:.1f}] npts={o[4]}")


if __name__ == "__main__":
    main()
