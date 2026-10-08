# © 2026 김용현
# scripts/atlas/overlay.py — 검증 그림: 지도 렌더 위에 도형을 겹친다
#   python -I scripts/atlas/overlay.py <overlay.json>
#   overlay.json: {page, bbox, dpi, out, title, lines:[[[x,y],...]], cps:[{xy, fit}],
#                  areas?:[{color, polygons:[[ring,...],...], pattern?}], points?:[{xy, color}], paths?:[{points, color, width}]}
#                  texts?:[{xy, text, color, anchor?}], fontPx?}
#   (좌표는 모두 지면 pt)
#   지명(build_places --verify): texts 가 있으면 한 칸 그림 — 옅게 깐 교과서 렌더 위에 기호 점·글자 줄(path)·이름.
#   경위도 맞추기(georef-cli --verify): 해안선 = 자홍 선, 기준점 = 빨간 원, 맞춘 위치 = 초록 십자, 둘을 잇는 초록 선 = 잔차
#   주제 레이어(build_layers --verify): areas 가 있으면 두 칸 그림 — 왼쪽 = 원본 위에 분류 경계(검은 선)·기호·선,
#     오른쪽 = 레이어만 분류 색으로 칠한 그림(빗금 분류는 빗금). 두 칸이 같아 보이면 맞은 것.
#   경위도 모드(lonlatExtent:[lon0,lon1,lat0,lat1] 가 있으면, 예: kashmir.py --verify): areas·paths 좌표는 경위도.
#     왼쪽 = 교과서 쪽 렌더 그대로, 오른쪽 = 레이어를 정거 원통(cos 중간 위도 보정)으로 그린 그림.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import pdfkit
from atlas_common import FONT_PATH
from PIL import Image, ImageChops, ImageDraw


def _rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


_fnt = {}
def _font(px=13):
    if px not in _fnt:
        from PIL import ImageFont
        try: _fnt[px] = ImageFont.truetype(FONT_PATH, px)
        except OSError: _fnt[px] = ImageFont.load_default()
    return _fnt[px]


def _draw_layer(img, ov, P, outline_only):
    d = ImageDraw.Draw(img); size = img.size
    for a in ov.get('areas', []):
        col = _rgb(a['color'])
        for poly in a['polygons']:
            ext = [P(p) for p in poly[0]]
            if len(ext) < 3: continue
            if outline_only:
                for r in poly: d.line([P(p) for p in r] + [P(r[0])], fill=(0, 0, 0), width=1)
            else:
                # 구멍은 그 다각형에서만 뺀다(다른 분류를 지우지 않도록 가면으로 칠함)
                mask = Image.new('L', size, 0); md = ImageDraw.Draw(mask)
                md.polygon(ext, fill=255)
                for r in poly[1:]:
                    if len(r) >= 3: md.polygon([P(p) for p in r], fill=0)
                if a.get('pattern') == 'hatch':
                    hatch = Image.new('L', size, 0); hd = ImageDraw.Draw(hatch)
                    for k in range(-size[1], size[0], 6): hd.line([(k, size[1]), (k + size[1], 0)], fill=255, width=1)
                    mask = ImageChops.multiply(mask, hatch)
                img.paste(col, (0, 0), mask); d = ImageDraw.Draw(img)
                if a.get('pattern') == 'hatch': d.line(ext + [ext[0]], fill=col, width=1)
    for L in ov.get('paths', []):
        pts = [P(p) for p in L['points']]
        # width 는 지면 pt(범례 선 굵기) → 화소. 교과서 선과 같은 굵기로 보여야 맞은 것
        if len(pts) > 1: d.line(pts, fill=_rgb(L['color']), width=max(1, int(round(L.get('width', 1) * ov['dpi'] / 72))), joint='curve')
        if pts and not L.get('noEnd'): d.ellipse([pts[-1][0] - 3, pts[-1][1] - 3, pts[-1][0] + 3, pts[-1][1] + 3], outline=_rgb(L['color']), width=2)
        if pts and L.get('label') and not outline_only:
            d.text((pts[0][0] + 3, pts[0][1] - 10) if L.get('labelAt') == 'start' else (pts[-1][0] + 4, pts[-1][1] - 10),
                   L['label'], fill=_rgb(L['color']), font=_font())
    for p in ov.get('points', []):
        x, y = P(p['xy'])
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=_rgb(p['color']), outline=(0, 0, 0), width=1)
    for t in ov.get('texts', []):
        x, y = P(t['xy'])
        d.text((x, y), t['text'], fill=_rgb(t['color']), font=_font(ov.get('fontPx', 13)), anchor=t.get('anchor', 'mm'),
               stroke_width=2, stroke_fill=(255, 255, 255))


def main(path):
    with open(path, encoding='utf-8') as f:
        ov = json.load(f)
    x0, y0 = ov['bbox'][0], ov['bbox'][1]
    _, _, dpi = pdfkit.render_clip(ov['page'], ov['bbox'], ov['dpi'], ov['out'], False)
    s = dpi / 72
    im = Image.open(ov['out']).convert('RGB')
    d = ImageDraw.Draw(im)
    P = lambda p: ((p[0] - x0) * s, (p[1] - y0) * s)
    for L in ov.get('lines', []):
        if len(L) > 1:
            d.line([P(p) for p in L], fill=(255, 0, 200), width=1)
    for c in ov.get('cps', []):
        ax, ay = P(c['xy'])
        d.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(255, 0, 0), width=2)
        if c.get('fit'):
            bx, by = P(c['fit'])
            d.line([ax, ay, bx, by], fill=(0, 160, 0), width=2)
            d.line([bx - 3, by, bx + 3, by], fill=(0, 120, 0), width=1)
            d.line([bx, by - 3, bx, by + 3], fill=(0, 120, 0), width=1)
    if ov.get('lonlatExtent'):
        lon0, lon1, lat0, lat1 = ov['lonlatExtent']
        k = math.cos(math.radians((lat0 + lat1) / 2)); W, H = im.size; pad = 10
        sc = min((W - 2 * pad) / ((lon1 - lon0) * k), (H - 2 * pad) / (lat1 - lat0))
        Q = lambda p: (pad + (p[0] - lon0) * k * sc, pad + (lat1 - p[1]) * sc)
        right = Image.new('RGB', im.size, (255, 255, 255))
        _draw_layer(right, ov, Q, False)
        both = Image.new('RGB', (W * 2 + 6, H), (120, 120, 120))
        both.paste(im, (0, 0)); both.paste(right, (W + 6, 0))
        im = both; d = ImageDraw.Draw(im)
    elif 'texts' in ov:  # 지명: 한 칸(교과서 렌더를 옅게 깔고 그 위에)
        im = Image.blend(im, Image.new('RGB', im.size, (255, 255, 255)), 0.45)
        _draw_layer(im, ov, P, False); d = ImageDraw.Draw(im)
    elif 'areas' in ov or 'points' in ov or 'paths' in ov:
        _draw_layer(im, ov, P, True)
        if ov.get('areas'):
            right = Image.new('RGB', im.size, (255, 255, 255))
        else:  # 점·선만 있는 레이어: 오른쪽에도 교과서 렌더를 옅게 깔아 위치를 맞춰 볼 수 있게
            right = Image.blend(Image.open(ov['out']).convert('RGB'), Image.new('RGB', im.size, (255, 255, 255)), 0.55)
        _draw_layer(right, ov, P, False)
        both = Image.new('RGB', (im.size[0] * 2 + 6, im.size[1]), (120, 120, 120))
        both.paste(im, (0, 0)); both.paste(right, (im.size[0] + 6, 0))
        im = both; d = ImageDraw.Draw(im)
    d.rectangle([0, 0, len(ov['title']) * 6 + 8, 14], fill=(255, 255, 255))
    d.text((4, 2), ov['title'], fill=(0, 0, 0))
    im.save(ov['out'])
    print(ov['out'], im.size)


if __name__ == '__main__':
    main(sys.argv[1])
