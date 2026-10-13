"""Draw the frame's default "welcome" screen (as firmware/src/display.cpp does) as a
PNG texture for the Blender scene: 400 x 300 e-paper pixels, scaled up 4x."""
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1] if len(sys.argv) > 1 else "screen.png"
PAPER, INK = (214, 212, 204), (34, 34, 36)  # e-paper "white" is a warm light grey
img = Image.new("RGB", (400, 300), PAPER)
d = ImageDraw.Draw(img)
# GNU FreeSans, the font the firmware's GFX fonts come from.
# Debian/Ubuntu: fonts-freefont-ttf   Fedora: gnu-free-sans-fonts
FONT_DIRS = ["/usr/share/fonts/truetype/freefont/", "/usr/share/fonts/gnu-free/", "/usr/share/fonts/freefont/"]

def font(name, size):
    for d in FONT_DIRS:
        try:
            return ImageFont.truetype(d + name, size)
        except OSError:
            pass
    sys.exit(f"{name} not found: install FreeSans (fonts-freefont-ttf / gnu-free-sans-fonts)")

bold12 = font("FreeSansBold.ttf", 23)   # GFX 12 pt at 141 dpi
reg9 = font("FreeSans.ttf", 17)         # GFX 9 pt
bold9 = font("FreeSansBold.ttf", 17)

def heart(cx, cy, size):
    r = size // 4
    d.ellipse([cx - 2 * r, cy - r, cx, cy + r], fill=INK)
    d.ellipse([cx, cy - r, cx + 2 * r, cy + r], fill=INK)
    d.polygon([(cx - 2 * r, cy + r // 3), (cx + 2 * r, cy + r // 3), (cx, cy + 2 * r + r // 2)], fill=INK)

def centered(text, baseline, font):
    w = d.textlength(text, font=font)
    d.text((200 - w / 2, baseline), text, font=font, fill=INK, anchor="ls")

heart(200, 105, 90)
centered("Hi you", 215, bold12)
centered("Your first message is on its way", 250, reg9)

# battery overlay, top right (OVERLAY_X 318, W 80, Y 2, H 22)
txt = "100%"
tw = d.textlength(txt, font=bold9)
box_w = int(6 + 26 + 4 + tw + 6)
bx, by = 318 + 80 - box_w, 2
d.rounded_rectangle([bx, by, bx + box_w - 1, by + 21], radius=6, outline=INK, fill=PAPER)
x, y = bx + 6, by + 5
d.rectangle([x, y, x + 23, y + 11], outline=INK)
d.rectangle([x + 24, y + 3, x + 25, y + 8], fill=INK)
d.rectangle([x + 2, y + 2, x + 21, y + 9], fill=INK)
d.text((x + 30, by + 16), txt, font=bold9, fill=INK, anchor="ls")

# e-paper is 1-bit: snap every pixel to paper or ink, then scale up with hard edges
lum = img.convert("L").point(lambda v: 255 if v > 125 else 0)
img = Image.new("RGB", img.size, PAPER)
img.paste(Image.new("RGB", img.size, INK), mask=lum.point(lambda v: 255 - v))
img.resize((1600, 1200), Image.NEAREST).save(out)
print("wrote", out)
