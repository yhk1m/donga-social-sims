# © 2026 김용현
# scripts/atlas/legend.py — 범례 읽기: 견본(작은 채움 도형) + 오른쪽 글자 → 분류 목록, 빗금 견본, 흐름선 굵기 견본
import re
import numpy as np
from atlas_common import drawings, spans, yc, hexc, inside

ROW_TOL_PT = 2.5        # 견본과 글자의 세로 중심 차 허용
LABEL_GAP_PT = 4.0      # 견본 바로 옆 글자부터 이 간격 안으로 이어지는 글자만 이름(멀리 있는 제목 제외)
COLUMN_ROUND_PT = 20    # 열 순서 정렬 단위(같은 열이면 x 가 이 안)
ROW_ROUND_PT = 4        # 줄 순서 정렬 단위
HATCH_LABEL_SPAN_PT = 40


def legend(m, cfg, max_area=None):
    """범례 견본 + 이름 → [{cls,color,label,kind,box}]. 순서는 교과서 읽는 순서(cfg.legendOrder: 'columns'|'rows')."""
    L = m.get('legendBbox')
    if not L: return []
    a0, a1 = cfg['legendSwatchArea']
    if max_area is not None: a1 = max_area
    skip = set(cfg.get('legendSkip', ())) | set(cfg['nonLegendFills'])
    grat = re.compile(cfg['gratTextRe'])
    sw = []
    for d in drawings(m['page']):
        r = d['rect']
        if not inside(r, L): continue
        fill = hexc(d.get('fill'))
        if fill and fill not in skip and a0 <= r.width * r.height <= a1:
            sw.append({'color': fill, 'kind': 'fill', 'box': [r.x0, r.y0, r.x1, r.y1]})
    seen, uniq = set(), []
    for s in sw:
        if s['color'] in seen: continue
        seen.add(s['color']); uniq.append(s)
    texts = [s for s in spans(m['page']) if L[0] - 2 <= s['bbox'][0] <= L[2] + 2 and L[1] - 2 <= yc(s['bbox']) <= L[3] + 2]
    for s in uniq:
        b = s['box']; y = yc(b)
        right = [o['box'][0] for o in uniq if o['box'][0] > b[2] + 1]   # 다음 열 견본 시작 = 이 열 글자의 끝
        stop = min(right) if right else 1e9
        cand = sorted((t for t in texts if abs(yc(t['bbox']) - y) < ROW_TOL_PT and b[2] - 0.5 <= t['bbox'][0] < stop
                       and not grat.fullmatch(t['text'])), key=lambda t: t['bbox'][0])
        s['label'] = cfg.get('legendJoin', ' ').join(t['text'] for t in _chain(cand, b[2])).strip()   # legendJoin '' = 크기가 다른 조각 붙여 쓰기(「5」+「만 이상」)
    if cfg.get('legendOrder') == 'rows': uniq.sort(key=lambda s: (round(s['box'][1] / ROW_ROUND_PT), s['box'][0]))
    else: uniq.sort(key=lambda s: (round(s['box'][0] / COLUMN_ROUND_PT), s['box'][1]))
    for i, s in enumerate(uniq): s['cls'] = f'c{i + 1}'
    return uniq


def manual_legend(items):
    """설정 legendItems [{color, label}](U4-4) → 범례 목록(차례대로 c1…). 범례 견본을 PDF 에서 읽을 수 없을 때:
    38쪽 자원 지도(범례 상자 없이 생산국마다 다른 색 + 지도 위 나라 이름), 38쪽 태양광 지도(범례까지 모두 그림 조각 — 견본색은 렌더 화소)."""
    out = []
    for i, e in enumerate(items):
        if not e.get('color') or not e.get('label'): raise ValueError(f'legendItems {i}: color·label 이 다 있어야 함')
        out.append({'cls': f'c{i + 1}', 'color': e['color'].lower(), 'label': e['label'], 'kind': 'fill'})
    return out


def _chain(cand, x_start):
    chain = []
    for t in cand:
        end = chain[-1]['bbox'][2] if chain else x_start
        if t['bbox'][0] - end > LABEL_GAP_PT: break
        chain.append(t)
    return chain


def hatch_legend(m, hcfg, pattern='hatch'):
    """빗금 견본(채움이 무늬라 get_drawings 에 안 잡힘 → 설정의 견본 상자) + 오른쪽 글자. 점무늬(U4-3b)는 pattern 'dots' 로 같은 길."""
    b = hcfg['swatch']; y = yc(b)
    cand = sorted((t for t in spans(m['page']) if abs(yc(t['bbox']) - y) < ROW_TOL_PT and b[2] - 0.5 <= t['bbox'][0] < b[2] + HATCH_LABEL_SPAN_PT),
                  key=lambda t: t['bbox'][0])
    return {'color': hcfg['color'], 'kind': 'fill', 'pattern': pattern, 'box': b, 'label': ' '.join(t['text'] for t in _chain(cand, b[2]))}


def flow_legend(m, color):
    """흐름선 범례: 같은 색 짧은 선들(왼→오른쪽)의 굵기와 그 아래 글자 → [(굵기 pt, 이름)]. 단위는 범례 제목 괄호."""
    L = m['legendBbox']
    segs = sorted(((d['rect'], round(d.get('width') or 0, 2)) for d in drawings(m['page'])
                   if d['type'] == 's' and hexc(d.get('color')) == color and inside(d['rect'], L) and d['rect'].height < 1),
                  key=lambda t: t[0].x0)
    if not segs: raise ValueError(f'{m["id"]}: 흐름선 범례 견본(색 {color})이 없음')
    y = segs[0][0].y1
    texts = [t for t in spans(m['page']) if L[0] - 2 <= t['bbox'][0] <= L[2] + 2 and 0 < t['bbox'][1] - y < 10]
    out = []
    for r, w in segs:
        under = sorted((t for t in texts if r.x0 - 2 <= (t['bbox'][0] + t['bbox'][2]) / 2 <= r.x1 + 4), key=lambda t: t['bbox'][0])
        # 다음 견본 쪽으로 넘친 글자('10' + '이상')도 이어 붙인다
        out.append((w, ' '.join(t['text'] for t in under).strip()))
    if any(not lab for _, lab in out): raise ValueError(f'{m["id"]}: 흐름선 범례 이름을 못 읽음 {out}')
    return out


def legend_unit(m, pattern):
    """범례 제목 괄호 안 단위(예: '백억 달러, 2022'). 못 찾으면 None."""
    rx = re.compile(pattern)
    L = m['legendBbox']
    for t in spans(m['page']):
        if L[0] - 2 <= t['bbox'][0] <= L[2] + 2 and L[1] - 2 <= yc(t['bbox']) <= L[3] + 2:
            mt = rx.search(t['text'])
            if mt: return re.sub(r',\s*', ', ', mt.group(1))
    return None
