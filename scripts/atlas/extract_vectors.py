# © 2026 김용현
# scripts/atlas/extract_vectors.py
"""지도 영역의 벡터 자료 뽑기. 지금은 경위도 맞추기용 기준점(--controls)만 한다.

기준점 만드는 방법
  - maps_u2.json 의 graticuleLabels 가 true 인 지도(p16·p18·p19·p21-climate): 경위선 교차점.
    경위선 = 길고 매끈한 가는 선(획 굵기 ≤ 0.6, 점선 아님) 또는 아주 얇은 채움 도형(굵은 선을 면으로 바꾼 것).
    눈금 글자(`120˚E`, `40°N`, `0˚`; ˚ U+02DA 와 ° 둘 다)마다 가장 가까운 선을 찾아 그 선에 경도·위도를 붙이고,
    경선 × 위선 교차점을 선분 교차로 구한다. 같은 (경도, 위도) 교차점이 여럿이면(면으로 그린 선의 두 가장자리 등) 평균한다.
  - 그 밖의 지도: maps_u2.json 의 controls(손으로 적은 해안 특징점·섬 중심)를 그대로 쓴다.
  - maps_u2.json 에 "georef": false 인 지도(p22-kashmir): 기준점 없음(양식화된 모식도, 계획서 '실행 중 결정' 참고).

CLI
  python -I scripts/atlas/extract_vectors.py --controls p16-asia            → 표준 출력에 JSON
  python -I scripts/atlas/extract_vectors.py --controls all [--out DIR]     → DIR/<id>.controls.json
     (기본 DIR = $ATLAS_WORK/vec, ATLAS_WORK 기본값 C:/Users/Public/atlas-work)
"""
import json, os, re, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdfkit

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('ATLAS_WORK', 'C:/Users/Public/atlas-work')

# ── 상수(지면 단위 pt) ───────────────────────────────────────────────────
LABEL_MARGIN = 16        # 눈금 글자는 지도 틀 바깥 여백(약 10pt)에도 있다
LINE_MIN_LEN = 40        # 경위선 조각은 적어도 이만큼 길다(짧은 강·기호 제외)
LINE_MIN_ITEM_LEN = 12   # 경위선은 마디(직선·곡선 하나)가 길다. 강·국경은 마디가 2~5pt 로 짧다
STROKE_MAX_WIDTH = 0.6   # 경위선 획 굵기 상한(실측 0.15~0.2)
FILL_MAX_THICKNESS = 0.5 # 선을 면으로 바꾼 도형: 넓이/둘레 상한(실측 약 0.1)
EDGE_TOL = 1.0           # 이 안에서 지도 틀과 겹치는 선은 틀 자체로 본다
BEZIER_STEPS = 16        # 곡선 하나를 16 등분(곡률이 작아 오차 0.01pt 미만)
MAX_LABEL_DIST = 12      # 눈금 글자 중심 ↔ 선 최대 거리(글자는 선 끝·선 위에 붙는다)
AMBIGUITY_RATIO = 1.5    # 가장 가까운 선이 그다음 '다른' 선보다 이 배수 이상 가까워야 짝짓는다
SAME_LINE_DIST = 1.0     # 두 후보가 이만큼 가깝고 거의 나란하면(10° 안) 같은 선의 조각·면 가장자리로 본다
MERGE_TOL = 1.5          # 같은 (경도, 위도) 교차점들이 이 안에 모이면 평균, 아니면 버림

_maps = None
def maps():
    global _maps
    if _maps is None:
        with open(os.path.join(HERE, 'maps_u2.json'), encoding='utf-8') as f:
            _maps = {m['id']: m for m in json.load(f)}
    return _maps


def georef_enabled(m):
    """maps_u2.json 의 "georef": false 면 경위도 맞추기를 하지 않는다(기본 true)."""
    return m.get('georef', True)


# ── 눈금 글자 ───────────────────────────────────────────────────────────
_LABEL = re.compile(r'(\d{1,3})\s*[˚°]\s*([EWNS])?(?![\w)])')

def parse_labels(text):
    """'100˚E' → [('lon', 100.0, 시작, 끝)]. N/S → 'lat'. 방향 없는 '0˚' → 'zero'(적도 또는 본초 자오선,
    선 방향을 보고 정한다). 범위 밖 값(경도 > 180, 위도 > 90)과 방향 없는 0 아닌 숫자°(기온 등)는 버린다."""
    out = []
    for mt in _LABEL.finditer(text):
        v = float(mt.group(1)); h = mt.group(2)
        if h is None:
            if v == 0: out.append(('zero', 0.0, mt.start(), mt.end()))
            continue
        if h in ('E', 'W'):
            if v <= 180: out.append(('lon', -v if h == 'W' else v, mt.start(), mt.end()))
        elif v <= 90: out.append(('lat', -v if h == 'S' else v, mt.start(), mt.end()))
    return out


def tick_labels(m, margin=LABEL_MARGIN):
    """지도 bbox(+margin) 안의 눈금 글자 → [{kind, value, c:(x,y), text}]. 한 조각에 여럿이면 글자 위치 비율로 나눈다."""
    x0, y0, x1, y1 = m['bbox']
    out = []
    for s in pdfkit.page_spans(m['page']):
        t = s['text']; b = s['bbox']
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        if not (x0 - margin <= cx <= x1 + margin and y0 - margin <= cy <= y1 + margin): continue
        for kind, v, a, e in parse_labels(t):
            n = max(len(t), 1)
            dx, dy = s['dir']
            # 글자 방향을 따라 조각 중심에서 부분 문자열 중심까지 옮긴다
            L = abs((b[2] - b[0]) * dx) + abs((b[3] - b[1]) * dy)
            off = ((a + e) / 2 / n - 0.5) * L
            out.append({'kind': kind, 'value': v, 'c': (cx + off * dx, cy + off * dy), 'text': t[a:e]})
    return out


# ── 기하 ────────────────────────────────────────────────────────────────
def _bez(p0, p1, p2, p3, k=BEZIER_STEPS):
    t = np.linspace(0, 1, k + 1)[1:, None]; mt = 1 - t
    P = np.array([[p.x, p.y] for p in (p0, p1, p2, p3)])
    return mt**3 * P[0] + 3 * mt * mt * t * P[1] + 3 * mt * t * t * P[2] + t**3 * P[3]


def _subpaths(d):
    """그리기 항목 → [(점 배열, 항목 수)] (곡선은 BEZIER_STEPS 등분)."""
    out = []; cur = None; n = 0; last = None
    for it in d['items']:
        if it[0] == 'l': a, b = it[1], it[2]
        elif it[0] == 'c': a, b = it[1], it[4]
        else: continue
        if last is None or abs(a.x - last.x) > 1e-3 or abs(a.y - last.y) > 1e-3:
            if cur: out.append((np.vstack(cur), n))
            cur = [np.array([[a.x, a.y]])]; n = 0
        cur.append(_bez(*it[1:5]) if it[0] == 'c' else np.array([[b.x, b.y]]))
        n += 1; last = b
    if cur: out.append((np.vstack(cur), n))
    return out


def _length(P):
    return float(np.hypot(*np.diff(P, axis=0).T).sum()) if len(P) > 1 else 0.0


def _nearest_on_polyline(c, P):
    """점 c 에서 선 P 까지 → (거리, 가장 가까운 선분의 방향 벡터)."""
    A = P[:-1]; B = P[1:]; AB = B - A; AC = np.asarray(c, float) - A
    den = (AB * AB).sum(1); den[den == 0] = 1e-12
    t = np.clip((AC * AB).sum(1) / den, 0, 1)
    d = np.hypot(*(np.asarray(c, float) - (A + AB * t[:, None])).T)
    k = int(np.argmin(d))
    return float(d[k]), AB[k]


def _dist_to_polyline(c, P):
    """점 c 와 선(점 배열) P 사이 최단 거리."""
    return _nearest_on_polyline(c, P)[0]


def _intersections(P, Q):
    """두 선(점 배열)의 모든 교차점 목록(끝점 포함, 평행 선분은 무시)."""
    A, B = P[:-1], P[1:]; C, D = Q[:-1], Q[1:]
    out = []
    r = B - A
    for j in range(len(C)):
        s = D[j] - C[j]
        den = r[:, 0] * s[1] - r[:, 1] * s[0]
        ok = np.abs(den) > 1e-12
        if not ok.any(): continue
        qp = C[j] - A
        safe = np.where(ok, den, 1)
        t = np.where(ok, (qp[:, 0] * s[1] - qp[:, 1] * s[0]) / safe, -1)
        u = np.where(ok, (qp[:, 0] * r[:, 1] - qp[:, 1] * r[:, 0]) / safe, -1)
        hit = ok & (t >= 0) & (t <= 1) & (u >= 0) & (u <= 1)
        for i in np.nonzero(hit)[0]:
            out.append(A[i] + t[i] * r[i])
    return out


def _bbox_overlap(P, Q, pad=0.5):
    return not (P[:, 0].max() + pad < Q[:, 0].min() or Q[:, 0].max() + pad < P[:, 0].min() or
                P[:, 1].max() + pad < Q[:, 1].min() or Q[:, 1].max() + pad < P[:, 1].min())


# ── 경위선 후보와 교차점 ────────────────────────────────────────────────
def grid_lines(m):
    """경위선 후보 선들 → [점 배열]. 길고 마디가 긴 매끈한 선만 — 강·국경은 마디가 짧다."""
    x0, y0, x1, y1 = m['bbox']
    lines = []
    for d in pdfkit.doc()[m['page'] - 1].get_drawings():
        r = d['rect']
        if r.x1 < x0 or r.x0 > x1 or r.y1 < y0 or r.y0 > y1: continue
        if d.get('dashes') and d['dashes'] not in ('[] 0', '[ ] 0'): continue
        stroke = d['type'] == 's' and (d.get('width') or 0) <= STROKE_MAX_WIDTH
        fill = d['type'] == 'f'
        if not (stroke or fill): continue
        for P, n in _subpaths(d):
            L = _length(P)
            if L < LINE_MIN_LEN or n == 0 or L / n < LINE_MIN_ITEM_LEN: continue
            if fill:
                area = 0.5 * abs(np.dot(P[:, 0], np.roll(P[:, 1], 1)) - np.dot(P[:, 1], np.roll(P[:, 0], 1)))
                if area / L > FILL_MAX_THICKNESS: continue
            on_edge = ((np.abs(P[:, 0] - x0) < EDGE_TOL) | (np.abs(P[:, 0] - x1) < EDGE_TOL) |
                       (np.abs(P[:, 1] - y0) < EDGE_TOL) | (np.abs(P[:, 1] - y1) < EDGE_TOL))
            if on_edge.all(): continue
            lines.append(P)
    return lines


def assign_labels(labels, lines):
    """눈금 글자를 가장 가까운 선에 짝짓는다 → (선별 표 [{(kind,value): 수}], 버린 글자 목록).
    가장 가까운 선이 그다음 '다른' 선보다 AMBIGUITY_RATIO 배 이상 가깝지 않으면 버린다(같은 선의 조각은 다른 선으로 치지 않음).
    방향 없는 '0˚' 는 짝지은 선이 세로에 가까우면 경도 0, 아니면 위도 0."""
    votes = [dict() for _ in lines]; rejected = []
    if not lines: return votes, rejected
    for lab in labels:
        near = [_nearest_on_polyline(lab['c'], P) for P in lines]
        ds = np.array([d for d, _ in near]); order = [int(i) for i in np.argsort(ds)]
        k = order[0]; d1 = ds[k]
        if d1 > MAX_LABEL_DIST:
            rejected.append({'text': lab['text'], 'why': 'far', 'dist': round(float(d1), 2)}); continue
        # 그다음으로 가까운 '다른' 선(같은 선의 다른 조각 = 가깝고 나란한 선은 건너뜀)
        a = near[k][1]; d2 = np.inf
        for j in order[1:]:
            b = near[j][1]
            sin = abs(a[0] * b[1] - a[1] * b[0]) / (np.hypot(*a) * np.hypot(*b) + 1e-12)
            if ds[j] - d1 < SAME_LINE_DIST and sin < 0.17: continue
            d2 = ds[j]; break
        if d2 < AMBIGUITY_RATIO * d1:
            rejected.append({'text': lab['text'], 'why': 'ambiguous', 'dist': [round(float(d1), 2), round(float(d2), 2)]}); continue
        kind = lab['kind']
        if kind == 'zero':
            vx, vy = near[k][1]
            kind = 'lon' if abs(vy) > abs(vx) else 'lat'
        key = (kind, lab['value'])
        votes[k][key] = votes[k].get(key, 0) + 1
    return votes, rejected


def grid_controls(m, report=None):
    """눈금 글자 + 경위선 → 교차점 기준점 [{xy, lon, lat, src:'grid'}]. report(dict)에 진단 정보를 채운다."""
    lines = grid_lines(m)
    labels = tick_labels(m)
    votes, rejected = assign_labels(labels, lines)
    mer, par, ties = [], [], []
    for P, v in zip(lines, votes):
        if not v: continue
        best = max(v.values())
        winners = [key for key, n in v.items() if n == best]
        if len(winners) > 1:
            ties.append(sorted(f'{k}={val:g}' for k, val in winners)); continue
        kind, val = winners[0]
        (mer if kind == 'lon' else par).append((val, P))
    x0, y0, x1, y1 = m['bbox']
    groups = {}
    for lon, P in mer:
        for lat, Q in par:
            if not _bbox_overlap(P, Q): continue
            for x, y in _intersections(P, Q):
                if x0 <= x <= x1 and y0 <= y <= y1:
                    groups.setdefault((lon, lat), []).append((x, y))
    out, spread = [], []
    for (lon, lat), pts in sorted(groups.items()):
        A = np.array(pts); c = A.mean(0)
        if np.hypot(*(A - c).T).max() > MERGE_TOL:
            spread.append((lon, lat, len(pts))); continue
        out.append({'xy': [round(float(c[0]), 2), round(float(c[1]), 2)], 'lon': lon, 'lat': lat, 'src': 'grid'})
    if report is not None:
        report.update(lines=len(lines), labels=len(labels), meridians=sorted({v for v, _ in mer}),
                      parallels=sorted({v for v, _ in par}),
                      dropped={'labels': rejected, 'ties': ties, 'spread': spread})
    return out


_grid_cache = {}  # 지도 id → grid_controls 결과(같은 실행 안에서 다시 계산하지 않음)

def controls(map_id, report=None):
    """지도 id → 기준점 목록. 손 기준점은 src:'manual', 경위선 교차점은 src:'grid'. georef:false 지도는 []."""
    m = maps()[map_id]
    if not georef_enabled(m): return []
    out = [dict(c, src='manual') for c in m.get('controls', [])]
    if m.get('graticuleLabels'):
        if map_id not in _grid_cache or report is not None:
            _grid_cache[map_id] = grid_controls(m, report=report)
        out += [dict(c) for c in _grid_cache[map_id]]
    return out


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    if len(argv) < 2 or argv[0] != '--controls':
        print(__doc__); return 2
    target = argv[1]
    out_dir = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(WORK, 'vec')
    if target != 'all':
        json.dump(controls(target), sys.stdout, ensure_ascii=False, indent=1); print(); return 0
    os.makedirs(out_dir, exist_ok=True)
    for mid, m in maps().items():
        if not georef_enabled(m):
            print(f'{mid:20s} 건너뜀(georef: false)'); continue
        rep = {}
        cps = controls(mid, report=rep)
        with open(os.path.join(out_dir, f'{mid}.controls.json'), 'w', encoding='utf-8') as f:
            json.dump(cps, f, ensure_ascii=False, indent=1)
        extra = ''
        if rep:
            dr = rep['dropped']
            extra = (f"  선 {rep['lines']} 글자 {rep['labels']} 경선 {rep['meridians']} 위선 {rep['parallels']}"
                     f"  버린 글자 {len(dr['labels'])} 동점 선 {len(dr['ties'])} 흩어진 교차 {len(dr['spread'])}")
        print(f'{mid:20s} {len(cps):3d}{extra}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
