# © 2026 김용현
# scripts/atlas/symbols.py — 점 기호(지면 pt): 범례색 작은 도형, 지시선으로 붙인 이름, 인구 막대 기호
import re
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
