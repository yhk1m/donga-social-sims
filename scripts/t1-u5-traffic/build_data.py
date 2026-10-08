# © 2026 김용현
"""t1-u5-traffic 자료 전처리.

입력(raw/, 내려받은 원자료 — 신뢰하지 않는 데이터, 반드시 python -I 로 실행):
  raw/topis/speed_2026_09.xlsx                 서울시 차량통행속도 2026년 9월 (TOPIS 자료실)
  raw/nodelink/ex/MOCT_LINK.*                  국토교통부 표준노드링크 2026-09-14 판 (링크 SHP)
  raw/admdong/HangJeongDong_ver20260701.geojson 행정동 경계 (vuski/admdongkor, 원자료 SGIS)
  raw/osm/seoul_river_wide.json                   한강 등 하천 수면 (OpenStreetMap, Overpass)

출력(sims/t1-u5-traffic/data/):
  links.json  링크 도형(EPSG:5186 계열 TM 좌표, m 정수, 원점 기준 상대) + 평일/주말 시간대 평균 속도
  base.json   시군구 경계·하천 수면(같은 좌표계)

실행: python -I build_data.py <app 루트>
"""
import json
import math
import os
import sys
from collections import defaultdict

import openpyxl
import shapefile
from shapely.geometry import LineString, Polygon, MultiPolygon, shape, mapping
from shapely.ops import unary_union, polygonize, linemerge

ROOT = sys.argv[1]
HERE = os.path.join(ROOT, 'scripts', 't1-u5-traffic')
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(ROOT, 'sims', 't1-u5-traffic', 'data')
os.makedirs(OUT, exist_ok=True)

SPEED_XLSX = os.path.join(RAW, 'topis', 'speed_2026_09.xlsx')
LINK_SHP = os.path.join(RAW, 'nodelink', 'ex', 'MOCT_LINK')
ADM = os.path.join(RAW, 'admdong', 'HangJeongDong_ver20260701.geojson')
RIVER = os.path.join(RAW, 'osm', 'seoul_river_wide.json')

# 2026년 9월 공휴일(추석 연휴 9/24~9/26). 주말과 함께 '주말·공휴일' 로 묶는다.
HOLIDAYS = {20260924, 20260925, 20260926}

# ── TM 정방향 투영 (GRS80, 원점 38N 127E, 가산 200000/600000, 축척 1) = 표준노드링크 SHP 좌표계
A = 6378137.0
F = 1 / 298.257222101
E2 = F * (2 - F)
EP2 = E2 / (1 - E2)
LAT0, LON0, K0, FE, FN = math.radians(38), math.radians(127), 1.0, 200000.0, 600000.0


def _m(phi):
    e4, e6 = E2 * E2, E2 * E2 * E2
    return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
                - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
                - (35 * e6 / 3072) * math.sin(6 * phi))


M0 = _m(LAT0)


def tm(lon, lat):
    phi, lam = math.radians(lat), math.radians(lon)
    n = A / math.sqrt(1 - E2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = EP2 * math.cos(phi) ** 2
    a = (lam - LON0) * math.cos(phi)
    x = FE + K0 * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5 / 120)
    y = FN + K0 * (_m(phi) - M0 + n * math.tan(phi) * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a ** 4 / 24
                                                       + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6 / 720))
    return x, y


def tm_geom(g):
    """shapely 도형의 경위도를 TM 으로."""
    from shapely.ops import transform
    return transform(lambda xs, ys, zs=None: _tm_arrays(xs, ys), g)


def _tm_arrays(xs, ys):
    out = [tm(x, y) for x, y in zip(xs, ys)]
    return [p[0] for p in out], [p[1] for p in out]


# ── 1. 속도 ─────────────────────────────────────────────
print('속도 파일 읽는 중…')
wb = openpyxl.load_workbook(SPEED_XLSX, read_only=True)
ws = wb.worksheets[0]
rows = ws.iter_rows(values_only=True)
header = next(rows)
assert header[3] == '링크아이디' and header[12] == '~01시', header
acc = {}  # id -> {'wd': [sum]*24, 'wdn': [n]*24, 'we': ..., 'wen': ...}
meta = {}
days_wd, days_we = set(), set()
for r in rows:
    if r[0] is None:
        continue
    day, dow = int(r[0]), r[1]
    lid = str(r[3])
    is_we = dow in ('토', '일') or day in HOLIDAYS
    (days_we if is_we else days_wd).add(day)
    if lid not in acc:
        acc[lid] = {'wd': [0.0] * 24, 'wdn': [0] * 24, 'we': [0.0] * 24, 'wen': [0] * 24}
        meta[lid] = {
            'road': r[2], 'from': r[4], 'to': r[5], 'dir': r[6], 'len': r[7], 'lanes': r[8],
            'func': r[9], 'zone': r[10], 'gu': r[11],
        }
    a = acc[lid]
    k, kn = ('we', 'wen') if is_we else ('wd', 'wdn')
    for h in range(24):
        v = r[12 + h]
        if isinstance(v, (int, float)) and v > 0:
            a[k][h] += v
            a[kn][h] += 1
wb.close()
print(f'  링크 {len(acc)}개, 평일 {len(days_wd)}일, 주말·공휴일 {len(days_we)}일')


def mean_profile(s, n):
    return [round(s[h] / n[h]) if n[h] else None for h in range(24)]


speeds = {lid: (mean_profile(a['wd'], a['wdn']), mean_profile(a['we'], a['wen'])) for lid, a in acc.items()}

# ── 2. 표준노드링크 도형 ─────────────────────────────────
print('표준노드링크 읽는 중…')
sf = shapefile.Reader(LINK_SHP, encoding='cp949')
fields = [f[0] for f in sf.fields[1:]]
want = set(speeds)
want8 = {lid[:8] for lid in want}
print('  속도 링크 ID 끝 두 자리 00 아닌 것:', sum(1 for l in want if not l.endswith('00')))
exact, parts = {}, defaultdict(list)
i_len = fields.index('LENGTH')
for i, rec in enumerate(sf.iterRecords(fields=['LINK_ID', 'ROAD_RANK', 'LENGTH'])):
    lid = rec[0]
    if lid in want:
        exact[lid] = (i, rec[1], rec[2])
    if lid not in want and lid[:8] in want8:
        # 표준링크가 노드 추가로 쪼개지면 끝 두 자리가 01, 02… 로 바뀐다 → 앞 8자리로 다시 묶는다
        parts[lid[:8] + '00'].append((i, rec[1], rec[2]))

links = []
xs, ys = [], []
n_exact = n_split = n_bad = 0
for lid in sorted(want):
    if lid in exact:
        members = [exact[lid]] + parts.get(lid, [])
    elif lid in parts:
        members = parts[lid]
    else:
        continue
    total = sum(m[2] for m in members)
    ref = meta[lid]['len'] or total
    if not (0.6 < total / ref < 1.6):
        n_bad += 1
        continue
    lines = [LineString(sf.shape(m[0]).points) for m in members if len(sf.shape(m[0]).points) >= 2]
    g = linemerge(lines) if len(lines) > 1 else lines[0]
    geoms = [g] if g.geom_type == 'LineString' else list(g.geoms)
    if len(geoms) > 1:
        # 이어지지 않으면 가장 긴 것 하나만(드묾)
        geoms.sort(key=lambda q: -q.length)
    coords = list(geoms[0].simplify(4.0, preserve_topology=False).coords)
    if lid in exact:
        n_exact += 1
    else:
        n_split += 1
    links.append((lid, members[0][1], None, coords))
    for x, y in coords:
        xs.append(x)
        ys.append(y)
print(f'  속도 링크 {len(want)}개 → 그대로 매칭 {n_exact}, 쪼개진 링크 재결합 {n_split}, 길이 불일치 제외 {n_bad}')
sf.close()
x0, y0 = math.floor(min(xs)), math.floor(min(ys))
x1, y1 = math.ceil(max(xs)), math.ceil(max(ys))
print(f'  범위 {x0},{y0} ~ {x1},{y1}')

RANK_NAME = {'101': '고속국도', '102': '도시고속도로', '103': '일반국도', '104': '특별·광역시도', '105': '국가지원지방도',
             '106': '지방도', '107': '시군도', '108': '기타'}

# ── 내보내기 형식(페이지 HTML 안에 그대로 들어가므로 작게) ──────────
# 문자열 표: 도로명·지점명·기능 분류·구 이름은 표에 한 번만 두고 번호로 가리킨다.
# 속도: 24시간 × (평일, 주말·공휴일) = 48글자. 글자 코드 - 35 = km/h, 공백 = 자료 없음.
# 도형: 첫 점은 원점 기준 m, 나머지는 앞 점과의 차(m).
strs, sidx = [], {}


def S(v):
    v = '' if v is None else str(v)
    if v not in sidx:
        sidx[v] = len(strs)
        strs.append(v)
    return sidx[v]


def enc_speeds(arr):
    return ''.join(' ' if v is None else chr(35 + max(0, min(150, v))) for v in arr)


def delta(coords):
    out, px, py = [], 0, 0
    for x, y in coords:
        X, Y = round(x - x0), round(y - y0)
        out += [X - px, Y - py]
        px, py = X, Y
    return out


FUNC_ORDER = {'기타도로': 0, '보조간선도로': 1, '주간선도로': 2, '도시고속도로': 3}
out_links = []
for lid, rank, rname, coords in sorted(links, key=lambda t: t[0]):
    m = meta[lid]
    wd, we = speeds[lid]
    out_links.append([
        S(m['road']), S(m['from']), S(m['to']), FUNC_ORDER.get(m['func'], 0), S(m['gu']),
        0 if m['zone'] == '외곽' else 1,  # TOPIS 구분: '도심권' / '외곽'
        m['lanes'] or 0, m['len'] or 0,
        enc_speeds(wd) + enc_speeds(we),
        delta(coords),
    ])

doc = {
    'crs': 'TM GRS80 (중부원점 38N 127E, 가산 200000/600000, 축척 1) — 표준노드링크와 같음',
    'origin': [x0, y0],
    'extent': [x1 - x0, y1 - y0],
    'month': '2026-09',
    'daysWeekday': len(days_wd),
    'daysWeekend': len(days_we),
    'nSource': len(want),
    'linkFields': ['road', 'from', 'to', 'func', 'gu', 'urban', 'lanes', 'len', 'speeds', 'geom'],
    'funcs': ['기타도로', '보조간선도로', '주간선도로', '도시고속도로'],
}

# ── 3. 바탕: 시군구 경계, 하천 ────────────────────────────
print('행정경계 정리 중…')
PAD = 20000
bx0, by0, bx1, by1 = x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD
from shapely.geometry import box
clip = box(bx0, by0, bx1, by1)
with open(ADM, encoding='utf-8') as f:
    adm = json.load(f)
by_sgg = defaultdict(list)
names = {}
for ft in adm['features']:
    p = ft['properties']
    if p['sido'] not in ('11', '41', '28'):
        continue
    g = shape(ft['geometry'])
    minx, miny, maxx, maxy = g.bounds
    if maxx < 126.4 or minx > 127.6 or maxy < 37.2 or miny > 37.95:
        continue
    gt = tm_geom(g)
    if not gt.intersects(clip):
        continue
    by_sgg[p['sgg']].append(gt.buffer(0))
    names[p['sgg']] = (p['sidonm'], p['sggnm'])


def rings(g, tol):
    g = g.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
    out = []
    for pg in polys:
        if not isinstance(pg, Polygon) or pg.area < 40000:
            continue
        rr = [pg.exterior] + list(pg.interiors)
        out.append([delta(r.coords) for r in rr])
    return out


units = []
for sgg, parts in sorted(by_sgg.items()):
    u = unary_union(parts)
    sido, sggnm = names[sgg]
    # 경기 시의 구(성남시분당구 등)는 시 단위로 묶어 이름만 남긴다
    units.append({'code': sgg, 'sido': sido, 'name': sggnm, 'seoul': 1 if sgg.startswith('11') else 0,
                  'poly': rings(u.intersection(clip) if not sgg.startswith('11') else u, 25)})

print('하천 정리 중…')
with open(RIVER, encoding='utf-8') as f:
    osm = json.load(f)
outer_lines, inner_lines, closed = [], [], []
for el in osm['elements']:
    if el['type'] == 'way' and 'geometry' in el:
        pts = [tm(p['lon'], p['lat']) for p in el['geometry']]
        if len(pts) >= 4 and pts[0] == pts[-1]:
            closed.append(Polygon(pts))
    elif el['type'] == 'relation':
        for mem in el.get('members', []):
            if mem.get('type') != 'way' or 'geometry' not in mem:
                continue
            pts = [tm(p['lon'], p['lat']) for p in mem['geometry']]
            if len(pts) < 2:
                continue
            (inner_lines if mem.get('role') == 'inner' else outer_lines).append(LineString(pts))
outer = unary_union(list(polygonize(unary_union(outer_lines)))) if outer_lines else Polygon()
inner = unary_union(list(polygonize(unary_union(inner_lines)))) if inner_lines else Polygon()
water = unary_union([outer.difference(inner)] + [c.buffer(0) for c in closed]).intersection(clip)
water_rings = rings(water, 12)
print(f'  하천 다각형 {len(water_rings)}개')

doc['units'] = [[u['name'], u['seoul'], u['poly']] for u in units]
doc['water'] = water_rings
doc['strings'] = strs
doc['links'] = out_links
doc['sources'] = ['행정동 경계: 통계청 SGIS(공공누리 제1유형) · vuski/admdongkor ver20260701(CC BY 4.0)',
                  '하천 수면: © OpenStreetMap contributors (ODbL)']
for old in ('links.json', 'base.json'):
    if os.path.exists(os.path.join(OUT, old)):
        os.remove(os.path.join(OUT, old))
with open(os.path.join(OUT, 'traffic.json'), 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
print('traffic.json', os.path.getsize(os.path.join(OUT, 'traffic.json')) // 1024, 'KB')
