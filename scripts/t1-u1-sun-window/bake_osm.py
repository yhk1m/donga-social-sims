# © 2026 김용현
# OpenStreetMap(ODbL) 자료를 장면 좌표(m, 동쪽 +x, 북쪽 +y, 가운데 = 거주지)로 바꿔 작은 JS 모듈로 굽는다.
#   1) 원본 받기(한 번): curl -A "edu-sim-baker/1.0" -o C:/Users/Public/sims-work/t1-u1-sun-window/osm.xml \
#        "https://api.openstreetmap.org/api/0.6/map?bbox=168.815,-44.952,168.845,-44.930"
#      (Overpass 가 막혀 있어 OSM 기본 API map 호출로 받았다. 내용과 사용권은 같다.)
#   2) python -I scripts/t1-u1-sun-window/bake_osm.py
# 결과: sims/t1-u1-sun-window/data/osm.js
import json, math, os
import xml.etree.ElementTree as ET

WORK = r'C:\Users\Public\sims-work\t1-u1-sun-window'
APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(APP, 'sims', 't1-u1-sun-window', 'data', 'osm.js')

LAT0, LON0 = -44.9379, 168.8278
HUT = (-44.9380, 168.8286)
HALF = 800.0
M_LAT = 111132.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
LEVEL_H = 3.0
DEFAULT_H = 4.5


def xy(lat, lon):
    return ((lon - LON0) * M_LON, (lat - LAT0) * M_LAT)


def inside(p, pad=0.0):
    return abs(p[0]) <= HALF + pad and abs(p[1]) <= HALF + pad


def stitch(ways):
    """끝점이 이어진 선들을 고리로 잇는다"""
    ways = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while ways:
        cur = ways.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w[:-1] + cur
                elif w[0] == cur[0]:
                    cur = w[::-1][:-1] + cur
                else:
                    continue
                ways.pop(i)
                changed = True
                break
        rings.append(cur)
    return rings


def flat(pts):
    out = []
    for x, y in pts:
        out += [round(x, 1), round(y, 1)]
    return out


def area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2


def parse_h(tags):
    for k in ('height', 'building:height'):
        if k in tags:
            try:
                return float(tags[k].replace('m', '').strip())
            except ValueError:
                pass
    if 'building:levels' in tags:
        try:
            return float(tags['building:levels']) * LEVEL_H + 1.0
        except ValueError:
            pass
    return None


def main():
    root = ET.parse(os.path.join(WORK, 'osm.xml')).getroot()
    nodes = {n.get('id'): xy(float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
    ways = {}
    tagsOf = {}
    for w in root.iter('way'):
        refs = [nd.get('ref') for nd in w.findall('nd')]
        ways[w.get('id')] = [nodes[r] for r in refs if r in nodes]
        tagsOf[w.get('id')] = {t.get('k'): t.get('v') for t in w.findall('tag')}

    hx, hy = xy(*HUT)
    buildings, roads, water_lines, water_areas, woods, grass, trees = [], [], [], [], [], [], []
    stats = {'height': 0, 'levels': 0, 'default': 0}

    def area_kind(tags):
        if tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank' or tags.get('landuse') == 'reservoir':
            return 'water'
        if tags.get('natural') in ('wood', 'scrub') or tags.get('landuse') == 'forest':
            return 'wood'
        if tags.get('leisure') in ('park', 'pitch', 'golf_course') or tags.get('landuse') in ('grass', 'meadow', 'farmland', 'greenfield', 'recreation_ground'):
            return 'grass'
        return None

    def add_area(kind, pts):
        if len(pts) < 4 or not any(inside(p, 200) for p in pts):
            return
        {'water': water_areas, 'wood': woods, 'grass': grass}[kind].append(flat(pts))

    for wid, pts in ways.items():
        tags = tagsOf[wid]
        if not pts:
            continue
        if 'building' in tags and pts[0] == pts[-1]:
            ring = pts[:-1]
            if len(ring) < 3 or not all(inside(p) for p in ring):
                continue
            cx = sum(p[0] for p in ring) / len(ring)
            cy = sum(p[1] for p in ring) / len(ring)
            if math.hypot(cx - hx, cy - hy) < 14:
                continue  # 오두막 모형 자리와 겹치는 건물은 뺀다
            hgt = parse_h(tags)
            if hgt is not None:
                stats['height' if 'height' in tags else 'levels'] += 1
            else:
                stats['default'] += 1
                hgt = 2.6 if tags.get('building') == 'ruins' else (3.0 if tags.get('building') in ('shed', 'garage', 'garages') else DEFAULT_H)
            if area(ring) < 0:
                ring = ring[::-1]  # 반시계 방향으로 통일
            buildings.append({'p': flat(ring), 'h': round(hgt, 1)})
            continue
        hw = tags.get('highway')
        if hw and len(pts) >= 2 and any(inside(p, 50) for p in pts):
            cls = 0 if hw in ('primary', 'secondary', 'tertiary', 'trunk') else (1 if hw in ('residential', 'unclassified', 'service', 'living_street', 'track') else 2)
            if hw in ('footway', 'path', 'cycleway', 'steps', 'bridleway', 'pedestrian', 'track') and cls != 1:
                cls = 2
            roads.append([cls] + flat(pts))
            continue
        ww = tags.get('waterway')
        if ww in ('river', 'stream', 'ditch', 'canal') and any(inside(p, 50) for p in pts):
            water_lines.append([0 if ww == 'river' else 1] + flat(pts))
            continue
        k = area_kind(tags)
        if k and pts[0] == pts[-1]:
            add_area(k, pts)

    for rel in root.iter('relation'):
        tags = {t.get('k'): t.get('v') for t in rel.findall('tag')}
        if tags.get('type') != 'multipolygon':
            continue
        k = area_kind(tags)
        if not k:
            continue
        outer = [ways[m.get('ref')] for m in rel.findall('member') if m.get('type') == 'way' and m.get('role') in ('outer', '') and m.get('ref') in ways]
        for ring in stitch(outer):
            if ring[0] == ring[-1]:
                add_area(k, ring)

    for n in root.iter('node'):
        tags = {t.get('k'): t.get('v') for t in n.findall('tag')}
        if tags.get('natural') == 'tree':
            p = nodes[n.get('id')]
            if inside(p):
                trees += [round(p[0], 1), round(p[1], 1)]

    data = {
        'buildings': buildings, 'roads': roads, 'waterLines': water_lines, 'waterAreas': water_areas,
        'woods': woods, 'grass': grass, 'trees': trees,
    }
    js = ['// © 2026 김용현',
          '// scripts/t1-u1-sun-window/bake_osm.py 가 만든 파일(손으로 고치지 않음).',
          '// 자료: © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
          '// 좌표: 장면 가운데(남위 44.9379도, 동경 168.8278도)에서 동쪽 x, 북쪽 y (m).',
          '// buildings: {p:[x,y,...] 반시계 고리, h: 높이 m(height 태그, 없으면 층수 x 3m + 1m, 그것도 없으면 기본 4.5m)}',
          '// roads: [등급(0 큰길, 1 동네길, 2 오솔길), x, y, ...], waterLines: [0 강 / 1 개울, x, y, ...]',
          'export const OSM = ' + json.dumps(data, separators=(',', ':')) + ';', '']
    open(OUT, 'w', encoding='utf-8').write('\n'.join(js))
    print('buildings', len(buildings), stats, 'roads', len(roads), 'waterLines', len(water_lines), 'waterAreas', len(water_areas),
          'woods', len(woods), 'grass', len(grass), 'trees', len(trees) // 2, 'bytes', os.path.getsize(OUT))


if __name__ == '__main__':
    main()
