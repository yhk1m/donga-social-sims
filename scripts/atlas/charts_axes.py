# © 2026 김용현
# scripts/atlas/charts_axes.py — 그래프 축: 숫자 글자 읽기(낱말 단위), 눈금 글자 ↔ 지면 위치 직선(또는 로그) 맞추기, 잰 값의 정밀도.
#   parse_num(s)                       '5,438'·'-10.0'·'50.5%' → 수, 아니면 None
#   words(pno, bbox)                   글자 묶음(texttrace)을 공백·빈칸·역방향에서 나눈 낱말 [{text, bbox, cx, cy, size, font, color}]
#   number_tokens(pno, bbox, …)        낱말 중 수만(value 추가) — '0 100 200' 처럼 한 묶음에 든 눈금 글자도 하나씩
#   fit_axis(pairs, scale) → Axis      (지면 위치, 값) 최소제곱 직선(scale 'log' 이면 log10 값). 순서가 오르내리거나 기울기 0·무한이면 ValueError
#   fit_axis_checked(pairs, tol, …)    잔차 문(gate): 눈금 3개 미만·잔차 초과 경고, 초과면 가장 어긋난 글자 하나 빼고 다시 맞춤, 로그 축 의심 알림
#   fit_scale(pairs)                   원점을 지나는 비례(눈금 없이 인쇄값 몇 개로 높이 ↔ 값)
#   snap(pos, ticks, tol)              글자 가운데를 가장 가까운 눈금선으로
#   signed_pairs(tokens, zero, key)    가운데 0 에서 양쪽으로 가는 축(인구 피라미드): 0 왼쪽 글자는 음수로
#   precision(ax, draw_pt)             잰 값의 어림 정밀도(값 단위, 로그 축은 비율)
#   decimals_for(prec, cap) / token_decimals(tokens)   출력 소수 자리: 정밀도의 한 자리 아래, 인쇄 자리 + 1 을 넘지 않음
import math, os, re, sys
from dataclasses import dataclass, field

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
import pdfkit
from atlas_common import color_match

_NUM = re.compile(r'^[-−–]?\d{1,3}(,\d{3})*(\.\d+)?%?$|^[-−–]?\d+(\.\d+)?%?$')
WORD_GAP_EM = 0.3        # 같은 묶음 안 글자 사이 빈칸이 글자 크기의 이만큼 넘으면 낱말을 나눈다(낱말 사이 공백 ≈ 0.22em + 자간)
BACK_EM = 0.5            # 다음 글자가 이만큼 뒤(왼쪽)로 가면 새 낱말(오른쪽→왼쪽 순으로 든 눈금 글자)
LINE_EM = 0.5            # 글자 위쪽이 이만큼 달라지면 줄이 바뀐 것
MIN_SLOPE = 1e-9         # 값/pt 기울기 절댓값이 이보다 작으면(또는 위치가 모두 같으면) 축으로 쓰지 않는다
MIN_TICKS = 3            # 눈금 글자가 이보다 적으면 잔차로 확인할 수 없어 경고
LOG_GAIN = 4.0           # 선형 잔차가 로그 잔차의 이 배보다 크면 「로그 축일 수 있음」


def parse_num(s):
    """인쇄된 수 글자 → float(정수면 int). 천 단위 쉼표, 유니코드 빼기(−·–), 끝 % 를 받는다. 수가 아니면 None."""
    s = (s or '').strip()
    if not s or not _NUM.match(s): return None
    t = s.rstrip('%').replace(',', '').replace('−', '-').replace('–', '-')
    v = float(t)
    return int(v) if '.' not in t and v == int(v) else v


def words(pno, bbox=None, gap_em=WORD_GAP_EM):
    """인쇄 쪽 → 낱말 목록. 글자 묶음(texttrace) 하나를 공백 글자, gap_em·크기보다 넓은 빈칸, 뒤로 가는 글자, 줄 바뀜에서 나눈다.
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
                gap = (b[0] - prev[2]) * dx + (b[1] - prev[3]) * dy if (dx, dy) != (1, 0) else b[0] - prev[2]
                if gap > gap_em * size or gap < -BACK_EM * size or abs(b[1] - prev[1]) > LINE_EM * size:
                    flush(); cur = None
            if cur is None: cur = {'text': '', 'bbox': list(b)}
            cur['text'] += ch
            cb = cur['bbox']; cur['bbox'] = [min(cb[0], b[0]), min(cb[1], b[1]), max(cb[2], b[2]), max(cb[3], b[3])]
            prev = b
        flush()
    return out


def number_tokens(pno, bbox=None, color=None, font=None, de=0.0):
    """bbox 안 낱말 중 수인 것(value 추가). color(hex 하나 또는 목록)가 있으면 그 색(ΔE ≤ de)만, font 가 있으면 글꼴 이름에 그 글이 든 것만."""
    cs = None if color is None else ([color] if isinstance(color, str) else list(color))
    out = []
    for w in words(pno, bbox):
        v = parse_num(w['text'])
        if v is None: continue
        if cs is not None and color_match(w['color'], cs, de) is None: continue
        if font and font not in w['font']: continue
        out.append({**w, 'value': v})
    return out


@dataclass
class Axis:
    a: float          # f(값) = a + b·위치, f = 값(선형) 또는 log10 값(로그)
    b: float
    resid: float      # 맞춘 직선과 눈금 글자 위치의 최대 차(pt)
    step: float       # 눈금 값 간격(중앙값, 로그 축은 log10 간격)
    n: int
    scale: str = 'linear'
    dropped: list = field(default_factory=list)   # 잔차 문에서 뺀 눈금 값

    def val(self, pos):
        f = self.a + self.b * pos
        return 10 ** f if self.scale == 'log' else f

    def pos(self, v):
        f = math.log10(v) if self.scale == 'log' else v
        return (f - self.a) / self.b

    @property
    def units_per_pt(self): return abs(self.b)

    def to_json(self):
        j = {'a': round(self.a, 6), 'b': round(self.b, 6), 'residPt': round(self.resid, 3), 'step': self.step, 'n': self.n}
        if self.scale != 'linear': j['scale'] = self.scale
        if self.dropped: j['dropped'] = self.dropped
        return j


def fit_axis(pairs, scale='linear'):
    """[(지면 위치, 값)] → Axis. 서로 다른 값이 둘 이상, 위치 순으로 값이 한쪽으로만 변하고, 기울기가 0·무한이 아니어야 한다(아니면 ValueError)."""
    pairs = [(float(p), float(v)) for p, v in pairs]
    if len({v for _, v in pairs}) < 2: raise ValueError(f'축 눈금 값이 둘 이상 있어야 함: {pairs}')
    if scale == 'log':
        if any(v <= 0 for _, v in pairs): raise ValueError(f'로그 축에 0 이하 값: {pairs}')
        pairs = [(p, math.log10(v)) for p, v in pairs]
    srt = sorted(pairs)
    d = [b[1] - a[1] for a, b in zip(srt, srt[1:])]
    same_pos = any(abs(b[0] - a[0]) < 1e-9 and b[1] != a[1] for a, b in zip(srt, srt[1:]))
    if same_pos or not (all(x > 0 for x in d) or all(x < 0 for x in d)):
        raise ValueError(f'축 눈금 순서가 오르내리거나 같은 자리에 다른 값: {srt}')
    P = np.array([p for p, _ in pairs]); V = np.array([v for _, v in pairs])
    b, a = np.polyfit(P, V, 1)
    if abs(b) < MIN_SLOPE: raise ValueError(f'축 기울기가 0: {pairs}')
    resid = float(np.max(np.abs(P - (V - a) / b)))
    vs = sorted(set(V.tolist()))
    return Axis(float(a), float(b), resid, float(np.median(np.diff(vs))), len(pairs), scale)


def fit_axis_checked(pairs, *, tol, warnings, name, scale='linear'):
    """잔차 문을 거친 축. 눈금 글자가 MIN_TICKS 보다 적으면 경고. 잔차가 tol(pt)을 넘으면 가장 어긋난 글자 하나를 빼고(MIN_TICKS 이상 남을 때)
    다시 맞추고, 그래도 넘으면 경고. 선형 축인데 로그로 맞추면 훨씬 잘 맞으면 「axisScale log」 를 알린다."""
    if len(pairs) < MIN_TICKS: warnings.append(f'{name}: 눈금 {len(pairs)}개 — 잔차로 확인할 수 없음')
    ax = fit_axis(pairs, scale)
    if ax.resid > tol and len(pairs) > MIN_TICKS:
        def r(i): return abs(pairs[i][0] - ax.pos(pairs[i][1]))
        worst = max(range(len(pairs)), key=r)
        ax2 = fit_axis(pairs[:worst] + pairs[worst + 1:], scale)
        ax2.dropped = [pairs[worst][1]]
        ax = ax2
    if ax.resid > tol:
        warnings.append(f'{name}: 축 잔차 {ax.resid:.2f}pt > 허용 {tol}pt')
        if scale == 'linear' and all(v > 0 for _, v in pairs):
            try: lg = fit_axis(pairs, 'log')
            except ValueError: lg = None
            if lg is not None and ax.resid > LOG_GAIN * lg.resid:
                warnings.append(f'{name}: 눈금 간격이 고르지 않음 — 로그 축일 수 있음(axisScale log 로 맞추면 잔차 {lg.resid:.2f}pt)')
    return ax


def fit_scale(pairs):
    """[(지면 길이, 값)] → 원점을 지나는 Axis(값 = b·길이). 눈금 없이 인쇄된 값 몇 개로 높이 ↔ 값을 맞출 때."""
    P = np.array([float(p) for p, _ in pairs]); V = np.array([float(v) for _, v in pairs])
    if len(P) < 1 or not np.any(P): raise ValueError(f'비례 맞추기에 쓸 값이 없음: {pairs}')
    b = float(P @ V / (P @ P))
    if abs(b) < MIN_SLOPE: raise ValueError(f'비례 기울기가 0: {pairs}')
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


ZERO_SIDE_PT = 0.5      # 가운데 0 에서 이만큼 넘게 작은 쪽 글자를 음수로


def signed_pairs(tokens, zero, key='cx'):
    """가운데 0 에서 양쪽으로 커지는 축의 눈금 글자 → (위치, 부호 붙인 값). zero 보다 작은 쪽 글자는 음수."""
    return [(t[key], -t['value'] if t[key] < zero - ZERO_SIDE_PT else t['value']) for t in tokens]


def precision(ax, draw_pt=0.1):
    """잰 값의 어림 정밀도: 축 잔차와 그리기 오차(draw_pt)를 더한 지면 거리 × 단위/pt. 로그 축은 비율(ln10·Δlog10)."""
    d = (ax.resid + draw_pt) * ax.units_per_pt
    return d * math.log(10) if ax.scale == 'log' else d


MAX_DECIMALS = 4


def decimals_for(prec, cap=None):
    """정밀도에 맞는 소수 자리(정밀도의 한 자리 아래까지). cap = 인쇄 자리 + 1 이 있으면 그보다 많이 쓰지 않는다."""
    d = max(0, min(MAX_DECIMALS, int(-math.floor(math.log10(prec))) + 1)) if prec and prec > 0 else 2
    return min(d, cap) if cap is not None else d


def token_decimals(tokens):
    """인쇄된 수 글자들의 소수 자리 최댓값."""
    return max((len(t['text'].rstrip('%').split('.')[1]) if '.' in t['text'] else 0 for t in tokens), default=0)
