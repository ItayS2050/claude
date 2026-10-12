import sys, os, json, glob
import numpy as np
from PIL import Image
S, D = sys.argv[1], sys.argv[2]
t = open(D + '/catalog.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))

# --- window rects (verified by eye on the overlay sheet) ---
win = json.load(open(S + '/win/windows.json'))
good = {9,10,11,12,13,14,15,16,18,20,21,26,27,28,29,30,31,32,34,51,68,69,70,71,72,73,74,75,76,77,79,80,81,82}
k = 0
for m in cat['entry']:
    for v in m['variants']:
        v.pop('win', None)
        if k in good and v['src'] in win: v['win'] = win[v['src']]
        k += 1

# --- handle-free interior images ---
clean = json.load(open(S + '/clean/clean.json'))
for m in cat['interior']:
    for v in m['variants']:
        if v['src'] in clean: v.update(clean[v['src']])

# --- grilles ---
gj = json.load(open(S + '/gr/grilles.json'))
nums44 = ['24','25','38','3008','3011','3060','5005','5006','5009','5013','5015','5015M','5016','5018','5019','5020','5022','5024','5025','5026','5029','5035','5040','5041','5044','5046','5047-P1','5047-P2','5050','5053','5054','5056']
nums45 = ['5056-B','5061','5064','5074-P1','5074-P2','6013','6014-P1','6014-P2','6015-P1','6015-P2','6017','7009','7011','7014','7015','7016','7017-P1','7017-P2','7018','7019','7019B','7021','7024','7025','7027','7040','7080','7083','7500','7080-P2','9665','Y']
nums36 = ['5019','5053','5054','6014-P2','7019','7500','7800']
names = {44: nums44, 45: nums45, 36: nums36}
grilles, side = [], []
for g in gj:
    p, i = g['page'], int(g['name'].split('-')[1]); num = names[p][i]
    im = Image.open(f"{S}/gr/{g['name']}.png")
    a = np.asarray(im).copy()
    # re-threshold alpha so the faint grey badge disappears
    al = a[..., 3].astype(float); al = np.clip(al * 1.5 - 70, 0, 255); a[..., 3] = al.astype(np.uint8)
    im = Image.fromarray(a, 'RGBA'); bb = im.getbbox(); im = im.crop(bb)
    h = 480 if p == 36 else 360
    im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    fn = f"img/grille/{'s' if p == 36 else 'w'}-{num}.png"
    im.save(D + '/' + fn, optimize=True)
    rec = {'num': num, 'src': fn, 'special': g['special'] and p != 36}
    (side if p == 36 else grilles).append(rec)

# --- Taldoor hardware cutouts ---
th = sorted(f for f in os.listdir(S + '/th') if f.startswith('c-'))
def tal(i, name):
    im = Image.open(S + '/th/' + th[i - 1]); bb = im.getbbox(); im = im.crop(bb)
    im.thumbnail((240, 240)); im.save(f'{D}/img/hw/{name}.webp', 'WEBP', quality=85); return f'img/hw/{name}.webp'
talH = [(1,'grande-black','גרנדה שחור',90),(2,'grande-nickel','גרנדה ניקל',0),(3,'grande-gold','גרנדה זהב',90),(4,'grande-titan','גרנדה טיטניום',90),
        (6,'cortina-nickel','קורטינה ניקל',60),(5,'capri-white','קפרי לבן',160),(7,'capri-black','קפרי שחור',160),(8,'roma-nickel','רומא ניקל מוברש',180),
        (9,'palma-gold','פאלמה זהב',190),(10,'palma-white','פאלמה לבן',190),(11,'palma-black','פאלמה שחור',190),(12,'palma-nickel','פאלמה ניקל',190),
        (13,'miami-titan','מיאמי טיטניום',260),(14,'corfu-gold','קורפו זהב',220),(15,'corfu-titan','קורפו טיטניום',220),(16,'corfu-black','קורפו שחור',220)]
FIN = {'black':'#1E1F21','nickel':'#C9CCCF','gold':'#C9A45A','titan':'#5B5A58','white':'#F1F1EF'}
interiorHandles = [{'v': key, 'l': 'ידית ' + lbl, 'p': p, 'img': tal(i, 'tal-' + key), 'fin': FIN[key.split('-')[1]]} for i, key, lbl, p in talH]
mez = [(17,'black','שחור'),(18,'titan','טיטניום'),(19,'white','לבן'),(20,'gold','זהב'),(21,'nickel','ניקל')]
mezuzot = [{'v': k2, 'l': 'מזוזה שקועה ' + l, 'p': 120, 'img': tal(i, 'tal-mez-' + k2)} for i, k2, l in mez]
hin = [(37,'nickel','ניקל',0),(22,'black','שחור',60),(23,'white','לבן',60),(27,'gold','זהב',90),(38,'titan','טיטניום',60)]
hinges = [{'v': k2, 'l': 'צירים ' + l, 'p': p, 'img': tal(i, 'tal-hinge-' + k2)} for i, k2, l, p in hin]
cyl = [(25,'keykey','צילינדר מפתח-מפתח',0),(24,'privacy','סיבוב פנוי/תפוס',60),(26,'keyturn','צילינדר מפתח-פרפר',80)]
cylinders = [{'v': k2, 'l': l, 'p': p, 'img': tal(i, 'tal-cyl-' + k2)} for i, k2, l, p in cyl]

# --- Elidoor handles: hand-placed crops on the half-scale page grid ---
def eli(p, box, name):
    im = Image.open(glob.glob(f'{S}/eli/e-{p:03d}-*.jpg')[0]).convert('RGB')
    x0, y0, x1, y1 = [c * 2 for c in box]; c = np.asarray(im.crop((x0, y0, x1, y1))).astype(float)
    bg = np.median(np.concatenate([c[:3].reshape(-1, 3), c[-3:].reshape(-1, 3), c[:, :3].reshape(-1, 3), c[:, -3:].reshape(-1, 3)]), 0)
    al = np.clip((np.sqrt(((c - bg) ** 2).sum(2)) - 10) * 10, 0, 255)
    out = np.dstack([c, al]).astype(np.uint8); o = Image.fromarray(out, 'RGBA'); bb = o.getbbox(); o = o.crop(bb)
    o.thumbnail((260, 320)); o.save(f'{D}/img/hw/{name}.webp', 'WEBP', quality=85); return f'img/hw/{name}.webp'
bars = [  # page, box, model, profile, lengths, price
 (46,(105,225,148,595),'189','עגולה Ø28',[60,80,100,120,180],520),(46,(262,225,305,595),'185','חתך 25/25',[50,80,120],450),
 (46,(420,225,470,595),'183B','חתך 45/12 מילוי שחור',[80,100,120],480),(46,(580,225,630,595),'183W','חתך 45/12 מילוי לבן',[80,100,120],480),
 (46,(735,225,785,595),'182','חתך 40/10',[60,80,100,120],420),(46,(895,225,945,595),'181','חתך 40/10',[80,100,120,160,180],380),
 (46,(1052,225,1105,595),'124','חתך 30/30',[43,80,100,120],350),
 (47,(95,230,142,595),'584','ידית עץ 35/35',[80,120],780),(47,(200,230,290,595),'199','חתך 40/10 מעוגלת',[80,100],650),
 (47,(370,230,452,595),'198','חתך 40/10 מעוגלת',[80,100],600),(47,(545,230,612,595),'197','קשת עגולה Ø28',[80],640),
 (47,(690,230,752,595),'196','קשת 40/10',[80,120],640),(47,(815,230,910,595),'194','חתך 60/10',[80],620),(47,(995,230,1078,595),'193','חתך 60/10',[80,120],560)]
pulls = [(46,(80,690,325,745),'169','ידית משיכה 169',[40,60],420),(46,(386,690,603,729),'171','ידית שקועה 171',[35,50],480),
         (46,(922,690,1096,738),'170','ידית שקועה 170',[35,50],520),(46,(686,690,854,740),'170S','ידית 170 עם ידית סמויה',[35,50],650)]
levers = [(47,(130,835,247,960),'sevilla','סביליה שחור',180),(47,(330,835,442,960),'823','אומנויות 823 עגול ברונזה',220),
          (47,(540,835,652,960),'822','אומנויות 822 עגול ניקל',220),(47,(750,840,872,960),'720','אומנויות 720 מרובע ברונזה',260),
          (47,(955,840,1077,960),'710','אומנויות 710 מרובע ניקל',260)]
entryHandles = [{'v': 'lever', 'l': 'ידית מנוף סטנדרטית', 'p': 0, 'img': '', 'kind': 'lever'}]
for p, box, num, lbl, lens, price in bars:
    entryHandles.append({'v': 'bar' + num, 'l': f'ידית מוט {num[:3]} · {lbl}', 'p': price, 'img': eli(p, box, 'eli-h-' + num), 'kind': 'bar', 'lens': lens})
for p, box, num, lbl, lens, price in pulls:
    entryHandles.append({'v': 'pull' + num, 'l': lbl, 'p': price, 'img': eli(p, box, 'eli-h-' + num), 'kind': 'pull', 'lens': lens})
for p, box, num, lbl, price in levers:
    entryHandles.append({'v': 'lev' + num, 'l': 'סט ' + lbl, 'p': price, 'img': eli(p, box, 'eli-h-' + num), 'kind': 'lever'})

extras = {'grilles': grilles, 'sideGrilles': side, 'interiorHandles': interiorHandles, 'mezuzot': mezuzot, 'hinges': hinges,
          'cylinders': cylinders, 'entryHandles': entryHandles}
open(D + '/catalog.js', 'w').write('// נוצר אוטומטית מקטלוגי הספקים (טלדור 2026/27, אלידור 2025). מחירים לדוגמה בלבד.\nwindow.CATALOG = '
    + json.dumps(cat, ensure_ascii=False, indent=1) + ';\nwindow.EXTRAS = ' + json.dumps(extras, ensure_ascii=False, indent=1) + ';\n')
print(len(grilles), len(side), len(interiorHandles), len(entryHandles), sum('win' in v for m in cat['entry'] for v in m['variants']), sum('clean' in v for m in cat['interior'] for v in m['variants']))
