"""把 NASA 原始影像处理成游戏内联用的贴图（只需运行一次，产物入库）。

依赖：Pillow（pip install pillow）
用法：python scripts/prep-textures.py <Mars.jpg 路径> <world.topo.bathy...5400x2700.jpg 路径>

素材来源（均为公有领域）：
- 火星：NASA 3D Resources「Mars」贴图（Viking 影像，USGS 处理），NASA/JPL-Caltech
  https://science.nasa.gov/3d-resources/mars
- 地球：NASA Earth Observatory「Blue Marble: Next Generation」2004 年 12 月，地形与海底地形版
  https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry
"""
import sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'textures'


def save(img: Image.Image, name: str, width: int) -> None:
    if img.width > width:
        img = img.resize((width, width // 2), Image.LANCZOS)
    path = OUT / name
    img.convert('RGB').save(path, 'JPEG', quality=85, optimize=True, progressive=True)
    print(f'{path.name}: {img.width}x{img.height}, {path.stat().st_size / 1024:.0f} KB')


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    save(Image.open(sys.argv[1]), 'mars.jpg', 4096)
    save(Image.open(sys.argv[2]), 'earth.jpg', 4096)


if __name__ == '__main__':
    main()
