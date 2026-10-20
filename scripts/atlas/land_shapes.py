# © 2026 김용현
# scripts/atlas/land_shapes.py
"""지도 틀 안 육지·물 도형(섬·호수)을 지면 pt 로 뽑는다 — 경위선 눈금이 없는 지도의 기준점(shape_controls.mjs)용.

쓰는 곳: 단원 지도 목록(maps_<id>.json) 항목의 "shapes" 설정
  {"mode": "vector", "land": ["#d1d3d4", …]}   육지 = 그 색 채움 도형들의 합
  {"mode": "vector", "sea": ["#ffffff"]}       육지 = 틀 − 바다 덮개(그 색 채움 중 지도 틀과 가장 많이 겹치는 도형 하나 —
                                               래스터 위에 바다를 흰색으로 덮은 지도. 한 쪽에 지도가 여럿이면 덮개도 여럿이라 하나만 고른다)
  {"mode": "raster", "dpi": 150, "seaBMinusR": 3}
                                               육지 = 래스터만 렌더(images_only)해서 파랑 − 빨강 > seaBMinusR 가 아닌 화소
                                               (자연색 화상: 바다·호수는 푸르고 육지는 초록·갈색. 눈 덮인 산은 구멍이 되지만 섬 중심은 바깥 고리로 잼)
  {"mode": "raster", "dpi": 200, "seaWhite": 240}
                                               (선택) 바다가 흰 바탕인 래스터(38쪽 태양광 세계 지도 — 파란 분류가 땅에 있어 파랑 − 빨강 규칙을 못 씀):
                                               세 값이 모두 seaWhite 이상인 화소만 바다, 나머지는 육지. 있으면 seaBMinusR 대신 쓴다
  "render": "all"                              (선택, raster 모드) 래스터만이 아니라 쪽 전체(벡터·글자 포함)를 렌더 — 땅 채움 없이 줄무늬 선만으로
                                               칠한 나라가 있는 벡터 지도(38쪽 언어: 공용어 둘 이상인 나라는 클립한 굵은 선 줄무늬)를 seaWhite 로 가를 때.
                                               글자·축척 막대도 땅이 되므로 덮개 상자·minAreaPt2 로 거른다
  "lake": [색…]                                (선택) 호수 채움 색 — 물 도형에 더함
  "minAreaPt2": 1.0                            이보다 작은 도형은 버림
  "minThicknessPt": 1.0                        (선택) 육지 색 채움 중 이보다 얇은 그리기(2·넓이/둘레, 경위선을 면으로 그린 것)는 뺀다
  "openPt": 0.5                                (선택) 육지를 이만큼 줄였다 되살림(열림) — 바다를 가로지르는 가는 채움(경위선을 면으로 그린 것)이
                                               섬과 대륙을 잇지 않게. 섬 넓이·중심은 거의 그대로(가장자리만 둥글어짐)
  덮개 상자(legendBbox·cartoucheBbox·insetBbox·locatorBbox)는 틀에서 뺀다(atlas_common.frame).

출력 $ATLAS_WORK/vec/<id>.shapes.json
  {id, page, mode, shapes: [{kind: 'land'|'water', area, c: [x, y], edge, compact, ring: [[x, y], …]}]}
  - land 의 c·ring 은 구멍을 메운 바깥 고리 기준(섬 안 호수·눈 구멍이 중심을 흔들지 않게). water = 육지 구멍(호수·닫힌 바다) + lake 색.
  - edge = 틀(덮개 상자 경계 포함)에 0.75pt 안으로 닿음 — 잘린 도형이라 중심을 쓸 수 없다.
  - compact = 4πA/P²(원 1, 가늘수록 0 — 강을 호수로 착각하지 않게 shape_controls 가 거른다).
  확인 그림(--png): 단원 작업 폴더 shapes/<id>.png — 교과서 렌더 위에 도형 윤곽(빨강 육지·파랑 물·회색 잘림)과 번호.

CLI
  python -I scripts/atlas/land_shapes.py [--unit u3] <지도 id …|all> [--png]
"""
import json, math, os, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, box, shape as to_shape
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdfkit
from atlas_common import WORK, FONT_PATH, maps, hexc, drawings, drawing_geom, flat_polygons, polygonal, frame, unit_work

EDGE_PT = 0.75      # 틀에 이만큼 가까우면 잘린 도형
SIMPLIFY_PT = 0.15  # 저장할 고리 단순화(중심·넓이는 단순화 전에 잰다)


def _overlap(r, b):
    return max(0.0, min(r.x1, b[2]) - max(r.x0, b[0])) * max(0.0, min(r.y1, b[3]) - max(r.y0, b[1]))


def _fills(page, bbox, cols, min_thick=0.0):
    """그 색 채움 도형들(지도 bbox 와 겹치는 것) → [(그리기, 면)]. min_thick(pt)보다 얇은 도형(2·넓이/둘레 — 선을 면으로 그린 것)은 뺀다."""
    out = []
    for d in drawings(page):
        f = d.get('fill')
        if not f or hexc(f) not in cols: continue
        r = d['rect']
        if r.x1 < bbox[0] or r.x0 > bbox[2] or r.y1 < bbox[1] or r.y0 > bbox[3]: continue
        g = drawing_geom(d)
        if g is None: continue
        if min_thick > 0 and 2 * g.area / max(g.length, 1e-9) < min_thick: continue
        out.append((d, g))
    return out


def _raster_land(m, cfg):
    """래스터만 렌더 → 육지 가면 → 면(지면 pt)."""
    from PIL import Image
    import rasterio.features
    dpi = cfg.get('dpi', 150)
    tmp_dir = unit_work('shapes'); os.makedirs(tmp_dir, exist_ok=True)
    tmp = f"{tmp_dir}/{m['id']}.raster.png"
    render = cfg.get('render', 'images')
    if render not in ('images', 'all'): raise ValueError(f"{m['id']}: shapes.render 는 'images' 또는 'all' (받은 값 {render!r})")
    pdfkit.render_clip(m['page'], m['bbox'], dpi, tmp, images_only=render != 'all')
    im = np.asarray(Image.open(tmp).convert('RGB')).astype(int)
    if cfg.get('seaWhite') is not None: land = ~(im.min(axis=2) >= cfg['seaWhite'])   # 흰 바탕 바다(세계 래스터 — 파란 분류가 땅에 있음)
    else: land = ~((im[..., 2] - im[..., 0]) > cfg.get('seaBMinusR', 3))
    k = 72.0 / dpi; x0, y0 = m['bbox'][0], m['bbox'][1]
    polys = []
    for geom, val in rasterio.features.shapes(land.astype(np.uint8), mask=land, connectivity=8):
        if val != 1: continue
        g = to_shape(geom)
        polys.append(shapely.affinity.affine_transform(g, [k, 0, 0, k, x0, y0]))
    return unary_union(polys) if polys else None


def land_geometry(m):
    """지도 항목 → (육지 면, 호수 면|None, 틀 면). 좌표 = 지면 pt."""
    cfg = m['shapes']; fr = frame(m); bbox = m['bbox']; mode = cfg.get('mode', 'vector')
    if mode == 'raster':
        L = _raster_land(m, cfg)
    elif cfg.get('sea'):
        cand = _fills(m['page'], bbox, set(cfg['sea']))
        if not cand: raise ValueError(f"{m['id']}: 바다 덮개 색 {cfg['sea']} 채움 없음")
        d, g = max(cand, key=lambda t: _overlap(t[0]['rect'], bbox))
        L = fr.difference(g.buffer(0))
    else:
        gs = [g.buffer(0) for _, g in _fills(m['page'], bbox, set(cfg['land']), cfg.get('minThicknessPt', 0.0))]
        if not gs: raise ValueError(f"{m['id']}: 육지 색 {cfg['land']} 채움 없음")
        L = unary_union(gs)
    L = polygonal(L.intersection(fr)) if L is not None else None
    r = cfg.get('openPt', 0)
    if L is not None and r > 0: L = polygonal(L.buffer(-r).buffer(r))
    W = None
    if cfg.get('lake'):
        gs = [g.buffer(0) for _, g in _fills(m['page'], bbox, set(cfg['lake']))]
        W = polygonal(unary_union(gs).intersection(fr)) if gs else None
    return L, W, fr


def _entry(kind, p, edge_line):
    P = Polygon(p.exterior) if kind == 'land' else p
    c = P.centroid; per = P.exterior.length
    ring = [[round(x, 2), round(y, 2)] for x, y in P.exterior.simplify(SIMPLIFY_PT).coords]
    return {'kind': kind, 'area': round(P.area, 3), 'c': [round(c.x, 3), round(c.y, 3)],
            'edge': bool(P.exterior.distance(edge_line) < EDGE_PT), 'compact': round(4 * math.pi * P.area / (per * per), 3) if per else 0,
            'ring': ring}


def shapes(map_id):
    """지도 id → 도형 목록(넓이 큰 순)."""
    m = maps()[map_id]
    if 'shapes' not in m: raise KeyError(f'{map_id}: 지도 목록에 shapes 설정 없음')
    L, W, fr = land_geometry(m)
    min_a = m['shapes'].get('minAreaPt2', 1.0)
    edge_line = fr.boundary
    out = []
    for p in flat_polygons(L):
        if Polygon(p.exterior).area >= min_a: out.append(_entry('land', p, edge_line))
        for h in p.interiors:
            hp = Polygon(h)
            if hp.area >= min_a: out.append(_entry('water', hp, edge_line))
    for p in flat_polygons(W):
        if p.area >= min_a: out.append(_entry('water', Polygon(p.exterior), edge_line))
    out.sort(key=lambda s: -s['area'])
    return {'id': map_id, 'page': m['page'], 'mode': m['shapes'].get('mode', 'vector'), 'shapes': out}


def draw(res, out_png, dpi=150):
    """확인 그림: 교과서 렌더 위에 도형 윤곽과 번호(잘린 도형은 회색, 번호 없음)."""
    from PIL import Image, ImageDraw, ImageFont
    m = maps()[res['id']]; b = m['bbox']
    pdfkit.render_clip(m['page'], b, dpi, out_png)
    im = Image.open(out_png).convert('RGB'); dr = ImageDraw.Draw(im); k = dpi / 72
    try: font = ImageFont.truetype(FONT_PATH, 12)
    except OSError: font = ImageFont.load_default()
    P = lambda x, y: ((x - b[0]) * k, (y - b[1]) * k)
    for s in res['shapes']:
        col = (150, 150, 150) if s['edge'] else (220, 0, 0) if s['kind'] == 'land' else (0, 70, 230)
        dr.line([P(*xy) for xy in s['ring']], fill=col, width=1)
    for i, s in enumerate(res['shapes']):
        if s['edge']: continue
        x, y = P(*s['c'])
        dr.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 0, 255))
        dr.text((x + 2, y - 7), str(i), fill=(0, 0, 0), font=font, stroke_width=2, stroke_fill=(255, 255, 255))
    im.save(out_png)


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    png = '--png' in argv
    ids = [a for a in argv if not a.startswith('--')]
    if not ids: print(__doc__); return 2
    if ids == ['all']: ids = [k for k, m in maps().items() if 'shapes' in m]
    os.makedirs(os.path.join(WORK, 'vec'), exist_ok=True)
    for mid in ids:
        res = shapes(mid)
        with open(os.path.join(WORK, 'vec', f'{mid}.shapes.json'), 'w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False)
        s = res['shapes']
        print(f"{mid:22s} 도형 {len(s):4d} (육지 {sum(x['kind'] == 'land' for x in s)} · 물 {sum(x['kind'] == 'water' for x in s)} · 잘림 {sum(x['edge'] for x in s)})")
        if png:
            d = unit_work('shapes'); os.makedirs(d, exist_ok=True)
            draw(res, f'{d}/{mid}.png')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
