# © 2026 김용현
# scripts/atlas/country_class.py
"""나라 단위 단계구분도(countryClass, 2단계 설계 §6.2-8): 나라 하나가 한 색인 지도를 교과서 채움 도형을 따라 그리지 않고 나라마다 분류한다.

원리
  바탕 지도와 같은 Natural Earth 50m 나라(raw/ne/ne_50m_admin_0_countries.geojson, iso = ADM0_A3)마다 안쪽 표본점
  (representative_point + 나라 경위도 상자 3×3 격자 중 나라 안 점 — 나라 ∩ 지도 틀을 되돌린 경위도 면에서)을 지도 fit 정변환(fit_helper.mjs — 앱과 같은 georef.mjs)으로 지면에 찍고,
  그 자리의 범례색 채움 면(zones.vector_zones — 범례색 Lab ΔE ≤ matchDE, 뒤에 그린 다른 분류가 가린 곳은 뺌 = 위에 그린 것 우선,
  mode 'raster' 면 zones.raster_zones 화소 분류)에 든 분류로 다수결한다.
    - 표본이 모두 지도 틀(덮개 상자 뺀 면) 밖이면 그 나라는 지도에 없음(분류 없음).
    - 틀 안 표본이 어느 분류 면에도 안 들면(바다·흰 곳) 표를 세지 않는다. 표가 하나도 없으면 분류 없음(보고서 unclassified).
    - 가장 많은 표가 받은 표의 절반 이하면 경고(표본 반이 갈림 — 교과서와 Natural Earth 나라 단위가 다르거나 경계 어긋남).
      같은 표면 representative_point 의 분류, 그것도 아니면 범례 차례가 앞선 분류.
  두 상세도: 앱은 확대에 따라 바탕 지도 50m 또는 10a(10m 을 단원 상자 basemap.unitBoxes 로 자른 것) 나라를 칠한다. 그래서 10a 에만 있는 나라
  (지브롤터·키프로스의 영국 기지·유엔 완충 지대·바이코누르 — extra_10a)도 10m 도형으로 같이 분류하고, 분류·고침 iso 가 두 상세도 중 어디에
  있는지 보고서 levels {only50, only10a, neither} 에 남긴다(neither·only50 은 경고).
  작은 나라(지면 넓이 < smallPt2, 기본 8pt² — 몰타·모나코·산마리노·바티칸·리히텐슈타인·안도라·룩셈부르크·채널 제도 등): 분류가 없거나
  표본이 든 분류 조각이 나라보다 훨씬 크면(교과서가 따로 칠하지 않아 이웃 면에 묻힘) 경고 → countryOverrides 로 확인(같은 값이라도 까닭을 적음).
  설정 countryOverrides {iso: {cls | label, why}} 로 고친다(cls 는 범례 번호 'c3' 또는 null = 분류 없음, label 은 범례 이름) —
  교과서와 Natural Earth 의 나라 단위가 다른 곳(서사하라·코소보·북키프로스 등). 고친 것은 출력 overrides 에 [{iso, cls, why, was}].

  윤곽만 분류(설정 legendStyles {범례 이름: 'outline'} — 32쪽 유로 사용국 노란 띠)는 다수결에서 빼고(띠가 가린 표본은 표 없음),
  나라 경계를 안쪽으로 0.8pt 줄인 테두리 점의 반 이상이 그 색 띠 안이면 그 분류를 더한다(outline_members) → classes[iso] = [채움, 윤곽].

설정(단원 설정 layers[id]): {"map", "type": "countryClass", "mode": "vector"|"raster"(기본 vector), "expectLegend"?,
  "countryOverrides"?, "legendStyles"?, "samplesGrid"?(기본 3), "smallPt2"?(기본 8)} + defaults(matchDE·legendSwatchArea 등 — 면 레이어와 같음).

출력: $ATLAS_WORK/geo/<id>.cc.json = {id, map, legend:[{cls,color,label,kind}], classes:{iso: cls}, overrides:[…], report:{…, warnings}}
  build_layers.mjs 가 범례 꾸밈(legendColors·legendStyles 등)을 붙여 <config.out>/layer-<id>.json
  {type:'countryClass', properties:{id, map, page, title, …}, legend:[…], classes, overrides} 로 쓴다.

CLI
  python -I scripts/atlas/country_class.py [--unit u3] <레이어 id ...>   (보통 build_layers.mjs 가 부름)
"""
import json, os, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from shapely.geometry import shape, Point
from shapely.prepared import prep
from atlas_common import WORK, maps, layer_config, frame, polygonal

NE_COUNTRIES = 'raw/ne/ne_50m_admin_0_countries.geojson'
SPLIT_FRAC = 0.5     # 가장 많은 표 ≤ 받은 표 × 이 값이면 「표본 반이 갈림」 경고


# ── 표본점 ───────────────────────────────────────────────────────────────
def sample_points(geom, grid=3):
    """나라 면(경위도) → 안쪽 표본점 [(lon, lat)]: 첫째는 representative_point, 이어서 경위도 상자 grid×grid 칸 가운데 중 나라 안 점."""
    g = polygonal(geom)
    if g is None: return []
    out = [tuple(g.representative_point().coords[0])]
    x0, y0, x1, y1 = g.bounds
    pg = prep(g)
    for j in range(grid):
        for i in range(grid):
            p = (x0 + (i + 0.5) * (x1 - x0) / grid, y0 + (j + 0.5) * (y1 - y0) / grid)
            if pg.contains(Point(p)): out.append(p)
    return out


# ── 분류 ─────────────────────────────────────────────────────────────────
def zone_at(xy, zones, order):
    """지면 점 → 그 점을 담은 분류(zones {cls: 면}, 분류끼리 겹치지 않음 — vector_zones 가 위에 그린 것 우선으로 이미 뺐음) 또는 None."""
    pt = Point(xy)
    for c in order:
        g = zones.get(c)
        if g is not None and g.covers(pt): return c
    return None


def classify(samples, zones, order, fr):
    """samples {iso: [지면 xy | None, …](첫째 = representative_point)} → ({iso: cls}, 보고서).
    틀(fr) 밖 표본은 버림 — 모두 밖이면 그 나라 없음. 다수결, 같은 표면 첫 표본의 분류 → 범례 차례."""
    zs = {c: g for c, g in zones.items() if g is not None}
    fp = prep(fr)
    classes, rep = {}, {'absent': [], 'unclassified': [], 'split': [], 'votes': {}}
    for iso, pts in samples.items():
        inside = [p for p in pts if p is not None and fp.contains(Point(p))]
        if not inside: rep['absent'].append(iso); continue
        votes = [zone_at(p, zs, order) for p in inside]
        first = votes[0] if pts and pts[0] is not None and inside and inside[0] == pts[0] else None
        cnt = Counter(v for v in votes if v is not None)
        if not cnt: rep['unclassified'].append(iso); continue
        top = max(cnt.values())
        tied = [c for c in order if cnt.get(c) == top]
        cls = first if first in tied else tied[0]
        classes[iso] = cls
        rep['votes'][iso] = dict(cnt)
        if top <= SPLIT_FRAC * sum(cnt.values()): rep['split'].append(iso)
    return classes, rep


def outline_members(page_polys, outline_zones, fr, inset=0.8, step=0.5, frac=0.5, tol=0.3):
    """윤곽만 분류(범례 style 'outline' — 32쪽 유로 사용국: 나라 경계 안쪽에 그린 노란 띠) 찾기.
    page_polys {iso: 지면 나라 면}, outline_zones {cls: 지면 띠 면} → {iso: [cls]}.
    나라 면을 inset 만큼 안으로 줄인 테두리 위 step 간격 점 중 틀(fr) 안 점의 frac 이상이 띠(tol 여유) 안이면 그 분류.
    띠는 경계 안쪽에 그려져 있어 이웃 나라(스위스)의 안쪽 테두리는 띠에 닿지 않는다. 줄이면 없어지는 작은 나라는 면의 frac 이상이 띠면."""
    fp = prep(fr)
    zs = {c: (g.buffer(tol), prep(g.buffer(tol))) for c, g in outline_zones.items() if g is not None}
    out = {}
    for iso, P in page_polys.items():
        if P is None or P.is_empty: continue
        inner = P.buffer(-inset)
        hit = []
        for c, (raw, z) in zs.items():
            if inner.is_empty:
                ok = P.intersection(raw).area >= frac * P.area
            else:
                line = inner.boundary
                n = max(4, int(line.length / step))
                pts = [q for q in (line.interpolate(i / n, normalized=True) for i in range(n)) if fp.contains(q)]
                ok = bool(pts) and sum(z.contains(q) for q in pts) >= frac * len(pts)
            if ok: hit.append(c)
        if hit: out[iso] = hit
    return out


def merge_classes(fill, outline):
    """채움 분류 {iso: cls} + 윤곽만 분류 {iso: [cls]} → {iso: cls | [cls, …]} (둘 이상이면 배열 — 채움 먼저)."""
    out = dict(fill)
    for iso, cl in outline.items():
        lst = ([out[iso]] if iso in out else []) + list(cl)
        out[iso] = lst[0] if len(lst) == 1 else lst
    return out


def apply_overrides(classes, overrides, legend):
    """설정 countryOverrides {iso: {cls | label, why}} 적용 → (새 classes, [{iso, cls, why, was}]). 범례에 없는 cls·label 은 오류.
    cls 는 범례 번호·null(분류 없음)·번호 배열(채움 + 윤곽만 분류), label 은 범례 이름 또는 이름 배열."""
    by_label = {e['label']: e['cls'] for e in legend}
    known = {e['cls'] for e in legend}
    out, log = dict(classes), []
    for iso, o in (overrides or {}).items():
        if iso.startswith('_'): continue
        if ('label' in o) == ('cls' in o): raise ValueError(f'countryOverrides {iso}: cls 와 label 중 꼭 하나만 적음')
        if 'label' in o:
            labels = o['label'] if isinstance(o['label'], list) else [o['label']]
            bad = [l for l in labels if l not in by_label]
            if bad: raise ValueError(f'countryOverrides {iso}: 범례에 없는 이름 {bad}')
            cls = [by_label[l] for l in labels]
            cls = cls[0] if len(cls) == 1 else cls
        else:
            cls = o.get('cls')
            bad = [c for c in (cls if isinstance(cls, list) else [cls]) if c is not None and c not in known]
            if bad: raise ValueError(f'countryOverrides {iso}: 범례에 없는 분류 {bad}')
        if not o.get('why'): raise ValueError(f'countryOverrides {iso}: why(까닭)가 없음')
        was = out.get(iso)
        if cls is None: out.pop(iso, None)
        else: out[iso] = cls
        log.append({'iso': iso, 'cls': cls, 'why': o['why'], 'was': was})
    return out, log


def classify_countries(countries, project, zones, order, fr, grid=3, window=None):
    """countries [(iso, 경위도 면)], project({iso: [(lon, lat)]}) → {iso: [xy | None]} → classify 결과. 표본점이 없는 나라는 뺀다.
    window(지도 틀을 경위도로 되돌린 면)가 있으면 나라 ∩ window 에서 표본을 찍는다 — 틀에 일부만 든 큰 나라(러시아·카자흐스탄)도
    틀 안쪽 표본으로 분류되게. window 와 안 겹치는 나라는 지도 밖."""
    by_iso = {}
    for iso, g in countries:
        if window is not None:
            if not g.intersects(window): continue
            g = polygonal(g.intersection(window))
            if g is None: continue
        pts = sample_points(g, grid)
        if pts: by_iso[iso] = pts
    classes, rep = classify(project(by_iso), zones, order, fr)
    rep['absent'] = sorted(set(rep['absent']) | {iso for iso, _ in countries if iso not in by_iso})
    return classes, rep


# ── 두 상세도(50m · 10a)와 작은 나라 ─────────────────────────────────────
def level_check(isos, have50, have10a):
    """분류·고침에 나온 iso 가 앱이 그리는 두 상세도(바탕 지도 countries50 · countries10a) 중 어디에 있는지 →
    {only50, only10a, neither}(정렬). only… 는 그 상세도에서만 칠해짐(다른 상세도에서는 그 나라 도형이 없음), neither 는 어디에도 안 그려짐."""
    isos = set(isos)
    return {'only50': sorted(i for i in isos if i in have50 and i not in have10a),
            'only10a': sorted(i for i in isos if i in have10a and i not in have50),
            'neither': sorted(i for i in isos if i not in have50 and i not in have10a)}


def _in_boxes(g, boxes):
    from shapely.geometry import box as _box
    return any(g.intersects(_box(*b)) for b in boxes)


def extra_10a(c50, c10, boxes):
    """10a(10m 을 단원 상자 boxes 로 자른 상세도)에만 있는 나라 [(iso, 10m 경위도 면)] — 50m 에 없는 iso 중 상자와 겹치는 것
    (지브롤터·키프로스의 영국 기지·유엔 완충 지대·바이코누르 등). 이 나라들도 10m 도형으로 표본을 찍어 분류한다."""
    have = {i for i, _ in c50}
    return [(i, g) for i, g in c10 if i not in have and _in_boxes(g, boxes)]


def component_area(zones, cls, xy):
    """분류 cls 면에서 지면 점 xy 를 담은 조각(다각형 하나)의 넓이(pt²). 없으면 None."""
    from atlas_common import flat_polygons
    g = zones.get(cls) if cls is not None else None
    if g is None: return None
    pt = Point(xy)
    for p in flat_polygons(g):
        if p.covers(pt): return p.area
    return None


def drawn_area(items, xy):
    """벡터 지도: 지면 점 xy 를 덮은 맨 위(마지막에 그린) 범례색 채움 도형 → (cls, 넓이 pt²), 없으면 (None, None).
    items = zones.vector_items 의 [(cls, 면)] 그린 차례. 같은 분류 이웃(안도라 ↔ 에스파냐)과 합친 면 조각으로는 따로 칠했는지 알 수 없어서."""
    pt = Point(xy)
    for c, g in reversed(items):
        if g.covers(pt): return c, g.area
    return None, None


# 작은 나라: 표본점을 덮은 채움 도형이 나라 넓이 × SMALL_COMP_RATIO + SMALL_COMP_PAD 를 넘으면 「교과서가 따로 칠하지 않음(이웃 면에 묻힘)」.
#   비율 3: 교과서가 따로 그린 작은 나라 도형은 Natural Earth 투영 넓이의 0.4~2배(30쪽 룩셈부르크 11.4 ↔ 7.2pt², 안도라 1.97 ↔ 1.3 —
#   교과서가 작은 나라를 조금 크게 그림)라 3배면 여유가 있고, 묻힌 경우는 이웃 나라 넓이라 수백 배(바티칸이 든 이탈리아 1115pt²).
#   여유 2pt²: 바티칸(0.01pt²)·모나코처럼 투영 넓이가 0 에 가까우면 비율만으로는 화소 크기 도형(모나코 0.05·건지섬 0.21pt²)도 「묻힘」이
#   되므로 — 따로 그린 가장 작은 도형들보다 크고 이웃 나라 면보다는 훨씬 작은 값.
SMALL_COMP_RATIO = 3.0
SMALL_COMP_PAD = 2.0     # pt²


def small_state_issues(states, small_pt2):
    """작은 나라(지면 넓이 pt2 < small_pt2: 몰타·모나코·산마리노·바티칸·리히텐슈타인·안도라·룩셈부르크 등) 중 확인이 필요한 것 →
    [(iso, 까닭)](iso 차례). states {iso: {pt2, comp(표본이 든 분류 조각 넓이 | None), cls}}.
    분류가 없거나(띠·범례 상자에 가림) 표본이 든 조각이 나라보다 훨씬 크면(이웃 나라 면에 묻힘 — 교과서가 따로 칠하지 않음) 다수결 값을 믿을 수 없다.
    설정 countryOverrides 에 적으면(같은 값이라도 까닭과 함께 = 확인함) 경고하지 않는다."""
    out = []
    for iso in sorted(states):
        st = states[iso]
        if st['pt2'] >= small_pt2: continue
        if st.get('cls') is None: out.append((iso, '분류 없음(띠·덮개 상자에 가렸거나 바다)'))
        elif st.get('comp') is None or st['comp'] > SMALL_COMP_RATIO * st['pt2'] + SMALL_COMP_PAD:
            out.append((iso, f"교과서가 따로 칠하지 않음 — 둘레 면({st.get('comp') and round(st['comp'], 1)}pt²)의 분류 {st['cls']}"))
    return out


# ── 지도 하나 ────────────────────────────────────────────────────────────
NE_COUNTRIES_10M = 'raw/ne/ne_10m_admin_0_countries.geojson'


def ne_countries(path=NE_COUNTRIES):
    with open(os.path.join(WORK, path), encoding='utf-8') as f:
        return [(ft['properties']['ADM0_A3'], shape(ft['geometry'])) for ft in json.load(f)['features']]


def check_lon_span(ll):
    """되돌린 틀 고리 [(lon, lat)]의 경도 폭이 180° 를 넘으면(날짜변경선을 넘는 틀 — 경도가 ±180 에서 접혀 면이 지구 반대쪽을 덮음) ValueError."""
    lons = [p[0] for p in ll]
    if lons and max(lons) - min(lons) > 180:
        raise ValueError(f'frame_window: 틀이 날짜변경선을 넘음(경도 {min(lons):.1f}~{max(lons):.1f}) — 아직 다루지 않음')


def frame_window(fit, bbox, n=40):
    """지도 틀(bbox) 둘레를 n 등분한 점을 fit 으로 되돌린 경위도 면(되돌릴 수 없는 점은 뺌). 점이 모자라면 None."""
    from shape_controls import node
    x0, y0, x1, y1 = bbox
    t = np.linspace(0, 1, n, endpoint=False)
    ring = ([[x0 + (x1 - x0) * u, y0] for u in t] + [[x1, y0 + (y1 - y0) * u] for u in t] +
            [[x1 - (x1 - x0) * u, y1] for u in t] + [[x0, y1 - (y1 - y0) * u] for u in t])
    ll = [p for p in node([{'op': 'invert', 'fit': fit, 'pts': ring}])[0] if p]
    if len(ll) < 4: return None
    # 날짜변경선을 넘는 틀은 다루지 않는다(되돌린 경도가 ±180 에서 접혀 면이 지구 반대쪽을 덮음) — 유럽·아시아 지도는 해당 없음.
    # 오세아니아(Ⅵ)처럼 넘는 지도가 나오면 경도를 이어 붙이고 접기(clip_land.fold)를 더할 것.
    check_lon_span(ll)
    from shapely.geometry import Polygon
    return polygonal(Polygon(ll).buffer(0))


def project_countries(fit, countries):
    """[(iso, 경위도 면)] → {iso: 지면 면} (fit_helper.mjs 한 번 — 고리마다 투영, 투영 못 하는 점은 뺌)."""
    from shape_controls import node
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    from atlas_common import flat_polygons
    rings, idx = [], []
    for iso, g in countries:
        for k, p in enumerate(flat_polygons(g)):
            for R in [p.exterior, *p.interiors]:
                rings.append([list(c) for c in R.coords]); idx.append((iso, k))
    res = node([{'op': 'apply', 'fit': fit, 'rings': rings}])[0] if rings else []
    parts = {}
    for (iso, k), xy in zip(idx, res):
        parts.setdefault(iso, {}).setdefault(k, []).append([q for q in xy if q])
    out = {}
    for iso, ps in parts.items():
        polys = [polygonal(Polygon(rs[0], [r for r in rs[1:] if len(r) >= 4]).buffer(0)) for rs in ps.values() if len(rs[0]) >= 4]
        polys = [q for q in polys if q is not None]
        if polys: out[iso] = polygonal(unary_union(polys))
    return out


def project_samples(fit, by_iso):
    """{iso: [(lon, lat)]} → {iso: [지면 xy | None]} (fit_helper.mjs 한 번)."""
    from shape_controls import node
    isos = list(by_iso)
    res = node([{'op': 'apply', 'fit': fit, 'rings': [[list(p) for p in by_iso[i]] for i in isos]}])[0]
    return {iso: xy for iso, xy in zip(isos, res)}


def build(layer_id):
    import legend as LG, zones as Z
    from atlas_common import unit_config
    from shapely.geometry import box as _box
    cfg = layer_config(layer_id)
    m = maps()[cfg['map']]
    warnings = []
    leg = LG.legend(m, cfg)
    if not leg: raise ValueError(f'{layer_id}: 범례 견본이 없음(legendBbox 확인)')
    exp = cfg.get('expectLegend')
    if exp is not None and len(leg) != exp:
        raise ValueError(f'{layer_id}: 범례 {len(leg)}개 ≠ 설정 expectLegend {exp} — {[e["label"] for e in leg]}')
    zones, zrep = (Z.raster_zones if cfg.get('mode') == 'raster' else Z.vector_zones)(m, leg, cfg, warnings)
    with open(os.path.join(WORK, 'geo', f"{cfg['map']}.fit.json"), encoding='utf-8') as f: fit = json.load(f)
    styles = cfg.get('legendStyles') or {}
    outline = [e['cls'] for e in leg if styles.get(e['label']) == 'outline']
    order = [e['cls'] for e in leg if e['cls'] not in outline]
    fill_zones = {c: g for c, g in zones.items() if c not in outline}
    window = frame_window(fit, m['bbox'])
    # 앱은 상세도에 따라 바탕 지도 50m 또는 10a(10m 을 단원 상자로 자른 것) 나라를 칠한다 → 50m 나라 + 10a 에만 있는 나라(10m 도형)를 함께 분류
    boxes = (unit_config().get('basemap') or {}).get('unitBoxes') or []
    c50 = ne_countries()
    c10 = ne_countries(NE_COUNTRIES_10M)
    extras = extra_10a(c50, c10, boxes)
    countries = c50 + extras
    classes, rep = classify_countries(countries, lambda by: project_samples(fit, by), fill_zones, order, frame(m), cfg.get('samplesGrid', 3), window)
    fill = dict(classes)
    near = [(iso, polygonal(g.intersection(window)) if window is not None else g) for iso, g in countries if window is None or g.intersects(window)]
    page = project_countries(fit, [(i, g) for i, g in near if g is not None])
    if outline:   # 윤곽만 분류는 표본 다수결이 아니라 나라 안쪽 테두리가 그 색 띠에 덮였는지로
        om = outline_members(page, {c: zones.get(c) for c in outline}, frame(m))
        classes = merge_classes(classes, om)
        rep['outline'] = {c: sorted(i for i, cl in om.items() if c in cl) for c in outline}
    # 작은 나라: 교과서가 따로 칠하지 않았거나(이웃 면에 묻힘) 띠·범례 상자에 가린 것은 다수결을 믿을 수 없다 → 설정 countryOverrides 로 확인
    #   작은 나라 = 나라 전체가 틀을 되돌린 면 안(일부만 든 큰 나라의 조각은 아님)이고 대표점이 지도 틀(덮개 상자 포함 — 범례 밑 몰타) 안
    bb = _box(*m['bbox'])
    whole = {iso for iso, g in countries if window is None or window.covers(g)}
    items = Z.vector_items(m, [e for e in leg if e['cls'] not in outline], cfg)[0] if cfg.get('mode') != 'raster' else None
    def comp(iso, P):
        xy = P.representative_point().coords[0]
        if items is None: return component_area(fill_zones, fill.get(iso), xy)
        c, a = drawn_area(items, xy)
        return a if c is not None and c == fill.get(iso) else None
    states = {iso: {'pt2': P.area, 'cls': fill.get(iso), 'comp': comp(iso, P)}
              for iso, P in page.items() if iso in whole and P is not None and not P.is_empty and bb.contains(P.representative_point())}
    small = small_state_issues(states, cfg.get('smallPt2', 8.0))
    over = {k for k in (cfg.get('countryOverrides') or {}) if not k.startswith('_')}
    rep['small'] = [{'iso': i, 'why': w, 'overridden': i in over} for i, w in small]
    for iso, why in small:
        if iso not in over: warnings.append(f'{iso}: 작은 나라 — {why} → countryOverrides 로 확인 필요')
    classes, ov = apply_overrides(classes, cfg.get('countryOverrides'), leg)
    for iso in rep['split']:
        if not any(o['iso'] == iso for o in ov): warnings.append(f'{iso}: 표본 분류가 반으로 갈림 {rep["votes"][iso]}')
    # 두 상세도 대조(U3-3 리뷰 중요 1): 분류·고침 iso 가 countries50·countries10a 둘 다에 있는지
    have50 = {i for i, _ in c50}
    have10a = {i for i, g in c10 if _in_boxes(g, boxes)} if boxes else set()
    lv = level_check(set(classes) | over, have50, have10a)
    rep['levels'] = lv
    if lv['neither']: warnings.append(f"두 상세도 어디에도 없는 iso {lv['neither']}")
    if boxes and lv['only50']: warnings.append(f"50m 에만 있어 10a 에서 안 칠해지는 iso {lv['only50']}")
    present = {c for v in classes.values() for c in (v if isinstance(v, list) else [v])}
    absent = [e['label'] for e in leg if e['cls'] not in present]
    if absent: warnings.append(f'나라가 없는 범례 분류: {absent}')
    legend = [{k: e[k] for k in ('cls', 'color', 'label', 'kind') if k in e} for e in leg]
    rep.update(zrep, countries=len(classes), warnings=warnings, fitFamily=fit['family'], approx=bool(fit.get('approx')),
               extra10a=[i for i, _ in extras])
    return {'id': layer_id, 'map': cfg['map'], 'legend': legend, 'classes': dict(sorted(classes.items())), 'overrides': ov, 'report': rep}


def verify(layer_id, out_dir, dpi=200):
    """검증 그림 두 장(overlay.py 두 칸 — 왼쪽 교과서 위 나라 경계, 오른쪽 분류 색): 상세도 50(50m 나라 + 10a 에만 있는 나라)과
    10a(10m 나라). 윤곽만 분류는 나라 안쪽 0.8pt 띠로 칠한다(앱의 노란 테두리). 결과 경로 목록."""
    import overlay
    from atlas_common import unit_config, flat_polygons
    cfg = layer_config(layer_id)
    m = maps()[cfg['map']]
    with open(os.path.join(WORK, 'geo', f'{layer_id}.cc.json'), encoding='utf-8') as f: cc = json.load(f)
    with open(os.path.join(WORK, 'geo', f"{cfg['map']}.fit.json"), encoding='utf-8') as f: fit = json.load(f)
    styles = cfg.get('legendStyles') or {}
    color = {e['cls']: e['color'] for e in cc['legend']}
    outline = {e['cls'] for e in cc['legend'] if styles.get(e['label']) == 'outline'}
    window = frame_window(fit, m['bbox'])
    boxes = (unit_config().get('basemap') or {}).get('unitBoxes') or []
    c50 = ne_countries(); c10 = ne_countries(NE_COUNTRIES_10M)
    outs = []
    for lv, cs in (('50', c50 + extra_10a(c50, c10, boxes)), ('10a', [(i, g) for i, g in c10 if _in_boxes(g, boxes)])):
        cs = [(i, polygonal(g.intersection(window)) if window is not None else g) for i, g in cs if i in cc['classes'] and (window is None or g.intersects(window))]
        page = project_countries(fit, [(i, g) for i, g in cs if g is not None])
        fills, bands = [], []
        for iso, P in page.items():
            for c in ([cc['classes'][iso]] if isinstance(cc['classes'][iso], str) else cc['classes'][iso]):
                if c in outline:
                    g = polygonal(P.difference(P.buffer(-0.8)))
                    if g is not None: bands.append({'color': color[c], 'polygons': [[list(p.exterior.coords), *[list(r.coords) for r in p.interiors]] for p in flat_polygons(g)]})
                else:
                    fills.append({'color': color[c], 'polygons': [[list(p.exterior.coords), *[list(r.coords) for r in p.interiors]] for p in flat_polygons(P)]})
        out = os.path.join(out_dir, f'{layer_id}-{lv}.png').replace(os.sep, '/')
        ov = {'page': m['page'], 'bbox': m['bbox'], 'dpi': dpi, 'out': out, 'title': f'{layer_id} countryClass level {lv}', 'areas': fills + bands}
        ovf = os.path.join(WORK, 'geo', f'{layer_id}-{lv}.overlay.json')
        with open(ovf, 'w', encoding='utf-8') as f: json.dump(ov, f)
        overlay.main(ovf); outs.append(out)
    return outs


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ids = [a for a in argv if not a.startswith('--')]
    if not ids: print('사용: country_class.py <레이어 id ...> [--verify <폴더>]'); return 2
    if '--verify' in argv:   # python -I country_class.py --unit u3 --verify <폴더> <레이어 id ...> (cc.json 이 있어야 함)
        k = argv.index('--verify'); vdir = argv[k + 1]; os.makedirs(vdir, exist_ok=True)
        for lid in [a for a in ids if a != vdir]: verify(lid, vdir)
        return 0
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    for lid in ids:
        r = build(lid)
        p = os.path.join(WORK, 'geo', f'{lid}.cc.json')
        with open(p, 'w', encoding='utf-8') as f: json.dump(r, f, ensure_ascii=False)
        rr = r['report']
        print(f"{lid}: 나라 {len(r['classes'])} · 범례 {len(r['legend'])} · 고침 {len(r['overrides'])} · 지도 밖 {len(rr['absent'])} · "
              f"분류 없음 {len(rr['unclassified'])} · 갈림 {len(rr['split'])} · 작은 나라 확인 {len(rr['small'])} · "
              f"한 상세도만 {rr['levels']['only50'] + rr['levels']['only10a']} → {p}")
        for w in rr['warnings']: print(f'  경고 {lid}: {w}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
