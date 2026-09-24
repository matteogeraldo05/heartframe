#!/usr/bin/env python3
"""Make the 2D drawing JLC3DP asks for when you order threaded inserts.

Reads the real dimensions from heartframe.scad (part="info"), so it always matches
your STL. Writes stl/insert_drawing.png and stl/insert_drawing.pdf. Any extra
arguments (e.g. -D 'fit=0.4') are passed to OpenSCAD, like export.sh does.

    python3 insert_drawing.py
"""
import os
import re
import subprocess
import sys
import tempfile

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
INSERT_NAME = {4.0: 'Type 1 "TTH-M3*6.25-HD4.7"', 3.6: 'Type 5 "M3*4*5"'}


def read_info(extra):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "info.echo")
        subprocess.run(["openscad", *extra, "-D", 'part="info"', "-o", out, "heartframe.scad"],
                       cwd=HERE, check=True, capture_output=True)
        text = open(out).read()
    m = re.search(r'HF_INFO ([^"]+)', text)
    if not m:
        sys.exit("could not read HF_INFO from OpenSCAD")
    info = dict(kv.split("=", 1) for kv in m.group(1).split())
    return {k: (v if k == "fastener" else float(v)) for k, v in info.items()}


def main():
    extra = sys.argv[1:]
    i = read_info(extra)
    if i["fastener"] != "insert":
        print(f'fastener = "{i["fastener"]}": no insert drawing needed')
        return
    W, H, c, hole, depth = i["W"], i["H"], i["c"], i["hole"], i["depth"]
    name = INSERT_NAME.get(round(hole, 1), f"M3 insert for a {hole} mm hole")

    fig, ax = plt.subplots(figsize=(8.27, 11.69))  # A4 portrait
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(FancyBboxPatch((0, 0), W, H, boxstyle=f"round,pad=0,rounding_size={i['r']}",
                                fill=False, lw=1.6))
    ax.add_patch(Rectangle((2.4, 2.4), W - 4.8, H - 4.8, fill=False, lw=0.6, ls="--", color="grey"))
    for x, y in [(c, c), (W - c, c), (c, H - c), (W - c, H - c)]:
        ax.add_patch(Circle((x, y), hole / 2, fill=True, color="red"))
        ax.add_patch(Rectangle((x - i["flat"] / 2, y - i["flat"] / 2), i["flat"], i["flat"],
                               fill=False, lw=0.5, color="red", ls=":"))
        ax.annotate("M3 insert", (x, y), xytext=(x + (12 if x < W / 2 else -12), y + (12 if y < H / 2 else -12)),
                    ha="center", fontsize=8, color="red", arrowprops=dict(arrowstyle="->", color="red", lw=0.8))
    # dimensions
    ax.annotate("", (0, -6), (W, -6), arrowprops=dict(arrowstyle="<->", lw=0.8))
    ax.text(W / 2, -10, f"{W:.1f} mm", ha="center", fontsize=9)
    ax.annotate("", (-6, 0), (-6, H), arrowprops=dict(arrowstyle="<->", lw=0.8))
    ax.text(-10, H / 2, f"{H:.1f} mm", va="center", rotation=90, fontsize=9)
    ax.annotate("", (0, H + 5), (c, H + 5), arrowprops=dict(arrowstyle="<->", lw=0.6))
    ax.text(c / 2, H + 7, f"{c:.1f}", ha="center", fontsize=8)
    ax.annotate("", (W + 5, H), (W + 5, H - c), arrowprops=dict(arrowstyle="<->", lw=0.6))
    ax.text(W + 7, H - c / 2, f"{c:.1f}", va="center", fontsize=8)
    ax.text(W / 2, H + 22, "front.stl: view from the BACK (open side)", ha="center", fontsize=13, weight="bold")
    notes = (
        f"4 x M3 threaded insert, {name}\n"
        f"Holes: {hole:.1f} mm diameter x {depth:.1f} mm deep, in the rear face (this face), 4 corners,\n"
        f"centres {c:.1f} mm from both outer edges. Insert flush with the face.\n"
        f"Flat area around each hole >= {i['flat']:.0f} x {i['flat']:.0f} mm (dotted). Wall around each hole >= 3 mm.\n"
        "Screws come from the back cover (M3 x 8 countersunk)."
    )
    ax.text(W / 2, -18, notes, ha="center", va="top", fontsize=9, family="monospace")
    ax.set_xlim(-25, W + 25)
    ax.set_ylim(-60, H + 35)
    os.makedirs(os.path.join(HERE, "stl"), exist_ok=True)
    for ext in ("png", "pdf"):
        fig.savefig(os.path.join(HERE, "stl", f"insert_drawing.{ext}"), dpi=200, bbox_inches="tight")
    print("wrote stl/insert_drawing.png and stl/insert_drawing.pdf")


if __name__ == "__main__":
    main()
