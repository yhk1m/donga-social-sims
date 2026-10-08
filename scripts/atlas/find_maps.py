# scripts/atlas/find_maps.py
"""쪽마다 지도 후보를 찾아 출력한다: 경위선 눈금 글자(°·E·N 등)와 큰 사각형(지도 프레임·클립).
사용: python -I scripts/atlas/find_maps.py 16 25
maps_u2.json 을 손으로 쓸 때 참고하는 보조 도구다(결과를 그대로 쓰지 않는다)."""
import re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import pdfkit

# 이 PDF는 도 기호로 '˚'(U+02DA)를 쓴다. '°'(U+00B0)도 함께 받는다.
TICK = re.compile(r'^\s*\d{1,3}\s*[˚°]\s*[NSEW]?\s*$')

def tick_spans(pno):
    return [s for s in pdfkit.page_spans(pno) if TICK.search(s['text'])]

def frame_rects(pno, min_w=140, min_h=110):
    """채움 없는(또는 흰) 테두리 사각형과 클립 영역 가운데 지도 크기인 것."""
    page = pdfkit.doc()[pno - 1]
    out = []
    for d in page.get_drawings(extended=True):
        r = d.get('rect') or d.get('scissor')
        if r is None: continue
        if r.width < min_w or r.height < min_h or r.width > 775: continue
        kind = d.get('type')  # 'f','s','fs','clip','group'
        if kind in ('clip',) or (kind in ('s', 'fs') and len(d.get('items', [])) <= 5):
            out.append((kind, [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)]))
    seen, uniq = set(), []
    for k, b in out:
        key = (k, tuple(round(v) for v in b))
        if key not in seen: seen.add(key); uniq.append((k, b))
    return uniq

def main(a, b):
    sys.stdout.reconfigure(encoding='utf-8')
    for p in range(a, b + 1):
        print(f'=== p{p}')
        ticks = tick_spans(p)
        print(f'  ticks: {len(ticks)}')
        for s in ticks: print(f"    {s['text']!r:12} {s['bbox']}")
        for k, r in frame_rects(p): print(f'  rect {k:5} {r}  ({r[2]-r[0]:.0f}x{r[3]-r[1]:.0f})')

if __name__ == '__main__':
    a = int(sys.argv[1]); b = int(sys.argv[2]) if len(sys.argv) > 2 else a
    main(a, b)
