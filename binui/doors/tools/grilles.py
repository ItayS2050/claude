import sys, glob, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
res = []
for p in (44, 45, 36):
    im = Image.open(glob.glob(f'{src}/e-{p:03d}-*.jpg')[0]).convert('RGB')
    a = np.asarray(im).astype(int); H, W = a.shape[:2]
    lum = a.mean(2); sat = a.max(2) - a.min(2)
    dark = (lum < 120) & (sat < 60)
    red = (a[..., 0] > 150) & (a[..., 1] < 90) & (a[..., 2] < 100)
    lab, n = ndimage.label(ndimage.binary_dilation(dark, iterations=4))
    boxes = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        h, w = y1 - y0, x1 - x0
        if p == 36:
            ok = h > 0.2 * H and 2.5 < h / w < 9 and y0 > 0.45 * H
        else:
            ok = h > 0.08 * H and 1.4 < h / w < 3.2
        if ok: boxes.append((x0 + 4, y0 + 4, x1 - 4, y1 - 4))
    boxes.sort(key=lambda b: (round(b[1] / 150), -b[0]))
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        special = bool(red[max(0, y0 - 60):y0 + 60, max(0, x0 - 80):x0 + 60].sum() > 50)
        crop = a[y0:y1, x0:x1]
        alpha = np.clip((255 - crop.mean(2)) * 1.6 - 60, 0, 255)
        # drop red badge pixels from the drawing
        rr = (crop[..., 0] > 150) & (crop[..., 1] < 120)
        alpha[rr] = 0
        rgba = np.zeros(crop.shape[:2] + (4,), np.uint8); rgba[..., 3] = alpha.astype(np.uint8)
        g = Image.fromarray(rgba, 'RGBA')
        name = f'g{p}-{i}'
        g.save(f'{out}/{name}.png')
        lbl = im.crop((x0 - 10, y1 + 5, x1 + 10, y1 + 70))
        res.append({'name': name, 'page': p, 'special': special, 'box': [x0, y0, x1, y1], 'lbl': lbl})
# label sheet
cols = 8; cw, ch = 300, 80
sheet = Image.new('RGB', (cols * cw, ch * ((len(res) + cols - 1) // cols)), 'white'); d = ImageDraw.Draw(sheet)
for k, r in enumerate(res):
    x, y = (k % cols) * cw, (k // cols) * ch
    l = r['lbl']; l.thumbnail((cw - 90, ch - 6)); sheet.paste(l, (x + 86, y + 3))
    d.text((x + 2, y + 25), r['name'] + ('*' if r['special'] else ''), fill='red')
sheet.save(sys.argv[3])
json.dump([{k: v for k, v in r.items() if k != 'lbl'} for r in res], open(out + '/grilles.json', 'w'))
print(len(res), {p: sum(1 for r in res if r['page'] == p) for p in (44, 45, 36)})
