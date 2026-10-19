# © 2026 김용현
# scripts/atlas/tests/test_features.py — 주제도 내용 뽑기(atlas_common·legend) 검사
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import atlas_common as C
import legend as LG
from shapely.geometry import Polygon

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class Colors(unittest.TestCase):
    def test_delta_e(self):
        self.assertAlmostEqual(C.delta_e('#ffffff', '#ffffff'), 0.0)
        self.assertGreater(C.delta_e('#d71920', '#0bb14b'), 50)

    def test_match_color_exact_then_nearest(self):
        leg = [{'cls': 'c1', 'color': '#f5eeba'}, {'cls': 'c2', 'color': '#78b6e4'}]
        self.assertEqual(C.match_color('#78b6e4', leg, 6)['cls'], 'c2')
        self.assertEqual(C.match_color('#f5eebb', leg, 6)['cls'], 'c1')
        self.assertIsNone(C.match_color('#ff0000', leg, 6))


class Geometry(unittest.TestCase):
    def test_polygonal_flattens_collections(self):
        bow = Polygon([(0, 0), (2, 2), (2, 0), (0, 2)])   # 자기 교차 → make_valid 가 다중 면으로
        g = C.polygonal(bow)
        self.assertIsNotNone(g)
        self.assertAlmostEqual(g.area, 2.0)


class Config(unittest.TestCase):
    def test_every_layer_has_map_and_mode(self):
        for lid in C.layer_ids():
            cfg = C.layer_config(lid)
            self.assertIn(cfg['map'], C.maps(), lid)
            self.assertTrue(cfg.get('mode') or cfg.get('source') == 'ne', lid)
            self.assertIn('expectLegend', cfg, lid)


@NEED_PDF
class Legends(unittest.TestCase):
    def test_growth_legend(self):
        leg = LG.legend(C.maps()['p23-growth'], C.layer_config('p23-growth'))
        self.assertEqual([e['label'] for e in leg],
                         ['1.5 이상', '1.0~1.5', '0.5~1.0', '0~0.5', '-0.5~0', '-1.0~-0.5', '-1.0 이하'])

    def test_climate_legend_columns_and_hatch(self):
        cfg = C.layer_config('p21-climate'); m = C.maps()['p21-climate']
        leg = LG.legend(m, cfg)
        self.assertEqual(len(leg), 13)
        self.assertEqual(leg[0]['label'], '열대 우림 기후')
        self.assertEqual(leg[5]['label'], '온난 습윤 기후')   # 범례 안 '80˚E' 눈금 글자는 빠진다
        h = LG.hatch_legend(m, cfg['hatch'])
        self.assertEqual(h['label'], '고산 기후')
        self.assertEqual(h['pattern'], 'hatch')

    def test_trade_legend_rows_and_flow_widths(self):
        cfg = C.layer_config('p24-trade'); m = C.maps()['p24-trade']
        self.assertEqual([e['label'] for e in LG.legend(m, cfg)], ['0~1', '1~3', '3~5', '5~10', '10~50', '50~100', '100 이상'])
        self.assertEqual(LG.flow_legend(m, '#ed0c6e'), [(0.6, '1~2'), (1.0, '2~5'), (1.5, '5~10'), (2.0, '10 이상')])
        self.assertEqual(LG.legend_unit(m, cfg['flows']['unitTextRe']), '백억 달러, 2022')


if __name__ == '__main__':
    unittest.main()
