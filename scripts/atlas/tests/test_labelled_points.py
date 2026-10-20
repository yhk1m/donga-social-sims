# © 2026 김용현
# scripts/atlas/tests/test_labelled_points.py — 이름 붙은 점 기호(symbols.labelled_points 의 도우미): 31쪽 녹색 수도(공 그림자 + 「도시(연도)」),
#   리스본 사례(검은 점 + 지시선 + 초록 이름표 아래 값 두 개)
import os, sys, unittest

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import symbols as S


def span(text, bbox, size=6.0, color='#231f20'):
    return {'text': text, 'bbox': list(bbox), 'size': size, 'color': color}


class Helpers(unittest.TestCase):
    def test_cluster_rects_merges_pieces(self):
        # 한 그림자가 두 조각(코펜하겐), 따로 떨어진 그림자 하나
        rects = [[355.5, 377.8, 357.4, 379.2], [359.0, 378.6, 360.4, 380.4], [286.7, 396.3, 291.6, 398.9]]
        got = sorted(S.cluster_rects(rects, 4.0))
        self.assertEqual(len(got), 2)
        self.assertAlmostEqual(got[1][0], (355.5 + 360.4) / 2, places=2)

    def test_unique_spans_drop_stutter(self):
        sp = [span('낭트', (289.9, 423.0, 300.1, 428.7))] * 5 + [span('((((2013', (287.6, 428.6, 300.9, 434.8)), span('2013', (289.1, 428.6, 300.9, 434.6))]
        self.assertEqual(len(S.unique_spans(sp)), 3)

    def test_year_below_name(self):
        name = span('낭트', (289.9, 423.0, 300.1, 428.7), 5.7)
        sp = [span('((((((2013', (287.6, 428.6, 300.9, 434.8)), span('2013)', (289.1, 428.6, 302.4, 434.8)), span('(2010)', (372.1, 337.8, 386.9, 344.1))]
        self.assertEqual(S.year_below(name, sp), '2013')
        self.assertIsNone(S.year_below(span('라티', (405.6, 314.3, 415.8, 320.0)), sp))

    def test_values_below_tag(self):
        name = span('오슬로', (98.2, 570.8, 113.4, 576.5), 5.7, '#ffffff')
        sp = [span('5.47', (94.9, 578.1, 105.2, 584.1)), span('39.8', (113.0, 578.1, 123.3, 584.1)), span('1.16', (155.9, 578.1, 166.2, 584.1)),
              span('5.47', (94.9, 578.1, 105.2, 584.1))]
        self.assertEqual(S.values_below(name, sp, 2), ['5.47', '39.8'])
