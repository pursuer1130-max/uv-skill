from PIL import Image, ImageDraw, ImageFont
import math
import os


DPIS = [300, 600, 720, 1200]


def main():
    out = os.path.join(os.path.expanduser("~"), "Desktop", "PS高DPI测试")
    os.makedirs(out, exist_ok=True)
    for dpi in DPIS:
        n = round(60 / 25.4 * dpi)
        cx = cy = n // 2
        img = Image.new("RGB", (n, n), (28, 30, 32))
        d = ImageDraw.Draw(img)
        for y in range(n):
            c = 28 + int(18 * y / n)
            d.line((0, y, n, y), fill=(c, c + 2, c + 5))
        for frac, col in [(0.43, (182, 126, 28)), (0.37, (246, 202, 82)), (0.30, (50, 48, 45)), (0.25, (216, 161, 42))]:
            r = int(n * frac)
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
        for i in range(36):
            a = i * math.tau / 36
            x = cx + math.cos(a) * n * 0.335
            y = cy + math.sin(a) * n * 0.335
            rr = max(4, int(n * 0.012))
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(255, 221, 113))
        f1 = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", max(18, int(n * 0.075)))
        f2 = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", max(10, int(n * 0.032)))
        for text, font, yf in [(f"{dpi} DPI", f2, 0.39), ("高清测试", f1, 0.47), ("UV PRINT", f2, 0.59)]:
            box = d.textbbox((0, 0), text, font=font)
            x = cx - (box[2] - box[0]) / 2
            y = n * yf
            d.text((x + max(2, n * 0.003), y + max(2, n * 0.004)), text, font=font, fill=(35, 20, 3))
            d.text((x - max(1, n * 0.002), y - max(1, n * 0.002)), text, font=font, fill=(255, 239, 170))
            d.text((x, y), text, font=font, fill=(92, 56, 8))
        img.save(os.path.join(out, f"高DPI测试_{dpi}dpi.png"), dpi=(dpi, dpi))
        img.save(os.path.join(out, f"高DPI测试_{dpi}dpi_RGB.tif"), dpi=(dpi, dpi), compression="raw")
    with open(os.path.join(out, "DPI说明.txt"), "w", encoding="utf-8") as f:
        f.write("本次高DPI档位：300、600、720、1200 dpi。\n")
        f.write("300 dpi：常规UV图案。\n600 dpi：精细包装/文创。\n720 dpi：贴近部分UV RIP常见高精模式。\n1200 dpi：小幅面精细纹理测试，文件会明显变大。\n")
    print(out)


if __name__ == "__main__":
    main()
