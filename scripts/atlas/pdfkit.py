# © 2026 김용현
# scripts/atlas/pdfkit.py
"""사회과부도 PDF 공통 모듈: PDF 열기, 깨진 글자 복원(dec), 쪽 글자 조각, 조각 병합, 영역 렌더링.

글자 복원 원리
  이 PDF의 한글 글꼴(YDVY… 등)은 Adobe-Korea1 CID 글꼴인데 ToUnicode 표가 글자마다 있거나 없다.
  표가 없는 글자는 PyMuPDF 가 CID 번호를 그대로 글자 코드로 돌려준다(예: CID 104 → 'h').
  Adobe-Korea1 순서: CID 1–95 = ASCII 0x20–0x7E, 101–1085 = KS X 1001 기호 1–12행,
  1086–3435 = 완성형 한글 2350자, 3436–8323 = 한자 4888자.
  page_spans 는 get_texttrace() 로 글자마다 (유니코드, CID)를 함께 받아, 유니코드가 없을 때만
  CID 표로 푼다. 그래서 같은 글꼴 안에 섞인 진짜 글자('(K2)', '(%)', '°')도 그대로 남는다.
"""
import copy, os
import fitz

_DEFAULT_PDF = os.path.join(os.path.dirname(__file__), '..', '..', '..', '22개정_중학_사회과 부도_교과서_본문.pdf')
LATIN_FONTS = ('DIN', 'Garamond', 'Helvetica', 'Myriad', 'Minion', 'Times', 'Arial')


def pdf_path():
    """PDF 경로. 환경 변수 ATLAS_PDF 가 있으면 그것을 쓴다."""
    return os.path.abspath(os.environ.get('ATLAS_PDF') or _DEFAULT_PDF)


_docs = {}
def doc():
    """열린 fitz.Document (경로별로 한 번만 연다). PDF 가 없으면 FileNotFoundError."""
    p = pdf_path()
    if p not in _docs:
        if not os.path.exists(p):
            raise FileNotFoundError(f'사회과부도 PDF 를 찾을 수 없음: {p} (환경 변수 ATLAS_PDF 로 경로 지정 가능)')
        _docs[p] = fitz.open(p)
    return _docs[p]


# ── Adobe-Korea1 CID → 글자 표 ────────────────────────────────────────────
def _ksx_rows(rows, skip=()):
    out = []
    for a in rows:
        for b in range(0xA1, 0xFF):
            if (a, b) in skip: continue
            try: out.append(bytes([a, b]).decode('euc_kr'))
            except UnicodeDecodeError: pass
    return out

# 기호: KS X 1001:1992 1–12행(985자). euc_kr 코덱에는 뒤에 추가된 €(A2E6)·®(A2E7)이 있어 뺀다.
_SYMBOLS = _ksx_rows(range(0xA1, 0xAD), skip={(0xA2, 0xE6), (0xA2, 0xE7)})
H = _ksx_rows(range(0xB0, 0xC9))          # 완성형 한글 2350자
_HANJA = _ksx_rows(range(0xCA, 0xFE))      # 한자 4888자
assert len(_SYMBOLS) == 985 and len(H) == 2350 and len(_HANJA) == 4888
CID = [None] + [chr(c) for c in range(0x20, 0x7F)] + [None] * 5 + _SYMBOLS + H + _HANJA
assert CID[1086] == '가' and CID[104] == '·'
HIDX = {ch: i for i, ch in enumerate(H)}


def cid_char(cid):
    """Adobe-Korea1 CID 하나 → 글자. 모르는 번호는 '?'."""
    ch = CID[cid] if 0 <= cid < len(CID) else None
    return ch if ch is not None else '?'


def dec(s):
    """CID 번호가 글자 코드로 들어온 문자열(get_text 의 날 글자)을 푼다.
    U+0020 은 PyMuPDF 가 간격으로 넣은 공백으로 보고 그대로 둔다. 표 범위(8324) 밖 코드는 진짜 유니코드로 보고 둔다.
    한계: 같은 문자열에 진짜 ASCII·라틴 글자가 섞여 있으면 구별할 수 없다 → 쪽 글자는 page_spans 를 쓸 것."""
    return ''.join(ch if ch == ' ' or ord(ch) >= len(CID) else cid_char(ord(ch)) for ch in s)


def enc(s):
    """한글 → CID 문자열(dec 의 역, 테스트·디버깅용)."""
    return ''.join(chr(1086 + HIDX[ch]) if ch in HIDX else ch for ch in s)


def _glyph_char(u, gid, latin):
    if latin: return chr(u) if u not in (0, 0xFFFD) else '?'
    if u in (0, 0xFFFD) or u == gid: return cid_char(gid)  # ToUnicode 없음 → CID 로 풀기
    return chr(u)


def hex_color(c):
    """PDF 색(0–1 실수, 회색 1개·RGB 3개·CMYK 4개) → '#rrggbb', 색 없음(None·빈 값) → None. 아틀라스 단계의 하나뿐인 색 바꾸개."""
    c = tuple(c or ())
    if len(c) == 1: c = c * 3
    elif len(c) == 4: c = tuple((1 - v) * (1 - c[3]) for v in c[:3])
    elif len(c) != 3: return None
    return '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c)


def page_spans(pno, space_em=0.25, break_em=1.0):
    """인쇄 쪽 번호 → [{text,size,font,color,bbox,dir}] (글자별 복원 적용). 순서는 쪽 내용 흐름(content stream) 순서.
    한 글자 묶음(texttrace) 안에서 글자 사이 빈칸이 space_em·크기보다 넓으면 공백을 넣고,
    break_em·크기보다 넓거나 줄이 바뀌면 조각을 나눈다. 보이지 않는 글자(type 3)는 뺀다."""
    out = []
    for t in doc()[pno - 1].get_texttrace():
        if t['type'] == 3 or not t['chars']: continue
        size = t['size']; latin = any(k in t['font'] for k in LATIN_FONTS)
        dx, dy = t['dir']
        cur = None
        prev = None
        def flush():
            if cur and cur['text'].strip():
                cur['text'] = cur['text'].strip()
                cur['bbox'] = [round(v, 1) for v in cur['bbox']]
                out.append(cur)
        for u, gid, origin, bbox in t['chars']:
            ch = _glyph_char(u, gid, latin)
            if prev is not None:
                (px, py), pb = prev
                vx, vy = origin[0] - px, origin[1] - py
                along = vx * dx + vy * dy
                perp = abs(-vx * dy + vy * dx)
                adv = max((x - px) * dx + (y - py) * dy for x in (pb[0], pb[2]) for y in (pb[1], pb[3]))
                gap = along - adv
                if perp > 0.5 * size or gap < -0.5 * size or gap > break_em * size:
                    flush(); cur = None
                elif gap > space_em * size and not cur['text'].endswith(' ') and ch != ' ':
                    cur['text'] += ' '
            if cur is None:
                cur = {'text': '', 'size': round(size, 1), 'font': t['font'], 'color': hex_color(t.get('color')), 'bbox': list(bbox),
                       'dir': [round(dx, 3), round(dy, 3)]}
            if not (ch == ' ' and cur['text'].endswith(' ')): cur['text'] += ch
            b = cur['bbox']; cur['bbox'] = [min(b[0], bbox[0]), min(b[1], bbox[1]), max(b[2], bbox[2]), max(b[3], bbox[3])]
            prev = (origin, bbox)
        flush()
    return out


def text_runs(pno, bbox=None):
    """인쇄 쪽 번호 → [{text,font,size,color,bbox,line0,line1}]: 글자 묶음(texttrace) 하나 = 한 항목, 쪽 흐름 순서.
    page_spans 와 달리 줄바꿈으로 나누지 않고 원문 공백(앞뒤 공백 포함)을 그대로 둔다 — 본문·설명글을 원문대로 읽을 때 쓴다.
    bbox 가 있으면 가운데가 그 안에 드는 글자만 남긴다. line0/line1 = 첫·끝 글자 기준선 (x, y)."""
    out = []
    for t in doc()[pno - 1].get_texttrace():
        if t['type'] == 3 or not t['chars']: continue
        latin = any(k in t['font'] for k in LATIN_FONTS)
        chars = [c for c in t['chars'] if bbox is None or
                 (bbox[0] <= (c[3][0] + c[3][2]) / 2 <= bbox[2] and bbox[1] <= (c[3][1] + c[3][3]) / 2 <= bbox[3])]
        if not chars: continue
        left, right = min(c[3][0] for c in chars), max(c[3][2] for c in chars)
        text = ''
        for i, (u, gid, o, b) in enumerate(chars):
            ch = _glyph_char(u, gid, latin)
            if i:
                pu, pg, po, pb = chars[i - 1]
                # 묶음 안 줄바꿈: 양끝 맞춤 문단의 줄바꿈(앞 줄이 오른쪽 끝까지, 새 줄이 왼쪽 끝에서)이 아니면
                # 가운데 정렬 꼬리표 등의 강제 줄바꿈이라 공백으로 본다
                if (abs(o[1] - po[1]) > 0.5 * t['size'] and ch != ' ' and not text.endswith(' ')
                        and not _wrapped(pb[2], b[0], left, right, t['size'])): text += ' '
            text += ch
        if not text.strip(): continue
        bx = [min(c[3][0] for c in chars), min(c[3][1] for c in chars), max(c[3][2] for c in chars), max(c[3][3] for c in chars)]
        out.append({'text': text, 'font': t['font'], 'size': round(t['size'], 1), 'color': hex_color(t.get('color')),
                    'bbox': [round(v, 1) for v in bx], 'line0': tuple(chars[0][2]), 'line1': tuple(chars[-1][2]),
                    'adv1': chars[-1][3][2], 'x0first': chars[0][3][0]})
    return out


def _wrapped(prev_right, next_left, left, right, size):
    """양끝 맞춤 문단의 줄바꿈인가: 앞 줄 끝이 글 오른쪽 끝 0.5em 안, 새 줄 시작이 왼쪽 끝 0.3em 안."""
    return prev_right >= right - 0.5 * size and next_left <= left + 0.3 * size


def box_text(pno, bbox):
    """영역 안 글자를 원문대로 한 줄 문자열로 잇는다(text_runs 순서). 묶음 사이는:
    한쪽 끝에 공백이 있으면 그대로(원문 공백), 같은 줄에서 0.15em 안으로 붙어 있으면 붙임(낱말 사이 공백 폭은 약 0.22em 이상),
    줄이 바뀌었는데 양끝 맞춤 줄바꿈(_wrapped)이면 붙임(낱말 가운데서도 줄이 바뀐다),
    그 밖(다른 글상자·짧은 줄)은 공백 하나. 연속 공백은 하나로, 앞뒤 공백은 지운다. 글자가 없으면 ''."""
    runs = text_runs(pno, bbox)
    left = min((r['bbox'][0] for r in runs), default=0)
    right = max((r['bbox'][2] for r in runs), default=0)
    s, prev = '', None
    for r in runs:
        t = r['text']
        if prev is not None and s and not s.endswith(' ') and not t.startswith(' '):
            same_line = abs(r['line0'][1] - prev['line1'][1]) < 0.3 * r['size']
            if same_line: glue = r['x0first'] - prev['adv1'] < 0.15 * r['size']
            else: glue = _wrapped(prev['adv1'], r['x0first'], left, right, r['size'])
            if not glue: s += ' '
        s += t
        prev = r
    return ' '.join(s.split())


def _is_hangul(ch):
    return '가' <= ch <= '힣' or 'ㄱ' <= ch <= 'ㆎ'


def merge_spans(spans, gap_em=0.6, overlap_em=0.3, line_em=0.4, space_em=0.2):
    """같은 줄·같은 크기의 조각을 이어 한 지명으로 합친다(자간 벌린 글자·겹친 조각 포함). 입력은 바꾸지 않는다.
    - 줄: 크기 차 < 0.2pt 이고 세로 중심 차 < line_em·크기 인 조각끼리 한 줄.
    - 이음: 줄 안에서 x0 순으로, 앞 조각 끝과 다음 조각 시작의 간격 dx 가
      -overlap_em·크기 ≤ dx ≤ gap_em·크기 이면 잇는다(gap_em 은 글자 크기에 대한 비율).
    - 공백: 이음 자리 양쪽이 한글이 아니고 dx > space_em·크기 이면 공백을 넣는다("New"+"Delhi"). 한글은 붙여 쓴다.
    결과는 줄(위→아래), 줄 안 x 순."""
    yc = lambda s: (s['bbox'][1] + s['bbox'][3]) / 2
    lines = []
    for s in sorted((copy.deepcopy(s) for s in spans), key=lambda s: (yc(s), s['bbox'][0])):
        for L in reversed(lines):
            if abs(L['size'] - s['size']) < 0.2 and abs(L['yc'] - yc(s)) < line_em * s['size']:
                L['spans'].append(s); break
        else:
            lines.append({'size': s['size'], 'yc': yc(s), 'spans': [s]})
    out = []
    for L in sorted(lines, key=lambda L: (L['yc'], min(s['bbox'][0] for s in L['spans']))):
        merged = []
        for s in sorted(L['spans'], key=lambda s: s['bbox'][0]):
            p = merged[-1] if merged else None
            dx = s['bbox'][0] - p['bbox'][2] if p else None
            if p and -overlap_em * s['size'] <= dx <= gap_em * s['size']:
                sep = ' ' if (dx > space_em * s['size'] and p['text'] and s['text']
                              and not _is_hangul(p['text'][-1]) and not _is_hangul(s['text'][0])) else ''
                p['text'] += sep + s['text']
                p['bbox'] = [min(p['bbox'][0], s['bbox'][0]), min(p['bbox'][1], s['bbox'][1]),
                             max(p['bbox'][2], s['bbox'][2]), max(p['bbox'][3], s['bbox'][3])]
            else:
                merged.append(s)
        out.extend(merged)
    return out


def render_clip(pno, bbox, dpi, out_path, images_only=False):
    """지면 bbox(pt)를 dpi 로 렌더링해 out_path 에 저장하고 (너비px, 높이px, 실제 dpi)를 돌려준다.
    PyMuPDF 는 정수 dpi 만 받으므로 반올림한 값을 쓴다.
    images_only=True 이면 쪽을 복사해 글자와 모든 벡터 도형을 지우고 래스터 이미지만 남긴다
    (벡터로 그린 지도는 빈 화면이 된다). 원본 문서는 바뀌지 않는다."""
    dpi = int(round(dpi))
    tmp = None
    try:
        page = doc()[pno - 1]
        if images_only:
            tmp = fitz.open(); tmp.insert_pdf(doc(), from_page=pno - 1, to_page=pno - 1)
            page = tmp[0]
            page.add_redact_annot(page.rect)
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                                  text=fitz.PDF_REDACT_TEXT_REMOVE)
        pix = page.get_pixmap(dpi=dpi, clip=fitz.Rect(bbox))
        pix.save(out_path)
        return pix.width, pix.height, dpi
    finally:
        if tmp is not None: tmp.close()
