# © 2026 김용현
# scripts/atlas/extract_images.py — 사진·그림, 원본 쪽 이미지, 23쪽 인구 밀도 음영(C3)
#   python -I scripts/atlas/extract_images.py [--candidates] [--photos] [--pages] [--overlay] [--sheets]
#   (아무것도 안 주면 모두. 설정: config/u2.json 의 photos)
#
#   --candidates  쪽마다 래스터 배치를 변으로 맞닿은 것끼리 묶어(인쇄 평탄화로 잘린 띠·조각 합치기) 사진 후보를 내놓는다.
#                 items·exclude 어디에도 안 덮인 후보는 경고(빠뜨린 사진 찾기). 확정 목록은 사람이 설정 items 에 쓴다.
#   --photos      items 마다 bbox 를 원본 해상도(덮는 이미지 배치의 dpi, 벡터 그림은 vectorDpi, 상한 maxDpi)로 렌더 →
#                 docs/assets/atlas/u2/photo/<id>.jpg·.webp. 글(제목·설명·출처)은 pdfkit.box_text(원문 그대로).
#                 핀: 지도마다 핀 위치(지면 pt)를 찾아(pins 설정: 도형 또는 번호 글자) 번호로, 번호 없는 핀은 pinNear 지명과
#                 가장 가까운 짝(헝가리안)으로 고르고, pt2lonlat.mjs(경위도 맞추기 fit)로 경위도 → content/atlas/u2/photos.json
#   --pages       원본 쪽 이미지 p016.jpg~ (pageImage.dpi, maxBytes 안으로 품질을 낮춰 가며)
#   --overlays    설정 overlays 마다 래스터 음영 PNG(투명 바탕·아이콘 지움·부드러운 테두리) + JSON (density_overlay.py)
#   --sheets      검증용 대조표 $ATLAS_WORK/shots/c3/photos-<쪽>.jpg (사진 + id·주제·핀·경위도·글)
# 핀 찾기·짝은 pins.py, 음영 처리는 density_overlay.py. 모르는 옵션은 종료 코드 2. 경고가 하나라도 있으면 끝에 모두 찍고 종료 코드 1.
import json, math, os, sys, textwrap
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import pdfkit
from atlas_common import WORK, FONT_PATH, unit_config
from pins import assign_pins
from density_overlay import build_overlay

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
TMP = os.path.join(WORK, 'c3')


def cfg():
    return unit_config()['photos']


def repo(*p):
    return os.path.join(ROOT, *p)


# ── 순수 함수 ─────────────────────────────────────────────────────────────
def area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def inter(a, b):
    return area([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])])


def group_rects(rects, touch=1.0):
    """사각형 → 덩어리 목록(사각형 번호들). 변으로 맞닿은(겹침 폭 또는 높이가 touch 이하) 것끼리만 잇는다.
    크게 겹친 것(바탕 위 사진)은 잇지 않는다 — 인쇄 평탄화로 잘린 띠·조각만 합친다."""
    n = len(rects); par = list(range(n))
    def find(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for i in range(n):
        a = rects[i]
        for j in range(i + 1, n):
            b = rects[j]
            ix = min(a[2], b[2]) - max(a[0], b[0]); iy = min(a[3], b[3]) - max(a[1], b[1])
            if ix >= -touch and iy >= -touch and (ix <= touch or iy <= touch): par[find(i)] = find(j)
    groups = {}
    for i in range(n): groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def union(rects):
    return [min(r[0] for r in rects), min(r[1] for r in rects), max(r[2] for r in rects), max(r[3] for r in rects)]


def covered(cand, boxes, frac):
    """후보가 상자 하나와 (둘 중 작은 쪽 넓이의) frac 이상 겹치면 덮인 것."""
    return any(inter(cand, b) >= frac * min(area(cand), area(b)) > 0 for b in boxes)


def placement_dpi(info):
    """이미지 배치 → 실제 dpi (회전·기울임이 있어도 변환 행렬의 x 축 길이로)."""
    a, b = info['transform'][0], info['transform'][1]
    return info['width'] / math.hypot(a, b) * 72


def native_dpi(infos, bbox, c):
    """bbox 를 minNativeFrac 이상 덮는 이미지 배치 중 bbox 와 가장 닮은(IoU 최대) 것의 dpi, 없으면 vectorDpi. 상한 maxDpi.
    (가장 높은 dpi·가장 많이 겹침이 아니라 IoU — 원 사진 옆 그림자(200dpi)나 폴라로이드 틀 그림자(72dpi)가 아닌 사진 자체)"""
    iou = lambda i: inter(i['bbox'], bbox) / (area(i['bbox']) + area(bbox) - inter(i['bbox'], bbox))
    cover = [i for i in infos if inter(i['bbox'], bbox) >= c['minNativeFrac'] * area(bbox)]
    best = max(cover, key=iou, default=None)
    if best is None: return c['vectorDpi']
    return int(round(min(placement_dpi(best), c['maxDpi'])))


def topic_counts(items):
    return dict(Counter(it['topic'] for it in items))


# ── 후보 ──────────────────────────────────────────────────────────────────
def candidates(pno, c=None):
    """쪽 래스터 배치 → 사진 후보 [{bbox, n}] (맞닿은 조각 합침, 넓이 minAreaPt2~maxPageFrac·쪽)."""
    c = c or cfg()['candidate']
    page = pdfkit.doc()[pno - 1]
    rects = [list(i['bbox']) for i in page.get_image_info() if area(i['bbox']) > c['minAreaEachPt2']]
    out = []
    for g in group_rects(rects, c['touchPt']):
        b = union([rects[i] for i in g])
        if c['minAreaPt2'] <= area(b) <= c['maxPageFrac'] * page.rect.width * page.rect.height:
            out.append({'bbox': [round(v, 1) for v in b], 'n': len(g)})
    return sorted(out, key=lambda o: (o['bbox'][1], o['bbox'][0]))


def check_candidates(warnings):
    c = cfg()
    p0, p1 = c['pages']
    rows = []
    for pno in range(p0, p1 + 1):
        boxes = [it['bbox'] for it in c['items'] if it['page'] == pno] + [e['bbox'] for e in c['exclude'] if e['page'] == pno]
        cands = candidates(pno)
        miss = [k for k in cands if not covered(k['bbox'], boxes, c['candidate']['coverFrac'])]
        rows.append((pno, len(cands), len(miss)))
        for k in miss: warnings.append(f'{pno}쪽 후보 {k["bbox"]} (조각 {k["n"]})가 items·exclude 어디에도 안 덮임')
    print('후보: ' + ', '.join(f'{p}쪽 {n}(안 덮임 {m})' for p, n, m in rows))


# ── 사진 ──────────────────────────────────────────────────────────────────
def apply_mask(im, mask):
    """mask=circle: 상자에 내접하는 원 바깥을 흰색으로(가장자리 2배 표본으로 부드럽게)."""
    if not mask: return im
    if mask != 'circle': raise ValueError(f'모르는 mask: {mask}')
    W, H = im.size
    m = Image.new('L', (W * 2, H * 2), 0)
    ImageDraw.Draw(m).ellipse([0, 0, W * 2 - 1, H * 2 - 1], fill=255)
    white = Image.new('RGB', im.size, 'white')
    return Image.composite(im, white, m.resize(im.size, Image.LANCZOS))


def save_photo(src_png, pid, c, mask=None):
    d = repo(c['assetDir'], 'photo'); os.makedirs(d, exist_ok=True)
    with Image.open(src_png) as im:
        im = apply_mask(im.convert('RGB'), mask)
        im.save(os.path.join(d, f'{pid}.jpg'), 'JPEG', quality=c['jpegQuality'], optimize=True, progressive=True)
        im.save(os.path.join(d, f'{pid}.webp'), 'WEBP', quality=c['webpQuality'], method=6)
        return im.size


def build_photos(warnings):
    c = cfg()
    os.makedirs(TMP, exist_ok=True)
    pins, w, report = assign_pins(c['items'], c, ROOT)
    warnings += w
    if report: print('번호 없는 핀 짝: ' + ', '.join(report))
    infos = {}
    out, total = [], 0
    for it in c['items']:
        pno = it['page']
        if pno not in infos: infos[pno] = pdfkit.doc()[pno - 1].get_image_info()
        dpi = native_dpi(infos[pno], it['bbox'], c)
        tmp = os.path.join(TMP, f'{it["id"]}.png')
        w, h, dpi = pdfkit.render_clip(pno, it['bbox'], dpi, tmp)
        save_photo(tmp, it['id'], c, it.get('mask'))
        for ext in ('jpg', 'webp'): total += os.path.getsize(repo(c['assetDir'], 'photo', f'{it["id"]}.{ext}'))
        rec = {'id': it['id'], 'page': pno, 'bbox': it['bbox'], 'topic': it['topic']}
        if it.get('mask'): rec['mask'] = it['mask']
        if it.get('titleBox'):
            rec['title'] = pdfkit.box_text(pno, it['titleBox'])
            if not rec['title']: warnings.append(f'{it["id"]}: titleBox 에 글자 없음')
        rec['caption'] = it.get('captionOverride') or pdfkit.box_text(pno, it['captionBox'])
        if not rec['caption']: warnings.append(f'{it["id"]}: 설명 글 없음')
        if it.get('creditBox'):
            rec['credit'] = pdfkit.box_text(pno, it['creditBox'])
            if not rec['credit']: warnings.append(f'{it["id"]}: creditBox 에 글자 없음')
        if 'pin' in it:
            rec['pin'] = it['pin']; rec['map'] = it['map']
            if it['id'] in pins and pins[it['id']]['lonlat']: rec['lonlat'] = pins[it['id']]['lonlat']
            else: warnings.append(f'{it["id"]}: 핀 경위도 없음')
        rec.update({'dpi': dpi, 'width': w, 'height': h})
        out.append(rec)
    if total > c['maxTotalBytes']: warnings.append(f'사진 합계 {total / 1048576:.2f}MB > 상한 {c["maxTotalBytes"] / 1048576:.1f}MB')
    counts = topic_counts(c['items'])
    for t, n in c['expect'].items():
        if counts.get(t, 0) != n: warnings.append(f'주제 {t}: {counts.get(t, 0)}장, 기대 {n}장')
    print('주제별: ' + ', '.join(f'{t} {counts.get(t, 0)}(기대 {c["expect"].get(t, "-")})' for t in c['topics'] if t in counts or t in c['expect']))
    print(f'사진 {len(out)}장, jpg+webp 합계 {total / 1048576:.2f}MB')
    os.makedirs(os.path.dirname(repo(c['outJson'])), exist_ok=True)
    with open(repo(c['outJson']), 'w', encoding='utf-8', newline='\n') as f:
        f.write('[\n' + ',\n'.join(' ' + json.dumps(r, ensure_ascii=False) for r in out) + '\n]\n')
    return out


# ── 원본 쪽 ────────────────────────────────────────────────────────────────
def save_under(im, dst, qualities, max_bytes):
    """JPEG 품질을 qualities 순서로 낮춰 가며 max_bytes 안에 들면 멈춘다 → (품질, 바이트, 들었는가).
    qualities 가 비면 ValueError."""
    if not qualities: raise ValueError('pageImage.qualities 가 비어 있음 — JPEG 품질을 하나 이상 적을 것')
    for q in qualities:
        im.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
        n = os.path.getsize(dst)
        if n <= max_bytes: return q, n, True
    return q, n, False


def build_pages(warnings):
    c = cfg(); pc = c['pageImage']
    d = repo(c['assetDir'], 'page'); os.makedirs(d, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    total = 0
    for pno in range(c['pages'][0], c['pages'][1] + 1):
        tmp = os.path.join(TMP, f'page{pno}.png')
        pdfkit.render_clip(pno, pdfkit.doc()[pno - 1].rect, pc['dpi'], tmp)
        dst = os.path.join(d, f'p{pno:03d}.jpg')
        with Image.open(tmp) as im:
            q, n, ok = save_under(im.convert('RGB'), dst, pc['qualities'], pc['maxBytes'])
        if not ok: warnings.append(f'{pno}쪽 원본 이미지가 품질 {q} 에서도 {n}B > {pc["maxBytes"]}B')
        total += n
        print(f'  p{pno:03d}.jpg q={q} {n // 1024}KB')
    print(f'원본 쪽 합계 {total / 1048576:.2f}MB')


# ── 대조표 ─────────────────────────────────────────────────────────────────
def _font(px):
    try: return ImageFont.truetype(FONT_PATH, px)
    except OSError: return ImageFont.load_default()


def build_sheets(photos):
    c = cfg()
    d = os.path.join(WORK, c['sheetDir']); os.makedirs(d, exist_ok=True)
    f1, f2 = _font(15), _font(13)
    for pno in sorted({p['page'] for p in photos}):
        ps = [p for p in photos if p['page'] == pno]
        cellW, imgH, txtH, cols = 420, 260, 150, 3
        rows = math.ceil(len(ps) / cols)
        sheet = Image.new('RGB', (cols * cellW, rows * (imgH + txtH)), 'white')
        dr = ImageDraw.Draw(sheet)
        for k, p in enumerate(ps):
            x0, y0 = (k % cols) * cellW, (k // cols) * (imgH + txtH)
            with Image.open(repo(c['assetDir'], 'photo', f'{p["id"]}.jpg')) as im:
                im = im.convert('RGB'); im.thumbnail((cellW - 20, imgH - 10))
                sheet.paste(im, (x0 + 10, y0 + 5))
                dr.rectangle([x0 + 9, y0 + 4, x0 + 10 + im.width, y0 + 5 + im.height], outline='#888')
            head = f'{p["id"]}  [{p["topic"]}]  {p["width"]}×{p["height"]} {p["dpi"]}dpi'
            if 'pin' in p: head += f'  핀 {p["pin"]} {p.get("lonlat")}'
            dr.text((x0 + 10, y0 + imgH + 2), head, fill='#c00', font=f2)
            body = (p.get('title', '') + ' | ' if p.get('title') else '') + p['caption'] + (f' / 출처 {p["credit"]}' if p.get('credit') else '')
            for i, line in enumerate(textwrap.wrap(body, 30)[:7]):
                dr.text((x0 + 10, y0 + imgH + 22 + i * 18), line, fill='black', font=f1)
        out = os.path.join(d, f'photos-{pno}.jpg')
        sheet.save(out, 'JPEG', quality=85)
        print(f'  대조표 {out}')


STEPS = ('candidates', 'photos', 'pages', 'overlays', 'sheets')


def parse_flags(argv):
    """['--photos', …] → 단계 집합(비면 모두). 모르는 옵션은 ValueError."""
    bad = [a for a in argv if not a.startswith('--') or a[2:] not in STEPS]
    if bad: raise ValueError(f'모르는 옵션: {" ".join(bad)} (쓸 수 있는 것: {" ".join("--" + s for s in STEPS)})')
    return {a[2:] for a in argv} or set(STEPS)


def main(argv):
    try: flags = parse_flags(argv)
    except ValueError as e:
        print(e, file=sys.stderr); return 2
    warnings = []
    if 'candidates' in flags: check_candidates(warnings)
    photos = None
    if 'photos' in flags: photos = build_photos(warnings)
    if 'pages' in flags: build_pages(warnings)
    if 'overlays' in flags:
        for oc in cfg()['overlays']: build_overlay(oc, cfg(), warnings, ROOT)
    if 'sheets' in flags:
        if photos is None:
            with open(repo(cfg()['outJson']), encoding='utf-8') as f: photos = json.load(f)
        build_sheets(photos)
    if warnings:
        print(f'\n경고 {len(warnings)}개:')
        for w in warnings: print('  - ' + w)
        return 1
    print('경고 없음')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
