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
  설정 countryOverrides {iso: {cls | label, why}} 로 고친다(cls 는 범례 번호 'c3' 또는 null = 분류 없음, label 은 범례 이름) —
  교과서와 Natural Earth 의 나라 단위가 다른 곳(서사하라·코소보·북키프로스 등). 고친 것은 출력 overrides 에 [{iso, cls, why, was}].

설정(단원 설정 layers[id]): {"map", "type": "countryClass", "mode": "vector"|"raster"(기본 vector), "expectLegend"?,
  "countryOverrides"?, "samplesGrid"?(기본 3)} + defaults(matchDE·legendSwatchArea 등 — 면 레이어와 같음).

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


def apply_overrides(classes, overrides, legend):
    """설정 countryOverrides {iso: {cls | label, why}} 적용 → (새 classes, [{iso, cls, why, was}]). 범례에 없는 cls·label 은 오류."""
    by_label = {e['label']: e['cls'] for e in legend}
    known = {e['cls'] for e in legend}
    out, log = dict(classes), []
    for iso, o in (overrides or {}).items():
        if iso.startswith('_'): continue
        if 'label' in o:
            if o['label'] not in by_label: raise ValueError(f'countryOverrides {iso}: 범례에 없는 이름 {o["label"]}')
            cls = by_label[o['label']]
        else:
            cls = o.get('cls')
            if cls is not None and cls not in known: raise ValueError(f'countryOverrides {iso}: 범례에 없는 분류 {cls}')
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


# ── 지도 하나 ────────────────────────────────────────────────────────────
def ne_countries():
    with open(os.path.join(WORK, NE_COUNTRIES), encoding='utf-8') as f:
        return [(ft['properties']['ADM0_A3'], shape(ft['geometry'])) for ft in json.load(f)['features']]


def frame_window(fit, bbox, n=40):
    """지도 틀(bbox) 둘레를 n 등분한 점을 fit 으로 되돌린 경위도 면(되돌릴 수 없는 점은 뺌). 점이 모자라면 None."""
    from shape_controls import node
    x0, y0, x1, y1 = bbox
    t = np.linspace(0, 1, n, endpoint=False)
    ring = ([[x0 + (x1 - x0) * u, y0] for u in t] + [[x1, y0 + (y1 - y0) * u] for u in t] +
            [[x1 - (x1 - x0) * u, y1] for u in t] + [[x0, y1 - (y1 - y0) * u] for u in t])
    ll = [p for p in node([{'op': 'invert', 'fit': fit, 'pts': ring}])[0] if p]
    if len(ll) < 4: return None
    from shapely.geometry import Polygon
    return polygonal(Polygon(ll).buffer(0))


def project_samples(fit, by_iso):
    """{iso: [(lon, lat)]} → {iso: [지면 xy | None]} (fit_helper.mjs 한 번)."""
    from shape_controls import node
    isos = list(by_iso)
    res = node([{'op': 'apply', 'fit': fit, 'rings': [[list(p) for p in by_iso[i]] for i in isos]}])[0]
    return {iso: xy for iso, xy in zip(isos, res)}


def build(layer_id):
    import legend as LG, zones as Z
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
    order = [e['cls'] for e in leg]
    classes, rep = classify_countries(ne_countries(), lambda by: project_samples(fit, by), zones, order, frame(m), cfg.get('samplesGrid', 3),
                                      frame_window(fit, m['bbox']))
    classes, ov = apply_overrides(classes, cfg.get('countryOverrides'), leg)
    for iso in rep['split']:
        if not any(o['iso'] == iso for o in ov): warnings.append(f'{iso}: 표본 분류가 반으로 갈림 {rep["votes"][iso]}')
    present = set(classes.values())
    absent = [e['label'] for e in leg if e['cls'] not in present]
    if absent: warnings.append(f'나라가 없는 범례 분류: {absent}')
    legend = [{k: e[k] for k in ('cls', 'color', 'label', 'kind') if k in e} for e in leg]
    rep.update(zrep, countries=len(classes), warnings=warnings, fitFamily=fit['family'], approx=bool(fit.get('approx')))
    return {'id': layer_id, 'map': cfg['map'], 'legend': legend, 'classes': dict(sorted(classes.items())), 'overrides': ov, 'report': rep}


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ids = [a for a in argv if not a.startswith('--')]
    if not ids: print('사용: country_class.py <레이어 id ...>'); return 2
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    for lid in ids:
        r = build(lid)
        p = os.path.join(WORK, 'geo', f'{lid}.cc.json')
        with open(p, 'w', encoding='utf-8') as f: json.dump(r, f, ensure_ascii=False)
        rr = r['report']
        print(f"{lid}: 나라 {len(r['classes'])} · 범례 {len(r['legend'])} · 고침 {len(r['overrides'])} · 지도 밖 {len(rr['absent'])} · "
              f"분류 없음 {len(rr['unclassified'])} · 갈림 {len(rr['split'])} → {p}")
        for w in rr['warnings']: print(f'  경고 {lid}: {w}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
