import sys, glob, os, json
import numpy as np
from PIL import Image
src, out, pagedir = sys.argv[1], sys.argv[2], sys.argv[3]
boxes = json.load(open(src+'/boxes.json'))
labels = []
for p, bl in boxes.items():
    p = int(p)
    page = Image.open(glob.glob(f'{pagedir}/e-{p:03d}-*.jpg')[0]).convert('RGB')
    for i, (x0, y0, x1, y1) in enumerate(bl):
        im = page.crop((x0, y0, x1, y1)); a = np.asarray(im).astype(int)
        m = (765 - a.sum(2)) > 18
        cols, rows = m.mean(0), m.mean(1)
        def edge(v, rev=False):
            idx = range(len(v)-1, -1, -1) if rev else range(len(v))
            for k in idx:
                if v[k] > 0.85: return k
            return (len(v)-1) if rev else 0
        l, r = edge(cols), edge(cols, True)
        t, b = edge(rows), edge(rows, True)
        door = im.crop((l, t, r+1, b+1))
        door.save(f'{out}/p{p:02d}-{i}.png')
        X0, Y0 = x0+l, y0+t; X1 = x0+r
        labels.append(page.crop((X0-20, max(0, Y0-75), X1+20, Y0+5)).resize((int((X1-X0+40)*0.6), int((min(80, Y0+5))*0.6))))
        labels[-1].info['name'] = f'p{p:02d}-{i}'
# label sheet
W = 260; rowh = 60
sheet = Image.new('RGB', (W*6, rowh*((len(labels)+5)//6)), 'white')
from PIL import ImageDraw
d = ImageDraw.Draw(sheet)
for k, lb in enumerate(labels):
    x, y = (k%6)*W, (k//6)*rowh
    lb.thumbnail((W-70, rowh-4)); sheet.paste(lb, (x+68, y+2))
    d.text((x+2, y+20), lb.info.get('name', '?'), fill='red')
sheet.save(sys.argv[4])
