#!/usr/bin/env bash
# Render every printable part to STL, the 1:1 paper template (SVG), a preview PNG,
# and the insert drawing the print shop asks for.
# OpenSCAD 2021.01 works (a few minutes). A development snapshot with the Manifold
# backend is much faster: ./export.sh --backend=manifold
# Overrides go straight to OpenSCAD:  ./export.sh -D 'fit=0.45' -D 'fastener="nut"'
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p stl
EXTRA=("$@")
scad() { openscad "${EXTRA[@]}" "$@" heartframe.scad; }

for p in front back test_usb test_display test_boss test_button stand; do
  echo "rendering $p..."
  scad -D "part=\"$p\"" -o "stl/$p.stl"
done
scad -D 'part="template"' -o stl/front_template.svg
scad -D 'part="template"' -o stl/front_template.dxf     # for Onshape (Insert DXF)
scad -D 'part="assembly"' --imgsize=1600,1200 --viewall --autocenter \
  --camera=0,0,0,235,0,205,0 --colorscheme=Tomorrow -o stl/assembly.png \
  || { rm -f stl/assembly.png; echo "(PNG preview needs a display; skipped)"; }
scad -D 'part="inside"' --imgsize=1300,1300 --viewall --autocenter --camera=0,0,0,0,0,0,0 --projection=ortho \
  --colorscheme=Tomorrow -o stl/inside.png || rm -f stl/inside.png
if python3 -c 'import matplotlib' 2>/dev/null; then
  python3 insert_drawing.py "${EXTRA[@]}"
else
  echo "(insert drawing skipped: sudo dnf install python3-matplotlib)"
fi
ls -la stl
