# © 2026 김용현
# scripts/atlas/extract_tables.py — 그래프 숫자·부록 표(C4)
#   python -I scripts/atlas/extract_tables.py [--climate] [--charts] [--sheets]
#   (아무것도 안 주면 모두. 설정: config/u2.json 의 charts — climateTable(부록 표), items(그래프 id → 읽기 설정))
#
#   --climate  부록 「주요 도시의 기후」 표(97쪽) → $ATLAS_WORK/tables/climate-world.json
#              {도시: {country, zone, temp[12], prec[12], annualTemp, annualPrec, page}} (climate_table.py)
#   --charts   단원 쪽 그래프마다 숫자 → $ATLAS_WORK/tables/charts-u2.json
#              {id: {type, title, unit, source, categories, series:[{name, values, method, precision?, measured?}], page, bbox, …}}
#              인쇄된 숫자가 있으면 그것(printed), 없으면 도형을 잰 값(measured, precision = 어림 정밀도). 읽개는 charts_read.py.
#              기후 그래프는 97쪽 표 값(도시 이름으로 짝)을 쓰고, 그래프를 잰 값과의 최대 차를 check 에 남긴다.
#   --sheets   대조표 $ATLAS_WORK/shots/c4/charts-<쪽>.png — 교과서 그래프 | 뽑은 숫자로 다시 그린 그림 (chart_sheets.py)
# 검증(validate): 설정의 그래프·계열이 모두 있는지, 원·고리·100% 띠 합 = 100, 인쇄된 합계 = 칸 합, 해 축 늘어남, 잰 값의 정밀도.
# 경고가 하나라도 있으면 끝에 모두 찍고 종료 코드 1. 모르는 옵션은 종료 코드 2.
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from atlas_common import WORK, unit_config, UNIT_CONFIG
from climate_table import read_climate_table, check_climate_rows
from charts_read import READERS, text

OUT_DIR = os.path.join(WORK, 'tables')
CLIMATE_JSON = os.path.join(OUT_DIR, 'climate-world.json')
CHARTS_JSON = os.path.join(OUT_DIR, 'charts-u2.json')
CODE = [os.path.join(HERE, f) for f in ('extract_tables.py', 'charts_read.py', 'charts_axes.py', 'charts_geom.py',
                                         'climate_table.py', 'pdfkit.py', 'atlas_common.py', 'assign.py')]


def charts_config():
    return unit_config()['charts']


# ── 부록 기후 표 ─────────────────────────────────────────────────────────
_climate = {}
def climate_table(warnings=None):
    """97쪽 표 → {도시: 자료} (한 번만 읽는다). warnings 를 주면 표 경고를 거기에 더한다."""
    if 'rows' not in _climate:
        w = []
        cfg = charts_config()['climateTable']
        rows = read_climate_table(cfg, w)
        check_climate_rows(rows, cfg, w)
        _climate['rows'], _climate['warnings'] = rows, w
    if warnings is not None: warnings.extend(_climate['warnings'])
    return _climate['rows']


def climate_not_in_table():
    """97쪽 표에 없는 21쪽 도시 → 까닭(설정)."""
    return charts_config()['climateTable'].get('notInTable', {})


def p21_cities():
    """21쪽(기후 그래프) 도시 이름 — 그래프 제목 글자에서 읽는다."""
    return [text(c['page'], c['cityBox']) for c in charts_config()['items'].values() if c['type'] == 'climograph']


# ── 그래프 ───────────────────────────────────────────────────────────────
def extract_charts(warnings):
    cfg = charts_config()
    ctx = {'warnings': warnings, 'climate': climate_table(), 'notInTable': climate_not_in_table()}
    out = {}
    for cid, c in cfg['items'].items():
        try:
            out[cid] = READERS[c['type']](cid, c, ctx)
        except Exception as e:   # 읽개 하나가 죽어도 나머지는 읽고, 경고로 알린다(조용히 넘기지 않음)
            warnings.append(f'{cid}: 읽기 실패 — {type(e).__name__}: {e}')
    return out


def _num(v): return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate(charts, cfg):
    """→ 경고 목록. 설정과 맞는지, 합계·비율, 해 축, 정밀도."""
    W = []
    tol = cfg['sumTol']
    for cid, c in cfg['items'].items():
        if cid not in charts: W.append(f'{cid}: 뽑은 결과 없음'); continue
        ch = charts[cid]
        if not ch.get('categories'): W.append(f'{cid}: 항목(categories) 없음')
        n = len(ch.get('categories', []))
        names = [s['name'] for s in ch.get('series', [])]
        exp = c.get('series')
        if exp:
            want = [s['name'] if isinstance(s, dict) else s for s in exp]
            miss = [s for s in want if s not in names]
            if miss: W.append(f'{cid}: 설정 계열 없음 {miss}')
        if c.get('expectSeries') and len(names) != c['expectSeries']:
            W.append(f'{cid}: 계열 {len(names)}개 (설정 {c["expectSeries"]})')
        if c.get('categories') and isinstance(c['categories'], list) and ch.get('categories') != c['categories']:
            W.append(f'{cid}: 항목이 설정과 다름')
        allow_null = set(c.get('allowNull', []))
        for s in ch.get('series', []):
            if len(s['values']) != n: W.append(f'{cid} {s["name"]}: 값 {len(s["values"])}개 ≠ 항목 {n}개')
            if s['method'] == 'measured' and ch['type'] != 'table' and not _num(s.get('precision')):
                W.append(f'{cid} {s["name"]}: 잰 값에 정밀도 없음')
            nulls = [ch['categories'][j] for j, v in enumerate(s['values']) if v is None]
            if nulls and s['name'] not in allow_null and ch['type'] != 'stackedBar':
                W.append(f'{cid} {s["name"]}: 빈 값 {nulls}')
        if ch.get('categoryKind') == 'year':
            ys = ch['categories']
            if any(b <= a for a, b in zip(ys, ys[1:])): W.append(f'{cid}: 해 축이 늘어나지 않음')
        # 합 = 100
        if ch['type'] in ('pie', 'donut', 'radialBar') or (ch['type'] == 'stackedBar' and ch.get('total') == 100):
            for j, cat in enumerate(ch['categories']):
                vals = [s['values'][j] for s in ch['series'] if s['values'][j] is not None]
                if abs(sum(vals) - 100) > tol: W.append(f'{cid} {cat}: 합 {sum(vals):.2f} ≠ 100')
        # 인쇄된 합계 = 다른 그래프 값(카타르 외국인 국적 합 = 원그래프 외국인 비율)
        se = c.get('sumEquals')
        if se:
            other = charts.get(se['chart'])
            ref = next((s['values'][0] for s in other['series'] if s['name'] == se['series']), None) if other else None
            got = sum(s['values'][0] for s in ch['series'] if s['values'][0] is not None)
            if ref is None or abs(got - ref) > tol: W.append(f'{cid}: 칸 합 {got:.2f} ≠ {se["chart"]} {se["series"]} {ref}')
        # 쌓은 면: 인쇄된 합계 = 띠 합
        if ch['type'] == 'stackedArea':
            pr = max(s.get('precision', 0) for s in ch['series'])
            floor = c.get('totalsRounding') == 'floor'
            for y, d in ch['check']['totals'].items():
                ms, pv = d['measuredSum'], d['printed']
                ok = (pv - pr <= ms < pv + 1 + pr) if floor else abs(ms - pv) <= 0.5 + pr
                if not ok: W.append(f'{cid} {y}: 띠 합 {ms} 가 인쇄된 합계 {pv}({"버림" if floor else "반올림"})와 안 맞음')
            for yr, sh in ch['printed']['shares'].items():
                if abs(sum(sh.values()) - 100) > tol: W.append(f'{cid} {yr}: 인쇄된 몫 합 {sum(sh.values()):.1f} ≠ 100')
    for cid in charts:
        if cid not in cfg['items']: W.append(f'{cid}: 설정에 없는 그래프')
    return W


# ── 쓰기·낡은 산출물 ──────────────────────────────────────────────────────
def _write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'  {path} ({os.path.getsize(path):,} B)')


def stale(outputs, inputs):
    """산출물이 없거나 입력(설정·코드)보다 오래되면 True."""
    if not all(os.path.exists(o) for o in outputs): return True
    t = min(os.path.getmtime(o) for o in outputs)
    return any(os.path.exists(i) and os.path.getmtime(i) > t for i in inputs)


STEPS = ('climate', 'charts', 'sheets')


def parse_flags(argv):
    bad = [a for a in argv if not a.startswith('--') or a[2:] not in STEPS]
    if bad: raise ValueError(f'모르는 옵션: {" ".join(bad)} (쓸 수 있는 것: {" ".join("--" + s for s in STEPS)})')
    return {a[2:] for a in argv} or set(STEPS)


def main(argv):
    try: flags = parse_flags(argv)
    except ValueError as e:
        print(e, file=sys.stderr); return 2
    warnings = []
    if 'climate' in flags:
        rows = climate_table(warnings)
        print(f'97쪽 기후 표: 도시 {len(rows)}곳')
        _write(CLIMATE_JSON, rows)
    charts = None
    if 'charts' in flags or ('sheets' in flags and stale([CHARTS_JSON], CODE + [UNIT_CONFIG])):
        if 'climate' not in flags: climate_table(warnings)
        charts = extract_charts(warnings)
        warnings.extend(validate(charts, charts_config()))
        print(f'그래프 {len(charts)}개')
        _write(CHARTS_JSON, charts)
    if 'sheets' in flags:
        from chart_sheets import build_sheets
        if charts is None:
            with open(CHARTS_JSON, encoding='utf-8') as f: charts = json.load(f)
        build_sheets(charts, os.path.join(WORK, 'shots', 'c4'))
    if warnings:
        print(f'\n경고 {len(warnings)}개:')
        for w in warnings: print('  - ' + w)
        return 1
    print('경고 없음')
    return 0


if __name__ == '__main__':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
    sys.exit(main(sys.argv[1:]))
