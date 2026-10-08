# © 2026 김용현
# scripts/atlas/charts_axes.py — 그래프 축: 숫자 글자 읽기(낱말 단위), 눈금 글자 ↔ 지면 위치 직선 맞추기, 잰 값의 정밀도.
#   parse_num(s)                       '5,438'·'-10.0'·'50.5%' → 수, 아니면 None
#   words(pno, bbox)                   글자 묶음(texttrace)을 공백·빈칸으로 나눈 낱말 [{text, bbox, cx, cy, size, font, color}]
#   number_tokens(pno, bbox, …)        낱말 중 수만(value 추가) — '0 100 200' 처럼 한 묶음에 든 눈금 글자도 하나씩
#   fit_axis(pairs) → Axis             (지면 위치, 값) 쌍 최소제곱 직선. val(pos)·pos(val)·resid(pt)·step·units_per_pt
#   snap(pos, ticks, tol)              글자 가운데를 가장 가까운 눈금선으로
#   signed_pairs(tokens, zero)         가운데 0 에서 양쪽으로 가는 축(인구 피라미드): 0 왼쪽(위쪽) 글자는 음수로
#   precision(ax, draw_pt)             잰 값의 어림 정밀도 = (축 잔차 + 그리기 오차 pt) × 단위/pt
import os, re, sys
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
import pdfkit

_NUM = re.compile(r'^[-−–]?\d{1,3}(,\d{3})*(\.\d+)?%?$|^[-−–]?\d+(\.\d+)?%?$')


def parse_num(s):
    """인쇄된 수 글자 → float(정수면 int). 천 단위 쉼표, 유니코드 빼기(−·–), 끝 % 를 받는다. 수가 아니면 None."""
    s = (s or '').strip()
    if not s or not _NUM.match(s): return None
    t = s.rstrip('%').replace(',', '').replace('−', '-').replace('–', '-')
    v = float(t)
    return int(v) if '.' not in t and v == int(v) else v


def words(pno, bbox=None, gap_em=0.3):
    """인쇄 쪽 → 낱말 목록. 글자 묶음(texttrace) 하나를 공백 글자나 gap_em·크기보다 넓은 빈칸에서 나눈다.
    bbox 가 있으면 가운데가 그 안에 드는 낱말만. 낱말: {text, bbox, cx, cy, size, font, color}."""
    out = []
    for t in pdfkit.doc()[pno - 1].get_texttrace():
        if t['type'] == 3 or not t['chars']: continue
        latin = any(k in t['font'] for k in pdfkit.LATIN_FONTS)
        size = t['size']; dx, dy = t['dir']
        cur, prev = None, None
        def flush():
            if cur and cur['text']:
                b = cur['bbox']
                w = {'text': cur['text'], 'bbox': [round(v, 2) for v in b], 'cx': (b[0] + b[2]) / 2, 'cy': (b[1] + b[3]) / 2,
                     'size': round(size, 2), 'font': t['font'], 'color': pdfkit.hex_color(t.get('color'))}
                if bbox is None or (bbox[0] <= w['cx'] <= bbox[2] and bbox[1] <= w['cy'] <= bbox[3]): out.append(w)
        for u, gid, origin, b in t['chars']:
            ch = pdfkit._glyph_char(u, gid, latin)
            if ch == ' ':
                flush(); cur = None; prev = None; continue
            if prev is not None:
                pb = prev
                gap = (b[0] - pb[2]) * dx + (b[1] - pb[3]) * dy if (dx, dy) != (1, 0) else b[0] - pb[2]
                # 빈칸이 넓거나, 뒤로 가거나(한 묶음에 글자가 오른쪽→왼쪽 순으로 든 눈금 글자), 줄이 바뀌면 나눈다
                if gap > gap_em * size or gap < -0.5 * size or abs(b[1] - pb[1]) > 0.5 * size: flush(); cur = None
            if cur is None: cur = {'text': '', 'bbox': list(b)}
            cur['text'] += ch
            cb = cur['bbox']; cur['bbox'] = [min(cb[0], b[0]), min(cb[1], b[1]), max(cb[2], b[2]), max(cb[3], b[3])]
            prev = b
        flush()
    return out


def number_tokens(pno, bbox=None, color=None, font=None):
    """bbox 안 낱말 중 수인 것(value 추가). color 가 있으면 그 글자색만, font 가 있으면 글꼴 이름에 그 글이 든 것만."""
    out = []
    for w in words(pno, bbox):
        v = parse_num(w['text'])
        if v is None: continue
        if color and w['color'] != color: continue
        if font and font not in w['font']: continue
        out.append({**w, 'value': v})
    return out


@dataclass
class Axis:
    a: float          # 값 = a + b·위치
    b: float
    resid: float      # 맞춘 직선과 눈금 글자 위치의 최대 차(pt)
    step: float       # 눈금 값 간격(중앙값)
    n: int

    def val(self, pos): return self.a + self.b * pos
    def pos(self, v): return (v - self.a) / self.b

    @property
    def units_per_pt(self): return abs(self.b)

    def to_json(self):
        return {'a': round(self.a, 6), 'b': round(self.b, 6), 'residPt': round(self.resid, 3), 'step': self.step, 'n': self.n}


def fit_axis(pairs):
    """[(지면 위치, 값)] → Axis. 서로 다른 값이 둘 이상이어야 한다(아니면 ValueError)."""
    pairs = [(float(p), float(v)) for p, v in pairs]
    if len({v for _, v in pairs}) < 2: raise ValueError(f'축 눈금 값이 둘 이상 있어야 함: {pairs}')
    P = np.array([p for p, _ in pairs]); V = np.array([v for _, v in pairs])
    b, a = np.polyfit(P, V, 1)
    resid = float(np.max(np.abs(P - (V - a) / b)))
    vs = sorted(set(V.tolist()))
    step = float(np.median(np.diff(vs)))
    return Axis(float(a), float(b), resid, step, len(pairs))


def fit_scale(pairs):
    """[(지면 길이, 값)] → 원점을 지나는 Axis(값 = b·길이). 눈금 없이 인쇄된 값 몇 개로 높이 ↔ 값을 맞출 때."""
    P = np.array([float(p) for p, _ in pairs]); V = np.array([float(v) for _, v in pairs])
    if len(P) < 1 or not np.any(P): raise ValueError(f'비례 맞추기에 쓸 값이 없음: {pairs}')
    b = float(P @ V / (P @ P))
    resid = float(np.max(np.abs(P - V / b)))
    vs = sorted(set(V.tolist()))
    step = float(np.median(np.diff(vs))) if len(vs) > 1 else 0.0
    return Axis(0.0, b, resid, step, len(pairs))


def snap(pos, ticks, tol=1.0):
    """글자 위치 목록 → 가장 가까운 눈금선 위치(tol 안일 때만, 아니면 그대로)."""
    out = []
    for p in pos:
        t = min(ticks, key=lambda t: abs(t - p)) if ticks else None
        out.append(t if t is not None and abs(t - p) <= tol else p)
    return out


def signed_pairs(tokens, zero, key='cx'):
    """가운데 0 에서 양쪽으로 커지는 축의 눈금 글자 → (위치, 부호 붙인 값). zero 보다 작은 쪽 글자는 음수."""
    return [(t[key], -t['value'] if t[key] < zero - 0.5 else t['value']) for t in tokens]


def precision(ax, draw_pt=0.1):
    """잰 값의 어림 정밀도(값 단위): 축 잔차와 그리기 오차(draw_pt)를 더한 지면 거리 × 단위/pt."""
    return (ax.resid + draw_pt) * ax.units_per_pt
