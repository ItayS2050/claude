import sys, glob, os, json
import numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
pages = [int(p) for p in sys.argv[3].split(',')]
res = {}
for p in pages:
    f = glob.glob(f'{src}/e-{p:03d}-*.jpg')[0]
    im = Image.open(f).convert('RGB'); a = np.asarray(im).astype(int)
    H, W = a.shape[:2]
    diff = (255*3 - a.sum(2)) > 30
    diff = ndimage.binary_closing(diff, iterations=3)
    diff = ndimage.binary_fill_holes(diff)
    lab, n = ndimage.label(diff)
    boxes = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        h, w = y1-y0, x1-x0
        if h > 0.15*H and 1.5 < h/w < 3.2:
            boxes.append((x0, y0, x1, y1))
    boxes.sort(key=lambda b: (round(b[1]/200), -b[0]))  # rows top-down, right-to-left (RTL)
    res[p] = boxes
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        im.crop((x0, y0, x1, y1)).save(f'{out}/p{p:02d}-{i}.png')
json.dump(res, open(f'{out}/boxes.json', 'w'))
for p, b in res.items(): print(p, len(b), [ (x1-x0, y1-y0) for x0,y0,x1,y1 in b])
