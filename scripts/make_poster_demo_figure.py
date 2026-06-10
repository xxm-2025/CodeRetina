"""Generate a poster-ready demo figure for CodeRetina.

Output:
  poster_assets/agentic_visual_search_trace.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "poster_assets" / "agentic_visual_search_trace.png"

W, H = 3000, 1720

PURPLE = (91, 42, 137)
PURPLE_DEEP = (62, 24, 102)
PURPLE_SOFT = (238, 226, 248)
PURPLE_PALE = (247, 242, 252)
CHARCOAL = (34, 31, 46)
GRAY = (94, 91, 110)
GRAY_LIGHT = (214, 211, 224)
ACCENT = (199, 78, 41)
ACCENT_SOFT = (255, 239, 231)
GREEN = (48, 145, 105)
BLUE_GRAY = (69, 80, 105)
WHITE = (255, 255, 255)

ARIAL = "/Library/Fonts/Arial Unicode.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
PINGFANG = "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/3419f2a427639ad8c8e139149a287865a90fa17e.asset/AssetData/PingFang.ttc"


def font(size: int, bold: bool = False, cn: bool = False) -> ImageFont.FreeTypeFont:
    if cn:
        try:
            return ImageFont.truetype(PINGFANG, size, index=4 if bold else 0)
        except Exception:
            return ImageFont.truetype(PINGFANG, size, index=0)
    return ImageFont.truetype(ARIAL_BOLD if bold else ARIAL, size)


def text(draw: ImageDraw.ImageDraw, xy, s: str, fnt, fill=CHARCOAL, anchor="la"):
    draw.text(xy, s, font=fnt, fill=fill, anchor=anchor)


def rrect(draw: ImageDraw.ImageDraw, box, radius=24, fill=None, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadow_panel(img: Image.Image, box, radius=26, fill=WHITE, outline=GRAY_LIGHT):
    x0, y0, x1, y1 = box
    shadow = Image.new("RGBA", (x1 - x0 + 50, y1 - y0 + 50), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([25, 25, x1 - x0 + 25, y1 - y0 + 25],
                         radius=radius, fill=(50, 35, 80, 42))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(shadow, (x0 - 25, y0 - 18))
    d = ImageDraw.Draw(img)
    rrect(d, box, radius=radius, fill=fill, outline=outline, width=3)


def arrow(draw: ImageDraw.ImageDraw, start, end, color=PURPLE, width=8):
    x0, y0 = start
    x1, y1 = end
    draw.line([start, end], fill=color, width=width)
    if abs(x1 - x0) >= abs(y1 - y0):
        direction = 1 if x1 >= x0 else -1
        pts = [(x1, y1), (x1 - direction * 32, y1 - 18), (x1 - direction * 32, y1 + 18)]
    else:
        direction = 1 if y1 >= y0 else -1
        pts = [(x1, y1), (x1 - 18, y1 - direction * 32), (x1 + 18, y1 - direction * 32)]
    draw.polygon(pts, fill=color)


def draw_badge(draw, x, y, label, value, color=PURPLE_DEEP):
    rrect(draw, [x, y, x + 360, y + 124], radius=18, fill=PURPLE_PALE,
          outline=(218, 206, 232), width=2)
    text(draw, (x + 26, y + 36), label, font(28, bold=True), GRAY)
    text(draw, (x + 26, y + 88), value, font(34, bold=True), color)


def draw_dashboard(draw: ImageDraw.ImageDraw, x, y, w, h):
    rrect(draw, [x, y, x + w, y + h], radius=22, fill=WHITE, outline=PURPLE_DEEP, width=4)
    draw.rectangle([x, y, x + w, y + 86], fill=(42, 50, 70))
    text(draw, (x + 34, y + 55), "Customer Admin Console", font(36, bold=True), WHITE, "lm")
    for i, c in enumerate([(255, 92, 92), (238, 196, 71), (86, 196, 132)]):
        draw.ellipse([x + w - 126 + i * 38, y + 34, x + w - 104 + i * 38, y + 56], fill=c)

    side_w = 300
    draw.rectangle([x, y + 86, x + side_w, y + h], fill=(247, 247, 250))
    for i, item in enumerate(["Dashboard", "Users", "Billing", "Audit Log", "Settings"]):
        yy = y + 130 + i * 72
        fill = PURPLE_SOFT if item == "Audit Log" else WHITE
        rrect(draw, [x + 30, yy, x + side_w - 30, yy + 48], radius=10, fill=fill,
              outline=GRAY_LIGHT, width=1)
        text(draw, (x + 54, yy + 31), item, font(23), CHARCOAL, "lm")

    cx = x + side_w + 40
    cy = y + 132
    card_w = (w - side_w - 40 * 4) // 3
    card_h = 150
    for row in range(3):
        for col in range(3):
            bx = cx + col * (card_w + 40)
            by = cy + row * (card_h + 36)
            rrect(draw, [bx, by, bx + card_w, by + card_h], radius=14, fill=WHITE,
                  outline=(214, 215, 222), width=2)
            draw.rectangle([bx, by, bx + card_w, by + 46], fill=BLUE_GRAY)
            text(draw, (bx + 20, by + 30), f"Panel {row * 3 + col + 1}",
                 font(23, bold=True), WHITE, "lm")
            draw.rectangle([bx + 22, by + 72, bx + card_w - 28, by + 90], fill=(228, 228, 234))
            draw.rectangle([bx + 22, by + 110, bx + card_w - 92, by + 128], fill=(236, 236, 241))

    toast_w, toast_h = 385, 138
    tx = x + w - toast_w - 92
    ty = y + h - toast_h - 84
    rrect(draw, [tx, ty, tx + toast_w, ty + toast_h], radius=18,
          fill=ACCENT_SOFT, outline=ACCENT, width=4)
    text(draw, (tx + 30, ty + 44), "Payment failed", font(26, bold=True),
         (127, 49, 35), "lm")
    text(draw, (tx + 30, ty + 96), "ERR_AUTH_42", font(40, bold=True), ACCENT, "lm")

    pad = 18
    draw.rectangle([tx - pad, ty - pad, tx + toast_w + pad, ty + toast_h + pad],
                   outline=ACCENT, width=9)
    rrect(draw, [tx - pad, ty - 76, tx + 316, ty - 26], radius=12, fill=ACCENT)
    text(draw, (tx, ty - 50), "target: tiny error code", font(24, bold=True),
         WHITE, "lm")

    return (tx - pad, ty - pad, tx + toast_w + pad, ty + toast_h + pad)


def main():
    img = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Background.
    draw.rectangle([0, 0, W, H], fill=(252, 251, 254))
    draw.rectangle([0, 0, W, 170], fill=PURPLE_DEEP)
    header_y = 86
    text(draw, (70, header_y), "Agentic Visual Search Trace", font(60, bold=True),
         WHITE, "lm")
    flow_x0 = 1060
    rrect(draw, [flow_x0, 38, W - 70, 134], radius=18,
          fill=(106, 62, 154), outline=(232, 218, 246), width=2)
    text(draw, ((flow_x0 + W - 70) // 2, header_y), "Observe → Locate → Zoom → Answer → Verify",
         font(38, bold=True), WHITE, "mm")

    # Left: full screenshot.
    left = (70, 230, 1850, 1140)
    shadow_panel(img, left, fill=WHITE)
    lx, ly, lx1, ly1 = left
    text(draw, (lx + 34, ly + 58), "1. Full-screen observation", font(36, bold=True),
         PURPLE_DEEP, "lm")
    target_box = draw_dashboard(draw, lx + 34, ly + 100, lx1 - lx - 68, ly1 - ly - 140)

    # Middle: zoom crop.
    zoom = (70, 1210, 1140, 1640)
    shadow_panel(img, zoom, fill=WHITE)
    zx, zy, zx1, zy1 = zoom
    text(draw, (zx + 34, zy + 56), "2. Crop + zoom", font(36, bold=True),
         PURPLE_DEEP, "lm")
    rrect(draw, [zx + 46, zy + 108, zx1 - 46, zy1 - 46], radius=22,
          fill=ACCENT_SOFT, outline=ACCENT, width=5)
    text(draw, (zx + 92, zy + 200), "Payment failed", font(44, bold=True),
         (127, 49, 35), "lm")
    text(draw, (zx + 92, zy + 308), "ERR_AUTH_42", font(82, bold=True),
         ACCENT, "lm")

    # Right: complete case and structured output.
    right = (1920, 230, 2930, 1640)
    shadow_panel(img, right, fill=WHITE)
    rx, ry, rx1, ry1 = right
    text(draw, (rx + 42, ry + 58), "3. Case result", font(38, bold=True),
         PURPLE_DEEP, "lm")

    query_box = [rx + 42, ry + 110, rx1 - 42, ry + 280]
    rrect(draw, query_box, radius=18, fill=PURPLE_PALE, outline=(218, 206, 232), width=2)
    text(draw, (query_box[0] + 28, query_box[1] + 42), "User task", font(30, bold=True),
         PURPLE_DEEP, "lm")
    text(draw, (query_box[0] + 28, query_box[1] + 98),
         "Find the tiny error code in the admin console.",
         font(29, bold=True), CHARCOAL, "lm")
    text(draw, (query_box[0] + 28, query_box[1] + 140),
         "Return the code and where it appears.",
         font(26), GRAY, "lm")

    code_box = [rx + 42, ry + 326, rx1 - 42, ry + 720]
    rrect(draw, code_box, radius=20, fill=(32, 29, 43), outline=None)
    code_lines = [
        "{",
        '  "target": "error_code",',
        '  "answer": "ERR_AUTH_42",',
        '  "bbox": [1548, 650, 385, 138],',
        '  "verified": true',
        "}",
    ]
    for i, line in enumerate(code_lines):
        text(draw, (code_box[0] + 32, code_box[1] + 48 + i * 48),
             line, font(30), (238, 236, 246), "lm")

    text(draw, (rx + 42, ry + 800), "Trace summary", font(34, bold=True),
         PURPLE_DEEP, "lm")
    trace = [
        ("Observe", "read full console screen"),
        ("Locate", "select bottom-right toast"),
        ("Zoom", "crop target region"),
        ("Answer", "extract ERR_AUTH_42"),
        ("Verify", "bbox matches highlighted toast"),
    ]
    ty = ry + 858
    for i, (stage, body) in enumerate(trace):
        row_y = ty + i * 68
        draw.ellipse([rx + 46, row_y + 8, rx + 78, row_y + 40], fill=PURPLE)
        text(draw, (rx + 62, row_y + 24), str(i + 1), font(20, bold=True),
             WHITE, "mm")
        text(draw, (rx + 98, row_y + 24), stage, font(28, bold=True),
             PURPLE_DEEP, "lm")
        text(draw, (rx + 270, row_y + 24), body, font(25), GRAY, "lm")

    by = ry + 1218
    draw_badge(draw, rx + 42, by, "Self-test", "5 / 5 passed")
    draw_badge(draw, rx + 430, by, "Tiny text", "+9% confidence", ACCENT)

    # Flow arrows between panels.
    arrow(draw, (1850, 760), (1910, 760))
    arrow(draw, (1010, 1180), (1010, 1210))

    # Link full-screen target to zoom panel without crossing text.
    tx0, ty0, tx1, ty1 = target_box
    elbow_y = 1168
    draw.line([((tx0 + tx1) // 2, ty1 + 26), ((tx0 + tx1) // 2, elbow_y),
               (620, elbow_y), (620, 1210)], fill=ACCENT, width=7)
    draw.polygon([(620, 1210), (602, 1178), (638, 1178)], fill=ACCENT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT, quality=96)
    print(f"Generated {OUT}")


if __name__ == "__main__":
    main()
