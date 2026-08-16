#!/usr/bin/env bash
# Render the mockup HTML sources to 2880x1800 PNGs (one directory up) with headless Chromium.
# These are hand-authored design mockups, not screenshots of a running product.
#
# Usage: CHROMIUM_BIN=/path/to/chromium ./render.sh
#
# Note: some headless-Chromium builds reserve ~92px of window height for hidden
# window chrome when --force-device-scale-factor is used, so we ask for extra
# height and crop the capture back to exactly 1440x900 css (2880x1800 device px).
# Cropping needs python3 + Pillow.
set -euo pipefail
cd "$(dirname "$0")"

CHROMIUM_BIN="${CHROMIUM_BIN:-chromium}"

for f in [0-9][0-9]-*.html; do
  out="../${f%.html}.png"
  "$CHROMIUM_BIN" \
    --headless=new --no-sandbox --disable-gpu \
    --force-device-scale-factor=2 --window-size=1440,992 --hide-scrollbars \
    --screenshot="$out" "file://$PWD/$f" 2>/dev/null
  python3 - "$out" <<'PY'
import sys
from PIL import Image
path = sys.argv[1]
im = Image.open(path)
if im.size != (2880, 1800):
    im.crop((0, 0, 2880, 1800)).save(path, optimize=True)
else:
    im.save(path, optimize=True)
PY
  echo "rendered $out"
done
