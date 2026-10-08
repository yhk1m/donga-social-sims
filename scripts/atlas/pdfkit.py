# scripts/atlas/pdfkit.py
"""사회과부도 PDF 공통 모듈: PDF 열기, 깨진 한글 글자 복원(dec), 쪽 글자 조각, 조각 병합, 영역 렌더링."""
import fitz, os
PDF = os.path.join(os.path.dirname(__file__), '..', '..', '..', '22개정_중학_사회과 부도_교과서_본문.pdf')
_doc = None
def doc():
    global _doc
    if _doc is None: _doc = fitz.open(os.path.abspath(PDF))
    return _doc

# 이 PDF의 한글 글꼴은 KS X 1001 완성형 2350자를 순서대로 1086번부터 배치한다.
H = []
for a in range(0xB0, 0xC9):
    for b in range(0xA1, 0xFF):
        try: H.append(bytes([a, b]).decode('cp949'))
        except UnicodeDecodeError: pass
HIDX = {ch: i for i, ch in enumerate(H)}
LATIN_FONTS = ('DIN', 'Garamond', 'Helvetica', 'Myriad', 'Minion', 'Times', 'Arial')

def dec(s):
    o = []
    for ch in s:
        c = ord(ch)
        if c < 0x20: o.append(' ' if c == 1 else chr(c + 31) if 1 < c < 96 else '?')
        elif 1086 <= c < 1086 + len(H): o.append(H[c - 1086])
        elif 344 <= c < 344 + 51: o.append(chr(0x3131 + c - 344))
        elif 0x7f <= c < 0x1100: o.append('?')
        else: o.append(ch)
    return ''.join(o)

def enc(s):  # 테스트용 역변환
    return ''.join(chr(1086 + HIDX[ch]) if ch in HIDX else ch for ch in s)

def page_spans(pno):
    """인쇄 쪽 번호 → [{text,size,font,bbox}] (복원 적용)"""
    out = []
    for b in doc()[pno - 1].get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                t = s['text'] if any(k in s['font'] for k in LATIN_FONTS) else dec(s['text'])
                t = t.strip()
                if t: out.append({'text': t, 'size': round(s['size'], 1), 'font': s['font'], 'bbox': [round(x, 1) for x in s['bbox']]})
    return out

def merge_spans(spans, gap=2.0):
    """같은 줄·같은 크기에서 gap pt 이내로 붙은 조각을 한 지명으로 합친다(자간 벌린 글자 포함)."""
    spans = sorted(spans, key=lambda s: (round(s['bbox'][1]), s['bbox'][0]))
    out = []
    for s in spans:
        p = out[-1] if out else None
        if p and abs(p['size'] - s['size']) < 0.2 and abs(p['bbox'][1] - s['bbox'][1]) < s['size'] * 0.4 and 0 <= s['bbox'][0] - p['bbox'][2] <= max(gap, s['size'] * 0.6):
            p['text'] += s['text']; p['bbox'][2] = s['bbox'][2]; p['bbox'][3] = max(p['bbox'][3], s['bbox'][3])
        else:
            out.append({**s, 'bbox': list(s['bbox'])})
    return out

def render_clip(pno, bbox, dpi, out_path, images_only=False):
    """지면 bbox(pt)를 dpi로 렌더링해 저장. images_only=True 면 벡터를 숨기고 래스터만."""
    page = doc()[pno - 1]
    tmp = None
    if images_only:  # 쪽을 복사해 글자·벡터를 지우고 래스터만 남긴다(원본 문서는 그대로)
        tmp = fitz.open(); tmp.insert_pdf(doc(), from_page=pno - 1, to_page=pno - 1)
        page = tmp[0]
        page.add_redact_annot(page.rect)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED, text=fitz.PDF_REDACT_TEXT_REMOVE)
    pix = page.get_pixmap(dpi=int(round(dpi)), clip=fitz.Rect(bbox))  # PyMuPDF 는 정수 dpi 만 받는다
    if tmp is not None: tmp.close()
    pix.save(out_path)
    return pix.width, pix.height
