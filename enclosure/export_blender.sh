#!/usr/bin/env bash
# Build heartframe.blend: every part as its own object, assembled, in millimetres,
# with materials, the welcome screen on the display, a camera and lights (F12 renders).
# Needs: openscad, python3-pillow, the FreeSans font, blender (4.0 or newer).
# Overrides go straight to OpenSCAD, like export.sh:  ./export_blender.sh -D 'pb_usb_inset=0.8'
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bl
for p in front back panel module perfboard headers feather usbc battery button_body button_nut button_cap stand; do
  echo "exporting $p..."
  openscad "$@" -D "part=\"bl_$p\"" -o "bl/$p.off" heartframe.scad 2> "bl/$p.log"
done
openscad "$@" -D 'part="bl_info"' -o bl/info.stl heartframe.scad > bl/info.log 2>&1
python3 screen_image.py bl/screen.png
blender -b --factory-startup --python blender_scene.py -- bl heartframe.blend
echo "done: $(pwd)/heartframe.blend"
