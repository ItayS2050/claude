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

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

# The Web Store rejects the upload outright on these, after you have already
# waited through it. Cheaper to fail here.
python3 - <<'PY'
import json, sys
m = json.load(open('manifest.json'))
limits = {'description': 132, 'name': 75, 'short_name': 12}
bad = [f"{k}: {len(m[k])} chars, limit {v}"
       for k, v in limits.items() if k in m and len(m[k]) > v]
if bad:
    sys.exit('manifest exceeds Web Store limits —\n  ' + '\n  '.join(bad))
PY

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1
