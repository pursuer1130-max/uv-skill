from PIL import Image, ImageDraw, ImageFont
import math
import os


def main():
    out = os.path.join(os.path.expanduser("~"), "Desktop", "PS光油测试")
    os.makedirs(out, exist_ok=True)
    n = 1800
    cx = cy = n // 2
    img = Image.new("RGB", (n, n), (28, 30, 32))
    d = ImageDraw.Draw(img)
    for y in range(n):
        c = 28 + int(16 * y / n)
        d.line((0, y, n, y), fill=(c, c + 2, c + 5))
    for r, col in [(690, (178, 128, 34)), (620, (231, 188, 82)), (500, (48, 48, 48)), (440, (210, 158, 45))]:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
    for i in range(48):
        a = i * math.tau / 48
        x, y = cx + math.cos(a) * 560, cy + math.sin(a) * 560
        d.ellipse((x - 20, y - 20, x + 20, y + 20), fill=(255, 218, 112))

    varnish = Image.new("L", (n, n), 0)
    vd = ImageDraw.Draw(varnish)
    vd.ellipse((cx - 650, cy - 650, cx + 650, cy + 650), outline=210, width=50)
    vd.ellipse((cx - 430, cy - 430, cx + 430, cy + 430), fill=120)
    vd.arc((cx - 500, cy - 520, cx + 500, cy + 260), 200, 335, fill=255, width=42)
    font_cn = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 150)
    font_en = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 58)
    for text, font, y in [("局部光油", font_cn, 780), ("SPOT VARNISH", font_en, 965)]:
        box = vd.textbbox((0, 0), text, font=font)
        vd.text((cx - (box[2] - box[0]) / 2, y), text, font=font, fill=255)
        box = d.textbbox((0, 0), text, font=font)
        d.text((cx - (box[2] - box[0]) / 2 + 5, y + 7), text, font=font, fill=(25, 16, 4))
        d.text((cx - (box[2] - box[0]) / 2 - 4, y - 5), text, font=font, fill=(255, 239, 165))
        d.text((cx - (box[2] - box[0]) / 2, y), text, font=font, fill=(90, 55, 10))

    mask = Image.new("L", (n, n), 255)
    mask.paste(0, mask=varnish.point(lambda p: 255 if p > 10 else 0))
    img.save(os.path.join(out, "局部光油效果预览.png"))
    img.save(os.path.join(out, "局部光油打印RGB.tif"), dpi=(300, 300), compression="raw")
    mask.save(os.path.join(out, "VARNISH_MASK_黑色为光油.tif"), dpi=(300, 300), compression="raw")
    print(out)


if __name__ == "__main__":
    main()
