# © 2026 김용현
# scripts/atlas/inset_outline.py — 확대 창(인셋) 바탕 윤곽: 교과서 지도 안의 육지 채움 도형 → 경위도 GeoJSON (E1)
#   python -I scripts/atlas/inset_outline.py            설정 insets 의 모든 항목
#   python -I scripts/atlas/inset_outline.py <id> ...   그 항목만
#   설정: scripts/atlas/config/u2.json 의 insets[] = {id, map, layer, landFill, minAreaPt2, tolPt, roads?, out}
#     roads    = {stroke: 밝은 도로 선 색, kinds: {선 굵기(pt): 종류}} — 교과서는 어두운 테두리(#58595b) 위에 밝은 선(#d1d3d4)을 겹쳐 그리고,
#                고속 도로는 굵게(0.7/0.45pt), 일반 도로는 가늘게(0.5/0.22pt). 밝은 선만 따서 LineString {kind} 로(E1 검토, 교사 결정).
#     layer    = 같은 지도의 레이어 생성물(그 properties.approx 를 따라 출력에 approx)
#     map      = maps_u2.json 지도 id(지도 틀 bbox 안 도형만, 그 지도 fit 으로 경위도)
#     landFill = 육지 채움색(#rrggbb, 싱가포르 22쪽 = #e7efc1)
#     minAreaPt2 = 이보다 작은 조각은 버림(지면 pt²), tolPt = 단순화 허용치(Douglas–Peucker, 지면 pt)
#     out      = 저장소 기준 출력 파일(sims/<조각>/data/inset-<id>.json)
#     frame    = (있을 때만, U5-4) 육지를 지도 틀로 자르고 틀 둘레 8점을 MultiPoint {kind:'frame'}(앱은 그리지 않음)로 — 창 범위 = 교과서 삽입 틀
#   왜 교과서 윤곽인가: Natural Earth 10m 싱가포르는 꼭짓점 40개라 섬이 화면 수백 px 로 커지면 각이 진다. 교과서 지도는 같은
#   경위도 맞추기(fit)로 사원 기호 76개를 뽑은 그 지면이라 기호와 해안이 서로 맞는다(fit 이 approx 면 출력에도 approx — layer 로 확인).
#   베지어는 지면에서 0.25pt 간격 남짓으로 펴고(곡선마다 8 마디), 도형 하나의 하위 경로(시작점이 앞 끝점과 다르면 새 고리)를 고리로 나눈다.
#   경위도 = pt2lonlat.mjs(node, pins.node_lonlat). 출력 {type: FeatureCollection, properties: {id, map, page, approx?, source}, features: [Polygon ...]}.
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
from atlas_common import unit_config, maps, drawings
from pins import node_lonlat, ROOT

BEZIER_STEPS = 8


def _bez(p0, p1, p2, p3, n=BEZIER_STEPS):
    out = []
    for i in range(1, n + 1):
        t = i / n; u = 1 - t
        out.append((u**3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t**3 * p3.x,
                    u**3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t**3 * p3.y))
    return out


def paths_of(drawing, min_pts):
    """PyMuPDF 도형 하나 → 하위 경로 목록(지면 pt 점 목록). 시작점이 앞 끝점과 다르면 새 경로. min_pts 보다 짧은 것은 버림."""
    rings, cur, last = [], [], None
    for it in drawing['items']:
        kind = it[0]
        if kind == 'l': a, b = it[1], it[2]; pts = [(b.x, b.y)]
        elif kind == 'c': a = it[1]; pts = _bez(it[1], it[2], it[3], it[4])
        elif kind == 're':
            r = it[1]; a = r.tl; pts = [(r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
        else: continue
        if last is None or math.hypot(a.x - last[0], a.y - last[1]) > 0.05:
            if len(cur) >= min_pts: rings.append(cur)
            cur = [(a.x, a.y)]
        cur.extend(pts); last = cur[-1]
    if len(cur) >= min_pts: rings.append(cur)
    return rings


def rings_of(drawing):
    """도형 하나 → 고리 목록(4점 이상)."""
    return paths_of(drawing, 4)


def area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def _dp(a, tol):
    if len(a) < 3: return a
    (x0, y0), (x1, y1) = a[0], a[-1]
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy) or 1e-9
    best, bi = -1, 0
    for i in range(1, len(a) - 1):
        d = abs(dy * (a[i][0] - x0) - dx * (a[i][1] - y0)) / L
        if d > best: best, bi = d, i
    if best <= tol: return [a[0], a[-1]]
    return _dp(a[:bi + 1], tol)[:-1] + _dp(a[bi:], tol)


def simplify_line(pts, tol):
    """Douglas–Peucker(열린 선)."""
    return _dp(list(pts), tol)


def simplify(pts, tol):
    """Douglas–Peucker(닫힌 고리: 첫 점과 가장 먼 점으로 둘로 나눠 각각)."""
    def dp(a):
        if len(a) < 3: return a
        (x0, y0), (x1, y1) = a[0], a[-1]
        dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, 0
        for i in range(1, len(a) - 1):
            d = abs(dy * (a[i][0] - x0) - dx * (a[i][1] - y0)) / L
            if d > best: best, bi = d, i
        if best <= tol: return [a[0], a[-1]]
        return dp(a[:bi + 1])[:-1] + dp(a[bi:])
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    ring = pts + [pts[0]]
    return dp(ring[:far + 1])[:-1] + dp(ring[far:])


def build(item):
    m = maps()[item['map']]; x0, y0, x1, y1 = m['bbox']
    rings = []
    for d in drawings(m['page']):
        if d.get('fill') is None or pdfkit.hex_color(d['fill']) != item['landFill']: continue
        r = d['rect']
        if r.x1 < x0 or r.x0 > x1 or r.y1 < y0 or r.y0 > y1: continue
        for ring in rings_of(d):
            if area(ring) >= item['minAreaPt2']: rings.append(simplify(ring, item['tolPt']))
    rings = [r for r in rings if len(r) >= 3]
    corners = []
    if item.get('frame'):   # 틀(U5-4 — 47쪽 실리콘 밸리): 고리를 지도 틀로 자르고 틀 네 모서리·변 가운데를 그리지 않는 점으로 — 창 범위(geoBox) = 교과서 삽입 틀
        from shapely.geometry import Polygon, box
        from atlas_common import flat_polygons
        clipped = []
        for r in rings:
            g = Polygon(r).buffer(0).intersection(box(x0, y0, x1, y1))
            clipped += [list(q.exterior.coords)[:-1] for q in flat_polygons(g) if q.area >= item['minAreaPt2']]
        rings = clipped
        xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
        corners = [(x0, y0), (xm, y0), (x1, y0), (x1, ym), (x1, y1), (xm, y1), (x0, y1), (x0, ym)]
    # 도로(교과서 지도의 회색 선 — 어두운 테두리 선 위에 밝은 선을 겹쳐 그림): 밝은 선(roads.stroke)만, 굵기로 종류(roads.kinds {굵기: 종류})
    roads = []  # (종류, 점 목록)
    rc = item.get('roads')
    if rc:
        kinds = {float(w): k for w, k in rc['kinds'].items()}
        for d in drawings(m['page']):
            if d.get('color') is None or pdfkit.hex_color(d['color']) != rc['stroke']: continue
            r = d['rect']
            if r.x1 < x0 or r.x0 > x1 or r.y1 < y0 or r.y0 > y1: continue
            w = round(d.get('width') or 0, 2)
            kind = kinds.get(w)
            if kind is None: raise RuntimeError(f"{item['id']}: 도로 굵기 {w} 가 roads.kinds 에 없음")
            for line in paths_of(d, 2):
                q = simplify_line(line, item['tolPt'])
                length = sum(math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]) for i in range(1, len(q)))
                if length >= item.get('minRoadPt', 0.5): roads.append((kind, q))  # 0.5pt 보다 짧은 토막(교차로 조각)은 버림
    flat = [p for r in rings for p in r] + [p for _, q in roads for p in q] + corners
    ll = node_lonlat({item['map']: [list(p) for p in flat]})[item['map']]
    if any(v is None for v in ll): raise RuntimeError(f"{item['id']}: 경위도 되돌리기 실패 {sum(v is None for v in ll)}점")
    feats, k = [], 0
    for r in rings:
        pts = ll[k:k + len(r)]; k += len(r)
        ring = [[round(a, 4), round(b, 4)] for a, b in pts]  # 0.0001° ≈ 11m — 섬 0.4° 를 600px 에 그려도 화소보다 잘다
        ring.append(ring[0])
        # d3 감김: 바깥 고리 시계 방향(경위도 평면에서 부호 넓이 < 0 이 시계 방향이 되도록 — 위도 위가 +)
        s = sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))
        if s > 0: ring.reverse()
        feats.append({'type': 'Feature', 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': [ring]}})
    for kind, q in roads:
        pts = ll[k:k + len(q)]; k += len(q)
        feats.append({'type': 'Feature', 'properties': {'kind': kind}, 'geometry': {'type': 'LineString', 'coordinates': [[round(a, 4), round(b, 4)] for a, b in pts]}})
    if corners:
        pts = ll[k:k + len(corners)]; k += len(corners)
        feats.append({'type': 'Feature', 'properties': {'kind': 'frame'}, 'geometry': {'type': 'MultiPoint', 'coordinates': [[round(a, 4), round(b, 4)] for a, b in pts]}})
    props = {'id': item['id'], 'map': item['map'], 'page': m['page'],
             'source': f"교과서 22개정 중학 사회과 부도 {m['page']}쪽 지도의 육지 윤곽·도로(경위도 맞추기 fit 으로 되돌림)"}
    layer = item.get('layer')  # 같은 지도의 레이어 생성물 — fit 이 approx 면 그 properties 에 approx 가 실려 있다(C1)
    if layer:
        with open(os.path.join(ROOT, layer), encoding='utf-8') as f:
            if json.load(f).get('properties', {}).get('approx'): props['approx'] = True
    out = {'type': 'FeatureCollection', 'properties': props, 'features': feats}
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    path = os.path.join(ROOT, item['out'])
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    if old != text:
        with open(path, 'w', encoding='utf-8', newline='\n') as f: f.write(text)
    print(f"{item['id']}: 고리 {len(rings)}개, 도로 {len(roads)}줄, 점 {len(flat)}개 → {item['out']} {len(text.encode('utf-8')):,} B{' (같음)' if old == text else ''}")


def main(argv):
    items = unit_config().get('insets', [])
    want = set(argv)
    unknown = want - {i['id'] for i in items}
    if unknown: print(f'모르는 인셋: {sorted(unknown)}', file=sys.stderr); return 2
    for it in items:
        if not want or it['id'] in want: build(it)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
