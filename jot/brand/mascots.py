#!/usr/bin/env python3
"""Three mascot candidates, each drawn as a flat silhouette on the brand tile.

Rendered at 128 (the store icon) and at 16 (the toolbar, which is where most
mascots quietly die). Run:  python3 mascots.py
"""
from draw import Canvas

WHITE = (1.0, 1.0, 1.0, 1.0)
DARK = (0.10, 0.12, 0.28, 1.0)
AMBER = (1.0, 0.72, 0.23, 1.0)      # the one warm accent: the thing being kept safe
TOP = (0.32, 0.35, 0.94)
BOTTOM = (0.55, 0.29, 0.96)


def squirrel(c):
    # The tail is the whole silhouette — it is what survives at 16px, so it is
    # drawn first, biggest, and curls above the head where nothing competes.
    # Tapered, because a constant-width tail reads as a tube.
    c.taper([(74, 108), (104, 94), (110, 56), (88, 34), (68, 43)], 26, 13, WHITE)
    c.ellipse(48, 104, 15, 8, WHITE)                 # back foot
    c.ellipse(60, 84, 21, 24, WHITE)                 # body
    # A triangle with a rounded tip reads as a hat, not an ear. A tilted
    # leaf shape is what a squirrel ear actually looks like.
    c.ellipse(42, 36, 7.5, 13, WHITE, rot=0.38)      # ear
    c.circle(46, 57, 17, WHITE)                      # head
    c.circle(31, 64, 8.5, WHITE)                     # muzzle
    c.circle(38, 88, 9, AMBER)                       # the acorn it is holding —
    c.ellipse(38, 80, 9.5, 4, WHITE)                 # ...and its cap
    c.circle(28, 84, 6.5, WHITE)                     # paw beside it
    c.circle(39, 54, 4, DARK)                        # eye


def pelican(c):
    # The pouch is the idea: things go in, they stay there until you want them.
    c.ellipse(76, 80, 24, 25, WHITE)                 # body
    c.stroke([(68, 102), (68, 113)], 6, WHITE)       # legs
    c.stroke([(84, 102), (84, 113)], 6, WHITE)
    c.curve([(58, 48), (60, 62), (70, 74)], 19, WHITE)  # neck — without it the
    c.circle(54, 42, 16, WHITE)                         # head floated free
    c.polygon([(42, 32), (8, 46), (42, 50)], WHITE)     # beak
    c.ellipse(36, 58, 17, 14, AMBER)                    # the pouch, full
    c.circle(58, 38, 4, DARK)                           # eye


def dog(c):
    # Front-facing: two ears and a round head is about as legible as a
    # silhouette gets when it is 16 pixels across.
    c.ellipse(29, 66, 13, 27, WHITE)                 # ears
    c.ellipse(99, 66, 13, 27, WHITE)
    c.circle(64, 58, 31, WHITE)                      # head
    c.ellipse(64, 82, 20, 13, WHITE)                 # muzzle
    c.circle(52, 52, 4.5, DARK)                      # eyes
    c.circle(76, 52, 4.5, DARK)
    c.ellipse(64, 73, 7, 5.5, DARK)                  # nose
    c.stroke([(64, 79), (64, 86)], 3, DARK)          # mouth
    c.ellipse(48, 96, 12, 5, AMBER, rot=0.25)        # collar tag, for a spot of
    c.ellipse(80, 96, 12, 5, AMBER, rot=-0.25)       # colour and some character


MASCOTS = {'squirrel': squirrel, 'pelican': pelican, 'dog': dog}

for name, drawfn in MASCOTS.items():
    for size in (128, 16):
        c = Canvas(size)
        c.tile(28, TOP, BOTTOM)
        drawfn(c)
        print(c.png(f'{name}-{size}.png'))
