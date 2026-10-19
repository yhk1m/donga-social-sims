# © 2026 김용현
# scripts/atlas/charts_labels.py — 그래프 글자 다루기: 상자 글자(원문 그대로), 줄 묶기, 이름 ↔ 수 짝, 상자 거리.
#   text(pno, box)                       pdfkit.box_text (상자가 없으면 None)
#   strip_parens(s)                      '(억 명)' → '억 명'
#   label_lines(pno, box)                글자 조각을 줄로 묶어 [{text, cy, bbox}] (위→아래)
#   pair_name_number(pno, box, …)        이름(한글 조각) ↔ 수(낱말) 짝 → ([{name, value, text, bbox}], 짝 없는 수, 짝 없는 이름)
#   cx / cin / rect_dist                 상자 가운데·포함·점과 상자 거리
import math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
import charts_axes as AX
from atlas_common import yc
from assign import pair, BIG

HANGUL = re.compile(r'[가-힣]')
LINE_PT = 2.0            # 세로 가운데가 이만큼 안이면 한 줄
JOIN_EM = 0.15           # 같은 줄 조각 사이가 글자 크기의 이만큼 넘게 떨어져 있으면 공백
PAIR_MAX_PT = 4.0        # 이름과 수가 이만큼 넘게 떨어져 있으면 짝이 아니다
PAIR_MISS = 50.0         # 짝 없음 비용(헝가리안) — PAIR_MAX_PT 보다 충분히 크게


def text(pno, box):
    return pdfkit.box_text(pno, box) if box else None


def strip_parens(s):
    s = (s or '').strip()
    return s[1:-1].strip() if s.startswith('(') and s.endswith(')') else s


def cx(b): return (b[0] + b[2]) / 2
def cin(b, box): return box[0] <= cx(b) <= box[2] and box[1] <= yc(b) <= box[3]


def rect_dist(p, b):
    """점 p 와 상자 b 사이 거리(상자 안이면 0)."""
    dx = max(b[0] - p[0], 0, p[0] - b[2]); dy = max(b[1] - p[1], 0, p[1] - b[3])
    return math.hypot(dx, dy)


def label_lines(pno, box, join=' '):
    """영역 안 글자 조각(page_spans)을 줄(세로 가운데 LINE_PT 안)로 묶어 [{text, cy, bbox}] (위→아래)."""
    sp = sorted((s for s in pdfkit.page_spans(pno) if cin(s['bbox'], box)), key=lambda s: (yc(s['bbox']), s['bbox'][0]))
    lines = []
    for s in sp:
        if lines and abs(yc(s['bbox']) - lines[-1]['cy']) < LINE_PT: lines[-1]['parts'].append(s)
        else: lines.append({'cy': yc(s['bbox']), 'parts': [s]})
    out = []
    for L in lines:
        ps = sorted(L['parts'], key=lambda s: s['bbox'][0])
        t = ''
        for i, s in enumerate(ps):
            if i and s['bbox'][0] - ps[i - 1]['bbox'][2] > JOIN_EM * s['size']: t += join
            t += s['text']
        bb = [min(s['bbox'][0] for s in ps), min(s['bbox'][1] for s in ps), max(s['bbox'][2] for s in ps), max(s['bbox'][3] for s in ps)]
        out.append({'text': t, 'cy': L['cy'], 'bbox': bb})
    return out


def pair_name_number(pno, box, exclude_boxes, number_font):
    """영역 안 이름(한글 조각, '(' 로 시작하는 것 빼고) ↔ 수(낱말) 짝. 수는 이름 오른쪽 같은 줄이나 바로 아래.
    → ([{name, value, text(수 글자), bbox}], 짝 없는 수 낱말, 짝 없는 이름 글)"""
    ex = lambda b: any(cin(b, e) for e in exclude_boxes)
    names = [s for s in pdfkit.page_spans(pno) if cin(s['bbox'], box) and HANGUL.search(s['text']) and not ex(s['bbox'])
             and not s['text'].startswith('(')]
    nums = [t for t in AX.number_tokens(pno, box, font=number_font) if not ex(t['bbox'])]
    def cost(i, j):
        a, b = names[i]['bbox'], nums[j]['bbox']
        right = math.hypot(max(0, b[0] - a[2]) + max(0, a[0] - b[0]), yc(a) - yc(b)) if b[0] >= a[0] else BIG
        below = math.hypot(cx(a) - cx(b), max(0, b[1] - a[3])) if b[1] >= yc(a) else BIG
        return min(right, below)
    m = pair(list(range(len(names))), list(range(len(nums))), cost, lambda i, j: cost(i, j) < PAIR_MAX_PT, miss=lambda i: PAIR_MISS)
    out = []
    for i, j in m.items():
        a, b = names[i]['bbox'], nums[j]['bbox']
        out.append({'name': names[i]['text'], 'value': nums[j]['value'], 'text': nums[j]['text'],
                    'bbox': [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]})
    used = set(m.values())
    return out, [nums[j] for j in range(len(nums)) if j not in used], [names[i]['text'] for i in range(len(names)) if i not in m]
