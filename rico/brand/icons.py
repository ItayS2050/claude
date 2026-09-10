#!/usr/bin/env python3
"""Render Rico's extension icons from the mascot drawing.

Three sizes, two drawings. 128 and 48 use the full collie; 16 uses the small
cut, because shrinking the full drawing to sixteen pixels produces a blob —
see collie_small in mascots.py for what had to change and why.

Writes into the extension folder. Run:  python3 icons.py
"""
from draw import Canvas
from mascots import collie, collie_small, TOP, BOTTOM

OUT = '..'

CUTS = {
    128: collie,
    48: collie,
    16: collie_small,
}

for size, drawfn in CUTS.items():
    c = Canvas(size)
    # The corner radius is in 128-grid units, so one number holds across sizes.
    c.tile(28, TOP, BOTTOM)
    drawfn(c)
    print(c.png(f'{OUT}/icon{size}.png'))
