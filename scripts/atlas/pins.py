# © 2026 김용현
# scripts/atlas/pins.py — 지도 핀 찾기(지면 pt)와 사진 ↔ 핀 짝, 경위도(pt2lonlat.mjs)
#   find_pins(map_id, pc)          지도 핀 → [{xy, label?}]. pc = 설정 photos.pins[map_id]
#                                  by=shape: 채움색·크기가 맞는 도형(anchor=bottom 이면 아래 가운데 = 물방울 핀 끝)
#                                  by=text : 글꼴·색·크기·정규식이 맞는 번호 글자, 그 글자를 담는 가장 작은 원의 가운데
#                                  excludeBoxes(선택): 이 상자 안의 핀은 뺀다(지도 틀 안에 든 삽입 지도의 핀 — 29쪽 아이슬란드)
#   node_lonlat(pts)               {지도 id: [[x,y]...]} → {지도 id: [[lon,lat]|None ...]} (node 하위 프로세스)
#   match_pins(items, pins, places, default_km)
#                                  순수 함수: 번호 핀은 번호로, 번호 없는 핀은 pinNear 지명과 거리 합 최소 짝(assign.pair).
#                                  같은 번호 핀이 여럿이면(33쪽 07 — 독일·이탈리아 동전) pinNear 가 있는 항목을 그 번호 핀들 안에서
#                                  지명과 짝짓는다(번호 글자가 없는 지도에서는 예전처럼 번호 없는 핀 전체에서).
#                                  항목별 상한 pinNearMaxKm(없으면 default_km). 한 지명의 상한 안에 핀이 둘 이상이면 모호 경고.
#   assign_pins(items, cfg)        위를 엮은 것 → ({사진 id: {xy, lonlat, km?}}, 경고 목록, 짝 보고)
import json, math, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
from assign import pair
from atlas_common import maps, drawings

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
NODE_TIMEOUT_S = 120


def km(a, b):
    """경위도 두 점 사이 대원 거리(km)."""
    l1, p1, l2, p2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


def find_pins(map_id, pc):
    """지도 핀 → [{xy, label?}] (지면 pt, 지도 틀 안만, 같은 자리 두 번 그린 것은 하나로)."""
    m = maps()[map_id]; mb = m['bbox']; pno = m['page']
    ex = pc.get('excludeBoxes', [])
    inside = lambda x, y: mb[0] <= x <= mb[2] and mb[1] <= y <= mb[3] and not any(e[0] <= x <= e[2] and e[1] <= y <= e[3] for e in ex)
    pins = []
    if pc['by'] == 'shape':
        for d in drawings(pno):
            if d.get('fill') is None or pdfkit.hex_color(d['fill']) != pc['fill']: continue
            r = d['rect']
            if not (pc['w'][0] <= r.width <= pc['w'][1] and pc['h'][0] <= r.height <= pc['h'][1]): continue
            xy = [(r.x0 + r.x1) / 2, r.y1 if pc['anchor'] == 'bottom' else (r.y0 + r.y1) / 2]
            if inside(*xy): pins.append({'xy': [round(v, 2) for v in xy]})
    elif pc['by'] == 'text':
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
    else:
        raise ValueError(f'{map_id}: 모르는 핀 찾기 방식 by={pc["by"]!r} (shape|text)')
    out = []
    for p in pins:
        if not any(abs(p['xy'][0] - q['xy'][0]) < 1 and abs(p['xy'][1] - q['xy'][1]) < 1 and p.get('label') == q.get('label') for q in out):
            out.append(p)
    return out


def node_lonlat(pts, run=subprocess.run):
    """{지도 id: [[x,y]...]} → {지도 id: [[lon,lat]|None ...]} (pt2lonlat.mjs). node 가 없거나, 시간이 넘거나,
    실패하거나, 돌려준 지도·점 수가 다르면 RuntimeError."""
    if not pts: return {}
    node = shutil.which('node')
    if not node: raise RuntimeError('node 를 찾을 수 없음 — Node.js 를 설치하거나 PATH 에 넣을 것(pt2lonlat.mjs 실행용)')
    try:
        r = run([node, os.path.join(HERE, 'pt2lonlat.mjs')], input=json.dumps(pts), capture_output=True,
                text=True, encoding='utf-8', cwd=ROOT, timeout=NODE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f'pt2lonlat.mjs 가 {NODE_TIMEOUT_S}초 안에 끝나지 않음')
    if r.returncode: raise RuntimeError(f'pt2lonlat.mjs 실패(종료 코드 {r.returncode}): {r.stderr.strip()}')
    out = json.loads(r.stdout)
    for mid, lst in pts.items():
        if len(out.get(mid) or []) != len(lst):
            raise RuntimeError(f'pt2lonlat.mjs: {mid} 점 {len(lst)}개를 보냈는데 {len(out.get(mid) or [])}개가 돌아옴')
    return out


def _node_query(flag, map_id, run):
    """pt2lonlat.mjs <flag> <지도 id> 의 JSON 출력. node 없음·시간 초과·실패는 RuntimeError."""
    node = shutil.which('node')
    if not node: raise RuntimeError('node 를 찾을 수 없음 — Node.js 를 설치하거나 PATH 에 넣을 것(pt2lonlat.mjs 실행용)')
    try:
        r = run([node, os.path.join(HERE, 'pt2lonlat.mjs'), flag, map_id], capture_output=True,
                text=True, encoding='utf-8', cwd=ROOT, timeout=NODE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f'pt2lonlat.mjs {flag} 가 {NODE_TIMEOUT_S}초 안에 끝나지 않음')
    if r.returncode: raise RuntimeError(f'pt2lonlat.mjs {flag} {map_id} 실패: {r.stderr.strip()}')
    return json.loads(r.stdout)


def node_center(map_id, run=subprocess.run):
    """지도 fit 의 투영 중심 경도(pt2lonlat.mjs --center). fit 이 없으면 RuntimeError(무엇을 먼저 돌릴지 포함)."""
    return _node_query('--center', map_id, run)['center']


def node_fit(map_id, run=subprocess.run):
    """앱이 쓰는 fit 부분 {family, params, sim, tps?}(pt2lonlat.mjs --fit). 밀도 음영 JSON 에 실어 브라우저가 역투영한다."""
    return _node_query('--fit', map_id, run)


def place_lonlat(name, places):
    """places.json 에서 이름(공백 무시)이 하나뿐인 지명의 [lon, lat] → (값, None) 또는 (None, 까닭)."""
    k = name.replace(' ', '')
    hits = [p for p in places if p['name'].replace(' ', '') == k]
    if len(hits) == 1: return [hits[0]['lon'], hits[0]['lat']], None
    if not hits: return None, f'places.json 에 「{name}」이 없음(공백 무시 완전 일치로 찾음)'
    return None, f'places.json 에 「{name}」이 {len(hits)}개({", ".join(p.get("kind", "?") for p in hits)}) — 하나로 못 고름'


def match_pins(items, pins, places, default_km):
    """items(같은 지도의 사진 설정들) + pins([{xy, lonlat, label?}]) → ({사진 id: {xy, lonlat, km?}}, 경고, 보고)."""
    out, warnings, report = {}, [], []
    tag = items[0]['map'] if items else '?'
    if len(pins) != len(items): warnings.append(f'{tag}: 핀 {len(pins)}개, 사진 {len(items)}장 — 수가 다름')
    if any(p.get('lonlat') is None for p in pins): warnings.append(f'{tag}: 경위도로 못 되돌린 핀 {sum(p.get("lonlat") is None for p in pins)}개')
    for it in (it for it in items if not it.get('pinNear')):
        hit = [p for p in pins if p.get('label') == it['pin']]
        if len(hit) != 1:
            warnings.append(f'{it["id"]}: {tag} 에서 번호 {it["pin"]} 핀을 {len(hit)}개 찾음(1개여야 함, 찾은 번호 {sorted(p["label"] for p in pins if "label" in p)})')
            continue
        out[it['id']] = {'xy': hit[0]['xy'], 'lonlat': hit[0]['lonlat']}
    labels = {p['label'] for p in pins if 'label' in p}
    # 같은 번호 핀 여럿: 번호 안에서 지명으로 짝(33쪽 07 동전 둘)
    for n in sorted({it['pin'] for it in items if it.get('pinNear') and it['pin'] in labels}):
        rows = [it for it in items if it.get('pinNear') and it['pin'] == n]
        targets = [p for p in pins if p.get('label') == n and p.get('lonlat')]
        _pair_near(rows, targets, places, default_km, f'{tag} 번호 {n} 핀', out, warnings, report)
    named = [it for it in items if it.get('pinNear') and it['pin'] not in labels]
    if named:
        targets = [p for p in pins if 'label' not in p and p.get('lonlat')]
        _pair_near(named, targets, places, default_km, f'{tag} 번호 없는 핀', out, warnings, report)
    return out, warnings, report


def _pair_near(named, targets, places, default_km, what, out, warnings, report):
    """pinNear 항목들 ↔ 후보 핀들: 지명과의 거리 합 최소 짝(assign.pair). 결과·경고·보고를 넘겨받은 목록에 더한다."""
    refs, rows = {}, []
    for it in named:
        ref, why = place_lonlat(it['pinNear'], places)
        if ref is None: warnings.append(f'{it["id"]}: pinNear — {why}'); continue
        refs[it['id']] = ref; rows.append(it)
    lim = lambda it: it.get('pinNearMaxKm', default_km)
    for it in rows:
        near = [p for p in targets if km(refs[it['id']], p['lonlat']) <= lim(it)]
        if len(near) > 1:
            warnings.append(f'{it["id"]}: 「{it["pinNear"]}」 {lim(it)}km 안에 핀이 {len(near)}개 — 모호함(pinNearMaxKm 을 줄이거나 지명을 바꿀 것)')
    pr = pair(rows, targets, lambda it, p: km(refs[it['id']], p['lonlat']), lambda it, p: True, miss=lambda it: 1e6)
    for i, it in enumerate(rows):
        if i not in pr: warnings.append(f'{it["id"]}: 짝지을 핀이 남지 않음({what} {len(targets)}개)'); continue
        p = targets[pr[i]]; d = km(refs[it['id']], p['lonlat'])
        if d > lim(it): warnings.append(f'{it["id"]}: 고른 핀이 「{it["pinNear"]}」에서 {d:.0f}km(상한 {lim(it)}km)')
        out[it['id']] = {'xy': p['xy'], 'lonlat': p['lonlat'], 'km': round(d)}
        report.append(f'{it["id"]}↔{it["pinNear"]} {d:.0f}km(≤{lim(it)})')


def assign_pins(items, c, root=ROOT):
    """설정 photos(c)의 핀 있는 사진들 → ({id: {xy, lonlat, km?}}, 경고, 보고)."""
    with open(os.path.join(root, c['placesFile']), encoding='utf-8') as f: places = json.load(f)
    by_map = {}
    for it in items:
        if 'pin' in it: by_map.setdefault(it['map'], []).append(it)
    pins = {mid: find_pins(mid, c['pins'][mid]) for mid in by_map}
    ll = node_lonlat({mid: [p['xy'] for p in ps] for mid, ps in pins.items()})
    for mid, ps in pins.items():
        for p, q in zip(ps, ll[mid]): p['lonlat'] = q
    out, warnings, report = {}, [], []
    for mid, its in by_map.items():
        o, w, r = match_pins(its, pins[mid], places, c['pinNearMaxKm'])
        out.update(o); warnings += w; report += r
    return out, warnings, report
