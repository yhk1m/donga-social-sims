# © 2026 김용현
# scripts/atlas/build_tint.py — 고도 색 분류 화상(E2 대조 반영): DEM → 교과서 16쪽 범례 단계 → 회색 PNG(분류 번호 × codeStep)
#   python -I scripts/atlas/build_tint.py            → 설정 tint.out (docs/assets/atlas/common/tint-4096.png) + 단계별 화소 수
#   python -I scripts/atlas/build_tint.py --check    → 만들지 않고 지금 파일이 설정·입력과 같은지만(다르면 종료 코드 1)
# 설정: scripts/atlas/config/u2.json 의 tint = {dem, land, glaciers, width, height, codeStep, landBreaks, landColors, glacierColor, seaBreaks, seaColors, out, maxBytes}
# 분류 번호(앱 src/atlas/tint.js 의 tintClassOf 와 같은 규칙 — tests 가 둘을 견줌):
#   0..S        바다 — 깊이 seaBreaks 로(0 = 0~200 m, …, S = 8,000 m 이상). 바다 화소인데 높이가 0 이상이면 0.
#   S+1         해수면보다 낮은 땅(육지 화소, 높이 < 0)
#   S+2..       육지 — 높이 landBreaks 로(0~100, …, 5,000 이상)
#   마지막       빙하(육지 화소이고 Natural Earth 빙하 면 안)
# 육지/바다 = Natural Earth 10m 육지 면(화소 가운데가 안이면 육지), 높이 = ETOPO 2022 60″ 표면 높이(빙하 위는 얼음 표면)를 화소 칸 평균(rasterio average)으로 줄인 것.
# 회색 = 번호 × codeStep(12) — 브라우저가 PNG 를 조금 다르게 풀어도(색 관리) 반올림으로 번호를 되찾게 간격을 둔다. 8비트 회색, gAMA·iCCP 없음.
import json, os, sys, hashlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from atlas_common import unit_config, stamp_path, REPO


def classes(t):
    """분류 표: [{kind, lo, hi, color}] 번호 차례. lo ≤ 값 < hi(바다는 깊이 m, 육지는 높이 m)."""
    out = []
    sb = [0] + t['seaBreaks']
    for i, c in enumerate(t['seaColors']):
        out.append({'kind': 'sea', 'lo': sb[i], 'hi': sb[i + 1] if i + 1 < len(sb) else None, 'color': c})
    lb = t['landBreaks']
    out.append({'kind': 'below', 'lo': None, 'hi': 0, 'color': t['landColors'][0]})
    for i, c in enumerate(t['landColors'][1:]):
        out.append({'kind': 'land', 'lo': lb[i], 'hi': lb[i + 1] if i + 1 < len(lb) else None, 'color': c})
    out.append({'kind': 'glacier', 'lo': None, 'hi': None, 'color': t['glacierColor']})
    return out


def classify(elev, land, glacier, t):
    """높이(m, float 배열)·육지·빙하 표시 → 분류 번호(uint8). 앱 tintClassOf 와 같은 규칙."""
    S = len(t['seaColors']) - 1
    depth = -elev
    sea_idx = np.searchsorted(np.asarray(t['seaBreaks'], float), depth, side='right')  # 깊이 200 → 1(200~1,000)
    sea_idx = np.where(elev >= 0, 0, sea_idx)
    land_idx = S + 2 + np.searchsorted(np.asarray(t['landBreaks'][1:], float), elev, side='right')
    land_idx = np.where(elev < 0, S + 1, land_idx)
    idx = np.where(land, land_idx, sea_idx)
    idx = np.where(land & glacier, S + 2 + len(t['landBreaks']), idx)
    return idx.astype(np.uint8)


def read_inputs(t):
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    W, H = t['width'], t['height']
    with rasterio.open(stamp_path(t['dem']['file'])) as src:
        if src.crs and not src.crs.is_geographic: raise SystemExit(f'DEM 좌표계가 경위도가 아님: {src.crs}')  # ETOPO 2022 = EPSG:9518(WGS 84 + EGM2008 높이)
        b = src.bounds
        if abs(b.left + 180) > 0.01 or abs(b.right - 180) > 0.01 or abs(b.top - 90) > 0.01 or abs(b.bottom + 90) > 0.01:
            raise SystemExit(f'DEM 범위가 전 지구가 아님: {b}')
        elev = src.read(1, out_shape=(H, W), resampling=Resampling.average, out_dtype='float32')
        nod = src.nodata
    if nod is not None: elev = np.where(elev == nod, 0, elev)
    tr = from_bounds(-180, -90, 180, 90, W, H)
    def mask(path):
        with open(stamp_path(path), encoding='utf-8') as f:
            gj = json.load(f)
        geoms = [ft['geometry'] for ft in gj['features'] if ft.get('geometry')]
        return rasterize(((g, 1) for g in geoms), out_shape=(H, W), transform=tr, fill=0, dtype='uint8').astype(bool)
    return elev, mask(t['land']), mask(t['glaciers'])


def encode_png(idx, t, path):
    from PIL import Image
    im = Image.fromarray((idx.astype(np.uint16) * t['codeStep']).astype(np.uint8), mode='L')
    im.save(path, format='PNG', optimize=True)  # PIL 은 gAMA·iCCP 를 쓰지 않는다


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    t = unit_config()['tint']
    cls = classes(t)
    if (len(cls) - 1) * t['codeStep'] > 255: raise SystemExit('분류가 너무 많아 회색 255 를 넘음(codeStep 줄이기)')
    elev, land, glacier = read_inputs(t)
    idx = classify(elev, land, glacier, t)
    out = os.path.join(REPO, t['out'])
    if '--check' in argv:
        from PIL import Image
        cur = np.asarray(Image.open(out)).astype(np.int32)
        same = cur.shape == idx.shape and np.array_equal(np.rint(cur / t['codeStep']).astype(np.int32), idx)
        print('같음' if same else '다름 — python -I scripts/atlas/build_tint.py 로 다시 만들기')
        return 0 if same else 1
    os.makedirs(os.path.dirname(out), exist_ok=True)
    encode_png(idx, t, out)
    size = os.path.getsize(out)
    counts = np.bincount(idx.ravel(), minlength=len(cls))
    for i, (c, n) in enumerate(zip(cls, counts)):
        rng = f"{c['lo'] if c['lo'] is not None else ''}~{c['hi'] if c['hi'] is not None else ''}"
        print(f"{i:2d} {c['kind']:7s} {rng:>12s} {c['color']} {n / idx.size * 100:6.2f}%")
    sha = hashlib.sha256(open(out, 'rb').read()).hexdigest()[:12]
    print(f"{t['out']} {t['width']}×{t['height']} {size:,} B sha256 {sha}")
    if size > t['maxBytes']: raise SystemExit(f'용량 {size:,} B > maxBytes {t["maxBytes"]:,}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
