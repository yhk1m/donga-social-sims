# © 2026 김용현
# scripts/atlas/features.py
"""주제도 내용 뽑기(지면 pt 좌표): 범례 분류, 분류별 면, 점 기호, 흐름선·등온선.
extract_vectors.py --features <id|all> 이 부른다. 결과: $ATLAS_WORK/vec/<id>.features.json

  {id, page, bbox, legend:[{cls,color,label,kind,pattern?}],
   polys:[{cls,color,label,pattern?,polygons:[[바깥 고리, 구멍...], ...]}],
   symbols:[{xy,cls,kind,color,size,label?,value?}],
   lines:[{points,cls,kind,color,width?,value?,dir?,label?}],
   report:{...}}

면 만드는 방법(지도마다 CONFIG 의 mode)
  - vector: 지도 bbox 안 채움 도형 중 범례 색(같은 색 또는 ΔE ≤ MATCH_DE)인 것. 그리는 순서대로 덮어쓰므로
    뒤에 그린 다른 분류 도형에 가려진 부분은 뺀다(화가 알고리즘). 분류별로 합친다(인쇄 조각·타일 합치기).
  - raster: 이미지만 렌더(글자·벡터 지움)한 뒤 화소를 가장 가까운 범례 색(Lab ΔE ≤ RASTER_DE)으로 나누고,
    흰 바다(얇은 타일 이음매는 열림 연산으로 지움)를 뺀 육지의 미분류 화소는 가장 가까운 분류로 채우고,
    작은 얼룩(SIEVE_PX)을 없앤 뒤 다각형으로 바꾼다.
  공통: 지도 틀(bbox)로 자르고, 해안선 어긋남 틈을 메우려고 분류 면을 빈 곳(바다)으로 GROW_PT 만큼 넓힌다
  (경위도로 바꾼 뒤 Natural Earth 육지로 다시 자르므로 바다로 나간 부분은 사라진다).
"""
import json, os, re, sys, colorsys
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
from extract_vectors import maps, WORK, _bez

MATCH_DE = 6.0       # 벡터 채움색 ↔ 범례색 허용 ΔE(CIE76)
RASTER_DE = 16.0     # 래스터 화소 ↔ 범례색 허용 ΔE
WHITE_DE = 6.0       # 이만큼 흰색에 가까우면 바다(빈 곳)
SIEVE_PX = 8         # 이보다 작은 래스터 얼룩은 이웃 분류에 흡수
GROW_PT = 1.0        # 분류 면을 빈 곳으로 넓히는 폭
SLIVER_PT2 = 0.3     # 이보다 작은 조각은 버림(지면 pt²)
DENSIFY_PT = 2.0     # 경위도 변환 전에 긴 변을 이 간격으로 나눈다

CONFIG = {
    'p21-climate': {'mode': 'raster', 'dpi': 150,
                    'hatch': {'stroke': '#ba703d', 'swatch': [132.2, 424.0, 143.2, 430.2], 'color': '#ba703d'}},
    'p21-jan': {'mode': 'raster', 'dpi': 150, 'isotherm': '#ed1064'},
    'p21-jul': {'mode': 'raster', 'dpi': 150, 'isotherm': '#ed1064'},
    'p22-religion': {'mode': 'vector'},
    # 중국 면 #ffe4b9 는 범례에 없는 색(ΔE 9.0 '0~0.5' / 9.6 '0.5~1.0' 로 애매). 중국 2021 증가율 약 0.1% → '0~0.5'
    'p23-growth': {'mode': 'vector', 'aliases': {'#ffe4b9': '#f5eeba'}},
    'p24-exports': {'mode': 'vector'},
    'p24-trade': {'mode': 'vector', 'legendOrder': 'rows', 'legendSkip': ['#0066b3', '#ed0c6e'], 'flows': {
        'hub': [297.4, 600.0],   # 서울 부근(흐름선이 모이는 곳)
        'legendStrokes': {'수입': '#0066b3', '수출': '#ed0c6e'},
        'import': ['#0066a6', '#0066b3', '#00656e', '#056543', '#006557', '#006579', '#00649f', '#00669b',
                   '#00668f', '#00636d', '#333376'],
        'export': ['#ed0f67', '#9e2d33', '#b72749', '#af2a3c', '#ed1844', '#dd1767', '#333376'],
        # 상대국 끝점(지면 pt): 수출 = 화살촉 끝, 수입 = 꼬리 끝. 400dpi 확대 화면과 골격 끝점에서 읽음.
        # 짙은 초록·짙은 빨강 화살표는 따로 된 범례가 아니라 초록 나라 위에 겹친 수입(파랑)·수출(빨강)이다.
        'partners': {
            'import': [('중국', [288.8, 591.7]), ('미국', [411.3, 592.8]), ('일본', [304.9, 602.7]),
                       ('오스트레일리아', [300.8, 654.7]), ('사우디아라비아', [231.8, 615.0]), ('타이완', [290.9, 612.1]),
                       ('독일', [193.7, 586.1]), ('베트남', [276.3, 616.6]), ('카타르', [229.4, 611.4]),
                       ('인도네시아', [281.9, 641.3])],
            'export': [('중국', [277.9, 603.1]), ('미국', [401.2, 598.2]), ('베트남', [280.1, 621.3]),
                       ('일본', [306.3, 601.3]), ('홍콩', [284.6, 613.4]), ('타이완', [291.8, 613.3]),
                       ('싱가포르', [277.3, 632.1]), ('인도', [253.9, 613.3]), ('오스트레일리아', [302.7, 655.1]),
                       ('멕시코', [411.8, 614.2])],
        },
    }},
    'p24-resources': {'mode': 'symbols', 'glyphMax': 6.0},
    'p22-singapore': {'mode': 'symbols', 'glyphMax': 4.5, 'leaders': {'stroke': '#231f20', 'width': 0.3}},
    'p23-density': {'mode': 'density-markers', 'color': '#0072bc', 'out': 'p23-density-cities'},
}


# ── 색 ──────────────────────────────────────────────────────────────────
def hexc(c):
    return None if c is None else '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c[:3])


def hex_rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def lab(rgb):
    """sRGB(0–255, 마지막 축 3) → CIE Lab(D65)."""
    c = np.asarray(rgb, float) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def delta_e(h1, h2):
    return float(np.linalg.norm(lab(hex_rgb(h1)) - lab(hex_rgb(h2))))


def match_color(h, legend, max_de=MATCH_DE):
    """채움색 → 범례 항목(같은 색 우선, 아니면 가장 가까운 ΔE ≤ max_de) 또는 None."""
    best, bd = None, max_de
    for e in legend:
        if e['color'] == h: return e
        d = delta_e(h, e['color'])
        if d <= bd: best, bd = e, d
    return best


# ── 도형 ────────────────────────────────────────────────────────────────
def rings(d, steps=8):
    """그리기 항목 → 닫힌 고리 점 배열 목록(곡선은 steps 등분, 're'·'qu' 포함)."""
    out, cur, last = [], [], None
    def flush():
        if len(cur) >= 3: out.append(np.array(cur))
    for it in d['items']:
        op = it[0]
        if op == 're':
            flush(); cur, last = [], None
            r = it[1]; out.append(np.array([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]])); continue
        if op == 'qu':
            flush(); cur, last = [], None
            q = it[1]; out.append(np.array([[p.x, p.y] for p in (q.ul, q.ur, q.lr, q.ll)])); continue
        if op == 'l': a, b = it[1], it[2]
        elif op == 'c': a, b = it[1], it[4]
        else: continue
        if last is None or abs(a.x - last.x) > 1e-3 or abs(a.y - last.y) > 1e-3:
            flush(); cur = [[a.x, a.y]]
        if op == 'c': cur.extend(_bez(*it[1:5], k=steps).tolist())
        else: cur.append([b.x, b.y])
        last = b
    flush()
    return out


def _flat(g):
    """도형 모음·다중 도형을 끝까지 풀어 빈 것 아닌 Polygon 만."""
    out = []
    for p in shapely.get_parts(g):
        if p.geom_type == 'Polygon':
            if not p.is_empty: out.append(p)
        elif p.geom_type in ('MultiPolygon', 'GeometryCollection'):
            out.extend(_flat(p))
    return out


def polygonal(g):
    """도형에서 면(Polygon/MultiPolygon)만 남긴다. 없으면 None."""
    if g is None or g.is_empty: return None
    if not g.is_valid: g = shapely.make_valid(g)
    parts = [p for p in _flat(g) if p.area > 0]
    if not parts: return None
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def drawing_geom(d):
    """채움 도형 하나 → 면. 짝홀 규칙이면 고리를 XOR, 아니면(0 아닌 감김) 큰 고리와 같은 방향은 합치고 반대 방향은 뺀다."""
    polys = []
    for R in rings(d):
        if len(R) < 3: continue
        a = 0.5 * float(np.dot(R[:, 0], np.roll(R[:, 1], -1)) - np.dot(R[:, 1], np.roll(R[:, 0], -1)))
        p = polygonal(Polygon(R))
        if p is not None: polys.append((a, p))
    if not polys: return None
    if d.get('even_odd'):
        g = polys[0][1]
        for _, p in polys[1:]: g = g.symmetric_difference(p)
        return polygonal(g)
    sign = np.sign(max(polys, key=lambda t: abs(t[0]))[0])
    pos = [p for a, p in polys if np.sign(a) == sign]
    neg = [p for a, p in polys if np.sign(a) != sign]
    g = unary_union(pos)
    if neg: g = g.difference(unary_union(neg))
    return polygonal(g)


def inside(r, b, tol=1.0):
    return r.x0 >= b[0] - tol and r.x1 <= b[2] + tol and r.y0 >= b[1] - tol and r.y1 <= b[3] + tol


def overlaps(r, b):
    return not (r.x1 < b[0] or r.x0 > b[2] or r.y1 < b[1] or r.y0 > b[3])


def excluded_boxes(m):
    return [m[k] for k in ('legendBbox', 'insetBbox', 'locatorBbox') if m.get(k)]


def poly_coords(g):
    """면 → [[바깥 고리, 구멍...], ...] (좌표 소수 3자리)."""
    out = []
    for p in shapely.get_parts(g):
        if p.geom_type != 'Polygon' or p.is_empty: continue
        rs = [p.exterior] + list(p.interiors)
        out.append([[[round(x, 3), round(y, 3)] for x, y in r.coords] for r in rs])
    return out


def drop_slivers(g, min_area=SLIVER_PT2):
    if g is None: return None
    parts = [p for p in shapely.get_parts(g) if p.area >= min_area]
    return polygonal(MultiPolygon(parts)) if parts else None


# ── 글자 ────────────────────────────────────────────────────────────────
_spans_cache = {}
def spans(pno):
    if pno not in _spans_cache: _spans_cache[pno] = pdfkit.merge_spans(pdfkit.page_spans(pno))
    return _spans_cache[pno]


def yc(b): return (b[1] + b[3]) / 2


GRAT_TEXT = re.compile(r'\d{1,3}\s*[˚°]\s*[EWNS]?')  # 범례 안에 겹친 경위도 눈금 글자


# ── 범례 ────────────────────────────────────────────────────────────────
def legend(m, strokes=False, min_area=2.0, max_area=200.0, order='columns', skip=()):
    """범례 견본(작은 채움 도형, strokes=True 이면 짧은 선도) + 오른쪽 글자 → [{cls,color,label,kind,box}]."""
    L = m.get('legendBbox')
    if not L: return []
    page = pdfkit.doc()[m['page'] - 1]
    sw = []
    for d in page.get_drawings():
        r = d['rect']
        if not inside(r, L): continue
        fill = hexc(d.get('fill'))
        if fill and fill not in ('#ffffff', '#231f20', '#000000') and fill not in skip and min_area <= r.width * r.height <= max_area:
            sw.append({'color': fill, 'kind': 'fill', 'box': [r.x0, r.y0, r.x1, r.y1]})
        elif strokes and d['type'] == 's' and r.width > 10 and r.height < 1 and hexc(d.get('color')) not in ('#231f20', '#ffffff'):
            sw.append({'color': hexc(d['color']), 'kind': 'line', 'box': [r.x0, r.y0 - 1, r.x1, r.y1 + 1],
                       'dashed': d.get('dashes') not in (None, '[] 0', '[ ] 0'), 'width': round(d.get('width') or 0, 2)})
    seen, uniq = set(), []
    for s in sw:
        if s['color'] in seen: continue
        seen.add(s['color']); uniq.append(s)
    texts = [s for s in spans(m['page']) if L[0] - 2 <= s['bbox'][0] <= L[2] + 2 and L[1] - 2 <= yc(s['bbox']) <= L[3] + 2]
    out = []
    for s in uniq:
        b = s['box']; y = yc(b)
        right = [o['box'][0] for o in uniq if o['box'][0] > b[2] + 1]   # 다음 열의 견본 시작 = 이 열 글자의 끝
        stop = min(right) if right else 1e9
        cand = sorted((t for t in texts if abs(yc(t['bbox']) - y) < 2.5 and b[2] - 0.5 <= t['bbox'][0] < stop
                       and not GRAT_TEXT.fullmatch(t['text'])),
                      key=lambda t: t['bbox'][0])
        chain = []
        for t in cand:   # 견본 바로 옆에서 시작해 빈칸 4pt 안으로 이어지는 글자만(멀리 떨어진 제목 글자 제외)
            end = chain[-1]['bbox'][2] if chain else b[2]
            if t['bbox'][0] - end > 4: break
            chain.append(t)
        s['label'] = ' '.join(t['text'] for t in chain).strip()
        out.append(s)
    # 견본은 위→아래, 왼쪽 열→오른쪽 열 순서(교과서 읽는 순서)
    if order == 'rows': out.sort(key=lambda s: (round(s['box'][1] / 4), s['box'][0]))
    else: out.sort(key=lambda s: (round(s['box'][0] / 20), s['box'][1]))
    for i, s in enumerate(out): s['cls'] = f'c{i + 1}'
    return out


# ── 면: 벡터 ─────────────────────────────────────────────────────────────
def vector_zones(m, leg, aliases=None):
    page = pdfkit.doc()[m['page'] - 1]
    fills = [e for e in leg if e['kind'] == 'fill']
    ex = excluded_boxes(m)
    items, unmatched, alias_used = [], {}, {}
    for d in page.get_drawings():
        if d.get('fill') is None: continue
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        h = hexc(d['fill'])
        if aliases and h in aliases:
            alias_used[h] = alias_used.get(h, 0) + 1; h = aliases[h]
        e = match_color(h, fills)
        if e is None:
            unmatched[h] = unmatched.get(h, 0) + 1; continue
        g = drawing_geom(d)
        if g is not None: items.append((e['cls'], g))
    # 화가 알고리즘: 뒤에 그린 다른 분류에 가린 부분을 뺀다
    tree = STRtree([g for _, g in items])
    by_cls = {}
    for i, (c, g) in enumerate(items):
        later = [j for j in tree.query(g) if j > i and items[j][0] != c]
        if later:
            g = g.difference(unary_union([items[j][1] for j in later]))
        g = polygonal(g)
        if g is not None: by_cls.setdefault(c, []).append(g)
    zones = {c: polygonal(unary_union(gs)) for c, gs in by_cls.items()}
    return zones, {'fills': len(items), 'aliases': alias_used, 'unmatchedColors': dict(sorted(unmatched.items(), key=lambda kv: -kv[1])[:12])}


# ── 면: 래스터 ───────────────────────────────────────────────────────────
def raster_zones(m, leg, dpi=150):
    import cv2
    from PIL import Image
    from rasterio import features as rf
    from affine import Affine
    os.makedirs(f'{WORK}/c1', exist_ok=True)
    png = f"{WORK}/c1/{m['id']}-img.png"
    _, _, dpi = pdfkit.render_clip(m['page'], m['bbox'], dpi, png, images_only=True)
    im = cv2.medianBlur(np.array(Image.open(png).convert('RGB')), 3)  # 1화소 타일 이음매·얼룩 지우기
    s = dpi / 72; x0, y0 = m['bbox'][0], m['bbox'][1]
    fills = [e for e in leg if e['kind'] == 'fill']
    L = lab(im)
    cols = np.array([lab(hex_rgb(e['color'])) for e in fills])
    dist = np.stack([np.linalg.norm(L - c, axis=-1) for c in cols], -1)
    k = dist.argmin(-1); dmin = dist.min(-1)
    white = np.linalg.norm(L - lab([255, 255, 255]), axis=-1) < WHITE_DE
    sea = cv2.morphologyEx(white.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    lbl = np.where((dmin < RASTER_DE) & ~sea, k + 1, 0).astype(np.int32)
    # 범례·덮개 상자 안은 비운다
    for b in excluded_boxes(m):
        c0, r0 = int((b[0] - x0) * s), int((b[1] - y0) * s); c1, r1 = int((b[2] - x0) * s) + 1, int((b[3] - y0) * s) + 1
        lbl[max(r0, 0):max(r1, 0), max(c0, 0):max(c1, 0)] = 0
        sea[max(r0, 0):max(r1, 0), max(c0, 0):max(c1, 0)] = True
    classified = int((lbl > 0).sum()); land = int((~sea).sum())
    # 미분류 육지 화소 + 바다 쪽 GROW_PT 띠 → 가장 가까운 분류
    src = (lbl == 0).astype(np.uint8)
    dd, idx = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(idx.max() + 1, np.int32); lut[idx[src == 0]] = lbl[src == 0]
    near = lut[idx]
    grow = GROW_PT * s
    full = np.where((~sea & (dd < 4 * s)) | (sea & (dd <= grow)), near, 0).astype(np.int32)
    full = np.where(lbl > 0, lbl, full).astype(np.int32)
    full = rf.sieve(full, size=SIEVE_PX, connectivity=8, mask=full > 0)
    tf = Affine(1 / s, 0, x0, 0, 1 / s, y0)
    parts = {}
    for geom, v in rf.shapes(full.astype(np.int32), mask=full > 0, transform=tf, connectivity=8):
        parts.setdefault(int(v), []).append(shapely.geometry.shape(geom))
    zones = {}
    for v, gs in parts.items():
        g = polygonal(unary_union(gs).simplify(0.6 / s * 1.0, preserve_topology=True))
        if g is not None: zones[fills[v - 1]['cls']] = g
    return zones, {'dpi': dpi, 'landPx': land, 'classifiedPx': classified,
                   'classifiedPct': round(100 * classified / max(land, 1), 1)}


# ── 빗금(고산 기후 등): 윤곽 선 → 면 ──────────────────────────────────────
def hatch_zone(m, cfg):
    page = pdfkit.doc()[m['page'] - 1]
    ex = excluded_boxes(m) + [cfg['swatch']]
    gs = []
    for d in page.get_drawings():
        if hexc(d.get('color')) != cfg['stroke'] or d.get('fill') is not None: continue
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        for R in rings(d):
            g = polygonal(Polygon(R)) if len(R) >= 3 else None
            if g is not None: gs.append(g)
    return polygonal(unary_union(gs)) if gs else None


def hatch_legend(m, cfg):
    b = cfg['swatch']; y = yc(b)
    cand = sorted((t for t in spans(m['page']) if abs(yc(t['bbox']) - y) < 2.5 and b[2] - 0.5 <= t['bbox'][0] < b[2] + 40),
                  key=lambda t: t['bbox'][0])
    return {'color': cfg['color'], 'kind': 'fill', 'pattern': 'hatch', 'box': b, 'label': ' '.join(t['text'] for t in cand[:1])}


# ── 공통 다듬기 ──────────────────────────────────────────────────────────
def finish_zones(m, zones, order):
    """틀로 자르고, 빈 곳으로 GROW_PT 넓히고(먼저 넓힌 분류 우선), 조각 정리."""
    frame = box(*m['bbox'])
    for b in excluded_boxes(m): frame = frame.difference(box(*b))
    zones = {c: polygonal(g.intersection(frame)) for c, g in zones.items() if g is not None}
    zones = {c: g for c, g in zones.items() if g is not None}
    covered = unary_union(list(zones.values())) if zones else None
    out = {}
    taken = covered
    for c in order:
        g = zones.get(c)
        if g is None: continue
        ext = polygonal(g.buffer(GROW_PT, join_style='mitre').intersection(frame).difference(taken))
        if ext is not None:
            taken = taken.union(ext); g = polygonal(g.union(ext))
        g = drop_slivers(g)
        if g is not None: out[c] = shapely.segmentize(g, DENSIFY_PT)
    return out


# ── 점 기호 ──────────────────────────────────────────────────────────────
def symbols(m, leg, cfg):
    page = pdfkit.doc()[m['page'] - 1]
    ex = excluded_boxes(m)
    gmax = cfg.get('glyphMax', 6.0)
    found = []
    for d in page.get_drawings():
        if d.get('fill') is None: continue
        r = d['rect']
        if not inside(r, m['bbox'], 0) or any(overlaps(r, b) for b in ex): continue
        if max(r.width, r.height) > gmax or max(r.width, r.height) < 1.0: continue
        e = match_color(hexc(d['fill']), leg, 3.0)
        if e is None: continue
        c = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
        if any(f['cls'] == e['cls'] and abs(f['xy'][0] - c[0]) < 0.8 and abs(f['xy'][1] - c[1]) < 0.8 for f in found): continue
        found.append({'xy': [round(c[0], 2), round(c[1], 2)], 'cls': e['cls'], 'kind': e['label'], 'color': e['color'],
                      'size': round(max(r.width, r.height), 2)})
    rep = {}
    if cfg.get('leaders'):
        rep['leaders'] = attach_leader_labels(m, found, cfg['leaders'])
    return found, rep


def attach_leader_labels(m, syms, lc):
    """지시선(가는 검은 선) 한쪽 끝 = 이름 글자, 다른 쪽 끝 = 기호 → 기호에 label."""
    page = pdfkit.doc()[m['page'] - 1]
    names = [t for t in spans(m['page']) if overlaps(fitz_rect(t['bbox']), m['bbox']) and not re.fullmatch(r'[\d.,\skm]+', t['text'])
             and not any(overlaps(fitz_rect(t['bbox']), b) for b in excluded_boxes(m))]
    def tdist(p, t):
        b = t['bbox']; dx = max(b[0] - p[0], 0, p[0] - b[2]); dy = max(b[1] - p[1], 0, p[1] - b[3])
        return float(np.hypot(dx, dy))
    done = []
    for d in page.get_drawings():
        if d['type'] != 's' or hexc(d.get('color')) != lc['stroke'] or abs((d.get('width') or 0) - lc['width']) > 0.05: continue
        if not inside(d['rect'], m['bbox'], 0): continue
        pts = [np.array([it[1].x, it[1].y]) for it in d['items'] if it[0] == 'l'] + [np.array([it[2].x, it[2].y]) for it in d['items'] if it[0] == 'l']
        if not pts: continue
        # 선 묶음의 양 끝: 서로 가장 먼 두 점
        P = np.array(pts); D = np.hypot(*(P[:, None] - P[None]).transpose(2, 0, 1))
        i, j = np.unravel_index(D.argmax(), D.shape)
        ends = [P[i], P[j]]
        best = None
        for a, b in ((ends[0], ends[1]), (ends[1], ends[0])):
            t = min(names, key=lambda t: tdist(a, t)) if names else None
            if t is None: continue
            sd = sorted(syms, key=lambda s: np.hypot(s['xy'][0] - b[0], s['xy'][1] - b[1]))
            if not sd: continue
            score = tdist(a, t) + np.hypot(sd[0]['xy'][0] - b[0], sd[0]['xy'][1] - b[1])
            if best is None or score < best[0]: best = (score, t, sd[0])
        if best and best[0] < 6:
            best[2]['label'] = _with_lines(best[1], names)
            done.append({'label': best[1]['text'], 'kind': best[2]['kind'], 'gap': round(float(best[0]), 2)})
    return done


def _with_lines(t, names):
    """여러 줄로 쓴 이름('세인트 앤드루' / '대성당')을 위아래 줄과 이어 붙인다."""
    group = [t]
    for _ in range(3):
        for o in names:
            if o in group or abs(o['size'] - t['size']) > 0.2: continue
            if min(o['bbox'][2], max(g['bbox'][2] for g in group)) - max(o['bbox'][0], min(g['bbox'][0] for g in group)) <= 0: continue
            top, bot = min(g['bbox'][1] for g in group), max(g['bbox'][3] for g in group)
            if 0 <= top - o['bbox'][3] < 0.6 * t['size'] or 0 <= o['bbox'][1] - bot < 0.6 * t['size']:
                group.append(o)
    return ' '.join(g['text'] for g in sorted(group, key=lambda g: g['bbox'][1]))


def fitz_rect(b):
    import fitz
    return fitz.Rect(b)


# ── 인구 막대 기호(p23-density) ───────────────────────────────────────────
def density_markers(m, cfg):
    page = pdfkit.doc()[m['page'] - 1]
    ex = excluded_boxes(m)
    blobs = []
    for d in page.get_drawings():
        if hexc(d.get('fill')) != cfg['color']: continue
        r = d['rect']
        if not inside(r, m['bbox'], 0) or any(overlaps(r, b) for b in ex): continue
        for R in rings(d):
            x0, y0 = R.min(0); x1, y1 = R.max(0)
            blobs.append([x0, y0, x1, y1])
    # x 범위가 겹치는 조각을 한 막대로
    cols = []
    for b in sorted(blobs, key=lambda b: b[0]):
        for c in cols:
            if b[0] < c['box'][2] - 0.5 and b[2] > c['box'][0] + 0.5:
                c['parts'].append(b); c['box'] = [min(c['box'][0], b[0]), min(c['box'][1], b[1]), max(c['box'][2], b[2]), max(c['box'][3], b[3])]; break
        else:
            cols.append({'box': list(b), 'parts': [b]})
    out = []
    names = [t for t in spans(m['page']) if overlaps(fitz_rect(t['bbox']), m['bbox']) and re.fullmatch(r'[가-힣]+', t['text'])]
    chains = _dotted_chains(m)
    for c in cols:
        b = c['box']
        squares = [p for p in c['parts'] if 4 <= p[2] - p[0] <= 8 and 3 <= p[3] - p[1] <= 9]
        cx = (b[0] + b[2]) / 2
        below = [t for t in names if abs((t['bbox'][0] + t['bbox'][2]) / 2 - cx) < 14 and -2 <= t['bbox'][1] - b[3] <= 10]
        lab_ = min(below, key=lambda t: t['bbox'][1] - b[3])['text'] if below else None
        base = [round(cx, 2), round(b[3], 2)]
        anchor = _leader_end(chains, b)
        out.append({'xy': anchor or base, 'cls': 'c1', 'kind': '인구 1억 명', 'color': cfg['color'],
                    'size': round(b[3] - b[1], 2), 'value': len(squares), 'label': lab_,
                    'anchor': 'leader' if anchor else 'bar-base'})
    return out


def _dotted_chains(m):
    """점선(지시선) 조각을 끝점끼리(2pt 안) 이어 [점 배열] 목록으로."""
    page = pdfkit.doc()[m['page'] - 1]
    segs = []
    for d in page.get_drawings():
        if d['type'] != 's' or not (d.get('dashes') or '').startswith('[ 0'): continue
        if not inside(d['rect'], m['bbox'], 0): continue
        for P in _stroke_paths(d): segs.append([tuple(P[0]), tuple(P[-1])])
    chains = []
    for a, b in segs:
        for c in chains:
            if np.hypot(c[-1][0] - a[0], c[-1][1] - a[1]) < 2: c.append(b); break
            if np.hypot(c[-1][0] - b[0], c[-1][1] - b[1]) < 2: c.append(a); break
            if np.hypot(c[0][0] - b[0], c[0][1] - b[1]) < 2: c.insert(0, a); break
            if np.hypot(c[0][0] - a[0], c[0][1] - a[1]) < 2: c.insert(0, b); break
        else:
            chains.append([a, b])
    return chains


def _leader_end(chains, b, near=12.0):
    """막대 상자 b 에 한쪽 끝이 닿은(near pt 안) 지시선의 다른 쪽 끝 = 나라 위치."""
    def dist(p):
        return float(np.hypot(max(b[0] - p[0], 0, p[0] - b[2]), max(b[1] - p[1], 0, p[1] - b[3])))
    best = None
    for c in chains:
        for e, o in ((c[0], c[-1]), (c[-1], c[0])):
            de = dist(e)
            if de < near and dist(o) > de + 5 and (best is None or de < best[0]): best = (de, o)
    return [round(best[1][0], 2), round(best[1][1], 2)] if best else None


# ── 등온선(p21-jan·jul) ───────────────────────────────────────────────────
def isotherms(m, color):
    page = pdfkit.doc()[m['page'] - 1]
    ex = excluded_boxes(m)
    lines = []
    for d in page.get_drawings():
        if d['type'] != 's' or hexc(d.get('color')) != color: continue
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        for R in _stroke_paths(d):
            if len(R) >= 2: lines.append({'P': R, 'votes': {}})
    labels = [t for t in spans(m['page']) if inside(fitz_rect(t['bbox']), m['bbox'], 0) and re.fullmatch(r'[-−]?\d{1,2}', t['text'])
              and not any(overlaps(fitz_rect(t['bbox']), b) for b in ex)]
    for t in labels:
        c = np.array([(t['bbox'][0] + t['bbox'][2]) / 2, yc(t['bbox'])])
        v = int(t['text'].replace('−', '-'))
        for L in lines:
            dist = LineString(L['P']).distance(Point(c))
            if dist < 6: L['votes'][v] = L['votes'].get(v, 0) + 1
    for L in lines:
        L['value'] = max(L['votes'], key=L['votes'].get) if L['votes'] else None
    # 글자 없는 조각: 끝점이 8pt 안에 닿는 이름 있는 조각의 값을 물려받는다(되풀이)
    for _ in range(5):
        for L in lines:
            if L['value'] is not None: continue
            for o in lines:
                if o['value'] is None: continue
                if min(np.hypot(*(a - b)) for a in (L['P'][0], L['P'][-1]) for b in (o['P'][0], o['P'][-1])) < 8:
                    L['value'] = o['value']; break
    out = [{'points': np.round(L['P'], 3).tolist(), 'cls': 'isotherm', 'kind': 'isotherm', 'color': color, 'value': L['value'],
            'label': None if L['value'] is None else f"{L['value']}℃"} for L in lines]
    return out, {'isothermPieces': len(lines), 'isothermLabels': len(labels), 'unlabelled': sum(L['value'] is None for L in lines)}


def _stroke_paths(d):
    """선(획) 그리기 → 점 배열 목록(이어지는 마디끼리)."""
    out, cur, last = [], [], None
    for it in d['items']:
        if it[0] == 'l': a, b = it[1], it[2]
        elif it[0] == 'c': a, b = it[1], it[4]
        else: continue
        if last is None or abs(a.x - last.x) > 1e-3 or abs(a.y - last.y) > 1e-3:
            if len(cur) >= 2: out.append(np.array(cur))
            cur = [[a.x, a.y]]
        if it[0] == 'c': cur.extend(_bez(*it[1:5], k=8).tolist())
        else: cur.append([b.x, b.y])
        last = b
    if len(cur) >= 2: out.append(np.array(cur))
    return out


# ── 흐름선(p24-trade) ─────────────────────────────────────────────────────
# 교과서 화살표는 겹치는 곳마다 색을 바꿔 칠한(초록 땅 위 = 짙은 초록·짙은 빨강) 조각 수백 개라 도형 하나가 흐름선 하나가 아니다.
# 그래서 상대국 끝점(수출 = 화살촉, 수입 = 꼬리)을 지면에서 읽어 CONFIG 에 두고, 같은 방향(수입·수출) 조각을 합친 가면 위에서
# 끝점 → 허브 최단 경로(띠 가운데를 따르도록 가장자리일수록 비싸게)를 찾아 선으로 쓴다.
# 굵기 = 상대국 쪽 구간(끝 3pt·허브 쪽 절반 제외)의 거리 변환 중앙값 × 2 → 범례 선 굵기(0.6/1.0/1.5/2.0pt) 중 가장 가까운 단계.
FLOW_PX = 6.0          # 가면 해상도(화소/pt)
FLOW_LEGEND = [(0.6, '1~2'), (1.0, '2~5'), (1.5, '5~10'), (2.0, '10 이상')]   # 범례 선 굵기(pt) ↔ 백억 달러


def _shortest(mask, cost, src, dst):
    """가면 화소 위 8방향 다익스트라 → [(r,c)...] (src→dst). 못 가면 []."""
    import heapq
    H, W = mask.shape
    dist = {src: 0.0}; prev = {}; pq = [(0.0, src)]
    while pq:
        d, p = heapq.heappop(pq)
        if p == dst: break
        if d > dist.get(p, 1e18): continue
        r, c = p
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if not dr and not dc: continue
                q = (r + dr, c + dc)
                if not (0 <= q[0] < H and 0 <= q[1] < W) or not mask[q]: continue
                nd = d + (1.4142 if dr and dc else 1.0) * cost[q]
                if nd < dist.get(q, 1e18):
                    dist[q] = nd; prev[q] = p; heapq.heappush(pq, (nd, q))
    if dst not in prev and dst != src: return []
    path = [dst]
    while path[-1] != src: path.append(prev[path[-1]])
    return path[::-1]


def flows(m, cfg, leg_strokes):
    import cv2
    from rasterio import features as rf
    from affine import Affine
    page = pdfkit.doc()[m['page'] - 1]
    s = FLOW_PX
    x0, y0, x1, y1 = m['bbox']
    W, H = int((x1 - x0) * s) + 1, int((y1 - y0) * s) + 1
    tf = Affine(1 / s, 0, x0, 0, 1 / s, y0)
    topx = lambda p: (int((p[1] - y0) * s), int((p[0] - x0) * s))
    toxy = lambda rc: [x0 + (rc[1] + 0.5) / s, y0 + (rc[0] + 0.5) / s]
    out, rep = [], {}
    masks = {}
    for ckey in ('import', 'export'):
        gs = [drawing_geom(d) for d in page.get_drawings()
              if hexc(d.get('fill')) in cfg[ckey] and inside(d['rect'], m['bbox'], 0) and not any(overlaps(d['rect'], b) for b in excluded_boxes(m))]
        U = unary_union([g for g in gs if g is not None]).buffer(0.05)
        masks[ckey] = rf.rasterize([(U, 1)], out_shape=(H, W), transform=tf, fill=0, dtype='uint8')
    # 지나갈 수 있는 곳: 두 방향 가면 + 허브(우리나라) 둘레 6pt — 조각 사이 틈(겹친 다른 색·흰 테두리)은 2화소 팽창으로 잇는다
    hubdisc = np.zeros((H, W), np.uint8)
    cv2.circle(hubdisc, (int((cfg['hub'][0] - x0) * s), int((cfg['hub'][1] - y0) * s)), int(6 * s), 1, -1)
    for key, ckey in (('수입', 'import'), ('수출', 'export')):
        own = masks[ckey]
        other = masks['export' if ckey == 'import' else 'import']
        mask = cv2.dilate(own | other | hubdisc, np.ones((5, 5), np.uint8))
        dt = cv2.distanceTransform(own, cv2.DIST_L2, 5)          # 화소(자기 방향 띠 안에서만)
        cost = np.where(own > 0, 1.0 + 6.0 / (1.0 + dt), np.where(other > 0, 8.0, 12.0))
        ys, xs = np.nonzero(own)
        def snap(p):
            r, c = topx(p); k = int(np.argmin((ys - r) ** 2 + (xs - c) ** 2)); return (int(ys[k]), int(xs[k])), float(np.hypot(ys[k] - r, xs[k] - c) / s)
        rows = []
        hub = topx(cfg['hub'])
        for name, end in cfg['partners'][ckey]:
            e, gap = snap(end)
            path = _shortest(mask, cost, e, hub)
            if not path:
                rows.append({'partner': name, 'error': 'no path'}); continue
            P = np.array([toxy(rc) for rc in path])
            seg = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
            L = seg[-1]
            sel = (seg >= min(3.0, 0.2 * L)) & (seg <= 0.5 * L)
            if sel.sum() < 3: sel = seg <= 0.6 * L
            width = 2 * float(np.median([dt[rc] for rc, ok in zip(path, sel) if ok])) / s
            k = int(np.argmin([abs(width - w) for w, _ in FLOW_LEGEND]))
            line = LineString([list(cfg['hub'])] + P[::-1].tolist()).simplify(0.2)   # 허브 → 상대국
            pts = np.array(line.coords)
            if key == '수입': pts = pts[::-1]                                         # 상대국 → 우리나라
            out.append({'points': np.round(shapely.segmentize(LineString(pts), DENSIFY_PT).coords, 3).tolist(),
                        'cls': ckey, 'kind': key, 'dir': 'to-korea' if key == '수입' else 'from-korea',
                        'color': leg_strokes[key], 'label': name, 'widthPt': round(width, 2),
                        'value': FLOW_LEGEND[k][1], 'valueRank': k + 1, 'width': FLOW_LEGEND[k][0], 'lengthPt': round(float(L), 1)})
            rows.append({'partner': name, 'widthPt': round(width, 2), 'value': FLOW_LEGEND[k][1], 'snapPt': round(gap, 2)})
        rep[key] = rows
    return out, rep


def flow_classes(lines, m):
    return [v for _, v in FLOW_LEGEND]


# ── 진입점 ──────────────────────────────────────────────────────────────
def features(map_id):
    m = maps()[map_id]
    cfg = CONFIG[map_id]
    mode = cfg['mode']
    out = {'id': cfg.get('out', map_id), 'map': map_id, 'page': m['page'], 'bbox': m['bbox'], 'legend': [], 'polys': [],
           'symbols': [], 'lines': [], 'report': {}}
    if mode in ('vector', 'raster'):
        leg = legend(m, order=cfg.get('legendOrder', 'columns'), skip=cfg.get('legendSkip', ()))
        if cfg.get('hatch'):
            h = hatch_legend(m, cfg['hatch']); h['cls'] = f'c{len(leg) + 1}'; leg.append(h)
        fill_leg = [e for e in leg if not e.get('pattern')]
        if mode == 'vector': zones, rep = vector_zones(m, fill_leg, cfg.get('aliases'))
        else: zones, rep = raster_zones(m, fill_leg, cfg.get('dpi', 150))
        out['report'].update(rep)
        zones = finish_zones(m, zones, [e['cls'] for e in fill_leg])
        if cfg.get('hatch'):
            hz = hatch_zone(m, cfg['hatch'])
            if hz is not None:
                hz = hz.intersection(box(*m['bbox']))
                zones[leg[-1]['cls']] = shapely.segmentize(polygonal(hz), DENSIFY_PT)
        for e in leg:
            g = zones.get(e['cls'])
            if g is None: continue
            p = {'cls': e['cls'], 'color': e['color'], 'label': e['label'], 'polygons': poly_coords(g)}
            if e.get('pattern'): p['pattern'] = e['pattern']
            out['polys'].append(p)
        out['legend'] = leg
        if cfg.get('isotherm'):
            ls, r2 = isotherms(m, cfg['isotherm'])
            out['lines'] += ls; out['report'].update(r2)
            out['legend'].append({'cls': 'isotherm', 'color': cfg['isotherm'], 'kind': 'line', 'label': '기온(℃)'})
        if cfg.get('flows'):
            fl, r3 = flows(m, cfg['flows'], cfg['flows']['legendStrokes'])
            vals = flow_classes(fl, m)
            out['lines'] += fl; out['report']['flows'] = r3
            for k, c in cfg['flows']['legendStrokes'].items():
                out['legend'].append({'cls': 'import' if k == '수입' else 'export', 'color': c, 'kind': 'flow', 'label': k,
                                      'values': vals, 'unit': '백억 달러, 2022'})
    elif mode == 'symbols':
        leg = legend(m, max_area=40.0)
        out['legend'] = leg
        out['symbols'], rep = symbols(m, leg, cfg)
        out['report'].update(rep)
    elif mode == 'density-markers':
        out['symbols'] = density_markers(m, cfg)
        out['legend'] = [{'cls': 'c1', 'color': cfg['color'], 'kind': 'symbol', 'label': '인구 1억 명'}]
    for e in out['legend']: e.pop('box', None)
    present = {p['cls'] for p in out['polys']} | {s['cls'] for s in out['symbols']} | {l['cls'] for l in out['lines']}
    out['report']['legendCount'] = len(out['legend'])
    out['report']['outputClasses'] = len(present)
    out['report']['absent'] = [e['label'] for e in out['legend'] if e['cls'] not in present]
    return out


def write(map_id, out_dir=None):
    out_dir = out_dir or os.path.join(WORK, 'vec')
    os.makedirs(out_dir, exist_ok=True)
    f = features(map_id)
    path = os.path.join(out_dir, f"{f['id']}.features.json")
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(f, fh, ensure_ascii=False)
    return f, path
