# © 2026 김용현
# scripts/atlas/tests/test_tables.py — C4 그래프 숫자·부록 표(extract_tables.py · charts_axes.py · charts_geom.py · charts_read.py · climate_table.py) 검사
import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import numpy as np
import pdfkit
import charts_axes as AX
import charts_geom as G

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


# ── 순수 함수(고정 자료) ──────────────────────────────────────────────────
class Axes(unittest.TestCase):
    def test_parse_num(self):
        self.assertEqual(AX.parse_num('5,438'), 5438)
        self.assertEqual(AX.parse_num('-10.0'), -10.0)
        self.assertEqual(AX.parse_num('−3.5'), -3.5)
        self.assertEqual(AX.parse_num('50.5%'), 50.5)
        self.assertIsNone(AX.parse_num('0~14'))
        self.assertIsNone(AX.parse_num('(%)'))
        self.assertIsNone(AX.parse_num(''))

    def test_fit_axis_fixture(self):
        # 기후 그래프 왼쪽 축: 값 -40..40 (10 간격), 지면 y 672.15..603.29 (아래로 갈수록 작은 값)
        pairs = [(672.15 - (v + 40) * 0.86075, v) for v in range(-40, 41, 10)]
        ax = AX.fit_axis(pairs)
        self.assertAlmostEqual(ax.val(637.72), 0.0, places=2)
        self.assertAlmostEqual(ax.pos(30), 672.15 - 70 * 0.86075, places=3)
        self.assertLess(ax.resid, 1e-6)
        self.assertAlmostEqual(ax.step, 10)
        self.assertAlmostEqual(ax.units_per_pt, 1 / 0.86075, places=4)
        # 눈금 글자 하나가 1pt 어긋나 있으면 잔차로 드러난다
        bad = pairs[:-1] + [(pairs[-1][0] + 1.0, pairs[-1][1])]
        self.assertGreater(AX.fit_axis(bad).resid, 0.5)

    def test_fit_axis_needs_two_values(self):
        with self.assertRaises(ValueError): AX.fit_axis([(1.0, 5)])
        with self.assertRaises(ValueError): AX.fit_axis([(1.0, 5), (2.0, 5)])

    def test_snap_to_ticks(self):
        # 글자 가운데(오른쪽 맞춤이라 0.4pt 어긋남)를 가장 가까운 눈금선으로
        self.assertEqual(AX.snap([10.4, 20.3, 33.0], [10.0, 20.0, 30.0], tol=1.0), [10.0, 20.0, 33.0])

    def test_mirrored_axis(self):
        # 인구 피라미드: 0 왼쪽 글자는 음수로 읽어 한 직선으로 맞춘다
        toks = [{'value': v, 'cx': 138 + (1 if s > 0 else -1) * v * 7.085, 'side': s} for v in (2, 4, 6) for s in (-1, 1)]
        toks.append({'value': 0, 'cx': 138, 'side': 0})
        pairs = AX.signed_pairs(toks, zero=138)
        ax = AX.fit_axis(pairs)
        self.assertAlmostEqual(abs(ax.val(138 - 3 * 7.085)), 3, places=3)

    def test_precision(self):
        ax = AX.fit_axis([(0, 0), (10, 100)])
        self.assertAlmostEqual(AX.precision(ax, draw_pt=0.1), 1.0, places=6)   # 0.1pt × 10 단위/pt

    def test_fit_axis_rejects_bad_order(self):
        with self.assertRaises(ValueError): AX.fit_axis([(0, 0), (10, 20), (20, 10)])   # 위치 순으로 값이 오르내림
        with self.assertRaises(ValueError): AX.fit_axis([(5, 0), (5, 10)])              # 같은 자리에 다른 값(기울기 무한)

    def test_checked_axis_drops_one_outlier(self):
        # 눈금 글자 하나가 단위 「(%)」에 밀려 3pt 비껴 있다 → 한 번 빼고 다시 맞추면 잔차가 허용치 안
        pairs = [(10 * v, v) for v in range(6)]
        pairs[-1] = (pairs[-1][0] - 3.0, 5)
        W = []
        ax = AX.fit_axis_checked(pairs, tol=0.6, warnings=W, name='t')
        self.assertEqual(W, [])
        self.assertLess(ax.resid, 1e-6)
        self.assertEqual(ax.dropped, [5])

    def test_checked_axis_warns(self):
        W = []
        AX.fit_axis_checked([(0, 0), (10, 10)], tol=0.6, warnings=W, name='t')
        self.assertTrue(any('눈금 2개' in w for w in W))                             # 눈금 둘뿐
        W = []
        bad = [(0, 0), (10, 1), (23, 2), (30, 3), (37, 4), (50, 5)]                 # 두 글자가 어긋남
        AX.fit_axis_checked(bad, tol=0.6, warnings=W, name='t')
        self.assertTrue(any('잔차' in w for w in W))

    def test_log_axis(self):
        pairs = [(0, 1), (10, 10), (20, 100), (30, 1000)]
        ax = AX.fit_axis(pairs, scale='log')
        self.assertAlmostEqual(ax.val(15), 10 ** 1.5, places=6)
        self.assertAlmostEqual(ax.pos(100), 20, places=6)
        # 선형으로 맞추면 고르지 않은 간격을 알린다(로그 축일 수 있음)
        W = []
        AX.fit_axis_checked(pairs, tol=0.6, warnings=W, name='t')
        self.assertTrue(any('log' in w for w in W))

    def test_decimals_cap(self):
        self.assertEqual(AX.decimals_for(0.014), 3)
        self.assertEqual(AX.decimals_for(0.014, cap=2), 2)          # 인쇄 자리 + 1 을 넘지 않는다
        self.assertEqual(AX.decimals_for(3.0, cap=2), 1)          # 정밀도 3 → 한 자리 아래(소수 1)
        self.assertEqual(AX.decimals_for(3.0, cap=0), 0)
        self.assertEqual(AX.token_decimals([{'text': '12.5'}, {'text': '3'}]), 1)


class Colors(unittest.TestCase):
    def test_color_match(self):
        from atlas_common import color_match
        self.assertEqual(color_match('#ff0000', ['#ff0000', '#00ff00']), '#ff0000')
        self.assertIsNone(color_match('#fe0101', ['#ff0000']))                       # 기본 = 같은 색만
        self.assertEqual(color_match('#fe0101', ['#ff0000', '#00ff00'], de=3), '#ff0000')
        self.assertIsNone(color_match('#0000ff', ['#ff0000'], de=3))
        self.assertIsNone(color_match(None, ['#ff0000'], de=3))


class Geom(unittest.TestCase):
    def test_bar_segments_overlap_midpoints(self):
        # 회색 칸끼리 0.2pt 겹침 → 경계는 겹침 가운데. 마지막 칸(기타)이 그 아래 칸 둘을 덮으면 그 둘은 버린다.
        items = [{'i': 0, 'x0': 0.0, 'x1': 10.0}, {'i': 1, 'x0': 9.8, 'x1': 20.1}, {'i': 2, 'x0': 19.9, 'x1': 24.0},
                 {'i': 3, 'x0': 23.9, 'x1': 25.0}, {'i': 4, 'x0': 23.95, 'x1': 26.0}]
        segs, rep = G.bar_segments(items, lo=0.0, hi=26.0)
        self.assertEqual([s['i'] for s in segs], [0, 1, 2, 4])
        self.assertEqual([d['i'] for d in rep['dropped']], [3])     # 덮여 버린 칸은 보고한다
        self.assertEqual(rep['gaps'], [])
        self.assertAlmostEqual(segs[0]['x1'], 9.9)
        self.assertAlmostEqual(segs[1]['x1'], 20.0)
        self.assertAlmostEqual(segs[-1]['x1'], 26.0)
        self.assertAlmostEqual(sum(s['x1'] - s['x0'] for s in segs), 26.0)

    def test_visible_runs_painter(self):
        from shapely.geometry import box
        # 나중에 칠한 것이 앞의 것을 덮는다
        fills = [{'i': 0, 'color': '#a', 'geom': box(0, 0, 10, 100)}, {'i': 1, 'color': '#b', 'geom': box(0, 40, 10, 60)}]
        runs = G.visible_runs(fills, 5.0)
        self.assertEqual([(r['color'], round(r['y0']), round(r['y1'])) for r in runs], [('#a', 0, 40), ('#b', 40, 60), ('#a', 60, 100)])

    def test_bar_segments_gap(self):
        # 칸 사이가 비어 있으면(maxGapPt 넘게) 잇지 않고 틈으로 알린다
        items = [{'i': 0, 'x0': 0.0, 'x1': 10.0}, {'i': 1, 'x0': 12.0, 'x1': 20.0}]
        segs, rep = G.bar_segments(items, lo=0.0, hi=20.0, max_gap=0.5)
        self.assertEqual(rep['gaps'], [[10.0, 12.0]])
        self.assertAlmostEqual(segs[0]['x1'], 10.0); self.assertAlmostEqual(segs[1]['x0'], 12.0)
        _, rep = G.bar_segments(items, lo=-2.0, hi=20.0, max_gap=0.5)
        self.assertIn([-2.0, 0.0], rep['gaps'])                     # 축 0 과 첫 칸 사이도

    def test_polyline_at(self):
        pts = np.array([[0, 0], [10, 10], [20, 0]], float)
        self.assertAlmostEqual(G.polyline_at(pts, 5), 5)
        self.assertAlmostEqual(G.polyline_at(pts, 15), 5)
        self.assertIsNone(G.polyline_at(pts, 25))

    def test_circle_fit_and_sweep(self):
        c, r = (100.0, 50.0), 20.0
        ang = np.radians(np.linspace(0, 249.12, 60))     # 위(12시)에서 시계 방향 69.2 %
        pts = np.c_[c[0] + r * np.sin(ang), c[1] - r * np.cos(ang)]
        cx, cy, rr = G.fit_circle(pts)
        self.assertAlmostEqual(cx, 100, places=4); self.assertAlmostEqual(rr, 20, places=4)
        self.assertAlmostEqual(G.sweep_deg(pts, (cx, cy)), 249.12, places=3)

    def test_full_circle_and_direction(self):
        c = (0.0, 0.0)
        ang = np.radians(np.linspace(0, 360, 121))
        cw = np.c_[10 * np.sin(ang), -10 * np.cos(ang)]               # 12시에서 시계 방향(지면 y 아래로)
        self.assertAlmostEqual(G.sweep_deg(cw, c), 360, places=6)      # 100 %
        self.assertEqual(G.arc_direction(cw, c), 'cw')
        self.assertEqual(G.arc_direction(cw[::-1], c), 'ccw')          # 거꾸로 그린 호
        self.assertAlmostEqual(G.clock_angle(cw[0], c), 0, places=6)
        self.assertAlmostEqual(G.clock_angle([10, 0], c), 90, places=6)   # 3시

    def test_arc_runs_from_bezier(self):
        # 사분원 베지어 하나(k = 0.5523) → 90°
        import fitz
        k = 0.5523 * 10
        P = fitz.Point
        d = {'items': [('c', P(0, -10), P(k, -10), P(10, -k), P(10, 0)), ('l', P(10, 0), P(0, 0)), ('l', P(0, 0), P(0, -10))]}
        arcs = G.arcs(d)
        self.assertEqual(len(arcs), 1)
        a = arcs[0]
        self.assertAlmostEqual(a['r'], 10, delta=0.05)
        self.assertAlmostEqual(a['sweep'], 90, delta=0.2)


# ── PDF 가 있어야 하는 검사 ─────────────────────────────────────────────
@NEED_PDF
class Climate(unittest.TestCase):
    def test_p21_climographs(self):
        import extract_tables as et
        cities = et.p21_cities()
        self.assertEqual(len(cities), 4)   # 계획의 5는 조사 어림값(5번째는 마스코트) — 21쪽 그래프는 4개
        rows = et.climate_table()          # 97쪽
        missing = et.climate_not_in_table()
        for c in cities:
            if c in missing: self.assertNotIn(c, rows); continue
            r = rows[c]
            self.assertEqual(len(r['temp']), 12); self.assertEqual(len(r['prec']), 12)
            self.assertTrue(all(isinstance(v, (int, float)) for v in r['temp'] + r['prec']))

    def test_climate_table_values(self):
        import extract_tables as et
        rows = et.climate_table()
        self.assertEqual(len(rows), 41)   # 왼쪽 표 21곳 + 오른쪽 표 20곳
        sg = rows['싱가포르']
        self.assertEqual(sg['temp'][0], 26.8); self.assertEqual(sg['temp'][4], 28.6)   # 강조 칸(최저·최고)도 읽는다
        self.assertEqual(sg['prec'][1], 104.9); self.assertEqual(sg['annualPrec'], 2122.7)
        self.assertEqual(sg['country'], '싱가포르'); self.assertEqual(sg['zone'], '열대 우림 기후')
        self.assertEqual(rows['보스토크(러)']['temp'][7], -66.7)
        for name, r in rows.items():
            self.assertEqual(len(r['temp']), 12, name); self.assertEqual(len(r['prec']), 12, name)
            # 인쇄된 연 강수량 = 월 합(반올림 차 안)
            self.assertAlmostEqual(sum(r['prec']), r['annualPrec'], delta=1.0 + 0.002 * r['annualPrec'], msg=name)


@NEED_PDF
class Charts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import extract_tables as et
        cls.et = et
        cls.warnings = []
        cls.charts = et.extract_charts(cls.warnings)
        cls.cfg = et.charts_config()

    def test_every_configured_chart(self):
        self.assertEqual(set(self.charts), set(self.cfg['items']))
        self.assertEqual(len(self.charts), 17)

    def test_schema(self):
        types = {'line', 'bar', 'stackedBar', 'stackedArea', 'pie', 'donut', 'radialBar', 'pyramid', 'climograph', 'table'}
        for cid, c in self.charts.items():
            with self.subTest(cid):
                self.assertIn(c['type'], types)
                for k in ('title', 'unit', 'source', 'categories', 'series', 'page', 'bbox'):
                    self.assertIn(k, c)
                self.assertTrue(c['title'])
                self.assertEqual(len(c['bbox']), 4)
                for s in c['series']:
                    self.assertIn(s['method'], ('printed', 'measured', 'table'))
                    self.assertEqual(len(s['values']), len(c['categories']), s['name'])
                    if s['method'] == 'measured' and c['type'] != 'table':
                        self.assertIsInstance(s.get('precision'), (int, float))

    def test_validation_clean(self):
        self.assertEqual(self.warnings, [])
        self.assertEqual(self.et.validate(self.charts, self.cfg), [])

    def test_sums(self):
        for cid, c in self.charts.items():
            if c['type'] in ('pie', 'donut') or (c['type'] == 'stackedBar' and c.get('total') == 100):
                for j, cat in enumerate(c['categories']):
                    vals = [s['values'][j] for s in c['series'] if s['method'] == 'printed' and s['values'][j] is not None]
                    self.assertAlmostEqual(sum(vals), 100, delta=0.15, msg=f'{cid} {cat}')

    def test_measured_vs_printed_stacked(self):
        # 띠그래프: 칸 너비로 잰 값과 인쇄된 숫자가 맞는다(짝을 바르게 지었다는 뜻도 된다)
        c = self.charts['p24-resources']
        self.assertLessEqual(c['check']['maxAbsDiff'], 0.5)
        coal = c['categories'].index('석탄')
        china = next(s for s in c['series'] if s['name'] == '중국')
        self.assertEqual(china['values'][coal], 50.5)

    def test_climograph_measured_vs_table(self):
        for cid, c in self.charts.items():
            if c['type'] != 'climograph' or 'check' not in c: continue
            with self.subTest(cid):
                self.assertLessEqual(c['check']['maxTempDiff'], 0.6)
                self.assertLessEqual(c['check']['maxPrecDiff'], 6.0)

    def test_deterministic(self):
        import json
        again = self.et.extract_charts([])
        self.assertEqual(json.dumps(again, ensure_ascii=False, sort_keys=True), json.dumps(self.charts, ensure_ascii=False, sort_keys=True))

    def test_validate_negative(self):
        import copy
        bad = copy.deepcopy(self.charts)
        pie = bad['p23-qatar-pie']; pie['series'][0]['values'][0] = 25.0                     # 합 105.6
        bad['p23-china-india-pop']['series'][0]['values'][3] = None                          # 빈 값
        bad['p23-japan-aging']['series'] = bad['p23-japan-aging']['series'][:1]              # 계열 빠짐
        del bad['p24-neom']                                                                  # 그래프 빠짐
        W = self.et.validate(bad, self.cfg)
        self.assertTrue(any('p23-qatar-pie' in w and '합' in w for w in W), W)
        self.assertTrue(any('p23-china-india-pop' in w and '빈 값' in w for w in W), W)
        self.assertTrue(any('p23-japan-aging' in w and '계열' in w for w in W), W)
        self.assertTrue(any('p24-neom' in w for w in W), W)

    def test_no_dropped_or_gaps(self):
        for cid in ('p24-resources', 'p24-exports'):
            ck = self.charts[cid]['check']
            self.assertEqual(ck['gaps'], [], cid)
            self.assertEqual(len(ck['droppedSegments']), 2 if cid == 'p24-resources' else 0, cid)   # 희토류 끝 회색 2칸

    def test_refuse_to_write_on_warnings(self):
        import tempfile
        from unittest import mock
        from atlas_common import WORK
        with tempfile.TemporaryDirectory(dir=WORK) as d:
            paths = {k: os.path.join(d, k + '.json') for k in ('climate', 'charts')}
            with mock.patch.object(self.et, 'out_path', lambda k: paths.get(k, d)),                  mock.patch.object(self.et, 'validate', lambda ch, cfg: ['가짜 경고']):
                self.assertEqual(self.et.main(['--charts']), 1)
                self.assertFalse(os.path.exists(paths['charts']))            # 경고가 있으면 쓰지 않는다
                self.assertEqual(self.et.main(['--charts', '--force']), 1)
                self.assertTrue(os.path.exists(paths['charts']))             # --force 면 쓴다(종료 코드는 그대로 1)

    def test_monotonic_years(self):
        for cid, c in self.charts.items():
            if c.get('categoryKind') == 'year':
                self.assertEqual(c['categories'], sorted(c['categories']), cid)


class Cli(unittest.TestCase):
    def test_parse_flags(self):
        import extract_tables as et
        self.assertEqual(et.parse_flags([]), (set(et.STEPS), False))
        self.assertEqual(et.parse_flags(['--charts', '--force']), ({'charts'}, True))
        with self.assertRaises(ValueError): et.parse_flags(['--chart'])
        with self.assertRaises(ValueError): et.parse_flags(['charts'])

    def test_atomic_write(self):
        import tempfile, json
        import extract_tables as et
        from atlas_common import WORK
        os.makedirs(WORK, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=WORK) as d:     # ASCII 작업 폴더
            f = os.path.join(d, 'x.json')
            et.write_json(f, {'a': 1})
            with open(f, encoding='utf-8') as fh: self.assertEqual(json.load(fh), {'a': 1})
            self.assertEqual(os.listdir(d), ['x.json'])                 # 임시 파일이 남지 않는다


@NEED_PDF
class Words(unittest.TestCase):
    def test_reversed_trace_split(self):
        # 23쪽 해 눈금: 한 글자 묶음에 「2100 2050 … 1800」 이 오른쪽→왼쪽 순으로 들어 있다
        ws = [w['text'] for w in AX.words(23, [38, 498, 386, 506]) if AX.parse_num(w['text']) is not None]
        self.assertEqual(sorted(ws), ['1800', '1850', '1900', '1950', '2000', '2021', '2050', '2100'])

    def test_space_split(self):
        # 24쪽 베트남 가로축: 「0 100 200 300 400 500 600」 한 조각 → 7 낱말
        vals = [t['value'] for t in AX.number_tokens(24, [649, 386.5, 724, 394.5])]
        self.assertEqual(vals, [0, 100, 200, 300, 400, 500, 600])


if __name__ == '__main__':
    unittest.main()
