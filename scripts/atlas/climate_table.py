# © 2026 김용현
# scripts/atlas/climate_table.py — 부록 「주요 도시의 기후」 표(설정 charts.climateTable.page)를 글자 위치로 격자를 되살려 읽는다.
#   read_climate_table(cfg, warnings) → {도시: {country, zone, temp[12], prec[12], annualTemp, annualPrec, page}}
# 표 하나(왼쪽·오른쪽 반쪽)마다:
#   열 = 머리줄의 흰 글자 '1'…'12'(월)과 '연평균' 의 가운데, 열 경계는 이웃 가운데의 중간
#   도시 = 첫 열(1월 경계 왼쪽)의 굵은 글자(page_spans), 나라 = 그 아래 '(…)' 글자, 기후대 = 표 가운데의 '…기후' 굵은 글자
#   수 = 낱말 단위 수 글자(charts_axes.words — 강조 칸(최저·최고)은 쪽 흐름 뒤쪽에 따로 있어 위치로만 모은다)
#   수 줄(y) 마다 가장 가까운 도시 줄: 도시 이름 줄에 가까우면 기온, 나라 줄에 가까우면 강수량(글자색 붉음/푸름으로 다시 확인)
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
import charts_axes as AX
from atlas_common import hex_rgb, yc as _cy

HEADER_ROW_PT = 2.0      # 머리줄 월 글자의 세로 가운데 허용 차
BODY_BELOW_PT = 5.0      # 머리줄보다 이만큼 아래부터 표 몸통
COUNTRY_BELOW_PT = 12.0  # 도시 이름 아래 이만큼 안의 '(…)' 가 나라
COUNTRY_LINE_PT = 8.8    # 나라 글자가 없을 때 강수 줄을 찾을 도시 줄 아래 거리(표 줄 간격)


def _columns(pno, box, hdr_color):
    """머리줄 흰 글자 → 열 가운데 13개(1~12월, 연평균)."""
    ws = [w for w in AX.words(pno, box) if w['color'] == hdr_color]
    months = sorted((w for w in ws if AX.parse_num(w['text']) in range(1, 13) and isinstance(AX.parse_num(w['text']), int)),
                    key=lambda w: w['cx'])
    hy = min((w['cy'] for w in months), default=None)
    months = [w for w in months if hy is not None and abs(w['cy'] - hy) < HEADER_ROW_PT]
    if [AX.parse_num(w['text']) for w in months] != list(range(1, 13)):
        raise ValueError(f'{pno}쪽 표 머리줄 월 글자를 못 찾음: {[w["text"] for w in months]}')
    # '1월' 의 가운데는 수 글자와 '월' 을 함께 본다(수 글자만이면 한 자리·두 자리 달 사이가 어긋남)
    centers = []
    for w in months:
        wol = min((x for x in ws if x['text'] == '월' and x['bbox'][0] >= w['bbox'][2] - 1), key=lambda x: x['bbox'][0] - w['bbox'][2])
        centers.append((w['bbox'][0] + wol['bbox'][2]) / 2)
    ann = [w for w in ws if w['text'] == '연평균']
    if not ann: raise ValueError(f'{pno}쪽 표 머리줄 연평균 글자를 못 찾음')
    centers.append(ann[0]['cx'])
    return centers, hy


def _col_of(cx, centers):
    bounds = [(a + b) / 2 for a, b in zip(centers[:-1], centers[1:])]
    lo = centers[0] - (centers[1] - centers[0]) / 2
    if cx < lo: return None
    for j, b in enumerate(bounds):
        if cx < b: return j
    return len(centers) - 1


def _reddish(hexc):
    r, g, b = hex_rgb(hexc)
    return r > b


def read_climate_table(cfg, warnings):
    """cfg = 설정 charts.climateTable. 반환: 도시(원문 그대로, 예 '런던(히스로)') → 자료."""
    pno = cfg['page']
    spans = pdfkit.page_spans(pno)
    rows = {}
    for box in cfg['tables']:
        centers, hy = _columns(pno, box, cfg['headerColor'])
        left = centers[0] - (centers[1] - centers[0]) / 2
        inbox = lambda b: box[0] <= (b[0] + b[2]) / 2 <= box[2] and box[1] <= _cy(b) <= box[3] and _cy(b) > hy + BODY_BELOW_PT
        cities = sorted((s for s in spans if inbox(s['bbox']) and (s['bbox'][0] + s['bbox'][2]) / 2 < left
                         and cfg['cityFont'] in s['font'] and not s['text'].startswith('(')), key=lambda s: _cy(s['bbox']))
        countries = [s for s in spans if inbox(s['bbox']) and (s['bbox'][0] + s['bbox'][2]) / 2 < left and s['text'].startswith('(')]
        zones = sorted((s for s in spans if inbox(s['bbox']) and (s['bbox'][0] + s['bbox'][2]) / 2 > left
                        and cfg['cityFont'] in s['font'] and s['text'].endswith('기후')), key=lambda s: _cy(s['bbox']))
        recs = []
        for c in cities:
            cy = _cy(c['bbox'])
            co = min((s for s in countries if 0 < _cy(s['bbox']) - cy < COUNTRY_BELOW_PT), key=lambda s: _cy(s['bbox']) - cy, default=None)
            z = [s for s in zones if _cy(s['bbox']) < cy]
            recs.append({'name': c['text'], 'y': cy, 'yc': _cy(co['bbox']) if co else cy + COUNTRY_LINE_PT,
                         'country': co['text'][1:-1] if co else None, 'zone': z[-1]['text'] if z else None,
                         'temp': [None] * 13, 'prec': [None] * 13})
            if co is None: warnings.append(f'{pno}쪽 표: {c["text"]} 의 나라 글자 없음')
            if not z: warnings.append(f'{pno}쪽 표: {c["text"]} 의 기후대 없음')
        nums = [w for w in AX.number_tokens(pno, box, font=cfg.get('numberFont', 'DIN')) if w['cy'] > hy + BODY_BELOW_PT]
        for w in nums:
            j = _col_of(w['cx'], centers)
            if j is None: continue
            best = min(((abs(w['cy'] - r['y']), 'temp', r) for r in recs), key=lambda t: t[0], default=None)
            bestc = min(((abs(w['cy'] - r['yc']), 'prec', r) for r in recs), key=lambda t: t[0], default=None)
            d, kind, r = min(best, bestc, key=lambda t: t[0])
            if d > cfg['rowTol']:
                warnings.append(f'{pno}쪽 표: 수 {w["text"]} ({w["cx"]:.0f},{w["cy"]:.0f}) 가 어느 도시 줄에도 안 붙음'); continue
            if (kind == 'temp') != _reddish(w['color']):
                warnings.append(f'{pno}쪽 표: {r["name"]} {j + 1}열 {w["text"]} 글자색 {w["color"]} 이 {kind} 줄과 안 맞음')
            if r[kind][j] is not None:
                warnings.append(f'{pno}쪽 표: {r["name"]} {kind} {j + 1}열에 수가 둘({r[kind][j]}, {w["value"]})')
            r[kind][j] = w['value']
        for r in recs:
            if r['name'] in rows: warnings.append(f'{pno}쪽 표: 도시 이름 겹침 {r["name"]}')
            for kind in ('temp', 'prec'):
                miss = [j + 1 for j, v in enumerate(r[kind]) if v is None]
                if miss: warnings.append(f'{pno}쪽 표: {r["name"]} {kind} 빈 칸 {miss}')
            rows[r['name']] = {'country': r['country'], 'zone': r['zone'], 'temp': r['temp'][:12], 'prec': r['prec'][:12],
                               'annualTemp': r['temp'][12], 'annualPrec': r['prec'][12], 'page': pno}
    return rows


def check_climate_rows(rows, cfg, warnings):
    """인쇄된 연 강수량 = 월 합, 연평균 기온 ≈ 월 평균(설정 허용치 안)."""
    for name, r in rows.items():
        if None in r['temp'] or None in r['prec'] or r['annualPrec'] is None or r['annualTemp'] is None: continue
        sp = sum(r['prec'])
        if abs(sp - r['annualPrec']) > cfg['precSumTol'] + cfg['precSumRel'] * r['annualPrec']:
            warnings.append(f'{r["page"]}쪽 표: {name} 연 강수량 {r["annualPrec"]} ≠ 월 합 {sp:.1f}')
        mt = sum(r['temp']) / 12
        if abs(mt - r['annualTemp']) > cfg['tempMeanTol']:
            warnings.append(f'{r["page"]}쪽 표: {name} 연평균 기온 {r["annualTemp"]} ≠ 월 평균 {mt:.2f}')
