# © 2026 김용현
# 애로타운 중국인 거주지 둘레 고도 격자를 굽는다.
#   python -I scripts/t1-u1-sun-window/bake_dem.py
# 원본: AWS Terrain Tiles(terrarium, Mapzen/Tilezen 공개 고도 타일; 뉴질랜드 부분은 LINZ 8m DEM 기반)
#   내려받기 캐시: C:\Users\Public\sims-work\t1-u1-sun-window\tiles\  (커밋하지 않음)
# 결과:
#   docs/assets/t1-u1-sun-window/near.png  가까운 지형(가운데 1.6km 사방) 512x512, 높이(0.1m 단위) = R*256 + G
#   docs/assets/t1-u1-sun-window/far.png   먼 산(가운데 24km 사방)       256x256, 같은 부호화
#   sims/t1-u1-sun-window/data/terrain-meta.js  범위·크기 + 오두막에서 본 지평선 고도각(0.5도 간격 720개)
import math, os, sys, urllib.request, json
from io import BytesIO
from PIL import Image

WORK = r'C:\Users\Public\sims-work\t1-u1-sun-window'
APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_ASSET = os.path.join(APP, 'docs', 'assets', 't1-u1-sun-window')
OUT_DATA = os.path.join(APP, 'sims', 't1-u1-sun-window', 'data')

# 장면 가운데(중국인 거주지 Chinese Village 부근)와 오두막 자리
LAT0, LON0 = -44.9379, 168.8278
HUT = (-44.9380, 168.8286)       # 오두막 모형 자리(위도, 경도)
NEAR_HALF = 800.0                  # m
FAR_HALF = 12000.0                 # m
M_PER_DEG_LAT = 111132.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


tile_cache = {}


def get_tile(z, x, y):
    key = (z, x, y)
    if key in tile_cache:
        return tile_cache[key]
    d = os.path.join(WORK, 'tiles', str(z))
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f'{x}_{y}.png')
    if not os.path.exists(p):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        req = urllib.request.Request(url, headers={'User-Agent': 'edu-sim-baker/1.0'})
        data = urllib.request.urlopen(req, timeout=60).read()
        open(p, 'wb').write(data)
    im = Image.open(p).convert('RGB')
    px = im.load()
    arr = [[0.0] * 256 for _ in range(256)]
    for j in range(256):
        row = arr[j]
        for i in range(256):
            r, g, b = px[i, j]
            row[i] = r * 256 + g + b / 256 - 32768
    tile_cache[key] = arr
    return arr


def sample(lat, lon, z):
    """terrarium 타일에서 쌍선형 보간 고도(m)"""
    fx, fy = tile_xy(lat, lon, z)
    px, py = fx * 256 - 0.5, fy * 256 - 0.5
    x0, y0 = math.floor(px), math.floor(py)
    tx, ty = px - x0, py - y0

    def at(X, Y):
        t = get_tile(z, X // 256, Y // 256)
        return t[Y % 256][X % 256]
    a, b = at(x0, y0), at(x0 + 1, y0)
    c, d = at(x0, y0 + 1), at(x0 + 1, y0 + 1)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def grid(half, n, z):
    """가운데(LAT0, LON0) 기준 동서·남북 ±half m 를 n x n 격자로. 행 0 = 북쪽 끝"""
    out = []
    for j in range(n):
        north = half - 2 * half * j / (n - 1)
        lat = LAT0 + north / M_PER_DEG_LAT
        row = []
        for i in range(n):
            east = -half + 2 * half * i / (n - 1)
            row.append(sample(lat, LON0 + east / M_PER_DEG_LON, z))
        out.append(row)
    return out


def save_png(g, path):
    n = len(g)
    im = Image.new('RGB', (n, n))
    px = im.load()
    for j in range(n):
        for i in range(n):
            v = max(0, min(65535, round(g[j][i] * 10)))
            px[i, j] = (v >> 8, v & 255, 0)
    im.save(path, optimize=True)
    return os.path.getsize(path)


def horizon(near, far, n_az=720):
    """오두막 자리(눈높이 1.5m)에서 방위각마다 지평선 고도각(도). 방위각 0 = 북, 시계 방향."""
    he = (HUT[1] - LON0) * M_PER_DEG_LON
    hn = (HUT[0] - LAT0) * M_PER_DEG_LAT
    h0 = sample(HUT[0], HUT[1], 15) + 1.5
    out, out_far = [], []
    for k in range(n_az):
        az = math.radians(k * 360 / n_az)
        best = -90.0
        best_far = -90.0
        d = 10.0
        while d < 30000:
            e, nn = he + d * math.sin(az), hn + d * math.cos(az)
            lat, lon = LAT0 + nn / M_PER_DEG_LAT, LON0 + e / M_PER_DEG_LON
            zl = 15 if d < 1500 else (13 if d < 8000 else 12)
            hh = sample(lat, lon, zl)
            # 지구 곡률 보정(굴절 포함 k=0.13)
            hh -= d * d * (1 - 0.13) / (2 * 6371000)
            ang = math.degrees(math.atan2(hh - h0, d))
            best = max(best, ang)
            if d > 900:
                best_far = max(best_far, ang)
            d += 5 if d < 300 else (15 if d < 2000 else (40 if d < 10000 else 80))
        out.append(round(best, 2))
        out_far.append(round(best_far, 2))
    return out, out_far, h0


def main():
    os.makedirs(OUT_ASSET, exist_ok=True)
    os.makedirs(OUT_DATA, exist_ok=True)
    print('near grid ...')
    near = grid(NEAR_HALF, 512, 15)
    s1 = save_png(near, os.path.join(OUT_ASSET, 'near.png'))
    print('far grid ...')
    far = grid(FAR_HALF, 256, 12)
    s2 = save_png(far, os.path.join(OUT_ASSET, 'far.png'))
    print('horizon ...')
    hz, hz_far, h0 = horizon(near, far)
    flat_near = [v for r in near for v in r]
    flat_far = [v for r in far for v in r]
    meta = {
        'center': [LAT0, LON0],
        'hut': [HUT[0], HUT[1]],
        'hutGround': round(h0 - 1.5, 2),
        'near': {'half': NEAR_HALF, 'size': 512, 'min': round(min(flat_near), 1), 'max': round(max(flat_near), 1), 'file': 'near.png'},
        'far': {'half': FAR_HALF, 'size': 256, 'min': round(min(flat_far), 1), 'max': round(max(flat_far), 1), 'file': 'far.png'},
        'mPerDegLat': M_PER_DEG_LAT, 'mPerDegLon': round(M_PER_DEG_LON, 3),
    }
    js = ['// © 2026 김용현',
          '// scripts/t1-u1-sun-window/bake_dem.py 가 만든 파일(손으로 고치지 않음).',
          '// 고도: AWS Terrain Tiles(terrarium) — 뉴질랜드 부분 원자료 LINZ 8m DEM(CC BY 4.0).',
          '// HORIZON: 오두막 자리(눈높이 1.5m)에서 본 지평선 고도각(도), 방위각 0도(북)부터 0.5도 간격 시계 방향 720개.',
          f'export const TERRAIN = {json.dumps(meta, ensure_ascii=False)};',
          '// horizonFar: 같은 방식이되 900m 보다 먼 산만 본 값(장면 밖 먼 산이 골짜기 전체를 가리는지 판단).',
          f'export const HORIZON = {json.dumps(hz)};',
          f'export const HORIZON_FAR = {json.dumps(hz_far)};', '']
    open(os.path.join(OUT_DATA, 'terrain-meta.js'), 'w', encoding='utf-8').write('\n'.join(js))
    print('near.png', s1, 'far.png', s2, 'hut ground', h0 - 1.5)
    print('horizon max', max(hz), 'at', hz.index(max(hz)) / 2, 'deg; N', hz[0], 'E', hz[180], 'S', hz[360], 'W', hz[540])


if __name__ == '__main__':
    main()
