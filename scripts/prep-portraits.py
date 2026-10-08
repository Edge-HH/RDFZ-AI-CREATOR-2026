"""把生成头像整理为 64×64、最多 24 色的像素画，再最近邻放大到 256×256。

依赖：Pillow。原图目录中应有 qin.png、lin.png 等以角色编号命名的图片。
用法：python scripts/prep-portraits.py <原图目录> [输出目录]
默认输出到 src/assets/portraits；拒绝覆盖已有文件，原图保持不变。
"""
import argparse
from pathlib import Path

from PIL import Image


SPEAKERS = ('qin', 'lin', 'amara', 'andrei', 'rin', 'zhou', 'capcom', 'you')
DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'portraits'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path, nargs='?', default=DEFAULT_OUT)
    args = parser.parse_args()
    # 写入前检查全组，避免缺失原图或覆盖旧稿导致只处理了一半。
    for speaker in SPEAKERS:
        source = args.source / f'{speaker}.png'
        target = args.output / f'{speaker}.png'
        if not source.is_file():
            parser.error(f'缺少原图：{source}')
        if target.exists():
            parser.error(f'目标已存在，请使用新的输出目录：{target}')
        with Image.open(source) as image:
            if image.width != image.height:
                parser.error(f'头像须为正方形：{source}')
    args.output.mkdir(parents=True, exist_ok=True)
    for speaker in SPEAKERS:
        with Image.open(args.source / f'{speaker}.png') as image:
            # 最近邻保留硬边；禁用抖动，避免小尺寸五官被噪点干扰。
            pixels = image.convert('RGB').resize((64, 64), Image.Resampling.NEAREST)
            pixels = pixels.quantize(colors=24, dither=Image.Dither.NONE)
            portrait = pixels.resize((256, 256), Image.Resampling.NEAREST)
            target = args.output / f'{speaker}.png'
            portrait.save(target, 'PNG', optimize=True)
            print(f'{target.name}: 256x256, {len(portrait.getcolors())} colors, {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
