import sys, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
D, out = sys.argv[1], sys.argv[2]
t = open(D + '/catalog.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
res = {}; thumbs = []
for m in cat['entry']:
    for v in m['variants']:
        im = Image.open(D + '/' + v['src']).convert('RGB'); a = np.asarray(im).astype(int); H, W = a.shape[:2]
        c = np.median(a[int(H*.82):int(H*.95), int(W*.12):int(W*.3)].reshape(-1, 3), 0)
        diff = np.sqrt(((a - c) ** 2).sum(2)) > 55
        x0, x1, y0, y1 = int(W*.1), int(W*.9), int(H*.04), int(H*.86)
        m2 = np.zeros_like(diff); m2[y0:y1, x0:x1] = diff[y0:y1, x0:x1]
        m2 = ndimage.binary_closing(m2, iterations=8); m2 = ndimage.binary_fill_holes(m2)
        m2 = ndimage.binary_opening(m2, iterations=4)
        lab, n = ndimage.label(m2); best = None
        for k, sl in enumerate(ndimage.find_objects(lab)):
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            fill = (lab[sl] == k + 1).mean()
            if w > .2 * W and h > .15 * H and fill > .6:
                area = w * h
                if not best or area > best[0]: best = (area, sl)
        if best:
            sl = best[1]; r = [sl[1].start / W, sl[0].start / H, sl[1].stop / W, sl[0].stop / H]
            res[v['src']] = [round(x, 4) for x in r]
        th = im.copy(); d = ImageDraw.Draw(th)
        if best: d.rectangle([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop], outline=(255, 0, 255), width=5)
        d.text((5, 5), os.path.basename(v['src'])[4:-5], fill=(255, 0, 255))
        thumbs.append(th.resize((130, 320)))
json.dump(res, open(out + '/windows.json', 'w'), indent=0)
sheet = Image.new('RGB', (130 * 14, 320 * ((len(thumbs) + 13) // 14)), 'white')
for i, th in enumerate(thumbs): sheet.paste(th, ((i % 14) * 130, (i // 14) * 320))
sheet.save(out + '/win-sheet.jpg', quality=80); print(len(res), 'of', len(thumbs))
