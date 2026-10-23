# © 2026 김용현
# scripts/atlas/continent_layers.py
"""대륙·대양 면(U1-3c·3d — Ⅰ 세계화 10·11쪽, 세계화 단원 전용: 설정 layers[id].type 'continents' 가 있을 때만 쓰임, 도장 입력 아님).

대륙(3c, 교사 Q5 A — 교과서 칠 그대로)
  10·11쪽은 나라를 대륙별 색으로 칠한 두 쪽 지도다(대륙마다 4~6 가지 옅은 색 — 아시아 주황, 유럽 회청, 아프리카 초록, 북아메리카 분홍,
  남아메리카 노랑, 오세아니아 연두, 남극 옅은 보라, 그린란드 회색). 나라 단위가 아니라 교과서 칠을 따른다:
  ① 나라 쪼개기 — 10·11쪽 자홍 점선(fills #ec008c — 점 하나 = 고리 하나, 우랄산맥–우랄강·캅카스·보스포루스–에게해·수에즈·뉴기니–티모르·파나마)을
     line_chains.chain 으로 이은 선 → 지도 fit 으로 되돌린 경위도 선(양 끝을 extendDeg 만큼 늘림)으로 그 선이 지나는 나라를 shapely split.
  ② 조각(쪼갠 조각 + 나라의 섬·속령 각각 = Natural Earth 50m 면 하나)마다 두 쪽 지면 래스터(PDF 렌더 dpi) 화소 표본 → Lab:
     조각을 지면에 찍은 면 ∩ 지도 틀(덮개 뺌)을 erodePt 만큼 줄인 안쪽 화소(줄인 면이 비거나 화소가 minPx 보다 적으면 zoomDpi 로 다시 렌더 +
     zoomErodePt — 「작은 나라·속령 확대」). 화소마다 가장 가까운 대륙 견본(ΔE76)이 de 안이면 그 대륙에 한 표(글자·강·국경·꼬리표 화소는 어느 견본과도
     멀어 표가 없음). 표 ≥ minVotes 이고 가장 많은 대륙이 받은 표의 minShare 를 넘으면 그 조각의 대륙.
     · 견본(prototypes) = 지역 상자(classes[].domain)가 하나뿐인 곳의 큰 조각(화소 ≥ protoMinPx, 중앙값 둘레 ΔE 3 안 화소 ≥ protoShare)의 중앙값 Lab 을
       대륙마다 모아 ΔE protoMergeDE 안은 하나로(화소 가중 평균). 대륙마다 옅은 색이 여럿이라 견본도 여럿.
     · 지역 상자는 표를 받을 수 있는 대륙을 거르는 거친 지리 조건이다(조각 대표점이 든 상자의 대륙만). 상자끼리 겹치는 곳(유럽–아시아–아프리카,
       북·남아메리카, 아시아–오세아니아, 북아메리카–오세아니아 하와이)은 색이 정한다. 상자가 필요한 까닭(실측): 오세아니아 섬나라 색 일부가 아프리카
       옅은 초록과 ΔE < 3(솔로몬 제도·피지), 그린란드 회색이 유럽 회청과 ΔE < 1 — 상자가 없으면 색만으로 가를 수 없다.
  ③ 나라마다: 대륙이 정해진 조각이 모두 같은 대륙이면 classes[iso] = 대륙(바탕 지도 나라 도형을 칠함). 대륙이 갈리면 그 나라는 classes 에서 빼고
     조각 면(대륙별로 합친 면 — 대륙을 못 정한 조각은 같은 나라의 가장 가까운 정한 조각을 따름)을 features 에. 한 조각도 못 정하면 분류 없음
     (그린란드 — 회색은 어느 대륙 견본과도 멀다, Q5 A). 설정 countryOverrides {iso: {cls|null, why}} 로 고침(why 필수 — 작은 나라·속령 확대 확인).
  ④ centers {cls: [lon, lat]} = 대륙 면의 넓이 가중 구면 중심(지구본 단추 회전 — U1-3f), names {cls: [나라 이름…]} = 10·11쪽 나라 이름 글자
     (설정 names.fonts·sizes — 글자 자리를 fit 으로 되돌려 그 자리 나라(없으면 가장 가까운 나라 nearKm 안)에 짝, 같은 나라 글자 여러 줄은 위→아래로 이음,
     설정 names.fix {iso: {name, why}}) 의 대륙별 가나다순(Q8).

대양(3d, 교사 Q7 A — 단순 경계, 내려받기 없음): --oceans 또는 설정 oceans 가 있을 때만(ocean_polygons).
  다섯 대양 = 경위도 꼴(설정 oceans.rules — 대서양·인도양 20°E, 인도양·태평양 147°E + 말레이 제도 바깥 꺾은선, 태평양·대서양 68°W(드레이크) — 파나마 지협·
  베링 해협은 육지라 저절로 갈림, 남극해 = 60°S 남쪽, 북극해 = 북극권(66.56°N) 북쪽 + 베링 해협·그린란드–아이슬란드–노르웨이 선) − Natural Earth 50m 육지
  (50m 나라 합집합). 대양끼리 겹치지 않게 차례로 뺌(북극해·남극해 먼저). 단순화 oceans.simplifyDeg. 극을 품는 북극해·남극해는 위도 띠로 만들어
  경도 −180~180 경계가 날짜변경선에 놓이고(앱은 d3 구면 — 극 꼭짓점 두 개는 polar_geom.polarPolygon 과 같은 뜻으로 ±180 을 잇는 변), 태평양은
  날짜변경선 양쪽 면을 +360 으로 이어 한 면.

출력 $ATLAS_WORK/geo/<id>.continents.json = 레이어 자료 그대로(build_layers.mjs 가 <config.out>/layer-<id>.json 으로 옮김):
  {type:'FeatureCollection', properties:{id, map, maps, page, title, kind, layerType:'continents', legend:[{cls, label, color}], classes:{iso: cls},
   centers:{cls:[lon, lat]}, names:{cls:[…]}, oceans?:[{cls, label}], report:{…}}, features:[{properties:{cls, iso}|{cls, ocean:true}, geometry}]}
  면은 d3 감김(바깥 고리 시계 방향 — 경도 x · 위도 y 평면에서), 좌표 소수 셋째 자리.

설정(단원 설정 layers[id]): {"type": "continents", "map": 왼쪽 지도, "maps": [왼쪽, 오른쪽], "classes": [{cls, label, color?, domain: [[w, s, e, n], …]}],
  "splitLines": {"fill", "gapPt", "extendDeg", "minDots"}, "sample": {dpi, erodePt, minPx, zoomDpi, zoomErodePt, de, minVotes, minShare,
  protoMinPx, protoShare, protoMergeDE}, "simplifyDeg", "countryOverrides", "names", "oceans"?}

CLI
  python -I scripts/atlas/continent_layers.py --unit u1 <레이어 id> [--oceans] [--verify <폴더>]
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import split as _split, unary_union
from shapely.affinity import translate

CLASS_KEYS = ('cls', 'label', 'domain')


# ── 기하(합성 시험 대상 — 지면·PDF 없이) ─────────────────────────────────────
def polys(g):
    """면 → [Polygon] (빈 것·면 아닌 것은 뺌)."""
    if g is None or g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    if hasattr(g, 'geoms'): return [p for q in g.geoms for p in polys(q)]
    return []


def in_boxes(pt, boxes):
    x, y = pt
    return any(b[0] <= x <= b[2] and b[1] <= y <= b[3] for b in boxes)


def allowed_classes(pt, classes):
    """경위도 점 → 그 점이 든 지역 상자(domain)의 대륙 cls 목록(설정 차례)."""
    return [c['cls'] for c in classes if in_boxes(pt, c.get('domain') or [])]


def extend_line(coords, deg):
    """경위도 꺾은선의 양 끝을 끝 방향으로 deg 만큼 늘인 새 점 목록(쪼개는 선이 해안에서 끝나도 나라 면을 끝까지 지나게)."""
    P = [tuple(map(float, p)) for p in coords]
    if len(P) < 2 or deg <= 0: return P
    def ext(a, b):   # b 에서 a→b 방향으로
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1.0
        return (b[0] + dx / n * deg, b[1] + dy / n * deg)
    return [ext(P[1], P[0])] + P + [ext(P[-2], P[-1])]


def snap_line(coords, borders, tol, step=0.05):
    """쪼개는 선(경위도)을 step° 마다 촘촘히 한 뒤, 육지 국경선(borders — 선 모음)에서 tol° 안인 꼭짓점을 국경 위 가장 가까운 점으로 옮김.
    교과서 점선이 국경을 따라가는 곳(러시아–카자흐스탄 국경)에서 fit·Natural Earth 국경 차(0.1~0.5°)로 생기는 가는 띠 조각을 없앤다.
    국경에서 먼 곳(우랄산맥)과 해안은 그대로(해안선에는 붙이지 않음 — 섬·만을 따라 꼬이지 않게)."""
    import shapely
    from shapely.ops import nearest_points
    L = shapely.segmentize(LineString(coords), step)
    if borders is None or borders.is_empty or tol <= 0: return list(L.coords)
    out = []
    for x, y in L.coords:
        pt = Point(x, y)
        q = nearest_points(borders, pt)[0] if borders.distance(pt) <= tol else pt
        if not out or (abs(out[-1][0] - q.x) > 1e-9 or abs(out[-1][1] - q.y) > 1e-9): out.append((q.x, q.y))
    return out


def merge_slivers(parts, min_area, width=0.0):
    """한 면을 선으로 자른 조각들 중 가는 조각(넓이 < min_area deg² 이거나 width° 띠보다 가늚 — 국경선 차로 생긴 띠, 파푸아 뉴기니 141°E 띠)을
    맞닿은 경계가 가장 긴 큰 조각에 합침."""
    if len(parts) < 2 or (min_area <= 0 and width <= 0): return parts
    thin = lambda p: p.area < min_area or (width > 0 and p.buffer(-width / 2).is_empty)
    big = [p for p in parts if not thin(p)]
    if not big: return parts
    for sm in [p for p in parts if thin(p)]:
        k = max(range(len(big)), key=lambda i: big[i].boundary.intersection(sm.boundary).length)
        big[k] = unary_union([big[k], sm])
    return [q for g in big for q in polys(g)]


def extend_to_sea(coords, land, step=0.25, max_deg=2.0):
    """쪼개는 선의 양 끝을 끝 방향으로 step° 씩, 끝이 육지(land) 밖으로 나갈 때까지(최대 max_deg) 늘임 — 국경에 붙인 선 끝이 육지 안에 머물러
    나라를 끝까지 지나지 못하는 것을 막음(우랄강 선 남쪽 끝 = 볼가 삼각주)."""
    P = [tuple(map(float, p)) for p in coords]
    if len(P) < 2: return P
    def grow(a, b):   # a→b 방향으로 b 를 늘인 점들
        dx, dy = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dy) or 1.0
        out, k = [], 1
        while k * step <= max_deg:
            q = (b[0] + dx / n * step * k, b[1] + dy / n * step * k)
            out.append(q)
            if land is None or not land.contains(Point(q)): break
            k += 1
        return out
    # 방향은 끝에서 조금 떨어진 점으로(촘촘히 한 선의 마지막 토막은 짧고 꺾일 수 있음)
    j = min(len(P) - 1, 10)
    head = grow(P[j], P[0]); tail = grow(P[-1 - j], P[-1])
    return head[::-1] + P + tail


def split_by_lines(geom, lines):
    """면(경위도) · [LineString] → 조각 [Polygon]. 선마다 그 선이 지나는 조각만 split(선이 면을 끝까지 지나야 나뉨 — 아니면 그대로)."""
    parts = polys(geom)
    for L in lines:
        nxt = []
        for p in parts:
            if not p.intersects(L): nxt.append(p); continue
            try: got = polys(_split(p, L))
            except Exception: got = [p]
            nxt.extend(got if got else [p])
        parts = nxt
    return parts


def unwrap_dateline(g):
    """면을 날짜변경선에서 이어 붙임: +180 에 닿는 면과 −180 에 닿는 면이 함께 있으면 −180 쪽 면들을 +360 옮겨 합친다(태평양 중심 지도에서 이음매 없게 —
    d3 는 경도 > 180 을 구면 그대로 받음). 없으면 그대로."""
    ps = polys(g)
    east = any(p.bounds[2] >= 179.999 for p in ps)
    west = [p for p in ps if p.bounds[0] <= -179.999]
    if not (east and west): return g
    moved = [translate(p, 360) if p.bounds[0] <= -179.999 else p for p in ps]
    return unary_union(moved)


def rewrap_dateline(g):
    """unwrap_dateline 으로 경도 > 180 까지 이은 면을 −180~180 으로 되접음(180° 에서 두 면 — 바탕 지도·다른 레이어와 같은 꼴). 앱 자르기
    (geoClip.clipIndexed)는 경도 > 180 좌표를 옮기지 않아 확대하면 그 쪽이 잘렸음(U1-3c 리뷰). 이음매는 d3 가 맡고, 한 Feature 의 두 면은
    한 번에 칠하므로 틈이 보이지 않음."""
    ps = polys(g)
    if not ps or max(p.bounds[2] for p in ps) <= 180: return g
    east = g.intersection(box(-180, -90, 180, 90))
    west = translate(g.intersection(box(180, -90, 540, 90)), -360)
    return MultiPolygon([q for q in polys(east) + polys(west) if not q.is_empty])


def lon_bbox(geoms):
    """경위도 면들 → 날짜변경선을 넘으면 동쪽 > 180 으로 편 상자 [w, s, e, n](경도 원 위에서 가장 넓은 빈 틈의 바깥 — fitBounds 대안용).
    빈 틈이 없으면(남극·북극해) 경도 −180~180."""
    iv, s_, n_ = [], 90.0, -90.0
    for g in geoms:
        for p in polys(g):
            x0, y0, x1, y1 = p.bounds
            s_, n_ = min(s_, y0), max(n_, y1)
            if x1 - x0 >= 360: iv.append((-180.0, 180.0)); continue
            a, b = ((x0 + 180) % 360) - 180, ((x0 + 180) % 360) - 180 + (x1 - x0)
            iv.extend([(a, min(b, 180.0))] + ([(-180.0, b - 360)] if b > 180 else []))
    if not iv: return None
    iv.sort(); merged = [list(iv[0])]
    for a, b in iv[1:]:
        if a <= merged[-1][1] + 1e-9: merged[-1][1] = max(merged[-1][1], b)
        else: merged.append([a, b])
    gaps = [(merged[i + 1][0] - merged[i][1], merged[i][1], merged[i + 1][0]) for i in range(len(merged) - 1)]
    gaps.append((merged[0][0] + 360 - merged[-1][1], merged[-1][1], merged[0][0] + 360))   # 180 을 건너는 틈
    size, g0, g1 = max(gaps)
    if size <= 1e-6: return [-180.0, round(s_, 2), 180.0, round(n_, 2)]
    w = g1 if g1 <= 180 else g1 - 360
    e = g0 if g0 >= w else g0 + 360
    return [round(w, 2), round(s_, 2), round(e, 2), round(n_, 2)]


def d3_wind(g):
    """shapely 면 → d3 감김(바깥 고리 시계 방향 — 경도 x · 위도 y 평면, 구멍 반시계)."""
    out = [orient(p, sign=-1.0) for p in polys(g)]
    return out[0] if len(out) == 1 else MultiPolygon(out)


def round_geom(g, nd=3):
    """d3 감김 + 소수 nd 자리 GeoJSON geometry(MultiPolygon) | None(격자에 맞추니 비면). 격자에 맞춘 뒤(set_precision — 반올림이 고리를 꼬지 않게)
    퇴화한 고리는 뺌. 자리 수: 대륙 조각 3(0.001° ≈ 0.1km — build_layers·바탕 지도와 같은 격자, 이웃 나라 바탕 면과 만나야 함),
    대양 2(설정 oceans.digits — 대양 면은 0.25~0.5° 로 단순화하고 고를 때만 옅게 칠하므로 0.01° 는 단순화 문턱보다 훨씬 작음, 용량 약 30% 줄임)."""
    import shapely
    g = shapely.set_precision(g, 10 ** -nd)
    if g.is_empty: return None
    out = []
    for p in polys(d3_wind(g)):
        ext = [[round(x, nd), round(y, nd)] for x, y in p.exterior.coords]
        if len({tuple(q) for q in ext}) < 3: continue
        holes = [[[round(x, nd), round(y, nd)] for x, y in r.coords] for r in p.interiors]
        out.append([ext] + [h for h in holes if len({tuple(q) for q in h}) >= 3])
    return {'type': 'MultiPolygon', 'coordinates': out} if out else None


def sphere_center(geoms):
    """경위도 면들 → 넓이 가중 구면 중심 [lon, lat](조각마다 평면 중심의 단위 벡터 × cos 위도 넓이 합 — 지구본 회전용 어림)."""
    v = np.zeros(3)
    for g in geoms:
        for p in polys(g):
            c = p.centroid
            lon, lat = math.radians(c.x), math.radians(c.y)
            w = p.area * max(math.cos(lat), 0.02)
            v += w * np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    n = np.linalg.norm(v)
    if n == 0: return None
    v /= n
    lon = math.degrees(math.atan2(v[1], v[0])); lat = math.degrees(math.asin(max(-1.0, min(1.0, v[2]))))
    return [round(lon, 2), round(lat, 2)]


# ── 색 ──────────────────────────────────────────────────────────────────
def lab_of(rgb):
    from atlas_common import lab
    return lab(np.asarray(rgb, float))


def nearest_proto(labs, protos, allowed):
    """화소 Lab (N×3) · 견본 [{cls, lab}] · 허용 cls → (cls 배열(견본 없음 None), ΔE 배열). 허용 견본이 없으면 모두 None·inf."""
    P = [p for p in protos if p['cls'] in allowed]
    n = len(labs)
    if not P or not n: return np.array([None] * n, dtype=object), np.full(n, np.inf)
    L = np.asarray([p['lab'] for p in P], float)
    d = np.linalg.norm(np.asarray(labs, float)[:, None, :] - L[None, :, :], axis=2)
    j = d.argmin(1)
    return np.array([P[k]['cls'] for k in j], dtype=object), d[np.arange(n), j]


def vote(labs, protos, allowed, de, min_votes, min_share):
    """조각 화소 → (대륙 | None, 표 {cls: 수}). ΔE ≤ de 인 화소만 한 표, 표 < min_votes 거나 1위 몫 ≤ min_share 면 None."""
    cls, d = nearest_proto(labs, protos, allowed)
    ok = d <= de
    votes = {}
    for c in cls[ok]: votes[c] = votes.get(c, 0) + 1
    n = int(ok.sum())
    if n < min_votes: return None, votes
    best = max(votes, key=lambda c: (votes[c], -allowed.index(c) if c in allowed else 0))
    return (best if votes[best] > min_share * n else None), votes


def far_class(med, protos, allowed, far_de, margin):
    """표가 모자란 조각(교과서 옅은 색이 견본에 없음 — 겹치는 지역 상자에만 있는 색)의 둘째 길: 화소 중앙값 Lab 에서 대륙마다 가장 가까운 견본 ΔE →
    1위 ≤ far_de 이고 2위 대륙과 margin 이상 떨어졌으면(허용 대륙이 하나면 1위만) 그 대륙. → (cls | None, 1위 ΔE | None)"""
    best = {}
    for p in protos:
        if p['cls'] not in allowed: continue
        d = float(np.linalg.norm(np.subtract(med, p['lab'])))
        best[p['cls']] = min(d, best.get(p['cls'], np.inf))
    if not best: return None, None
    r = sorted(best.items(), key=lambda kv: kv[1])
    if r[0][1] > far_de: return None, round(r[0][1], 1)
    if len(r) > 1 and r[1][1] - r[0][1] < margin: return None, round(r[0][1], 1)
    return r[0][0], round(r[0][1], 1)


def merge_protos(cands, merge_de):
    """견본 후보 [{cls, lab, px, src}] → 대륙마다 ΔE merge_de 안을 하나로(화소 가중 평균 — 큰 것부터). 결과 [{cls, lab, px, src:[…]}]."""
    out = []
    for c in sorted(cands, key=lambda q: -q['px']):
        for o in out:
            if o['cls'] == c['cls'] and np.linalg.norm(np.subtract(o['lab'], c['lab'])) <= merge_de:
                w = o['px'] + c['px']
                o['lab'] = ((np.asarray(o['lab']) * o['px'] + np.asarray(c['lab']) * c['px']) / w).tolist()
                o['px'] = w; o['src'].append(c['src'])
                break
        else:
            out.append({'cls': c['cls'], 'lab': list(map(float, c['lab'])), 'px': c['px'], 'src': [c['src']]})
    return out


# ── 조각 → 나라 대륙 ─────────────────────────────────────────────────────
def assemble(parts, overrides=None):
    """parts [{iso, geom(경위도), cls|None, cut?, domainCls?}] → (classes {iso: cls}, pieces [{iso, cls, geom, mode}], report).
    · 나라의 정한 조각(cls)이 모두 같은 대륙이면 classes[iso]. 못 정한 조각은 같은 나라의 가장 가까운 정한 조각을 따름.
    · 정한 조각이 하나도 없으면: 색을 읽은 조각(readable)이 있으면 분류 없음(그린란드 회색), 없으면 domainCls(색을 읽을 수 없는 아주 작은 섬 —
      지역 상자 하나뿐)로, 그것도 없으면 분류 없음.
    · 대륙이 갈리면: 선으로 자른 조각(cut)이 없으면(섬·속령 단위 — 하와이·기아나) 넓이가 가장 큰 대륙을 classes[iso] 에 두고 나머지 대륙만
      조각 면(mode 'parts' — 앱이 바탕 지도 나라의 섬 면을 그 조각에 든 것끼리 칠함), 선으로 자른 조각이 있으면(러시아) classes 에서 빼고
      대륙마다 조각 면(mode 'geom' — 앱이 그 면을 그림).
    overrides {iso: {cls|None, why}} 가 먼저(why 없으면 ValueError)."""
    overrides = {k: v for k, v in (overrides or {}).items() if not k.startswith('_')}
    for iso, o in overrides.items():
        if not (o or {}).get('why'): raise ValueError(f'countryOverrides {iso}: 까닭(why)이 없음')
    by = {}
    for p in parts: by.setdefault(p['iso'], []).append(p)
    classes, pieces = {}, []
    rep = {'unclassified': [], 'split': {}, 'inherited': {}, 'overridden': [], 'domainOnly': []}
    for iso in sorted(by):
        ps = by[iso]
        if iso in overrides:
            c = overrides[iso].get('cls')
            if c: classes[iso] = c
            rep['overridden'].append(iso)
            continue
        key = 'cls'
        known = [p for p in ps if p['cls']]
        if not known and any(p.get('readable') for p in ps):   # 색을 읽었는데 어느 대륙 견본과도 멂(그린란드 회색) — 지역 상자로 메우지 않음
            rep['unclassified'].append(iso); continue
        if not known:
            known = [p for p in ps if p.get('domainCls')]; key = 'domainCls'
            if not known: rep['unclassified'].append(iso); continue
            rep['domainOnly'].append(iso)
        kinds = sorted({p[key] for p in known})
        groups = {k: [] for k in kinds}
        ids = {id(p) for p in known}
        for p in ps:
            if id(p) in ids: groups[p[key]].append(p['geom']); continue
            near = min(known, key=lambda q: q['geom'].distance(p['geom']))
            groups[near[key]].append(p['geom'])
            rep['inherited'][iso] = rep['inherited'].get(iso, 0) + 1
        if len(kinds) == 1:
            classes[iso] = kinds[0]
            continue
        rep['split'][iso] = kinds
        if not any(p.get('cut') for p in ps):
            area = {k: sum(g.area for g in groups[k]) for k in kinds}
            main = max(kinds, key=lambda k: area[k])
            classes[iso] = main
            for k in kinds:
                if k != main: pieces.append({'iso': iso, 'cls': k, 'geom': unary_union(groups[k]), 'mode': 'parts'})
        else:
            for k in kinds: pieces.append({'iso': iso, 'cls': k, 'geom': unary_union(groups[k]), 'mode': 'geom'})
    return classes, pieces, rep


# ── 지면(PDF·fit) ───────────────────────────────────────────────────────
def load_fit(mid):
    from atlas_common import WORK
    with open(os.path.join(WORK, 'geo', f'{mid}.fit.json'), encoding='utf-8') as f: return json.load(f)


def cut_halves(fit):
    """fit 중심 경도 → 투영 가장자리(중심 − 180°)에서 나눈 경위도 상자 둘(가장자리를 걸친 면이 지도 너비를 가로지르지 않게)."""
    lon0 = ((fit['params'][0] + 360) % 360) - 180
    return [box(-180, -90, lon0 - 1e-4, 90), box(lon0 + 1e-4, -90, 180, 90)]


def project_parts(fit, geoms):
    """[경위도 면] → [지면 면 | None] (투영 가장자리에서 반으로 나눠 각각 찍고 합침 — fit_helper.mjs 한 번)."""
    from shape_controls import node
    from atlas_common import polygonal
    halves = cut_halves(fit)
    rings, idx = [], []
    def wrap(g):   # 날짜변경선에서 이어 붙인 면(경도 > 180 — 태평양·러시아 아시아 조각)을 −180~180 으로 되접음
        if g.bounds[2] <= 180: return g
        return unary_union([g.intersection(box(-180, -90, 180, 90)), translate(g.intersection(box(180, -90, 540, 90)), -360)])
    geoms = [wrap(g) for g in geoms]
    for i, g in enumerate(geoms):
        for h, hb in enumerate(halves):
            for k, p in enumerate(polys(g.intersection(hb))):
                for R in [p.exterior, *p.interiors]:
                    rings.append([list(c) for c in R.coords]); idx.append((i, h, k))
    res = node([{'op': 'apply', 'fit': fit, 'rings': rings}])[0] if rings else []
    acc = {}
    for (i, h, k), xy in zip(idx, res):
        acc.setdefault(i, {}).setdefault((h, k), []).append([q for q in xy if q])
    out = []
    for i in range(len(geoms)):
        got = []
        for rs in acc.get(i, {}).values():
            if len(rs[0]) < 4: continue
            q = polygonal(Polygon(rs[0], [r for r in rs[1:] if len(r) >= 4]).buffer(0))
            if q is not None: got.append(q)
        out.append(unary_union(got) if got else None)
    return out


def invert_points(fit, pts):
    from shape_controls import node
    return node([{'op': 'invert', 'fit': fit, 'pts': [list(map(float, p)) for p in pts]}])[0] if pts else []


def split_lines(cfg, mps):
    """설정 splitLines → [{map, page:[[x, y]…], ll:[[lon, lat]…]}] (지도마다 자홍 점 고리 → 이은 선 → fit 으로 되돌림, 양 끝 늘임)."""
    from atlas_common import drawings, hexc, rings
    from line_chains import chain
    sc = cfg.get('splitLines') or {}
    if not sc: return []
    out = []
    for mid in cfg['maps']:
        m = mps[mid]; fit = load_fit(mid)
        x0, y0, x1, y1 = m['bbox']
        dots = []
        for d in drawings(m['page']):
            if d.get('fill') is None or hexc(d['fill']) != sc['fill']: continue
            for R in rings(d):
                c = np.asarray(R, float).mean(0)
                if x0 <= c[0] <= x1 and y0 <= c[1] <= y1: dots.append(c)
        for L in chain([(c, c) for c in dots], sc.get('gapPt', 6)):
            if len(L) < sc.get('minDots', 4): continue
            ll = [p for p in invert_points(fit, [list(q) for q in L]) if p]
            if len(ll) < 2: continue
            out.append({'map': mid, 'page': np.round(np.asarray(L, float), 2).tolist(), 'll0': [[round(a, 4), round(b, 4)] for a, b in ll],
                        'll': [[round(a, 4), round(b, 4)] for a, b in extend_line(ll, sc.get('extendDeg', 0.5))]})
    return out


class Raster:
    """쪽 렌더(PDF → RGB 배열, 쪽 번호·dpi·잘라 낸 상자별 한 번)."""
    def __init__(self): self._c = {}

    def get(self, pno, dpi, clip=None):
        import pdfkit, fitz
        key = (pno, dpi, tuple(np.round(clip, 2)) if clip is not None else None)
        if key not in self._c:
            page = pdfkit.doc()[pno - 1]
            pm = page.get_pixmap(dpi=dpi, clip=fitz.Rect(*clip) if clip is not None else None, alpha=False)
            arr = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].copy()
            self._c[key] = (arr, clip[0] if clip is not None else 0.0, clip[1] if clip is not None else 0.0)
        return self._c[key]


def mask_pixels(arr, ox, oy, scale, geom):
    """RGB 배열(왼쪽 위 = 지면 (ox, oy), 1pt = scale 화소) 중 지면 면 geom 안 화소 → N×3."""
    from PIL import Image, ImageDraw
    ps = polys(geom)
    if not ps: return np.zeros((0, 3), np.uint8)
    H, W = arr.shape[:2]
    bx0, by0, bx1, by1 = unary_union(ps).bounds
    c0, r0 = max(0, int((bx0 - ox) * scale) - 1), max(0, int((by0 - oy) * scale) - 1)
    c1, r1 = min(W, int((bx1 - ox) * scale) + 2), min(H, int((by1 - oy) * scale) + 2)
    if c1 <= c0 or r1 <= r0: return np.zeros((0, 3), np.uint8)
    mk = Image.new('L', (c1 - c0, r1 - r0), 0); dr = ImageDraw.Draw(mk)
    tr = lambda cs: [((x - ox) * scale - c0, (y - oy) * scale - r0) for x, y in cs]
    for p in ps:
        dr.polygon(tr(p.exterior.coords), fill=1)
        for r in p.interiors: dr.polygon(tr(r.coords), fill=0)
    m = np.asarray(mk, bool)
    return arr[r0:r1, c0:c1][m]


def part_pixels(page_geoms, mps, cs, raster):
    """조각의 지도별 지면 면 {map: 면} → (화소 RGB N×3, 확대 여부, raw 여부). 면 ∩ 지도 틀을 erodePt 줄여 dpi 렌더에서, 화소가 minPx 보다 적으면
    zoomDpi 로 그 조각 상자만 다시 렌더해 zoomErodePt 로(그래도 비면 줄이지 않고 — raw)."""
    from atlas_common import frame, polygonal
    def take(dpi, erode, zoom):
        got = []
        for mid, P in page_geoms.items():
            if P is None: continue
            m = mps[mid]
            Q = polygonal(P.intersection(frame(m)))
            if Q is None: continue
            if erode > 0: Q = polygonal(Q.buffer(-erode))
            if Q is None: continue
            if zoom:
                b = Q.bounds
                arr, ox, oy = raster.get(m['page'], dpi, [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1])
            else:
                arr, ox, oy = raster.get(m['page'], dpi)
            got.append(mask_pixels(arr, ox, oy, dpi / 72, Q))
        return np.vstack(got) if got else np.zeros((0, 3), np.uint8)
    px = take(cs['dpi'], cs['erodePt'], False)
    if len(px) >= cs['minPx']: return px, False, False
    px = take(cs['zoomDpi'], cs['zoomErodePt'], True)
    if len(px): return px, True, False
    return take(cs['zoomDpi'], 0, True), True, True   # 줄이면 사라지는 아주 작은 섬은 줄이지 않고(국경·바다 화소가 섞임 — 색을 읽었다고 보지 않음)


# ── 지면 나라 이름(Q8) ───────────────────────────────────────────────────
def page_names(cfg, mps, ko_iso):
    """설정 names {fonts, sizes:[lo, hi], alias:{글자(띄어쓰기 뺌): {iso, cls?, name?, why}}} · {NAME_KO(띄어쓰기 뺌): iso} → ([{iso, cls?, name}], 보고).
    10·11쪽 나라 이름 글자 조각마다 Natural Earth 한글 이름(NAME_KO)·별칭과 글자로 짝짓는다(글자 자리는 이웃 나라 위에 놓인 것이 많아 쓰지 않음).
    짝이 없는 조각은 바로 아래 줄 조각(크기 같음·가운데 x 가 글자 폭 반 안·줄 간격 1.6 배 안)과 이어 붙여 다시 찾는다(「코트디 / 부아르」·
    「중앙아프리카 / 공화국」·「콩고 / 민주 공화국」). 글자마다 띄운 「러 시 아」는 붙임. 이름 = NAME_KO 와 같으면 NAME_KO 띄어쓰기, 별칭이면 alias.name
    또는 지면 글자. 같은 이름 두 번(가름선 겹침 띠)은 하나."""
    import pdfkit
    nc = cfg.get('names') or {}
    if not nc: return [], {}
    lo, hi = nc.get('sizes', [3.5, 9.5])
    fonts = nc.get('fonts', ['KCCChassam'])
    alias = {}
    for k, v in (nc.get('alias') or {}).items():
        if k.startswith('_'): continue
        if not v.get('why'): raise ValueError(f'names.alias {k}: 까닭(why)이 없음')
        alias[k.replace(' ', '')] = v
    norm = lambda t: t.replace(' ', '')
    def look(t):
        n = norm(t)
        if n in alias and alias[n].get('skip'): return {'skip': True}
        if n in alias: a = alias[n]; return {'iso': a['iso'], **({'cls': a['cls']} if a.get('cls') else {}), 'name': a.get('name', t)}
        if n in ko_iso: iso, name = ko_iso[n]; return {'iso': iso, 'name': name}
        return None
    out, seen, rep = [], set(), {'unmatched': [], 'joined': []}
    for mid in cfg['maps']:
        m = mps[mid]; x0, y0, x1, y1 = m['bbox']
        sp = [s for s in pdfkit.page_spans(m['page']) if any(f in s['font'] for f in fonts) and lo <= s['size'] <= hi]
        sp = [s for s in sp if x0 <= (s['bbox'][0] + s['bbox'][2]) / 2 <= x1 and y0 <= (s['bbox'][1] + s['bbox'][3]) / 2 <= y1]
        texts = []
        for s in sp:
            t = s['text'].strip(); parts = t.split(' ')
            if len(parts) > 1 and all(len(q) == 1 for q in parts): t = ''.join(parts)
            texts.append(t)
        used = set()
        for i, s in enumerate(sp):
            if i in used: continue
            if any('ㄱ' <= ch <= 'ㅎ' for ch in texts[i]): continue   # 초성 꼬리표(「ㅇㅅㅇ 대륙」 — 맞히기, 나라 이름 아님)
            hit = None
            if True:   # 아래 줄 조각과 이어 붙인 이름을 먼저(「콩고 / 민주 공화국」 — 「콩고」만으로도 짝이 있음)
                b = s['bbox']; cx = (b[0] + b[2]) / 2; w = b[2] - b[0]
                for j, s2 in enumerate(sp):
                    if j == i or j in used or abs(s2['size'] - s['size']) > 0.2: continue
                    b2 = s2['bbox']
                    if not (0 < b2[1] - b[1] <= 1.6 * s['size']) or abs((b2[0] + b2[2]) / 2 - cx) > max(w, b2[2] - b2[0]) / 2: continue
                    for joined in (texts[i] + texts[j], texts[i] + ' ' + texts[j]):
                        hit = look(joined)
                        if hit: used.add(j); rep['joined'].append(joined); break
                    if hit: break
            if hit is None: hit = look(texts[i])
            if hit is None: rep['unmatched'].append(texts[i]); continue
            if hit.get('skip'): continue
            key = (hit['iso'], hit.get('cls'), hit['name'])
            if key in seen: continue
            seen.add(key); out.append(hit)
    return out, rep


# ── 지도 하나 ────────────────────────────────────────────────────────────
NE_COUNTRIES = 'raw/ne/ne_50m_admin_0_countries.geojson'
SAMPLE_DEFAULTS = {'dpi': 200, 'erodePt': 1.0, 'minPx': 40, 'zoomDpi': 1200, 'zoomErodePt': 0.25, 'de': 6.0, 'minVotes': 12,
                   'minShare': 0.5, 'protoMinPx': 400, 'protoShare': 0.6, 'protoMergeDE': 2.0, 'farDE': 16.0, 'farMargin': 8.0, 'darkL': 60.0}


def ne_countries():
    from atlas_common import WORK
    with open(os.path.join(WORK, NE_COUNTRIES), encoding='utf-8') as f:
        return [(ft['properties']['ADM0_A3'], ft['properties'].get('NAME_KO'), shape(ft['geometry'])) for ft in json.load(f)['features']]


def classify_continents(cfg, mps, raster=None, log=print):
    """설정 → (parts [{iso, geom, cls, votes, px, zoom, allowed}], protos, lines, stats)."""
    cs = {**SAMPLE_DEFAULTS, **(cfg.get('sample') or {})}
    classes = cfg['classes']
    raster = raster or Raster()
    lines = split_lines(cfg, mps)
    snap_deg = (cfg.get('splitLines') or {}).get('snapDeg', 0)
    if snap_deg:   # 선 둘레 나라끼리 맞닿은 육지 국경(같은 50m 면의 공유 변 — 바탕·조각 면과 꼭 같은 선)에 붙임
        countries = [g for _, _, g in ne_countries()]
        for l in lines:
            raw = LineString(l['ll0'])
            near = [g for g in countries if g.distance(raw) <= snap_deg]
            borders = unary_union([a.boundary.intersection(b.boundary) for i, a in enumerate(near) for b in near[i + 1:] if a.intersects(b)])
            borders = unary_union([q for q in getattr(borders, 'geoms', [borders]) if q.geom_type in ('LineString', 'MultiLineString')]) if not borders.is_empty else None
            sn = snap_line(l['ll0'], borders, snap_deg)
            land = unary_union([g for g in countries if g.distance(LineString(sn)) <= 2.0])
            l['ll'] = [[round(a, 4), round(b, 4)] for a, b in extend_to_sea(sn, land)]
    Ls = [LineString(l['ll']) for l in lines]
    parts = []
    for iso, ko, g in ne_countries():
        for q in polys(g):
            sl = cfg.get('splitLines') or {}
            got = merge_slivers(split_by_lines(q, Ls), sl.get('sliverDeg2', 0), sl.get('sliverWidthDeg', 0))
            for p in got:
                parts.append({'iso': iso, 'ko': ko, 'geom': p, 'cut': len(got) > 1,
                              'allowed': allowed_classes(tuple(p.representative_point().coords[0]), classes)})
    page = {mid: project_parts(load_fit(mid), [p['geom'] for p in parts]) for mid in cfg['maps']}
    for i, p in enumerate(parts):
        p['page'] = {mid: page[mid][i] for mid in cfg['maps']}
        rgb, zoom, raw = part_pixels(p['page'], mps, cs, raster)
        p['lab'] = lab_of(rgb) if len(rgb) else np.zeros((0, 3))
        p['px'] = len(rgb); p['zoom'] = zoom; p['raw'] = raw
    # 견본: 지역 상자가 하나뿐인 큰 조각의 중앙값(둘레 ΔE 3 안 화소가 protoShare 이상 — 한 색으로 칠한 조각)
    cands, spread = [], []
    excl = {k for k, v in (cs.get('protoExclude') or {}).items() if not k.startswith('_')}
    for k in excl:
        if not (cs['protoExclude'][k] or '').strip(): raise ValueError(f'sample.protoExclude {k}: 까닭이 없음')
    for p in parts:
        if len(p['allowed']) != 1 or p['px'] < cs['protoMinPx'] or p['iso'] in excl: continue
        med = np.median(p['lab'], 0)
        d = np.linalg.norm(p['lab'] - med, axis=1)
        share = float((d <= 3).mean())
        if share < cs['protoShare']: continue
        cands.append({'cls': p['allowed'][0], 'lab': med.tolist(), 'px': p['px'], 'src': p['iso']})
        spread.append(d)
    protos = merge_protos(cands, cs['protoMergeDE'])
    allp = np.concatenate(spread) if spread else np.zeros(0)
    stats = {'protoPixelDE': {q: round(float(np.percentile(allp, q)), 2) for q in (50, 75, 90, 95, 99)} if len(allp) else {},
             'protoCandidates': len(cands), 'protos': len(protos)}
    # 대륙끼리 가장 가까운 견본(지역 상자가 겹치는 짝만 — 색으로 가르는 곳)
    over = []
    for a in classes:
        for b in classes:
            if a['cls'] >= b['cls']: continue
            if not any(box(*x).intersects(box(*y)) for x in a.get('domain') or [] for y in b.get('domain') or []): continue
            ds = [float(np.linalg.norm(np.subtract(pa['lab'], pb['lab']))) for pa in protos if pa['cls'] == a['cls'] for pb in protos if pb['cls'] == b['cls']]
            if ds: over.append({'pair': [a['cls'], b['cls']], 'minDE': round(min(ds), 2)})
    stats['overlapMinDE'] = sorted(over, key=lambda o: o['minDE'])
    for p in parts:
        p['cls'], p['votes'] = vote(p['lab'], protos, p['allowed'], cs['de'], cs['minVotes'], cs['minShare']) if p['allowed'] else (None, {})
        if p['cls'] is None and p['allowed'] and p['px'] >= cs['minVotes']:
            p['cls'], p['far'] = far_class(np.median(p['lab'], 0), protos, p['allowed'], cs['farDE'], cs['farMargin'])
        # 색을 읽을 수 없는 조각(화소가 모자라거나 중앙값이 어두움 — 아주 작은 섬은 국경 테두리 덩어리로만 찍힘)은 지역 상자가 하나뿐이면 그 대륙(domainOnly).
        # 색을 읽을 수 있는데 어느 견본과도 먼 조각(그린란드 회색)은 그대로 분류 없음.
        if p['cls'] is None and p['allowed'] and cfg.get('vectorFill'):
            p['cls'], p['fill'] = fill_class(p['page'], mps, cfg['vectorFill'], protos, p['allowed'])
        p['readable'] = not p['raw'] and p['px'] >= cs['minVotes'] and float(np.median(p['lab'], 0)[0]) >= cs['darkL']
        if p['cls'] is None and len(p['allowed']) == 1 and not p['readable']:
            p['domainCls'] = p['allowed'][0]   # 나라 전체에 색을 읽은 조각이 하나도 없을 때만 씀(assemble)
    for po in cfg.get('partOverrides') or []:   # 조각 고침 {iso, box:[w, s, e, n], cls|null, why} — 대표점이 상자 안인 그 나라 조각
        if not po.get('why'): raise ValueError(f"partOverrides {po.get('iso')}: 까닭(why)이 없음")
        hit = [p for p in parts if p['iso'] == po['iso'] and in_boxes(tuple(p['geom'].representative_point().coords[0]), [po['box']])]
        if not hit: raise ValueError(f"partOverrides {po['iso']} {po['box']}: 맞는 조각이 없음")
        for p in hit: p['cls'] = po.get('cls'); p['partOverride'] = True
    return parts, protos, lines, stats


def fill_class(page_geoms, mps, vf, protos, allowed):
    """아주 작은 섬의 둘째 길(래스터가 국경 그림자 덩어리로만 찍힌 곳): 조각 지면 면(bufferPt 늘림)과 겹치는 벡터 채움(설정 vectorFill.ignore 색·
    maxRectPt2 보다 큰 채움은 뺌) 중 상자가 가장 작은 것의 색 → far_class(fillDE, fillMargin — 벡터 색은 잡음이 없어 문턱이 넓음). → (cls | None, 색 | None)"""
    from atlas_common import drawings, hexc, lab_hex as lh
    ign = {c.lower() for c in vf.get('ignore') or []}
    best = None
    for mid, P in page_geoms.items():
        if P is None: continue
        Q = P.buffer(vf.get('bufferPt', 0.3))
        bx = box(*Q.bounds)
        for d in drawings(mps[mid]['page']):
            if d.get('fill') is None: continue
            r = d['rect']
            if r.width * r.height > vf.get('maxRectPt2', 25): continue
            h = hexc(d['fill'])
            if h.lower() in ign: continue
            rb = box(r.x0, r.y0, r.x1, r.y1)
            if not rb.intersects(bx) or not rb.intersects(Q): continue
            a = r.width * r.height
            if best is None or a < best[0]: best = (a, h)
    if best is None: return None, None
    c, _ = far_class(lh(best[1]), protos, allowed, vf.get('fillDE', 25.0), vf.get('fillMargin', 10.0))
    return c, best[1]


def lab_hex(L):
    """Lab → '#rrggbb'(D65 sRGB, 잘라 냄)."""
    L, a, b = L
    fy = (L + 16) / 116; fx = fy + a / 500; fz = fy - b / 200
    inv = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    X, Y, Z = inv(fx) * 0.95047, inv(fy), inv(fz) * 1.08883
    M = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    rgb = M @ np.array([X, Y, Z])
    rgb = np.where(rgb > 0.0031308, 1.055 * np.power(np.clip(rgb, 0, None), 1 / 2.4) - 0.055, 12.92 * rgb)
    return '#' + ''.join(f'{int(round(min(1, max(0, v)) * 255)):02x}' for v in rgb)


def build(layer_id, oceans=False, log=print):
    from atlas_common import layer_config, maps
    cfg = layer_config(layer_id)
    if cfg.get('type') != 'continents': raise ValueError(f'{layer_id}: type 이 continents 가 아님')
    mps = maps()
    for mid in cfg['maps']:
        if mid not in mps: raise KeyError(f'{layer_id}: 지도 목록에 {mid} 없음')
    parts, protos, lines, stats = classify_continents(cfg, mps, log=log)
    classes, pieces, rep = assemble(parts, cfg.get('countryOverrides'))
    tol = cfg.get('simplifyDeg', 0.02)
    order = [c['cls'] for c in cfg['classes']]
    # 범례 색 = 설정 color, 없으면 그 대륙 견본 중 화소가 가장 많은 것
    legend = []
    for c in cfg['classes']:
        ps = sorted([p for p in protos if p['cls'] == c['cls']], key=lambda q: -q['px'])
        legend.append({'cls': c['cls'], 'label': c['label'], 'color': c.get('color') or (lab_hex(ps[0]['lab']) if ps else '#cccccc')})
    geo_of = {}
    for iso, ko, g in ne_countries(): geo_of[iso] = (ko, g)
    feats = []
    for pc in sorted(pieces, key=lambda q: (q['iso'], order.index(q['cls']))):
        g = rewrap_dateline(unwrap_dateline(pc['geom']).simplify(tol, preserve_topology=True))   # 이어서 단순화(180° 양쪽이 같게) → 되접음
        geom = round_geom(g)
        if geom is None: continue
        feats.append({'type': 'Feature', 'properties': {'cls': pc['cls'], 'iso': pc['iso'], 'mode': pc['mode']}, 'geometry': geom})
    by_cls = {k: [] for k in order}
    minor = {}   # 섬 단위 조각(parts)은 본토 대륙 넓이·상자에서 뺌(프랑스 기아나·레위니옹이 유럽 상자를 남아메리카·인도양까지 넓히지 않게)
    for pc in pieces:
        if pc['mode'] == 'parts': minor.setdefault(pc['iso'], []).append(pc['geom'])
    for iso, c in classes.items():
        if iso in geo_of and c in by_cls:
            g = geo_of[iso][1]
            by_cls[c].append(g.difference(unary_union(minor[iso]).buffer(1e-6)) if iso in minor else g)
    for pc in pieces: by_cls[pc['cls']].append(pc['geom'])
    centers = {k: sphere_center([unwrap_dateline(g) for g in v]) for k, v in by_cls.items() if v}
    bounds = {k: lon_bbox(v) for k, v in by_cls.items() if v}
    hits, nrep = page_names(cfg, mps, {ko.replace(' ', ''): (iso, ko) for iso, (ko, g) in geo_of.items() if ko})
    geom_cls = {}
    for pc in pieces:
        if pc['mode'] == 'geom': geom_cls.setdefault(pc['iso'], []).append(pc['cls'])
    name_sets = {k: set() for k in order}
    nrep['unclassified'] = []
    for h in hits:   # 별칭에 대륙이 있으면 그것(기아나(프) — 프랑스 본토는 유럽), 없으면 그 나라 대륙(쪼갠 러시아는 두 대륙 모두)
        ks = [h['cls']] if h.get('cls') else [classes[h['iso']]] if h['iso'] in classes else geom_cls.get(h['iso'], [])
        if not ks: nrep['unclassified'].append(h['name']); continue
        for k in ks: name_sets[k].add(h['name'])
    name_list = {k: sorted(v) for k, v in name_sets.items()}
    names = hits
    m0 = mps[cfg['map']]
    rep.update(stats)
    rep['protos'] = [{'cls': p['cls'], 'lab': [round(v, 1) for v in p['lab']], 'hex': lab_hex(p['lab']), 'px': p['px'], 'src': p['src']} for p in protos]
    rep['lines'] = [{'map': l['map'], 'dots': len(l['page']), 'from': l['ll'][0], 'to': l['ll'][-1]} for l in lines]
    rep['_lines'] = lines
    rep['parts'] = len(parts)
    rep['zoomed'] = sum(1 for p in parts if p['zoom'])
    rep['noDomain'] = sorted({p['iso'] for p in parts if not p['allowed']})
    rep['names'] = {'matched': len(names), **nrep}
    rep['votes'] = {f"{p['iso']}#{k}": {**p['votes'], 'px': p['px'], 'zoom': p['zoom'], 'cls': p['cls'], 'rep': [round(v, 2) for v in p['geom'].representative_point().coords[0]],
                                         **({'far': p['far']} if p.get('far') is not None else {}), **({'domainCls': p['domainCls']} if p.get('domainCls') else {})}
                    for k, p in enumerate(parts)}
    rep['far'] = sorted({p['iso'] for p in parts if p.get('far') is not None and p['cls'] and not p.get('domainOnly')})
    rep['vectorFill'] = sorted({f"{p['iso']}:{p['fill']}:{p['cls']}" for p in parts if p.get('fill')})
    rep['partOverrides'] = [{'iso': p['iso'], 'cls': p['cls']} for p in parts if p.get('partOverride')]
    props = {'id': layer_id, 'map': cfg['map'], 'maps': cfg['maps'], 'page': m0['page'], 'title': cfg.get('title') or m0['title'], 'kind': m0.get('kind'),
             'layerType': 'continents', 'legend': legend, 'classes': dict(sorted(classes.items())),
             'centers': centers, 'bounds': bounds, 'names': name_list}
    if oceans or cfg.get('oceans'):
        oc, ofeats, orep = build_oceans(cfg)
        props['oceans'] = oc; feats.extend(ofeats); rep['oceans'] = orep
        for o in oc:
            if o.get('center'): centers[o['cls']] = o.pop('center')
            if o.get('bbox'): bounds[o['cls']] = o.pop('bbox')
    return {'type': 'FeatureCollection', 'properties': props, 'features': feats}, rep


def ocean_cut_lines(rules):
    """설정 oceans.rules → 자르는 선 [LineString](경위도). 위선(lat)은 −180~180 을 1° 마다, 꺾은선(line)은 그대로."""
    out = []
    for r in rules:
        if 'lat' in r: out.append(LineString([(x, r['lat']) for x in range(-180, 181)]))
        else: out.append(LineString(r['line']))
    return out


def ocean_polygons(land, rules, seeds, gap=0.005, join_deg=1.5):
    """육지(경위도 면) · 자르는 선 · 대양 씨앗 {cls: [[lon, lat], …]} → ({cls: 면}, 보고).
    바다 = 세계 상자 − 육지, 선을 gap 만큼 두껍게 해 빼서 덩어리로 나누고, 씨앗이 든 덩어리 = 그 대양(한 덩어리에 두 대양 씨앗이면 ValueError —
    선이 해협을 다 막지 못함). 씨앗 없는 덩어리(흑해·발트해처럼 50m 해협이 막힌 바다)는 join_deg 안 가장 가까운 대양 덩어리에 붙이고, 더 멀면(카스피해)
    버림."""
    world = box(-180, -90, 180, 90)
    sea = world.difference(land)
    cut = unary_union([L.buffer(gap) for L in ocean_cut_lines(rules)])
    comps = polys(sea.difference(cut))
    label = [None] * len(comps)
    for cls, pts in seeds.items():
        for pt in pts:
            P = Point(pt)
            hit = [i for i, c in enumerate(comps) if c.contains(P)]
            if not hit: raise ValueError(f'대양 씨앗 {cls} {pt} 가 바다 덩어리 안이 아님(육지·자르는 선 위)')
            i = hit[0]
            if label[i] not in (None, cls): raise ValueError(f'대양 {label[i]} 와 {cls} 가 한 덩어리 — 자르는 선이 해협을 다 막지 못함(씨앗 {pt})')
            label[i] = cls
    rep = {'components': len(comps), 'joined': 0, 'dropped': []}
    named = [i for i in range(len(comps)) if label[i]]
    for i, c in enumerate(comps):
        if label[i]: continue
        j = min(named, key=lambda k: comps[k].distance(c))
        if comps[j].distance(c) <= join_deg: label[i] = label[j]; rep['joined'] += 1
        elif c.area > 1: rep['dropped'].append([round(v, 1) for v in c.representative_point().coords[0]] + [round(c.area, 1)])
    out = {cls: unary_union([comps[i] for i in range(len(comps)) if label[i] == cls]) for cls in seeds}
    return out, rep


OCEAN_COLOR = '#3d8fd1'   # 대양 강조 기본색(앱 worldExtra.CONTINENTS.oceanColor 와 같음)


def build_oceans(cfg):
    """설정 oceans {classes:[{cls, label, color?}], rules, seeds, simplifyDeg, gap, joinDeg, polar:[cls…]} → (oceans 범례, Feature 들, 보고).
    극을 품는 대양(polar — 북극해·남극해)은 날짜변경선에서 잇지 않음(±180 경선 두 변이 극에서 만나는 d3 극 면), 나머지는 unwrap_dateline 으로 이어
    단순화한 뒤 −180~180 으로 되접음(태평양 — 180° 에서 두 면, 한 Feature). 범례 항목 {cls, label, color, center, bbox}(center·bbox 는 build 가 떼어 냄)."""
    oc = cfg['oceans']
    land = unary_union([g for _, _, g in ne_countries()]).buffer(0)
    geoms, rep = ocean_polygons(land, oc['rules'], oc['seeds'], oc.get('gap', 0.005), oc.get('joinDeg', 1.5))
    tol = oc.get('simplifyDeg', 0.1)
    polar = set(oc.get('polar') or [])
    feats, legend = [], []
    for c in oc['classes']:
        g = geoms[c['cls']]
        if c['cls'] not in polar: g = unwrap_dateline(g)
        center = sphere_center([g])
        hole = oc.get('minHoleDeg2', 0)   # 작은 섬 구멍은 메움(강조 면이 그 섬을 옅게 덮음 — 용량)
        if hole: g = unary_union([Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area >= hole]) for p in polys(g) if p.area >= oc.get('minPartDeg2', 0)])
        g = g.simplify(c.get('simplifyDeg', tol), preserve_topology=True)
        import shapely   # 위선 변(북극권·남위 60°)·극 면의 ±180 경선 변을 촘촘히 — d3 는 꼭짓점 사이를 대원으로 이어 긴 위선 변이 극 쪽으로 처짐
        bbox = lon_bbox([g])
        if c['cls'] not in polar: g = rewrap_dateline(g)
        g = shapely.segmentize(g, oc.get('stepDeg', 3.0))
        geom = round_geom(g, oc.get('digits', 3))
        if geom is None: raise ValueError(f"대양 {c['cls']}: 면이 비었음")
        feats.append({'type': 'Feature', 'properties': {'cls': c['cls'], 'ocean': True}, 'geometry': geom})
        legend.append({'cls': c['cls'], 'label': c['label'], 'color': c.get('color') or OCEAN_COLOR, 'center': center, 'bbox': bbox})
        rep.setdefault('kb', {})[c['cls']] = round(len(json.dumps(geom, separators=(',', ':'))) / 1024, 1)
        rep.setdefault('areaDeg2', {})[c['cls']] = round(geoms[c['cls']].area, 1)
    return legend, feats, rep


# ── 검증 그림 ────────────────────────────────────────────────────────────
def verify(layer_id, out_dir, dpi=110):
    """두 쪽 지면 위에 대륙 칠(classes = 나라 50m 면, 조각 면)과 쪼개는 선을 겹친 그림 <id>-p10.png·-p11.png(overlay.py). 경로 목록."""
    import overlay
    from atlas_common import WORK, layer_config, maps
    cfg = layer_config(layer_id); mps = maps()
    with open(os.path.join(WORK, 'geo', f'{layer_id}.continents.json'), encoding='utf-8') as f: lay = json.load(f)
    color = {e['cls']: e['color'] for e in lay['properties']['legend']}
    pal = ['#2b6cb0', '#38a169', '#d69e2e', '#805ad5', '#e53e3e']   # 검증 그림만 — 대양마다 다른 색으로 경계를 봄
    for k, o in enumerate(lay['properties'].get('oceans') or []): color[o['cls']] = pal[k % len(pal)]
    geo = {iso: g for iso, ko, g in ne_countries()}
    items = [(c, geo[iso]) for iso, c in lay['properties']['classes'].items() if iso in geo]
    items += [(f['properties']['cls'], shape(f['geometry'])) for f in lay['features']]
    with open(os.path.join(WORK, 'geo', f'{layer_id}.continents-lines.json'), encoding='utf-8') as f: lines = json.load(f)
    outs = []
    for mid in cfg['maps']:
        m = mps[mid]; fit = load_fit(mid)
        pg = project_parts(fit, [g for _, g in items])
        areas = []
        for (c, _), P in zip(items, pg):
            if P is None: continue
            areas.append({'color': color[c], 'polygons': [[list(p.exterior.coords), *[list(r.coords) for r in p.interiors]] for p in polys(P)]})
        paths = [{'points': l['page'], 'color': '#000000', 'width': 1.2} for l in lines if l['map'] == mid]
        out = os.path.join(out_dir, f'{layer_id}-{mid}.png').replace(os.sep, '/')
        ov = {'page': m['page'], 'bbox': m['bbox'], 'dpi': dpi, 'out': out, 'title': f'{layer_id} @ {mid}', 'areas': areas, 'paths': paths}
        ovf = os.path.join(WORK, 'geo', f'{layer_id}-{mid}.overlay.json')
        with open(ovf, 'w', encoding='utf-8', newline='\n') as f: json.dump(ov, f)
        overlay.main(ovf); outs.append(out)
    return outs


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    from atlas_common import WORK
    if '--unit' in argv: k = argv.index('--unit'); argv = argv[:k] + argv[k + 2:]   # atlas_common 이 단원을 이미 골랐음
    ids = [a for a in argv if not a.startswith('--')]
    vdir = None
    if '--verify' in argv:
        vdir = argv[argv.index('--verify') + 1]; ids = [i for i in ids if i != vdir]
    if not ids: print('사용: continent_layers.py --unit u1 <레이어 id> [--oceans] [--verify <폴더>]'); return 2
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    for lid in ids:
        if vdir and '--verify-only' in argv:
            os.makedirs(vdir, exist_ok=True); print(verify(lid, vdir)); continue
        out, rep = build(lid, oceans='--oceans' in argv)
        lines = rep.pop('_lines')
        p = os.path.join(WORK, 'geo', f'{lid}.continents.json')
        with open(p, 'w', encoding='utf-8', newline='\n') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(WORK, 'geo', f'{lid}.continents-report.json'), 'w', encoding='utf-8', newline='\n') as f: json.dump(rep, f, ensure_ascii=False, indent=1)
        with open(os.path.join(WORK, 'geo', f'{lid}.continents-lines.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(lines, f)
        pr = out['properties']
        print(f"{lid}: 나라 {len(pr['classes'])} · 조각 면 {sum(1 for f in out['features'] if not f['properties'].get('ocean'))} "
              f"(쪼갠 나라 {sorted(rep['split'])}) · 분류 없음 {rep['unclassified']} · 고침 {rep['overridden']} · 견본 {len(rep['protos'])} · "
              f"확대 {rep['zoomed']}/{rep['parts']} · 이름 {rep['names']['matched']} · {os.path.getsize(p) // 1024}KB → {p}")
        if vdir: os.makedirs(vdir, exist_ok=True); print(verify(lid, vdir))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
