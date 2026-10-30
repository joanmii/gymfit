"""
Genera los iconos de la app en la carpeta icons/.

Uso:
    pip install pillow
    python tools/make_icons.py

Cambia los colores de abajo si quieres otro estilo.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

TOP_COLOR = (52, 230, 110)      # verde claro
BOTTOM_COLOR = (10, 150, 120)   # verde azulado
SIZE = 1024

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)


def gradient(size, top, bottom):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def dumbbell(size):
    """Mancuerna blanca inclinada con una sombra suave."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size / 2
    white = (255, 255, 255, 255)
    # barra
    d.rounded_rectangle([c - 200, c - 34, c + 200, c + 34], radius=34, fill=white)
    # discos (grande + pequeño a cada lado, con un hueco entre ellos)
    for side in (-1, 1):
        x_big = c + side * 195
        x_small = c + side * 300
        d.rounded_rectangle([x_big - 52, c - 205, x_big + 52, c + 205], radius=46, fill=white)
        d.rounded_rectangle([x_small - 36, c - 135, x_small + 36, c + 135], radius=34, fill=white)
    layer = layer.rotate(-35, resample=Image.BICUBIC, center=(c, c))

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow.paste((0, 60, 40, 110), mask=layer.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(28)).transform(
        (size, size), Image.AFFINE, (1, 0, 0, 0, 1, -22))
    return shadow, layer


def main():
    base = gradient(SIZE, TOP_COLOR, BOTTOM_COLOR).convert("RGBA")
    shadow, fg = dumbbell(SIZE)
    base.alpha_composite(shadow)
    base.alpha_composite(fg)
    icon = base.convert("RGB")

    for name, px in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)]:
        icon.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)
        print("✓", OUT / name)


if __name__ == "__main__":
    main()
