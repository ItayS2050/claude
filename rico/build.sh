#!/usr/bin/env bash
# Package Rico for the Chrome Web Store: only the files the extension loads at
# runtime. The tests, the fixtures, the brand renderer and this script stay out
# of the zip.
#
#   ./build.sh          a store package
#   ./build.sh --dev    the same package, without the ExtensionPay id check,
#                       for load-unpacked testing
#
# Dev builds go through the same file list on purpose. An earlier round of
# hand-copied dev zips left pay.js out, background.js importScripts'd it, and
# the service worker failed to register on install — while the palette, which
# is all content script, carried on working well enough to hide it.
set -euo pipefail
cd "$(dirname "$0")"

DEV=0
[[ "${1:-}" == "--dev" ]] && DEV=1

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/rico-${VERSION}$([[ $DEV == 1 ]] && echo '-dev').zip"

FILES=(
  manifest.json
  background.js
  ExtPay.js
  pay.js
  selectors.js
  fuzzy.js
  shortcut.js
  tokens.js
  storage.js
  insert.js
  repeats.js
  suggest.js
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

# Failing here costs seconds; failing on upload costs the whole review wait, and
# failing on a user's machine costs the install.
RICO_FILES="${FILES[*]}" RICO_DEV="$DEV" python3 - <<'PY'
import json, os, re, sys

packaged = set(os.environ['RICO_FILES'].split())
dev = os.environ['RICO_DEV'] == '1'
bad = []

LIMITS = {'name': 75, 'description': 132, 'short_name': 12}
m = json.load(open('manifest.json'))
bad += [f"{field}: {len(m[field])} chars, limit {limit}"
        for field, limit in LIMITS.items()
        if field in m and len(m[field]) > limit]

for path in ['background.js', 'popup.html', *m['icons'].values()]:
    if not os.path.exists(path):
        bad.append(f"manifest references missing file: {path}")

# Every file the manifest names has to be in the zip.
declared = [f for entry in m['content_scripts'] for f in entry['js']]
declared.append(m['background']['service_worker'])
declared.append(m['action']['default_popup'])
declared += list(m['icons'].values())
for path in declared:
    if not os.path.exists(path):
        bad.append(f"manifest names a missing file: {path}")
    if path not in packaged:
        bad.append(f"manifest names {path}, which the zip does not include")

# And so does everything those files load at runtime. This check exists because
# pay.js went missing from the package list while every other check passed: the
# manifest never mentions it, only background.js does, so nothing noticed until
# a service worker failed to register on a real install.
def loads_of(path):
    src = open(path, encoding='utf-8').read()
    found = []
    for call in re.findall(r'importScripts\(([^)]*)\)', src):
        found += re.findall(r"['\"]([^'\"]+\.js)['\"]", call)
    found += re.findall(r'<script[^>]+src="([^"]+\.js)"', src)
    return found

for path in ['background.js', 'popup.html', 'welcome.html']:
    for dep in loads_of(path):
        if dep not in packaged:
            bad.append(f"{path} loads {dep}, which the zip does not include")
        if not os.path.exists(dep):
            bad.append(f"{path} loads {dep}, which does not exist")

# Content scripts share one global and there is no bundler to sort out the
# order, so each module has to load ahead of whoever uses it.
order = m['content_scripts'][0]['js']
if order.index('content.js') != len(order) - 1:
    bad.append('content.js must load last')
for dep in ['selectors.js', 'palette.js', 'insert.js', 'storage.js', 'shortcut.js',
            'repeats.js', 'suggest.js']:
    if order.index(dep) > order.index('content.js'):
        bad.append(f'{dep} loads after content.js')

# The paywall is the whole business model, and the placeholder id silently
# routes every purchase nowhere. Dev builds are allowed to carry it.
if not dev and "EXTENSION_ID = 'rico-gmail-palette'" in open('pay.js').read():
    bad.append("pay.js still has the placeholder ExtensionPay id — see README")

if bad:
    sys.exit('build refused —\n  ' + '\n  '.join(bad))
PY

# The gate on the free tier, the {FirstName} guess and what counts as a repeat
# are all places where a regression is invisible until it costs a sale or
# greets someone by the wrong name.
for t in test-fuzzy.js test-shortcut.js test-tokens.js test-storage.js test-repeats.js; do
  node "$t" > /dev/null || { echo "$t is failing" >&2; exit 1; }
done

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1
