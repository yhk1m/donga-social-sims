# © 2026 김용현
# scripts/atlas/route_fan.py
"""대권 노선 자료(U1-3g — Ⅰ 세계화 14쪽 「우리나라의 항공망」, 교사 Q10 A, 세계화 단원 전용: 설정 layers[id].type 'routeFan' 이 있을 때만 쓰임, 도장 입력 아님).

교과서 지면: 인천에서 퍼지는 분홍 곡선(획 #f172ac 0.25pt — 대권 아님, 화살촉 없음)과 빨간 도시 점(벡터 원 #ed1c24 지름 약 1.45pt).
Q10 A = 「인천 → 교과서 도시 점을 잇는 대권 곡선」이므로 곡선 모양은 버리고 **점 자리만** 쓴다:
  ① 지도 틀(maps bbox − excludeBoxes) 안 채움 색 dots.fill · 상자 ≤ dots.maxPt 인 도형 = 도시 점(가운데). dupPt 안 겹친 점은 하나로.
  ② 선(lines.stroke)의 양 끝 중 가장 많이 모이는 자리 = 출발점(지면 hub). hub 에서 originPt 안의 점은 출발점 묶음으로 보고 뺌(Q10 「인천 둘레 묶음 점」).
  ③ 선마다 hub 에서 먼 끝 ↔ 가장 가까운 점(tol 안) 짝 — 노선 수(= 점 수, Q10 A)를 교과서 선 수와 대조하는 보고(선 있는 점·선 없는 점·점 없는 선·한 점에 선 여럿).
  ④ 점·hub 를 지도 fit 으로 되돌림(fit_helper invert). 출발점 경위도 = 설정 origin(인천 국제공항 실제 자리 — 까닭 _origin) 이 있으면 그것, 없으면 되돌린 hub.

출력 $ATLAS_WORK/geo/<id>.routes.json = 레이어 자료 그대로(build_layers.mjs 가 <config.out>/layer-<id>.json 으로 옮김 — 앱 worldRoutes.routeFanLayer):
  {type:'FeatureCollection', properties:{id, map, page, title, kind, layerType:'routeFan', origin:[lon, lat], legend:[{cls, label, color, kind:'line'}],
   width, arrow:false}, features:[{properties:{cls}, geometry: MultiPoint(도착 도시들)}]}   (분류마다 Feature 하나 — 점 Feature 188 개면 약 20KB 라
   노선 예산 15KB 를 넘어 MultiPoint 로(약 3KB). 점은 경도 차례, 좌표 소수 digits 자리)
  보고 <id>.routes-report.json(점 수·선 수·짝·hub 경위도·되돌리기 실패), --verify <폴더> 면 지면 위에 되돌린 점(다시 찍음)·대권(지면에 찍음) 그림.

설정(단원 설정 layers[id]): {"type": "routeFan", "map", "origin"?, "dots": {"fill", "maxPt", "dupPt", "originPt"}, "lines": {"stroke", "tolPt"},
  "legend": [{cls, label, color, kind}], "width"(pt), "digits"}

CLI
  python -I scripts/atlas/route_fan.py --unit u1 <레이어 id> [--verify <폴더>]
"""
import json, math, os, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ── 순수 함수(합성 시험 대상) ─────────────────────────────────────────────
def _in(pt, b): return b[0] <= pt[0] <= b[2] and b[1] <= pt[1] <= b[3]


def page_dots(drawings, fill, max_pt, bbox, exclude):
    """[{fill:'#rrggbb', rect:(x0, y0, x1, y1)}] → 도시 점 가운데 [(x, y)] (색 같음 · 두 변 ≤ max_pt · 틀 안 · 덮개 밖)."""
    out = []
    for d in drawings:
        if d.get('fill') != fill: continue
        x0, y0, x1, y1 = d['rect']
        if x1 - x0 > max_pt or y1 - y0 > max_pt: continue
        c = ((x0 + x1) / 2, (y0 + y1) / 2)
        if _in(c, bbox) and not any(_in(c, e) for e in exclude): out.append(c)
    return out


def line_ends(items):
    """PyMuPDF 도형 items → 선의 [처음 점, 끝 점] (선 마디 'l'·곡선 'c' 만 — 사각형 're'·사각형 묶음 'qu' 등은 건너뜀). 선 마디가 없으면 None.
    점은 .x/.y 가 있는 것(fitz.Point) 또는 (x, y)."""
    segs = [it for it in items if it and it[0] in ('l', 'c')]
    if not segs: return None
    xy = lambda p: (p.x, p.y) if hasattr(p, 'x') else (float(p[0]), float(p[1]))
    return [xy(segs[0][1]), xy(segs[-1][-1])]


def hub_of(lines, snap=0.5):
    """선들([[x, y]…])의 양 끝 중 가장 많이 모이는 자리(snap pt 격자로 센 뒤, 그 칸 ± snap 안 끝점들의 평균)."""
    ends = [p for l in lines for p in (l[0], l[-1])]
    if not ends: raise ValueError('선이 없어 출발점을 찾을 수 없음')
    key = lambda p: (round(p[0] / snap), round(p[1] / snap))
    k, _ = Counter(key(p) for p in ends).most_common(1)[0]
    near = [p for p in ends if abs(key(p)[0] - k[0]) <= 1 and abs(key(p)[1] - k[1]) <= 1]
    return (sum(p[0] for p in near) / len(near), sum(p[1] for p in near) / len(near))


def clean_dots(dots, hub, dup_pt=0.3, origin_pt=2.0):
    """겹친 점(dup_pt 안 — 앞 것만)·출발점 묶음(hub 에서 origin_pt 안)을 뺀 점과 보고."""
    keep, dup, org = [], 0, 0
    for p in dots:
        if math.dist(p, hub) <= origin_pt: org += 1; continue
        if any(math.dist(p, q) <= dup_pt for q in keep): dup += 1; continue
        keep.append(p)
    return keep, {'duplicates': dup, 'originCluster': org}


def match_dots(dots, lines, hub, tol=1.0):
    """선마다 hub 에서 먼 끝 ↔ 가장 가까운 점(tol 안). {withLine:[점 i], lineless:[점 i], loose:[선 j], shared:{점 i: 선 수(≥ 2)}}"""
    cnt = Counter(); loose = []
    for j, l in enumerate(lines):
        far = l[-1] if math.dist(l[0], hub) <= math.dist(l[-1], hub) else l[0]
        best = min(range(len(dots)), key=lambda i: math.dist(dots[i], far)) if dots else None
        if best is None or math.dist(dots[best], far) > tol: loose.append(j); continue
        cnt[best] += 1
    return {'withLine': sorted(cnt), 'lineless': [i for i in range(len(dots)) if i not in cnt], 'loose': loose,
            'shared': {i: n for i, n in sorted(cnt.items()) if n > 1}}


def layer_json(cfg, m, origin, lonlats, rep=None):
    """설정·지도 항목·출발점·도착 경위도(None = 되돌리기 실패) → 레이어 자료(MultiPoint 하나 — 점은 경도 차례, 실패는 뺌).
    소수 digits 자리로 반올림해 같아진 점(서로 다른 지면 점이 같은 좌표)은 하나만 남기되 rep['roundMerged'] = [[좌표, 합쳐진 수]…] 로 알린다(조용히 줄이지 않음)."""
    legend = cfg.get('legend') or []
    if len(legend) != 1: raise ValueError(f"{cfg.get('id')}: routeFan 범례는 하나(노선) — {len(legend)}")
    nd = cfg.get('digits', 2)
    cnt = Counter((round(p[0], nd), round(p[1], nd)) for p in lonlats if p)
    if rep is not None: rep['roundMerged'] = [[list(k), n] for k, n in sorted(cnt.items()) if n > 1]
    pts = sorted(cnt)
    cls = legend[0]['cls']
    return {'type': 'FeatureCollection',
            'properties': {'id': cfg['id'], 'map': cfg['map'], 'page': m.get('page'), 'title': cfg.get('title') or m.get('title'), 'kind': m.get('kind'),
                           'layerType': 'routeFan', 'origin': [round(v, 4) for v in origin], 'legend': legend, 'width': cfg.get('width', 0.6), 'arrow': False},
            'features': [{'type': 'Feature', 'properties': {'cls': cls}, 'geometry': {'type': 'MultiPoint', 'coordinates': [list(p) for p in pts]}}]}


# ── 지면(PDF·fit) ───────────────────────────────────────────────────────
def page_items(m, cfg):
    """지도 쪽 도형 → (점 후보 [{fill, rect}], 선 [[x, y]…])."""
    from atlas_common import drawings, hexc
    dcol, lcol = cfg['dots']['fill'], cfg['lines']['stroke']
    cand, lines = [], []
    bb = m['bbox']
    for d in drawings(m['page']):
        r = d['rect']
        if r.x1 < bb[0] or r.x0 > bb[2] or r.y1 < bb[1] or r.y0 > bb[3]: continue
        if d.get('fill') is not None and hexc(d['fill']) == dcol:
            cand.append({'fill': dcol, 'rect': (r.x0, r.y0, r.x1, r.y1)})
        if d.get('color') is not None and hexc(d['color']) == lcol:
            ends = line_ends(d['items'])
            if ends: lines.append(ends)
    return cand, lines


def build(layer_id, log=print):
    from atlas_common import layer_config, maps
    from continent_layers import load_fit, invert_points
    cfg = layer_config(layer_id)
    if cfg.get('type') != 'routeFan': raise ValueError(f'{layer_id}: type 이 routeFan 이 아님')
    m = maps()[cfg['map']]
    dc, lc = cfg['dots'], cfg['lines']
    cand, lines = page_items(m, cfg)
    raw = page_dots(cand, dc['fill'], dc.get('maxPt', 2.5), m['bbox'], m.get('excludeBoxes') or [])
    hub = hub_of(lines)
    dots, crep = clean_dots(raw, hub, dc.get('dupPt', 0.3), dc.get('originPt', 2.0))
    mt = match_dots(dots, lines, hub, lc.get('tolPt', 1.0))
    fit = load_fit(cfg['map'])
    ll = invert_points(fit, [hub, *dots])
    hub_ll, dll = ll[0], ll[1:]
    origin = cfg.get('origin') or hub_ll
    if not origin: raise ValueError(f'{layer_id}: 출발점 경위도 없음(설정 origin 도, 되돌린 hub 도)')
    mrep = {}
    out = layer_json(cfg, m, origin, dll, mrep)
    r2 = lambda p: [round(v, 2) for v in p] if p else None
    rep = {'pageDots': len(raw), **crep, 'dots': len(dots), 'lines': len(lines), 'hubPt': [round(v, 2) for v in hub], 'hubLonLat': r2(hub_ll),
           'origin': out['properties']['origin'],
           'hubToOriginKm': round(6371 * _gc(hub_ll, origin), 1) if hub_ll else None,
           'dotsWithLine': len(mt['withLine']), 'linelessDots': [r2(dll[i]) for i in mt['lineless']], 'looseLines': mt['loose'],
           'sharedDots': {str(i): n for i, n in mt['shared'].items()}, 'invertFailed': sum(1 for p in dll if not p), 'routes': sum(len(f['geometry']['coordinates']) for f in out['features']), 'roundMerged': mrep['roundMerged'],
           '_page': [list(p) for p in dots]}
    return out, rep


def _gc(a, b):
    la1, la2 = math.radians(a[1]), math.radians(b[1]); dl = math.radians(b[0] - a[0])
    return math.acos(max(-1, min(1, math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(dl))))


def great_circle(a, b, step=1.0):
    """경위도 대권 줄(검증 그림용 — 앱 worldRoutes.greatCircle 과 같은 뜻)."""
    d = math.degrees(_gc(a, b))
    if d < 1e-9: return [list(a)]
    n = max(1, math.ceil(d / step))
    def xyz(p):
        lo, la = math.radians(p[0]), math.radians(p[1]); return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    A, B = xyz(a), xyz(b); w = _gc(a, b); out = []
    for i in range(n + 1):
        t = i / n; s1, s2 = math.sin((1 - t) * w) / math.sin(w), math.sin(t * w) / math.sin(w)
        x, y, z = (s1 * A[k] + s2 * B[k] for k in range(3))
        out.append([math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))])
    return out


def verify(layer_id, out_dir, dpi=200):
    """지면 위에: 뽑은 점(초록) · 되돌린 경위도를 다시 찍은 점(빨강) · 대권(파랑 — 투영 가장자리에서 끊음). 경로."""
    import overlay
    from atlas_common import WORK, layer_config, maps
    from continent_layers import load_fit
    from shape_controls import node
    cfg = layer_config(layer_id); m = maps()[cfg['map']]; fit = load_fit(cfg['map'])
    with open(os.path.join(WORK, 'geo', f'{layer_id}.routes.json'), encoding='utf-8') as f: lay = json.load(f)
    with open(os.path.join(WORK, 'geo', f'{layer_id}.routes-report.json'), encoding='utf-8') as f: rep = json.load(f)
    o = lay['properties']['origin']
    dests = [q for f in lay['features'] for q in f['geometry']['coordinates']]
    lines = [great_circle(o, d) for d in dests]
    res = node([{'op': 'apply', 'fit': fit, 'rings': [dests, *lines]}])[0]
    back, plines = res[0], res[1:]
    paths = []
    for pl in plines:   # 지면에서 크게 뛰는 마디(투영 가장자리 넘음)에서 끊음
        run = []
        for q in pl:
            if q and run and math.dist(q, run[-1]) > 40: paths.append(run); run = []
            if q: run.append(q)
        if len(run) > 1: paths.append(run)
    ov = {'page': m['page'], 'bbox': m['bbox'], 'dpi': dpi, 'out': os.path.join(out_dir, f'{layer_id}.png').replace(os.sep, '/'),
          'title': f'{layer_id} (green = page dot, red = lon/lat -> page, blue = great circle)', 'lines': [], 'cps': [],
          'points': [{'xy': p, 'color': '#00a651'} for p in rep['_page']] + [{'xy': q, 'color': '#ff0000'} for q in back if q],
          'paths': [{'points': p, 'color': '#2b6cb0', 'width': 0.6} for p in paths]}
    ovf = os.path.join(WORK, 'geo', f'{layer_id}.routes.overlay.json')
    with open(ovf, 'w', encoding='utf-8', newline='\n') as f: json.dump(ov, f)
    overlay.main(ovf)
    return ov['out']


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    from atlas_common import WORK
    if '--unit' in argv: k = argv.index('--unit'); argv = argv[:k] + argv[k + 2:]   # atlas_common 이 단원을 이미 골랐음
    vdir = argv[argv.index('--verify') + 1] if '--verify' in argv else None
    ids = [a for a in argv if not a.startswith('--') and a != vdir]
    if not ids: print('사용: route_fan.py --unit u1 <레이어 id> [--verify <폴더>]'); return 2
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    for lid in ids:
        out, rep = build(lid)
        p = os.path.join(WORK, 'geo', f'{lid}.routes.json')
        with open(p, 'w', encoding='utf-8', newline='\n') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(WORK, 'geo', f'{lid}.routes-report.json'), 'w', encoding='utf-8', newline='\n') as f: json.dump(rep, f, ensure_ascii=False, indent=1)
        print(f"{lid}: 노선 {rep['routes']}(지면 점 {rep['pageDots']} · 겹침 {rep['duplicates']} · 출발점 묶음 {rep['originCluster']}) · 교과서 선 {rep['lines']}"
              f"(선 있는 점 {rep['dotsWithLine']} · 선 없는 점 {len(rep['linelessDots'])} · 점 없는 선 {len(rep['looseLines'])}) · hub {rep['hubLonLat']}"
              f"(origin 과 {rep['hubToOriginKm']}km) · {os.path.getsize(p)} B → {p}")
        if vdir: os.makedirs(vdir, exist_ok=True); print(verify(lid, vdir))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
