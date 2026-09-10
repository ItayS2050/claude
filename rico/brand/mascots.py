#!/usr/bin/env python3
"""Mascot candidates for Rico, drawn as flat silhouettes on the brand tile.

Kiko is a parrot: it says back what you meant, in the right tongue.
Tico is a squirrel: it stashes a thought and brings it back later.
Rico fetches — you name the thing, he returns with the right one.

Rendered at 128 (the store icon) and at 16 (the toolbar, which is where most
mascots quietly die). Run:  python3 mascots.py
"""
from draw import Canvas

WHITE = (1.0, 1.0, 1.0, 1.0)
DARK = (0.10, 0.12, 0.28, 1.0)
AMBER = (1.0, 0.72, 0.23, 1.0)      # the one warm accent: the thing being carried
TOP = (0.32, 0.35, 0.94)
BOTTOM = (0.55, 0.29, 0.96)


def envelope(c, cx, cy, w, h):
    """The thing in his mouth. Amber, because that is where the eye goes."""
    hw, hh = w / 2, h / 2
    c.polygon([(cx - hw, cy - hh), (cx + hw, cy - hh),
               (cx + hw, cy + hh), (cx - hw, cy + hh)], AMBER)
    # The flap, as two strokes rather than a filled triangle — a triangle of
    # background colour reads as a hole punched in the envelope at 16px.
    c.stroke([(cx - hw, cy - hh), (cx, cy + hh * 0.25)], 4.5, DARK)
    c.stroke([(cx, cy + hh * 0.25), (cx + hw, cy - hh)], 4.5, DARK)


def collie(c):
    """Front-facing head, drop ears.

    The first attempt put the ears up on top of the head, which is a mouse.
    Ears hanging at the sides is the shape that says dog at any size — Tico's
    dog candidate landed on the same answer, so this borrows its proportions
    and puts an envelope in the mouth."""
    c.ellipse(29, 66, 13, 27, WHITE)                 # ears, down the sides
    c.ellipse(99, 66, 13, 27, WHITE)
    c.circle(64, 56, 31, WHITE)                      # head
    c.ellipse(64, 80, 20, 13, WHITE)                 # muzzle
    c.circle(52, 50, 4.5, DARK)                      # eyes
    c.circle(76, 50, 4.5, DARK)
    c.ellipse(64, 70, 7, 5.5, DARK)                  # nose
    # Overlapping the muzzle, not floating under it — that overlap is the whole
    # difference between carrying the envelope and standing near one.
    envelope(c, 64, 100, 56, 25)


def collie_marked(c):
    """The same head with the collie's split face.

    A border collie is mostly recognised by the dark mask over one eye, so it
    is worth seeing whether that survives the shrink or turns into a smudge."""
    c.ellipse(29, 66, 13, 27, WHITE)
    c.ellipse(99, 66, 13, 27, WHITE)
    c.circle(64, 56, 31, WHITE)
    c.ellipse(45, 46, 17, 24, DARK, rot=0.20)        # the mask, over one eye
    c.ellipse(64, 80, 20, 13, WHITE)
    c.circle(50, 48, 4.5, WHITE)                     # that eye now reads light
    c.circle(76, 50, 4.5, DARK)
    c.ellipse(64, 70, 7, 5.5, DARK)
    envelope(c, 64, 100, 56, 25)


def fetching(c):
    """Side profile, mid-trot, carrying the envelope.

    Says "brings it back" in a way a head alone cannot — but a whole animal in
    sixteen pixels is four legs' worth of detail that has nowhere to go."""
    c.taper([(104, 92), (116, 74), (112, 54)], 14, 8, WHITE)   # tail, up
    c.ellipse(84, 84, 27, 21, WHITE)                 # body
    c.stroke([(70, 98), (64, 116)], 8, WHITE)        # legs
    c.stroke([(96, 98), (102, 116)], 8, WHITE)
    c.curve([(58, 56), (62, 68), (72, 78)], 17, WHITE)   # neck
    c.circle(52, 50, 19, WHITE)                      # head
    c.ellipse(64, 40, 9, 16, WHITE, rot=0.30)        # ear
    c.ellipse(34, 58, 16, 11, WHITE)                 # muzzle
    c.circle(48, 45, 4, DARK)                        # eye
    envelope(c, 30, 74, 42, 19)


def magpie(c):
    """The other reading of the name: a bird that collects things and knows
    where it put them. Kept as a candidate because Kiko is already a bird, and
    two birds in a family of three is a worse system than it looks."""
    c.taper([(72, 78), (100, 92), (118, 116)], 20, 9, WHITE)   # tail
    c.ellipse(62, 72, 24, 26, WHITE)                 # body
    c.stroke([(58, 96), (56, 112)], 5, WHITE)        # legs
    c.stroke([(70, 96), (72, 112)], 5, WHITE)
    c.circle(48, 42, 18, WHITE)                      # head
    c.polygon([(34, 36), (6, 46), (34, 50)], WHITE)  # beak
    c.circle(52, 38, 4, DARK)                        # eye
    envelope(c, 26, 62, 40, 18)


def collie_small(c):
    """The 16px cut, drawn rather than downsampled.

    The first version of this shrank the full drawing and got a blob: ears set
    against the side of a big head merge straight into it once each shape is
    two pixels wide. So the head comes down and the ears move out and drop
    lower, until they read as two separate lobes rather than a wider skull.

    The nose goes — at this size it is a third dark dot fighting two eyes for
    four pixels of muzzle — and the envelope loses its flap, because a dark
    line drawn across an eight-pixel bar of amber just removes the amber."""
    c.ellipse(22, 72, 16, 28, WHITE)                 # ears, out and low
    c.ellipse(106, 72, 16, 28, WHITE)
    c.circle(64, 50, 29, WHITE)                      # head, smaller
    c.circle(50, 46, 6, DARK)                        # eyes
    c.circle(78, 46, 6, DARK)
    c.polygon([(26, 88), (102, 88), (102, 116), (26, 116)], AMBER)   # envelope


MASCOTS = {'collie': collie, 'collie-marked': collie_marked,
           'fetching': fetching, 'magpie': magpie}

for name, drawfn in MASCOTS.items():
    for size in (128, 16):
        c = Canvas(size)
        c.tile(28, TOP, BOTTOM)
        drawfn(c)
        print(c.png(f'{name}-{size}.png'))

for size in (128, 16):
    c = Canvas(size)
    c.tile(28, TOP, BOTTOM)
    collie_small(c)
    print(c.png(f'collie-small-{size}.png'))
