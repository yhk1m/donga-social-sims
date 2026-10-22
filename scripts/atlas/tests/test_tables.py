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

# ── 2단계 유럽(u3, 29~31쪽) — 설정 config/u3.json 의 charts 로 같은 읽개를 돌린다 ──────────
U3_CONFIG = os.path.join(os.path.dirname(__file__), '..', 'config', 'u3.json')


@NEED_PDF
class ChartsU3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import json
        from unittest import mock
        import extract_tables as et
        cls.et = et
        with open(U3_CONFIG, encoding='utf-8') as f: cls.cfg = json.load(f)['charts']
        cls.warnings = []
        et._climate.clear()                      # 부록 표 캐시를 u3 설정으로 다시 읽고, 끝나면 비워 u2 시험에 남기지 않는다
        try:
            with mock.patch.object(et, 'charts_config', lambda: cls.cfg):
                cls.charts = et.extract_charts(cls.warnings)
                cls.again = et.extract_charts([])
                cls.rows = et.climate_table()
        finally:
            et._climate.clear()

    def test_every_configured_chart_clean(self):
        self.assertEqual(set(self.charts), set(self.cfg['items']))
        self.assertEqual(len(self.charts), 12)
        self.assertEqual(self.warnings, [])
        self.assertEqual(self.et.validate(self.charts, self.cfg), [])

    def test_climographs(self):
        clim = {cid: c for cid, c in self.charts.items() if c['type'] == 'climograph'}
        self.assertEqual(len(clim), 4)
        want = {'p29-clim-paris': ('파리', '서안 해양성', 'printed'), 'p29-clim-lisbon': ('리스본', '지중해성', 'printed'),
                'p29-clim-moscow': ('모스크바', '냉대 습윤', 'printed'), 'p29-clim-grenivik': ('그레니비크', '툰드라', 'measured')}
        for cid, (city, zone, method) in want.items():
            with self.subTest(cid):
                c = clim[cid]
                self.assertEqual((c['city'], c['climate']), (city, zone))
                t = next(s for s in c['series'] if s['name'] == '기온'); p = next(s for s in c['series'] if s['name'] == '강수량')
                for s in (t, p):
                    self.assertEqual(len(s['values']), 12)
                    self.assertTrue(all(isinstance(v, (int, float)) for v in s['values']))
                    self.assertEqual(s['method'], method)
                    if method == 'measured': self.assertIsInstance(s['precision'], float)
                if method == 'printed':     # 97쪽 표 값 = 그래프를 잰 값(허용 안)
                    self.assertLessEqual(c['check']['maxTempDiff'], 0.6); self.assertLessEqual(c['check']['maxPrecDiff'], 6.0)
        self.assertEqual(clim['p29-clim-paris']['tableName'], '파리(오를리)')                 # 표 이름 다름(aliases)
        self.assertEqual(clim['p29-clim-paris']['series'][0]['values'], self.rows['파리(오를리)']['temp'])
        self.assertNotIn('그레니비크', self.rows)

    def test_tallinn_printed(self):
        c = self.charts['p31-tallinn']
        self.assertEqual(c['type'], 'groupedBar')
        self.assertEqual(c['categories'], ['대중교통', '승용차', '도보', '자전거', '기타'])
        self.assertEqual(len(c['series']), 2)
        self.assertEqual([s['values'] for s in c['series']], [[55, 31, 12, 1, 1], [63, 28, 7, 1, 1]])   # 인쇄된 수
        self.assertTrue(all(s['method'] == 'printed' for s in c['series']))
        self.assertLessEqual(c['check']['maxAbsDiff'], 1.0)

    def test_copenhagen(self):
        c = self.charts['p31-copenhagen']
        self.assertEqual(c['type'], 'groupedBar')
        self.assertEqual(c['categories'], [2012, 2014, 2016, 2018, 2020, 2022])
        self.assertEqual([s['name'] for s in c['series']], ['자동차', '인구', '자전거'])
        r = self.charts['p31-copenhagen-2021']
        self.assertEqual(r['type'], 'pie')
        self.assertAlmostEqual(sum(s['values'][0] for s in r['series']), 100, delta=0.5)
        self.assertAlmostEqual(r['check']['measuredSum'], 100, delta=0.5)
        self.assertEqual({s['name']: s['values'][0] for s in r['series']}, {'도보': 11, '자전거': 35, '승용차': 32, '대중교통': 22})
        self.assertIs(r.get('ring'), True)   # 유럽 v2(교사 Q6): 설정 ring: true 를 그대로 실음 — 앱은 donut 비로 SVG 고리

    def test_bars_measured(self):
        f = self.charts['p30-finance']
        self.assertEqual((f['type'], f['axisBreak'], f['colors']), ('bar', [0, 680], {'런던': '#ed1c24'}))
        self.assertEqual((f['axes']['y']['step'], f['axes']['y']['n']), (20, 6))                 # 생략 위 눈금 680~780
        self.assertEqual(self.charts['p30-container']['colors'], {'로테르담': '#ed1c24'})
        self.assertEqual(self.charts['p31-ljubljana']['colors'], {'류블랴나': '#4fb848'})
        self.assertEqual(self.charts['p30-container']['categories'][2], '닝보-저우산')            # 비스듬한 글자 잇기
        for cid in ('p30-finance', 'p30-container', 'p31-ljubljana', 'p31-copenhagen'):
            for s in self.charts[cid]['series']:
                with self.subTest(f'{cid} {s["name"]}'):
                    self.assertEqual(len(s['values']), 6 if cid == 'p31-copenhagen' else 10)
                    self.assertEqual(s['method'], 'measured')
                    self.assertIsInstance(s['precision'], float)
                    self.assertLess(s['precision'], 0.5)

    def test_every_measured_has_precision(self):
        for cid, c in self.charts.items():
            for s in c['series']:
                if s['method'] == 'measured':
                    with self.subTest(f'{cid} {s["name"]}'): self.assertIsInstance(s.get('precision'), (int, float))

    def test_figure_tables(self):
        fr = self.charts['p31-freiburg']
        self.assertEqual(fr['type'], 'table')
        self.assertEqual(fr['categories'], ['1992년', '2018년', '2030년', '2035년까지'])
        self.assertEqual(fr['series'][0]['values'], ['11.8톤 100%', '7.4톤 -37%', '-60%', '-100%'])   # 그림자 글자 뺌
        so = self.charts['p30-sophia']
        self.assertEqual(len(so['categories']), 8)
        self.assertEqual(so['series'][0]['values'][3], '24km²')

    def test_deterministic(self):
        import json
        self.assertEqual(json.dumps(self.again, ensure_ascii=False, sort_keys=True), json.dumps(self.charts, ensure_ascii=False, sort_keys=True))


U4_CONFIG = os.path.join(os.path.dirname(__file__), '..', 'config', 'u4.json')
U4_RINGS = ('p38-bauxite', 'p38-uranium', 'p38-diamond', 'p38-chromium', 'p38-cobalt', 'p38-platinum', 'p38-manganese')


@NEED_PDF
class ChartsU4(unittest.TestCase):
    """U4-7 아프리카 그래프 15: 기후 4(표 2·잰 값 2) · 고리 7(조각 밖 인쇄 %) · 그림 막대 피라미드 2(렌더 화소) · 수치 그림 1 · 원 크기 줄 1."""
    @classmethod
    def setUpClass(cls):
        import json
        from unittest import mock
        import extract_tables as et
        cls.et = et
        with open(U4_CONFIG, encoding='utf-8') as f: full = json.load(f)
        cls.cfg = full['charts']
        cls.warnings = []
        et._climate.clear()
        try:
            with mock.patch.object(et, 'charts_config', lambda: cls.cfg), mock.patch.object(et, 'unit_config', lambda: full):
                cls.charts = et.extract_charts(cls.warnings)
                cls.again = et.extract_charts([])
                cls.rows = et.climate_table()
        finally:
            et._climate.clear()

    def test_count_and_warnings(self):
        self.assertEqual(len(self.charts), 15)
        self.assertEqual(set(self.charts), set(self.cfg['items']))
        self.assertEqual(self.warnings, [])
        self.assertEqual(self.et.validate(self.charts, self.cfg), [])

    def test_climate(self):
        want = {'p37-cairo': ('카이로', '사막', 'printed'), 'p37-kisangani': ('키상가니', '열대 우림', 'measured'),
                'p37-dodoma': ('도도마', '사바나', 'measured'), 'p37-capetown': ('케이프타운', '지중해성', 'printed')}
        for cid, (city, zone, method) in want.items():
            with self.subTest(cid):
                c = self.charts[cid]
                self.assertEqual((c['city'], c['climate']), (city, zone))
                self.assertEqual([len(s['values']) for s in c['series']], [12, 12])
                for s in c['series']:
                    self.assertEqual(s['method'], method)
                    self.assertTrue(all(isinstance(v, (int, float)) for v in s['values']))
                    if method == 'measured': self.assertIsInstance(s['precision'], float)
        self.assertEqual(self.charts['p37-cairo']['series'][1]['values'], self.rows['카이로']['prec'])
        self.assertEqual(self.charts['p37-capetown']['series'][0]['values'], self.rows['케이프타운']['temp'])
        self.assertEqual(self.charts['p37-cairo']['noBarMonths'], [5, 6, 7, 8])      # 막대 없는 달 = 97쪽 표 0.0mm
        self.assertEqual(self.charts['p37-dodoma']['noBarMonths'], [7, 8])
        self.assertNotIn('키상가니', self.rows); self.assertNotIn('도도마', self.rows)

    def test_rings_sum_100(self):
        for cid in U4_RINGS:
            with self.subTest(cid):
                r = self.charts[cid]
                self.assertEqual(r['type'], 'pie')
                self.assertAlmostEqual(sum(s['values'][0] for s in r['series']), 100, delta=0.5)
                self.assertAlmostEqual(r['check']['measuredSum'], 100, delta=0.5)
                self.assertTrue(0.4 < r['ring'] < 0.6)
                self.assertEqual(r['series'][-1]['name'], '기타')
                self.assertEqual(len(r['center']), 3)
        self.assertEqual([s['values'][0] for s in self.charts['p38-diamond']['series']][:3], [17.2, 9.8, 6.6])
        self.assertEqual([s['name'] for s in self.charts['p38-diamond']['series']][:3], ['보츠와나', '콩고 민주 공화국', '앙골라'])
        self.assertEqual(self.charts['p38-uranium']['center'], ['40.795', '(톤)', '2021년'])          # 인쇄 그대로(issues.md)
        self.assertEqual(self.charts['p38-diamond']['center'][0], '13.800')
        self.assertEqual({s['name']: s['values'][0] for s in self.charts['p38-manganese']['series']}, {'남아프리카 공화국': 34.4, '가나': 3.4, '기타': 62.2})

    def test_pyramids(self):
        for cid in ('p38-pyramid-world', 'p38-pyramid-africa'):
            with self.subTest(cid):
                p = self.charts[cid]
                self.assertEqual(p['type'], 'pyramid')
                self.assertEqual(len(p['categories']), 18)
                self.assertEqual((p['categories'][0], p['categories'][-1]), ('0~4', '85 이상'))
                self.assertEqual([s['name'] for s in p['series']], ['남', '여'])
                self.assertAlmostEqual(sum(v for s in p['series'] for v in s['values']), 100, delta=2.0)
                for s in p['series']:
                    self.assertEqual(len(s['values']), 18); self.assertEqual(s['method'], 'measured'); self.assertIsInstance(s['precision'], float)
        w, a = self.charts['p38-pyramid-world'], self.charts['p38-pyramid-africa']
        self.assertGreater(a['series'][0]['values'][0], w['series'][0]['values'][0])     # 아프리카 0~4세 비중이 더 큼

    def test_greenwall(self):
        g = self.charts['p39-greenwall']
        self.assertEqual(g['type'], 'bubbleRow')
        self.assertEqual(len(g['categories']), 11)
        v = g['series'][0]['values']
        self.assertEqual((v[0], v[-1]), (2006, 0.13))
        self.assertEqual(g['series'][0]['method'], 'printed')
        d = {c['name']: c['diamPt'] for c in g['check']['circles']}
        self.assertAlmostEqual(d['에티오피아'] / d['니제르'], (2006 / 809) ** 0.5, delta=0.01)
        self.assertIn('윌', g['title'])                                                    # 교과서 오타 그대로(issues.md)

    def test_afcfta_table(self):
        t = self.charts['p39-afcfta']
        self.assertEqual(t['type'], 'table')
        self.assertEqual(t['categories'][0], '2021년 국가')
        self.assertEqual(t['series'][0]['values'], ['47개국', '13억 명', '3.4조 달러', '무역 2배 성장', '17억 명', '6.7조 달러'])

    def test_every_measured_has_precision(self):
        for cid, c in self.charts.items():
            for s in c['series']:
                if s['method'] == 'measured':
                    with self.subTest(f'{cid} {s["name"]}'): self.assertIsInstance(s.get('precision'), (int, float))

    def test_deterministic(self):
        import json
        self.assertEqual(json.dumps(self.again, ensure_ascii=False, sort_keys=True), json.dumps(self.charts, ensure_ascii=False, sort_keys=True))


U5_CONFIG = os.path.join(os.path.dirname(__file__), '..', 'config', 'u5.json')
U5_RINGS = ('p46-mexico', 'p46-haiti', 'p46-brazil', 'p46-peru', 'p46-argentina')


@NEED_PDF
class ChartsU5(unittest.TestCase):
    """U5-7 아메리카 그래프 13: 기후 4(표 3·잰 값 1) · 100% 띠 2줄(범례 이름) · 고리 5(띠 안 인쇄 %) · 선 2·막대 1(잰 값)."""
    @classmethod
    def setUpClass(cls):
        import json
        from unittest import mock
        import extract_tables as et
        cls.et = et
        with open(U5_CONFIG, encoding='utf-8') as f: full = json.load(f)
        cls.cfg = full['charts']
        cls.warnings = []
        et._climate.clear()
        try:
            with mock.patch.object(et, 'charts_config', lambda: cls.cfg), mock.patch.object(et, 'unit_config', lambda: full):
                cls.charts = et.extract_charts(cls.warnings)
                cls.again = et.extract_charts([])
                cls.rows = et.climate_table()
        finally:
            et._climate.clear()

    def test_count_and_warnings(self):
        self.assertEqual(len(self.charts), 13)
        self.assertEqual(set(self.charts), set(self.cfg['items']))
        self.assertEqual(self.warnings, [])
        self.assertEqual(self.et.validate(self.charts, self.cfg), [])

    def test_climate(self):
        want = {'p45-barrow': ('배로', '툰드라', 'printed'), 'p45-newyork': ('뉴욕', '온난 습윤', 'printed'),
                'p45-bogota': ('보고타', '고산', 'printed'), 'p45-iquitos': ('이키토스', '열대 우림', 'measured')}
        for cid, (city, zone, method) in want.items():
            with self.subTest(cid):
                c = self.charts[cid]
                self.assertEqual((c['city'], c['climate']), (city, zone))
                self.assertEqual([len(s['values']) for s in c['series']], [12, 12])
                for s in c['series']:
                    self.assertEqual(s['method'], method)
                    if method == 'measured': self.assertIsInstance(s['precision'], float)
                if method == 'printed': self.assertLess(c['check']['maxPrecDiff'], 2.0)
        self.assertEqual(self.charts['p45-barrow']['series'][1]['values'], self.rows['배로']['prec'])
        self.assertEqual(self.charts['p45-newyork']['series'][0]['values'], self.rows['뉴욕']['temp'])
        self.assertNotIn('이키토스', self.rows)
        iq = self.charts['p45-iquitos']['series']
        self.assertTrue(all(24 < v < 28 for v in iq[0]['values']))                         # 열대 우림 — 기온이 고름(그림에서 보이는 것)
        self.assertEqual(iq[1]['values'].index(min(iq[1]['values'])), 7)                    # 8월 강수 가장 적음

    def test_stacked_100(self):
        b = self.charts['p46-us-ethnic']
        self.assertEqual(b['type'], 'stackedBar')
        self.assertEqual(b['categories'], ['1990년', '2020년'])
        self.assertEqual([s['name'] for s in b['series']], ['유럽계', '히스패닉', '아프리카계', '아시아계', '기타'])
        self.assertEqual([s['values'][0] for s in b['series']], [75.6, 11.7, 9.0, 2.8, 0.9])
        self.assertEqual([s['values'][1] for s in b['series']], [57.8, 18.7, 12.1, 6.1, 5.3])
        for k in range(2): self.assertAlmostEqual(sum(s['values'][k] for s in b['series']), 100, delta=0.1)
        self.assertLess(b['check']['maxAbsDiff'], 0.5)

    def test_rings_sum_100(self):
        want = {'p46-mexico': {'유럽계': 15, '혼혈': 64, '원주민': 18, '기타': 3}, 'p46-haiti': {'혼혈': 5, '아프리카계': 94, '기타': 1},
                'p46-brazil': {'유럽계': 48, '혼혈': 43, '아프리카계': 8, '기타': 1}, 'p46-peru': {'유럽계': 12, '혼혈': 32, '원주민': 52, '기타': 4},
                'p46-argentina': {'유럽계': 86, '혼혈': 7, '원주민': 3, '기타': 4}}
        for cid in U5_RINGS:
            with self.subTest(cid):
                r = self.charts[cid]
                self.assertEqual(r['type'], 'pie')
                self.assertEqual({s['name']: s['values'][0] for s in r['series']}, want[cid])
                self.assertAlmostEqual(r['check']['measuredSum'], 100, delta=0.5)
                self.assertTrue(0.45 < r['ring'] < 0.5)
                self.assertEqual(len(r['center']), 2)
        self.assertEqual(sorted(s['values'][0] for s in self.charts['p46-mexico']['series']), [3, 15, 18, 64])
        self.assertEqual(self.charts['p46-haiti']['center'], ['아이티', '(1,157)'])

    def test_measured(self):
        d = self.charts['p47-detroit']['series'][0]
        self.assertEqual(len(d['values']), 11); self.assertIn('precision', d)
        self.assertEqual(d['values'].index(max(d['values'])), 3)                            # 1950 이 가장 큼
        r = self.charts['p47-bpo-revenue']
        self.assertEqual(r['type'], 'bar'); self.assertEqual(len(r['series'][0]['values']), 16)
        self.assertEqual(r['colors'], {2021: '#00aaad'})
        self.assertGreater(r['series'][0]['values'][-1], r['series'][0]['values'][0])
        j = self.charts['p47-bpo-jobs']['series'][0]['values']
        self.assertEqual(len(j), 16); self.assertTrue(all(b >= a for a, b in zip(j, j[1:])))  # 고용 인원은 해마다 늚

    def test_deterministic(self):
        import json
        self.assertEqual(json.dumps(self.again, ensure_ascii=False, sort_keys=True), json.dumps(self.charts, ensure_ascii=False, sort_keys=True))


class ReaderU5Synthetic(unittest.TestCase):
    """U5-7 새 길의 순수 부분: valueGapEm 이 없으면 number_tokens 그대로, 있으면 그 빈칸에서 낱말을 나눔."""
    def test_value_tokens(self):
        from unittest import mock
        import charts_read as CR
        sentinel = [{'value': 1}]
        with mock.patch.object(CR.AX, 'number_tokens', lambda *a, **k: sentinel):
            self.assertIs(CR._value_tokens(46, [0, 0, 1, 1], 'DIN'), sentinel)
        got = {}
        def words(p, box, gap_em=None):
            got['gap'] = gap_em
            return [{'text': '1', 'font': 'DINPro'}, {'text': '5', 'font': 'DINPro'}, {'text': '아이티', 'font': 'DINPro'}, {'text': '7', 'font': 'Other'}]
        with mock.patch.object(CR.AX, 'words', words):
            self.assertEqual([t['value'] for t in CR._value_tokens(46, [0, 0, 1, 1], 'DIN', 0.05)], [1, 5])
        self.assertEqual(got['gap'], 0.05)


U6_CONFIG = os.path.join(os.path.dirname(__file__), '..', 'config', 'u6.json')


@NEED_PDF
class ChartsU6(unittest.TestCase):
    """U6-7 오세아니아·극지방 그래프 11: 기후 4(표 3·잰 값 1) · 범례 원 2 · 반원 2개 한 블록 · 두 축 선 · 해수면 점 5 · 표 2."""
    @classmethod
    def setUpClass(cls):
        import json
        from unittest import mock
        import extract_tables as et
        cls.et = et
        with open(U6_CONFIG, encoding='utf-8') as f: full = json.load(f)
        cls.cfg = full['charts']
        cls.warnings = []
        et._climate.clear()
        try:
            with mock.patch.object(et, 'charts_config', lambda: cls.cfg), mock.patch.object(et, 'unit_config', lambda: full):
                cls.charts = et.extract_charts(cls.warnings)
                cls.again = et.extract_charts([])
                cls.rows = et.climate_table()
        finally:
            et._climate.clear()

    def test_count_and_warnings(self):
        self.assertEqual(len(self.charts), 11)
        self.assertEqual(set(self.charts), set(self.cfg['items']))
        self.assertEqual(self.warnings, [])
        self.assertEqual(self.et.validate(self.charts, self.cfg), [])

    def test_climate(self):
        want = {'p53-darwin': ('다윈', '사바나', 'printed'), 'p53-alice': ('앨리스스프링스', '사막', 'measured'),
                'p53-perth': ('퍼스', '지중해성', 'printed'), 'p53-christchurch': ('크라이스트처치', '서안 해양성', 'printed')}
        for cid, (city, zone, method) in want.items():
            with self.subTest(cid):
                c = self.charts[cid]
                self.assertEqual((c['city'], c['climate']), (city, zone))
                self.assertEqual([len(s['values']) for s in c['series']], [12, 12])
                for s in c['series']: self.assertEqual(s['method'], method)
        self.assertEqual(self.charts['p53-perth']['series'][0]['values'], self.rows['퍼스']['temp'])
        self.assertEqual(self.charts['p53-christchurch']['series'][1]['values'], self.rows['크라이스트처치']['prec'])
        self.assertNotIn('앨리스스프링스', self.rows)
        self.assertLess(self.charts['p53-darwin']['check']['maxTempDiff'], 0.6)
        # 퍼스·크라이스트처치 그림은 표보다 7~8℃ 높게 그려짐(교과서 그림 — 결정 기록), 다윈은 맞음
        self.assertGreater(self.charts['p53-perth']['check']['maxTempDiff'], 7)
        a = self.charts['p53-alice']
        self.assertEqual(a['axes']['prec']['n'], 11)                                         # 오식 「350」(400 자리)을 바로잡아 눈금 11 모두
        t = a['series'][0]['values']; self.assertEqual(t.index(min(t)), 6)                    # 남반구 — 7월이 가장 추움
        self.assertTrue(all(isinstance(s['precision'], float) for s in a['series']))

    def test_pies_sum_100(self):
        for cid in ('p54-aus-exports', 'p54-nz-exports'):
            with self.subTest(cid):
                c = self.charts[cid]
                self.assertEqual(c['type'], 'pie'); self.assertNotIn('ring', c)
                self.assertAlmostEqual(sum(s['values'][0] for s in c['series']), 100, delta=0.15)
                self.assertLess(c['check']['maxAbsDiff'], 0.2)
        aus = self.charts['p54-aus-exports']
        self.assertEqual({s['name']: s['values'][0] for s in aus['series']},
                         {'석탄': 21.2, '철광석': 18.5, '천연가스': 13.5, '교육 관련 여행': 4.0, '금': 3.5, '기타': 39.3})
        self.assertEqual((aus['title'], aus['subtitle']), ('오스트레일리아(2022년)', '6,706(억 달러)'))
        nz = self.charts['p54-nz-exports']
        self.assertEqual([s['name'] for s in nz['series']], ['유제품', '육류', '목재', '과일', '밀 조제품', '기타'])
        self.assertEqual([s['values'][0] for s in nz['series']], [28.5, 13.6, 7.3, 5.3, 3.4, 41.9])

    def test_half_pies(self):
        h = self.charts['p54-partners']
        self.assertEqual(h['type'], 'halfPie'); self.assertEqual(len(h['items']), 2)
        a, b = h['items']
        self.assertEqual((a['label'], a['total'], a['orient']), ('1965년', '27(억 달러)', 'up'))
        self.assertEqual((b['label'], b['total'], b['orient']), ('2022년', '6,706(억 달러)', 'down'))
        for it in h['items']: self.assertAlmostEqual(sum(s['value'] for s in it['slices']), 100, delta=0.15)
        self.assertEqual([(s['name'], s['value']) for s in a['slices']],
                         [('영국', 19.2), ('일본', 16.4), ('미국', 9.9), ('뉴질랜드', 5.9), ('중국', 5.1), ('기타', 43.5)])
        self.assertEqual([(s['name'], s['value']) for s in b['slices']],
                         [('중국', 27.6), ('일본', 17.9), ('대한민국', 8.1), ('인도', 5.2), ('미국', 4.6), ('기타', 36.6)])
        self.assertLess(a['rRel'], b['rRel']); self.assertEqual(b['rRel'], 1.0)
        self.assertTrue(0.55 < a['rRel'] < 0.62)                                             # 교과서 잰 반지름 비(금액 비 아님 — Q13)

    def test_measured(self):
        d = self.charts['p54-temp-co2']
        self.assertEqual(d['type'], 'dualLine'); self.assertEqual(d['x'], list(range(1880, 2021)))
        self.assertEqual(d['xTicks'], list(range(1880, 2021, 20)))
        L, R = d['left'], d['right']
        self.assertEqual((L['label'], L['unit'], L['range'], R['label'], R['unit'], R['range']),
                         ('기온', '°C', [-0.3, 1.1], '이산화 탄소 농도', 'PPM', [270, 410]))
        self.assertEqual(len(L['values']), 141); self.assertEqual(len(R['values']), 141)
        self.assertEqual(L['values'][:2], [None, None])                                       # 빨간 선은 1882 부터
        self.assertTrue(all(v is not None for v in R['values']))
        self.assertGreater(R['values'][-1], R['values'][0])                                   # 이산화 탄소 늘어남
        self.assertTrue(all(b >= a - 0.5 for a, b in zip(R['values'], R['values'][1:])))
        self.assertGreater(L['values'][-1], 1.0)
        self.assertEqual(L['note'], '*1951~1980년 평균 온도 대비 변화')
        for k in (L, R): self.assertEqual(k['method'], 'measured'); self.assertIsInstance(k['precision'], float); self.assertIn('labelAt', k)
        s = self.charts['p54-sealevel']
        self.assertEqual(s['type'], 'line'); self.assertEqual(s['categories'], [2000, 2013, 2050, 2080, 2100])
        v = s['series'][0]['values']; self.assertEqual(len(v), 5); self.assertEqual(v, sorted(v)); self.assertTrue(70 < v[-1] < 80)

    def test_tables(self):
        t = self.charts['p54-plastic']
        self.assertEqual(t['type'], 'table')
        self.assertEqual(t['categories'][:5], ['연간 플라스틱 생산량', '연간 플라스틱 폐기량', '연간 플라스틱 유출량', '연간 플라스틱 강·해안 유출량',
                                               '연간 플라스틱 해양 유입량'])
        self.assertEqual(t['series'][0]['values'][:5], ['353 (백만 톤)', '82 (백만 톤)', '19 (백만 톤)', '6 (백만 톤)', '1.7 (백만 톤)'])
        self.assertEqual(t['categories'][5:], ['연간 플라스틱 생산량의 0.5%가 바다에 버려진다.', '수만 톤~수십만 톤의 해양 플라스틱 부유물'])
        r = self.charts['p55-route-stats']
        self.assertEqual(r['categories'], ['거리 단축', '운항 일수 단축', '거리와 시간 단축을 통한 물류비 절감'])
        self.assertEqual(r['series'][0]['values'], ['22,000 → 15,000km 32%', '40 → 30일 25%', ''])
        self.assertEqual(r['source'], '(한국 무역 협회, 2022)')

    def test_deterministic(self):
        import json
        self.assertEqual(json.dumps(self.again, ensure_ascii=False, sort_keys=True), json.dumps(self.charts, ensure_ascii=False, sort_keys=True))


class ReaderU6Synthetic(unittest.TestCase):
    """U6-7 새 길의 순수 부분: 「(%)」 붙은 수, 겹쳐 찍은 글자 하나로, 눈금 오식 바로잡기."""
    def test_pct_tokens(self):
        from unittest import mock
        import charts_read as CR
        ws = [{'text': '39.3(%)', 'font': 'DINPro', 'bbox': [0, 0, 5, 5]}, {'text': '4.0', 'font': 'DINPro', 'bbox': [10, 10, 12, 12]},
              {'text': '석탄', 'font': 'DINPro', 'bbox': [0, 0, 5, 5]}, {'text': '7', 'font': 'Other', 'bbox': [0, 0, 1, 1]}]
        with mock.patch.object(CR.AX, 'words', lambda p, box: ws):
            self.assertEqual([t['value'] for t in CR._pct_tokens(54, [0, 0, 99, 99], 'DIN')], [39.3, 4.0])
            self.assertEqual([t['value'] for t in CR._pct_tokens(54, [0, 0, 99, 99], 'DIN', exclude=[[9, 9, 13, 13]])], [39.3])

    def test_cell_text_dedupe(self):
        from unittest import mock
        import charts_read as CR
        w = lambda t, x, col: {'text': t, 'bbox': [x, 0, x + 10, 5], 'cx': x + 5, 'cy': 2.5, 'size': 6, 'color': col}
        ws = [w('거리', 0, '#ffffff'), w('거리', 0, '#fff200'), w('단축', 12, '#fff200')]
        with mock.patch.object(CR.AX, 'words', lambda p, box: list(ws)):
            self.assertEqual(len(CR.cell_text(55, [0, 0, 1, 1])[0].split('거리')), 3)          # 키가 없으면 두 번 찍은 글자 그대로(옛 길)
            self.assertEqual(CR.cell_text(55, [0, 0, 1, 1], dedupe=True), ['거리 단축'])

    def test_axis_fix(self):
        from unittest import mock
        import charts_read as CR
        toks = [{'value': v, 'cx': 0, 'cy': y, 'text': str(v)} for v, y in ((0, 40), (100, 30), (200, 20), (300, 10), (350, 0))]
        ctx = {'warnings': [], 'defaults': {'numberFont': 'DIN', 'colorDE': 0, 'snapTol': 1.5, 'axisResidTol': 0.6}}
        with mock.patch.object(CR.AX, 'number_tokens', lambda *a, **k: [dict(t) for t in toks]):
            ax, used = CR.axis('x', {'page': 1}, ctx, [0, 0, 1, 1], 'y', name='강수량', fix=[{'at': 0, 'from': 350, 'to': 400}])
        self.assertEqual(sorted(t['value'] for t in used), [0, 100, 200, 300, 400])   # 400 자리의 오식 「350」 → 400
        self.assertEqual(ctx['warnings'], [])
        self.assertAlmostEqual(ax.val(15), 250, delta=1e-6)


class PyramidRasterSynthetic(unittest.TestCase):
    """U4-7 리뷰 후속: read_pyramid_raster 의 화소 길을 PDF 없이 — 만든 배열(막대 길이·틈·가장자리 섞임·색 허용치를 아는 값)로."""
    MALE, FEMALE = '#fcbb76', '#f4858e'

    @staticmethod
    def _rgb(h):
        return np.array([int(h[k:k + 2], 16) for k in (1, 3, 5)], dtype=float)

    def _img(self):
        """200×100 화소, 흰 바탕. 가운데 0 열 = 100. 행 10~30 = 위 나이 줄, 행 60~80 = 아래 나이 줄."""
        img = np.full((100, 200, 3), 255.0)
        m, f = self._rgb(self.MALE), self._rgb(self.FEMALE)
        white = np.full(3, 255.0)
        # 아래 줄(어린 나이 — 먼저 읽힘): 남 = 60~99 + 59 열은 막대 색과 흰색 반반(덮인 몫 0.5), 여 = 100~129 에 틈 3화소(110~112 — gapPx 4 안)
        img[60:81, 60:100] = m; img[60:81, 59] = (m + white) / 2
        img[60:81, 100:130] = f; img[60:81, 110:113] = white
        # 위 줄: 남 = 90~99 다음 틈 6화소(84~89 — gapPx 넘음) 뒤 70~83 은 세지 않음,
        #        여 = 0 선 회색 3화소(100~102 — startTolPx 6 안) 뒤 103~119 는 색이 조금 다른 막대(ΔE ≤ 12), 120~139 는 회색(색 허용치 밖)
        img[10:31, 90:100] = m; img[10:31, 70:84] = m
        img[10:31, 100:103] = 150.0
        img[10:31, 103:120] = self._rgb('#f0888f'); img[10:31, 120:140] = 160.0
        return img

    def test_color_mask_tolerance(self):
        import charts_read as CR
        from atlas_common import lab
        img = np.array([[self._rgb(self.FEMALE), self._rgb('#f0888f'), np.full(3, 160.0), (self._rgb(self.FEMALE) + 255) / 2]])
        mask = CR._color_mask(lab(img.reshape(-1, 3)).reshape(1, 4, 3), self.FEMALE, 12)
        self.assertEqual(mask.tolist(), [[True, True, False, False]])

    def test_bar_run_gap_and_start(self):
        import charts_read as CR
        row = np.zeros(30, bool); row[10:20] = True; row[3:7] = True        # 틈 3화소(7~9)
        self.assertEqual(CR._bar_run(row, 19, -1, 4, 6), 3)                # 틈 4 안 → 끝까지 이어 봄
        self.assertEqual(CR._bar_run(row, 19, -1, 2, 6), 10)               # 틈 2 → 틈 앞에서 끝
        late = np.zeros(30, bool); late[10:20] = True                     # 시작 허용(6) 밖 빈 화소 3(7~9)이 틈(2)을 넘음
        self.assertEqual(CR._bar_run(late, 0, 1, 2, 6), None)
        self.assertEqual(CR._bar_run(late, 0, 1, 2, 9), 19)                # 시작 허용 9 → 빈 화소 0
        self.assertEqual(CR._bar_run(late, 0, 1, 3, 6), 19)                # 틈 3 → 이어 봄

    def test_row_edges_fraction(self):
        import charts_read as CR
        from atlas_common import lab
        img = self._img(); L = lab(img.reshape(-1, 3)).reshape(100, 200, 3)
        male = CR._color_mask(L, self.MALE, 12)
        ends = CR._row_edges_px(img, male, 60, 80, 100, -1, 4, 6)
        self.assertEqual(len(ends), 21)
        for e in ends: self.assertAlmostEqual(e, 59.5, places=6)           # 60 열 왼쪽 변에서 섞인 반 화소 더
        self.assertEqual(CR._row_edges_px(img, male, 40, 50, 100, -1, 4, 6), [])   # 막대 없는 행

    def test_reader_end_to_end(self):
        """가로축 1pt = 1%, 0 = 10pt, 화소 0.1pt — 아는 막대 길이가 %로 나오고, 막대 없는 줄은 경고."""
        from unittest import mock
        import charts_read as CR
        img = self._img()
        legend_box, label_box = [0, 0, 1, 1], [0, 0, 2, 2]
        labels = [{'text': '5~9', 'cy': 2.0}, {'text': '0~4', 'cy': 7.0}, {'text': '10~14', 'cy': 4.5}]

        class Ax:
            units_per_pt = 1.0
            def val(self, x): return x - 10.0
            def to_json(self): return {'k': 1}

        def lines(p, box):
            return [{'text': '남', 'cy': 0}, {'text': '여', 'cy': 0}] if box is legend_box else list(labels)

        c = {'type': 'pyramidRaster', 'page': 38, 'bbox': [0, 0, 20, 10], 'title': '시험', 'plotBox': [0, 0, 20, 10], 'dpi': 720,
             'xAxisBox': [0, 10, 20, 12], 'labelBox': label_box, 'legendBox': legend_box, 'rowHalfPt': 1.0, 'pixelDE': 12,
             'sumTol': 1000, 'series': [{'name': '남', 'color': self.MALE}, {'name': '여', 'color': self.FEMALE}]}
        ctx = {'warnings': [], 'defaults': {'numberFont': None, 'snapTol': 1.0}}
        with mock.patch.object(CR, '_render_rgb', lambda p, box, dpi: img), \
             mock.patch.object(CR, 'label_lines', lines), mock.patch.object(CR, 'text', lambda p, box: ''), \
             mock.patch.object(CR, 'x_ticks', lambda c: [6.0, 10.0, 14.0]), \
             mock.patch.object(CR.AX, 'number_tokens', lambda *a, **k: [{'cx': 10.1, 'value': 0, 'text': '0'}]), \
             mock.patch.object(CR, 'axis', lambda *a, **k: (Ax(), [{'text': '2.0'}])):
            out = CR.read_pyramid_raster('syn', c, ctx)
        self.assertEqual(out['type'], 'pyramid')
        self.assertEqual(out['categories'], ['0~4', '10~14', '5~9'])      # 아래(cy 큰 것)부터
        male, female = (s['values'] for s in out['series'])
        self.assertAlmostEqual(male[0], 4.05, places=6)                    # 59.5 화소 → 5.95pt → 4.05%
        self.assertAlmostEqual(female[0], 3.0, places=6)                   # 틈 3화소 건너 130 열 → 13pt
        self.assertIsNone(male[1]); self.assertIsNone(female[1])           # 4.5pt 줄(행 35~55)에는 막대 없음
        self.assertAlmostEqual(male[2], 1.0, places=6)                     # 틈 6화소에서 끊김 → 90 열 → 9pt
        self.assertAlmostEqual(female[2], 2.0, places=6)                   # 회색 0 선 건너 ΔE 안 막대 120 열까지, 회색 막대는 안 셈
        self.assertEqual(out['series'][0]['precision'], 0.1)
        self.assertEqual(sorted(ctx['warnings']), ['syn 남 10~14: 막대 화소 없음', 'syn 여 10~14: 막대 화소 없음'])
        self.assertAlmostEqual(out['check']['sum'], 10.05, places=6)

if __name__ == '__main__':
    unittest.main()
