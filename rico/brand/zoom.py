#!/usr/bin/env python3
"""Render each candidate at 16px, then blow the result up 8x with hard edges.

Judging a toolbar icon from a 16-pixel image on a screen is guesswork; judging
it from the same 16 pixels at 128 is not. Nearest-neighbour on purpose — the
point is to see exactly which pixels survive.
"""
import struct, zlib
from draw import Canvas, SS
import mascots as M

ZOOM = 8


def downsampled(canvas):
    """The same box filter Canvas.png uses, returned as rows of RGBA bytes."""
    size = canvas.size
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            r = g = b = a = 0.0
            for dy in range(SS):
                for dx in range(SS):
                    pr, pg, pb, pa = canvas.px[y * SS + dy][x * SS + dx]
                    r += pr * pa; g += pg * pa; b += pb * pa; a += pa
            k = SS * SS
            a /= k
            if a > 0:
                r, g, b = r / k / a, g / k / a, b / k / a
            row.append((round(r * 255), round(g * 255), round(b * 255), round(a * 255)))
        rows.append(row)
    return rows


def write(path, rows, zoom):
    size = len(rows) * zoom
    raw = bytearray()
    for row in rows:
        line = b''.join(struct.pack('BBBB', *px) for px in row for _ in range(zoom))
        for _ in range(zoom):
            raw.append(0)
            raw += line

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b''))
    return path


jobs = dict(M.MASCOTS)
jobs['collie-small'] = M.collie_small

for name, drawfn in jobs.items():
    c = Canvas(16)
    c.tile(28, M.TOP, M.BOTTOM)
    drawfn(c)
    print(write(f'zoom-{name}.png', downsampled(c), ZOOM))
