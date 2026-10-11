# מסיר את הרקע מתמונות הידיות של טלדור ושומר את נקודת המרכז של הרוזטה, כדי לצייר את הידית על הדלת.
import json, glob
import numpy as np
from PIL import Image
from scipy import ndimage
for f in sorted(glob.glob('img/hw/tal-*.webp')):
    if f.endswith('-cut.webp') or any(k in f for k in ('mez', 'hinge', 'cyl')): continue
    a = np.asarray(Image.open(f).convert('RGBA')).astype(float)
    d = np.sqrt(((a[..., :3] - a[2, 2, :3]) ** 2).sum(2))
    lab, n = ndimage.label(d < 9)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(edge))
    al = np.where(bgm, 0, np.where(d >= 9, 255, np.clip((d - 4) * 14, 0, 255)))
    o = a.copy(); o[..., 3] = ndimage.gaussian_filter(al, .6)
    im = Image.fromarray(o.astype(np.uint8), 'RGBA'); im.crop(im.getbbox()).save(f.replace('.webp', '-cut.webp'), 'WEBP', quality=88)
t = open('catalog.js').read(); i = t.index('window.EXTRAS = '); ex = json.loads(t[i + 16:].rstrip().rstrip(';'))
for h in ex['interiorHandles']:
    cut = h['img'].replace('.webp', '-cut.webp'); a = np.asarray(Image.open(cut))[..., 3] > 128
    H, W = a.shape; colh = a.sum(0); run = np.nonzero(colh > .6 * colh.max())[0]; x1 = run[0]
    while x1 + 1 < W and colh[x1 + 1] > .6 * colh.max(): x1 += 1
    cx = (run[0] + x1) / 2; rows = np.nonzero(a[:, int(cx)])[0]
    h.update(cut=cut, rx=round(cx / W, 3) if .1 < cx / W < .3 else .2, ry=round((rows.min() + rows.max()) / 2 / H, 3), ar=round(H / W, 3))
open('catalog.js', 'w').write(t[:i] + 'window.EXTRAS = ' + json.dumps(ex, ensure_ascii=False, indent=1) + ';\n')
