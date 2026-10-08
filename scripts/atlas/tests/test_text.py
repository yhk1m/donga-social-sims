# © 2026 김용현
# scripts/atlas/tests/test_text.py — C5 주제 글 채우기(extract_text.py) 검사
import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class Fill(unittest.TestCase):
    def fake(self, page, bbox): return {1: '제목 본문 글', 2: '둘째 글'}[page]

    def test_src_fields(self):
        o = {'src': {'page': 1, 'bbox': [0, 0, 1, 1]}, 'titleSrc': {'page': 2, 'bbox': [0, 0, 1, 1]}, 'Src': {'page': 1, 'bbox': []},
             'other': {'page': 1}}
        self.assertEqual(sorted(ET.src_fields(o)), [('src', 'text'), ('titleSrc', 'title')])

    def test_fill_and_check(self):
        doc = {'a': [{'src': {'page': 1, 'bbox': [0, 0, 1, 1], 'skip': '제목'}}, {'titleSrc': {'page': 2, 'bbox': [0, 0, 1, 1]}}]}
        n, w = ET.fill(doc, self.fake, write=False)
        self.assertEqual((n, len(w)), (0, 2))                  # 비어 있으면 다르다고 알린다
        n, w = ET.fill(doc, self.fake, write=True)
        self.assertEqual((n, w), (2, []))
        self.assertEqual(doc['a'][0]['text'], '본문 글')        # skip 을 떼고 앞뒤 공백 정리
        self.assertEqual(doc['a'][1]['title'], '둘째 글')
        self.assertEqual(ET.fill(doc, self.fake, write=False), (0, []))

    def test_skip_must_match(self):
        doc = {'src': {'page': 2, 'bbox': [0, 0, 1, 1], 'skip': '제목'}}
        n, w = ET.fill(doc, self.fake, write=True)
        self.assertEqual(n, 0); self.assertEqual(len(w), 1); self.assertNotIn('text', doc)

    def test_dumps_compact_lists(self):
        s = ET.dumps({'bbox': [1, 2.5, 3, 4], 'names': ['a, b', 'c'], 'objs': [{'x': 1}]})
        self.assertIn('"bbox": [1, 2.5, 3, 4]', s)
        self.assertIn('"names": ["a, b", "c"]', s)
        self.assertEqual(json.loads(s)['objs'], [{'x': 1}])

    def test_parse_flags(self):
        self.assertEqual(ET.parse_flags([]), {'labels', 'check'})
        with self.assertRaises(ValueError): ET.parse_flags(['--nope'])


@NEED_PDF
class ContentMatchesPdf(unittest.TestCase):
    def test_topics_text_is_verbatim(self):
        doc = ET.read_json(ET.repo_path(ET.content_config()['topics']))
        n, w = ET.fill(doc, ET.box_getter, write=False)
        self.assertEqual(w, [], '\n'.join(w))
        self.assertGreater(sum(1 for _, o in ET.walk(doc) for _ in ET.src_fields(o)), 60)

    def test_p17_labels(self):
        lab = ET.p17_labels()
        self.assertEqual(len(lab['countries']), 46)
        self.assertEqual(len(lab['capitals']), 25)
        self.assertIn('ㄷㅎㅁㄱ', [c['text'] for c in lab['countries']])


if __name__ == '__main__':
    unittest.main()
