#!/usr/bin/env bash
# Build a Chrome Web Store package containing only what the extension needs.
# Everything else in this folder — mockups, marketing pages, this script — stays out.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/kiko-${VERSION}.zip"

# Files the extension loads at runtime. manifest.json references the first four;
# welcome.html opens on install; the legal pages are linked from it.
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
  privacy.html
  terms.html
  refund.html
  icon16.png
  icon48.png
  icon128.png
)

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

mkdir -p dist
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1
