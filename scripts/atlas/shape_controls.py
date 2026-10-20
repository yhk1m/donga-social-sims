# © 2026 김용현
# scripts/atlas/shape_controls.py
"""섬·호수·나라 중심(그리고 곶 끝) 기준점 — 경위선 눈금이 없는 지도의 경위도 맞추기용(1단계 「centroid 기준점」을 자동으로).

원리
  교과서 지도 도형(land_shapes.py → $ATLAS_WORK/vec/<id>.shapes.json)과 Natural Earth 10m 도형(육지 조각·호수·육지 구멍,
  또는 나라 조각)을 지금 맞춘 식(fit)으로 지면에 투영해, 같은 종류(육지/물)·중심 거리 tol 안·넓이 비 areaRatio 안에서
  서로 가장 가까운 짝(양쪽 모두 최선)을 고른다. 기준점 = (교과서 도형 넓이 중심 xy, 투영한 Natural Earth 도형의 지면 넓이 중심을
  되돌린 경위도) — 같은 지면에서 같은 정의의 중심이라 큰 섬도 도법에 따른 중심 차이가 없다.
  insetPt: 교과서 도형이 경계 띠만큼 안으로 줄어든 지도(27쪽 색칠하기 — 나라 면이 굵은 색 띠 안쪽 흰 면)는 투영한 Natural Earth
  도형도 같은 너비만큼 줄인 뒤 넓이·중심을 잰다.
  tips: 해안·국경이 tipWindowPt 거리에서 tipTurnDeg 넘게 꺾이는 점(곶 끝·만 안쪽·국경 꺾인 점)을 양쪽에서 찾아 tipTolPt 안 서로 가장 가까운 짝 →
  (교과서 꼭짓점, 그 Natural Earth 꼭짓점 경위도). 섬 하나뿐인 삽입·나라 하나만 그린 지도(벨기에·이탈리아·아이슬란드)용.
  짝 → 맞추기 → 다시 짝 을 iterations 번 되풀이하고(짝 목록이 같아지면 멈춤 — 끝까지 안 같아지면 경고), 투영식 잔차가 중앙값 + madK·1.4826·MAD(아래 minResidPt)를 넘는 짝을 빼고
  (교과서가 섬을 옮겨 그렸거나 잘못 짝지은 것), 넓은 도형부터 minSpacingPt 간격으로 성기게 고른다.

설정
  단원 설정 shapeControls(수치 기본값 DEFAULTS 를 덮어씀) + 지도 목록 항목 shapes:
    windowPadDeg      지도 틀을 되돌린 경위도 범위에 더하는 여유(°) — 이 안에 걸친 Natural Earth 도형만 투영
    minProjectedFrac  Natural Earth 고리 꼭짓점 중 투영되는 비율이 이보다 낮으면 그 도형은 버림(투영 영역 밖으로 잘린 것)
    seedMaxDistPt     처음 식 씨앗의 교과서 자리 c 가 어느 도형 안에도 없을 때 가장 가까운 도형 중심까지 허용 거리(pt)
    tipMinAreaPt2     꺾인 점을 찾을 교과서 육지 도형의 최소 넓이(pt²)
    tipOverlapFrac    교과서 도형과 가장 많이 겹친 투영 Natural Earth 도형의 겹친 넓이가 교과서 도형 넓이의 이 비율 미만이면 꺾인 점 짝을 찾지 않음
    target: "land"(기본 — 육지 조각·육지 구멍·호수) | "countries"(나라 조각 ADM0_A3 + 호수)
    insetPt, tips(true/false)
    init (처음 식 — 지도 기준점(경위선 교차점 등)이 3개 이상이면 그것으로 시작해 init 은 없어도 됨):
      {"seeds": [{"name", "c": [x, y](교과서 도형 안 한 점 — 어림), "at": [lon, lat](Natural Earth 도형 안 한 점)}, …]}
      {"country": "BEL"} | {"land": [lon, lat]}  — 북쪽이 위인 지도: 교과서 도형(들)과 그 Natural Earth 도형의 넓이·중심으로 닮음 변환
      {"fromMap": "<지도 id>", "land": [lon, lat], "c": [x, y]} — 떼어 놓은 삽입: 그 지도(지도 목록에 적힌 기준점으로 바로 맞춘 식)의
                                                    도법·배율·회전에 이동만 맞춤

출력(--write): 지도 목록 controls 에 src:'shape' 기준점(type 'centroid'·'tip', ne = Natural Earth 이름)을 쓴다(이전 shape 기준점은
  바꿈, 손·도시 기준점은 그대로). 그다음 python -I scripts/atlas/extract_vectors.py --controls all → node scripts/atlas/georef-cli.mjs --all.
  --holdout: shape 기준점을 folds 겹으로 나눠 나머지(+지도 기준점)로 georef-cli 와 같이 맞춘 fit 이 빠진 기준점을 얼마나 맞히는지
  (pt·km) → 단원 작업 폴더 geo/shape-holdout.json.

CLI
  python -I scripts/atlas/shape_controls.py [--unit u3] [지도 id …] [--write] [--holdout]   (지도 id 없으면 shapes 가 있는 지도 모두)
"""
import functools, json, math, os, random, shutil, subprocess, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, Point

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atlas_common import HERE, WORK, maps, unit, unit_config, unit_work, frame, polygonal

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
NODE_TIMEOUT_S = 600
PHASE1_FAMILIES = ['azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson', 'equirectangular', 'mercator']
DEFAULTS = {'maxDistPt': 4.0, 'distFrac': 0.15, 'areaRatio': 1.6, 'minAreaPt2': 1.0, 'minCompactWater': 0.15, 'bigDeg': 40.0,
            'madK': 3.0, 'madFloorPt': 0.3, 'minResidPt': 1.0, 'maxDropFrac': 0.3, 'minSpacingPt': 4.0, 'iterations': 5,
            'tipTurnDeg': 50.0, 'tipTolPt': 2.0, 'tipStepPt': 0.5, 'tipWindowPt': 3.0, 'tipFrameMarginPt': 3.0,
            'tipMinAreaPt2': 20.0, 'tipOverlapFrac': 0.3, 'seedMaxDistPt': 10.0, 'minProjectedFrac': 0.9, 'windowPadDeg': 3.0,
            'folds': 5, 'seed': 7}
NE_FILES = {'land': 'raw/ne/ne_10m_land.geojson', 'lakes': 'raw/ne/ne_10m_lakes.geojson', 'countries': 'raw/ne/ne_10m_admin_0_countries.geojson'}


def opts():
    return {**DEFAULTS, **{k: v for k, v in unit_config().get('shapeControls', {}).items() if not k.startswith('_')}}


def families_for(m):
    """georef.familiesFor 와 같은 규칙: 지도 항목 families → 단원 설정 georef.families → 1단계 8개."""
    return m.get('families') or unit_config().get('georef', {}).get('families') or PHASE1_FAMILIES


# ── node(georef.mjs) ──────────────────────────────────────────────────────
def node(ops, run=subprocess.run):
    """fit_helper.mjs 에 ops 를 보내 결과 목록을 받는다. node 없음·시간 초과·실패는 RuntimeError."""
    exe = shutil.which('node')
    if not exe: raise RuntimeError('node 를 찾을 수 없음(fit_helper.mjs 실행용)')
    try:
        r = run([exe, os.path.join(HERE, 'fit_helper.mjs')], input=json.dumps({'ops': ops}), capture_output=True,
                text=True, encoding='utf-8', cwd=ROOT, timeout=NODE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f'fit_helper.mjs 가 {NODE_TIMEOUT_S}초 안에 끝나지 않음')
    if r.returncode: raise RuntimeError(f'fit_helper.mjs 실패(종료 코드 {r.returncode}): {r.stderr.strip()[-2000:]}')
    return json.loads(r.stdout)['results']


def fit_of(cps, fams):
    return node([{'op': 'fit', 'cps': cps, 'families': fams}])[0]


# ── Natural Earth 도형 ───────────────────────────────────────────────────
def _parts(geom):
    t = geom['type']; cs = geom['coordinates']
    return [cs] if t == 'Polygon' else cs if t == 'MultiPolygon' else []


@functools.lru_cache(maxsize=None)
def ne_polys(target):
    """target('land'|'countries') → [{kind, name, ring: ndarray(경도·위도), bbox, big}] (호수는 둘 다에)."""
    def load(k):
        with open(os.path.join(WORK, NE_FILES[k]), encoding='utf-8') as f: return json.load(f)['features']
    out = []
    def add(kind, name, ring):
        a = np.asarray(ring, float)
        if len(a) < 4: return
        b = (a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max())
        out.append({'kind': kind, 'name': name, 'ring': a, 'bbox': b, 'big': (b[2] - b[0]) > opts()['bigDeg'] or (b[3] - b[1]) > opts()['bigDeg']})
    if target == 'countries':
        for f in load('countries'):
            for p in _parts(f['geometry']): add('land', f['properties']['ADM0_A3'], p[0])
    else:
        for f in load('land'):
            for p in _parts(f['geometry']):
                add('land', 'land', p[0])
                for h in p[1:]: add('water', 'hole', h)
    for f in load('lakes'):
        for p in _parts(f['geometry']): add('water', f['properties'].get('name') or 'lake', p[0])
    return out


def _window(fit, bbox, pad):
    xs = np.linspace(bbox[0], bbox[2], 9); ys = np.linspace(bbox[1], bbox[3], 9)
    ll = [p for p in node([{'op': 'invert', 'fit': fit, 'pts': [[x, y] for x in xs for y in ys]}])[0] if p]
    if not ll: raise RuntimeError('지도 틀을 경위도로 되돌릴 수 없음(처음 식이 틀림?)')
    a = np.asarray(ll)
    return a[:, 0].min() - pad, a[:, 1].min() - pad, a[:, 0].max() + pad, a[:, 1].max() + pad


def project(fit, polys, inset=0.0, min_frac=DEFAULTS['minProjectedFrac']):
    """Natural Earth 도형들을 지면에 투영 → 도형마다 {poly(shapely, inset 적용), pts(투영 꼭짓점), ll(경위도 꼭짓점)} 또는 None."""
    res = node([{'op': 'apply', 'fit': fit, 'rings': [p['ring'].tolist() for p in polys]}])[0]
    out = []
    for p, xy in zip(polys, res):
        ok = [i for i, q in enumerate(xy) if q is not None]
        if len(ok) < 4 or len(ok) < min_frac * len(xy): out.append(None); continue
        P = np.asarray([xy[i] for i in ok]); L = p['ring'][ok]
        g = polygonal(Polygon(P).buffer(0))
        if g is not None and inset > 0: g = polygonal(g.buffer(-inset))
        out.append({'poly': g, 'pts': P, 'll': L} if g is not None else None)
    return out


# ── 짝짓기 ───────────────────────────────────────────────────────────────
def match_centroids(pdf, ne, o):
    """pdf: [{kind, area, c}], ne: [{kind, area, c}|None] → [(i, j)] 서로 가장 좋은 짝(중심 거리·넓이 비)."""
    def score(s, t):
        if t is None or s['kind'] != t['kind']: return None
        tol = max(o['maxDistPt'], o['distFrac'] * math.sqrt(s['area']))
        d = math.dist(s['c'], t['c']); r = t['area'] / s['area']
        if d > tol or not (1 / o['areaRatio'] <= r <= o['areaRatio']): return None
        return d / tol + abs(math.log(r))
    best_i, best_j = {}, {}
    for i, s in enumerate(pdf):
        for j, t in enumerate(ne):
            sc = score(s, t)
            if sc is None: continue
            if i not in best_i or sc < best_i[i][0]: best_i[i] = (sc, j)
            if j not in best_j or sc < best_j[j][0]: best_j[j] = (sc, i)
    return sorted((i, j) for i, (_, j) in best_i.items() if best_j[j][1] == i)


def sharp_vertices(pts, o, fr=None, closed=True):
    """고리(또는 점 줄)의 꺾인 점: tipStepPt 간격으로 다시 찍은 뒤, 앞뒤 tipWindowPt 만큼 떨어진 점으로 잰 진행 방향이
    tipTurnDeg 넘게 꺾이는 곳(볼록·오목 모두 — 곶 끝·만 안쪽·국경 꺾인 점)의 극대점을 tipWindowPt 간격으로 → [(x, y, 원래 번호)].
    fr(틀 면)이 있으면 틀 경계에서 tipFrameMarginPt 안의 점은 뺀다(잘린 자리)."""
    P = np.asarray(pts, float)
    if len(P) < 4: return []
    if closed and np.hypot(*(P[0] - P[-1])) > 1e-9: P = np.vstack([P, P[:1]])
    seg = np.hypot(*np.diff(P, axis=0).T); L = float(seg.sum())
    step = o['tipStepPt']; n = int(L / step)
    if n < 8: return []
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, L, n, endpoint=False)
    Q = np.column_stack([np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])])
    k = max(1, int(round(o['tipWindowPt'] / step)))
    if 2 * k + 1 >= n: return []
    v1 = Q - np.roll(Q, k, axis=0); v2 = np.roll(Q, -k, axis=0) - Q
    ang = np.degrees(np.abs(np.arctan2(v1[:, 0] * v2[:, 1] - v1[:, 1] * v2[:, 0], (v1 * v2).sum(1))))
    if not closed: ang[:k] = 0; ang[-k:] = 0
    edge = fr.boundary if fr is not None else None
    out, taken = [], np.zeros(n, bool)
    for i in np.argsort(-ang):
        if ang[i] < o['tipTurnDeg']: break
        if taken[i]: continue
        lo, hi = i - k, i + k + 1
        idx = np.arange(lo, hi) % n
        taken[idx] = True
        x, y = Q[i]
        if edge is not None and edge.distance(Point(x, y)) < o['tipFrameMarginPt']: continue
        j = int(np.argmin(np.hypot(P[:, 0] - x, P[:, 1] - y)))
        out.append((float(P[j, 0]), float(P[j, 1]), j))
    return out


def match_tips(a, b, tol):
    """두 끝 목록 → 서로 가장 가까운 짝 [(i, j)] (거리 tol 안)."""
    out = []
    for i, p in enumerate(a):
        d = [math.dist(p[:2], q[:2]) for q in b]
        if not d: continue
        j = int(np.argmin(d))
        if d[j] > tol: continue
        back = int(np.argmin([math.dist(b[j][:2], q[:2]) for q in a]))
        if back == i: out.append((i, j))
    return out


# ── 지도 하나 ────────────────────────────────────────────────────────────
def _pdf_shapes(mid):
    with open(os.path.join(WORK, 'vec', f'{mid}.shapes.json'), encoding='utf-8') as f: d = json.load(f)
    for s in d['shapes']: s['poly'] = Polygon(s['ring']).buffer(0)
    return d['shapes']


def _base_controls(m):
    """지도 기준점(경위선 교차점·손·도시) — shape 기준점은 뺀다."""
    import extract_vectors as ev
    return [c for c in ev.controls(m['id']) if c.get('src') != 'shape']


def _shape_controls(m):
    """지도 목록에 이미 적힌 shape 기준점."""
    return [{**c} for c in m.get('controls', []) if c.get('src') == 'shape']


def _ne_for(m, fit, o, with_big=False):
    tgt = m['shapes'].get('target', 'land')
    w = _window(fit, m['bbox'], o['windowPadDeg'])
    return [p for p in ne_polys(tgt) if (with_big or not p['big']) and
            not (p['bbox'][2] < w[0] or p['bbox'][0] > w[2] or p['bbox'][3] < w[1] or p['bbox'][1] > w[3])]


def _sphere_centroid(ring):
    """경위도 고리의 대략 중심(처음 식용)."""
    g = Polygon(ring).buffer(0); c = g.centroid
    return [c.x, c.y]


def _containing(target, ll):
    pt = Point(ll)
    for p in ne_polys(target):
        b = p['bbox']
        if b[0] <= ll[0] <= b[2] and b[1] <= ll[1] <= b[3] and Polygon(p['ring']).buffer(0).contains(pt): return p
    raise ValueError(f'Natural Earth {target} 에 {ll} 를 담은 도형 없음')


def initial_fit(m, base, shapes, o):
    init = m['shapes'].get('init') or {}
    fams = families_for(m); tgt = m['shapes'].get('target', 'land')
    cand = [s for s in shapes if not s['edge'] and s['kind'] == 'land']
    if init.get('seeds'):
        cps = list(base)
        for sd in init['seeds']:
            s = min(cand, key=lambda s: 0 if s['poly'].contains(Point(sd['c'])) else math.dist(s['c'], sd['c']))
            if not s['poly'].contains(Point(sd['c'])) and math.dist(s['c'], sd['c']) > o['seedMaxDistPt']:
                raise ValueError(f"{m['id']}: 씨앗 {sd['name']} 자리 {sd['c']} 근처에 교과서 도형 없음")
            lon, lat = _sphere_centroid(_containing(tgt, sd['at'])['ring'])
            cps.append({'name': sd['name'], 'xy': s['c'], 'lon': lon, 'lat': lat})
        return fit_of(cps, fams)
    if len(base) >= 3 and not init: return fit_of(base, fams)
    if init.get('country') or init.get('land'):
        polys = [p for p in ne_polys(tgt) if p['kind'] == 'land' and p['name'] == init['country']] if init.get('country') else [_containing(tgt, init['land'])]
        if init.get('fromMap'):
            ref = fit_of(_base_controls(maps()[init['fromMap']]) + _shape_controls(maps()[init['fromMap']]), families_for(maps()[init['fromMap']]))
            fit = {'family': ref['family'], 'params': ref['params'], 'sim': dict(ref['sim'])}   # 그 지도 기준점으로 바로 맞춤(fit 파일 차례에 기대지 않게)
            s = min(cand, key=lambda s: 0 if s['poly'].contains(Point(init['c'])) else math.dist(s['c'], init['c'])) if init.get('c') else max(cand, key=lambda s: s['area'])
            pr = project(fit, polys, min_frac=o['minProjectedFrac'])[0]
            c = pr['poly'].centroid
            fit['sim']['tx'] += s['c'][0] - c.x; fit['sim']['ty'] += s['c'][1] - c.y
            return fit
        lon0 = float(np.mean(np.concatenate([p['ring'][:, 0] for p in polys])))
        unit_fit = {'family': 'mercator', 'params': [lon0], 'sim': {'a': 1.0, 'b': 0.0, 'tx': 0.0, 'ty': 0.0}}
        prs = [q['poly'] for q in project(unit_fit, polys, min_frac=o['minProjectedFrac']) if q]
        A1 = sum(g.area for g in prs); C1 = shapely.union_all(prs).centroid
        U = shapely.union_all([s['poly'] for s in cand]); A2 = U.area; C2 = U.centroid
        a = math.sqrt(A2 / A1)
        return {'family': 'mercator', 'params': [lon0], 'sim': {'a': a, 'b': 0.0, 'tx': C2.x - a * C1.x, 'ty': C2.y - a * C1.y}}
    if len(base) >= 3: return fit_of(base, fams)
    raise ValueError(f"{m['id']}: 처음 식을 정할 수 없음 — 지도 기준점 3개 이상 또는 shapes.init 필요")


def find_pairs(m, fit, shapes, o, fr):
    """지금 식으로 짝 → 기준점 후보 목록."""
    inset = m['shapes'].get('insetPt', 0.0)
    ne = _ne_for(m, fit, o)
    pr = project(fit, ne, inset, o['minProjectedFrac'])
    ne_s = [None if q is None else {'kind': p['kind'], 'area': q['poly'].area, 'c': [q['poly'].centroid.x, q['poly'].centroid.y]} for p, q in zip(ne, pr)]
    pdf = [s for s in shapes if not s['edge'] and s['area'] >= o['minAreaPt2'] and (s['kind'] == 'land' or s['compact'] >= o['minCompactWater'])]
    pairs = match_centroids(pdf, ne_s, o)
    cents = [ne_s[j]['c'] for _, j in pairs]
    lls = node([{'op': 'invert', 'fit': fit, 'pts': cents}])[0] if cents else []
    out = []
    for (i, j), ll in zip(pairs, lls):
        if ll is None: continue
        s = pdf[i]
        out.append({'name': f"{ne[j]['name']}@{ll[0]:.2f},{ll[1]:.2f}", 'type': 'centroid', 'kind': s['kind'], 'xy': s['c'], 'lon': ll[0], 'lat': ll[1],
                    'ne': ne[j]['name'], 'area': s['area'], 'matchPt': math.dist(s['c'], ne_s[j]['c'])})
    if m['shapes'].get('tips'):
        neb = _ne_for(m, fit, o, with_big=True)
        nebl = [p for p in neb if p['kind'] == 'land']
        prb = project(fit, nebl, min_frac=o['minProjectedFrac'])
        for s in shapes:
            if s['kind'] != 'land' or s['area'] < o['tipMinAreaPt2']: continue
            best, bi = 0, None
            for k, q in enumerate(prb):
                if q is None: continue
                a = q['poly'].intersection(s['poly']).area if q['poly'].intersects(s['poly']) else 0
                if a > best: best, bi = a, k
            if bi is None or best < o['tipOverlapFrac'] * s['area']: continue
            q = prb[bi]
            inside = np.array([fr.contains(Point(x, y)) for x, y in q['pts']])
            if inside.sum() < 4: continue
            a_t = sharp_vertices(np.asarray(s['ring']), o, fr)
            b_pts = q['pts'][inside]; b_ll = q['ll'][inside]
            b_t = sharp_vertices(b_pts, o, fr, closed=bool(inside.all()))   # 틀 밖 꼭짓점을 뺐으면 닫힌 고리가 아니다(잘린 양 끝을 잇지 않음)
            for i, j in match_tips(a_t, b_t, o['tipTolPt']):
                lon, lat = b_ll[b_t[j][2]]
                out.append({'name': f"tip:{nebl[bi]['name']}@{lon:.2f},{lat:.2f}", 'type': 'tip', 'kind': 'land', 'xy': [a_t[i][0], a_t[i][1]],
                            'lon': float(lon), 'lat': float(lat), 'ne': nebl[bi]['name'], 'area': 0.0, 'matchPt': math.dist(a_t[i][:2], b_t[j][:2])})
    return out


def select(m, base, cand, o):
    """잔차로 거르기 → 간격으로 성기게. 반환 (고른 것, 보고)."""
    fams = families_for(m); rep = {'mad': [], 'spacing': 0}
    cur = list(cand); n0 = len(cur)
    while cur:
        if len(base) + len(cur) <= 4: break   # 더 빼면 맞추기에 쓸 점이 모자람
        fit = fit_of(base + cur, fams)
        r = fit['resid'][len(base):]
        med = float(np.median(r)); mad = float(np.median(np.abs(np.asarray(r) - med)))
        lim = max(o['minResidPt'], med + o['madK'] * 1.4826 * max(mad, o['madFloorPt']))
        w = int(np.argmax(r))
        if r[w] <= lim or len(rep['mad']) >= o['maxDropFrac'] * n0: break
        rep['mad'].append(f"{cur[w]['name']} {r[w]:.2f}pt>{lim:.2f}")
        cur.pop(w)
    cur.sort(key=lambda c: (c['type'] != 'centroid', -c['area']))
    chosen, taken = [], [c['xy'] for c in base]
    for c in cur:
        if any(math.dist(c['xy'], t) < o['minSpacingPt'] for t in taken): rep['spacing'] += 1; continue
        chosen.append(c); taken.append(c['xy'])
    return chosen, rep


def run_map(mid, o=None, log=print):
    o = o or opts()
    m = maps()[mid]; fr = frame(m)
    shapes = _pdf_shapes(mid)
    base = _base_controls(m)
    fit = initial_fit(m, base, shapes, o)
    fams = families_for(m)
    prev = None
    for it in range(o['iterations']):
        cand = find_pairs(m, fit, shapes, o, fr)
        key = sorted((round(c['xy'][0], 1), round(c['xy'][1], 1)) for c in cand)
        if len(base) + len(cand) < 4: raise RuntimeError(f'{mid}: 짝이 {len(cand)}개뿐 — 처음 식·설정 확인')
        fit = fit_of(base + cand, fams)
        log(f'  {mid} 되풀이 {it + 1}: 짝 {len(cand)} (중심 {sum(c["type"] == "centroid" for c in cand)} · 끝 {sum(c["type"] == "tip" for c in cand)}), '
            f'{fit["family"]} rms {fit["rmsPt"]:.2f}pt')
        if key == prev: break
        prev = key
    else:
        log(f'  경고 {mid}: 되풀이 {o["iterations"]}번 안에 짝 목록이 같아지지 않음(수렴 안 함) — 마지막 짝으로 계속')
    chosen, rep = select(m, base, cand, o)
    fit = fit_of(base + chosen, fams)
    return {'id': mid, 'base': base, 'chosen': chosen, 'report': rep, 'fit': fit}


def holdout(res, o):
    """shape 기준점 folds 겹 나누기: 나머지(+지도 기준점)로 georef-cli 와 같이 맞춘 fit → 빠진 기준점 오차(pt, km)."""
    m = maps()[res['id']]; fams = families_for(m)
    ch = list(res['chosen']); rnd = random.Random(o['seed']); rnd.shuffle(ch)
    k = min(o['folds'], len(ch))
    if k < 2: return None
    ops, tests = [], []
    for f in range(k):
        test = [c for i, c in enumerate(ch) if i % k == f]; train = [c for i, c in enumerate(ch) if i % k != f]
        ops.append({'op': 'fit', 'cps': [_cp(c) for c in res['base'] + train], 'families': fams, 'cli': True}); tests.append(test)
    fits = node(ops)
    q = []
    for fit, test in zip(fits, tests):
        q.append({'op': 'apply', 'fit': fit, 'rings': [[[c['lon'], c['lat']] for c in test]]})
        q.append({'op': 'invert', 'fit': fit, 'pts': [c['xy'] for c in test]})
    rs = node(q)
    pt, km = [], []
    for t, (test) in enumerate(tests):
        ap = rs[2 * t][0]; iv = rs[2 * t + 1]
        for c, a, ll in zip(test, ap, iv):
            pt.append(math.dist(a, c['xy']) if a else float('inf'))
            km.append(_km(ll, (c['lon'], c['lat'])) if ll else float('inf'))
    st = lambda v: {'n': len(v), 'median': round(float(np.median(v)), 2), 'mean': round(float(np.mean(v)), 2),
                    'p90': round(float(np.quantile(v, 0.9)), 2), 'max': round(float(np.max(v)), 2)}
    return {'folds': k, 'pt': st(pt), 'km': st(km)}


def _km(a, b):
    R = 6371.0; r = math.pi / 180
    h = math.sin((b[1] - a[1]) * r / 2) ** 2 + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin((b[0] - a[0]) * r / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))


def _cp(c):
    return {k: c[k] for k in ('name', 'xy', 'lon', 'lat', 'src') if k in c}


def write_maps(results):
    """고른 기준점을 지도 목록 controls 에 src:'shape' 로 쓴다(이전 shape 기준점은 바꿈). 다른 항목은 글자 하나 바뀌지 않는다."""
    path = unit()['maps_path']
    with open(path, encoding='utf-8') as f: ms = json.load(f)
    by = {r['id']: r for r in results}
    note = unit_config().get('shapeControls', {}).get('note')
    for m in ms:
        r = by.get(m['id'])
        if not r: continue
        new = [{'name': c['name'], 'type': c['type'], 'src': 'shape', 'xy': [round(c['xy'][0], 2), round(c['xy'][1], 2)],
                'lon': round(c['lon'], 4), 'lat': round(c['lat'], 4), 'ne': c['ne']} for c in r['chosen']]
        m['controls'] = [c for c in m.get('controls', []) if c.get('src') != 'shape'] + new
        if new and note: m['controlsNote'] = note
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(ms, ensure_ascii=False, indent=1) + '\n')


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ids = [a for a in argv if not a.startswith('--')] or [k for k, m in maps().items() if 'shapes' in m]
    o = opts(); results, hold = [], {}
    for mid in ids:
        r = run_map(mid, o)
        f = r['fit']; rr = r['report']
        print(f"{mid}: 지도 기준점 {len(r['base'])} + 도형 기준점 {len(r['chosen'])} (중심 {sum(c['type'] == 'centroid' for c in r['chosen'])} · 끝 {sum(c['type'] == 'tip' for c in r['chosen'])}), "
              f"잔차로 뺌 {len(rr['mad'])}, 간격으로 뺌 {rr['spacing']} → {f['family']} rms {f['rmsPt']:.2f}pt mean {f['meanPt']:.2f}pt")
        if rr['mad']: print('   잔차:', ', '.join(rr['mad']))
        if '--holdout' in argv:
            h = holdout(r, o); hold[mid] = h
            if h: print(f"   겹 나누기({h['folds']}겹) 빠진 기준점 오차: pt {h['pt']} / km {h['km']}")
        results.append(r)
    if '--holdout' in argv:
        p = unit_work('geo/shape-holdout.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
        old = {}
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f: old = json.load(f).get('maps', {})
        with open(p, 'w', encoding='utf-8') as f: json.dump({'folds': o['folds'], 'seed': o['seed'], 'maps': {**old, **hold}}, f, ensure_ascii=False, indent=1)
        print(f'겹 나누기 결과 → {p}')
    if '--write' in argv:
        write_maps(results); print(f"{os.path.basename(unit()['maps_path'])} controls 에 src:'shape' 기준점을 씀")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
