# © 2026 김용현
# scripts/atlas/symbols.py — 점 기호(지면 pt): 범례색 작은 도형, 지시선으로 붙인 이름, 인구 막대 기호
import os, re
import numpy as np
from atlas_common import drawings, spans, hexc, rings, stroke_paths, match_color, overlaps, excluded_boxes, in_map, rect

MIN_GLYPH_PT = 1.0         # 이보다 작은 도형은 기호가 아님(테두리 조각 등)
DUP_PT = 0.8               # 같은 분류 기호 중심이 이 안이면 한 기호(채움 + 테두리 두 번 그림)
NUMERIC_TEXT = re.compile(r'[\d.,\skm]+')   # 축척 글자 등은 이름 후보에서 뺀다
HANGUL_NAME = re.compile(r'[가-힣]+')
LINE_JOIN_EM = 0.6         # 여러 줄 이름: 줄 사이 빈칸이 글자 크기 × 이 값 안이면 한 이름


def symbols(m, leg, cfg, warnings):
    """범례색(ΔE ≤ symbolMatchDE)의 작은 채움 도형(최대 glyphMax pt) → [{xy,cls,kind,color,size,label?}]."""
    found = []
    for d in drawings(m['page']):
        if d.get('fill') is None or not in_map(d, m): continue
        r = d['rect']
        if not MIN_GLYPH_PT <= max(r.width, r.height) <= cfg['glyphMax']: continue
        e = match_color(hexc(d['fill']), leg, cfg['symbolMatchDE'])
        if e is None: continue
        c = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
        if any(f['cls'] == e['cls'] and abs(f['xy'][0] - c[0]) < DUP_PT and abs(f['xy'][1] - c[1]) < DUP_PT for f in found): continue
        found.append({'xy': [round(c[0], 2), round(c[1], 2)], 'cls': e['cls'], 'kind': e['label'], 'color': e['color'],
                      'size': round(max(r.width, r.height), 2)})
    rep = {}
    if cfg.get('leaders'):
        rep['leaders'] = attach_leader_labels(m, found, cfg['leaders'], warnings)
    return found, rep


def _names(m):
    return [t for t in spans(m['page']) if overlaps(rect(t['bbox']), m['bbox']) and not NUMERIC_TEXT.fullmatch(t['text'])
            and not any(overlaps(rect(t['bbox']), b) for b in excluded_boxes(m))]


def attach_leader_labels(m, syms, lc, warnings):
    """지시선(가는 검은 선) 한쪽 끝 = 이름 글자, 다른 쪽 끝 = 기호 → 기호에 label."""
    names = _names(m)
    def tdist(p, t):
        b = t['bbox']; return float(np.hypot(max(b[0] - p[0], 0, p[0] - b[2]), max(b[1] - p[1], 0, p[1] - b[3])))
    done = []
    for d in drawings(m['page']):
        if d['type'] != 's' or hexc(d.get('color')) != lc['stroke'] or abs((d.get('width') or 0) - lc['width']) > 0.05: continue
        if not in_map(d, m): continue
        pts = [np.array([it[k].x, it[k].y]) for it in d['items'] if it[0] == 'l' for k in (1, 2)]
        if not pts or not names or not syms: continue
        P = np.array(pts); D = np.hypot(*(P[:, None] - P[None]).transpose(2, 0, 1))
        if D.max() < lc['minLenPt']: continue          # 축척 눈금 같은 짧은 선은 지시선이 아님
        i, j = np.unravel_index(D.argmax(), D.shape)
        best = None
        for a, b in ((P[i], P[j]), (P[j], P[i])):
            t = min(names, key=lambda t: tdist(a, t))
            s = min(syms, key=lambda s: np.hypot(s['xy'][0] - b[0], s['xy'][1] - b[1]))
            score = tdist(a, t) + float(np.hypot(s['xy'][0] - b[0], s['xy'][1] - b[1]))
            if best is None or score < best[0]: best = (score, t, s)
        if best[0] < lc['maxGapPt']:
            best[2]['label'] = with_lines(best[1], names)
            done.append({'label': best[2]['label'], 'kind': best[2]['kind'], 'gap': round(best[0], 2)})
        else:
            warnings.append(f"지시선 {[round(v, 1) for v in d['rect']]} 에 이름·기호를 못 붙임(간격 {best[0]:.1f}pt)")
    return done


def with_lines(t, names):
    """여러 줄로 쓴 이름('세인트 앤드루' / '대성당')을 위아래 줄과 이어 붙인다."""
    group = [t]
    for _ in range(3):
        for o in names:
            if o in group or abs(o['size'] - t['size']) > 0.2: continue
            if min(o['bbox'][2], max(g['bbox'][2] for g in group)) - max(o['bbox'][0], min(g['bbox'][0] for g in group)) <= 0: continue
            top, bot = min(g['bbox'][1] for g in group), max(g['bbox'][3] for g in group)
            if 0 <= top - o['bbox'][3] < LINE_JOIN_EM * t['size'] or 0 <= o['bbox'][1] - bot < LINE_JOIN_EM * t['size']:
                group.append(o)
    return ' '.join(g['text'] for g in sorted(group, key=lambda g: g['bbox'][1]))


def density_markers(m, mc, warnings):
    """인구 막대 기호: 같은 색 조각을 x 가 겹치는 막대로 묶고, 네모 수 = 억 명, 아래 글자 = 나라,
    점선 지시선이 있으면 그 끝 = 나라 위치(없으면 막대 밑), 이때 bar = 막대 밑 가운데."""
    blobs = []
    for d in drawings(m['page']):
        if hexc(d.get('fill')) != mc['color'] or not in_map(d, m): continue
        for R in rings(d):
            (x0, y0), (x1, y1) = R.min(0), R.max(0)
            blobs.append([x0, y0, x1, y1])
    if not blobs: raise ValueError(f"{m['id']}: 인구 막대 기호(색 {mc['color']})가 없음")
    cols = []
    for b in sorted(blobs, key=lambda b: b[0]):
        for c in cols:
            if b[0] < c['box'][2] - 0.5 and b[2] > c['box'][0] + 0.5:
                c['parts'].append(b); c['box'] = [min(c['box'][0], b[0]), min(c['box'][1], b[1]), max(c['box'][2], b[2]), max(c['box'][3], b[3])]; break
        else:
            cols.append({'box': list(b), 'parts': [b]})
    names = [t for t in spans(m['page']) if overlaps(rect(t['bbox']), m['bbox']) and HANGUL_NAME.fullmatch(t['text'])]
    chains = dotted_chains(m, mc)
    (w0, w1), (h0, h1), (b0, b1) = mc['squareW'], mc['squareH'], mc['labelBelowPt']
    out = []
    for c in cols:
        b = c['box']; cx = (b[0] + b[2]) / 2
        squares = [p for p in c['parts'] if w0 <= p[2] - p[0] <= w1 and h0 <= p[3] - p[1] <= h1]
        below = [t for t in names if abs((t['bbox'][0] + t['bbox'][2]) / 2 - cx) < mc['labelDxPt'] and b0 <= t['bbox'][1] - b[3] <= b1]
        name = min(below, key=lambda t: t['bbox'][1] - b[3])['text'] if below else None
        if name is None: warnings.append(f'인구 막대 {[round(v, 1) for v in b]} 아래 나라 이름 없음')
        anchor = leader_end(chains, b, mc['leaderNearPt'])
        base = [round(cx, 2), round(b[3], 2)]
        item = {'xy': anchor or base, 'cls': 'c1', 'kind': mc['kind'], 'color': mc['color'],
                'size': round(b[3] - b[1], 2), 'value': len(squares), 'label': name, 'anchor': 'leader' if anchor else 'bar-base'}
        if anchor: item['bar'] = base   # 지시선이 있으면 막대 밑 가운데(지면 pt)도 남긴다 — 앱이 막대를 교과서 자리에 세우고 지시선을 긋는다
        out.append(item)
    return out


def dotted_chains(m, mc):
    """점선(지시선) 조각을 끝점끼리(leaderJoinPt 안) 이어 [끝점…] 목록으로."""
    segs = []
    for d in drawings(m['page']):
        if d['type'] != 's' or not (d.get('dashes') or '').startswith(mc['leaderDashPrefix']) or not in_map(d, m): continue
        segs += [[tuple(P[0]), tuple(P[-1])] for P in stroke_paths(d)]
    tol = mc['leaderJoinPt']
    near = lambda p, q: np.hypot(p[0] - q[0], p[1] - q[1]) < tol
    chains = []
    for a, b in segs:
        for c in chains:
            if near(c[-1], a): c.append(b); break
            if near(c[-1], b): c.append(a); break
            if near(c[0], b): c.insert(0, a); break
            if near(c[0], a): c.insert(0, b); break
        else:
            chains.append([a, b])
    return chains


def leader_end(chains, b, near):
    """막대 상자 b 에 한쪽 끝이 닿은(near pt 안) 지시선의 다른 쪽 끝."""
    dist = lambda p: float(np.hypot(max(b[0] - p[0], 0, p[0] - b[2]), max(b[1] - p[1], 0, p[1] - b[3])))
    best = None
    for c in chains:
        for e, o in ((c[0], c[-1]), (c[-1], c[0])):
            de = dist(e)
            if de < near and dist(o) > de + 5 and (best is None or de < best[0]): best = (de, o)
    return [round(best[1][0], 2), round(best[1][1], 2)] if best else None


# ── 래스터 원 기호(30쪽 도시 인구) ─────────────────────────────────────────
# 교과서 원은 투명 겹침을 펼친(flatten) 결과라 벡터 조각·작은 인라인 그림으로 쪼개져 있다(범례 원도 그림) → 지면을 렌더한 화소에서
# 초록 원을 찾는다: 초록 가면 → 열림(얇은 선 지움) → 구멍 메움 → 거리 변환 최댓값 = 가장 큰 내접원을 하나씩 떼어 냄.
def green_mask(im, gr, gb, max_r):
    """RGB 화소 → 원 기호 가면(0/1): G − R > gr, G − B > gb, R ≤ max_r(하늘색 해안선과 노랑 땅이 섞인 밝은 연두 제외)."""
    a = im.astype(int); R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return ((G - R > gr) & (G - B > gb) & (R <= max_r)).astype(np.uint8)


def circles_from_mask(mask, rmin, open_px=5, grow=1.1, close_px=0):
    """가면(0/1) → 원 [(x, y, r)](화소). 닫기(close_px — 원 테두리의 옅은 선·국경선이 원을 가르는 것 잇기) → 열기(open_px — 얇은 선 지움)
    → 구멍 메우기(어두운 겹침 가운데가 색 조건을 못 넘은 고리) 뒤, 거리 변환이 가장 큰 점을 원 중심으로 떼어 내기(반지름 × grow + 1 화소 지움)를
    반지름이 rmin 보다 작아질 때까지."""
    import cv2
    m = mask.astype(np.uint8)
    if close_px: m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_px, close_px)))
    if open_px: m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_px, open_px)))
    inv = (1 - m).astype(np.uint8)
    n, lbl = cv2.connectedComponents(inv, connectivity=4)
    border = np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))
    m = (m | (~np.isin(lbl, border) & (inv > 0))).astype(np.uint8)
    dt0 = cv2.distanceTransform(m, cv2.DIST_L2, 5)   # 처음 가면의 거리 — 겹쳐 가린 원의 반지름을 되찾을 때
    out = []
    while True:
        dt = cv2.distanceTransform(m, cv2.DIST_L2, 5)
        if float(dt.max()) < rmin: break
        # 남은 곳(지금 거리 ≥ rmin) 중 처음 가면 거리가 가장 큰 점: 따로 있는 원은 그 중심, 큰 원에 일부 가린 원은 남은 조각의 큰 원 쪽 끝
        # (그 자리 처음 거리 ≈ 가린 원의 반지름 — 남은 조각만으로 재면 반지름을 작게 잼)
        sel = np.where(dt >= rmin, dt0, 0)
        y, x = np.unravel_index(int(np.argmax(sel)), sel.shape); r = float(dt0[y, x])
        out.append((float(x), float(y), r))
        cv2.circle(m, (int(x), int(y)), int(round(r * grow)) + 1, 0, -1)
    return out


def nearest_class(d, legend_d):
    """지름 d → 범례 지름 목록에서 로그 거리가 가장 가까운 번호(렌더 화소로 잰 지름은 작은 원일수록 덜 잼 — 비율로 견줌)."""
    return int(np.argmin([abs(np.log(d / x)) for x in legend_d]))


def raster_circles(m, cfg, warnings):
    """30쪽 도시 인구 원(크기 5단계) + 사례 도시(흰 원 + 이름) → (legend, symbols, report). 설정 cfg['circles']:
    {dpi, green: {gr, gb, maxR}, rminPt, legendBox(범례 원이 있는 상자 — 원 오른쪽 글자 = 범례 이름), color(화면 색)}
    + cfg['cases'] {fill, sizePt:[최소, 최대], label}(사례 도시 흰 원 — 가장 가까운 지명 낱말을 이름으로)."""
    import pdfkit
    from PIL import Image
    from atlas_common import WORK
    cc = cfg['circles']
    os.makedirs(f'{WORK}/c1', exist_ok=True)
    png = f"{WORK}/c1/{cfg['id']}-render.png"
    _, _, dpi = pdfkit.render_clip(m['page'], m['bbox'], cc.get('dpi', 400), png)
    s = dpi / 72; x0, y0 = m['bbox'][0], m['bbox'][1]
    g = cc['green']
    mask = green_mask(np.array(Image.open(png).convert('RGB')), g['gr'], g['gb'], g['maxR'])
    found = [((x / s + x0, y / s + y0), 2 * r / s) for x, y, r in circles_from_mask(mask, cc.get('rminPt', 0.45) * s, close_px=int(cc.get('closePx', 0)))]
    lb = cc['legendBox']
    inbox = lambda p, b: b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]
    leg_c = sorted([f for f in found if inbox(f[0], lb)], key=lambda f: -f[1])
    texts = [t for t in spans(m['page']) if lb[0] - 2 <= t['bbox'][0] <= lb[2] + 40 and lb[1] - 2 <= (t['bbox'][1] + t['bbox'][3]) / 2 <= lb[3] + 2]
    legend = []
    for i, ((cx, cy), d) in enumerate(leg_c):
        row = sorted((t for t in texts if abs((t['bbox'][1] + t['bbox'][3]) / 2 - cy) < 2.5 and t['bbox'][0] > cx), key=lambda t: t['bbox'][0])
        legend.append({'cls': f'c{i + 1}', 'color': cc['color'], 'label': ' '.join(t['text'] for t in row).strip(), 'kind': 'symbol', 'measuredPt': round(d, 2)})
    if any(not e['label'] for e in legend): raise ValueError(f"{cfg['id']}: 범례 원 이름을 못 읽음 {legend}")
    exp = cc.get('expectClasses')
    if exp is not None and len(legend) != exp: raise ValueError(f"{cfg['id']}: 범례 원 {len(legend)}개 ≠ {exp} — {[(e['label'], e['measuredPt']) for e in legend]}")
    ex = excluded_boxes(m)
    legend_d = [e['measuredPt'] for e in legend]
    syms, by = [], {}
    for (cx, cy), d in found:
        if any(inbox((cx, cy), b) for b in ex): continue
        k = nearest_class(d, legend_d); e = legend[k]
        syms.append({'xy': [round(cx, 2), round(cy, 2)], 'cls': e['cls'], 'kind': e['label'], 'color': e['color'], 'size': round(d, 2)})
        by[e['label']] = by.get(e['label'], 0) + 1
    rep = {'circles': len(syms), 'byClass': by, 'legendMeasuredPt': legend_d}
    if cfg.get('cases'):
        ca = cfg['cases']; lo, hi = ca['sizePt']
        names = list(ca.get('names') or [])
        words = []   # (이름, 지면 자리) — 이름 목록이 있으면 글자 조각 안 그 이름(띄어 쓴 「소피아 앙티폴리스」, 한 조각에 붙은 「런던 로테르담」)의 가운데
        for t in spans(m['page']):
            if not overlaps(rect(t['bbox']), m['bbox']): continue
            txt = t['text']; n = max(len(txt), 1); b = t['bbox']
            at = lambda i, k: (b[0] + (b[2] - b[0]) * (i + k / 2) / n, (b[1] + b[3]) / 2)
            if names:
                for nm in names:
                    i = txt.find(nm)
                    if i >= 0: words.append((nm, at(i, len(nm))))
            else:
                pos = 0
                for p in txt.split(' '):
                    if p: words.append((p, at(pos, len(p))))
                    pos += len(p) + 1
        cls = f'c{len(legend) + 1}'
        legend.append({'cls': cls, 'color': ca['fill'], 'label': ca['label'], 'kind': 'symbol'})
        for d in drawings(m['page']):
            r = d['rect']
            if hexc(d.get('fill')) != ca['fill'] or not in_map(d, m) or not lo <= r.width <= hi or abs(r.width - r.height) > 0.3: continue
            c = ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
            w = min(words, key=lambda w: np.hypot(w[1][0] - c[0], w[1][1] - c[1])) if words else None
            syms.append({'xy': [round(c[0], 2), round(c[1], 2)], 'cls': cls, 'kind': ca['label'], 'color': ca['fill'], 'size': round(r.width, 2),
                         **({'label': w[0]} if w else {})})
        got = [s_.get('label') for s_ in syms if s_['cls'] == cls]
        rep['cases'] = got
        if names and sorted(got) != sorted(names): warnings.append(f'사례 도시 이름 {got} ≠ 설정 {sorted(names)}')
    return legend, syms, rep
