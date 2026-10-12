import sys, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
D, out = sys.argv[1], sys.argv[2]
t = open(D + '/catalog.js').read(); i = t.index('window.EXTRAS')
cat = json.loads(t[t.index('=') + 1:i].rstrip().rstrip(';\n'))
res, thumbs, k = {}, [], 0
def longest_run(col):
    best = (0, 0, 0); s = None
    for y, on in enumerate(list(col) + [False]):
        if on and s is None: s = y
        if not on and s is not None:
            if y - s > best[0]: best = (y - s, s, y)
            s = None
    return best
for m in cat['entry']:
    for v in m['variants']:
        im = Image.open(D + '/' + v['src']).convert('RGB'); a = np.asarray(im).astype(float); H, W = a.shape[:2]
        leaf = np.median(a[int(H*.82):int(H*.95), int(W*.12):int(W*.3)].reshape(-1, 3), 0)
        lum = a.mean(2); sat = a.max(2) - a.min(2); ll = leaf.mean()
        hl = (np.abs(lum - ll) > 35) & (sat < 50)
        if 'win' in v:
            x0, y0, x1, y1 = v['win']; hl[int(y0*H)-5:int(y1*H)+5, int(x0*W)-5:int(x1*W)+5] = False
        hl[:int(H*.15)] = False; hl[int(H*.88):] = False
        cand = []
        for x in range(int(W*.15), int(W*.88)):
            L, s, e = longest_run(hl[:, x])
            if .17 * H <= L <= .68 * H: cand.append((x, L, s, e))
        box = kind = None
        if cand:
            # group adjacent columns
            groups, cur = [], [cand[0]]
            for c in cand[1:]:
                if c[0] - cur[-1][0] <= 2: cur.append(c)
                else: groups.append(cur); cur = [c]
            groups.append(cur)
            groups = [g for g in groups if 2 <= len(g) <= W * .07]
            if groups:
                g = max(groups, key=lambda g: max(c[1] for c in g))
                X0, X1 = g[0][0], g[-1][0]; Y0 = min(c[2] for c in g); Y1 = max(c[3] for c in g)
                box, kind = [X0, Y0, X1, Y1], 'bar'
        lab, n = ndimage.label(ndimage.binary_dilation(hl, iterations=2))
        smalls = []
        for j, sl in enumerate(ndimage.find_objects(lab)):
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            cx, cy = (x0 + x1) / 2 / W, (y0 + y1) / 2 / H
            if (x1 - x0) < .2 * W and (y1 - y0) < .1 * H and .45 < cy < .78 and (.12 < cx < .4 or .6 < cx < .88) and (lab[sl] == j + 1).sum() > 20:
                smalls.append([x0, y0, x1, y1])
        if box:
            lab2, n2 = ndimage.label(hl)
            bx0, bx1 = max(0, int(box[0] - .12 * W)), min(W, int(box[2] + .12 * W))
            for j, sl in enumerate(ndimage.find_objects(lab2)):
                y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
                if x1 < bx0 or x0 > bx1 or y1 < box[1] or y0 > box[3]: continue
                if (x1 - x0) < .08 * W and (y1 - y0) < .08 * H and (lab2[sl] == j + 1).sum() > 12:
                    box = [min(box[0], x0), min(box[1], y0), max(box[2], x1), max(box[3], y1)]
        elif smalls:
            c = max(smalls, key=lambda b: (b[2] - b[0]) * (b[3] - b[1])); box, kind = list(c), 'lever'
            for s in smalls:
                if abs((s[0] + s[2]) / 2 - (c[0] + c[2]) / 2) < .12 * W and abs((s[1] + s[3]) / 2 - (c[1] + c[3]) / 2) < .12 * H:
                    box = [min(box[0], s[0]), min(box[1], s[1]), max(box[2], s[2]), max(box[3], s[3])]
        th = im.copy(); d = ImageDraw.Draw(th)
        if box:
            box = [box[0] - 4, box[1] - 4, box[2] + 5, box[3] + 5]
            res[v['src']] = {'kind': kind, 'box': [round(box[0] / W, 4), round(box[1] / H, 4), round(box[2] / W, 4), round(box[3] / H, 4)], 'k': k}
            d.rectangle(box, outline=(255, 0, 255), width=4)
        d.text((4, 4), f"{k} {m['name']}", fill=(255, 0, 255)); thumbs.append(th.resize((110, 262))); k += 1
json.dump(res, open(out + '/eh.json', 'w'))
sh = Image.new('RGB', (110 * 14, 262 * 6), 'white')
for j, th in enumerate(thumbs): sh.paste(th, ((j % 14) * 110, (j // 14) * 262))
sh.save(out + '/eh-sheet.jpg', quality=80); print(len(res))
