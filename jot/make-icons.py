#!/usr/bin/env python3
"""Render Jot's icons. No image libraries in the toolchain, so this writes the
PNGs itself: draw at 4x into a float buffer, box-downsample for anti-aliasing,
then deflate the scanlines into a PNG."""
import math, struct, zlib

SS = 4  # supersample factor


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_rect_alpha(x, y, w, h, r):
    """Signed-distance coverage of a rounded rectangle, in 0..1."""
    cx, cy = abs(x - w / 2) - (w / 2 - r), abs(y - h / 2) - (h / 2 - r)
    d = math.hypot(max(cx, 0), max(cy, 0)) + min(max(cx, cy), 0) - r
    return min(max(0.5 - d, 0.0), 1.0)


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = 0.0 if (vx * vx + vy * vy) == 0 else (wx * vx + wy * vy) / (vx * vx + vy * vy)
    t = min(max(t, 0.0), 1.0)
    return math.hypot(px - (ax + vx * t), py - (ay + vy * t))


def render(size):
    n = size * SS
    buf = [[(0.0, 0.0, 0.0, 0.0)] * n for _ in range(n)]
    s = n / 128.0                      # everything below is designed on a 128 grid
    radius = 28 * s
    # Checkmark, as two thick segments with round caps.
    ax, ay = 36 * s, 66 * s
    bx, by = 55 * s, 86 * s
    cx, cy = 94 * s, 42 * s
    half = 9.5 * s

    for py in range(n):
        row = buf[py]
        for px in range(n):
            fx, fy = px + 0.5, py + 0.5
            bg = rounded_rect_alpha(fx, fy, n, n, radius)
            if bg <= 0:
                continue
            # Diagonal indigo -> violet gradient.
            t = (fx / n * 0.65) + (fy / n * 0.35)
            r = lerp(0.32, 0.55, t)
            g = lerp(0.35, 0.29, t)
            b = lerp(0.94, 0.96, t)
            d = min(seg_dist(fx, fy, ax, ay, bx, by), seg_dist(fx, fy, bx, by, cx, cy))
            mark = min(max(half + 0.5 - d, 0.0), 1.0)
            r = lerp(r, 1.0, mark)
            g = lerp(g, 1.0, mark)
            b = lerp(b, 1.0, mark)
            row[px] = (r, g, b, bg)

    # Box-downsample back to the requested size.
    out = bytearray()
    for y in range(size):
        out.append(0)  # PNG filter: none
        for x in range(size):
            r = g = b = a = 0.0
            for dy in range(SS):
                for dx in range(SS):
                    pr, pg, pb, pa = buf[y * SS + dy][x * SS + dx]
                    r += pr * pa; g += pg * pa; b += pb * pa; a += pa
            k = SS * SS
            a /= k
            if a > 0:
                r, g, b = r / k / a, g / k / a, b / k / a
            out += bytes((round(r * 255), round(g * 255), round(b * 255), round(a * 255)))
    return bytes(out)


def png(path, size):
    raw = render(size)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    blob = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(blob)
    print(f'{path}  {len(blob)} bytes')


for s in (16, 48, 128):
    png(f'icon{s}.png', s)
