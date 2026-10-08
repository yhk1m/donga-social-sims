# © 2026 김용현
# scripts/atlas/charts_read.py — 그래프 종류별 읽개. 설정(config/u2.json 의 charts.items[id])을 받아 그래프 하나의 숫자를 되살린다.
#   READERS[type](cid, c, ctx) → 그래프 dict (extract_tables.py 가 부른다). ctx = {'warnings': [...], 'climate': 97쪽 표}
# 원칙: 인쇄된 숫자가 있으면 그것(method 'printed'), 없으면 도형을 잰다(method 'measured' + precision = 어림 정밀도, 값 단위).
#   축: 눈금 글자(charts_axes.number_tokens) → 눈금선에 붙이고(snap) → 값 ↔ 지면 위치 직선(fit_axis), 잔차는 정밀도에 들어간다.
#   막대 = 사각형 길이, 꺾은선 = 선 위 x 에서의 y, 띠 면 = 세로선 위 보이는 색 구간(칠한 순서), 원·고리 = 바깥 호가 쓸어 간 각.
#   인쇄된 숫자와 잰 값이 둘 다 있으면 짝을 지어(헝가리안) 어긋남을 check 에 남긴다.
import math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from shapely.geometry import Point
import pdfkit
import charts_axes as AX
import charts_geom as G
from assign import pair, BIG

HANGUL = re.compile(r'[가-힣]')


# ── 공통 ────────────────────────────────────────────────────────────────
def text(pno, box):
    return pdfkit.box_text(pno, box) if box else None


def strip_parens(s):
    s = (s or '').strip()
    return s[1:-1].strip() if s.startswith('(') and s.endswith(')') else s


def meta(cid, c):
    """제목·출처·단위(원문 그대로). 단위는 unitBox 글자(괄호 벗김)가 있으면 그것, 아니면 설정 unit."""
    title = text(c['page'], c.get('titleBox')) or c.get('title')
    src = text(c['page'], c.get('sourceBox')) if c.get('sourceBox') else None
    unit = strip_parens(text(c['page'], c['unitBox'])) if c.get('unitBox') else c.get('unit')
    return {'type': c['type'], 'title': title, 'unit': unit, 'source': src or None, 'page': c['page'],
            'bbox': c['bbox'], **({'notes': c['notes']} if c.get('notes') else {})}


def rnd(v, nd=2):
    return None if v is None else round(float(v), nd)


def decimals_for(prec):
    """정밀도에 맞는 소수 자리(정밀도의 한 자리 아래까지)."""
    return max(0, min(4, int(-math.floor(math.log10(prec))) + 1)) if prec and prec > 0 else 2


def axis(pno, box, orient, *, color=None, font=None, ticks=None, snap_tol=1.5, require_snap=False, signed_zero=None,
         exclude=None):
    """눈금 글자로 축을 맞춘다. orient 'x'(가로 위치) 또는 'y'. ticks = 눈금선 위치(있으면 글자를 붙임).
    require_snap 이면 눈금선에 붙은 글자만 쓴다(축 시작 글자가 왼쪽 맞춤으로 비껴 있을 때).
    signed_zero = 가운데 0 의 지면 위치(인구 피라미드: 그보다 작은 쪽 글자는 음수). → (Axis, 글자 목록, 정보)"""
    toks = AX.number_tokens(pno, box, color=color, font=font)
    if exclude: toks = [t for t in toks if not exclude(t)]
    key = 'cx' if orient == 'x' else 'cy'
    pos = [t[key] for t in toks]
    if ticks:
        sp = AX.snap(pos, ticks, snap_tol)
        snapped = [abs(a - b) > 1e-9 or b in ticks for a, b in zip(pos, sp)]
        pos = sp
        if require_snap:
            keep = [i for i, s in enumerate(snapped) if s]
            toks = [toks[i] for i in keep]; pos = [pos[i] for i in keep]
    for t, p in zip(toks, pos): t['pos'] = p
    if signed_zero is not None:
        pairs = [(p, -t['value'] if p < signed_zero - 0.5 else t['value']) for t, p in zip(toks, pos)]
    else:
        pairs = [(p, t['value']) for t, p in zip(toks, pos)]
    ax = AX.fit_axis(pairs)
    return ax, toks


def x_ticks(p, c):
    """가로축 눈금 위치: xTickFillColor 가 있으면 그 색 채움(점선 눈금을 잘게 쪼갠 사각형 묶음)의 가운데 x, 아니면 xTickBox 안 세로 곧은 선."""
    if not c.get('xTickBox'): return None
    if c.get('xTickFillColor'):
        return G._dedup(sorted(_cx(f['rect']) for f in G.fills(p, c['xTickBox'], c['xTickFillColor']) if f['rect'][3] - f['rect'][1] > 20))
    return G.vlines(p, c['xTickBox'], c.get('xTickColor'))


def label_lines(pno, box, join=' '):
    """영역 안 글자 조각(page_spans)을 줄(세로 가운데 2pt 안)로 묶어 [{text, cy, bbox}] (위→아래)."""
    sp = sorted((s for s in pdfkit.page_spans(pno) if _cin(s['bbox'], box)), key=lambda s: (_cy(s['bbox']), s['bbox'][0]))
    lines = []
    for s in sp:
        if lines and abs(_cy(s['bbox']) - lines[-1]['cy']) < 2:
            L = lines[-1]; L['parts'].append(s)
        else:
            lines.append({'cy': _cy(s['bbox']), 'parts': [s]})
    out = []
    for L in lines:
        ps = sorted(L['parts'], key=lambda s: s['bbox'][0])
        t = ''
        for i, s in enumerate(ps):
            if i and s['bbox'][0] - ps[i - 1]['bbox'][2] > 0.15 * s['size']: t += join
            t += s['text']
        bb = [min(s['bbox'][0] for s in ps), min(s['bbox'][1] for s in ps), max(s['bbox'][2] for s in ps), max(s['bbox'][3] for s in ps)]
        out.append({'text': t, 'cy': L['cy'], 'bbox': bb})
    return out


def _cy(b): return (b[1] + b[3]) / 2
def _cx(b): return (b[0] + b[2]) / 2
def _cin(b, box): return box[0] <= _cx(b) <= box[2] and box[1] <= _cy(b) <= box[3]


def _rect_dist(p, b):
    dx = max(b[0] - p[0], 0, p[0] - b[2]); dy = max(b[1] - p[1], 0, p[1] - b[3])
    return math.hypot(dx, dy)


def series_entry(name, values, method, **kw):
    return {'name': name, 'values': values, 'method': method, **{k: v for k, v in kw.items() if v is not None}}


def year_list(spec):
    """설정 categories {years: [시작, 끝, 간격], extra: [..]} → 정렬된 해 목록."""
    a, b, s = spec['years']
    ys = list(range(a, b + 1, s)) + list(spec.get('extra', []))
    return sorted(set(ys))


# ── 기후 그래프(21쪽) ─────────────────────────────────────────────────────
def read_climograph(cid, c, ctx):
    W = ctx['warnings']; p = c['page']; fr = c['bbox']
    out = meta(cid, c)
    city = text(p, c['cityBox'])
    out['city'] = city
    yt = G.hlines(p, fr)   # 격자선·0℃ 선·틀 위아래 변 — 눈금 글자를 여기에 붙인다
    tax, _ = axis(p, fr, 'y', color=c['tempColor'], font='DIN', ticks=yt)
    pax, _ = axis(p, fr, 'y', color=c['precColor'], font='DIN', ticks=yt)
    bars = sorted((f for f in G.fills(p, fr, c['precColor']) if not all(it[0] == 'c' for it in f['d']['items'])), key=lambda f: f['rect'][0])
    dots = sorted((f for f in G.fills(p, fr, c['tempColor']) if all(it[0] == 'c' for it in f['d']['items'])), key=lambda f: f['rect'][0])
    if len(bars) != 12 or len(dots) != 12:
        W.append(f'{cid}: 강수 막대 {len(bars)}개·기온 점 {len(dots)}개 (12개여야 함)')
    base = [pax.val(f['rect'][3]) for f in bars]
    if base and max(abs(v) for v in base) > 2 * AX.precision(pax):
        W.append(f'{cid}: 강수 막대 바닥이 0mm 가 아님(최대 {max(abs(v) for v in base):.1f})')
    mprec = [pax.val(f['rect'][1]) for f in bars][:12]
    mtemp = [tax.val(_cy(f['rect'])) for f in dots][:12]
    tp, pp = AX.precision(tax), AX.precision(pax)
    out['categories'] = list(range(1, 13)); out['categoryKind'] = 'month'
    out['axes'] = {'temp': tax.to_json(), 'prec': pax.to_json()}
    out['unit'] = c['unit']
    row = ctx['climate'].get(city)
    meas_t = [rnd(v, decimals_for(tp)) for v in mtemp]; meas_p = [rnd(v, decimals_for(pp)) for v in mprec]
    if row:
        out['series'] = [series_entry('기온', row['temp'], 'printed', unit='℃', printedAt=f'p{row["page"]} 표'),
                         series_entry('강수량', row['prec'], 'printed', unit='mm', printedAt=f'p{row["page"]} 표')]
        out['measured'] = {'기온': meas_t, '강수량': meas_p, 'precision': {'기온': round(tp, 3), '강수량': round(pp, 3)}}
        dt = max(abs(a - b) for a, b in zip(mtemp, row['temp'])); dp = max(abs(a - b) for a, b in zip(mprec, row['prec']))
        out['check'] = {'maxTempDiff': round(dt, 2), 'maxPrecDiff': round(dp, 1)}
        out['annual'] = {'temp': row['annualTemp'], 'prec': row['annualPrec']}
        if dt > c['tempTol'] or dp > c['precTol']:
            W.append(f'{cid}: 잰 값과 97쪽 표가 어긋남 (기온 {dt:.2f}℃, 강수 {dp:.1f}mm)')
    else:
        if city not in ctx['notInTable']:
            W.append(f'{cid}: {city} 가 97쪽 표에 없음(설정 climateTable.notInTable 에도 없음)')
        out['series'] = [series_entry('기온', meas_t, 'measured', unit='℃', precision=round(tp, 3)),
                         series_entry('강수량', meas_p, 'measured', unit='mm', precision=round(pp, 3))]
        out.setdefault('notes', ctx['notInTable'].get(city))
    return out


# ── 꺾은선 ───────────────────────────────────────────────────────────────
def read_line(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xt = x_ticks(p, c)
    yt = G.hlines(p, c['yTickBox']) if c.get('yTickBox') else None
    st = c.get('snapTol', 1.5)
    xax, _ = axis(p, c['xAxisBox'], 'x', font='DIN', ticks=xt, snap_tol=st, require_snap=c.get('xRequireSnap', False))
    yax, _ = axis(p, c['yAxisBox'], 'y', font='DIN', ticks=yt, snap_tol=st, require_snap=c.get('yRequireSnap', False))
    cats = year_list(c['categories'])
    out['categories'] = cats; out['categoryKind'] = 'year'
    out['axes'] = {'x': xax.to_json(), 'y': yax.to_json()}
    prec = AX.precision(yax)
    out['series'] = []
    legend = ' '.join(L['text'] for L in label_lines(p, c['legendBox'])) if c.get('legendBox') else ''
    for s in c['series']:
        if c.get('legendBox') and s['name'] not in legend:
            W.append(f'{cid}: 범례에 「{s["name"]}」 글자가 없음 (범례: {legend})')
        st = [x for x in G.strokes(p, c['plotBox'], s['color']) if x['n'] >= c.get('minSegments', 3)]
        if not st: W.append(f'{cid}: {s["name"]} 선({s["color"]})을 못 찾음'); continue
        paths = [P for x in st for P in x['paths']]
        vals, missing = [], []
        for y in cats:
            x = xax.pos(y)
            ys = [v for P in paths for v in [G.polyline_at(P, x)] if v is not None]
            if not ys:
                # 선 끝이 그 해 눈금보다 조금 짧으면(0.6pt 안) 끝점 값
                ends = [(abs(P[i][0] - x), P[i][1]) for P in paths for i in (0, -1)]
                d, yv = min(ends)
                if d <= c.get('endTolPt', 0.6): ys = [yv]
            if not ys: vals.append(None); missing.append(y); continue
            vals.append(rnd(yax.val(sum(ys) / len(ys)), decimals_for(prec)))
        if missing: W.append(f'{cid}: {s["name"]} 선이 닿지 않는 해 {missing}')
        out['series'].append(series_entry(s['name'], vals, 'measured', precision=round(prec, 3),
                                          xPrecisionYears=round(AX.precision(xax), 2)))
    return out


# ── 가로 막대(단순) ───────────────────────────────────────────────────────
def read_bar(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xax, _ = axis(p, c['xAxisBox'], 'x', font='DIN', ticks=x_ticks(p, c), snap_tol=c.get('snapTol', 1.5),
                  require_snap=c.get('xRequireSnap', False))
    bars = sorted(G.fills(p, c['plotBox'], c['barColor']), key=lambda f: _cy(f['rect']))
    labels = label_lines(p, c['labelBox'])
    groups = [[] for _ in bars]
    for L in labels:
        j = min(range(len(bars)), key=lambda j: abs(_cy(bars[j]['rect']) - L['cy']))
        groups[j].append(L['text'])
    cats = [' '.join(g) for g in groups]
    if c.get('categories') and cats != c['categories']:
        W.append(f'{cid}: 항목 글자 {cats} ≠ 설정 {c["categories"]}')
    prec = AX.precision(xax)
    vals = [rnd(xax.val(f['rect'][2]) - xax.val(f['rect'][0]), decimals_for(prec)) for f in bars]
    out['categories'] = cats
    out['axes'] = {'x': xax.to_json()}
    if c.get('subtitleBox'): out['subtitle'] = text(p, c['subtitleBox'])
    out['series'] = [series_entry(c['seriesName'], vals, 'measured', precision=round(prec, 3))]
    return out


# ── 띠그래프(가로 100% 쌓은 막대, 칸마다 인쇄된 이름·비율) ─────────────────────
def _pair_name_number(p, box, exclude_boxes, number_font='DIN'):
    """영역 안 이름(한글 조각) ↔ 수(낱말) 짝 → [{name, value, bbox}]. 수는 이름 오른쪽 같은 줄이나 바로 아래."""
    ex = lambda b: any(_cin(b, e) for e in exclude_boxes)
    names = [s for s in pdfkit.page_spans(p) if _cin(s['bbox'], box) and HANGUL.search(s['text']) and not ex(s['bbox'])
             and not s['text'].startswith('(')]
    nums = [t for t in AX.number_tokens(p, box, font=number_font) if not ex(t['bbox'])]
    def cost(i, j):
        a, b = names[i]['bbox'], nums[j]['bbox']
        right = math.hypot(max(0, b[0] - a[2]) + max(0, a[0] - b[0]), _cy(a) - _cy(b)) if b[0] >= a[0] else BIG
        below = math.hypot(_cx(a) - _cx(b), max(0, b[1] - a[3])) if b[1] >= _cy(a) else BIG
        return min(right, below)
    m = pair(list(range(len(names))), list(range(len(nums))), cost, lambda i, j: cost(i, j) < 4.0, miss=lambda i: 50)
    out = []
    for i, j in m.items():
        a, b = names[i]['bbox'], nums[j]['bbox']
        out.append({'name': names[i]['text'], 'value': nums[j]['value'],
                    'bbox': [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]})
    used = set(m.values())
    lone = [nums[j] for j in range(len(nums)) if j not in used]
    return out, lone, [names[i]['text'] for i in range(len(names)) if i not in m]


def read_stacked_bar(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xax, _ = axis(p, c['xAxisBox'], 'x', font='DIN', ticks=x_ticks(p, c), snap_tol=c.get('snapTol', 1.5),
                  require_snap=bool(c.get('xTickFillColor')))
    lo, hi = xax.pos(0), xax.pos(c.get('total', 100))
    ign = set(c.get('ignoreColors', []))
    h0, h1 = c['barHeight']
    rects = [f for f in G.fills(p, c['plotBox']) if f['color'] not in ign and h0 <= f['rect'][3] - f['rect'][1] <= h1]
    rows = []
    for f in sorted(rects, key=lambda f: _cy(f['rect'])):
        if rows and abs(_cy(f['rect']) - rows[-1]['cy']) < 2: rows[-1]['items'].append(f)
        else: rows.append({'cy': _cy(f['rect']), 'items': [f]})
    # 항목 이름·합계 글자(막대 왼쪽)
    cats, totals = [], []
    rx = re.compile(c['categoryRe'])
    for r in rows:
        y0 = min(f['rect'][1] for f in r['items']); y1 = max(f['rect'][3] for f in r['items'])
        r['y0'], r['y1'] = y0, y1
        cb = c['categoryBox']
        t = text(p, [cb[0], y0 - c['categoryPad'][0], cb[2], y1 + c['categoryPad'][1]])
        m = rx.match(t or '')
        if not m: W.append(f'{cid}: 막대 왼쪽 글자 「{t}」를 읽지 못함'); cats.append(t); totals.append(None); continue
        cats.append(m['name']); totals.append({'value': AX.parse_num(m['total']), 'unit': m['unit'], 'year': int(m['year'])})
    if c.get('categories') and cats != c['categories']:
        W.append(f'{cid}: 항목 {cats} ≠ 설정 {c["categories"]}')
    # 칸
    prec = AX.precision(xax)
    for r in rows:
        items = [{'i': f['i'], 'x0': f['rect'][0], 'x1': f['rect'][2], 'color': f['color']} for f in r['items']]
        r['segs'] = G.bar_segments(items, lo, hi)
        for s in r['segs']: s['m'] = xax.val(s['x1']) - xax.val(s['x0'])
    # 인쇄된 이름·비율과 지시선
    exclude = [c['categoryBox'], c['xAxisBox']] + [c[k] for k in ('titleBox', 'sourceBox', 'unitBox') if c.get(k)] \
        + c.get('excludeBoxes', [])
    labels, lone, lonen = _pair_name_number(p, c['bbox'], exclude)
    if lone: W.append(f'{cid}: 이름 없는 수 {[t["text"] for t in lone]}')
    if lonen: W.append(f'{cid}: 수 없는 이름 {lonen}')
    # 지시선: 한 끝은 막대 안(점), 다른 끝은 막대 밖 글자 곁. 글자는 막대 밖 끝에만 붙는다.
    # 막대 안에 든 글자(칸 안 이름)는 지시선과 상관없이 제 자리가 곧 가리키는 곳이다(남의 지시선이 스쳐도).
    in_bar = lambda pt: any(r['y0'] - 0.5 <= pt[1] <= r['y1'] + 0.5 and lo - 0.5 <= pt[0] <= hi + 0.5 for r in rows)
    leaders = []
    for P in (P for s in G.strokes(p, c['plotBox'], c['leaderColor']) for P in s['paths']):
        a, b = P[0], P[-1]
        if in_bar(a) != in_bar(b): leaders.append((b, a) if in_bar(a) else (a, b))   # (글자 끝, 막대 끝)
        else: W.append(f'{cid}: 양끝이 모두 막대 {"안" if in_bar(a) else "밖"}인 지시선 {[round(float(v), 1) for v in a]}')
    for L in labels:
        best = None
        if not in_bar([_cx(L['bbox']), _cy(L['bbox'])]):
            for a, b in leaders:
                d = _rect_dist(a, L['bbox'])
                if d <= c['leaderTouchPt'] and (best is None or d < best[0]): best = (d, b)
        L['anchor'] = [float(best[1][0]), float(best[1][1])] if best else [_cx(L['bbox']), _cy(L['bbox'])]
        L['leader'] = best is not None
    series_order, values, measured, orders = [], {}, {}, {}
    maxdiff = 0.0
    for k, r in enumerate(rows):
        mine = [L for L in labels if r['y0'] - 1 <= L['anchor'][1] <= r['y1'] + 1]
        segs = r['segs']
        def cost(i, j):
            L, s = mine[i], segs[j]
            dx = max(s['x0'] - L['anchor'][0], 0, L['anchor'][0] - s['x1'])
            return abs(L['value'] - s['m']) / c['valueScale'] + dx / c['xScalePt']
        def ok(i, j):
            L, s = mine[i], segs[j]
            dx = max(s['x0'] - L['anchor'][0], 0, L['anchor'][0] - s['x1'])
            return abs(L['value'] - s['m']) <= c['maxDiff'] and dx <= c['maxDxPt']
        m = pair(list(range(len(mine))), list(range(len(segs))), cost, ok, miss=lambda i: 1e6)
        cat = cats[k]
        exp = c.get('expectSegments', {}).get(cat)
        if exp is not None and len(segs) != exp: W.append(f'{cid} {cat}: 칸 {len(segs)}개 (설정 {exp})')
        if len(m) != len(segs) or len(m) != len(mine):
            ul = [f'{mine[i]["name"]} {mine[i]["value"]}' for i in range(len(mine)) if i not in m]
            us = [f'{segs[j]["m"]:.2f}%@{segs[j]["x0"]:.1f}' for j in range(len(segs)) if j not in m.values()]
            W.append(f'{cid} {cat}: 칸 {len(segs)}·글자 {len(mine)}·짝 {len(m)} — 짝 없는 글자 {ul}, 칸 {us}')
        orders[cat] = []
        for i, j in sorted(m.items(), key=lambda t: segs[t[1]]['x0']):
            L, s = mine[i], segs[j]
            nm = L['name']
            if nm not in values: series_order.append(nm); values[nm] = {}; measured[nm] = {}
            values[nm][cat] = L['value']; measured[nm][cat] = rnd(s['m'], decimals_for(prec))
            maxdiff = max(maxdiff, abs(L['value'] - s['m']))
            orders[cat].append(nm)
    out['categories'] = cats
    out['total'] = c.get('total', 100)
    out['totals'] = totals
    out['stackOrder'] = orders
    out['axes'] = {'x': xax.to_json()}
    out['series'] = [series_entry(n, [values[n].get(cat) for cat in cats], 'printed',
                                  measured=[measured[n].get(cat) for cat in cats], precision=round(prec, 3)) for n in series_order]
    out['check'] = {'maxAbsDiff': round(maxdiff, 3), 'measuredPrecision': round(prec, 3)}
    if maxdiff > c['warnDiff']: W.append(f'{cid}: 칸 너비와 인쇄 비율 차 최대 {maxdiff:.2f}%p (허용 {c["warnDiff"]})')
    return out


# ── 쌓은 면(세계 인구) ────────────────────────────────────────────────────
def read_stacked_area(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xax, _ = axis(p, c['xAxisBox'], 'x', font='DIN', color=c.get('xAxisColor'), ticks=x_ticks(p, c), snap_tol=c.get('snapTol', 1.5))
    colors = {}
    for s in c['series']:
        for col in [s['color']] + s.get('alsoColors', []): colors[col] = s['name']
    fl = G.fills(p, c['plotBox'], list(colors), geom=True)
    base = c['baselineY']
    def bands(x):
        runs = G.visible_runs(fl, x)
        lens = {}
        for r in runs: lens[colors[r['color']]] = lens.get(colors[r['color']], 0.0) + r['y1'] - r['y0']
        top = min((r['y0'] for r in runs), default=None)
        return runs, lens, top
    # 세로 눈금: 인쇄된 합계(해 위 숫자) ↔ 맨 위 높이
    tot_toks = [t for t in AX.number_tokens(p, c['totalsBox'], color=c['totalsColor'], font=c['totalsFont'])]
    years_t = c['totalYears']
    xs = [xax.pos(y) for y in years_t]
    m = pair(list(range(len(tot_toks))), list(range(len(years_t))), lambda i, j: abs(tot_toks[i]['cx'] - xs[j]),
             lambda i, j: abs(tot_toks[i]['cx'] - xs[j]) < 8, miss=lambda i: 1e6)
    if len(m) != len(years_t): W.append(f'{cid}: 합계 숫자 {len(tot_toks)}개 중 {len(m)}개만 해와 짝')
    printed_tot = {years_t[j]: tot_toks[i]['value'] for i, j in m.items()}
    # 인쇄된 합계는 버림한 수다(totalsRounding 'floor': 9 = 9.0 이상 10 미만) → 칸 가운데(v + 0.5)로 맞춘다
    half = 0.5 if c.get('totalsRounding') == 'floor' else 0.0
    pairs = []
    for y, v in printed_tot.items():
        x = min(max(xax.pos(y), c['plotX'][0] + 0.05), c['plotX'][1] - 0.05)
        _, _, top = bands(x)
        pairs.append((base - top, v + half))
    hgt = AX.fit_scale(pairs)   # 값 = b·높이(pt) — 바닥(높이 0) = 0
    prec = AX.precision(hgt)
    cats = year_list(c['categories'])
    names = [s['name'] for s in c['series']]
    vals = {n: [] for n in names}
    for y in cats:
        x = min(max(xax.pos(y), c['plotX'][0] + 0.05), c['plotX'][1] - 0.05)
        _, lens, _ = bands(x)
        for n in names:
            L = lens.get(n)
            vals[n].append(rnd(hgt.b * L, decimals_for(prec)) if L else None)
    # 인쇄된 몫(%)
    shares = {}
    maxd = 0.0
    for yr, sc in c['shares'].items():
        toks = AX.number_tokens(p, sc['box'], color=sc.get('color'), font='DIN')
        x = min(max(xax.pos(int(yr)), c['plotX'][0] + 0.05), c['plotX'][1] - 0.05)
        runs, lens, _ = bands(x)
        bandpos = {}
        for r in runs:
            n = colors[r['color']]
            if n not in bandpos: bandpos[n] = []
            bandpos[n].append((r['y0'] + r['y1']) / 2)
        bn = [n for n in names if n in bandpos]
        total = sum(lens.values())
        # 글자 ↔ 띠: 세로 거리(3pt 당 1) + 잰 몫과의 차(1%p 당 1) — 얇은 띠 둘(남아메리카·오세아니아) 글자가 한 줄에 붙어 있다
        cost = lambda i, j: min(abs(toks[i]['cy'] - y) for y in bandpos[bn[j]]) / 3 + abs(toks[i]['value'] - 100 * lens[bn[j]] / total)
        mm = pair(list(range(len(toks))), list(range(len(bn))), cost, lambda i, j: True, miss=lambda i: 1e6)
        if len(mm) != len(toks) or len(toks) != len(bn): W.append(f'{cid} {yr}: 몫 글자 {len(toks)}·띠 {len(bn)}·짝 {len(mm)}')
        shares[yr] = {}
        for i, j in mm.items():
            n = bn[j]; v = toks[i]['value']; mv = 100 * lens[n] / total
            shares[yr][n] = {'printed': v, 'measured': round(mv, 2)}
            maxd = max(maxd, abs(v - mv))
    tot_check = {}
    for y, v in printed_tot.items():
        j = cats.index(y) if y in cats else None
        if j is None: continue
        sm = sum(vals[n][j] or 0 for n in names)
        tot_check[y] = {'printed': v, 'measuredSum': round(sm, 2)}
    out['categories'] = cats; out['categoryKind'] = 'year'
    out['axes'] = {'x': xax.to_json(), 'height': hgt.to_json()}
    out['series'] = []
    for s in c['series']:
        out['series'].append(series_entry(s['name'], vals[s['name']], 'measured', precision=round(prec, 3),
                                          **({'note': s['note']} if s.get('note') else {})))
    out['printed'] = {'totals': printed_tot, 'shares': {yr: {n: d['printed'] for n, d in v.items()} for yr, v in shares.items()}}
    out['check'] = {'shares': shares, 'totals': tot_check, 'maxShareDiff': round(maxd, 2), 'heightAxisResidPt': round(hgt.resid, 2)}
    if maxd > c['shareTol']: W.append(f'{cid}: 띠 두께로 잰 몫과 인쇄된 몫 차 최대 {maxd:.2f}%p')
    return out


# ── 인구 피라미드 ─────────────────────────────────────────────────────────
def read_pyramid(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xt = x_ticks(p, c)
    zero_tok = [t for t in AX.number_tokens(p, c['xAxisBox'], font='DIN') if t['value'] == 0]
    if len(zero_tok) != 1: raise ValueError(f'{cid}: 가로축 0 글자가 하나가 아님')
    zero = AX.snap([zero_tok[0]['cx']], xt, 1.5)[0]
    xax, _ = axis(p, c['xAxisBox'], 'x', font='DIN', ticks=xt, signed_zero=zero, require_snap=c.get('xRequireSnap', False))
    prec = AX.precision(xax)
    rows = {}
    for side, s in (('L', c['series'][0]), ('R', c['series'][1])):
        rows[side] = sorted(G.fills(p, c['plotBox'], s['color']), key=lambda f: -_cy(f['rect']))   # 아래(어린 나이)부터
    labels = sorted(label_lines(p, c['labelBox']), key=lambda L: -L['cy'])
    if not (len(rows['L']) == len(rows['R']) == len(labels)):
        W.append(f'{cid}: 막대 {len(rows["L"])}/{len(rows["R"])}·나이 글자 {len(labels)} 수가 다름')
    cats = [L['text'] for L in labels]
    # 「85」「이상」은 따로 놓인 글자 조각이라 띄어쓰기를 기하로 가를 수 없다 → 띄어쓰기 빼고 견주고, 설정의 표기를 쓴다
    if c.get('categories'):
        if [t.replace(' ', '') for t in cats] != [t.replace(' ', '') for t in c['categories']]:
            W.append(f'{cid}: 나이 {cats} ≠ 설정 {c["categories"]}')
        else: cats = list(c['categories'])
    for L, a, b in zip(labels, rows['L'], rows['R']):
        if abs(_cy(a['rect']) - L['cy']) > 2 or abs(_cy(b['rect']) - L['cy']) > 2:
            W.append(f'{cid}: 「{L["text"]}」 줄과 막대 높이가 어긋남')
    legend = ' '.join(L['text'] for L in label_lines(p, c['legendBox']))
    out['categories'] = cats
    out['axes'] = {'x': xax.to_json(), 'zeroX': round(zero, 2)}
    out['series'] = []
    for side, s in (('L', c['series'][0]), ('R', c['series'][1])):
        if s['name'] not in legend: W.append(f'{cid}: 범례에 「{s["name"]}」 없음')
        vals = [rnd(abs(xax.val(f['rect'][2]) - xax.val(f['rect'][0])), decimals_for(prec)) for f in rows[side]]
        out['series'].append(series_entry(s['name'], vals, 'measured', precision=round(prec, 3)))
    tot = sum(v for s in out['series'] for v in s['values'] if v is not None)
    out['check'] = {'sum': round(tot, 2)}
    if abs(tot - 100) > c['sumTol']: W.append(f'{cid}: 피라미드 합 {tot:.1f}% (100 ± {c["sumTol"]})')
    return out


# ── 원(부채꼴)·고리 막대 ──────────────────────────────────────────────────
def _ring_measure(f):
    """채움 도형 하나 → (바깥 호 반지름, 안쪽 호 반지름, 중심, 쓸어 간 각 %)."""
    A = G.arcs(f['d'])
    if not A: return None
    outer = max(A, key=lambda a: a['r'])
    inner = [a for a in A if a['r'] < outer['r'] - 0.5]
    cx, cy, sweep = outer['cx'], outer['cy'], outer['sweep']
    if not inner:
        # 부채꼴: 짧은 호 하나로 맞춘 원 중심은 흔들린다 → 곧은 변이 만나는 꼭짓점(맞춘 중심 가까이)을 중심으로
        ends = [(q.x, q.y) for it in f['d']['items'] if it[0] == 'l' for q in (it[1], it[2])]
        near = [e for e in ends if math.hypot(e[0] - cx, e[1] - cy) < 0.2 * outer['r']]
        if near:
            cx, cy = min(near, key=lambda e: math.hypot(e[0] - outer['cx'], e[1] - outer['cy']))
            sweep = G.sweep_deg(outer['pts'], (cx, cy))
    return {'r': outer['r'], 'ri': max((a['r'] for a in inner), default=0.0), 'cx': cx, 'cy': cy, 'pct': 100 * sweep / 360}


def read_radial(cid, c, ctx):
    """고리 막대(radial bar): 고리마다 바깥 호의 각 = 값 %. 계열 = 고리 맨 위(12시) 띠 높이에 놓인 범례 글자."""
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    cats = []; per = {}
    maxd = 0.0
    for part in c['parts']:
        cats.append(part['name'])
        fl = [f for f in G.fills(p, part['box']) if f['color'] not in set(c.get('ignoreColors', []))]
        rings = [dict(_ring_measure(f), color=f['color']) for f in fl if _ring_measure(f)]
        legend = label_lines(p, part['legendBox'])
        nums = [t for t in AX.number_tokens(p, part['box'], font='DIN') if not _cin(t['bbox'], part['legendBox'])]
        # 계열 이름 ↔ 고리: 글자 세로 가운데가 고리 위쪽 띠(cy − r … cy − ri) 안
        for R in rings:
            hit = [L for L in legend if R['cy'] - R['r'] - 0.5 <= L['cy'] <= R['cy'] - R['ri'] + 0.5]
            R['name'] = hit[0]['text'] if len(hit) == 1 else None
            if len(hit) != 1: W.append(f'{cid} {part["name"]}: 고리(r={R["r"]:.1f}) 범례 글자 {len(hit)}개')
        mm = pair(list(range(len(nums))), list(range(len(rings))), lambda i, j: abs(nums[i]['value'] - rings[j]['pct']),
                  lambda i, j: abs(nums[i]['value'] - rings[j]['pct']) <= c['maxDiff'], miss=lambda i: 1e6)
        if len(mm) != len(rings) or len(nums) != len(rings):
            W.append(f'{cid} {part["name"]}: 고리 {len(rings)}·수 {len(nums)}·짝 {len(mm)}')
        for i, j in mm.items():
            R = rings[j]
            per.setdefault(R['name'], {})[part['name']] = (nums[i]['value'], R['pct'])
            maxd = max(maxd, abs(nums[i]['value'] - R['pct']))
    names = [s for s in c['series']]
    for n in per:
        if n not in names: W.append(f'{cid}: 설정에 없는 계열 「{n}」')
    out['categories'] = cats
    out['series'] = [series_entry(n, [per.get(n, {}).get(k, (None, None))[0] for k in cats], 'printed',
                                  measured=[rnd(per.get(n, {}).get(k, (None, None))[1], 2) for k in cats], precision=0.05)
                     for n in names]
    out['check'] = {'maxAbsDiff': round(maxd, 3)}
    if maxd > c['warnDiff']: W.append(f'{cid}: 고리 각과 인쇄 비율 차 최대 {maxd:.2f}%p')
    return out


def read_pie(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    toks = AX.number_tokens(p, c['bbox'], font='DIN')
    words = AX.words(p, c['bbox'])
    out['categories'] = [c.get('category', '')]
    out['series'] = []
    maxd = 0.0
    for s in c['series']:
        fl = G.fills(p, c['bbox'], s['color'], geom=True)
        if len(fl) != 1: W.append(f'{cid}: {s["name"]} 부채꼴({s["color"]}) {len(fl)}개'); continue
        f = fl[0]; R = _ring_measure(f)
        inside = [t for t in toks if f['geom'].contains(Point(t['cx'], t['cy']))]
        name = ''.join(w['text'] for w in sorted(words, key=lambda w: (round(w['cy']), w['cx']))
                       if f['geom'].contains(Point(w['cx'], w['cy'])) and HANGUL.search(w['text']))
        if name != s['name'].replace(' ', ''): W.append(f'{cid}: 부채꼴 안 글자 「{name}」 ≠ 「{s["name"]}」')
        if len(inside) != 1: W.append(f'{cid}: {s["name"]} 부채꼴 안 수 {len(inside)}개'); v = None
        else: v = inside[0]['value']
        if v is not None: maxd = max(maxd, abs(v - R['pct']))
        out['series'].append(series_entry(s['name'], [v], 'printed', measured=[rnd(R['pct'], 2)], precision=0.05))
    out['check'] = {'maxAbsDiff': round(maxd, 3)}
    if maxd > c['warnDiff']: W.append(f'{cid}: 부채꼴 각과 인쇄 비율 차 최대 {maxd:.2f}%p')
    return out


# ── 칸마다 인쇄된 세로 쌓은 막대(카타르 외국인 국적) ───────────────────────────
def read_stacked_printed(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'stackedBar'
    rects = sorted((f for f in G.fills(p, c['bbox']) if f['color'] not in set(c.get('ignoreColors', []))), key=lambda f: f['rect'][1])
    spans = pdfkit.page_spans(p)
    toks = AX.number_tokens(p, c['bbox'], font='DIN')
    series, total_h = [], sum(f['rect'][3] - f['rect'][1] for f in rects)
    for f in rects:
        nm = ' '.join(s['text'] for s in spans if _cin(s['bbox'], f['rect']) and HANGUL.search(s['text']) and not s['text'].startswith('('))
        vs = [t for t in toks if _cin(t['bbox'], f['rect'])]
        if len(vs) != 1 or not nm: W.append(f'{cid}: 칸 {f["rect"]} 글자 「{nm}」·수 {len(vs)}개'); continue
        series.append((nm, vs[0]['value'], (f['rect'][3] - f['rect'][1]) / total_h))
    tot = sum(v for _, v, _ in series)
    out['categories'] = [c['category']]
    out['total'] = tot
    out['series'] = [series_entry(n, [v], 'printed', measured=[rnd(fr * tot, 2)]) for n, v, fr in series]
    d = max(abs(fr * tot - v) for _, v, fr in series) if series else None
    out['check'] = {'printedSum': round(tot, 2), 'heightVsPrintedMaxDiff': rnd(d, 2), 'toScale': c.get('toScale', True)}
    return out


# ── 글 표(네옴시티) ───────────────────────────────────────────────────────
def read_table(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    heads = label_lines(p, c['headBox'])
    cats, vals = [], []
    for k, H in enumerate(heads):
        y0 = (heads[k - 1]['cy'] + H['cy']) / 2 if k else c['headBox'][1]
        y1 = (heads[k + 1]['cy'] + H['cy']) / 2 if k + 1 < len(heads) else c['headBox'][3]
        cats.append(H['text'])
        v = text(p, [c['valueX'][0], y0, c['valueX'][1], y1])
        for a, b in c.get('replace', {}).items(): v = v.replace(a, b)
        vals.append(v)
    if c.get('categories') and cats != c['categories']: W.append(f'{cid}: 머리 {cats} ≠ 설정 {c["categories"]}')
    out['categories'] = cats
    out['series'] = [series_entry(c['seriesName'], vals, 'printed')]
    return out


READERS = {'climograph': read_climograph, 'line': read_line, 'bar': read_bar, 'stackedBar': read_stacked_bar,
           'stackedArea': read_stacked_area, 'pyramid': read_pyramid, 'radialBar': read_radial, 'pie': read_pie,
           'stackedPrinted': read_stacked_printed, 'table': read_table}
