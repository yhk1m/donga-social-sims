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
import json, os, re, sys, hashlib
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


RELIEF = 'docs/assets/atlas/common/relief-4096.jpg'  # 고도 색은 음영과 같은 격자여야 한다(같은 역투영 표본으로 뽑음)
HEX = re.compile(r'^#[0-9a-f]{6}$')


def validate(t, relief_size=None):
    """설정 tint 확인 — 틀린 곳 목록(빈 목록이면 통과). 색 수 = 경계 수 + 1, #rrggbb, 경계는 커지는 차례, 크기 = 음영 화상, 번호 × codeStep ≤ 255."""
    bad = []
    for k in ('land', 'sea'):
        br, co = t[f'{k}Breaks'], t[f'{k}Colors']
        if len(co) != len(br) + 1: bad.append(f'{k}Colors {len(co)}개 ≠ {k}Breaks {len(br)}개 + 1')
        if any(b2 <= b1 for b1, b2 in zip(br, br[1:])): bad.append(f'{k}Breaks 가 커지는 차례가 아님: {br}')
    if t['landBreaks'][:1] != [0]: bad.append('landBreaks 는 0 부터(해수면 아래 땅 = 첫 색)')
    for c in t['landColors'] + t['seaColors'] + [t['glacierColor']]:
        if not HEX.match(str(c)): bad.append(f'색 형식 #rrggbb 아님: {c}')
    if relief_size and tuple(relief_size) != (t['width'], t['height']):
        bad.append(f"크기 {t['width']}×{t['height']} ≠ 음영 화상 {relief_size[0]}×{relief_size[1]}")
    n = len(t['seaColors']) + len(t['landColors']) + 1
    if (n - 1) * t['codeStep'] > 255: bad.append(f'분류 {n}개 × codeStep {t["codeStep"]} 가 회색 255 를 넘음')
    return bad


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
        nod = src.nodata
        elev = src.read(1, out_shape=(H, W), resampling=Resampling.average, out_dtype='float32', masked=nod is not None)
    if np.ma.isMaskedArray(elev):
        n = int(np.ma.count_masked(elev))
        print(f'DEM 값 없음(nodata {nod}) 화소: {n:,}')
        if n: raise SystemExit(f'DEM 에 값 없는 화소 {n:,}개 — 조용히 0 으로 메우지 않음(DEM 확인)')
        elev = elev.filled(0)
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
    from PIL import Image
    t = unit_config()['tint']
    cls = classes(t)
    bad = validate(t, Image.open(os.path.join(REPO, RELIEF)).size)
    if bad: raise SystemExit('설정 tint 오류: ' + ' / '.join(bad))
    out = os.path.join(REPO, t['out'])
    if '--check' in argv and not os.path.exists(out):
        print(f"없음: {t['out']} — python -I scripts/atlas/build_tint.py 로 만들기"); return 1
    elev, land, glacier = read_inputs(t)
    idx = classify(elev, land, glacier, t)
    if '--check' in argv:
        cur = np.asarray(Image.open(out)).astype(np.int32)
        same = cur.shape == idx.shape and np.array_equal(np.rint(cur / t['codeStep']).astype(np.int32), idx)
        size = os.path.getsize(out)
        over = size > t['maxBytes']
        print('같음' if same else '다름 — python -I scripts/atlas/build_tint.py 로 다시 만들기', f'· {size:,} B' + (f' > maxBytes {t["maxBytes"]:,}' if over else ''))
        return 0 if same and not over else 1
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
