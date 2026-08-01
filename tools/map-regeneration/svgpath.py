"""Minimal parser/emitter for the map's SVG path syntax: M/m (moveto), l
(relative lineto, implicit repeat after m/l), L (explicit absolute lineto,
used by this pipeline's own emitted paths), Z/z (closepath).

Per the SVG spec, after z the "current point" resets to the START of the
subpath that just closed (not the last point drawn) - this matters for
multi-subpath paths (archipelago countries etc.) where a subsequent 'm' is
relative to that reset point, not the previous subpath's last vertex.
"""
import re

TOKEN_RE = re.compile(r'([MmLlZz])|(-?\d+\.?\d*)')


def parse_d(d):
    """Returns a list of subpaths; each subpath is a list of (x, y) absolute
    points, without a duplicated closing point."""
    tokens = []
    for m in TOKEN_RE.finditer(d):
        if m.group(1):
            tokens.append(m.group(1))
        else:
            tokens.append(float(m.group(2)))

    subpaths = []
    cur = None  # current point (absolute)
    subpath_start = None
    cur_subpath_pts = None
    i = 0
    mode = None

    def flush():
        nonlocal cur_subpath_pts
        if cur_subpath_pts:
            subpaths.append(cur_subpath_pts)
        cur_subpath_pts = None

    while i < len(tokens):
        t = tokens[i]
        if t in ('M', 'm', 'L', 'l', 'Z', 'z'):
            mode = t
            if t in ('Z', 'z'):
                if cur_subpath_pts is not None:
                    flush()
                cur = subpath_start
                i += 1
                continue
            i += 1
            continue
        else:
            x = t
            y = tokens[i + 1]
            i += 2
            if mode == 'M':
                cur = (x, y)
                flush()
                cur_subpath_pts = [cur]
                subpath_start = cur
                mode = 'Mrepeat'  # subsequent bare pairs after M are implicit absolute lineto
            elif mode == 'Mrepeat':
                cur = (x, y)
                cur_subpath_pts.append(cur)
            elif mode == 'm':
                cur = (x, y) if cur is None else (cur[0] + x, cur[1] + y)
                flush()
                cur_subpath_pts = [cur]
                subpath_start = cur
                mode = 'lrepeat'  # subsequent bare pairs after m are implicit relative lineto
            elif mode in ('lrepeat', 'l'):
                cur = (cur[0] + x, cur[1] + y)
                cur_subpath_pts.append(cur)
            elif mode == 'L':
                cur = (x, y)
                cur_subpath_pts.append(cur)
            else:
                raise ValueError('unexpected numeric token with mode=%r at token %d' % (mode, i))
    flush()
    return subpaths


def bbox_of_subpaths(subpaths):
    xs = [p[0] for sp in subpaths for p in sp]
    ys = [p[1] for sp in subpaths for p in sp]
    return {'minx': min(xs), 'miny': min(ys), 'maxx': max(xs), 'maxy': max(ys)}


def fmt(v, decimals):
    r = round(v, decimals)
    if r == int(r):
        return str(int(r))
    s = ('%.' + str(decimals) + 'f') % r
    return s.rstrip('0').rstrip('.')


def emit_d_absolute(subpaths, decimals=1):
    """Emit fully-absolute `M x,y L x,y ... Z` - nothing else in the game's
    code parses `d` semantically (only getBBox/isPointInFill/pass-through),
    so this is simpler and less bug-prone than matching the source file's
    relative-delta encoding, for a modest file-size cost."""
    parts = []
    for sp in subpaths:
        parts.append('M %s,%s' % (fmt(sp[0][0], decimals), fmt(sp[0][1], decimals)))
        for p in sp[1:]:
            parts.append('L %s,%s' % (fmt(p[0], decimals), fmt(p[1], decimals)))
        parts.append('Z')
    return ' '.join(parts)


if __name__ == '__main__':
    d1 = 'm 915.7,158.6 -6.9,-0.4 -7.3,2.9 z'
    sp = parse_d(d1)
    assert len(sp) == 1
    assert sp[0][0] == (915.7, 158.6)
    assert sp[0][1] == (915.7 - 6.9, 158.6 - 0.4)
    print('lowercase-m smoke test OK:', sp[0])

    d1b = 'M 915.7,158.6 900.0,150.0 z'
    sp1b = parse_d(d1b)
    assert sp1b[0][1] == (900.0, 150.0)
    print('uppercase-M implicit-absolute-L smoke test OK:', sp1b)

    d2 = 'M 100,100 10,0 0,10 z m 5,5 3,0 0,3 z'
    sp2 = parse_d(d2)
    assert len(sp2) == 2
    assert sp2[1][0] == (105, 105)  # relative to subpath 1's START after z, not its last point
    print('multi-subpath z-reset smoke test OK:', sp2)
    print('ALL SMOKE TESTS PASSED')
