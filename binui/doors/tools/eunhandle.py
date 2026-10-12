import sys, json, os
import numpy as np
from PIL import Image
D, S = sys.argv[1], sys.argv[2]
good = {4,5,6,7,8,9,10,11,12,13,14,15,16,18,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,38,39,40,42,43,44,45,46,47,49,50,51,52,54,60,61,62,64,68,69,70,71,72,73,74,76,77,78,79,81,82}
# checked by eye after erasing: these still showed part of the old handle
drop = set(["img/eli-1097-0.webp", "img/eli-1098-0.webp", "img/eli-6012-3.webp", "img/eli-6012-4.webp", "img/eli-6014-0.webp", "img/eli-2512-0.webp", "img/eli-2029-0.webp", "img/eli-2506-0.webp", "img/eli-6514-0.webp", "img/eli-3007-0.webp"])
eh = json.load(open(S + '/eh2/eh.json'))  # output of ehandle2.py (a copy is in tools/entry-handles.json)
t = open(D + '/catalog.js').read(); i = t.index('window.EXTRAS'); head = t[:t.index('=') + 1]
cat = json.loads(t[t.index('=') + 1:i].rstrip().rstrip(';\n'))
n = 0; lab = []
for m in cat['entry']:
    for v in m['variants']:
        for k in ('eclean', 'hk', 'hb'): v.pop(k, None)
        r = eh.get(v['src'])
        if not r or r['k'] not in good or v['src'] in drop: continue
        im = Image.open(D + '/' + v['src']).convert('RGB'); a = np.asarray(im).astype(float); H, W = a.shape[:2]
        x0, y0, x1, y1 = r['box']; X0, Y0, X1, Y1 = int(x0 * W - .025 * W), int(y0 * H - .012 * H), int(x1 * W + .025 * W), int(y1 * H + .012 * H)
        if r['kind'] == 'lever':   # levers sit close to the frame: reach the frame edge so nothing is left behind
            if x0 < .22: X0 = min(X0, int(W * .075))
            if x1 > .78: X1 = max(X1, int(W * .925))
            Y0 -= int(H * .03); Y1 += int(H * .05)
        b = a.copy()
        if r['kind'] == 'bar':   # vertical bar: interpolate across, so horizontal grooves carry through
            left = a[Y0:Y1, X0 - 3:X0].mean(1); right = a[Y0:Y1, X1:X1 + 3].mean(1)
            s = np.linspace(0, 1, X1 - X0)[None, :, None]
            b[Y0:Y1, X0:X1] = left[:, None] * (1 - s) + right[:, None] * s
        else:                    # lever: interpolate top to bottom
            top = a[Y0 - 3:Y0, X0:X1].mean(0); bot = a[Y1:Y1 + 3, X0:X1].mean(0)
            s = np.linspace(0, 1, Y1 - Y0)[:, None, None]
            b[Y0:Y1, X0:X1] = top[None] * (1 - s) + bot[None] * s
        fn = v['src'].replace('.webp', '-clean.webp')
        Image.fromarray(b.clip(0, 255).astype(np.uint8)).save(D + '/' + fn, 'WEBP', quality=80, method=6)
        v['eclean'] = fn; v['hk'] = r['kind']; v['hb'] = r['box']; n += 1
        lab.append((len(lab), r['k'], m['name']))
open(D + '/catalog.js', 'w').write(head + ' ' + json.dumps(cat, ensure_ascii=False, indent=1) + ';\n' + t[i:])
print(n); json.dump(lab, open(S + '/eclean-idx.json', 'w'))
