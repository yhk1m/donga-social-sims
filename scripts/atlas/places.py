# © 2026 김용현
# scripts/atlas/places.py — 일반도(16·18·19쪽) 지명 글자·기호 뽑기(지면 pt), 찾아보기(105~111쪽) 파싱
#   python -I scripts/atlas/places.py [map ...]   → $ATLAS_WORK/text/places-<map>.json (찾아보기도 함께 다시 읽음)
#   python -I scripts/atlas/places.py --index      → $ATLAS_WORK/tables/index.json
#   설정: config/u2.json 의 places (역할별 글꼴·색·크기 표, 종류 판정 정규식, 기호 분류, 제외 규칙).
#
#   1. page_spans 중 지도 틀 안(범례·제목 상자 밖) 글자에 역할을 붙인다(ignore 먼저, 그다음 styles).
#      어디에도 안 맞는 글자는 report.warnings 에 남긴다. 산 높이 숫자(ignore 의 elevation)는 따로 모은다.
#   2. 묶기(group): 점 지명(도시·산)은 조각 하나 = 지명 하나. 그 밖에는
#      ① 한 글자 조각이 낀 두 조각이 같은 글자 줄(곧거나 휜) 위에서 가까우면 잇는다(곡선 글자 「우 랄 산 맥」, 흐름 순서와 무관),
#      ② 이은 이름이 찾아보기에 없고 두 토막이 모두 있으면 나눈다(맞닿은 다른 지명),
#      ③ 여러 줄 지명(아나톨리아고 / 원, 보스니아 / 헤르체고비나)은 이은 이름이 찾아보기에 있을 때만 잇는다.
#      잇기는 싼 연결부터 조각마다 이웃 둘까지(갈래 없는 사슬)라 옆 지명 글자가 T 자로 붙지 않는다. 읽는 순서 = 사슬 순서,
#      방향은 글자 방향(dir)과 맞는 쪽.
#   3. 영문 이름(…En 역할)은 가장 가까운 대상 역할 지명에 en 으로 붙인다(일대일, 가까운 순, attachSymbol 이면 그 기호 짝만).
#   4. 점 지명은 가장 가까운 기호(수도·산·도시)와 일대일로 짝짓는다(글자 상자의 붙는 자리까지 거리 + 어긋남 벌점: 높이 숫자가 붙은
#      지명 ↔ 삼각형).
#   5. 종류: 기호(kindBySymbol) → 역할별 접미 정규식(kinds).
# 결과 labels: [{name, raw, role, kind, size, font, color, bbox, xy(글자 중심), path(글자 줄 따라 점 2~6개), angle(지면 각도, 도),
#                n(조각 수), en?, elev?, symbol?: {xy, cls}}], dropped: [{text, why}], notes, report: {counts, warnings}
import functools, json, math, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
from atlas_common import WORK, maps, unit_config, drawings, hexc, excluded_boxes
from assign import pair


def places_config():
    return unit_config()['places']


# ── 이름 ────────────────────────────────────────────────────────────────
def clean_name(t):
    """자간 벌린 글자(모든 토막이 한 글자)는 붙이고, 그 밖의 공백은 하나로."""
    toks = t.split()
    if len(toks) > 1 and all(len(x) == 1 for x in toks): return ''.join(toks)
    return ' '.join(toks)


def key(name):
    """비교용 열쇠: 공백 없앰."""
    return re.sub(r'\s+', '', name)


def kind_of(role, name, sym_cls, cfg):
    if sym_cls and sym_cls in cfg['kindBySymbol']: return cfg['kindBySymbol'][sym_cls]     # 기호는 점 지명에만 붙는다
    for pat, kind in cfg['kinds'][role]:
        if re.search(pat, name): return kind
    raise ValueError(f'종류를 정할 수 없음: {role} {name}')


# ── 양식 → 역할 ──────────────────────────────────────────────────────────
def _match(rule, s):
    if 'font' in rule and not re.search(rule['font'], s['font']): return False
    if 'color' in rule and rule['color'] != s['color']: return False
    if 'size' in rule and not (rule['size'][0] <= s['size'] <= rule['size'][1]): return False
    if 'textRe' in rule and not re.search(rule['textRe'], s['text'].strip()): return False
    return True


def style_of(s, cfg):
    """→ ('ignore', 규칙) | ('style', 규칙) | (None, None)."""
    for r in cfg['ignore']:
        if _match(r, s): return 'ignore', r
    for r in cfg['styles']:
        if _match(r, s): return 'style', r
    return None, None


# ── 도형 보조 ────────────────────────────────────────────────────────────
def _in_box(b, box, tol=0.5):
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    return box[0] - tol <= cx <= box[2] + tol and box[1] - tol <= cy <= box[3] + tol


def _gap(a, b):
    dx = max(a[0] - b[2], b[0] - a[2], 0); dy = max(a[1] - b[3], b[1] - a[3], 0)
    return math.hypot(dx, dy)


def _union(bs):
    return [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]


def _centre(b): return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def _pt_box(p, b):
    dx = max(b[0] - p[0], p[0] - b[2], 0); dy = max(b[1] - p[1], p[1] - b[3], 0)
    return math.hypot(dx, dy)


def _anchors(L):
    """점 지명 글자의 붙는 자리: 글자 줄 방향으로 돌린 글자 상자의 네 변 가운데·네 모서리(지면 pt)."""
    (x0, y0), (x1, y1) = L['path'][0], L['path'][-1]
    n = math.dist((x0, y0), (x1, y1))
    ux, uy = ((x1 - x0) / n, (y1 - y0) / n) if n > 1e-6 else (math.cos(math.radians(L['angle'])), math.sin(math.radians(L['angle'])))
    vx, vy = -uy, ux
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hl, hh = n / 2 + 0.5 * L['size'], 0.5 * L['size']
    return [(cx + a * hl * ux + b * hh * vx, cy + a * hl * uy + b * hh * vy) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a, b) != (0, 0)]


def _anchor_dist(p, L):
    """기호 점 p 와 지명 글자의 붙는 자리 중 가장 가까운 곳까지 거리. 지명은 기호 옆·위·아래 가운데나 모서리에 붙여 놓으므로,
    글자 상자 변에 스치기만 한 남의 기호보다 제 기호가 가깝게 잡힌다(기울어진 글자도 글자 줄 방향으로 잰다)."""
    return min(math.dist(p, a) for a in _anchors(L))


def _thin(path, k=6):
    if len(path) <= k: return path
    return [path[round(i * (len(path) - 1) / (k - 1))] for i in range(k)]


# ── 잇기(묶기 전) ─────────────────────────────────────────────────────────
def glue_spans(spans, rules):
    """흐름 순서로 맞닿은 조각을 한 조각으로(설정 places.glue). 규칙 = {font, color?, textRe?(조각마다), maxGapEm, require?, map?}.
    같은 규칙에 맞고 크기(±0.35pt)·방향(cos > 0.95)이 같으며 글자 상자 빈틈 ≤ maxGapEm·크기인 연속 조각을 잇는다(글자 사이 공백 없음).
    require 가 있으면 그 글꼴 조각이 낀 묶음만 잇고(바꿀 낱자 ş·ă 가 낀 영문 이름), 이은 조각의 글꼴·색은 require 아닌 첫 조각 것.
    map = 낱자 바꾸기(글꼴이 바뀐 낱자가 다른 코드로 나오는 것 — ㏇ → ă). 26쪽: Chi|ş|in|㏇|u → Chişinău, 1|8|9|5 → 1895."""
    if not rules: return spans
    def fits(r, s): return re.search(r['font'], s['font']) and ('color' not in r or r['color'] == s['color'])         and ('textRe' not in r or re.search(r['textRe'], s['text'].strip()))
    def touch(r, a, b):
        cos = a['dir'][0] * b['dir'][0] + a['dir'][1] * b['dir'][1]
        return abs(a['size'] - b['size']) <= 0.35 and cos > 0.95 and _gap(a['bbox'], b['bbox']) <= r['maxGapEm'] * a['size']
    def emit(r, run, out):
        if len(run) > 1 and (not r.get('require') or any(re.search(r['require'], x['font']) for x in run)):
            base = next((x for x in run if not (r.get('require') and re.search(r['require'], x['font']))), run[0])
            mp = r.get('map', {})
            text = ''.join(''.join(mp.get(ch, ch) for ch in x['text']) for x in run)
            out.append({**base, 'text': text, 'bbox': [round(v, 1) for v in _union([x['bbox'] for x in run])]})
        else: out.extend(run)
    out, run, rr = [], [], None
    for s in spans:
        r = next((r for r in rules if fits(r, s)), None)
        if run and r is rr and touch(r, run[-1], s): run.append(s); continue
        if run: emit(rr, run, out)
        run, rr = ([s], r) if r is not None else ([], None)
        if r is None: out.append(s)
    if run: emit(rr, run, out)
    return out


# ── 묶기 ────────────────────────────────────────────────────────────────
def _span_ends(s):
    """조각 하나의 글자 줄 양 끝 글자 중심(dir 방향)."""
    b = s['bbox']; cx, cy = _centre(b); dx, dy = s['dir']
    w, h = b[2] - b[0], b[3] - b[1]; c, sn = abs(dx), abs(dy)
    L = (w - s['size'] * sn) / c if c > 0.3 else (h - s['size'] * c) / max(sn, 1e-6)
    L = max(L - s['size'], 0) / 2
    return [(cx - dx * L, cy - dy * L), (cx + dx * L, cy + dy * L)]


def _node(s):
    single = len(s['text'].replace(' ', '')) == 1
    c = _centre(s['bbox'])
    ends = [c, c] if single else _span_ends(s)
    return {'s': s, 'single': single, 'c': c, 'ends': ends, 'dir': s['dir'], 'size': s['size'],
            'half': math.dist(*ends) / 2 + 0.5 * s['size'], 'text': clean_name(s['text'])}


def _same_style(a, b):
    return (a['s']['rule'] is b['s']['rule'] and a['s']['font'] == b['s']['font'] and a['s']['color'] == b['s']['color']
            and abs(a['size'] - b['size']) <= 0.35)


def _chain():
    """묶기 수치(config places.chain)."""
    return places_config()['chain']


def _chain_link(a, b, join_em):
    """두 조각이 같은 글자 줄(곧거나 휜) 위에서 이어지는가 → 잇는 비용(작을수록 그럴듯함) 또는 None.
    두 방향의 평균 축에 대해 수직 어긋남 < 0.7em 또는 축과 15° 안, 축 방향 빈틈 ≤ join_em·크기.
    둘 다 여러 글자면 같은 기준선에서 빈틈 ≤ touchEm·크기일 때만(맞닿은 다른 지명은 _split_by_index 가 찾아보기로 다시 나눈다).
    비용 = 빈틈/크기 + 수직 어긋남/크기 + 2·(1 − 두 방향의 cos)."""
    ch = _chain()
    dx, dy = a['dir'][0] + b['dir'][0], a['dir'][1] + b['dir'][1]; n = math.hypot(dx, dy)
    if n < 1e-6: return None
    dx, dy = dx / n, dy / n
    pa, pb, ha, hb = a['c'], b['c'], a['half'], b['half']
    if a['single'] != b['single']:                                   # 여러 글자 조각은 한 글자 쪽 끝 글자에서 잰다(휜 줄)
        if not a['single']: pa = min(a['ends'], key=lambda e: math.dist(e, pb)); ha = 0.5 * a['size']
        else: pb = min(b['ends'], key=lambda e: math.dist(e, pa)); hb = 0.5 * b['size']
    vx, vy = pb[0] - pa[0], pb[1] - pa[1]
    along, perp = vx * dx + vy * dy, abs(-vx * dy + vy * dx)
    size = max(a['size'], b['size'])
    gap = abs(along) - ha - hb
    cost = max(gap, 0) / size + perp / size + 2 * (1 - (a['dir'][0] * b['dir'][0] + a['dir'][1] * b['dir'][1]))
    if not (a['single'] or b['single']):                             # 여러 글자끼리는 같은 기준선에서 맞닿을 때만(글꼴이 바뀐 한 낱말)
        return cost if perp <= ch['touchPerpEm'] * size and gap <= ch['touchEm'] * size else None
    # 한 글자가 낀 연결: 글자 상자 중심이 기준선에서 흔들리고 줄이 휜다
    ok = perp <= (ch['touchSinglePerpEm'] if gap <= ch['touchEm'] * size else ch['singlePerpEm']) * size \
        or perp <= math.tan(math.radians(ch['bendDeg'])) * abs(along)
    return cost if ok and gap <= join_em * size else None


def _orient(seq):
    """사슬(끝에서 끝으로 늘어선 조각)을 글자 방향과 맞게 뒤집는다. 방향이 안 정해지면 위→아래."""
    if len(seq) < 2: return seq
    t = sum((b['c'][0] - a['c'][0]) * (a['dir'][0] + b['dir'][0]) + (b['c'][1] - a['c'][1]) * (a['dir'][1] + b['dir'][1])
            for a, b in zip(seq, seq[1:]))
    if abs(t) < 1e-6: return seq if seq[0]['c'][1] <= seq[-1]['c'][1] else seq[::-1]
    return seq if t > 0 else seq[::-1]


def _text(nodes):
    return ''.join(n['text'] for n in nodes)


def _line(nodes):
    """한 줄(곧거나 휜) → (이름, 글자 줄 점들)."""
    name = nodes[0]['text'] if len(nodes) == 1 else key(_text(nodes)) if all(n['single'] or ' ' not in n['text'] for n in nodes)         else _text(nodes)
    path = []
    for n in nodes:
        e = n['ends']
        if (e[1][0] - e[0][0]) * n['dir'][0] + (e[1][1] - e[0][1]) * n['dir'][1] < 0: e = e[::-1]
        path.extend([e[0]] if n['single'] else e)
    return name, path


def _plen(path): return sum(math.dist(a, b) for a, b in zip(path, path[1:]))


def _label(lines):
    """줄 목록(위→아래, 줄마다 조각 목록) → 지명. 여러 줄이면 이름은 줄 사이 공백, 글자 줄은 가장 긴 줄을 묶음 중심으로 옮긴 것."""
    nodes = [n for L in lines for n in L]
    s0 = nodes[0]['s']; bb = _union([n['s']['bbox'] for n in nodes])
    parts = [_line(L) for L in lines]
    if len(parts) == 1: name, path = parts[0]
    else:
        # 줄 사이 공백(보스니아 헤르체고비나). 한 글자 줄이 끼면 낱말 가운데서 줄이 꺾인 것이라 공백 없이(세로로 쌓인 엘 / 베강)
        name = ('' if any(len(key(p[0])) == 1 for p in parts) else ' ').join(p[0] for p in parts)
        main = max(parts, key=lambda p: _plen(p[1]))[1]
        (ux, uy), mx, my = _centre(bb), sum(q[0] for q in main) / len(main), sum(q[1] for q in main) / len(main)
        path = [(x + ux - mx, y + uy - my) for x, y in main]
    if math.dist(path[0], path[-1]) > 1e-6:
        ang = math.degrees(math.atan2(path[-1][1] - path[0][1], path[-1][0] - path[0][0]))
    else:
        ang = math.degrees(math.atan2(nodes[0]['dir'][1], nodes[0]['dir'][0]))
    return {'name': name, 'raw': ' | '.join(n['s']['text'] for n in nodes), 'role': s0['rule']['role'], 'rule': s0['rule'],
            'size': max(n['size'] for n in nodes), 'font': s0['font'], 'color': s0['color'], 'bbox': [round(v, 2) for v in bb],
            'xy': [round(v, 2) for v in _centre(bb)], 'path': [[round(x, 2), round(y, 2)] for x, y in _thin(path)],
            'angle': round(ang, 1), 'n': len(nodes), 'lines': len(lines)}


@functools.lru_cache(maxsize=4)
def _partials(keys):
    """찾아보기 열쇠의 앞·뒤 토막(여러 줄 지명의 한 줄일 수 있는 것)."""
    out = set()
    for k in keys:
        for i in range(2, len(k) - 1): out.add(k[:i]); out.add(k[i:])
    return frozenset(out)


def _split_by_index(nodes, keys, notes):
    """이은 이름이 찾아보기에 없는데 두 토막으로 나누면 한쪽은 찾아보기 지명, 다른 쪽은 지명이거나 여러 줄 지명의 한 토막이면
    나눈다(맞닿은 다른 지명이 이어진 경우: 벨기에+독일, 보스니아(헤르체고비나 윗줄)+세르비아)."""
    whole = key(_text(nodes))
    if len(nodes) < 2 or whole in keys: return [nodes]
    part = _partials(keys)
    ok = lambda x: x in keys or (len(x) >= 3 and x in part)
    def cut(ns):                                                     # 모든 토막이 ok 인 나누기(앞에서부터, 긴 토막 먼저)
        if ok(key(_text(ns))): return [ns]
        for i in range(len(ns) - 1, 0, -1):
            if ok(key(_text(ns[:i]))):
                rest = cut(ns[i:])
                if rest: return [ns[:i]] + rest
        return None
    parts = cut(nodes)
    if parts and len(parts) > 1 and any(key(_text(p)) in keys for p in parts):
        notes.append(f'찾아보기로 나눔: {whole} → ' + ' + '.join(key(_text(p)) for p in parts))
        return parts
    return [nodes]


def group(spans, keys=frozenset(), notes=None):
    """역할이 붙은 조각(규칙은 s['rule']) → 지명 목록. 맨 위 주석의 2 참고."""
    notes = notes if notes is not None else []
    ch = _chain()
    nodes = [_node(s) for s in spans]
    cands = []
    for i, a in enumerate(nodes):
        je = a['s']['rule'].get('joinEm', 0.6)
        for j in range(i + 1, len(nodes)):
            b = nodes[j]
            if not _same_style(a, b) or _gap(a['s']['bbox'], b['s']['bbox']) > (je + 1) * a['size']: continue
            c = _chain_link(a, b, je)
            if c is None: continue
            d = math.dist(a['c'], b['c'])                            # 사이에 같은 양식 조각이 있으면 건너뛰는 연결이라 뺀다
            if any(k != i and k != j and _same_style(a, x) and math.dist(a['c'], x['c']) + math.dist(x['c'], b['c']) < d + 0.5 * a['size']
                   for k, x in enumerate(nodes)): continue
            cands.append((c, i, j))
    # 글자 줄 = 갈래 없는 사슬: 싼 연결부터, 조각마다 이웃 둘까지, 고리 없이(T 자로 붙는 옆 지명 글자를 막음)
    parent = list(range(len(nodes))); adj = [[] for _ in nodes]
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for c, i, j in sorted(cands):
        if len(adj[i]) >= 2 or len(adj[j]) >= 2 or find(i) == find(j): continue
        adj[i].append(j); adj[j].append(i); parent[find(i)] = find(j)
    seen, groups = set(), []
    for i in range(len(nodes)):
        if i in seen: continue
        comp = []; st = [i]
        while st:
            k = st.pop()
            if k in seen: continue
            seen.add(k); comp.append(k); st.extend(adj[k])
        start = next((k for k in comp if len(adj[k]) <= 1), comp[0])
        seq, prev, cur = [], None, start
        while cur is not None:                                       # 사슬 끝에서 끝까지
            seq.append(cur); nxt = next((k for k in adj[cur] if k != prev), None); prev, cur = cur, nxt
        groups.extend(_split_by_index(_orient([nodes[k] for k in seq]), keys, notes))
    groups = [{'lines': [g]} for g in groups]
    nodes_of = lambda G: [n for L in G['lines'] for n in L]
    changed = True
    while changed:                                                  # ③ 여러 줄 지명(또는 한 줄의 끊긴 토막)
        changed = False
        for A in groups:
            for B in groups:
                if A is B or not A['lines'] or not B['lines']: continue
                a, b = nodes_of(A), nodes_of(B)
                if not _same_style(a[0], b[0]): continue
                ba, bb = _union([n['s']['bbox'] for n in a]), _union([n['s']['bbox'] for n in b])
                if _gap(ba, bb) > ch['lineGapEm'] * a[0]['size']: continue
                ka, kb = key(_text(a)), key(_text(b))
                if ka + kb in keys:                                  # A 다음 B
                    notes.append(f'찾아보기로 이음: {ka} + {kb}')
                    la, lb = A['lines'][-1], B['lines'][0]
                    (ax, ay), (bx, by), (dx, dy) = la[-1]['c'], lb[0]['c'], la[-1]['dir']
                    along, perp = (bx - ax) * dx + (by - ay) * dy, abs(-(bx - ax) * dy + (by - ay) * dx)
                    nextline = perp > ch['nextLineEm'] * a[0]['size'] and (along < 0 or perp > along)   # 줄을 바꿔 앞으로 돌아감
                    if nextline: A['lines'] = A['lines'] + B['lines']                                                     # 다음 줄
                    else: A['lines'] = A['lines'][:-1] + [la + lb] + B['lines'][1:]                                      # 같은 줄
                    B['lines'] = []; changed = True
    return [_label(G['lines']) for G in groups if G['lines']]


# ── 기호 ────────────────────────────────────────────────────────────────
def _ops(d): return ''.join(it[0][0] for it in d['items'])


def symbols(pno, m, cfg):
    """지도 안 점 기호 → [{xy, cls, size}] (겹친 동심 도형은 하나로: 가장 큰 도형 중심, 분류는 classes 순서가 앞선 것)."""
    sc = cfg['symbols']; lo, hi = sc['sizeRange']; excl = excluded_boxes(m)
    cand = []
    for d in drawings(pno):
        r = d['rect']; w, h = r.width, r.height
        if not (lo <= w <= hi and lo <= h <= hi): continue
        b = [r.x0, r.y0, r.x1, r.y1]
        if not _in_box(b, m['bbox']) or any(_in_box(b, e) for e in excl): continue
        fill, stroke, ops = hexc(d.get('fill')), hexc(d.get('color')), _ops(d)
        for c in sc['classes']:
            if 'fill' in c and fill not in c['fill']: continue
            if 'stroke' in c and stroke != c['stroke']: continue
            if 'ops' in c and not re.search(c['ops'], ops): continue
            if 'size' in c and not (c['size'][0] <= max(w, h) <= c['size'][1]): continue
            cand.append({'xy': _centre(b), 'cls': c['cls'], 'size': max(w, h)}); break
    prio = {}
    for i, c in enumerate(sc['classes']): prio.setdefault(c['cls'], i)
    out = []
    for c in sorted(cand, key=lambda c: -c['size']):
        for o in out:
            if math.dist(o['xy'], c['xy']) <= sc['concentricPt']:
                if prio[c['cls']] < prio[o['cls']]: o['cls'] = c['cls']
                break
        else:
            out.append(dict(c))
    for o in out: o['xy'] = [round(v, 2) for v in o['xy']]; o['size'] = round(o['size'], 2)
    return out


# ── 찾아보기 ──────────────────────────────────────────────────────────────
def index_rows(spans, cfg=None):
    """찾아보기 쪽 글자(흐름 순서) → [{name, page, grid, en?, note?}].
    지명 = 굵은 고딕(nameFont) 조각들(공백으로 이음), 괄호 안 = 영문 이름(라틴) 또는 소속 표시(한글), 쪽·격자 = refRe."""
    cfg = cfg or places_config()['index']
    ref_re = re.compile(cfg['refRe'])
    rows, cur, paren = [], None, None
    def flush():
        if cur and cur['refs']:
            for p, col, row in cur['refs']:
                r = {'name': cur['name'], 'page': int(p), 'grid': f'{col}{row}'}
                if cur.get('en'): r['en'] = cur['en']
                if cur.get('note'): r['note'] = cur['note']
                rows.append(r)
    def put_paren(txt):
        if cur is None: return
        if re.search('[가-힣]', txt): cur['note'] = txt
        else: cur['en'] = txt
    for s in spans:
        t = s['text'].strip()
        if not t: continue
        if paren is not None:
            if t.endswith(')'): paren.append(t[:-1]); put_paren(' '.join(x for x in paren if x).strip()); paren = None
            else: paren.append(t)
            continue
        if t.startswith('(') and cur is not None:
            if t.endswith(')') and len(t) > 1: put_paren(t[1:-1])
            else: paren = [t[1:]]
            continue
        if ref_re.search(t) and re.fullmatch(r'[\d A-Z,]+', t):
            if cur is not None: cur['refs'].extend(ref_re.findall(t))
            continue
        if re.search(cfg['nameFont'], s['font']) and re.search('[가-힣]', t):
            if cur is not None and not cur['refs'] and 'en' not in cur and 'note' not in cur:
                cur['name'] += ' ' + t                                  # 두 조각 지명(고비 + 사막)
            else:
                flush(); cur = {'name': t, 'refs': []}
    flush()
    return rows


@functools.lru_cache(maxsize=None)
def _index_cached():
    c = places_config()['index']
    rows = []
    for p in range(c['pages'][0], c['pages'][1] + 1):
        for r in index_rows(pdfkit.page_spans(p), c): rows.append({**r, 'indexPage': p})
    return tuple(json.dumps(r, ensure_ascii=False) for r in rows)


def parse_index():
    return [json.loads(r) for r in _index_cached()]


def index_keys():
    """찾아보기 지명과 영문 이름(괄호 안 라틴), 설정 extraNames 의 열쇠 — 묶기에서 나누기·여러 줄 잇기를 판단할 때 쓴다."""
    rows = parse_index()
    extra = list(places_config().get('extraNames', {}))
    return frozenset([key(r['name']) for r in rows] + [key(r['en']) for r in rows if r.get('en')] + [key(n) for n in extra])


# ── 지도 하나 ─────────────────────────────────────────────────────────────
def extract(map_id, keys=None):
    cfg = places_config(); m = maps()[map_id]; pno = m['page']
    keys = index_keys() if keys is None else keys
    excl = excluded_boxes(m)
    warnings, dropped, kept, elevs, notes = [], [], [], [], []
    unknown = Counter()
    for s in glue_spans(pdfkit.page_spans(pno), cfg.get('glue', [])):
        b = s['bbox']
        if not _in_box(b, m['bbox']): dropped.append({'text': s['text'], 'why': '지도 틀 밖'}); continue
        if any(_in_box(b, e) for e in excl): dropped.append({'text': s['text'], 'why': '범례·제목 상자'}); continue
        what, r = style_of(s, cfg)
        if what == 'ignore':
            if r.get('elevation'): elevs.append(s)
            else: dropped.append({'text': s['text'], 'why': r['why']})
            continue
        if what is None:
            unknown[(s['font'], s['size'], s['color'])] += 1
            dropped.append({'text': s['text'], 'why': '양식 표에 없음'}); continue
        kept.append({**s, 'rule': r})
    for (f, sz, c), n in unknown.items():
        warnings.append(f'{map_id}: 양식 표에 없는 글자 {n}개 ({f} {sz}pt {c})')
    labels, parens = [], []
    for L in group(kept, keys, notes):
        why = next((e['why'] for e in cfg['exclude'] if re.search(e['re'], L['name'])), None)
        if why:
            dropped.append({'text': L['name'], 'why': why})
            m2 = re.fullmatch(r'\((.+)\)', L['name'])
            if m2 and not re.fullmatch('[가-힣]{1,2}', m2.group(1)): parens.append((m2.group(1), L))   # (인)·(러) 같은 소속 표시는 뺌
            continue
        m2 = re.fullmatch(r'(.+?)\s*\((.+)\)', L['name'])       # 창장강(양쯔강) → 이름 + 다른 이름
        if m2: L['name'], L['alt'] = m2.group(1), m2.group(2)
        labels.append(L)
    # 따로 놓인 괄호 병기((시짱 고원), (K2), (아모이)) → 가장 가까운 지명의 다른 이름(alt)
    main = [L for L in labels if 'attachTo' not in L['rule']]
    pr = pair([P for _, P in parens], main, lambda P, L: math.dist(P['xy'], L['xy']),     # 같은 역할(글꼴 계열) 중 중심이 가까운 것
               lambda P, L: P['role'] == L['role'] and _gap(P['bbox'], L['bbox']) <= cfg['altMaxEm'] * P['size'])
    for i, (alt, P) in enumerate(parens):
        if i in pr and 'alt' not in main[pr[i]]: main[pr[i]]['alt'] = alt
        else: warnings.append(f'{map_id}: 괄호 병기 「{alt}」를 붙일 지명이 없음')
    # 산 높이 숫자 → 가장 가까운 점 지명(아래·옆)
    pts = [L for L in labels if L['rule'].get('point')]
    sc = cfg['symbols']
    pr = pair(elevs, pts, lambda e, L: _gap(e['bbox'], L['bbox']),
               lambda e, L: _gap(e['bbox'], L['bbox']) <= sc['elevMaxEm'] * L['size'])
    for i, e in enumerate(elevs):
        if i in pr: pts[pr[i]]['elev'] = int(e['text'])
        else: warnings.append(f'{map_id}: 높이 {e["text"]} 를 붙일 산 지명이 없음')
    # 기호
    syms = symbols(pno, m, cfg)
    pen = sc['mismatchPenaltyEm']
    pr = pair(pts, syms,
               lambda L, s: _anchor_dist(s['xy'], L) + (0 if (s['cls'] == 'mountain') == ('elev' in L) else pen * L['size']),
               lambda L, s: _anchor_dist(s['xy'], L) <= sc['pairMaxEm'] * L['size'],
               lambda L: sc['pairMaxEm'] * L['size'] * 2)
    for i, L in enumerate(pts):
        if i in pr: L['symbol'] = {'xy': syms[pr[i]]['xy'], 'cls': syms[pr[i]]['cls'], 'd': round(_anchor_dist(syms[pr[i]]['xy'], L) / L['size'], 2)}
        else: warnings.append(f'{map_id}: 점 지명 「{L["name"]}」 옆에 기호가 없음 → 글자 중심을 씀')
    used = set(pr.values())
    unused = [s for j, s in enumerate(syms) if j not in used]
    # 영문 이름
    main = [L for L in labels if 'attachTo' not in L['rule']]
    for en_role in sorted({L['role'] for L in labels if 'attachTo' in L['rule']}):
        ens = [L for L in labels if L['role'] == en_role]; rule = ens[0]['rule']
        tg = [L for L in main if L['role'] in rule['attachTo']
              and (not rule.get('attachSymbol') or (L.get('symbol') or {}).get('cls') == rule['attachSymbol'])]
        pr = pair(ens, tg, lambda e, t: _gap(e['bbox'], t['bbox']),
                   lambda e, t: _gap(e['bbox'], t['bbox']) <= rule['maxDistEm'] * e['size'])
        for i, e in enumerate(ens):
            if i in pr: tg[pr[i]]['en'] = e['name']
            else: warnings.append(f'{map_id}: 영문 이름 「{e["name"]}」을 붙일 지명이 없음')
    labels = main
    for L in labels:
        L['kind'] = kind_of(L['role'], L['name'], (L.get('symbol') or {}).get('cls'), cfg)
        if L['kind'] == 'mountain' and L['role'] == 'city' and 'elev' not in L:
            warnings.append(f'{map_id}: 산 「{L["name"]}」에 높이 숫자가 없음')
        L['point'] = bool(L['rule'].get('point'))                 # 점 지명(도시·수도·산 봉우리): 위치 = 기호
        del L['rule']
    return {'id': map_id, 'page': pno, 'labels': labels, 'dropped': dropped, 'notes': notes, 'unusedSymbols': unused,
            'report': {'labels': len(labels), 'kinds': dict(Counter(L['kind'] for L in labels)),
                       'symbols': len(syms), 'unusedSymbols': len(unused), 'warnings': warnings}}


def _write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def main(argv):
    sys.stdout.reconfigure(encoding='utf-8')
    cfg = places_config()
    rows = parse_index()
    out = os.path.join(WORK, cfg['index']['out'])
    _write(out, rows)
    print(f'찾아보기 {len(rows)}줄 → {out}')
    if '--index' in argv: return
    keys = index_keys()
    for mid in [a for a in argv if not a.startswith('--')] or cfg['maps']:
        r = extract(mid, keys)
        out = os.path.join(WORK, 'text', f'places-{mid}.json')
        _write(out, r)
        rep = r['report']
        print(f"{mid}: 지명 {rep['labels']} {rep['kinds']} 기호 {rep['symbols']}(안 쓴 것 {rep['unusedSymbols']}) "
              f"경고 {len(rep['warnings'])} → {out}")
        for n in r['notes']: print('  ', n)
        for w in rep['warnings']: print('  경고:', w)


if __name__ == '__main__':
    main(sys.argv[1:])
