"""흰 타일 그림 한 장으로 색깔별 땅 타일을 만든다.

사용법: python3 tools/make_tiles.py 타일.webp
결과: images/tile_empty.png, tile_treasure.png, tile_fort.png, tile_t1.png ~ tile_t6.png
"""
import sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'images'
COLORS = {
    'empty': '#FFF3D6', 'treasure': '#FFE070', 'fort': '#D3D7E2',
    't1': '#F2708A', 't2': '#4FA8EE', 't3': '#33C39B', 't4': '#9A82E8', 't5': '#F5962F', 't6': '#E2BA12',
}
WIDTH = 200


def main():
    src = Image.open(sys.argv[1]).convert('RGBA')
    src = src.crop(src.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox())
    src = src.resize((WIDTH, round(src.height * WIDTH / src.width)), Image.LANCZOS)
    # 윗면의 분홍빛을 빼서 순수한 흰색 기준으로 맞춘다(밝은 부분만)
    ref = (255, 234, 253)
    px = src.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            if r + g + b > 600:
                px[x, y] = (min(255, round(r * 255 / ref[0])), min(255, round(g * 255 / ref[1])), min(255, round(b * 255 / ref[2])), a)
    OUT.mkdir(exist_ok=True)
    for name, hexc in COLORS.items():
        c = tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))
        im = src.copy()
        p = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = p[x, y]
                p[x, y] = (r * c[0] // 255, g * c[1] // 255, b * c[2] // 255, a)
        im.save(OUT / f'tile_{name}.png', optimize=True)
    print(f'타일 {len(COLORS)}종 저장 ({src.width}x{src.height})')


if __name__ == '__main__':
    main()
