# © 2026 김용현
# scripts/atlas/regress_png.py — regress_u2.mjs 의 화소 비교 도우미(G0).
#   python -I scripts/atlas/regress_png.py <짝 목록.json>
#   짝 목록 = [{"name": 장면, "a": 기준선 png, "b": 새 png}, …] → 표준 출력 JSON {장면: {"diff": 다른 화소 수, "bbox": [x0,y0,x1,y1]|null, "size": [w,h]|null, "error"?: 글}}
#   다른 화소 = RGBA 네 값 중 하나라도 다른 화소(ImageChops.difference 의 getbbox 로 상자, numpy 로 수).
import json, os, sys

from PIL import Image, ImageChops
import numpy as np


def compare(a, b):
    if not os.path.exists(a): return {'diff': None, 'bbox': None, 'size': None, 'error': f'기준선 없음 {a}'}
    if not os.path.exists(b): return {'diff': None, 'bbox': None, 'size': None, 'error': f'새 캡처 없음 {b}'}
    ia, ib = Image.open(a).convert('RGBA'), Image.open(b).convert('RGBA')
    if ia.size != ib.size: return {'diff': None, 'bbox': None, 'size': [list(ia.size), list(ib.size)], 'error': '크기 다름'}
    d = ImageChops.difference(ia, ib)
    box = d.getbbox()
    n = int(np.count_nonzero(np.asarray(d).max(axis=2))) if box else 0
    return {'diff': n, 'bbox': list(box) if box else None, 'size': list(ia.size)}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    with open(sys.argv[1], encoding='utf-8') as f:
        pairs = json.load(f)
    print(json.dumps({p['name']: compare(p['a'], p['b']) for p in pairs}, ensure_ascii=False))


if __name__ == '__main__':
    main()
