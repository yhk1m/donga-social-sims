# © 2026 김용현
# scripts/atlas/tests/test_shape_controls.py — 섬·호수·나라 중심 기준점(shape_controls.py)과 교과서 도형 뽑기(land_shapes.py) 검사
import json, math, os, subprocess, sys, unittest
import numpy as np
from shapely.geometry import box

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import pdfkit
import shape_controls as sc

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
O = dict(sc.DEFAULTS)


class Match(unittest.TestCase):
    def test_mutual_best_with_area_ratio(self):
        pdf = [{'kind': 'land', 'area': 100.0, 'c': [10, 10]}, {'kind': 'land', 'area': 100.0, 'c': [30, 10]},
               {'kind': 'water', 'area': 50.0, 'c': [50, 10]}, {'kind': 'land', 'area': 100.0, 'c': [70, 10]}]
        ne = [{'kind': 'land', 'area': 105.0, 'c': [10.5, 10]},     # 0 ↔ 0
              {'kind': 'land', 'area': 400.0, 'c': [30, 10]},      # 넓이 비 4 → 짝 아님
              {'kind': 'land', 'area': 50.0, 'c': [50, 10]},       # 종류가 다름(물 ↔ 육지) → 짝 아님
              None,
              {'kind': 'land', 'area': 100.0, 'c': [70, 30]}]      # 너무 멂(20pt > max(4, 0.15·10))
        self.assertEqual(sc.match_centroids(pdf, ne, O), [(0, 0)])

    def test_one_ne_shape_pairs_once(self):
        pdf = [{'kind': 'land', 'area': 100.0, 'c': [10, 10]}, {'kind': 'land', 'area': 100.0, 'c': [12, 10]}]
        ne = [{'kind': 'land', 'area': 100.0, 'c': [11.8, 10]}]
        self.assertEqual(sc.match_centroids(pdf, ne, O), [(1, 0)])   # 서로 가장 좋은 짝만

    def test_tips(self):
        a = [(0, 0, 0), (10, 0, 1), (5, 9, 2)]
        b = [(0.5, 0.2, 0), (10.1, 0, 1), (20, 20, 2)]
        self.assertEqual(sc.match_tips(a, b, 2.0), [(0, 0), (1, 1)])


class Corners(unittest.TestCase):
    def test_square_corners_and_frame_margin(self):
        sq = np.array([[0, 0], [40, 0], [40, 40], [0, 40]], float)
        t = sc.sharp_vertices(sq, O)
        got = sorted((round(x), round(y)) for x, y, _ in t)
        self.assertEqual(got, [(0, 0), (0, 40), (40, 0), (40, 40)])
        # 틀 경계(왼쪽 x=0)에 붙은 꼭짓점은 잘린 자리라 뺀다
        fr = box(0, -10, 100, 100)
        self.assertEqual(sorted((round(x), round(y)) for x, y, _ in sc.sharp_vertices(sq, O, fr)), [(40, 0), (40, 40)])

    def test_smooth_circle_has_no_corner(self):
        th = np.linspace(0, 2 * math.pi, 200, endpoint=False)
        circ = np.column_stack([30 * np.cos(th), 30 * np.sin(th)])
        self.assertEqual(sc.sharp_vertices(circ, O), [])

    def test_concave_corner_found(self):
        L = np.array([[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]], float)   # ㄱ자 — 오목 꼭짓점 (20, 20)
        self.assertIn((20, 20), [(round(x), round(y)) for x, y, _ in sc.sharp_vertices(L, O)])


# ── 합성 시험: node(fit_helper.mjs) 대신 알려진 닮음 변환 xy = S·(경도, 위도) + T 를 쓰는 가짜 ─────────────
S, T = 10.0, (100.0, 50.0)
fwd = lambda ll: [S * ll[0] + T[0], S * ll[1] + T[1]]
inv = lambda xy: [(xy[0] - T[0]) / S, (xy[1] - T[1]) / S]


def fake_node(ops):
    out = []
    for op in ops:
        if op['op'] == 'apply': out.append([[fwd(p) for p in ring] for ring in op['rings']])
        elif op['op'] == 'invert': out.append([inv(p) for p in op['pts']])
        elif op['op'] == 'fit':
            r = [math.dist(c['xy'], fwd((c['lon'], c['lat']))) for c in op['cps']]
            out.append({'family': 'fake', 'params': [], 'sim': {}, 'resid': r, 'rmsPt': float(np.sqrt(np.mean(np.square(r)))), 'meanPt': float(np.mean(r))})
        else: raise AssertionError(op)
    return out


def sq(x0, y0, x1, y1): return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], float)


def ne_poly(kind, name, ring):
    return {'kind': kind, 'name': name, 'ring': ring, 'bbox': (ring[:, 0].min(), ring[:, 1].min(), ring[:, 0].max(), ring[:, 1].max()), 'big': False}


def pdf_shape(kind, ring, compact=1.0, edge=False):
    from shapely.geometry import Polygon
    g = Polygon(ring)
    return {'kind': kind, 'ring': ring.tolist(), 'poly': g, 'area': g.area, 'c': [g.centroid.x, g.centroid.y], 'edge': edge, 'compact': compact}


class Synthetic(unittest.TestCase):
    def setUp(self):
        self._node, self._ne = sc.node, sc.ne_polys
        sc.node = fake_node

    def tearDown(self):
        sc.node, sc.ne_polys = self._node, self._ne

    def test_find_pairs_inverts_projected_centroid(self):
        # Natural Earth: 섬(경위도 0~2 × 0~2), 호수(5~6 × 5~7), 짝 없는 섬(20~21) / 교과서: 섬(0.5pt 어긋남)·호수·혼자인 섬
        sc.ne_polys = lambda target: [ne_poly('land', 'isle', sq(0, 0, 2, 2)), ne_poly('water', 'lake', sq(5, 5, 6, 7)), ne_poly('land', 'far', sq(20, 20, 21, 21))]
        shapes = [pdf_shape('land', sq(100.5, 50, 120.5, 70)), pdf_shape('water', sq(150, 100, 160, 120), compact=0.6),
                  pdf_shape('land', sq(300, 300, 305, 305)), pdf_shape('land', sq(0, 0, 400, 10), edge=True)]
        m = {'id': 'syn', 'bbox': [90, 40, 320, 320], 'shapes': {}}
        got = sc.find_pairs(m, {'family': 'fake'}, shapes, O, box(90, 40, 320, 320))
        by = {c['ne']: c for c in got}
        self.assertEqual(sorted(by), ['isle', 'lake'])
        # 기준점 = (교과서 넓이 중심, 투영한 Natural Earth 넓이 중심을 되돌린 경위도)
        self.assertEqual(by['isle']['xy'], [110.5, 60.0])
        self.assertAlmostEqual(by['isle']['lon'], 1.0); self.assertAlmostEqual(by['isle']['lat'], 1.0)
        self.assertAlmostEqual(by['lake']['lon'], 5.5); self.assertAlmostEqual(by['lake']['lat'], 6.0)
        self.assertEqual((by['isle']['type'], by['isle']['kind'], by['lake']['kind']), ('centroid', 'land', 'water'))
        self.assertAlmostEqual(by['isle']['matchPt'], 0.5)

    def cand(self, name, xy, off=0.0, area=100.0):
        lon, lat = inv(xy)
        return {'name': name, 'type': 'centroid', 'xy': list(xy), 'lon': lon + off / S, 'lat': lat, 'area': area}

    def test_select_drops_mad_outlier_then_spacing(self):
        cand = [self.cand(f'c{i}', (100 + 30 * i, 100 + 7 * (i % 3))) for i in range(8)]
        cand.append(self.cand('bad', (500, 500), off=5.0))                  # 5pt 어긋난 짝(옮겨 그린 섬)
        cand.append(self.cand('near', (101.5, 101), area=10.0))             # c0 에서 4pt 안 — 작은 쪽이 간격으로 빠짐
        chosen, rep = sc.select({'id': 'syn'}, [], cand, O)
        names = [c['name'] for c in chosen]
        self.assertNotIn('bad', names); self.assertNotIn('near', names)
        self.assertEqual(len(rep['mad']), 1); self.assertTrue(rep['mad'][0].startswith('bad 5.00pt>'))
        self.assertEqual(rep['spacing'], 1)
        self.assertEqual(len(chosen), 8)

    def test_select_keeps_four_points(self):
        # 기준점이 4개뿐이면 잔차가 커도 빼지 않는다(맞추기에 쓸 점이 모자라게 되므로)
        cand = [self.cand(f'c{i}', (100 + 30 * i, 100)) for i in range(3)] + [self.cand('bad', (300, 300), off=5.0)]
        chosen, rep = sc.select({'id': 'syn'}, [], cand, O)
        self.assertEqual(rep['mad'], []); self.assertEqual(len(chosen), 4)

    def test_run_map_warns_when_not_converged(self):
        saved = {k: getattr(sc, k) for k in ('maps', 'frame', '_pdf_shapes', '_base_controls', 'initial_fit', 'find_pairs')}
        try:
            flip = [0]
            def pairs(*a):
                flip[0] += 1
                return [self.cand(f'c{i}', (100 + 30 * i + (flip[0] % 2) * 0.5, 100)) for i in range(5)]   # 되풀이마다 짝 자리가 달라짐
            sc.maps = lambda: {'syn': {'id': 'syn', 'bbox': [0, 0, 1, 1]}}
            sc.frame = lambda m: box(0, 0, 1, 1); sc._pdf_shapes = lambda mid: []; sc._base_controls = lambda m: []
            sc.initial_fit = lambda *a: {'family': 'fake'}; sc.find_pairs = pairs
            logs = []
            sc.run_map('syn', dict(O, iterations=3), log=logs.append)
            self.assertTrue(any('수렴 안 함' in l for l in logs), logs)
            flip[0] = 0; logs.clear()
            sc.find_pairs = lambda *a: [self.cand(f'c{i}', (100 + 30 * i, 100)) for i in range(5)]
            sc.run_map('syn', dict(O, iterations=3), log=logs.append)
            self.assertFalse(any('수렴 안 함' in l for l in logs), logs)
        finally:
            for k, v in saved.items(): setattr(sc, k, v)


class InitFromMapPts(unittest.TestCase):
    """init {"fromMap", "pts"}: 참조 지도 식의 도법을 그대로 두고 지면 닮음 변환만 겹친다(39쪽 사막화 — 섬 없는 잘린 틀)."""
    def test_page_similarity_recovers_transform(self):
        k, mx, my = 0.5 * complex(math.cos(0.1), math.sin(0.1)), 30.0, -12.0
        src = [(0, 0), (100, 10), (40, 80)]
        dst = [((k * complex(x, y)).real + mx, (k * complex(x, y)).imag + my) for x, y in src]
        a, b, tx, ty = sc.page_similarity(src, dst)
        self.assertAlmostEqual(a, k.real); self.assertAlmostEqual(b, k.imag); self.assertAlmostEqual(tx, mx); self.assertAlmostEqual(ty, my)
        with self.assertRaises(ValueError): sc.page_similarity([(0, 0)], [(1, 1)])

    def test_compose_sim_equals_applying_both(self):
        sim = {'a': 2.0, 'b': -0.5, 'tx': 7.0, 'ty': 3.0}; s = (0.4, 0.2, -5.0, 11.0)
        ap = lambda q, u, v: (q['a'] * u - q['b'] * v + q['tx'], q['b'] * u + q['a'] * v + q['ty'])
        c = sc.compose_sim(sim, s)
        for u, v in [(0, 0), (3, -4), (10, 2)]:
            x, y = ap(sim, u, v)
            self.assertAlmostEqual(ap(c, u, v)[0], s[0] * x - s[1] * y + s[2])
            self.assertAlmostEqual(ap(c, u, v)[1], s[1] * x + s[0] * y + s[3])

    def test_initial_fit_from_map_pts(self):
        # 참조 지도: 투영 단위 = (경도, 위도), sim = 배율 10·이동(100, 50). 이 지도는 그 지면을 절반으로 줄여 (−20, 5) 옮긴 것
        ref_sim = {'a': 10.0, 'b': 0.0, 'tx': 100.0, 'ty': 50.0}
        def node(ops):
            out = []
            for op in ops:
                q = op['fit']['sim'] if 'fit' in op else None
                if op['op'] == 'fit': out.append({'family': 'fake', 'params': [1.0], 'sim': dict(ref_sim)})
                elif op['op'] == 'apply': out.append([[[q['a'] * p[0] - q['b'] * p[1] + q['tx'], q['b'] * p[0] + q['a'] * p[1] + q['ty']] for p in r] for r in op['rings']])
                else: raise AssertionError(op)
            return out
        saved = {k: getattr(sc, k) for k in ('node', 'maps', '_base_controls', 'families_for')}
        try:
            sc.node = node; sc.maps = lambda: {'ref': {'id': 'ref', 'controls': []}}
            sc._base_controls = lambda m: []; sc.families_for = lambda m: ['fake']
            here = lambda ll: [0.5 * (10 * ll[0] + 100) - 20, 0.5 * (10 * ll[1] + 50) + 5]
            pts = [{'name': 'a', 'c': here((1, 2)), 'at': [1, 2]}, {'name': 'b', 'c': here((8, -3)), 'at': [8, -3]}]
            m = {'id': 'cut', 'shapes': {'init': {'fromMap': 'ref', 'pts': pts}}}
            fit = sc.initial_fit(m, [], [], O)
            self.assertEqual((fit['family'], fit['params']), ('fake', [1.0]))   # 도법·매개변수는 참조 그대로
            for k, v in {'a': 5.0, 'b': 0.0, 'tx': 30.0, 'ty': 30.0}.items(): self.assertAlmostEqual(fit['sim'][k], v)
        finally:
            for k, v in saved.items(): setattr(sc, k, v)


class Families(unittest.TestCase):
    def test_families_for_like_georef(self):
        self.assertEqual(sc.families_for({'families': ['miller']}), ['miller'])


def run_u3(code):
    env = {k: v for k, v in os.environ.items() if k not in ('ATLAS_UNIT', 'ATLAS_UNIT_CONFIG')}
    env['ATLAS_UNIT'] = 'u3'
    r = subprocess.run([sys.executable, '-I', '-c', f'import sys, json; sys.path.insert(0, {HERE!r}); ' + code], env=env, capture_output=True)
    if r.returncode != 0: raise AssertionError(r.stderr.decode('utf-8', 'replace'))
    return json.loads(r.stdout.decode('utf-8'))


@NEED_PDF
class LandShapesU3(unittest.TestCase):
    def test_belgium_is_one_whole_shape(self):
        # 벨기에 지도: 언어 3분류 + 브뤼셀 채움의 합 = 벨기에 하나(틀·범례에 닿지 않음)
        o = run_u3('import land_shapes as ls; r = ls.shapes("p32-belgium"); '
                   'print(json.dumps([[s["kind"], s["area"], s["edge"]] for s in r["shapes"]]))')
        self.assertEqual(len(o), 1)
        kind, area, edge = o[0]
        self.assertEqual((kind, edge), ('land', False))
        self.assertAlmostEqual(area, 7026, delta=60)

    def test_eu_map_islands(self):
        # EU 지도: 그레이트브리튼섬(넓이 약 940pt²)·아이슬란드(약 460)·아일랜드섬(약 360)이 잘리지 않은 따로 된 육지
        o = run_u3('import land_shapes as ls; r = ls.shapes("p32-eu"); '
                   'print(json.dumps([[s["kind"], s["area"], s["edge"]] for s in r["shapes"][:4]]))')
        self.assertTrue(o[0][2])   # 가장 큰 것 = 대륙(틀에 닿음)
        self.assertEqual([round(a, -1) for _, a, e in o[1:]], [940, 460, 360])
        self.assertFalse(any(e for _, _, e in o[1:]))


def run_unit(unit_id, code):
    env = {k: v for k, v in os.environ.items() if k not in ('ATLAS_UNIT', 'ATLAS_UNIT_CONFIG')}
    env['ATLAS_UNIT'] = unit_id
    r = subprocess.run([sys.executable, '-I', '-c', f'import sys, json; sys.path.insert(0, {HERE!r}); ' + code], env=env, capture_output=True)
    if r.returncode != 0: raise AssertionError(r.stderr.decode('utf-8', 'replace'))
    return json.loads(r.stdout.decode('utf-8'))


@NEED_PDF
class LandShapesU4(unittest.TestCase):
    """흰 바탕 래스터 규칙 seaWhite(38쪽 태양광·37쪽 기후)와 쪽 전체 렌더 render: all(38쪽 언어 — 줄무늬 선만 있는 나라)."""
    def test_solar_world_raster_islands(self):
        # 파란 분류(0–3.0)가 땅인데도 바다는 흰 화소만: 섬(넓이 0.3pt² 이상, 잘리지 않음)이 수십 개, 적도선이 대륙을 잇지 않음
        o = run_unit('u4', 'import land_shapes as ls; r = ls.shapes("p38-solar"); '
                           'print(json.dumps([[s["kind"], s["area"], s["edge"]] for s in r["shapes"]]))')
        isles = [a for k, a, e in o if k == 'land' and not e]
        self.assertGreaterEqual(len(isles), 40)
        self.assertLess(max(isles), 0.8 * sum(a for k, a, e in o if k == 'land'))   # 한 덩어리로 다 이어지지 않음

    def test_language_map_keeps_striped_madagascar(self):
        # 마다가스카르는 땅 채움 없이 줄무늬 선뿐 — 쪽 전체 렌더로 대륙 다음으로 큰 따로 된 육지(넓이 약 240pt²)
        o = run_unit('u4', 'import land_shapes as ls; r = ls.shapes("p38-language"); '
                           'print(json.dumps([[s["kind"], s["area"], s["edge"], s["c"]] for s in r["shapes"][:2]]))')
        (k0, a0, e0, _), (k1, a1, e1, c1) = o
        self.assertEqual((k0, e0, k1, e1), ('land', False, 'land', False))
        self.assertGreater(a0, 10000); self.assertAlmostEqual(a1, 240, delta=30)
        self.assertTrue(170 < c1[0] < 190 and 240 < c1[1] < 260, c1)


if __name__ == '__main__': unittest.main()
