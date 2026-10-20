# © 2026 김용현
# scripts/atlas/extract_tables.py — 그래프 숫자·부록 표(C4)
#   python -I scripts/atlas/extract_tables.py [--climate] [--charts] [--sheets] [--force]
#   (단계를 안 주면 모두. 설정: 단원 설정(env ATLAS_UNIT_CONFIG, 기본 config/u2.json)의 charts —
#    out(산출물 경로, 작업 폴더 기준), defaults(읽개 기본값), climateTable(부록 표), items(그래프 id → 읽기 설정))
#
#   --climate  부록 「주요 도시의 기후」 표 → out.climate  {도시: {country, zone, temp[12], prec[12], annualTemp, annualPrec, page}}
#   --charts   단원 쪽 그래프마다 숫자 → out.charts
#              {id: {type, title, unit, source, categories, series:[{name, values, method, precision?, measured?}], page, bbox, …}}
#              인쇄된 숫자가 있으면 그것(printed), 없으면 도형을 잰 값(measured, precision = 어림 정밀도). 읽개는 charts_read.py.
#              기후 그래프는 부록 표 값(도시 이름으로 짝)을 쓰고, 그래프를 잰 값과의 최대 차를 check 에 남긴다.
#   --sheets   대조표 out.sheets/charts-<쪽>.png — 교과서 그래프 | 뽑은 숫자로 다시 그린 그림 (chart_sheets.py)
#   --force    경고가 있어도 JSON 을 쓴다(기본은 경고가 있으면 JSON 을 쓰지 않는다 — 틀린 자료를 내보내지 않음)
# 검증(validate): 설정의 그래프·계열이 모두 있는지, 원·고리·100% 띠 합 = 100, 인쇄된 합계 = 칸 합, 해 축 늘어남, 잰 값의 정밀도.
# 경고가 하나라도 있으면 끝에 모두(중복 없이) 찍고 종료 코드 1. 모르는 옵션은 종료 코드 2. 쓰기는 임시 파일 → os.replace(원자적).
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from atlas_common import WORK, unit_config, UNIT_CONFIG, stamp_hash, stamp_path
from climate_table import read_climate_table, check_climate_rows
from charts_read import READERS
from charts_labels import text

CODE = [os.path.join(HERE, f) for f in ('extract_tables.py', 'charts_read.py', 'charts_labels.py', 'charts_axes.py', 'charts_geom.py',
                                         'climate_table.py', 'chart_sheets.py', 'pdfkit.py', 'atlas_common.py', 'assign.py')]
DEFAULTS = {'colorDE': 0.0, 'numberFont': 'DIN', 'axisResidTol': 0.6, 'axisScale': 'linear', 'maxGapPt': 0.5, 'snapTol': 1.5,
            'startTolDeg': 2.0, 'endTolPt': 0.6}


def charts_config():
    return unit_config()['charts']


def out_path(key):
    """산출물 경로(작업 폴더 기준 설정 charts.out[key])."""
    return os.path.join(WORK, charts_config()['out'][key])


def defaults():
    return {**DEFAULTS, **charts_config().get('defaults', {})}


# ── 부록 기후 표 ─────────────────────────────────────────────────────────
_climate = {}
def climate_table(warnings=None):
    """부록 기후 표 → {도시: 자료} (한 번만 읽는다). warnings 를 주면 표 경고를 거기에 더한다."""
    if 'rows' not in _climate:
        w = []
        cfg = charts_config()['climateTable']
        rows = read_climate_table(cfg, w)
        check_climate_rows(rows, cfg, w)
        _climate['rows'], _climate['warnings'] = rows, w
    if warnings is not None: warnings.extend(_climate['warnings'])
    return _climate['rows']


def climate_not_in_table():
    """부록 표에 없는 기후 그래프 도시 → 까닭(설정)."""
    return charts_config()['climateTable'].get('notInTable', {})


def climograph_cities():
    """기후 그래프 도시 이름 — 그래프 제목 글자에서 읽는다(설정 순서)."""
    return [text(c['page'], c['cityBox']) for c in charts_config()['items'].values() if c['type'] == 'climograph']


p21_cities = climograph_cities   # 계획 C4 테스트가 부르는 이름


def _decimals(rows):
    return max((len(repr(float(v)).split('.')[1].rstrip('0')) for r in rows.values() for v in r['temp'] + r['prec'] if v is not None),
               default=0)


# ── 그래프 ───────────────────────────────────────────────────────────────
def extract_charts(warnings):
    cfg = charts_config()
    rows = climate_table()
    ctx = {'warnings': warnings, 'climate': rows, 'climatePage': cfg['climateTable']['page'], 'climateDecimals': _decimals(rows),
           'notInTable': climate_not_in_table(), 'defaults': defaults(), 'climateAliases': cfg['climateTable'].get('aliases', {})}
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
            miss = [s for s in (x['name'] if isinstance(x, dict) else x for x in exp) if s not in names]
            if miss: W.append(f'{cid}: 설정 계열 없음 {miss}')
        if c.get('expectSeries') and len(names) != c['expectSeries']:
            W.append(f'{cid}: 계열 {len(names)}개 (설정 {c["expectSeries"]})')
        if isinstance(c.get('categories'), list) and ch.get('categories') != c['categories']:
            W.append(f'{cid}: 항목이 설정과 다름')
        allow_null = set(c.get('allowNull', []))
        for s in ch.get('series', []):
            if len(s['values']) != n: W.append(f'{cid} {s["name"]}: 값 {len(s["values"])}개 ≠ 항목 {n}개')
            if s['method'] == 'measured' and ch['type'] != 'table' and not _num(s.get('precision')):
                W.append(f'{cid} {s["name"]}: 잰 값에 정밀도 없음')
            nulls = [ch['categories'][j] for j, v in enumerate(s['values']) if v is None and j < n]
            if nulls and s['name'] not in allow_null and ch['type'] != 'stackedBar':   # 띠그래프는 막대마다 나라가 달라 빈 칸이 정상
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
        # 쌓은 면: 인쇄된 합계 = 띠 합(버림이면 인쇄값 ≤ 합 < 인쇄값 + 1)
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
def write_json(path, obj):
    """임시 파일에 쓴 뒤 os.replace 로 바꾼다(쓰다 죽어도 반쪽 파일이 남지 않음)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write('\n')
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.remove(tmp)
    print(f'  {path} ({os.path.getsize(path):,} B)')


def stale(outputs, inputs):
    """산출물이 없거나 입력(설정·코드)보다 오래되면 True."""
    if not all(os.path.exists(o) for o in outputs): return True
    t = min(os.path.getmtime(o) for o in outputs)
    return any(os.path.exists(i) and os.path.getmtime(i) > t for i in inputs)


STEPS = ('climate', 'charts', 'sheets')


def parse_flags(argv):
    """['--charts', '--force', …] → (단계 집합(비면 모두), force). 모르는 옵션은 ValueError."""
    force = '--force' in argv
    rest = [a for a in argv if a != '--force']
    bad = [a for a in rest if not a.startswith('--') or a[2:] not in STEPS]
    if bad: raise ValueError(f'모르는 옵션: {" ".join(bad)} (쓸 수 있는 것: {" ".join("--" + s for s in STEPS)} --force)')
    return ({a[2:] for a in rest} or set(STEPS)), force


def _dedup(ws):
    seen, out = set(), []
    for w in ws:
        if w not in seen: seen.add(w); out.append(w)
    return out


def main(argv):
    try: flags, force = parse_flags(argv)
    except ValueError as e:
        print(e, file=sys.stderr); return 2
    warnings, writes = [], []
    if 'climate' in flags:
        rows = climate_table(warnings)
        print(f'부록 기후 표: 도시 {len(rows)}곳')
        writes.append((out_path('climate'), rows))
    charts = None
    sheets_dir = out_path('sheets')
    sheet_files = [os.path.join(sheets_dir, f'charts-{p}.png') for p in sorted({c['page'] for c in charts_config()['items'].values()})]
    need_charts = 'charts' in flags or ('sheets' in flags and stale([out_path('charts')], CODE + [UNIT_CONFIG]))
    if need_charts:
        if 'climate' not in flags: climate_table(warnings)
        charts = extract_charts(warnings)
        warnings.extend(validate(charts, charts_config()))
        print(f'그래프 {len(charts)}개')
        writes.append((out_path('charts'), charts))
    warnings = _dedup(warnings)
    if warnings and not force:
        print(f'경고가 있어 JSON 을 쓰지 않음(--force 로 강제): {", ".join(p for p, _ in writes) or "-"}')
    else:
        for path, obj in writes: write_json(path, obj)
        if any(p == out_path('charts') for p, _ in writes):   # 그래프 JSON 도장(build_content.mjs 가 코드·설정·결과 해시로 확인)
            write_json(stamp_path(unit_config()['content']['stamps']['charts']['stamp']), {'inputsHash': stamp_hash('charts')})
    if 'sheets' in flags:
        from chart_sheets import build_sheets
        if charts is None:
            with open(out_path('charts'), encoding='utf-8') as f: charts = json.load(f)
        if stale(sheet_files, [out_path('charts'), os.path.join(HERE, 'chart_sheets.py'), UNIT_CONFIG]) or need_charts:
            build_sheets(charts, sheets_dir)
        else:
            print(f'  대조표가 최신(뽑은 결과·chart_sheets.py·설정보다 새것): {sheets_dir}')
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
