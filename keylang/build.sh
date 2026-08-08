#!/usr/bin/env bash
# Build a Chrome Web Store package containing only what the extension needs.
# Everything else in this folder — mockups, marketing pages, this script — stays out.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/kiko-${VERSION}.zip"

# Files the extension loads at runtime. manifest.json references the first four
# welcome.html opens on install and whats-new.html on the paywall update.
# The legal pages are NOT here: nothing in
# the extension links to them, they live on the website (docs/).
FILES=(
  manifest.json
  background.js
  content.js
  offscreen.html
  offscreen.js
  popup.html
  popup.js
  welcome.html
  welcome.js
  whats-new.html
  whats-new.js
  icon16.png
  icon48.png
  icon128.png
)

# Message catalogues. The manifest's name and description are __MSG_ lookups
# now, so these are not optional extras — without them the extension has no
# name at all. They are also what makes the Web Store offer a translated
# listing per locale: the dashboard only lists languages the package declares.
LOCALES=(_locales/*/messages.json)

for f in "${FILES[@]}" "${LOCALES[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

# The Web Store rejects the upload outright on these, after you have already
# waited through it. Cheaper to fail here.
python3 - <<'PY'
import glob, json, os, sys

LIMITS = {'description': 132, 'name': 75, 'short_name': 12}
MSG_KEY = {'name': 'extName', 'description': 'extDescription'}
bad = []

m = json.load(open('manifest.json'))
default = m.get('default_locale')

for field, limit in LIMITS.items():
    value = m.get(field)
    if value is None:
        continue
    if value.startswith('__MSG_'):
        continue          # measured per locale below, where the real text is
    if len(value) > limit:
        bad.append(f"manifest {field}: {len(value)} chars, limit {limit}")

# Every locale is checked, not just the default. A translation that overruns
# fails the upload exactly like the English one does, except you find out
# after the wait rather than before it.
found = sorted(glob.glob('_locales/*/messages.json'))
if default and not os.path.isfile(f'_locales/{default}/messages.json'):
    bad.append(f"default_locale is {default} but _locales/{default}/messages.json is missing")
for path in found:
    code = path.split(os.sep)[1]
    msgs = json.load(open(path, encoding='utf-8'))
    for field, key in MSG_KEY.items():
        if key not in msgs:
            bad.append(f"{code}: {key} missing")
            continue
        text = msgs[key]['message']
        if len(text) > LIMITS[field]:
            bad.append(f"{code} {field}: {len(text)} chars, limit {LIMITS[field]}")

if bad:
    sys.exit('Web Store limits exceeded —\n  ' + '\n  '.join(bad))
print(f"  locales: {', '.join(p.split(os.sep)[1] for p in found)}")
PY

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}" "${LOCALES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1
