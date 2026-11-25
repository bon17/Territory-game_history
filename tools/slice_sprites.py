"""스프라이트 시트(가로 COLS × 세로 ROWS 격자)를 아이콘 PNG 여러 장으로 자른다.

사용법:
  python3 tools/slice_sprites.py 시트.png icons
  python3 tools/slice_sprites.py 시트.png characters

- 배경이 투명하지 않으면 테두리 색(예: 초록 #00FF00)을 배경으로 보고 지운다.
- 칸마다 그림이 있는 부분만 남기고 정사각형으로 맞춰 images/ 에 저장한다.
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image

PRESETS = {
    'icons': (3, 3, ['coin', 'sack', 'chest', 'wall', 'flag', 'crown', 'letter', 'star', 'hourglass']),
    'characters': (3, 2, ['team1', 'team2', 'team3', 'team4', 'team5', 'team6']),
    'decor': (3, 2, ['deco_palm', 'deco_rocks', 'deco_ship', 'deco_shells', 'deco_gull', 'deco_lighthouse']),
}
OUT = Path(__file__).resolve().parent.parent / 'images'


def remove_background(img, tol=60):
    """투명 배경이 아니면, 가장자리에서 이어진 배경색 영역을 지운다(흰 깃발 같은 안쪽 흰색은 보존)."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(c[3] < 10 for c in corners):
        return img  # 이미 투명
    bg = max(set(corners), key=corners.count)

    def near(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol

    seen = bytearray(w * h)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return img


def save_square(art, name):
    """그림 부분만 남겨 정사각형(최대 512px) PNG로 저장."""
    box = art.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
    if not box:
        print(f'{name}: 그림이 비어 있어 건너뜀')
        return
    art = art.crop(box)
    side = int(max(art.size) * 1.04)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    if side > 512:
        square = square.resize((512, 512), Image.LANCZOS)
    OUT.mkdir(exist_ok=True)
    square.save(OUT / f'{name}.png', optimize=True)
    print(f'{name}.png 저장 ({square.width}px)')


def main():
    # 한 장짜리: python3 tools/slice_sprites.py 그림.webp single team5
    if len(sys.argv) == 4 and sys.argv[2] == 'single':
        save_square(remove_background(Image.open(sys.argv[1])), sys.argv[3])
        return
    if len(sys.argv) < 3 or sys.argv[2] not in PRESETS:
        print(__doc__)
        sys.exit(1)
    cols, rows, names = PRESETS[sys.argv[2]]
    sheet = remove_background(Image.open(sys.argv[1]))
    W, H = sheet.size
    cw, ch = W / cols, H / rows
    OUT.mkdir(exist_ok=True)
    for i, name in enumerate(names):
        r, c = divmod(i, cols)
        cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        box = cell.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        if not box:
            print(f'{name}: 빈 칸이라 건너뜀')
            continue
        art = cell.crop(box)
        side = int(max(art.size) * 1.08)
        square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
        if side > 512:
            square = square.resize((512, 512), Image.LANCZOS)
        square.save(OUT / f'{name}.png')
        print(f'{name}.png 저장 ({square.width}px)')


if __name__ == '__main__':
    main()
