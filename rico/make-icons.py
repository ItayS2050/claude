#!/usr/bin/env python3
"""Draw Rico's icons without a drawing library.

A palette over a compose window is three stacked bars: the search field and two
result rows. At 16px there is no room for anything cleverer, and a mark that
survives 16px is the only one that matters — that is the size it is seen at,
in a toolbar, every day.
"""
import struct, zlib

BG      = (91, 99, 240)     # the accent indigo, same as the popup
FG      = (255, 255, 255)
# The dimmed row is blended against the indigo rather than made transparent:
# a semi-transparent bar would show the toolbar through it, and Chrome's
# toolbar is white for some people and near-black for others.
DIM     = (189, 193, 249)


def rounded(size, radius):
    """Alpha mask for a rounded square, 4x supersampled so the corners are smooth."""
    S, mask = 4, []
    for y in range(size):
        row = []
        for x in range(size):
            hits = 0
            for sy in range(S):
                for sx in range(S):
                    px, py = x + (sx + 0.5) / S, y + (sy + 0.5) / S
                    cx = min(max(px, radius), size - radius)
                    cy = min(max(py, radius), size - radius)
                    if (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2:
                        hits += 1
            row.append(int(255 * hits / (S * S)))
        mask.append(row)
    return mask


def draw(size):
    radius = max(2, round(size * 0.22))
    mask = rounded(size, radius)
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]

    for y in range(size):
        for x in range(size):
            if mask[y][x]:
                px[y][x] = (*BG, mask[y][x])

    def bar(top, left, width, height, colour):
        for y in range(round(top), min(round(top + height), size)):
            for x in range(round(left), min(round(left + width), size)):
                if 0 <= x < size and 0 <= y < size:
                    px[y][x] = colour if len(colour) == 4 else (*colour, 255)

    unit = size / 16
    # The search field, then two result rows under it — the palette, in three
    # strokes. The second row is dimmed: that is the selection, and without it
    # the mark is just a list.
    bar(3.5 * unit, 3 * unit, 10 * unit, 2.2 * unit, FG)
    bar(7.4 * unit, 3 * unit, 10 * unit, 1.7 * unit, FG)
    bar(10.4 * unit, 3 * unit, 6.5 * unit, 1.7 * unit, DIM)
    return px


def png(path, px):
    size = len(px)
    raw = b''.join(
        b'\x00' + b''.join(struct.pack('BBBB', *p) for p in row) for row in px
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)
    return len(out)


for s in (16, 48, 128):
    print(f'icon{s}.png', png(f'icon{s}.png', draw(s)), 'bytes')
