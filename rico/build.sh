#!/usr/bin/env bash
# Package Rico for the Chrome Web Store: only the files the extension loads at
# runtime. The tests, the icon generator and this script stay out of the zip.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/rico-${VERSION}.zip"

FILES=(
  manifest.json
  background.js
  ExtPay.js
  selectors.js
  fuzzy.js
  shortcut.js
  tokens.js
  storage.js
  insert.js
  palette.js
  content.js
  popup.html
  popup.js
  welcome.html
  icon16.png
  icon48.png
  icon128.png
)

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

# Failing here costs seconds; failing on upload costs the whole review wait.
python3 - <<'PY'
import json, sys

LIMITS = {'name': 75, 'description': 132, 'short_name': 12}
m = json.load(open('manifest.json'))
bad = [f"{field}: {len(m[field])} chars, limit {limit}"
       for field, limit in LIMITS.items()
       if field in m and len(m[field]) > limit]

for path in ['background.js', 'popup.html', *m['icons'].values()]:
    try:
        open(path).close()
    except OSError:
        bad.append(f"manifest references missing file: {path}")

# Every content script the manifest names has to be in the zip, and in an order
# that puts each module ahead of whoever uses it — they share one global and
# there is no bundler to sort it out.
declared = [f for entry in m['content_scripts'] for f in entry['js']]
for path in declared:
    try:
        open(path).close()
    except OSError:
        bad.append(f"content script missing: {path}")

order = m['content_scripts'][0]['js']
if order.index('content.js') != len(order) - 1:
    bad.append('content.js must load last')
for dep in ['selectors.js', 'palette.js', 'insert.js', 'storage.js', 'shortcut.js']:
    if order.index(dep) > order.index('content.js'):
        bad.append(f'{dep} loads after content.js')

# The paywall is the whole business model, and the placeholder id silently
# routes every purchase nowhere.
pay = open('pay.js').read()
if "EXTENSION_ID = 'rico-gmail-palette'" in pay:
    bad.append("pay.js still has the placeholder ExtensionPay id — see README")

if bad:
    sys.exit('manifest problems —\n  ' + '\n  '.join(bad))
PY

# The gate on the free tier and the guess behind {FirstName} are both places
# where a regression is invisible until it costs a sale or greets someone by
# the wrong name.
for t in test-fuzzy.js test-shortcut.js test-tokens.js test-storage.js; do
  node "$t" > /dev/null || { echo "$t is failing" >&2; exit 1; }
done

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1
