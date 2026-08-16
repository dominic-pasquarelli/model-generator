#!/usr/bin/env bash
# Render the mockup HTML sources to 2880x1800 PNGs (one directory up) with headless Chromium.
# These are hand-authored design mockups, not screenshots of a running product.
#
# Usage: CHROMIUM_BIN=/path/to/chromium PYTHON_BIN=python3 ./render.sh
#
# Note: some headless-Chromium builds reserve ~92px of window height for hidden
# window chrome when --force-device-scale-factor is used, so we ask for extra
# height and crop the capture back to exactly 1440x900 css (2880x1800 device px).
# Cropping needs Python + Pillow.
set -euo pipefail
cd "$(dirname "$0")"

CHROMIUM_BIN="${CHROMIUM_BIN:-chromium}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

capture() { # capture <url> <out.png>
  "$CHROMIUM_BIN" \
    --headless=new --no-sandbox --disable-gpu \
    --force-device-scale-factor=2 --window-size=1440,992 --hide-scrollbars \
    --screenshot="$2" "$1"
  "$PYTHON_BIN" - "$2" <<'PY'
import sys
from PIL import Image
path = sys.argv[1]
im = Image.open(path)
target = (2880, 1800)
if im.size[0] < target[0] or im.size[1] < target[1]:
    raise SystemExit(
        f"{path}: screenshot is {im.size[0]}x{im.size[1]}, smaller than "
        f"{target[0]}x{target[1]}; check CHROMIUM_BIN/device-scale support"
    )
if im.size != target:
    im.crop((0, 0, target[0], target[1])).save(path, optimize=True)
else:
    im.save(path, optimize=True)
PY
  echo "rendered $2"
}

for f in [0-9][0-9]-*.html; do
  capture "file://$PWD/$f" "../${f%.html}.png"
done

# Dark-chrome reference variants (the canvas is theme-invariant; these show the
# dark application chrome on representative screens — see COMPONENT_SPEC.md).
for f in 01-library.html 05-outline-holes.html 09-states.html; do
  capture "file://$PWD/$f?theme=dark" "../${f%.html}-dark.png"
done
