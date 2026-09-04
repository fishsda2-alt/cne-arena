"""공유 미리보기용 대표 이미지(assets/og.png)를 다시 만듭니다.

카톡·디스코드에 링크를 올렸을 때 펼쳐지는 그 이미지입니다.
문구나 사이트 주소를 바꿨을 때만 돌리면 됩니다 — 평소에는 필요 없습니다.

  pip install Pillow
  python scripts/make_og.py     (저장소 루트에서)

Windows 기본 글꼴(맑은 고딕)을 씁니다. 다른 OS에서는 글꼴 경로를 고치세요.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG, SURF, BORDER = (13, 16, 23), (23, 28, 38), (43, 53, 71)
TEXT, DIM, ACCENT, GOLD = (232, 236, 244), (147, 160, 184), (79, 140, 255), (213, 165, 74)

F = os.path.join(os.environ["WINDIR"], "Fonts")
bold = lambda n: ImageFont.truetype(os.path.join(F, "malgunbd.ttf"), n)
reg = lambda n: ImageFont.truetype(os.path.join(F, "malgun.ttf"), n)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# 위아래 은은한 띠
d.rectangle([0, 0, W, 8], fill=ACCENT)
d.rectangle([0, H - 3, W, H], fill=BORDER)

# 워드마크
x, y = 90, 150
d.text((x, y), "CHUNGNAM ", font=bold(76), fill=TEXT)
w = d.textlength("CHUNGNAM ", font=bold(76))
d.text((x + w, y), "RANK.GG", font=bold(76), fill=ACCENT)

# 한 줄 설명
d.text((x, y + 110), "충남 아마추어 e스포츠 랭킹", font=bold(44), fill=TEXT)
d.text((x, y + 178), "등록하면 솔로랭크 티어가 매일 자동으로 집계됩니다.", font=reg(30), fill=DIM)

# 아래쪽 배지들
bx, by = x, y + 262
for label, color in (("리그 오브 레전드", ACCENT), ("발로란트 준비 중", (255, 70, 85)), ("★ 프로 지망", GOLD)):
    tw = d.textlength(label, font=reg(26))
    d.rounded_rectangle([bx, by, bx + tw + 44, by + 54], radius=27, fill=SURF, outline=BORDER, width=2)
    d.ellipse([bx + 20, by + 22, bx + 30, by + 32], fill=color)
    d.text((bx + 38, by + 12), label, font=reg(26), fill=DIM)
    bx += tw + 64

d.text((x, H - 92), "fishsda2-alt.github.io/cne-arena", font=reg(26), fill=DIM)

img.save("assets/og.png", optimize=True)
print(f"assets/og.png  {W}x{H}  {os.path.getsize('assets/og.png') // 1024}KB")
