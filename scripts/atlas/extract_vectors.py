# © 2026 김용현
# scripts/atlas/extract_vectors.py
"""지도 영역의 벡터 자료 뽑기. 지금은 경위도 맞추기용 기준점(--controls)만 한다.

기준점 만드는 방법
  - maps_u2.json 의 graticuleLabels 가 true 인 지도(p16·p18·p19·p21-climate): 경위선 교차점.
    경위선 = 길고 매끈한 가는 선(획 굵기 ≤ 0.6, 점선 아님) 또는 아주 얇은 채움 도형(굵은 선을 면으로 바꾼 것).
    눈금 글자(`120˚E`, `40°N`, `0˚`; ˚ U+02DA 와 ° 둘 다)마다 가장 가까운 선을 찾아 그 선에 경도·위도를 붙이고,
    경선 × 위선 교차점을 선분 교차로 구한다. 같은 (경도, 위도) 교차점이 여럿이면(면으로 그린 선의 두 가장자리 등) 평균한다.
  - 그 밖의 지도: maps_u2.json 의 controls(손으로 적은 해안 특징점·섬 중심)를 그대로 쓴다.
  - p22-kashmir: 기준점 없음(양식화된 모식도, 계획서 '실행 중 결정' 참고).

CLI
  python -I scripts/atlas/extract_vectors.py --controls p16-asia            → 표준 출력에 JSON
  python -I scripts/atlas/extract_vectors.py --controls all [--out DIR]     → DIR/<id>.controls.json (기본 C:/Users/Public/atlas-work/vec)
"""
import json, math, os, re, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdfkit

HERE = os.path.dirname(os.path.abspath(__file__))
NO_GEOREF = {'p22-kashmir'}
DEFAULT_OUT = 'C:/Users/Public/atlas-work/vec'

_maps = None
def maps():
    global _maps
    if _maps is None:
        with open(os.path.join(HERE, 'maps_u2.json'), encoding='utf-8') as f:
            _maps = {m['id']: m for m in json.load(f)}
    return _maps


# ── 눈금 글자 ───────────────────────────────────────────────────────────
_LABEL = re.compile(r'(\d{1,3})\s*[˚°]\s*([EWNS])?(?![\w)])')

def parse_labels(text):
    """'100˚E' → [('lon', 100.0, 시작, 끝)]. 'N'/'S' 와 방향 없는 '0˚'(적도)는 위도. 한 조각에 여럿이면 모두."""
    out = []
    for mt in _LABEL.finditer(text):
        v = float(mt.group(1)); h = mt.group(2)
        if h is None and v != 0: continue          # 방향 없는 숫자°(예: 기온)는 버린다
        if h in ('E', 'W'): out.append(('lon', -v if h == 'W' else v, mt.start(), mt.end()))
        else: out.append(('lat', -v if h == 'S' else v, mt.start(), mt.end()))
    return out


def tick_labels(m, margin=16):
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


# ── 경위선 후보 ─────────────────────────────────────────────────────────
def _bez(p0, p1, p2, p3, k=16):
    t = np.linspace(0, 1, k + 1)[1:, None]; mt = 1 - t
    P = np.array([[p.x, p.y] for p in (p0, p1, p2, p3)])
    return mt**3 * P[0] + 3 * mt * mt * t * P[1] + 3 * mt * t * t * P[2] + t**3 * P[3]


def _subpaths(d):
    """그리기 항목 → [(점 배열, 항목 수)] (곡선은 16 등분)."""
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


def grid_lines(m, min_len=40, min_item_len=12):
    """경위선 후보 선들 → [점 배열]. 길고(min_len) 마디가 긴(평균 min_item_len) 매끈한 선만 — 강·국경은 마디가 짧다."""
    x0, y0, x1, y1 = m['bbox']
    lines = []
    for d in pdfkit.doc()[m['page'] - 1].get_drawings():
        r = d['rect']
        if r.x1 < x0 or r.x0 > x1 or r.y1 < y0 or r.y0 > y1: continue
        if d.get('dashes') and d['dashes'] not in ('[] 0', '[ ] 0'): continue
        stroke = d['type'] == 's' and (d.get('width') or 0) <= 0.6
        fill = d['type'] == 'f'
        if not (stroke or fill): continue
        for P, n in _subpaths(d):
            L = _length(P)
            if L < min_len or n == 0 or L / n < min_item_len: continue
            if fill:  # 아주 얇은 면만(선을 면으로 바꾼 것): 넓이/둘레 < 0.5pt
                area = 0.5 * abs(np.dot(P[:, 0], np.roll(P[:, 1], 1)) - np.dot(P[:, 1], np.roll(P[:, 0], 1)))
                if area / L > 0.5: continue
            # 지도 틀(bbox 가장자리)과 겹치는 선은 뺀다
            on_edge = ((np.abs(P[:, 0] - x0) < 1) | (np.abs(P[:, 0] - x1) < 1) |
                       (np.abs(P[:, 1] - y0) < 1) | (np.abs(P[:, 1] - y1) < 1))
            if on_edge.all(): continue
            lines.append(P)
    return lines


def _dist_to_polyline(c, P):
    A = P[:-1]; B = P[1:]; AB = B - A; AC = np.asarray(c) - A
    den = (AB * AB).sum(1); den[den == 0] = 1e-12
    t = np.clip((AC * AB).sum(1) / den, 0, 1)
    Q = A + AB * t[:, None]
    return float(np.hypot(*(np.asarray(c) - Q).T).min())


def _intersections(P, Q):
    """두 선(점 배열)의 모든 교차점."""
    A, B = P[:-1], P[1:]; C, D = Q[:-1], Q[1:]
    # bbox 거르기
    out = []
    r = B - A
    for j in range(len(C)):
        s = D[j] - C[j]
        den = r[:, 0] * s[1] - r[:, 1] * s[0]
        ok = np.abs(den) > 1e-12
        if not ok.any(): continue
        qp = C[j] - A
        t = np.where(ok, (qp[:, 0] * s[1] - qp[:, 1] * s[0]) / np.where(ok, den, 1), -1)
        u = np.where(ok, (qp[:, 0] * r[:, 1] - qp[:, 1] * r[:, 0]) / np.where(ok, den, 1), -1)
        hit = ok & (t >= 0) & (t <= 1) & (u >= 0) & (u <= 1)
        for i in np.nonzero(hit)[0]:
            out.append(A[i] + t[i] * r[i])
    return out


def _bbox_overlap(P, Q, pad=0.5):
    return not (P[:, 0].max() + pad < Q[:, 0].min() or Q[:, 0].max() + pad < P[:, 0].min() or
                P[:, 1].max() + pad < Q[:, 1].min() or Q[:, 1].max() + pad < P[:, 1].min())


def grid_controls(m, max_label_dist=12, merge_tol=1.5, report=None):
    """눈금 글자 + 경위선 → 교차점 기준점 [{xy, lon, lat, src:'grid'}]."""
    lines = grid_lines(m)
    labels = tick_labels(m)
    votes = [dict() for _ in lines]
    for lab in labels:
        ds = [_dist_to_polyline(lab['c'], P) for P in lines]
        if not ds: break
        k = int(np.argmin(ds))
        if ds[k] > max_label_dist: continue
        key = (lab['kind'], lab['value'])
        votes[k][key] = votes[k].get(key, 0) + 1
    mer, par = [], []
    for P, v in zip(lines, votes):
        if not v: continue
        best = max(v.items(), key=lambda kv: kv[1])
        if sum(1 for kv in v.items() if kv[1] == best[1]) > 1: continue  # 동점 → 버림
        (kind, val), _ = best
        (mer if kind == 'lon' else par).append((val, P))
    x0, y0, x1, y1 = m['bbox']
    groups = {}
    for lon, P in mer:
        for lat, Q in par:
            if not _bbox_overlap(P, Q): continue
            for x, y in _intersections(P, Q):
                if x0 <= x <= x1 and y0 <= y <= y1:
                    groups.setdefault((lon, lat), []).append((x, y))
    out, dropped = [], []
    for (lon, lat), pts in sorted(groups.items()):
        A = np.array(pts); c = A.mean(0)
        if np.hypot(*(A - c).T).max() > merge_tol:
            dropped.append((lon, lat, len(pts))); continue
        out.append({'xy': [round(float(c[0]), 2), round(float(c[1]), 2)], 'lon': lon, 'lat': lat, 'src': 'grid'})
    if report is not None:
        report.update(lines=len(lines), labels=len(labels), meridians=sorted({v for v, _ in mer}),
                      parallels=sorted({v for v, _ in par}), dropped=dropped)
    return out


def controls(map_id, report=None):
    """지도 id → 기준점 목록. 손 기준점은 src:'manual' 로, 경위선 교차점은 src:'grid' 로 표시한다."""
    m = maps()[map_id]
    if map_id in NO_GEOREF: return []
    out = [dict(c, src='manual') for c in m.get('controls', [])]
    if m.get('graticuleLabels'):
        if map_id not in _grid_cache or report is not None:
            _grid_cache[map_id] = grid_controls(m, report=report)
        out += [dict(c) for c in _grid_cache[map_id]]
    return out

_grid_cache = {}


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    if len(argv) < 2 or argv[0] != '--controls':
        print(__doc__); return 2
    target = argv[1]
    out_dir = argv[argv.index('--out') + 1] if '--out' in argv else DEFAULT_OUT
    if target != 'all':
        json.dump(controls(target), sys.stdout, ensure_ascii=False, indent=1); print(); return 0
    os.makedirs(out_dir, exist_ok=True)
    for mid in maps():
        if mid in NO_GEOREF:
            print(f'{mid:20s} 건너뜀(경위도 맞추기 없음)'); continue
        rep = {}
        cps = controls(mid, report=rep)
        with open(os.path.join(out_dir, f'{mid}.controls.json'), 'w', encoding='utf-8') as f:
            json.dump(cps, f, ensure_ascii=False, indent=1)
        extra = (f"  선 {rep['lines']} 글자 {rep['labels']} 경선 {rep['meridians']} 위선 {rep['parallels']}"
                 + (f" 버림 {rep['dropped']}" if rep['dropped'] else '')) if rep else ''
        print(f'{mid:20s} {len(cps):3d}{extra}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
