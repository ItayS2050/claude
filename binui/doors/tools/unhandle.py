import sys, json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
D, out = sys.argv[1], sys.argv[2]
t = open(D + '/catalog.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
info = {}; thumbs = []
for m in cat['interior']:
    for v in m['variants']:
        im = Image.open(D + '/' + v['src']).convert('RGBA'); a = np.asarray(im).astype(float); H, W = a.shape[:2]
        rx0, rx1, ry0, ry1 = int(W*.03), int(W*.30), int(H*.42), int(H*.64)
        R = a[ry0:ry1, rx0:rx1, :3]
        leaf = np.median(R.reshape(-1, 3), 0)
        mask = np.sqrt(((R - leaf) ** 2).sum(2)) > (28 if leaf.mean() > 120 else 70)
        mask = ndimage.binary_opening(mask, iterations=1)
        mask[:, mask.mean(0) > .5] = False   # long vertical lines: frame edge, grooves
        mask[mask.mean(1) > .6, :] = False   # long horizontal grooves
        lab, n = ndimage.label(ndimage.binary_dilation(mask, iterations=5))
        if not n: continue
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        # keep the components near the handle zone (largest blobs), drop long vertical lines (grooves/frame)
        keep = np.zeros_like(mask)
        for k, sl in enumerate(ndimage.find_objects(lab)):
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            cx0, cx1 = sl[1].start + rx0, sl[1].stop + rx0; cy0, cy1 = sl[0].start + ry0, sl[0].stop + ry0
            core = cx1 > W * .09 and cx0 < W * .22 and cy1 > H * .46 and cy0 < H * .6
            line = h > 3.5 * w or (w > 3.5 * h and w > W * .16)
            if core and not line and sizes[k] > 20: keep |= (lab == k + 1) & mask
        if not keep.any(): continue
        ys, xs = np.nonzero(keep)
        xs = xs + rx0; ys = ys + ry0
        top = ys.min(); rows = np.bincount(ys - top)[:max(3, int(H * .04))]
        ly = top + int(rows.argmax())
        X0 = int(max(W * .075, xs.min() - 4)); X1 = int(min(W * .28, xs.max() + 6))
        Y0 = int(ly - H * .028); Y1 = int(ly + H * .085)
        bw, bh = X1 - X0, Y1 - Y0
        b = a.copy()
        topr = a[Y0 - 3:Y0, X0:X1, :3].mean(0); botr = a[Y1:Y1 + 3, X0:X1, :3].mean(0)
        tt = np.linspace(0, 1, bh)[:, None, None]
        vfill = topr[None] * (1 - tt) + botr[None] * tt
        left = a[Y0:Y1, X0 - 3:X0, :3].mean(1); right = a[Y0:Y1, X1:X1 + 3, :3].mean(1)
        ss = np.linspace(0, 1, bw)[None, :, None]
        hfill = left[:, None] * (1 - ss) + right[:, None] * ss
        b[Y0:Y1, X0:X1, :3] = vfill  # vertical lines (frame edge, panels) carry straight through
        name = os.path.basename(v['src']).replace('.webp', '-clean.webp')
        Image.fromarray(b.clip(0, 255).astype(np.uint8), 'RGBA').save(f'{D}/img/{name}', 'WEBP', quality=80, method=6)
        info[v['src']] = {'clean': 'img/' + name, 'hx': round(X0 / W, 4), 'hy': round(ly / H, 4), 'hw': round(bw / W, 4)}
        th = Image.fromarray(b.clip(0, 255).astype(np.uint8), 'RGBA').crop((0, int(H * .35), W, int(H * .7))).convert('RGB')
        th0 = im.crop((0, int(H * .35), W, int(H * .7))).convert('RGB')
        pair = Image.new('RGB', (W * 2 + 4, th.height), 'red'); pair.paste(th0, (0, 0)); pair.paste(th, (W + 4, 0))
        thumbs.append(pair.resize((pair.width // 2, pair.height // 2)))
json.dump(info, open(out + '/clean.json', 'w'))
cols = 6; w0, h0 = thumbs[0].size
sheet = Image.new('RGB', (cols * (w0 + 6), ((len(thumbs) + cols - 1) // cols) * (h0 + 6)), 'white')
for i, t in enumerate(thumbs): sheet.paste(t, ((i % cols) * (w0 + 6), (i // cols) * (h0 + 6)))
sheet.save(out + '/clean-sheet.jpg'); print(len(info))
