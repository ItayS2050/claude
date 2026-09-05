#!/usr/bin/env python3
"""A tiny vector renderer, because the toolchain has no image library.

Shapes are painted onto a float RGBA buffer at 4x and box-downsampled, which is
where the anti-aliasing comes from. Enough primitives to draw an animal as a
flat silhouette: circles, ellipses, polygons, and stroked paths with round caps.

A mascot has to survive 16x16 in a browser toolbar, so everything here is built
as a bold silhouette with two or three colour blocks — not an illustration.
"""
import math
import struct
import zlib

SS = 4


def lerp(a, b, t):
    return a + (b - a) * t


class Canvas:
    def __init__(self, size):
        self.size = size
        self.n = size * SS
        self.s = self.n / 128.0          # designs are drawn on a 128 grid
        self.px = [[(0.0, 0.0, 0.0, 0.0)] * self.n for _ in range(self.n)]

    # --- painting ---------------------------------------------------------
    def _blend(self, x, y, colour, cov):
        if cov <= 0:
            return
        r, g, b, a = colour
        a *= cov
        if a <= 0:
            return
        dr, dg, db, da = self.px[y][x]
        out_a = a + da * (1 - a)
        if out_a <= 0:
            self.px[y][x] = (0.0, 0.0, 0.0, 0.0)
            return
        self.px[y][x] = (
            (r * a + dr * da * (1 - a)) / out_a,
            (g * a + dg * da * (1 - a)) / out_a,
            (b * a + db * da * (1 - a)) / out_a,
            out_a,
        )

    def paint(self, inside, colour, bbox=None):
        """`inside(x, y) -> coverage 0..1`, in 128-grid coordinates.

        `bbox` is the shape's extent on the 128 grid. Without it every shape
        costs a full-canvas scan, which at any useful preview size is minutes
        of pure Python rather than seconds.
        """
        if bbox is None:
            x0, y0, x1, y1 = 0, 0, 128, 128
        else:
            x0, y0, x1, y1 = bbox
        px0 = max(0, int(x0 * self.s) - 2)
        px1 = min(self.n, int(x1 * self.s) + 3)
        py0 = max(0, int(y0 * self.s) - 2)
        py1 = min(self.n, int(y1 * self.s) + 3)
        for py in range(py0, py1):
            fy = (py + 0.5) / self.s
            for px in range(px0, px1):
                fx = (px + 0.5) / self.s
                cov = inside(fx, fy)
                if cov > 0:
                    self._blend(px, py, colour, cov)

    # --- primitives -------------------------------------------------------
    def tile(self, radius, top, bottom):
        """Rounded-square background with a diagonal gradient."""
        n = self.n
        for py in range(n):
            for px in range(n):
                fx, fy = px + 0.5, py + 0.5
                cx = abs(fx - n / 2) - (n / 2 - radius * self.s)
                cy = abs(fy - n / 2) - (n / 2 - radius * self.s)
                d = math.hypot(max(cx, 0), max(cy, 0)) + min(max(cx, cy), 0) - radius * self.s
                cov = min(max(0.5 - d, 0.0), 1.0)
                if cov <= 0:
                    continue
                t = (fx / n) * 0.6 + (fy / n) * 0.4
                self._blend(px, py, (lerp(top[0], bottom[0], t),
                                     lerp(top[1], bottom[1], t),
                                     lerp(top[2], bottom[2], t), 1.0), cov)

    def circle(self, cx, cy, r, colour):
        self.paint(lambda x, y: clampcov(r - math.hypot(x - cx, y - cy)), colour,
                   (cx - r, cy - r, cx + r, cy + r))

    def ellipse(self, cx, cy, rx, ry, colour, rot=0.0):
        cos, sin = math.cos(-rot), math.sin(-rot)

        def inside(x, y):
            dx, dy = x - cx, y - cy
            ux, uy = dx * cos - dy * sin, dx * sin + dy * cos
            d = math.hypot(ux / rx, uy / ry)
            # Convert the normalised distance back to roughly-pixel units so the
            # edge softness matches the other primitives.
            return clampcov((1 - d) * min(rx, ry))
        m = max(rx, ry)
        self.paint(inside, colour, (cx - m, cy - m, cx + m, cy + m))

    def polygon(self, pts, colour):
        def inside(x, y):
            hit = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                    hit = not hit
                j = i
            return 1.0 if hit else 0.0
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        self.paint(inside, colour, (min(xs), min(ys), max(xs), max(ys)))

    def stroke(self, pts, width, colour):
        half = width / 2.0

        def inside(x, y):
            best = 1e9
            for i in range(len(pts) - 1):
                best = min(best, seg_dist(x, y, *pts[i], *pts[i + 1]))
            return clampcov(half - best)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        self.paint(inside, colour,
                   (min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half))

    def curve(self, pts, width, colour, steps=48):
        """Stroke a Catmull-Rom spline through the points — smooth tails."""
        self.stroke(spline(pts, steps), width, colour)

    def taper(self, pts, w0, w1, colour, steps=48):
        """A spline whose width runs from w0 at the base to w1 at the tip.

        A uniform-width tail reads as a tube; a real one is fat where it joins
        the body and comes to a point."""
        line = spline(pts, steps)

        def inside(x, y):
            best = 1e9
            for i in range(len(line) - 1):
                d = seg_dist(x, y, *line[i], *line[i + 1])
                half = lerp(w0, w1, i / max(1, len(line) - 2)) / 2.0
                best = min(best, d - half)
            return clampcov(-best)
        w = max(w0, w1) / 2.0
        xs = [p[0] for p in line]; ys = [p[1] for p in line]
        self.paint(inside, colour, (min(xs) - w, min(ys) - w, max(xs) + w, max(ys) + w))

    # --- output -----------------------------------------------------------
    def png(self, path):
        size, n = self.size, self.n
        out = bytearray()
        for y in range(size):
            out.append(0)
            for x in range(size):
                r = g = b = a = 0.0
                for dy in range(SS):
                    for dx in range(SS):
                        pr, pg, pb, pa = self.px[y * SS + dy][x * SS + dx]
                        r += pr * pa; g += pg * pa; b += pb * pa; a += pa
                k = SS * SS
                a /= k
                if a > 0:
                    r, g, b = r / k / a, g / k / a, b / k / a
                out += bytes((round(r * 255), round(g * 255), round(b * 255), round(a * 255)))

        def chunk(tag, data):
            c = tag + data
            return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
        blob = (b'\x89PNG\r\n\x1a\n'
                + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(bytes(out), 9))
                + chunk(b'IEND', b''))
        open(path, 'wb').write(blob)
        return path


def clampcov(d):
    """Signed distance in 128-grid units -> coverage, softened by one pixel."""
    return min(max(d * SS * 0.6 + 0.5, 0.0), 1.0)


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    dd = vx * vx + vy * vy
    t = 0.0 if dd == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / dd))
    return math.hypot(px - (ax + vx * t), py - (ay + vy * t))


def spline(pts, steps):
    """Catmull-Rom through pts, returned as a dense polyline."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(p) - 3):
        p0, p1, p2, p3 = p[i], p[i + 1], p[i + 2], p[i + 3]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
    out.append(pts[-1])
    return out
