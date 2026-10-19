# © 2026 김용현
# scripts/atlas/kashmir.py — p22-kashmir 레이어를 Natural Earth 실제 경계 자료로 만든다(교과서 도형은 양식화돼 쓰지 않음)
#   python -I scripts/atlas/kashmir.py            → $ATLAS_WORK/geo/p22-kashmir.raw.geojson
#   python -I scripts/atlas/kashmir.py --verify <layer.json> <out.png>  → overlay.py 로 교과서 지도 | 레이어(정거 원통) 나란히
# 설정: config/u2.json layers['p22-kashmir'].kashmir (관할 범위·주장 국경·정전 라인·종교 범례·종교 면(religionAreas)·지명(labels)·위치도·검증 범위)
# 자료($ATLAS_WORK/raw/ne/, github.com/nvkelso/natural-earth-vector geojson/):
#   ne_10m_admin_0_disputed_areas          분쟁 지역 면(실제 관할 기준) → 분쟁 지역 범위 D(관할별)
#   ne_10m_admin_0_countries               D 밖 파키스탄·인도(종교 면 바깥)
#   ne_10m_admin_0_countries_{pak,ind,chn}  각 나라 관점(POV) 국경 → '○○이 주장하는 국경'
#   ne_10m_admin_0_boundary_lines_land      '인도-파키스탄 정전 라인'(Line of control)
# 종교 비율 면(E2 대조 반영): 교과서 22쪽 지도는 양식화된 모식도라 경위도 맞추기(fit)는 안 되고(C1), 종교 면의 안쪽 경계(카슈미르 계곡·잠무·
#   라다크·발티스탄)에 맞는 실제 자료도 없다. 그래서 교과서 종교 면(채움 도형)을 기준점 10개(정전 라인 끝·꺾임, 악사이친·길기트 끝 등 지면 pt ↔ 경위도)의
#   얇은 판 스플라인(TPS)으로 옮기고, 분쟁 지역 D 안에서 잘라 쓴다(바깥 경계는 실제 자료 그대로). 근사라 레이어 properties.approx.
#   지명(카 슈 미 르·관할 이름·나라 이름)도 교과서 글자 자리를 같은 TPS 로 옮긴다(Point {type:'label'}). 위치도 강조 면(type:'locator') = D.
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union, linemerge, transform
from atlas_common import HERE, WORK, layer_config, polygonal, drawings, drawing_geom, flat_polygons
import pdfkit

LAYER = 'p22-kashmir'
NE = os.path.join(WORK, 'raw', 'ne')


def load(name):
    with open(os.path.join(NE, f'{name}.geojson'), encoding='utf-8') as f:
        return json.load(f)['features']


def _merge(g):
    return linemerge(g) if g.geom_type == 'MultiLineString' else g


def tps_fit(src, dst):
    """얇은 판 스플라인: 지면 pt(src) → 경위도(dst). 기준점을 그대로 지난다(정규화 없음). → f(xs, ys) → (lons, lats)"""
    P, Q = np.asarray(src, float), np.asarray(dst, float)
    n = len(P)
    def U(r2):
        with np.errstate(divide='ignore', invalid='ignore'): v = r2 * np.log(r2)
        return np.nan_to_num(v)
    L = np.zeros((n + 3, n + 3))
    L[:n, :n] = U(((P[:, None, :] - P[None, :, :]) ** 2).sum(2))
    L[:n, n:] = np.c_[np.ones(n), P]; L[n:, :n] = L[:n, n:].T
    W = np.linalg.solve(L, np.r_[Q, np.zeros((3, 2))])
    def f(x, y):
        X = np.c_[np.atleast_1d(x), np.atleast_1d(y)]
        R = U(((X[:, None, :] - P[None, :, :]) ** 2).sum(2)) @ W[:n] + np.c_[np.ones(len(X)), X] @ W[n:]
        return R[:, 0], R[:, 1]
    return f


def _hex(c): return '#%02x%02x%02x' % tuple(int(v * 255) for v in c)


def textbook_religion(ra, warp):
    """교과서 종교 면 → ({종류: 경위도 면}, 도형 수). 뒤에 그린 종교 도형이 앞 도형을 가린 만큼은 뺀다(지면에서 보이는 부분만)."""
    fr = ra['frame']; want = {k.lower(): v for k, v in ra['fills'].items()}
    items = []
    for d in drawings(22):
        f, r = d.get('fill'), d['rect']
        if not f or d['type'] != 'f' or _hex(f) not in want: continue
        if r.x0 < fr[0] - 1 or r.x1 > fr[2] + 1 or r.y0 < fr[1] - 1 or r.y1 > fr[3] + 1: continue
        if r.width * r.height < 30: continue
        g = drawing_geom(d)
        if g is not None: items.append((want[_hex(f)], g))
    if not items: raise SystemExit('교과서 22쪽 종교 면을 찾지 못함(religionAreas.fills·frame 확인)')
    out = {}
    for i, (kind, g) in enumerate(items):
        later = [h for _, h in items[i + 1:]]
        vis = polygonal(g.difference(unary_union(later))) if later else g
        if vis is None: continue
        ll = polygonal(transform(lambda x, y, z=None: warp(x, y), vis.segmentize(0.5)))
        if ll is not None: out[kind] = ll if kind not in out else polygonal(out[kind].union(ll))
    return out, len(items)


def religion_areas(kc, disp_by_admin, warp):
    """분쟁 지역 D 안 = 옮긴 교과서 면(insideOrder 차례, 빈 곳은 가장 가까운 면), D 밖 = Natural Earth 나라(outside) — 모두 box 안."""
    ra = kc['religionAreas']
    B = box(*ra['box'])
    tb, n_src = textbook_religion(ra, warp)
    D = unary_union(list(disp_by_admin.values()))
    got = {k: None for k in ra['classes']}
    acc = None
    for k in ra['insideOrder']:
        if k not in tb: continue
        g = polygonal(tb[k].intersection(D))
        if g is not None and acc is not None: g = polygonal(g.difference(acc))
        if g is None: continue
        got[k] = g; acc = g if acc is None else acc.union(g)
    rest = polygonal(D.difference(acc)) if acc is not None else D
    fallback = {a['cls']: a['fallback'] for a in kc['areas']}
    for p in (flat_polygons(rest) if rest is not None else []):
        c = p.representative_point()
        cand = [(got[k].distance(c), k) for k in ra['insideOrder'] if got.get(k) is not None]
        k = min(cand)[1] if cand else next(fallback[a] for a, g in disp_by_admin.items() if g.intersects(p))
        got[k] = p if got[k] is None else polygonal(got[k].union(p))
    ctry = {f['properties']['ADMIN']: shape(f['geometry']) for f in load('ne_10m_admin_0_countries') if f['properties']['ADMIN'] in ra['outside']}
    for name, k in ra['outside'].items():
        if name not in ctry: raise SystemExit(f'Natural Earth 나라 없음: {name}')
        g = polygonal(polygonal(ctry[name]).intersection(B).difference(D.buffer(1e-7)))
        if g is not None: got[k] = g if got[k] is None else polygonal(got[k].union(g))
    feats = []
    for k, c in ra['classes'].items():
        if got.get(k) is None: continue
        g = polygonal(got[k].intersection(B))
        if g is None: continue
        feats.append({'type': 'Feature', 'geometry': mapping(g),
                      'properties': {'type': 'area', 'cls': c['cls'], 'label': c['label'], 'color': c['color'], 'shade': k}})
    return feats, n_src


def textbook_labels(kc, warp):
    """교과서 지도 틀(위치도 빼고) 안 글자 조각을 설정 labels 의 줄 글자·크기로 찾아 가운데를 옮긴 자리 → Point {type:'label'}"""
    fr = kc['religionAreas']['frame']
    spans = [s for s in pdfkit.page_spans(22) if s['bbox'][0] >= fr[0] and s['bbox'][2] <= fr[2] and s['bbox'][1] >= fr[1] and s['bbox'][3] <= fr[3]]
    feats, used = [], set()
    for lb in kc['labels']:
        boxes, hit = [], None
        for line in lb['lines']:
            hit = next((i for i, s in enumerate(spans) if i not in used and s['text'] == line and abs(s['size'] - lb['size']) < 0.15), None)
            if hit is None: raise SystemExit(f"교과서 22쪽 카슈미르 지도에 글자 없음: {line} ({lb['size']}pt)")
            used.add(hit); boxes.append(spans[hit]['bbox'])
        x0 = min(q[0] for q in boxes); y0 = min(q[1] for q in boxes); x1 = max(q[2] for q in boxes); y1 = max(q[3] for q in boxes)
        if lb.get('lonlat'): lon, lat = lb['lonlat']
        else:
            lo, la = warp((x0 + x1) / 2, (y0 + y1) / 2); lon, lat = float(lo[0]), float(la[0])
        lines = [lb['text']] if lb.get('text') else lb['lines']
        feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
                      'properties': {'type': 'label', 'text': ' '.join(lines), 'lines': lines, 'size': lb['size'], 'color': spans[hit]['color'], 'role': lb['role']}})
    return feats


def build():
    kc = layer_config(LAYER)['kashmir']
    ra = kc['religionAreas']
    warp = tps_fit([a['pt'] for a in ra['anchors']], [a['lonlat'] for a in ra['anchors']])
    disp = {f['properties']['BRK_NAME']: polygonal(shape(f['geometry'])) for f in load('ne_10m_admin_0_disputed_areas')}
    by_admin = {}
    for a in kc['areas']:
        miss = [n for n in a['ne'] if n not in disp]
        if miss: raise SystemExit(f'Natural Earth 분쟁 지역 없음: {miss}')
        by_admin[a['cls']] = unary_union([disp[n] for n in a['ne']])
    feats, n_src = religion_areas(kc, by_admin, warp)
    D = unary_union(list(by_admin.values()))
    # 위치도 강조(앱 위치도가 칠함, 큰 지도에는 그리지 않음 — clip_land 덮개에서도 뺌)
    feats.append({'type': 'Feature', 'geometry': mapping(polygonal(D.simplify(kc['locator']['simplifyDeg'], preserve_topology=True))),
                  'properties': {'type': 'locator', 'label': '카슈미르'}})
    window = D.buffer(kc['windowPadDeg'])
    for c in kc['claims']:
        ctry = [f for f in load(f"ne_10m_admin_0_countries_{c['pov']}") if f['properties']['ADMIN'] == c['admin']]
        if not ctry: raise SystemExit(f"Natural Earth {c['pov']} 관점에 {c['admin']} 없음")
        line = _merge(polygonal(unary_union([shape(f['geometry']) for f in ctry])).boundary.intersection(window))
        feats.append({'type': 'Feature', 'geometry': mapping(line),
                      'properties': {'type': 'line', 'cls': c['cls'], 'label': c['label'], 'color': c['color'], 'pov': c['pov']}})
    lc = kc['loc']
    locs = [shape(f['geometry']) for f in load('ne_10m_admin_0_boundary_lines_land')
            if str(f['properties'].get('FEATURECLA', '')).startswith(lc['featurecla'])]
    if not locs: raise SystemExit('Natural Earth 정전 라인 없음')
    feats.append({'type': 'Feature', 'geometry': mapping(_merge(unary_union(locs).intersection(window))),
                  'properties': {'type': 'line', 'cls': lc['cls'], 'label': lc['label'], 'color': lc['color'], 'dashed': True}})
    feats += textbook_labels(kc, warp)
    legend = ([{**r, 'kind': 'fill'} for r in kc['religion']] +
              [{'cls': c['cls'], 'label': c['label'], 'color': c['color'], 'kind': 'line'} for c in kc['claims']] +
              [{'cls': lc['cls'], 'label': lc['label'], 'color': lc['color'], 'kind': 'line', 'dashed': True}])
    gj = {'type': 'FeatureCollection', 'properties': {'id': LAYER, 'source': kc['sourceText'], 'note': kc['note'], 'legend': legend,
                                                     'approx': True, 'approxReason': ra['approxReason']},
          'features': feats}
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    out = os.path.join(WORK, 'geo', f'{LAYER}.raw.geojson')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(gj, f, ensure_ascii=False)
    print(out, len(feats), f'교과서 종교 면 {n_src}개')


def verify(layer_path, out_png):
    """overlay.py 의 경위도 모드: 왼쪽 = 교과서 쪽 렌더, 오른쪽 = 레이어(정거 원통, 범위 verifyExtent)."""
    kc = layer_config(LAYER)['kashmir']
    with open(layer_path, encoding='utf-8') as f:
        gj = json.load(f)
    areas, paths = [], []
    for ft in gj['features']:
        g, p = ft['geometry'], ft['properties']
        if g['type'] == 'MultiPolygon' and p.get('type') == 'area': areas.append({'color': p['color'], 'polygons': g['coordinates']})
        elif g['type'] in ('LineString', 'MultiLineString'):
            for L in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
                paths.append({'points': L, 'color': p['color'], 'width': 1.2 if p.get('dashed') else 2.0})
    vp = kc['verifyPage']
    ov = {'page': vp['page'], 'bbox': vp['bbox'], 'dpi': vp['dpi'], 'out': out_png, 'title': f'{LAYER}: textbook | Natural Earth layer',
          'lonlatExtent': kc['verifyExtent'], 'areas': areas, 'paths': paths}
    ovf = out_png.replace('.png', '.overlay.json')
    with open(ovf, 'w', encoding='utf-8') as f:
        json.dump(ov, f, ensure_ascii=False)
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'overlay.py'), ovf], check=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) > 1 and sys.argv[1] == '--verify': verify(sys.argv[2], sys.argv[3])
    else: build()
