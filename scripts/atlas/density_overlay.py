# © 2026 김용현
# scripts/atlas/density_overlay.py — 래스터 음영 지도(23쪽 인구 밀도) → 투명 바탕 PNG + 역투영용 JSON
#   density_rgba(rgb, oc)   순수 함수(numpy): 흰 바탕 RGB → RGBA
#     1. 흰색(세 채널 ≥ whiteMin) = 투명
#     2. 파란 사람 아이콘(B − R > iconBlueOverRed, iconDilatePx 넓힘)을 지우고, 둘레의 inpaintMinOpaqueFrac 이상이
#        음영이면 둘레 색을 안쪽으로 번져 메움(아니면 = 바다 위, 투명)
#     3. 흰색과 맞닿은 테두리 띠(edgePx)는 부드러운 알파: 흰색 거리 d = 255 − 최소 채널, 기준 d_ref = 띠 밖 음영 화소의
#        이웃(edgePx + 1) 최댓값 → α = d / d_ref, 색은 흰색을 걷어 낸 값(255 − (255 − c)/α) — 해안의 흰 테두리가 남지 않게
#   build_overlay(oc, c, warnings)   렌더 → PNG(docs/assets/…) + JSON(sims/…/data/…)
#   overlay_legend(oc)               지도 범례(maps_u2 legendBbox)의 견본 색 + 글자(legend.py, legendSkip 색 뺌) → [{color, label}] (교과서 순서)
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import pdfkit
from atlas_common import WORK, maps, unit_config
import legend as LG
from pins import node_lonlat, node_center

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
TMP = os.path.join(WORK, 'c3')

_N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def _shift(a, dy, dx, fill=0):
    """a 를 (dy, dx) 만큼 민 배열(밖은 fill). out[y, x] = a[y − dy, x − dx]."""
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = a[ys, xs]
    return out


def dilate(mask, r):
    """4-이웃 r 번 넓히기."""
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:] |= out[:-1]; m[:-1] |= out[1:]; m[:, 1:] |= out[:, :-1]; m[:, :-1] |= out[:, 1:]
        out = m
    return out


def max_filter(a, r):
    """(2r+1)² 창 최댓값(밀기 반복, 밖은 0)."""
    out = a.copy()
    for _ in range(r):
        m = out.copy()
        for dy, dx in _N8: np.maximum(m, _shift(out, dy, dx), out=m)
        out = m
    return out


def components(mask):
    """4-이웃 연결 덩어리 → [(y0, y1, x0, x1, 덩어리 마스크(상자 안))]. 아이콘처럼 작은 마스크용."""
    lab = np.zeros(mask.shape, np.int32); n = 0; boxes = []
    H, W = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; st = [(y0, x0)]; lab[y0, x0] = n; ys, xs = [y0], [x0]
        while st:
            y, x = st.pop()
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; st.append((yy, xx)); ys.append(yy); xs.append(xx)
        a, b, c, d = min(ys), max(ys) + 1, min(xs), max(xs) + 1
        boxes.append((a, b, c, d, lab[a:b, c:d] == n))
    return boxes


def fill_from_known(col, known, todo):
    """todo 화소를 known 이웃(8방) 평균 색으로 바깥에서 안쪽으로 번져 채운다(배열 연산, col 을 고쳐 씀)."""
    known = known.copy(); todo = todo.copy()
    while todo.any():
        S = np.zeros_like(col); N = np.zeros(known.shape, np.float64)
        kc = col * known[..., None]
        for dy, dx in _N8:
            S += _shift(kc, dy, dx); N += _shift(known.astype(np.float64), dy, dx)
        grow = todo & (N > 0)
        if not grow.any(): break
        col[grow] = S[grow] / N[grow][:, None]
        known |= grow; todo &= ~grow
    return col


def density_rgba(rgb, oc):
    """RGB(흰 바탕, uint8) → (RGBA uint8, {icons, inpainted, soft})."""
    a = rgb.astype(np.int32)
    col = rgb.astype(np.float64)
    white = (a >= oc['whiteMin']).all(-1)
    icon = dilate((a[..., 2] - a[..., 0]) > oc['iconBlueOverRed'], oc['iconDilatePx'])
    alpha = np.where(white | icon, 0.0, 1.0)
    pad = 2                                   # 아이콘 상자 둘레 여유(둘레 고리·채움 계산은 이 작은 창 안에서만)
    comps = components(icon)
    inpainted = 0
    for y0, y1, x0, x1, cm in comps:
        Y0, Y1, X0, X1 = max(0, y0 - pad), min(a.shape[0], y1 + pad), max(0, x0 - pad), min(a.shape[1], x1 + pad)
        comp = np.zeros((Y1 - Y0, X1 - X0), bool)
        comp[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = cm
        w, ic = white[Y0:Y1, X0:X1], icon[Y0:Y1, X0:X1]
        ring = dilate(comp, 1) & ~comp
        dens = ring & ~w & ~ic
        if dens.sum() < oc['inpaintMinOpaqueFrac'] * ring.sum(): continue
        inpainted += 1
        sub = col[Y0:Y1, X0:X1]
        fill_from_known(sub, ~w & ~ic, comp)
        alpha[Y0:Y1, X0:X1][comp] = 1.0
        icon[Y0:Y1, X0:X1][comp] = False
    # 부드러운 테두리: 흰색과 맞닿은 띠
    shade = alpha > 0
    clear = ~shade
    d = 255.0 - col.min(-1)
    band = dilate(clear, oc['edgePx']) & shade
    core = shade & ~band
    dref = max_filter(np.where(core, d, 0.0), oc['edgePx'] + 1)
    # 둘레에 음영 화소가 없는 띠 화소 = 흰 바다의 잡티(인쇄 평탄화 조각 가장자리): 흰색 거리가 noiseD 미만이면 투명
    lone = band & (dref == 0)
    alpha[lone & (d < oc['noiseD'])] = 0.0
    soft = band & (dref > 0) & (d < dref)
    al = np.clip(d / np.where(dref > 0, dref, 1.0), 0.0, 1.0)
    # 색: α ≥ 0.5 이면 흰색을 걷어 낸 값(255 − (255 − c)/α), 그보다 옅으면 걷어 내기가 잡티를 키우므로 이웃 음영 색
    near = fill_from_known(col.copy(), (alpha > 0) & ~soft, soft)
    un = 255.0 - (255.0 - col) / np.maximum(al, 1e-6)[..., None]
    pick = soft & (al >= 0.5)
    col[pick] = un[pick]
    col[soft & ~pick] = near[soft & ~pick]
    alpha[soft] = al[soft]
    out = np.dstack([np.clip(col.round(), 0, 255).astype(np.uint8), np.clip((alpha * 255).round(), 0, 255).astype(np.uint8)])
    return out, {'icons': len(comps), 'inpainted': inpainted, 'soft': int(soft.sum())}


def lon_bounds(lonlats, center):
    """경위도 점들의 경도 범위 [서, 동] — 중심 경도 ±180 으로 펴서 날짜변경선을 넘어도 뒤집히지 않게(동 > 180 가능)."""
    xs = [center + ((p[0] - center + 540) % 360) - 180 for p in lonlats]
    return [round(min(xs), 3), round(max(xs), 3)]


def blue_pixels(im, over):
    """보이는(알파 > 0) 화소 중 파랑이 빨강보다 over 넘게 큰 것의 수 — 밀도 음영(주황·빨강)에는 없다."""
    a = np.asarray(im.convert('RGBA')).astype(int)
    return int(((a[..., 2] - a[..., 0] > over) & (a[..., 3] > 0)).sum())


def overlay_legend(oc):
    """음영 단계 범례 → [{color, label}] (읽는 순서). legendSkip = 같은 범례 상자 안 다른 레이어 견본 색(인구 막대 #0072bc)."""
    m = maps()[oc['map']]
    cfg = dict(unit_config()['defaults'], legendSkip=oc.get('legendSkip', []))
    return [{'color': e['color'], 'label': e['label']} for e in LG.legend(m, cfg)]


def build_overlay(oc, c, warnings, root=ROOT):
    """설정 overlays 항목 하나 → PNG + JSON. c = 설정 photos."""
    m = maps()[oc['map']]; bbox = m['bbox']
    os.makedirs(TMP, exist_ok=True)
    tmp = os.path.join(TMP, f'{oc["id"]}-raw.png')
    pdfkit.render_clip(m['page'], bbox, oc['dpi'], tmp, images_only=True)
    with Image.open(tmp) as im: rgb = np.asarray(im.convert('RGB'))
    rgba, info = density_rgba(rgb, oc)
    dst = os.path.join(root, c['assetDir'], oc['out']); os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(dst, optimize=True)
    with Image.open(dst) as im:
        if blue_pixels(im, oc['iconBlueOverRed']): warnings.append(f'{oc["id"]}: 파란 아이콘 화소가 남음')
        W, H = im.size
    edge = []
    for t in np.linspace(0, 1, 21):
        x = bbox[0] + t * (bbox[2] - bbox[0]); y = bbox[1] + t * (bbox[3] - bbox[1])
        edge += [[x, bbox[1]], [x, bbox[3]], [bbox[0], y], [bbox[2], y]]
    ll = [p for p in node_lonlat({oc['map']: edge})[oc['map']] if p]
    if len(ll) < len(edge): warnings.append(f'{oc["id"]}: 테두리 {len(edge) - len(ll)}점을 경위도로 못 되돌림')
    if not ll: raise RuntimeError(f'{oc["id"]}: 테두리 점을 하나도 경위도로 못 되돌림')
    w, e = lon_bounds(ll, node_center(oc['map']))
    bounds = [w, round(min(p[1] for p in ll), 3), e, round(max(p[1] for p in ll), 3)]
    meta = {'url': c['assetBase'] + c['assetPrefix'] + oc['out'], 'page': m['page'], 'bbox': bbox, 'fitId': oc['map'],
            'width': W, 'height': H, 'bounds': bounds, 'legend': overlay_legend(oc)}
    if 'expectLegend' not in oc: warnings.append(f'{oc["id"]}: 설정 photos.overlays 에 expectLegend(지면 범례 단계 수)가 없음')
    elif len(meta['legend']) != oc['expectLegend']: warnings.append(f'{oc["id"]}: 범례 {len(meta["legend"])}개 ≠ 지면 {oc["expectLegend"]}개')
    if not all(e['label'] for e in meta['legend']): warnings.append(f'{oc["id"]}: 이름 없는 범례 견본')
    with open(os.path.join(root, oc['json']), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1); f.write('\n')
    print(f'{oc["id"]}: {W}×{H}px {os.path.getsize(dst) // 1024}KB, 아이콘 {info["icons"]}개(메움 {info["inpainted"]}), '
          f'부드러운 테두리 {info["soft"]}화소, 경위도 범위 {bounds}')
