# © 2026 김용현
# scripts/atlas/overlay.py — 경위도 맞추기 검증 그림: 지도 렌더 위에 해안선·기준점을 겹친다(georef-cli.mjs --verify 가 부름)
#   python -I scripts/atlas/overlay.py <overlay.json>
#   overlay.json: {page, bbox, dpi, out, title, lines:[[[x,y],...]], cps:[{xy, fit}]}  (좌표는 지면 pt)
#   해안선 = 자홍 선, 기준점 = 빨간 원, 맞춘 위치 = 초록 십자, 둘을 잇는 초록 선 = 잔차
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdfkit
from PIL import Image, ImageDraw


def main(path):
    with open(path, encoding='utf-8') as f:
        ov = json.load(f)
    x0, y0 = ov['bbox'][0], ov['bbox'][1]
    _, _, dpi = pdfkit.render_clip(ov['page'], ov['bbox'], ov['dpi'], ov['out'], False)
    s = dpi / 72
    im = Image.open(ov['out']).convert('RGB')
    d = ImageDraw.Draw(im)
    P = lambda p: ((p[0] - x0) * s, (p[1] - y0) * s)
    for L in ov['lines']:
        if len(L) > 1:
            d.line([P(p) for p in L], fill=(255, 0, 200), width=1)
    for c in ov['cps']:
        ax, ay = P(c['xy'])
        d.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(255, 0, 0), width=2)
        if c.get('fit'):
            bx, by = P(c['fit'])
            d.line([ax, ay, bx, by], fill=(0, 160, 0), width=2)
            d.line([bx - 3, by, bx + 3, by], fill=(0, 120, 0), width=1)
            d.line([bx, by - 3, bx, by + 3], fill=(0, 120, 0), width=1)
    d.rectangle([0, 0, len(ov['title']) * 6 + 8, 14], fill=(255, 255, 255))
    d.text((4, 2), ov['title'], fill=(0, 0, 0))
    im.save(ov['out'])
    print(ov['out'], im.size)


if __name__ == '__main__':
    main(sys.argv[1])
