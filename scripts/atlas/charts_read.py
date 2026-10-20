# © 2026 김용현
# scripts/atlas/charts_read.py — 그래프 종류별 읽개. 설정(단원 설정 charts.items[id])을 받아 그래프 하나의 숫자를 되살린다.
#   READERS[type](cid, c, ctx) → 그래프 dict (extract_tables.py 가 부른다).
#   ctx = {'warnings': [...], 'climate': 부록 기후 표, 'climatePage': 표 쪽, 'climateDecimals': 표 소수 자리, 'notInTable': {...},
#          'defaults': charts.defaults(그래프 설정에 같은 이름이 있으면 그것이 먼저)}
# 원칙: 인쇄된 숫자가 있으면 그것(method 'printed'), 없으면 도형을 잰다(method 'measured' + precision = 어림 정밀도, 값 단위).
#   축: 눈금 글자 → 눈금선에 붙이고(snap) → 잔차 문을 거친 값 ↔ 지면 위치 직선(charts_axes.fit_axis_checked).
#   막대 = 사각형 길이, 꺾은선 = 선 위 x 에서의 y, 띠 면 = 세로선 위 보이는 색 구간(칠한 순서), 원·고리 = 바깥 호가 쓸어 간 각.
#   인쇄된 숫자와 잰 값이 둘 다 있으면 짝을 지어(헝가리안) 어긋남을 check 에 남긴다.
#   잰 값의 소수 자리 = 정밀도의 한 자리 아래, 그래프에 인쇄된 수의 자리 + 1 을 넘지 않는다.
# 2단계 유럽(U3-7)에서 더한 읽개: vbar(세로 막대 — 계열 하나면 bar + 강조 colors·축 생략 axisBreak, 둘 이상이면 groupedBar,
#   막대 위 인쇄된 수 printedBox), donut(고리 — 조각 안 인쇄된 %, 가운데 = 안쪽 호 중심 중앙값, 출력 pie + donut),
#   figure(수치 그림 칸 → 글 표). climograph 는 climateBox(제목 둘째 줄 → climate)·climateTable.aliases(표 이름 다른 도시).
# 2단계 아프리카(U4-7, 모두 설정 키가 있을 때만): donut + valuesOutside(부채꼴 + 흰 구멍 원, 조각 밖 인쇄 %, 레이어 범례 이름 namesFrom),
#   pyramidRaster(막대가 인라인 그림 — 렌더 화소), bubbleRow(원 크기 줄), climograph barsByMonth(막대 없는 달 = 0), figure 칸 groupBox.
import math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from shapely.geometry import Point
import pdfkit
import charts_axes as AX
import charts_geom as G
from charts_labels import HANGUL, text, strip_parens, label_lines, pair_name_number, cx, cin, rect_dist
from atlas_common import yc, color_match
from assign import pair

TICK_FILL_MIN_H = 20      # 띠그래프 점선 눈금(채움 사각형 묶음)은 이보다 높다(칸 높이 ≈ 12)
ROW_PT = 2.0              # 칸 세로 가운데가 이만큼 안이면 같은 막대
IN_BAR_PAD = 0.5          # 지시선 끝이 막대 안인지 볼 때 여유
ROW_LABEL_PAD = 1.0       # 지시선이 가리키는 곳이 막대 위아래로 이만큼까지면 그 막대
LABEL_ROW_PT = 2.0        # 피라미드 나이 줄과 막대 세로 가운데 허용 차
YEAR_MATCH_PT = 8.0       # 쌓은 면 합계 숫자 ↔ 해 눈금 가로 거리 상한
SHARE_DY_PT = 3.0         # 몫 글자 ↔ 띠: 세로 3pt 를 몫 차 1%p 와 같게 친다
PLOT_EDGE_PT = 0.05       # 면 그림 양끝 세로선은 이만큼 안쪽에서 잰다
RING_GAP_PT = 0.5         # 바깥·안쪽 호 반지름이 이만큼 넘게 다르면 다른 호
APEX_FRAC = 0.2           # 부채꼴 꼭짓점은 맞춘 원 중심에서 반지름의 이 비율 안
PRINTED_PREC = 0.05       # 인쇄값(소수 한 자리)의 반올림 정밀도
MISS = 1e6                # 헝가리안 짝 없음 비용(가능한 짝보다 늘 크게)
DIAG_GROUP_PT = 4.0       # 비스듬한 범주 이름: 같은 이름 글자의 cx + cy 차(≈ 0)와 이웃 이름 차(≈ 막대 간격 15pt) 사이
GRID_FILL_MAX_H = 1.0     # 점선 격자(얇은 가로 채움)의 높이 상한(막대와 가름)
GRID_FILL_MIN_W = 20.0    # 점선 격자 채움 묶음의 너비 하한
PRINTED_DX_PT = 3.0       # 막대 위 인쇄된 수 ↔ 막대: 가운데 x 차 상한
PRINTED_DY_PT = 4.0       # 막대 위 끝 − 글자 아래 끝 상한(글자가 막대 위 끝보다 1pt 넘게 아래면 짝 아님)
CELL_LINE_PT = 2.5        # 수치 그림 칸: 세로 가운데가 이만큼 안이면 한 줄(위첨자 「2」도 같은 줄)
CELL_JOIN_EM = 0.15       # 수치 그림 칸: 같은 줄 낱말 사이가 글자 크기의 이만큼 넘게 벌면 공백
CLIMATE_SUFFIX = ' 기후'   # 기후 그래프 제목의 기후 이름 끝(「서안 해양성 기후」 → climate 「서안 해양성」)


# ── 공통 ────────────────────────────────────────────────────────────────
def opt(c, ctx, key):
    """그래프 설정 값, 없으면 charts.defaults 값."""
    return c[key] if key in c else ctx['defaults'][key]


def meta(cid, c):
    """제목·출처·단위(원문 그대로). 단위는 unitBox 글자(괄호 벗김)가 있으면 그것, 아니면 설정 unit."""
    title = text(c['page'], c.get('titleBox')) or c.get('title')
    src = text(c['page'], c.get('sourceBox')) if c.get('sourceBox') else None
    unit = strip_parens(text(c['page'], c['unitBox'])) if c.get('unitBox') else c.get('unit')
    return {'type': c['type'], 'title': title, 'unit': unit, 'source': src or None, 'page': c['page'],
            'bbox': c['bbox'], **({'notes': c['notes']} if c.get('notes') else {})}


def rnd(v, nd=2):
    return None if v is None else round(float(v), nd)


def axis(cid, c, ctx, box, orient, *, name, color=None, ticks=None, require_snap=False, signed_zero=None, scale='linear'):
    """눈금 글자로 축을 맞춘다(잔차 문 포함). orient 'x'(가로 위치) 또는 'y'. ticks = 눈금선 위치(있으면 글자를 붙임).
    require_snap 이면 눈금선에 붙은 글자만 쓴다(축 끝 글자가 단위 「(%)」에 밀리거나 왼쪽 맞춤으로 비껴 있을 때).
    signed_zero = 가운데 0 의 지면 위치(인구 피라미드). → (Axis, 쓴 눈금 글자)"""
    p = c['page']
    toks = AX.number_tokens(p, box, color=color, font=opt(c, ctx, 'numberFont'), de=opt(c, ctx, 'colorDE'))
    key = 'cx' if orient == 'x' else 'cy'
    pos = [t[key] for t in toks]
    if ticks:
        sp = AX.snap(pos, ticks, opt(c, ctx, 'snapTol'))
        snapped = [b in ticks for b in sp]
        pos = sp
        if require_snap:
            keep = [i for i, s in enumerate(snapped) if s]
            toks = [toks[i] for i in keep]; pos = [pos[i] for i in keep]
    placed = [{**t, key: q} for t, q in zip(toks, pos)]
    pairs = AX.signed_pairs(placed, signed_zero, key) if signed_zero is not None else [(t[key], t['value']) for t in placed]
    ax = AX.fit_axis_checked(pairs, tol=opt(c, ctx, 'axisResidTol'), warnings=ctx['warnings'], name=f'{cid} {name}축', scale=scale)
    return ax, toks


def x_ticks(c):
    """가로축 눈금 위치: xTickFillColor 가 있으면 그 색 채움(점선 눈금을 잘게 쪼갠 사각형 묶음)의 가운데 x, 아니면 xTickBox 안 세로 곧은 선."""
    if not c.get('xTickBox'): return None
    p = c['page']
    if c.get('xTickFillColor'):
        return G.dedup(sorted(cx(f['rect']) for f in G.fills(p, c['xTickBox'], c['xTickFillColor'])
                              if f['rect'][3] - f['rect'][1] > TICK_FILL_MIN_H))
    return G.vlines(p, c['xTickBox'], c.get('xTickColor'))


def series_entry(name, values, method, **kw):
    return {'name': name, 'values': values, 'method': method, **{k: v for k, v in kw.items() if v is not None}}


def year_list(spec):
    """설정 categories {years: [시작, 끝, 간격], extra: [..]} → 정렬된 해 목록."""
    a, b, s = spec['years']
    return sorted(set(list(range(a, b + 1, s)) + list(spec.get('extra', []))))


def cap_from(tokens):
    """그래프에 인쇄된 수 글자의 소수 자리 + 1 (잰 값 소수 자리 상한)."""
    return AX.token_decimals(tokens) + 1


# ── 기후 그래프 ───────────────────────────────────────────────────────────
def read_climograph(cid, c, ctx):
    W = ctx['warnings']; p = c['page']; fr = c['bbox']
    out = meta(cid, c)
    city = text(p, c['cityBox'])
    out['city'] = city
    yt = G.hlines(p, fr)   # 격자선·0℃ 선·틀 위아래 변 — 눈금 글자를 여기에 붙인다
    tax, _ = axis(cid, c, ctx, fr, 'y', name='기온', color=c['tempColor'], ticks=yt)
    pax, _ = axis(cid, c, ctx, fr, 'y', name='강수량', color=c['precColor'], ticks=yt)
    de = opt(c, ctx, 'colorDE')
    is_dot = lambda f: all(it[0] == 'c' for it in f['d']['items'])
    bars = sorted((f for f in G.fills(p, fr, c['precColor'], de=de) if not is_dot(f)), key=lambda f: f['rect'][0])
    dots = sorted((f for f in G.fills(p, fr, c['tempColor'], de=de) if is_dot(f)), key=lambda f: f['rect'][0])
    if c.get('barsByMonth'):
        # 비가 거의 없는 달은 막대가 없다(37쪽 카이로 8개·도도마 10개, U4-7): 막대를 가로 위치가 가장 가까운 기온 점(달)에 붙이고 빈 달 = 0
        if len(dots) != 12: W.append(f'{cid}: 기온 점 {len(dots)}개 (12개여야 함)')
        dx = [(f['rect'][0] + f['rect'][2]) / 2 for f in dots]
        by = {}
        for f in bars:
            k = min(range(len(dx)), key=lambda k: abs(dx[k] - (f['rect'][0] + f['rect'][2]) / 2))
            if k in by: W.append(f'{cid}: {k + 1}월에 강수 막대 둘')
            by[k] = f
        base = [pax.val(f['rect'][3]) for f in bars]
        if base and max(abs(v) for v in base) > 2 * AX.precision(pax):
            W.append(f'{cid}: 강수 막대 바닥이 0mm 가 아님(최대 {max(abs(v) for v in base):.1f})')
        mprec = [pax.val(by[k]['rect'][1]) if k in by else 0.0 for k in range(12)]
        out['noBarMonths'] = [k + 1 for k in range(12) if k not in by]
    elif len(bars) != 12 or len(dots) != 12:
        W.append(f'{cid}: 강수 막대 {len(bars)}개·기온 점 {len(dots)}개 (12개여야 함)')
    if not c.get('barsByMonth'):
        base = [pax.val(f['rect'][3]) for f in bars]
        if base and max(abs(v) for v in base) > 2 * AX.precision(pax):
            W.append(f'{cid}: 강수 막대 바닥이 0mm 가 아님(최대 {max(abs(v) for v in base):.1f})')
        mprec = [pax.val(f['rect'][1]) for f in bars][:12]
    mtemp = [tax.val(yc(f['rect'])) for f in dots][:12]
    tp, pp = AX.precision(tax), AX.precision(pax)
    cap = ctx['climateDecimals'] + 1
    out['categories'] = list(range(1, 13)); out['categoryKind'] = 'month'
    out['axes'] = {'temp': tax.to_json(), 'prec': pax.to_json()}
    out['unit'] = c['unit']
    # 기후 이름: 그래프 제목 둘째 줄 「(서안 해양성 기후)」 → 「서안 해양성」 (climateBox 가 있을 때만 — u2 설정에는 없음)
    if c.get('climateBox'):
        zone = strip_parens(text(p, c['climateBox']))
        out['climate'] = zone[:-len(CLIMATE_SUFFIX)].strip() if zone.endswith(CLIMATE_SUFFIX) else zone
        out['title'] = f'{city} ({zone})'   # 두 줄 제목을 box_text 로 이으면 줄 길이에 따라 공백이 들고 빠져(「그레니비크(툰드라 기후)」) 두 상자 글자로 맞춘다
    # 표 이름이 그래프 제목과 다른 도시(파리 ↔ 97쪽 「파리(오를리)」): 설정 climateTable.aliases
    key = ctx.get('climateAliases', {}).get(city, city)
    row = ctx['climate'].get(key)
    if row and key != city: out['tableName'] = key
    if row and c.get('climateBox') and row.get('zone') and row['zone'] != out['climate'] + CLIMATE_SUFFIX:
        W.append(f'{cid}: 그래프 기후 「{out["climate"]}」 ≠ {row["page"]}쪽 표 「{row["zone"]}」')
    meas_t = [rnd(v, AX.decimals_for(tp, cap)) for v in mtemp]; meas_p = [rnd(v, AX.decimals_for(pp, cap)) for v in mprec]
    if row:
        at = f'p{row["page"]} 표'
        out['series'] = [series_entry('기온', row['temp'], 'printed', unit='℃', printedAt=at, color=c['tempColor']),
                         series_entry('강수량', row['prec'], 'printed', unit='mm', printedAt=at, color=c['precColor'])]
        out['measured'] = {'기온': meas_t, '강수량': meas_p, 'precision': {'기온': round(tp, 3), '강수량': round(pp, 3)}}
        dt = max(abs(a - b) for a, b in zip(mtemp, row['temp'])); dp = max(abs(a - b) for a, b in zip(mprec, row['prec']))
        out['check'] = {'maxTempDiff': round(dt, 2), 'maxPrecDiff': round(dp, 1)}
        out['annual'] = {'temp': row['annualTemp'], 'prec': row['annualPrec']}
        if dt > c['tempTol'] or dp > c['precTol']:
            W.append(f'{cid}: 잰 값과 {row["page"]}쪽 표가 어긋남 (기온 {dt:.2f}℃, 강수 {dp:.1f}mm)')
    else:
        if city not in ctx['notInTable']:
            W.append(f'{cid}: {city} 가 {ctx["climatePage"]}쪽 표에 없음(설정 climateTable.notInTable 에도 없음)')
        out['series'] = [series_entry('기온', meas_t, 'measured', unit='℃', precision=round(tp, 3), color=c['tempColor']),
                         series_entry('강수량', meas_p, 'measured', unit='mm', precision=round(pp, 3), color=c['precColor'])]
        if ctx['notInTable'].get(city): out.setdefault('notes', ctx['notInTable'][city])
    return out


# ── 꺾은선 ───────────────────────────────────────────────────────────────
def read_line(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    yt = G.hlines(p, c['yTickBox']) if c.get('yTickBox') else None
    xax, _ = axis(cid, c, ctx, c['xAxisBox'], 'x', name='가로', ticks=x_ticks(c), require_snap=c.get('xRequireSnap', False))
    yax, ytoks = axis(cid, c, ctx, c['yAxisBox'], 'y', name='세로', ticks=yt, require_snap=c.get('yRequireSnap', False),
                      scale=opt(c, ctx, 'axisScale'))
    cats = year_list(c['categories'])
    out['categories'] = cats; out['categoryKind'] = 'year'
    out['axes'] = {'x': xax.to_json(), 'y': yax.to_json()}
    prec = AX.precision(yax); nd = AX.decimals_for(prec, cap_from(ytoks))
    de = opt(c, ctx, 'colorDE')
    legend = ' '.join(L['text'] for L in label_lines(p, c['legendBox'])) if c.get('legendBox') else ''
    out['series'] = []
    for s in c['series']:
        if c.get('legendBox') and s['name'] not in legend:
            W.append(f'{cid}: 범례에 「{s["name"]}」 글자가 없음 (범례: {legend})')
        lines = [x for x in G.strokes(p, c['plotBox'], s['color'], de=de) if x['n'] >= c['minSegments']]
        paths = [P for x in lines for P in x['paths'] if len(P) >= 2]
        if not paths:
            W.append(f'{cid}: {s["name"]} 선({s["color"]})을 못 찾음')
            out['series'].append(series_entry(s['name'], [None] * len(cats), 'measured', precision=round(prec, 3), color=s['color'])); continue
        vals, missing = [], []
        for yr in cats:
            x = xax.pos(yr)
            ys = [v for P in paths for v in [G.polyline_at(P, x)] if v is not None]
            if not ys:
                # 선 끝이 그 해 눈금보다 조금 짧으면(endTolPt 안) 끝점 값
                d, yv = min((abs(P[k][0] - x), P[k][1]) for P in paths for k in (0, -1))
                if d <= opt(c, ctx, 'endTolPt'): ys = [yv]
            if not ys: vals.append(None); missing.append(yr); continue
            vals.append(rnd(yax.val(sum(ys) / len(ys)), nd))
        if missing: W.append(f'{cid}: {s["name"]} 선이 닿지 않는 해 {missing}')
        out['series'].append(series_entry(s['name'], vals, 'measured', precision=round(prec, 3),
                                          xPrecisionYears=round(AX.precision(xax), 2), color=s['color']))
    return out


# ── 가로 막대(단순) ───────────────────────────────────────────────────────
def read_bar(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xax, xtoks = axis(cid, c, ctx, c['xAxisBox'], 'x', name='가로', ticks=x_ticks(c), require_snap=c.get('xRequireSnap', False),
                      scale=opt(c, ctx, 'axisScale'))
    bars = sorted(G.fills(p, c['plotBox'], c['barColor'], de=opt(c, ctx, 'colorDE')), key=lambda f: yc(f['rect']))
    if not bars: raise ValueError(f'{cid}: 막대({c["barColor"]})가 없음')
    groups = [[] for _ in bars]
    for L in label_lines(p, c['labelBox']):
        j = min(range(len(bars)), key=lambda j: abs(yc(bars[j]['rect']) - L['cy']))
        groups[j].append(L['text'])
    cats = [' '.join(g) for g in groups]
    if c.get('categories') and cats != c['categories']:
        W.append(f'{cid}: 항목 글자 {cats} ≠ 설정 {c["categories"]}')
    prec = AX.precision(xax); nd = AX.decimals_for(prec, cap_from(xtoks))
    out['categories'] = cats
    out['axes'] = {'x': xax.to_json()}
    if c.get('subtitleBox'): out['subtitle'] = text(p, c['subtitleBox'])
    out['series'] = [series_entry(c['seriesName'], [rnd(xax.val(f['rect'][2]) - xax.val(f['rect'][0]), nd) for f in bars],
                                  'measured', precision=round(prec, 3), color=c['barColor'])]
    return out


# ── 세로 막대(단순·강조 색·축 생략 / 묶음) ─────────────────────────────────────
def y_ticks(c):
    """세로축 눈금선 y: yTickBox 안 가로 곧은 선 + (yTickFillColor 가 있으면) 그 색의 얇은 가로 채움(점선 격자를 잘게 쪼갠 사각형 묶음)."""
    if not c.get('yTickBox'): return None
    p = c['page']
    ys = list(G.hlines(p, c['yTickBox']))
    if c.get('yTickFillColor'):
        ys += [yc(f['rect']) for f in G.fills(p, c['yTickBox'], c['yTickFillColor'])
               if f['rect'][3] - f['rect'][1] < GRID_FILL_MAX_H and f['rect'][2] - f['rect'][0] > GRID_FILL_MIN_W]
    return G.dedup(sorted(ys))


def diagonal_labels(p, box, n):
    """비스듬히(왼쪽 아래 → 오른쪽 위) 한 글자씩 놓인 범주 이름 → 왼쪽 막대부터 n 개.
    같은 이름의 글자는 cx + cy 가 같다(한 글자마다 x +d, y −d). cx + cy 로 무리를 나누고, 무리 안은 x 순으로 잇는다."""
    ws = sorted((w for w in AX.words(p, box) if w['text'].strip()), key=lambda w: w['cx'] + w['cy'])
    groups = []
    for w in ws:
        k = w['cx'] + w['cy']
        if groups and k - groups[-1]['k'] < DIAG_GROUP_PT: groups[-1]['ws'].append(w)
        else: groups.append({'ws': [w]})
        groups[-1]['k'] = k
    if len(groups) != n: raise ValueError(f'비스듬한 이름 무리 {len(groups)}개 ≠ 막대 {n}개')
    return [''.join(w['text'] for w in sorted(g['ws'], key=lambda w: w['cx'])) for g in groups]


def row_labels(p, box, centers):
    """한 줄에 가로로 놓인 범주 이름 → 가운데 x 가 가장 가까운 막대 무리에 붙인다(무리마다 x 순으로 이음)."""
    got = [[] for _ in centers]
    for w in AX.words(p, box):
        j = min(range(len(centers)), key=lambda j: abs(centers[j] - w['cx']))
        got[j].append(w)
    return [' '.join(w['text'] for w in sorted(g, key=lambda w: w['cx'])) for g in got]


def read_vbar(cid, c, ctx):
    """세로 막대: 값 = 막대 위 끝 y 를 세로축으로(축 생략이면 yAxisBox 를 생략 위 눈금만 담게 — 0 은 생략 아래라 맞추기에서 뺀다).
    계열이 하나면 type 'bar'(막대 색이 계열 색과 다르면 colors {범주: 색} — 강조), 둘 이상이면 type 'groupedBar'(범주마다 계열 차례).
    막대 위에 인쇄된 수(printedBox)가 있으면 그것(printed, 잰 값은 measured, 차는 check), 없으면 잰 값(measured + precision).
    범주 이름: labelMode 'diagonal'(비스듬히 한 글자씩) · 'row'(한 줄 가로) · 'config'(설정 categories — 해 {years} 또는 목록)."""
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    yax, ytoks = axis(cid, c, ctx, c['yAxisBox'], 'y', name='세로', ticks=y_ticks(c), require_snap=c.get('yRequireSnap', False),
                      scale=opt(c, ctx, 'axisScale'))
    prec = AX.precision(yax); nd = AX.decimals_for(prec, cap_from(ytoks))
    series = c['series']
    colors = [s['color'] for s in series] + list(c.get('highlightColors', []))
    de = opt(c, ctx, 'colorDE')
    bars = sorted((f for f in G.fills(p, c['plotBox'], colors, de=de) if f['rect'][3] - f['rect'][1] >= c.get('minBarHeight', 0)),
                  key=lambda f: f['rect'][0])
    ns = len(series)
    if not bars or len(bars) % ns: raise ValueError(f'{cid}: 막대 {len(bars)}개가 계열 {ns}개로 나뉘지 않음')
    groups = [bars[k:k + ns] for k in range(0, len(bars), ns)]
    if ns > 1:
        # 묶음: 무리 안은 설정 series 차례(왼쪽부터)로 색이 하나씩, 무리 안 틈 < 무리 사이 틈
        inner = max(g[i + 1]['rect'][0] - g[i]['rect'][2] for g in groups for i in range(ns - 1))
        outer = min(b[0]['rect'][0] - a[-1]['rect'][2] for a, b in zip(groups, groups[1:])) if len(groups) > 1 else math.inf
        if inner >= outer: W.append(f'{cid}: 막대 무리를 가를 수 없음(무리 안 틈 {inner:.2f} ≥ 무리 사이 {outer:.2f}pt)')
        for g in groups:
            got = [f['color'] for f in g]
            if got != [s['color'] for s in series]: W.append(f'{cid}: 무리 {[round(f["rect"][0], 1) for f in g]} 색 차례 {got}')
    centers = [(g[0]['rect'][0] + g[-1]['rect'][2]) / 2 for g in groups]
    mode = c.get('labelMode', 'row')
    if mode == 'diagonal': cats = diagonal_labels(p, c['labelBox'], len(groups))
    elif mode == 'row': cats = row_labels(p, c['labelBox'], centers)
    elif mode == 'config': cats = year_list(c['categories']) if isinstance(c['categories'], dict) else list(c['categories'])
    else: raise ValueError(f'{cid}: 모르는 labelMode {mode}')
    if mode != 'config' and c.get('categories') and cats != c['categories']:
        W.append(f'{cid}: 항목 글자 {cats} ≠ 설정 {c["categories"]}')
    if len(cats) != len(groups): raise ValueError(f'{cid}: 항목 {len(cats)}개 ≠ 막대 무리 {len(groups)}개')
    out['categories'] = cats
    if mode == 'config' and isinstance(c['categories'], dict): out['categoryKind'] = 'year'
    out['axes'] = {'y': yax.to_json()}
    if c.get('axisBreak'): out['axisBreak'] = list(c['axisBreak'])
    else:   # 바닥 = 0 인지(축 생략이면 바닥은 생략 아래라 보지 않음)
        base = max(abs(yax.val(f['rect'][3])) for f in bars)
        if base > 2 * prec: W.append(f'{cid}: 막대 바닥이 0 이 아님(최대 {base:.2f})')
    meas = [[yax.val(g[i]['rect'][1]) for g in groups] for i in range(ns)]
    printed = None
    if c.get('printedBox'):
        # 막대 위 인쇄된 수 ↔ 막대: 가운데 x 가 가깝고 글자 아래 끝이 막대 위 끝 바로 위 — 헝가리안 짝
        toks = AX.number_tokens(p, c['printedBox'], font=opt(c, ctx, 'numberFont'))
        flat = [(i, k, g[i]['rect']) for k, g in enumerate(groups) for i in range(ns)]
        dx = lambda a, b: abs(toks[a]['cx'] - cx(flat[b][2]))
        dy = lambda a, b: flat[b][2][1] - toks[a]['bbox'][3]
        m = pair(list(range(len(toks))), list(range(len(flat))), lambda a, b: dx(a, b) + abs(dy(a, b)),
                 lambda a, b: dx(a, b) <= PRINTED_DX_PT and -1.0 <= dy(a, b) <= PRINTED_DY_PT, miss=lambda a: MISS)
        if len(m) != len(flat) or len(toks) != len(flat):
            W.append(f'{cid}: 막대 {len(flat)}·인쇄된 수 {len(toks)}·짝 {len(m)}')
        printed = [[None] * len(groups) for _ in range(ns)]
        for a, b in m.items():
            i, k, _ = flat[b]; printed[i][k] = toks[a]['value']
    out['series'] = []
    maxd = 0.0
    for i, s in enumerate(series):
        mv = [rnd(v, nd) for v in meas[i]]
        if printed:
            maxd = max([maxd] + [abs(a - b) for a, b in zip(printed[i], meas[i]) if a is not None])
            out['series'].append(series_entry(s['name'], printed[i], 'printed', measured=mv, precision=round(prec, 3), color=s['color']))
        else:
            out['series'].append(series_entry(s['name'], mv, 'measured', precision=round(prec, 3), color=s['color']))
    if ns == 1:
        hl = {cats[k]: g[0]['color'] for k, g in enumerate(groups) if g[0]['color'] != series[0]['color']}
        if hl: out['colors'] = hl
        if 'highlight' in c and sorted(hl) != sorted(c['highlight']): W.append(f'{cid}: 강조 막대 {sorted(hl)} ≠ 설정 {sorted(c["highlight"])}')
    out['type'] = 'bar' if ns == 1 else 'groupedBar'
    if printed:
        out['check'] = {'maxAbsDiff': round(maxd, 3)}
        if maxd > c['warnDiff']: W.append(f'{cid}: 막대 높이와 인쇄된 수 차 최대 {maxd:.2f} (허용 {c["warnDiff"]})')
    return out


# ── 고리(도넛) — 조각마다 인쇄된 % ────────────────────────────────────────────
def read_donut(cid, c, ctx):
    """고리 조각: 계열 색마다 가장 큰 채움(같은 색 아이콘과 가름)을 조각으로. 고리 가운데 = 조각들 안쪽 호 중심의 중앙값
    (짧은 바깥 호 하나로 맞춘 원은 중심이 흔들린다 — 31쪽 도보 11% 조각은 따로 맞추면 반지름 25.9 ↔ 27.5),
    잰 % = 그 가운데에서 바깥 호가 쓸어 간 각. 조각 안 인쇄된 수(valueColor) = 값(printed).
    이름은 조각 밖 같은 색 글자(labelColor, legendBox 안)로 확인. 출력 type 'pie' + donut(안쪽/바깥 반지름) — 화면은 원그래프 길."""
    if c.get('valuesOutside'): return read_donut_outside(cid, c, ctx)   # 2단계 아프리카(U4-7): 조각 밖 인쇄 % — 키가 있을 때만
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'pie'
    toks = AX.number_tokens(p, c['bbox'], color=c.get('valueColor'), font=opt(c, ctx, 'numberFont'))
    nd = cap_from(toks)
    slices = []
    for s in c['series']:
        fl = G.fills(p, c['bbox'], s['color'], geom=True, de=opt(c, ctx, 'colorDE'))
        f = max(fl, key=lambda f: f['geom'].area) if fl else None
        A = G.arcs(f['d']) if f else []
        outer = max(A, key=lambda a: a['r']) if A else None
        inner = [a for a in A if outer and a['r'] < outer['r'] - RING_GAP_PT]
        slices.append((s, f, outer, inner))
        if f is None: W.append(f'{cid}: {s["name"]} 조각({s["color"]}) 없음')
        elif outer is None: W.append(f'{cid}: {s["name"]} 조각에 원호가 없음 — 각을 잴 수 없음')
    inn = [a for *_, inner in slices for a in inner] or [o for _, _, o, _ in slices if o]
    if not inn: raise ValueError(f'{cid}: 고리 원호가 없음')
    center = (float(np.median([a['cx'] for a in inn])), float(np.median([a['cy'] for a in inn])))
    words = AX.words(p, c.get('legendBox', c['bbox']))
    out['categories'] = [c.get('category', '')]
    out['series'] = []
    maxd, msum, r_out, r_in, used = 0.0, 0.0, [], [], set()
    for s, f, outer, inner in slices:
        v = mv = None
        if f is not None:
            inside = [j for j, t in enumerate(toks) if f['geom'].contains(Point(t['cx'], t['cy']))]
            used.update(inside)
            v = toks[inside[0]]['value'] if len(inside) == 1 else None
            if v is None: W.append(f'{cid}: {s["name"]} 조각 안 수 {len(inside)}개')
        if outer is not None:
            mv = 100 * G.sweep_deg(outer['pts'], center) / 360
            r_out.append(float(np.mean([math.hypot(x - center[0], y - center[1]) for x, y in outer['pts']])))
            r_in += [float(np.mean([math.hypot(x - center[0], y - center[1]) for x, y in a['pts']])) for a in inner]
            msum += mv
            if v is not None: maxd = max(maxd, abs(v - mv))
        if s.get('labelColor') and not any(w['text'] == s['name'] and w['color'] == s['labelColor'] for w in words):
            W.append(f'{cid}: {s["name"]} 이름 글자({s["labelColor"]})가 없음')
        out['series'].append(series_entry(s['name'], [v], 'printed', measured=[rnd(mv, nd)], precision=PRINTED_PREC, color=s['color']))
    if len(toks) != len(used): W.append(f'{cid}: 조각에 들지 않은 수 {[toks[j]["text"] for j in range(len(toks)) if j not in used]}')
    if r_out and (max(r_out) - min(r_out) > RING_GAP_PT or (r_in and max(r_in) - min(r_in) > RING_GAP_PT)):
        W.append(f'{cid}: 조각 반지름이 서로 다름(바깥 {min(r_out):.2f}~{max(r_out):.2f}, 안 {min(r_in, default=0):.2f}~{max(r_in, default=0):.2f})')
    if r_out and r_in: out['donut'] = round(float(np.mean(r_in)) / float(np.mean(r_out)), 3)
    out['check'] = {'maxAbsDiff': round(maxd, 3), 'measuredSum': round(msum, 2)}
    if maxd > c['warnDiff']: W.append(f'{cid}: 조각 각과 인쇄 비율 차 최대 {maxd:.2f}%p')
    if abs(msum - 100) > c['warnDiff']: W.append(f'{cid}: 조각 각 합 {msum:.2f}% ≠ 100 (겹치거나 빈 조각)')
    return out


# ── 수치 그림(인포그래픽 — 칸마다 이름·수 글자) → 글 표 ───────────────────────────
def cell_text(p, box, ignore=()):
    """상자 안 낱말을 줄(세로 가운데 LINE_PT 안)로 묶어 [줄 글자] (위→아래). 같은 줄 낱말 사이가 글자 크기의 JOIN_EM 넘게 벌면 공백,
    아니면 붙인다(「2,500」+「개」 → 2,500개, 「24km」+위첨자 「2」 → 24km2 — 설정 replace 로 km²). ignore = 뺄 글자색(겹쳐 찍은 그림자 글자)."""
    ws = sorted((w for w in AX.words(p, box) if w['color'] not in ignore), key=lambda w: (w['cy'], w['cx']))
    lines = []
    for w in ws:
        if lines and abs(w['cy'] - lines[-1]['cy']) < CELL_LINE_PT: lines[-1]['ws'].append(w)
        else: lines.append({'cy': w['cy'], 'ws': [w]})
    out = []
    for L in lines:
        t, prev = '', None
        for w in sorted(L['ws'], key=lambda w: w['bbox'][0]):
            if prev is not None and w['bbox'][0] - prev['bbox'][2] > CELL_JOIN_EM * max(w['size'], prev['size']): t += ' '
            t += w['text']; prev = w
        out.append(t)
    return out


def read_figure(cid, c, ctx):
    """수치 그림(30쪽 소피아 앙티폴리스 8칸, 31쪽 프라이부르크 구름 4개): 칸(cells[].box)마다 글자 줄 → 이름·값.
    이름 = nameLine 번째 줄(기본: 마지막 줄 — 「2,500개 / 기업」), 값 = 나머지 줄을 공백으로. 출력은 글 표(type 'table')."""
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'table'
    ign = set(c.get('ignoreColors', []))
    cats, vals = [], []
    for cell in c['cells']:
        lines = cell_text(p, cell['box'], ign)
        for a, b in c.get('replace', {}).items(): lines = [L.replace(a, b) for L in lines]
        k = cell.get('nameLine', c.get('nameLine', -1))
        if len(lines) < 2: W.append(f'{cid}: 칸 {cell["box"]} 줄 {lines}'); cats.append(' '.join(lines)); vals.append(''); continue
        k = k % len(lines)
        name = lines[k]
        # 묶음 글자(39쪽 AfCFTA 「2021년」·「2030년 목표」 — 칸 여럿의 머리): cell.groupBox 가 있을 때만 이름 앞에 붙인다(U4-7)
        if cell.get('groupBox'): name = f'{" ".join(cell_text(p, cell["groupBox"], ign))} {name}'
        cats.append(name); vals.append(' '.join(L for j, L in enumerate(lines) if j != k))
    if c.get('categories') and cats != c['categories']: W.append(f'{cid}: 이름 {cats} ≠ 설정 {c["categories"]}')
    out['categories'] = cats
    out['series'] = [series_entry(c['seriesName'], vals, 'printed')]
    return out


# ── 띠그래프(가로 100% 쌓은 막대, 칸마다 인쇄된 이름·비율) ─────────────────────
def _bar_rows(c, ctx, xax, lo, hi):
    """막대마다 {cy, y0, y1, items, segs, report}."""
    ign = set(c.get('ignoreColors', []))
    h0, h1 = c['barHeight']
    rects = [f for f in G.fills(c['page'], c['plotBox']) if f['color'] not in ign and h0 <= f['rect'][3] - f['rect'][1] <= h1]
    rows = []
    for f in sorted(rects, key=lambda f: yc(f['rect'])):
        if rows and abs(yc(f['rect']) - rows[-1]['cy']) < ROW_PT: rows[-1]['items'].append(f)
        else: rows.append({'cy': yc(f['rect']), 'items': [f]})
    for r in rows:
        r['y0'] = min(f['rect'][1] for f in r['items']); r['y1'] = max(f['rect'][3] for f in r['items'])
        items = [{'i': f['i'], 'x0': f['rect'][0], 'x1': f['rect'][2], 'color': f['color']} for f in r['items']]
        r['segs'], r['report'] = G.bar_segments(items, lo, hi, max_gap=opt(c, ctx, 'maxGapPt'))
        for s in r['segs']: s['m'] = xax.val(s['x1']) - xax.val(s['x0'])
    return rows


def _anchor_labels(cid, c, rows, labels, lo, hi, W):
    """지시선: 한 끝은 막대 안(점), 다른 끝은 막대 밖 글자 곁. 글자는 막대 밖 끝에만 붙는다.
    막대 안에 든 글자(칸 안 이름)는 지시선과 상관없이 제 자리가 곧 가리키는 곳이다(남의 지시선이 스쳐도)."""
    in_bar = lambda pt: any(r['y0'] - IN_BAR_PAD <= pt[1] <= r['y1'] + IN_BAR_PAD and lo - IN_BAR_PAD <= pt[0] <= hi + IN_BAR_PAD
                            for r in rows)
    leaders = []
    for P in (P for s in G.strokes(c['page'], c['plotBox'], c['leaderColor']) for P in s['paths']):
        a, b = P[0], P[-1]
        if in_bar(a) != in_bar(b): leaders.append((b, a) if in_bar(a) else (a, b))   # (글자 끝, 막대 끝)
        else: W.append(f'{cid}: 양끝이 모두 막대 {"안" if in_bar(a) else "밖"}인 지시선 {[round(float(v), 1) for v in a]}')
    for L in labels:
        best = None
        if not in_bar([cx(L['bbox']), yc(L['bbox'])]):
            for a, b in leaders:
                d = rect_dist(a, L['bbox'])
                if d <= c['leaderTouchPt'] and (best is None or d < best[0]): best = (d, b)
        L['anchor'] = [float(best[1][0]), float(best[1][1])] if best else [cx(L['bbox']), yc(L['bbox'])]
        L['leader'] = best is not None


def read_stacked_bar(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    total = c.get('total', 100)
    xax, _ = axis(cid, c, ctx, c['xAxisBox'], 'x', name='가로', ticks=x_ticks(c), require_snap=bool(c.get('xTickFillColor')))
    lo, hi = xax.pos(0), xax.pos(total)
    rows = _bar_rows(c, ctx, xax, lo, hi)
    # 항목 이름·합계 글자(막대 왼쪽)
    cats, totals = [], []
    rx = re.compile(c['categoryRe'])
    cb = c['categoryBox']
    for r in rows:
        t = text(p, [cb[0], r['y0'] - c['categoryPad'][0], cb[2], r['y1'] + c['categoryPad'][1]])
        mt = rx.match(t or '')
        if not mt: W.append(f'{cid}: 막대 왼쪽 글자 「{t}」를 읽지 못함'); cats.append(t); totals.append(None); continue
        cats.append(mt['name']); totals.append({'value': AX.parse_num(mt['total']), 'unit': mt['unit'], 'year': int(mt['year'])})
    if c.get('categories') and cats != c['categories']:
        W.append(f'{cid}: 항목 {cats} ≠ 설정 {c["categories"]}')
    exclude = [cb, c['xAxisBox']] + [c[k] for k in ('titleBox', 'sourceBox', 'unitBox') if c.get(k)] + c.get('excludeBoxes', [])
    labels, lone, lonen = pair_name_number(p, c['bbox'], exclude, opt(c, ctx, 'numberFont'))
    if lone: W.append(f'{cid}: 이름 없는 수 {[t["text"] for t in lone]}')
    if lonen: W.append(f'{cid}: 수 없는 이름 {lonen}')
    _anchor_labels(cid, c, rows, labels, lo, hi, W)
    prec = AX.precision(xax); nd = AX.decimals_for(prec, cap_from(labels))
    series_order, values, measured, colors, orders, dropped, gaps = [], {}, {}, {}, {}, [], []
    maxdiff = 0.0
    for k, r in enumerate(rows):
        cat = cats[k]
        mine = [L for L in labels if r['y0'] - ROW_LABEL_PAD <= L['anchor'][1] <= r['y1'] + ROW_LABEL_PAD]
        segs = r['segs']
        dropped += [{'category': cat, **d} for d in r['report']['dropped']]
        if r['report']['gaps']:
            gaps += [{'category': cat, 'gap': g} for g in r['report']['gaps']]
            W.append(f'{cid} {cat}: 칸 사이 틈 {r["report"]["gaps"]} (maxGapPt {opt(c, ctx, "maxGapPt")})')
        def dx(L, s): return max(s['x0'] - L['anchor'][0], 0, L['anchor'][0] - s['x1'])
        cost = lambda i, j: abs(mine[i]['value'] - segs[j]['m']) / c['valueScale'] + dx(mine[i], segs[j]) / c['xScalePt']
        ok = lambda i, j: abs(mine[i]['value'] - segs[j]['m']) <= c['maxDiff'] and dx(mine[i], segs[j]) <= c['maxDxPt']
        m = pair(list(range(len(mine))), list(range(len(segs))), cost, ok, miss=lambda i: MISS)
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
            if nm not in values: series_order.append(nm); values[nm] = {}; measured[nm] = {}; colors[nm] = {}
            values[nm][cat] = L['value']; measured[nm][cat] = rnd(s['m'], nd); colors[nm][cat] = s.get('color')
            maxdiff = max(maxdiff, abs(L['value'] - s['m']))
            orders[cat].append(nm)
    out['categories'] = cats
    out['total'] = total
    out['totals'] = totals
    out['stackOrder'] = orders
    out['axes'] = {'x': xax.to_json()}
    out['series'] = [series_entry(n, [values[n].get(k) for k in cats], 'printed',
                                  measured=[measured[n].get(k) for k in cats], precision=round(prec, 3),
                                  colors=[colors[n].get(k) for k in cats]) for n in series_order]
    out['check'] = {'maxAbsDiff': round(maxdiff, 3), 'measuredPrecision': round(prec, 3), 'droppedSegments': dropped, 'gaps': gaps}
    if maxdiff > c['warnDiff']: W.append(f'{cid}: 칸 너비와 인쇄 비율 차 최대 {maxdiff:.2f}%p (허용 {c["warnDiff"]})')
    return out


# ── 쌓은 면(세계 인구) ────────────────────────────────────────────────────
def read_stacked_area(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xax, _ = axis(cid, c, ctx, c['xAxisBox'], 'x', name='가로', color=c.get('xAxisColor'), ticks=x_ticks(c))
    colors = {}
    for s in c['series']:
        for col in [s['color']] + s.get('alsoColors', []): colors[col] = s['name']
    fl = G.fills(p, c['plotBox'], list(colors), geom=True, de=opt(c, ctx, 'colorDE'))
    base = c['baselineY']
    xmin, xmax = c['plotX'][0] + PLOT_EDGE_PT, c['plotX'][1] - PLOT_EDGE_PT
    def bands(year):
        runs = G.visible_runs(fl, min(max(xax.pos(year), xmin), xmax))
        lens = {}
        for r in runs: lens[colors[r['color']]] = lens.get(colors[r['color']], 0.0) + r['y1'] - r['y0']
        return runs, lens, min((r['y0'] for r in runs), default=None)
    # 세로 눈금이 없다: 인쇄된 합계(해 위 숫자) ↔ 맨 위 높이
    tot_toks = AX.number_tokens(p, c['totalsBox'], color=c['totalsColor'], font=c['totalsFont'])
    years_t = c['totalYears']
    xs = [xax.pos(yr) for yr in years_t]
    m = pair(list(range(len(tot_toks))), list(range(len(years_t))), lambda i, j: abs(tot_toks[i]['cx'] - xs[j]),
             lambda i, j: abs(tot_toks[i]['cx'] - xs[j]) < YEAR_MATCH_PT, miss=lambda i: MISS)
    if len(m) != len(years_t): W.append(f'{cid}: 합계 숫자 {len(tot_toks)}개 중 {len(m)}개만 해와 짝')
    printed_tot = {years_t[j]: tot_toks[i]['value'] for i, j in sorted(m.items(), key=lambda t: t[1])}
    # 인쇄된 합계는 버림한 수다(totalsRounding 'floor': 9 = 9.0 이상 10 미만) → 칸 가운데(v + 0.5)로 맞춘다
    half = 0.5 if c.get('totalsRounding') == 'floor' else 0.0
    pairs = []
    for yr, v in printed_tot.items():
        top = bands(yr)[2]
        if top is None: W.append(f'{cid}: {yr}년 세로선 위에 띠가 없음'); continue
        pairs.append((base - top, v + half))
    hgt = AX.fit_scale(pairs)   # 값 = b·높이(pt) — 바닥(높이 0) = 0
    prec = AX.precision(hgt)
    share_toks = [t for sc in c['shares'].values() for t in AX.number_tokens(p, sc['box'], color=sc.get('color'), font=opt(c, ctx, 'numberFont'))]
    nd = AX.decimals_for(prec, cap_from(tot_toks + share_toks))
    cats = year_list(c['categories'])
    names = [s['name'] for s in c['series']]
    vals = {n: [] for n in names}
    for yr in cats:
        lens = bands(yr)[1]
        for n in names:
            L = lens.get(n)
            vals[n].append(rnd(hgt.b * L, nd) if L else None)
    # 인쇄된 몫(%)
    shares, maxd = {}, 0.0
    for yr, sc in c['shares'].items():
        toks = AX.number_tokens(p, sc['box'], color=sc.get('color'), font=opt(c, ctx, 'numberFont'))
        runs, lens, _ = bands(int(yr))
        tot_len = sum(lens.values())
        if tot_len <= 0: W.append(f'{cid}: {yr}년 띠 두께 합이 0'); continue
        bandpos = {}
        for r in runs: bandpos.setdefault(colors[r['color']], []).append((r['y0'] + r['y1']) / 2)
        bn = [n for n in names if n in bandpos]
        # 글자 ↔ 띠: 세로 거리 + 잰 몫과의 차 — 얇은 띠 둘(남아메리카·오세아니아) 글자가 한 줄에 붙어 있다
        cost = lambda i, j: (min(abs(toks[i]['cy'] - q) for q in bandpos[bn[j]]) / SHARE_DY_PT
                             + abs(toks[i]['value'] - 100 * lens[bn[j]] / tot_len))
        mm = pair(list(range(len(toks))), list(range(len(bn))), cost, lambda i, j: True, miss=lambda i: MISS)
        if len(mm) != len(toks) or len(toks) != len(bn): W.append(f'{cid} {yr}: 몫 글자 {len(toks)}·띠 {len(bn)}·짝 {len(mm)}')
        shares[yr] = {}
        for i, j in mm.items():
            n = bn[j]; v = toks[i]['value']; mv = 100 * lens[n] / tot_len
            shares[yr][n] = {'printed': v, 'measured': round(mv, 2)}
            maxd = max(maxd, abs(v - mv))
    tot_check = {}
    for yr, v in printed_tot.items():
        if yr not in cats: continue
        j = cats.index(yr)
        tot_check[yr] = {'printed': v, 'measuredSum': round(sum(vals[n][j] or 0 for n in names), 2)}
    out['categories'] = cats; out['categoryKind'] = 'year'
    if c.get('sheetStackOrder'): out['stackOrder'] = list(c['sheetStackOrder'])   # 쌓는 순서(아래 → 위), 교과서 그림 차례
    out['axes'] = {'x': xax.to_json(), 'height': hgt.to_json()}
    out['series'] = [series_entry(s['name'], vals[s['name']], 'measured', precision=round(prec, 3), color=s['color'],
                                  **({'note': s['note']} if s.get('note') else {})) for s in c['series']]
    out['printed'] = {'totals': printed_tot, 'shares': {yr: {n: d['printed'] for n, d in v.items()} for yr, v in shares.items()}}
    out['check'] = {'shares': shares, 'totals': tot_check, 'maxShareDiff': round(maxd, 2), 'heightAxisResidPt': round(hgt.resid, 2)}
    if maxd > c['shareTol']: W.append(f'{cid}: 띠 두께로 잰 몫과 인쇄된 몫 차 최대 {maxd:.2f}%p')
    return out


# ── 인구 피라미드 ─────────────────────────────────────────────────────────
def read_pyramid(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    xt = x_ticks(c)
    zero_tok = [t for t in AX.number_tokens(p, c['xAxisBox'], font=opt(c, ctx, 'numberFont')) if t['value'] == 0]
    if len(zero_tok) != 1: raise ValueError(f'{cid}: 가로축 0 글자가 하나가 아님')
    zero = AX.snap([zero_tok[0]['cx']], xt, opt(c, ctx, 'snapTol'))[0]
    xax, xtoks = axis(cid, c, ctx, c['xAxisBox'], 'x', name='가로', ticks=xt, signed_zero=zero, require_snap=c.get('xRequireSnap', False))
    prec = AX.precision(xax); nd = AX.decimals_for(prec, cap_from(xtoks))
    de = opt(c, ctx, 'colorDE')
    left, right = c['series']
    rows = {side: sorted(G.fills(p, c['plotBox'], s['color'], de=de), key=lambda f: -yc(f['rect']))   # 아래(어린 나이)부터
            for side, s in (('L', left), ('R', right))}
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
        if abs(yc(a['rect']) - L['cy']) > LABEL_ROW_PT or abs(yc(b['rect']) - L['cy']) > LABEL_ROW_PT:
            W.append(f'{cid}: 「{L["text"]}」 줄과 막대 높이가 어긋남')
    legend = ' '.join(L['text'] for L in label_lines(p, c['legendBox']))
    out['categories'] = cats
    out['axes'] = {'x': xax.to_json(), 'zeroX': round(zero, 2)}
    out['series'], tot = [], 0.0
    for side, s in (('L', left), ('R', right)):
        if s['name'] not in legend: W.append(f'{cid}: 범례에 「{s["name"]}」 없음')
        raw = [abs(xax.val(f['rect'][2]) - xax.val(f['rect'][0])) for f in rows[side]]
        tot += sum(raw)                                   # 합은 반올림 전 값으로
        out['series'].append(series_entry(s['name'], [rnd(v, nd) for v in raw], 'measured', precision=round(prec, 3), color=s['color']))
    out['check'] = {'sum': round(tot, 2)}
    if abs(tot - 100) > c['sumTol']: W.append(f'{cid}: 피라미드 합 {tot:.1f}% (100 ± {c["sumTol"]})')
    return out


# ── 원(부채꼴)·고리 막대 ──────────────────────────────────────────────────
def ring_measure(f):
    """채움 도형 하나 → {r(바깥 호), ri(안쪽 호), cx, cy, pct(바깥 호가 쓸어 간 각 %), startDeg(12시 쪽 끝의 시계 각), dir(그 끝에서 본 방향)}.
    원호가 없으면 None. 부채꼴(안쪽 호 없음)은 곧은 변이 만나는 꼭짓점을 중심으로 쓴다(짧은 호로 맞춘 중심은 흔들린다)."""
    A = G.arcs(f['d'])
    if not A: return None
    outer = max(A, key=lambda a: a['r'])
    inner = [a for a in A if a['r'] < outer['r'] - RING_GAP_PT]
    ccx, ccy = outer['cx'], outer['cy']
    if not inner:
        ends = [(q.x, q.y) for it in f['d']['items'] if it[0] == 'l' for q in (it[1], it[2])]
        near = [e for e in ends if math.hypot(e[0] - ccx, e[1] - ccy) < APEX_FRAC * outer['r']]
        if near: ccx, ccy = min(near, key=lambda e: math.hypot(e[0] - outer['cx'], e[1] - outer['cy']))
    pts = outer['pts']
    a0, a1 = G.clock_angle(pts[0], (ccx, ccy)), G.clock_angle(pts[-1], (ccx, ccy))
    off = lambda a: min(a, 360 - a)                    # 12시에서 떨어진 각
    if off(a1) < off(a0): pts = pts[::-1]; a0 = a1      # 12시에 가까운 끝에서 시작
    return {'r': outer['r'], 'ri': max((a['r'] for a in inner), default=0.0), 'cx': ccx, 'cy': ccy,
            'pct': 100 * G.sweep_deg(pts, (ccx, ccy)) / 360, 'startDeg': off(a0), 'dir': G.arc_direction(pts, (ccx, ccy))}


def read_radial(cid, c, ctx):
    """고리 막대(radial bar): 고리마다 12시에서 설정 direction(기본 시계 방향)으로 바깥 호의 각 = 값 %.
    계열 = 고리 맨 위(12시) 띠 높이에 놓인 범례 글자."""
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    want_dir = c.get('direction', 'cw'); tol_deg = opt(c, ctx, 'startTolDeg')
    cats, per, maxd, all_nums = [], {}, 0.0, []
    for part in c['parts']:
        cats.append(part['name'])
        rings = []
        for f in G.fills(p, part['box']):
            if f['color'] in set(c.get('ignoreColors', [])): continue
            R = ring_measure(f)
            if R is None: W.append(f'{cid} {part["name"]}: 원호 없는 채움 {f["rawColor"]}'); continue
            if R['startDeg'] > tol_deg or R['dir'] != want_dir:
                W.append(f'{cid} {part["name"]}: 고리(r={R["r"]:.1f})가 12시에서 {want_dir} 로 시작하지 않음 '
                         f'(시작 {R["startDeg"]:.1f}°, 방향 {R["dir"]})')
            R['color'] = f['color']
            rings.append(R)
        legend = label_lines(p, part['legendBox'])
        nums = [t for t in AX.number_tokens(p, part['box'], font=opt(c, ctx, 'numberFont')) if not cin(t['bbox'], part['legendBox'])]
        all_nums += nums
        # 계열 이름 ↔ 고리: 글자 세로 가운데가 고리 위쪽 띠(cy − r … cy − ri) 안
        for R in rings:
            hit = [L for L in legend if R['cy'] - R['r'] - RING_GAP_PT <= L['cy'] <= R['cy'] - R['ri'] + RING_GAP_PT]
            R['name'] = hit[0]['text'] if len(hit) == 1 else None
            if len(hit) != 1: W.append(f'{cid} {part["name"]}: 고리(r={R["r"]:.1f}) 범례 글자 {len(hit)}개')
        mm = pair(list(range(len(nums))), list(range(len(rings))), lambda i, j: abs(nums[i]['value'] - rings[j]['pct']),
                  lambda i, j: abs(nums[i]['value'] - rings[j]['pct']) <= c['maxDiff'], miss=lambda i: MISS)
        if len(mm) != len(rings) or len(nums) != len(rings):
            W.append(f'{cid} {part["name"]}: 고리 {len(rings)}·수 {len(nums)}·짝 {len(mm)}')
        for i, j in mm.items():
            R = rings[j]
            per.setdefault(R['name'], {})[part['name']] = (nums[i]['value'], R['pct'], R['color'])
            maxd = max(maxd, abs(nums[i]['value'] - R['pct']))
    names = list(c['series'])
    for n in per:
        if n not in names: W.append(f'{cid}: 설정에 없는 계열 「{n}」')
    nd = cap_from(all_nums)
    get = lambda n, k, ix: per.get(n, {}).get(k, (None, None, None))[ix]
    out['categories'] = cats
    out['series'] = [series_entry(n, [get(n, k, 0) for k in cats], 'printed', measured=[rnd(get(n, k, 1), nd) for k in cats],
                                  precision=PRINTED_PREC, colors=[get(n, k, 2) for k in cats]) for n in names]
    out['check'] = {'maxAbsDiff': round(maxd, 3)}
    if maxd > c['warnDiff']: W.append(f'{cid}: 고리 각과 인쇄 비율 차 최대 {maxd:.2f}%p')
    return out


def read_pie(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    toks = AX.number_tokens(p, c['bbox'], font=opt(c, ctx, 'numberFont'))
    nd = cap_from(toks)
    words = sorted(AX.words(p, c['bbox']), key=lambda w: (round(w['cy']), w['cx']))
    out['categories'] = [c.get('category', '')]
    out['series'] = []
    maxd, msum = 0.0, 0.0
    for s in c['series']:
        fl = G.fills(p, c['bbox'], s['color'], geom=True, de=opt(c, ctx, 'colorDE'))
        if len(fl) != 1:
            W.append(f'{cid}: {s["name"]} 부채꼴({s["color"]}) {len(fl)}개')
            out['series'].append(series_entry(s['name'], [None], 'printed', color=s['color'])); continue
        f = fl[0]
        R = ring_measure(f)
        if R is None: W.append(f'{cid}: {s["name"]} 부채꼴에 원호가 없음 — 각을 잴 수 없음')
        inside = [t for t in toks if f['geom'].contains(Point(t['cx'], t['cy']))]
        name = ''.join(w['text'] for w in words if f['geom'].contains(Point(w['cx'], w['cy'])) and HANGUL.search(w['text']))
        if name != s['name'].replace(' ', ''): W.append(f'{cid}: 부채꼴 안 글자 「{name}」 ≠ 「{s["name"]}」')
        v = inside[0]['value'] if len(inside) == 1 else None
        if v is None: W.append(f'{cid}: {s["name"]} 부채꼴 안 수 {len(inside)}개')
        mv = R['pct'] if R else None
        if v is not None and mv is not None: maxd = max(maxd, abs(v - mv))
        if mv is not None: msum += mv
        out['series'].append(series_entry(s['name'], [v], 'printed', measured=[rnd(mv, nd)], precision=PRINTED_PREC, color=s['color']))
    out['check'] = {'maxAbsDiff': round(maxd, 3), 'measuredSum': round(msum, 2)}
    if maxd > c['warnDiff']: W.append(f'{cid}: 부채꼴 각과 인쇄 비율 차 최대 {maxd:.2f}%p')
    if abs(msum - 100) > c['warnDiff']: W.append(f'{cid}: 부채꼴 각 합 {msum:.2f}% ≠ 100 (겹치거나 빈 조각)')
    return out


# ── 칸마다 인쇄된 세로 쌓은 막대(카타르 외국인 국적) ───────────────────────────
def read_stacked_printed(cid, c, ctx):
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'stackedBar'
    ign = set(c.get('ignoreColors', []))
    rects = sorted((f for f in G.fills(p, c['bbox']) if f['color'] not in ign), key=lambda f: f['rect'][1])
    spans = pdfkit.page_spans(p)
    toks = AX.number_tokens(p, c['bbox'], font=opt(c, ctx, 'numberFont'))
    nd = cap_from(toks)
    rows, total_h = [], sum(f['rect'][3] - f['rect'][1] for f in rects)
    if total_h <= 0: raise ValueError(f'{cid}: 칸이 없음')
    for f in rects:
        nm = ' '.join(s['text'] for s in spans if cin(s['bbox'], f['rect']) and HANGUL.search(s['text']) and not s['text'].startswith('('))
        vs = [t for t in toks if cin(t['bbox'], f['rect'])]
        if len(vs) != 1 or not nm: W.append(f'{cid}: 칸 {[round(v, 1) for v in f["rect"]]} 글자 「{nm}」·수 {len(vs)}개'); continue
        rows.append((nm, vs[0]['value'], (f['rect'][3] - f['rect'][1]) / total_h, f['color']))
    tot = sum(r[1] for r in rows)
    out['categories'] = [c['category']]
    out['total'] = tot
    out['series'] = [series_entry(n, [v], 'printed', measured=[rnd(fr * tot, nd)], color=col) for n, v, fr, col in rows]
    d = max(abs(fr * tot - v) for _, v, fr, _ in rows) if rows else None
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


# ── 2단계 아프리카(U4-7) ────────────────────────────────────────────────────
OUT_ANG_SCALE = 10.0      # 조각 밖 수 ↔ 조각: 각 10° 를 값 차 1%p 와 같게 친다
MIN_SLICE_PT2 = 5.0       # 고리 조각 넓이 하한(지도 땅 조각 부스러기 #ede9e4 를 뺌 — 가장 작은 조각 0.8% ≈ 15pt²)


def _slice_span(pts, center):
    """부채꼴 바깥 호 → (시작 각, 끝 각) 12시 = 0 시계 방향(도). 시작이 359° 넘으면 0 쪽으로."""
    sw = G.sweep_deg(pts, center)
    a0 = G.clock_angle(pts[0] if G.arc_direction(pts, center) == 'cw' else pts[-1], center)
    if a0 > 359.0: a0 -= 360.0
    return a0, a0 + sw


def _ang_dist(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def read_donut_outside(cid, c, ctx):
    """고리(38쪽 자원 7): 조각 = 가운데에서 뻗은 부채꼴 채움(색마다 가장 큰 것), 구멍 = holeColor 원(가운데·안쪽 반지름).
    인쇄된 % 는 조각 **밖**(valuesOutside) — 구멍 밖 수 글자를 각(글자 가운데의 시계 각 ↔ 조각 가운데 각)과 잰 값으로 짝(헝가리안).
    조각 이름: namesFrom {layer, otherColor, otherName} — 그 레이어 설정 legendItems 의 색 ↔ 조각 색(ΔE ≤ namesDE), otherColor = 「기타」.
    가운데 글자(구멍 안 줄들 — 총량·단위·해)는 인쇄 그대로 center. 출력 type 'pie' + ring(안쪽/바깥 반지름) — 앱은 SVG 고리."""
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'pie'
    de = opt(c, ctx, 'colorDE')
    holes = [f for f in G.fills(p, c['bbox'], c['holeColor'], de=de) if G.arcs(f['d'])]
    if not holes: raise ValueError(f'{cid}: 구멍 원({c["holeColor"]})이 없음')
    hole = max(holes, key=lambda f: (f['rect'][2] - f['rect'][0]) * (f['rect'][3] - f['rect'][1]))
    ha = max(G.arcs(hole['d']), key=lambda a: a['r'])
    center, r_in = (ha['cx'], ha['cy']), ha['r']
    nf = c['namesFrom']
    legend = {e['color']: e['label'] for e in ctx['layers'][nf['layer']]['legendItems']}
    if nf.get('otherColor'): legend[nf['otherColor']] = nf['otherName']
    big = {}
    for f in G.fills(p, c['bbox'], geom=True):
        if f['color'] == c['holeColor'] or f['geom'].area < MIN_SLICE_PT2: continue
        if f['color'] not in big or f['geom'].area > big[f['color']]['geom'].area: big[f['color']] = f
    slices = []
    for col, f in big.items():
        A = G.arcs(f['d'])
        if not A: W.append(f'{cid}: {col} 조각에 원호가 없음'); continue
        outer = max(A, key=lambda a: a['r'])
        a0, a1 = _slice_span(outer['pts'], center)
        r = float(np.mean([math.hypot(x - center[0], y - center[1]) for x, y in outer['pts']]))
        name = legend.get(color_match(col, list(legend), c.get('namesDE', 0.0)) or '')
        if name is None: W.append(f'{cid}: 조각 색 {col} 이 {nf["layer"]} 범례에 없음')
        slices.append({'color': col, 'name': name, 'a0': a0, 'a1': a1, 'pct': 100 * (a1 - a0) / 360, 'r': r})
    slices.sort(key=lambda s: s['a0'])
    if not slices: raise ValueError(f'{cid}: 조각이 없음')
    toks = [t for t in AX.number_tokens(p, c['labelBox'], font=opt(c, ctx, 'numberFont'))
            if math.hypot(t['cx'] - center[0], t['cy'] - center[1]) > r_in]
    ang = [G.clock_angle((t['cx'], t['cy']), center) for t in toks]
    mid = [(s['a0'] + s['a1']) / 2 for s in slices]
    m = pair(list(range(len(toks))), list(range(len(slices))),
             lambda i, j: _ang_dist(ang[i], mid[j]) / OUT_ANG_SCALE + abs(toks[i]['value'] - slices[j]['pct']),
             lambda i, j: abs(toks[i]['value'] - slices[j]['pct']) <= c['maxDiff'], miss=lambda i: MISS)
    if len(m) != len(slices) or len(toks) != len(slices):
        W.append(f'{cid}: 조각 {len(slices)}·밖 수 {len(toks)}·짝 {len(m)} — 남은 수 {[toks[i]["text"] for i in range(len(toks)) if i not in m]}')
    val = {j: toks[i]['value'] for i, j in m.items()}
    nd = cap_from(toks)
    out['categories'] = [c.get('category', '')]
    out['series'], maxd, msum = [], 0.0, 0.0
    for j, s in enumerate(slices):
        v = val.get(j)
        msum += s['pct']
        if v is not None: maxd = max(maxd, abs(v - s['pct']))
        out['series'].append(series_entry(s['name'], [v], 'printed', measured=[rnd(s['pct'], nd)], precision=PRINTED_PREC, color=s['color']))
    rs = [s['r'] for s in slices]
    if max(rs) - min(rs) > RING_GAP_PT: W.append(f'{cid}: 조각 바깥 반지름이 서로 다름({min(rs):.2f}~{max(rs):.2f})')
    out['ring'] = round(r_in / float(np.mean(rs)), 3)
    hb = [center[0] - r_in, center[1] - r_in, center[0] + r_in, center[1] + r_in]
    out['center'] = cell_text(p, hb)   # 인쇄 그대로(40.795·13.800 — 천 단위 쉼표 자리에 마침표, issues.md)
    out['check'] = {'maxAbsDiff': round(maxd, 3), 'measuredSum': round(msum, 2), 'firstStartDeg': round(slices[0]['a0'], 2)}
    if maxd > c['warnDiff']: W.append(f'{cid}: 조각 각과 인쇄 비율 차 최대 {maxd:.2f}%p')
    if abs(msum - 100) > c['warnDiff']: W.append(f'{cid}: 조각 각 합 {msum:.2f}% ≠ 100 (겹치거나 빈 조각)')
    if abs(slices[0]['a0']) > opt(c, ctx, 'startTolDeg'): W.append(f'{cid}: 첫 조각이 12시에서 시작하지 않음({slices[0]["a0"]:.1f}°)')
    return out


def _render_rgb(p, box, dpi):
    """지면 상자를 dpi 로 렌더한 RGB 배열(작업 폴더 임시 PNG — 한글 경로에 쓰지 않음)."""
    from PIL import Image
    from atlas_common import WORK
    tmp = os.path.join(WORK, f'_pyr_{os.getpid()}.png')
    try:
        pdfkit.render_clip(p, box, dpi, tmp)
        with Image.open(tmp) as im: return np.asarray(im.convert('RGB'), dtype=float)
    finally:
        if os.path.exists(tmp): os.remove(tmp)


def _bar_run(mask_row, z, step, gap, start_tol):
    """가운데 열 z 에서 step(−1 왼쪽 / +1 오른쪽)으로 이어진 막대 화소의 마지막 열(틈 gap 화소까지 이어 봄). 없으면 None."""
    n = len(mask_row); x = z; last = None; miss = 0
    while 0 <= x < n:
        if mask_row[x]: last = x; miss = 0
        elif last is not None or abs(x - z) > start_tol:
            miss += 1
            if miss > gap: break
        x += step
    return last


def read_pyramid_raster(cid, c, ctx):
    """인구 피라미드 — 막대가 인라인 그림(벡터가 아님, 38쪽): plotBox 를 dpi 로 렌더 → 남·여 막대 색 화소(ΔE ≤ pixelDE) 가면 →
    나이 글자 줄마다(세로 가운데 ± rowHalfPt) 가운데 0 선에서 왼쪽·오른쪽으로 이어진 막대 끝 화소(가장자리 화소는 배경과 섞인 몫만큼) →
    가로축(눈금 글자 ↔ 세로 눈금선, 가운데 0 부호) 으로 %. 값은 measured, precision = 화소 하나의 % (u2 pyramid 출력 꼴 그대로 type 'pyramid')."""
    from atlas_common import lab
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'pyramid'
    if c.get('subtitleBox'): out['subtitle'] = text(p, c['subtitleBox'])
    xt = x_ticks(c)
    zero_tok = [t for t in AX.number_tokens(p, c['xAxisBox'], font=opt(c, ctx, 'numberFont')) if t['value'] == 0]
    if len(zero_tok) != 1: raise ValueError(f'{cid}: 가로축 0 글자가 하나가 아님')
    zero = AX.snap([zero_tok[0]['cx']], xt, opt(c, ctx, 'snapTol'))[0]
    xax, xtoks = axis(cid, c, ctx, c['xAxisBox'], 'x', name='가로', ticks=xt, signed_zero=zero, require_snap=c.get('xRequireSnap', False))
    box = c['plotBox']; dpi = c['dpi']
    img = _render_rgb(p, box, dpi)
    H, Wd = img.shape[:2]
    sx = (box[2] - box[0]) / Wd; sy = (box[3] - box[1]) / H
    L = lab(img.reshape(-1, 3)).reshape(H, Wd, 3)
    labels = sorted(label_lines(p, c['labelBox']), key=lambda q: -q['cy'])       # 아래(어린 나이)부터
    cats = [q['text'] for q in labels]
    if c.get('categories'):
        if [t.replace(' ', '') for t in cats] != [t.replace(' ', '') for t in c['categories']]:
            W.append(f'{cid}: 나이 {cats} ≠ 설정 {c["categories"]}')
        else: cats = list(c['categories'])
    legend = ' '.join(q['text'] for q in label_lines(p, c['legendBox']))
    zpx = int((zero - box[0]) / sx)
    gap = c.get('gapPx', 4); start_tol = c.get('startTolPx', 6)
    prec = sx * xax.units_per_pt; nd = AX.decimals_for(prec, cap_from(xtoks))
    out['categories'] = cats
    out['axes'] = {'x': xax.to_json(), 'zeroX': round(zero, 2)}
    out['series'], tot, inner = [], 0.0, 0.0
    for s, step in ((c['series'][0], -1), (c['series'][1], 1)):
        if s['name'] not in legend: W.append(f'{cid}: 범례에 「{s["name"]}」 없음')
        target = lab(np.array([[int(s['color'][k:k + 2], 16) for k in (1, 3, 5)]], dtype=float))[0]
        dist = np.sqrt(((L - target) ** 2).sum(axis=2))
        mask = dist <= c['pixelDE']
        vals = []
        for q in labels:
            y0 = int((q['cy'] - c['rowHalfPt'] - box[1]) / sy); y1 = int((q['cy'] + c['rowHalfPt'] - box[1]) / sy)
            ends = []
            for y in range(max(0, y0), min(H, y1 + 1)):
                e = _bar_run(mask[y], zpx, step, gap, start_tol)
                if e is None: continue
                # 가장자리 바깥 화소: 막대 색과 배경(두 칸 바깥) 사이 섞인 몫 → 화소 안 덮인 비율
                xo, xb = e + step, e + 2 * step
                frac = 0.0
                if 0 <= xb < Wd:
                    bg, px = img[y, xb], img[y, xo]; fg = img[y, e]
                    den = float(((fg - bg) ** 2).sum())
                    if den > 1e-6: frac = min(1.0, max(0.0, float(((px - bg) * (fg - bg)).sum()) / den))
                edge = box[0] + ((e - frac) * sx if step < 0 else (e + 1 + frac) * sx)
                ends.append(edge)
            if not ends:
                W.append(f'{cid} {s["name"]} {q["text"]}: 막대 화소 없음'); vals.append(None); continue
            vals.append(abs(xax.val(float(np.median(ends)))))
        tot += sum(v for v in vals if v is not None)
        out['series'].append(series_entry(s['name'], [rnd(v, nd) for v in vals], 'measured', precision=round(prec, 3), color=s['color']))
    out['check'] = {'sum': round(tot, 2), 'pixelPt': round(sx, 4), 'dpi': dpi}
    if abs(tot - 100) > c['sumTol']: W.append(f'{cid}: 피라미드 합 {tot:.1f}% (100 ± {c["sumTol"]})')
    return out


def read_bubble_row(cid, c, ctx):
    """원 크기 줄(39쪽 그레이트 그린 월 복원 녹지 11): 원 채움(color)마다 지름, 원 아래 이름 줄·값 줄 글자를 가운데 x 로 짝.
    값은 인쇄된 수(printed). 원 넓이 ∝ 값인지(지름 = 가장 큰 원 지름 · √(값/가장 큰 값))는 check 에 남기고, warnDiamPt 넘게 다르면 경고."""
    W = ctx['warnings']; p = c['page']
    out = meta(cid, c)
    out['type'] = 'bubbleRow'
    circ = sorted(G.fills(p, c['plotBox'], c['color'], de=opt(c, ctx, 'colorDE')), key=lambda f: cx(f['rect']))
    if not circ: raise ValueError(f'{cid}: 원({c["color"]})이 없음')
    centers = [cx(f['rect']) for f in circ]
    names = row_labels(p, c['labelBox'], centers)
    toks = AX.number_tokens(p, c['valueBox'], font=opt(c, ctx, 'numberFont'))
    m = pair(list(range(len(toks))), list(range(len(circ))), lambda i, j: abs(toks[i]['cx'] - centers[j]),
             lambda i, j: abs(toks[i]['cx'] - centers[j]) <= c.get('maxDxPt', 6.0), miss=lambda i: MISS)
    if len(m) != len(circ) or len(toks) != len(circ): W.append(f'{cid}: 원 {len(circ)}·수 {len(toks)}·짝 {len(m)}')
    vals = [None] * len(circ)
    for i, j in m.items(): vals[j] = toks[i]['value']
    if c.get('categories') and names != c['categories']: W.append(f'{cid}: 이름 {names} ≠ 설정 {c["categories"]}')
    diam = [((f['rect'][2] - f['rect'][0]) + (f['rect'][3] - f['rect'][1])) / 2 for f in circ]
    k = max(range(len(circ)), key=lambda j: vals[j] or 0)
    vmax, dmax = vals[k], diam[k]
    rows, worst = [], 0.0
    for j in range(len(circ)):
        if vals[j] is None: continue
        want = dmax * math.sqrt(vals[j] / vmax)
        rows.append({'name': names[j], 'diamPt': round(diam[j], 2), 'expectDiamPt': round(want, 2), 'measured': rnd(vmax * (diam[j] / dmax) ** 2, 2)})
        worst = max(worst, abs(diam[j] - want))
    out['categories'] = names
    out['series'] = [series_entry(c['seriesName'], vals, 'printed', color=c['color'])]
    out['check'] = {'maxDiamDiffPt': round(worst, 3), 'circles': rows}
    if worst > c['warnDiamPt']: W.append(f'{cid}: 원 지름이 √값 비와 최대 {worst:.2f}pt 다름')
    return out


READERS = {'climograph': read_climograph, 'line': read_line, 'bar': read_bar, 'stackedBar': read_stacked_bar,
           'stackedArea': read_stacked_area, 'pyramid': read_pyramid, 'radialBar': read_radial, 'pie': read_pie,
           'stackedPrinted': read_stacked_printed, 'table': read_table,
           'vbar': read_vbar, 'donut': read_donut, 'figure': read_figure,   # 2단계 유럽(U3-7): 세로·묶음 막대, 고리, 수치 그림
           'pyramidRaster': read_pyramid_raster, 'bubbleRow': read_bubble_row}  # 2단계 아프리카(U4-7): 그림 막대 피라미드, 원 크기 줄
