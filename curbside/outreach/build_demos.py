#!/usr/bin/env python3
"""Generate a personalized Curbside Quote preview page for every prospect in a CSV.

    ./outreach/build_demos.py prospects.csv --reply you@yourdomain.com

Reads a CSV with a `name` column, plus optional `domain`, `email`, `phone`
and `city`. For each row it visits the domain, lifts the logo and brand
color, and writes a standalone preview page under `outreach/out/`. It also
writes `outreach/out/links.csv` — name, email and the unique URL — ready to
mail-merge.

Rows without a domain, and rows whose site can't be reached, still get a
page: the logo falls back to a monogram in a neutral green. Nothing here
fails the whole run.

Upload `outreach/out/` to any static host. Each page is noindex and lives on
an unguessable URL, so only the person you send it to will find it.
"""

import argparse
import base64
import csv
import io
import os
import re
import hashlib
import hmac
import secrets
import sys
from collections import Counter
from urllib.parse import urljoin, urlparse

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

try:
    from PIL import Image
except ImportError:
    sys.exit("pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, os.pardir, "template", "index.html")
UA = "Mozilla/5.0 (compatible; CurbsideQuote preview builder; +contact via email)"

# Listings and social profiles: scraping these hands back the platform's own
# logo, which on a page addressed to a landscaper looks worse than no logo.
NOT_THEIR_SITE = (
    "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
    "yelp.com", "nextdoor.com", "angi.com", "angieslist.com", "thumbtack.com",
    "homeadvisor.com", "porch.com", "bbb.org", "yellowpages.com", "mapquest.com",
    "google.com", "sites.google.com", "business.site", ".godaddysites.com",
)
TIMEOUT = 12
MAX_LOGO_BYTES = 180_000
LOGO_MAX_HEIGHT = 128  # 2x the 32px display height, ample for retina


# ---------------------------------------------------------------- fetching

def fetch(url, binary=False):
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": UA}, allow_redirects=True)
        if r.status_code != 200:
            return None
        return r.content if binary else r.text
    except Exception:
        return None


def normalize_domain(domain):
    domain = (domain or "").strip()
    if not domain:
        return ""
    if not domain.startswith(("http://", "https://")):
        domain = "https://" + domain
    host = urlparse(domain).netloc.lower()
    bare = host[4:] if host.startswith("www.") else host
    if any(bare == b or bare.endswith(b) or b.startswith(".") and bare.endswith(b[1:])
           for b in NOT_THEIR_SITE):
        return ""
    return domain


# ------------------------------------------------------------ logo hunting

def logo_candidates(html, base_url):
    """Ordered best-guess logo URLs found in a homepage."""
    out = []

    def add(u):
        if u:
            full = urljoin(base_url, u.strip())
            if full not in out:
                out.append(full)

    # A real <img> whose markup calls itself a logo is the best signal — it is
    # usually the wordmark in the header, at the right aspect ratio.
    for m in re.finditer(r"<img\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(r'(?:class|id|alt|src)\s*=\s*["\'][^"\']*logo', tag, re.I):
            src = re.search(r'\bsrc\s*=\s*["\']([^"\']+)', tag, re.I)
            if src:
                add(src.group(1))

    for rel in ("apple-touch-icon", "apple-touch-icon-precomposed"):
        for m in re.finditer(r"<link\b[^>]*>", html, re.I):
            tag = m.group(0)
            if re.search(r'rel\s*=\s*["\'][^"\']*' + rel, tag, re.I):
                href = re.search(r'\bhref\s*=\s*["\']([^"\']+)', tag, re.I)
                if href:
                    add(href.group(1))

    og = re.search(r'<meta[^>]+property\s*=\s*["\']og:image["\'][^>]*content\s*=\s*["\']([^"\']+)', html, re.I)
    if og:
        add(og.group(1))

    for m in re.finditer(r"<link\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(r'rel\s*=\s*["\'][^"\']*icon', tag, re.I):
            href = re.search(r'\bhref\s*=\s*["\']([^"\']+)', tag, re.I)
            if href:
                add(href.group(1))

    add("/favicon.ico")
    return out


def load_logo(urls):
    """Download the first candidate that decodes as a usable image."""
    for url in urls:
        raw = fetch(url, binary=True)
        if not raw or len(raw) > 4_000_000:
            continue
        try:
            img = Image.open(io.BytesIO(raw))
            img.load()
        except Exception:
            continue
        if img.width < 24 or img.height < 24:
            continue                      # a 16px favicon looks like nothing at header size
        if img.width / max(img.height, 1) > 12:
            continue                      # a spacer or divider strip, not a logo
        return img, url
    return None, None


def to_data_uri(img):
    """Flatten onto white, cap the height, and return a PNG data URI."""
    img = img.convert("RGBA")
    if img.height > LOGO_MAX_HEIGHT:
        ratio = LOGO_MAX_HEIGHT / img.height
        img = img.resize((max(1, int(img.width * ratio)), LOGO_MAX_HEIGHT), Image.LANCZOS)

    flat = Image.new("RGB", img.size, (255, 255, 255))
    flat.paste(img, mask=img.split()[3])

    buf = io.BytesIO()
    flat.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()

    if len(data) > MAX_LOGO_BYTES:        # fall back to JPEG for photographic marks
        buf = io.BytesIO()
        flat.save(buf, format="JPEG", quality=82, optimize=True)
        data = buf.getvalue()
        if len(data) > MAX_LOGO_BYTES:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(data).decode()

    return "data:image/png;base64," + base64.b64encode(data).decode()


# ----------------------------------------------------------- brand color

def dominant_color(img):
    """The most common strongly-colored pixel — their brand color, usually."""
    small = img.convert("RGB").resize((64, 64), Image.LANCZOS)
    raw = small.tobytes()
    counts = Counter()
    for i in range(0, len(raw), 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        hi, lo = max(r, g, b), min(r, g, b)
        if hi < 40 or lo > 225:
            continue                      # near-black or near-white: background, not brand
        if hi - lo < 40:
            continue                      # grey
        counts[(r // 16 * 16, g // 16 * 16, b // 16 * 16)] += 1
    if not counts:
        return ""
    r, g, b = counts.most_common(1)[0][0]
    return "#%02X%02X%02X" % (r, g, b)


def theme_color(html):
    m = re.search(r'<meta[^>]+name\s*=\s*["\']theme-color["\'][^>]*content\s*=\s*["\']([^"\']+)', html or "", re.I)
    if not m:
        return ""
    v = m.group(1).strip()
    return v if re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", v) else ""


def monogram(name, color):
    """A wordmark stand-in when no logo can be found."""
    words = [w for w in re.split(r"[^A-Za-z]+", name) if w]
    initials = "".join(w[0] for w in words[:2]).upper() or "L"
    fill = color or "#2E5B43"
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
        '<rect width="128" height="128" rx="26" fill="{fill}"/>'
        '<text x="64" y="64" fill="#ffffff" font-family="Georgia,serif" font-size="58" '
        'font-weight="700" text-anchor="middle" dominant-baseline="central">{ini}</text>'
        "</svg>"
    ).format(fill=fill, ini=initials)
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def find_phone(html):
    m = re.search(r"tel:\+?([0-9().\-\s]{7,20})", html or "")
    if m:
        digits = re.sub(r"\D", "", m.group(1))
        if len(digits) == 10:
            return "(%s) %s-%s" % (digits[:3], digits[3:6], digits[6:])
        if len(digits) == 11 and digits[0] == "1":
            digits = digits[1:]
            return "(%s) %s-%s" % (digits[:3], digits[3:6], digits[6:])
    return ""


# -------------------------------------------------------------- generation

def js_string(value):
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"') + '"'


def set_field(html, key, value):
    pattern = re.compile(r'(\n  ' + re.escape(key) + r':\s*)("(?:[^"\\]|\\.)*"|[^,\n]+?)(,?)(\s*(?://[^\n]*)?\n)')
    replacement = lambda m: m.group(1) + js_string(value) + m.group(3) + m.group(4)
    html, n = pattern.subn(replacement, html, count=1)
    if n != 1:
        raise SystemExit("could not set CONFIG key %r — did the template change?" % key)
    return html


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:40] or "landscaper"


def campaign_salt(out_dir):
    """One secret per output folder, created once and reused.

    The URL token is derived from it, so regenerating (to add logos, fix a
    price, correct a name) leaves every link you have already emailed
    pointing at the updated page instead of a 404.
    """
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, ".salt")
    if os.path.exists(path):
        return open(path).read().strip()
    salt = secrets.token_hex(16)
    with open(path, "w") as fh:
        fh.write(salt)
    return salt


def url_token(salt, name):
    return hmac.new(salt.encode(), name.encode("utf-8"), hashlib.sha256).hexdigest()[:8]


def build_one(row, template, args):
    name = (row.get("name") or "").strip()
    if not name:
        return None

    domain = normalize_domain(row.get("domain"))
    phone = (row.get("phone") or "").strip()
    logo_uri, color, source = "", "", "none"

    if domain and not args.no_fetch:
        html = fetch(domain)
        if html:
            img, used = load_logo(logo_candidates(html, domain))
            if img is not None:
                logo_uri = to_data_uri(img) or ""
                if logo_uri:
                    color = dominant_color(img)
                    source = used
            color = color or theme_color(html)
            phone = phone or find_phone(html)

    if not logo_uri:
        logo_uri = monogram(name, color)
        source = "monogram"

    html = template
    html = set_field(html, "bizName", name)
    html = set_field(html, "bizTel", phone or "(555) 000-0000")
    html = set_field(html, "notifyEmail", args.reply or "you@example.com")
    html = set_field(html, "leadEndpoint", "")
    html = set_field(html, "logo", logo_uri)
    html = set_field(html, "brandColor", color)
    html = set_field(html, "demoFor", name)
    html = set_field(html, "demoReply", args.reply or "")
    html = set_field(html, "demoPrice", args.price)

    folder = "%s-%s" % (slugify(name), url_token(args.salt, name))
    dest = os.path.join(args.out, folder)
    os.makedirs(dest, exist_ok=True)
    with open(os.path.join(dest, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(html)

    return {
        "name": name,
        "email": (row.get("email") or "").strip(),
        "city": (row.get("city") or "").strip(),
        "url": args.base_url.rstrip("/") + "/" + folder + "/" if args.base_url else folder + "/",
        "logo_source": source,
        "brand_color": color or "(default)",
        "phone": phone or "(not found)",
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", help="prospect list with a `name` column")
    ap.add_argument("--reply", default="", help="your email — the reply link on every page")
    ap.add_argument("--price", default="$59/month", help='price shown in the pitch block')
    ap.add_argument("--base-url", default="", help="where you will host these, e.g. https://quotes.yoursite.com")
    ap.add_argument("--out", default=os.path.join(HERE, "out"), help="output directory")
    ap.add_argument("--limit", type=int, default=0, help="only build the first N rows")
    ap.add_argument("--no-fetch", action="store_true", help="skip the network entirely (monograms for everyone)")
    args = ap.parse_args()

    if not args.reply:
        print("warning: no --reply address, so the pages have no reply button\n", file=sys.stderr)

    template = open(TEMPLATE, encoding="utf-8").read()
    args.salt = campaign_salt(args.out)

    with open(args.csv, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    if args.limit:
        rows = rows[: args.limit]

    results = []
    for i, row in enumerate(rows, 1):
        try:
            built = build_one(row, template, args)
        except SystemExit:
            raise
        except Exception as exc:
            print("  %-34s failed: %s" % ((row.get("name") or "?")[:34], exc))
            continue
        if not built:
            continue
        results.append(built)
        print("  %-34s %-9s %s" % (built["name"][:34],
                                   "monogram" if built["logo_source"] == "monogram" else "logo",
                                   built["brand_color"]))

    links = os.path.join(args.out, "links.csv")
    with open(links, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["name", "email", "city", "url", "logo_source", "brand_color", "phone"])
        w.writeheader()
        w.writerows(results)

    real = sum(1 for r in results if r["logo_source"] != "monogram")
    print("\n%d pages in %s" % (len(results), args.out))
    print("%d with a real logo, %d with a monogram" % (real, len(results) - real))
    print("mail-merge list: %s" % links)


if __name__ == "__main__":
    main()
