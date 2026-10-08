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
#   --overlay     23쪽 인구 밀도 음영 PNG(투명 바탕, 사람 아이콘 지움) + sims/atlas-u2-asia/data/overlay-p23-density.json
#   --sheets      검증용 대조표 $ATLAS_WORK/shots/c3/photos-<쪽>.jpg (사진 + id·주제·핀·경위도·글)
# 경고가 하나라도 있으면 끝에 모두 찍고 종료 코드 1.
import json, math, os, subprocess, sys, textwrap
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import pdfkit
from atlas_common import WORK, FONT_PATH, maps, unit_config, drawings

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


def km(a, b):
    """경위도 두 점 사이 대원 거리(km)."""
    l1, p1, l2, p2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


def lon_bounds(lonlats, center):
    """경위도 점들의 경도 범위 [서, 동] — 중심 경도 ±180 으로 펴서 날짜변경선을 넘어도 뒤집히지 않게(동 > 180 가능)."""
    xs = [center + ((p[0] - center + 540) % 360) - 180 for p in lonlats]
    return [round(min(xs), 3), round(max(xs), 3)]


def blue_pixels(im, over):
    """보이는(알파 > 0) 화소 중 파랑이 빨강보다 over 넘게 큰 것의 수 — 밀도 음영(주황·빨강)에는 없다."""
    a = np.asarray(im.convert('RGBA')).astype(int)
    return int(((a[..., 2] - a[..., 0] > over) & (a[..., 3] > 0)).sum())


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


# ── 핀 ────────────────────────────────────────────────────────────────────
def find_pins(map_id, pc):
    """지도 핀 → [{xy, label?}] (지면 pt). by=shape: 채움색·크기가 맞는 도형, anchor=bottom 이면 아래 가운데(핀 끝).
    by=text: 글꼴·색·크기·정규식이 맞는 숫자 글자, 그 글자를 담는 가장 작은 원(circleMaxPt 이하 채움 도형)의 가운데."""
    import re
    m = maps()[map_id]; mb = m['bbox']; pno = m['page']
    inside = lambda x, y: mb[0] <= x <= mb[2] and mb[1] <= y <= mb[3]
    pins = []
    if pc['by'] == 'shape':
        for d in drawings(pno):
            if d.get('fill') is None or pdfkit.hex_color(d['fill']) != pc['fill']: continue
            r = d['rect']
            if not (pc['w'][0] <= r.width <= pc['w'][1] and pc['h'][0] <= r.height <= pc['h'][1]): continue
            xy = [(r.x0 + r.x1) / 2, r.y1 if pc['anchor'] == 'bottom' else (r.y0 + r.y1) / 2]
            if inside(*xy): pins.append({'xy': [round(v, 2) for v in xy]})
    else:
        rx = re.compile(pc['re'])
        for s in pdfkit.page_spans(pno):
            if s['font'] != pc['font'] or s['color'] != pc['color'] or abs(s['size'] - pc['size']) > 0.15: continue
            if not rx.match(s['text']): continue
            b = s['bbox']; cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            if not inside(cx, cy): continue
            circ = [d['rect'] for d in drawings(pno) if d.get('fill') is not None and d['rect'].contains((cx, cy))
                    and d['rect'].width <= pc['circleMaxPt'] and d['rect'].height <= pc['circleMaxPt']]
            if circ:
                r = min(circ, key=lambda r: r.width * r.height); cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
            pins.append({'xy': [round(cx, 2), round(cy, 2)], 'label': int(s['text'])})
    # 같은 핀이 두 번 그려진 경우(그림자 등) 하나로
    out = []
    for p in pins:
        if not any(abs(p['xy'][0] - q['xy'][0]) < 1 and abs(p['xy'][1] - q['xy'][1]) < 1 and p.get('label') == q.get('label') for q in out):
            out.append(p)
    return out


def node_lonlat(pts):
    """{지도 id: [[x,y]...]} → {지도 id: [[lon,lat]|None ...]} (pt2lonlat.mjs)."""
    if not pts: return {}
    r = subprocess.run(['node', os.path.join(HERE, 'pt2lonlat.mjs')], input=json.dumps(pts), capture_output=True,
                       text=True, encoding='utf-8', cwd=ROOT)
    if r.returncode: raise RuntimeError(f'pt2lonlat.mjs 실패: {r.stderr.strip()}')
    return json.loads(r.stdout)


def place_lonlat(name, places):
    key = name.replace(' ', '')
    hits = [p for p in places if p['name'].replace(' ', '') == key]
    return [hits[0]['lon'], hits[0]['lat']] if len(hits) == 1 else None


def assign_pins(items, warnings):
    """핀이 있는 사진 → {id: {xy, lonlat, km?}}. 번호 핀은 번호로, 번호 없는 핀은 pinNear 지명과 최소 거리 짝."""
    from places import _pair
    c = cfg()
    with open(repo(c['placesFile']), encoding='utf-8') as f: places = json.load(f)
    by_map = {}
    for it in items:
        if 'pin' in it: by_map.setdefault(it['map'], []).append(it)
    pins = {mid: find_pins(mid, c['pins'][mid]) for mid in by_map}
    ll = node_lonlat({mid: [p['xy'] for p in ps] for mid, ps in pins.items()})
    for mid, ps in pins.items():
        for p, q in zip(ps, ll[mid]): p['lonlat'] = q
    out, report = {}, []
    for mid, its in by_map.items():
        ps = pins[mid]
        if len(ps) != len(its): warnings.append(f'{mid}: 핀 {len(ps)}개, 사진 {len(its)}장 — 수가 다름')
        if any(p['lonlat'] is None for p in ps): warnings.append(f'{mid}: 경위도로 못 되돌린 핀 있음')
        named = [it for it in its if it.get('pinNear')]
        numbered = [it for it in its if not it.get('pinNear')]
        for it in numbered:
            hit = [p for p in ps if p.get('label') == it['pin']]
            if len(hit) != 1: warnings.append(f'{it["id"]}: {mid} 에서 번호 {it["pin"]} 핀이 {len(hit)}개'); continue
            out[it['id']] = {'xy': hit[0]['xy'], 'lonlat': hit[0]['lonlat']}
        if named:
            targets = [p for p in ps if 'label' not in p and p['lonlat']]
            refs = {}
            for it in named:
                refs[it['id']] = place_lonlat(it['pinNear'], places)
                if refs[it['id']] is None: warnings.append(f'{it["id"]}: places 에 지명 「{it["pinNear"]}」이 하나로 없음')
            rows = [it for it in named if refs[it['id']]]
            pair = _pair(rows, targets, lambda it, p: km(refs[it['id']], p['lonlat']), lambda it, p: True, miss=lambda it: 1e6)
            for i, it in enumerate(rows):
                if i not in pair: warnings.append(f'{it["id"]}: 짝 핀 없음'); continue
                p = targets[pair[i]]; d = km(refs[it['id']], p['lonlat'])
                if d > c['pinNearMaxKm']: warnings.append(f'{it["id"]}: 고른 핀이 「{it["pinNear"]}」에서 {d:.0f}km (상한 {c["pinNearMaxKm"]})')
                out[it['id']] = {'xy': p['xy'], 'lonlat': p['lonlat'], 'km': round(d)}
                report.append(f'{it["id"]}↔{it["pinNear"]} {d:.0f}km')
    if report: print('번호 없는 핀 짝: ' + ', '.join(report))
    return out


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
    pins = assign_pins(c['items'], warnings)
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
def build_pages(warnings):
    c = cfg(); pc = c['pageImage']
    d = repo(c['assetDir'], 'page'); os.makedirs(d, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    total = 0
    for pno in range(c['pages'][0], c['pages'][1] + 1):
        tmp = os.path.join(TMP, f'page{pno}.png')
        pdfkit.render_clip(pno, pdfkit.doc()[pno - 1].rect, pc['dpi'], tmp)
        dst = os.path.join(d, f'p{pno:03d}.jpg')
        with Image.open(tmp) as im:
            im = im.convert('RGB')
            for q in pc['qualities']:
                im.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
                if os.path.getsize(dst) <= pc['maxBytes']: break
            else:
                warnings.append(f'{pno}쪽 원본 이미지가 품질 {q} 에서도 {os.path.getsize(dst)}B > {pc["maxBytes"]}B')
        total += os.path.getsize(dst)
        print(f'  p{pno:03d}.jpg q={q} {os.path.getsize(dst) // 1024}KB')
    print(f'원본 쪽 합계 {total / 1048576:.2f}MB')


# ── 밀도 음영 ──────────────────────────────────────────────────────────────
def _components(mask):
    """4-이웃 연결 덩어리 번호(0 = 바탕), 덩어리 수. 작은 마스크용(아이콘)."""
    lab = np.zeros(mask.shape, int); n = 0
    H, W = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; st = [(y0, x0)]; lab[y0, x0] = n
        while st:
            y, x = st.pop()
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; st.append((yy, xx))
    return lab, n


def _dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:] |= out[:-1]; m[:-1] |= out[1:]; m[:, 1:] |= out[:, :-1]; m[:, :-1] |= out[:, 1:]
        out = m
    return out


def density_rgba(rgb, oc):
    """래스터만 렌더한 RGB(흰 바탕) → RGBA. 흰 바탕 투명, 파란 아이콘 지움(둘레가 음영이면 둘레 색으로 메움).
    → (RGBA 배열, {icons, inpainted})"""
    a = rgb.astype(int)
    white = (a >= oc['whiteMin']).all(-1)
    icon = _dilate((a[..., 2] - a[..., 0]) > oc['iconBlueOverRed'], oc['iconDilatePx'])
    alpha = np.where(white | icon, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, alpha])
    lab, n = _components(icon)
    inpainted = 0
    for k in range(1, n + 1):
        comp = lab == k
        ring = _dilate(comp, 1) & ~comp
        dens = ring & ~white & ~icon
        if dens.sum() < oc['inpaintMinOpaqueFrac'] * ring.sum(): continue
        inpainted += 1
        known = dens.copy(); todo = comp.copy()
        col = out[..., :3].astype(float)
        while todo.any():                       # 둘레에서 안쪽으로 이웃 평균 색을 번져 채운다
            grow = _dilate(known, 1) & todo
            if not grow.any(): break
            for y, x in zip(*np.nonzero(grow)):
                ys, xs = slice(max(0, y - 1), y + 2), slice(max(0, x - 1), x + 2)
                k_ = known[ys, xs]
                col[y, x] = col[ys, xs][k_].mean(0)
            known |= grow; todo &= ~grow
        out[..., :3][comp] = col[comp].round().astype(np.uint8)
        out[..., 3][comp] = 255
    return out, {'icons': n, 'inpainted': inpainted}


def build_overlay(warnings):
    c = cfg(); oc = c['overlay']
    m = maps()[oc['map']]; bbox = m['bbox']
    os.makedirs(TMP, exist_ok=True)
    tmp = os.path.join(TMP, 'density-raw.png')
    pdfkit.render_clip(m['page'], bbox, oc['dpi'], tmp, images_only=True)
    with Image.open(tmp) as im: rgb = np.asarray(im.convert('RGB'))
    rgba, info = density_rgba(rgb, oc)
    dst = repo(c['assetDir'], oc['out']); os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(dst, optimize=True)
    with Image.open(dst) as im:
        if blue_pixels(im, oc['iconBlueOverRed']): warnings.append('밀도 음영에 파란 아이콘 화소가 남음')
        W, H = im.size
    # 경위도 범위(테두리 점을 되돌림)
    edge = []
    for t in np.linspace(0, 1, 21):
        x = bbox[0] + t * (bbox[2] - bbox[0]); y = bbox[1] + t * (bbox[3] - bbox[1])
        edge += [[x, bbox[1]], [x, bbox[3]], [bbox[0], y], [bbox[2], y]]
    ll = [p for p in node_lonlat({oc['map']: edge})[oc['map']] if p]
    if len(ll) < len(edge): warnings.append(f'밀도 음영 테두리 {len(edge) - len(ll)}점을 경위도로 못 되돌림')
    with open(os.path.join(WORK, 'geo', f'{oc["map"]}.fit.json'), encoding='utf-8') as f: center = json.load(f)['params'][0]
    w, e = lon_bounds(ll, center)
    bounds = [w, round(min(p[1] for p in ll), 3), e, round(max(p[1] for p in ll), 3)]
    meta = {'url': c['assetBase'] + c['assetPrefix'] + oc['out'], 'page': m['page'], 'bbox': bbox, 'fitId': oc['map'],
            'width': W, 'height': H, 'bounds': bounds}
    with open(repo(oc['json']), 'w', encoding='utf-8', newline='\n') as f: json.dump(meta, f, ensure_ascii=False, indent=1); f.write('\n')
    print(f'밀도 음영 {W}×{H}px {os.path.getsize(dst) // 1024}KB, 아이콘 {info["icons"]}개(메움 {info["inpainted"]}), 경위도 범위 {bounds}')


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


def main(argv):
    flags = {a.lstrip('-') for a in argv}
    every = not flags
    warnings = []
    if every or 'candidates' in flags: check_candidates(warnings)
    photos = None
    if every or 'photos' in flags: photos = build_photos(warnings)
    if every or 'pages' in flags: build_pages(warnings)
    if every or 'overlay' in flags: build_overlay(warnings)
    if every or 'sheets' in flags:
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
