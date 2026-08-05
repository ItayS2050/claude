#!/usr/bin/env python3
"""Regenerate the Chrome Web Store screenshots and promo tiles.

Dev-only: build.sh ships an explicit file list, so nothing here reaches the
package. Run from the keylang/ folder:  python3 make-store-assets.py

The wrong-layout strings below are not made up — they were produced by running
the extension's own converters over the corrected text, so what a reviewer sees
is exactly what Kiko would do.
"""
import pathlib
import shutil
import subprocess
import tempfile

from PIL import Image

HERE = pathlib.Path(__file__).parent
OUT = HERE / "store"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

BASE = (HERE / "store-screenshot.html").read_text(encoding="utf-8")

# (filename, subject, typed gibberish, language label, corrected text, rtl?, names)
# Only the sender names are swapped — rebuilding the row list changes the page
# height and clips the compose window, which is where the typed text lives.
HE_NAMES = ["David Cohen", "Noa Levi", "Yossi Ben-David", "Maya Shapiro", "Avi Mizrahi"]
VARIANTS = [
    ("shot1-hebrew", "היי דויד", "vhh jcr nv akunl?",
     "Hebrew", "היי חבר מה שלומך?", True, HE_NAMES),
    ("shot2-korean", "회의 시간", "dkssudgktpdy dhsmf ghldml auc tldPdy",
     "Korean", "안녕하세요 오늘 회의 몇 시예요", False,
     ["Ji-woo Park", "Min-jun Kim", "Seo-yeon Lee", "Ha-eun Choi", "Do-yun Jung"]),
    ("shot3-russian", "привет", "ghbdtn rfr ltkf ctujlyz",
     "Russian", "привет как дела сегодня", False,
     ["Dmitri Volkov", "Anna Petrova", "Sergei Orlov", "Elena Sokolova", "Pavel Novikov"]),
]

def build_variant(subject, typed, lang, corrected, rtl, names):
    html = BASE
    html = html.replace(
        '<span class="compose-label">Subject</span> היי דויד',
        f'<span class="compose-label">Subject</span> {subject}')
    html = html.replace("vhh jcr nv akunl?", typed)
    html = html.replace("Wrong layout? Looks like Hebrew:",
                        f"Wrong layout? Looks like {lang}:")
    html = html.replace('<div class="toast-preview">היי חבר מה שלומך?</div>',
                        f'<div class="toast-preview">{corrected}</div>')
    html = html.replace("Fix → Hebrew", f"Fix → {lang}")
    html = html.replace("Not Hebrew", f"Not {lang}")
    for old, new in zip(HE_NAMES, names):
        html = html.replace(f'>{old}<', f'>{new}<')

    # The mockup pins .page to a fixed 746px, which assumes the exact font
    # metrics of the machine it was authored on. Anywhere else the browser
    # chrome measures differently and the compose window — where the typed
    # text lives — falls off the bottom. Let the page flex to the viewport.
    overrides = ("  body { display: flex; flex-direction: column; }\n"
                 "  .page { flex: 1; height: auto; min-height: 0; }\n")
    if not rtl:
        # The base mockup styles the preview for Hebrew; everything else reads left to right.
        overrides += "  .toast-preview { direction: ltr; text-align: left; }\n"
    return html.replace("</style>", overrides + "  </style>")


LANGS_PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width:1280px; height:800px; overflow:hidden; background:#0f172a;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  display:flex; flex-direction:column; align-items:center; justify-content:center; }
h1 { font-size:46px; color:#7dd3fc; margin-bottom:8px; font-weight:800; }
.sub { font-size:19px; color:#94a3b8; margin-bottom:42px; }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,440px)); gap:16px 26px; }
.row { display:flex; align-items:center; gap:16px; background:#1e293b;
  border-radius:12px; padding:18px 22px; border-left:4px solid var(--c); }
.flag { font-size:30px; }
.pair { flex:1; }
.name { font-size:17px; font-weight:700; color:#e2e8f0; }
.ex { font-size:15px; color:#64748b; margin-top:3px; font-family:ui-monospace,monospace; }
.ex b { color:var(--c); font-family:inherit; }
.foot { margin-top:44px; font-size:15px; color:#475569; }
</style></head><body>
<h1>🦜 Six languages, both directions</h1>
<div class="sub">Kiko reads what you typed and what you meant — then fixes it in one click.</div>
<div class="grid">
  <div class="row" style="--c:#3b82f6"><span class="flag">🇮🇱</span><div class="pair">
    <div class="name">Hebrew ↔ English</div><div class="ex">akuo → <b>שלום</b></div></div></div>
  <div class="row" style="--c:#a855f7"><span class="flag">🇷🇺</span><div class="pair">
    <div class="name">Russian ↔ English</div><div class="ex">ghbdtn → <b>привет</b></div></div></div>
  <div class="row" style="--c:#facc15"><span class="flag">🇺🇦</span><div class="pair">
    <div class="name">Ukrainian ↔ English</div><div class="ex">ghbdsn → <b>привіт</b></div></div></div>
  <div class="row" style="--c:#22d3ee"><span class="flag">🇰🇷</span><div class="pair">
    <div class="name">Korean ↔ English</div><div class="ex">dkssud → <b>안녕</b></div></div></div>
  <div class="row" style="--c:#818cf8"><span class="flag">🇬🇷</span><div class="pair">
    <div class="name">Greek ↔ English</div><div class="ex">geia → <b>γεια</b></div></div></div>
  <div class="row" style="--c:#f59e0b"><span class="flag">🇸🇦</span><div class="pair">
    <div class="name">Arabic ↔ English</div><div class="ex">lvpfh → <b>مرحبا</b></div></div></div>
</div>
<div class="foot">Free · No account · Nothing leaves your browser</div>
</body></html>"""

# The real popup, with chrome.storage stubbed so popup.js renders realistic state.
POPUP_STUB = """<script>
window.chrome = {
  runtime: { id: 'preview' },
  storage: { local: {
    get: (keys, cb) => cb({
      stats: { detected: 128, converted: 96, rejected: 7 },
      learnedHebrew: ['akuo', 'nv', 'ntc'],
      learnedEnglish: ['file', 'soy'],
      learnedRussian: ['ghbdtn', 'rfr'],
      learnedUkrainian: ['ghbdsn'],
      learnedKorean: ['dkssud', 'gksrnr'],
      learnedGreek: ['geia'],
      detectionEnabled: true, soundEnabled: true,
      enabledLangs: { he: true, ru: true, uk: true, ko: true, el: true, ar: true },
      disabledSites: []
    }),
    set: (v, cb) => cb && cb()
  } },
  tabs: { query: (q, cb) => cb([{ url: 'https://mail.google.com/' }]) }
};
</script>
"""

POPUP_FRAME = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
* { box-sizing:border-box; margin:0; padding:0; }
body { width:1280px; height:800px; overflow:hidden;
  background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  display:flex; align-items:center; justify-content:center; gap:80px; }
.copy { width:520px; }
h1 { font-size:46px; color:#7dd3fc; font-weight:800; line-height:1.15; margin-bottom:20px; }
p { font-size:20px; color:#94a3b8; line-height:1.6; margin-bottom:30px; }
li { font-size:18px; color:#cbd5e1; list-style:none; margin-bottom:14px; }
li span { color:#7dd3fc; margin-right:12px; }
/* Crop to the language toggles: the popup is 1700px tall and the section this
   screenshot is about sits at y=977-1330, so scrolling there beats shrinking
   the whole popup down to an unreadable size. */
.shot { width:368px; height:690px; overflow:hidden; border-radius:16px;
  box-shadow:0 30px 70px rgba(0,0,0,.6); background:#0f172a; }
.inner { transform:scale(1.15); transform-origin:top left; }
iframe { width:320px; height:1700px; border:0; display:block; margin-top:-901px; }
</style></head><body>
<div class="copy">
  <h1>Your languages,<br>your rules</h1>
  <p>Turn on only what you type. Kiko never runs the languages you didn't ask for.</p>
  <ul>
    <li><span>&check;</span>Six language pairs, toggled independently</li>
    <li><span>&check;</span>Learns your words &mdash; fewer false alarms over time</li>
    <li><span>&check;</span>Mute Kiko on any individual site</li>
    <li><span>&check;</span>Every word list stays on your device</li>
  </ul>
</div>
<div class="shot"><div class="inner"><iframe src="popup-preview.html"></iframe></div></div>
</body></html>"""


# Headless Chrome reserves window chrome even with no window: --window-size
# 1280x800 lays the page out in a 1280x713 viewport but still writes an 800px
# tall image, so the bottom of the design falls outside the layout and the
# capture is padded with background. Oversize the window by that much and crop
# back, which gives a true 1280x800 of the intended layout.
CHROME_H = 87


def shoot(src: pathlib.Path, dest: pathlib.Path, w: int, h: int):
    subprocess.run([
        CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
        f"--screenshot={dest}", f"--window-size={w},{h + CHROME_H}",
        "--virtual-time-budget=4000", f"file://{src}",
    ], check=True, capture_output=True)
    img = Image.open(dest)
    if img.size != (w, h):
        img.crop((0, 0, w, h)).save(dest)
    print(f"  {dest.name}  {Image.open(dest).size}  {dest.stat().st_size // 1024} KB")


def main():
    OUT.mkdir(exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp())
    # Mockups reference popup.html and its assets by relative path.
    for f in HERE.glob("*.png"):
        shutil.copy(f, tmp / f.name)
    for f in ("popup.html", "popup.js"):
        shutil.copy(HERE / f, tmp / f)

    print("screenshots (1280x800):")
    for name, subject, typed, lang, corrected, rtl, names in VARIANTS:
        page = tmp / f"{name}.html"
        page.write_text(build_variant(subject, typed, lang, corrected, rtl, names),
                        encoding="utf-8")
        shoot(page, OUT / f"{name}.png", 1280, 800)

    popup_src = (HERE / "popup.html").read_text(encoding="utf-8")
    (tmp / "popup-preview.html").write_text(
        popup_src.replace('<script src="popup.js">', POPUP_STUB + '<script src="popup.js">'),
        encoding="utf-8")
    frame = tmp / "shot4-popup.html"
    frame.write_text(POPUP_FRAME, encoding="utf-8")
    shoot(frame, OUT / "shot4-popup.png", 1280, 800)

    langs = tmp / "shot5-languages.html"
    langs.write_text(LANGS_PAGE, encoding="utf-8")
    shoot(langs, OUT / "shot5-languages.png", 1280, 800)

    print("promo tiles:")
    for src, name, w, h in (("promo-small.html", "promo-small-440x280", 440, 280),
                            ("promo-marquee.html", "promo-marquee-1400x560", 1400, 560)):
        tile = (HERE / src).read_text(encoding="utf-8")
        # Both tiles still advertise Hebrew only. The mock toast is positioned
        # against the viewport rather than the tile, and Chrome enforces a
        # minimum window width, so at 440px wide the toast anchors to a wider
        # viewport and hangs off the edge. Making body the containing block
        # pins it to the tile itself.
        tile = tile.replace("Hebrew \u2194 English", "6 languages")
        tile = tile.replace("</style>",
                            f"  body {{ position: relative; width: {w}px; }}\n"
                            "  .toast-top { font-size: 8px; }\n  </style>")
        (tmp / src).write_text(tile, encoding="utf-8")
        shoot(tmp / src, OUT / f"{name}.png", w, h)

    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
