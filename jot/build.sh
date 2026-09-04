#!/usr/bin/env bash
# Package Jot for the Chrome Web Store: only the files the extension loads at
# runtime. The tests, the icon generator and this script stay out of the zip.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/jot-${VERSION}.zip"

FILES=(
  manifest.json
  background.js
  popup.html
  popup.js
  store.js
  nlp.js
  classify.js
  welcome.html
  welcome.js
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

# Every file the manifest names has to exist, or the package installs broken.
for path in ['background.js', 'popup.html', *m['icons'].values()]:
    try:
        open(path).close()
    except OSError:
        bad.append(f"manifest references missing file: {path}")

if bad:
    sys.exit('manifest problems —\n  ' + '\n  '.join(bad))
PY

# The parser decides when every reminder fires; shipping it untested is not worth
# the two seconds saved.
node test-nlp.js > /dev/null || { echo "test-nlp.js is failing" >&2; exit 1; }
node test-classify.js > /dev/null || { echo "test-classify.js is failing" >&2; exit 1; }
node test-store.js > /dev/null || { echo "test-store.js is failing" >&2; exit 1; }

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1
