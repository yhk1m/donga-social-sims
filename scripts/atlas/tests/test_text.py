# © 2026 김용현
# scripts/atlas/tests/test_text.py — C5 주제 글 채우기(extract_text.py) 검사
import json, os, subprocess, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET
import atlas_common as A

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
        s = ET.dumps({'bbox': [1, 2.5, 3, 4], 'names': ['a, b', 'c'], 'objs': [{'x': 1}], 'e': [], 'd': {}})
        self.assertIn('"bbox": [1, 2.5, 3, 4]', s)
        self.assertIn('"names": ["a, b", "c"]', s)
        self.assertEqual(json.loads(s), {'bbox': [1, 2.5, 3, 4], 'names': ['a, b', 'c'], 'objs': [{'x': 1}], 'e': [], 'd': {}})

    def test_dumps_leaves_strings_alone(self):
        # 글 안의 「[ 1,  2 ]」 같은 모양을 목록으로 보고 고치면 안 된다(원문 보존)
        doc = {'text': '값은 [ 1,  2 ] 과 ["a",\n "b"] 이다', 'list': [[1, 2], ['[ 3 ]', ' x ']]}
        self.assertEqual(json.loads(ET.dumps(doc)), doc)
        self.assertIn('[ 1,  2 ]', ET.dumps(doc))

    def test_dumps_matches_committed_files(self):
        # 지금 원본 파일은 dumps 형식 그대로다(다시 써도 바이트가 같음)
        for k in ('topics', 'overrides'):
            p = ET.repo_path(ET.content_config()[k])
            with open(p, encoding='utf-8', newline='') as f: self.assertEqual(f.read(), ET.dumps(ET.read_json(p)) + '\n', k)

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

    def test_expected_credits_match_pdf(self):
        # 설정의 출처 목록 = 지면에서 찾은 출처 글(같은 꼴이지만 출처가 아닌 notCredits 는 뺌)
        exp = ET.content_config()['expectCredits']
        skip = {''.join(c.split()) for c in exp['notCredits']}
        for p in range(16, 26):
            found = [c for c in ET.printed_credits(p) if c not in skip]
            want = [''.join(c.split()) for c in exp.get(str(p), [])]
            self.assertEqual(sorted(found), sorted(want), f'{p}쪽')

    def test_p17_labels(self):
        lab = ET.p17_labels()
        self.assertEqual(len(lab['countries']), 46)
        self.assertEqual(len(lab['capitals']), 25)
        self.assertIn('ㄷㅎㅁㄱ', [c['text'] for c in lab['countries']])


class Stamps(unittest.TestCase):
    def test_canon_json(self):
        self.assertEqual(A.canon_json({'b': 1.0, 'a': [True, None, 'ㄱ'], '_doc': 'x', 'c': 0.5}), '{"a":[true,null,"ㄱ"],"b":1,"c":0.5}')

    def test_same_hash_as_node(self):
        # Python(atlas_common.stamp_hash) 와 Node(geo_util.stampHash) 가 모든 도장에서 같은 값
        js = ("import('./scripts/atlas/geo_util.mjs').then((g) => { const u = JSON.parse(require('fs').readFileSync('scripts/atlas/config/u2.json', 'utf8'));"
              " console.log(JSON.stringify(Object.fromEntries(Object.keys(u.content.stamps).filter((k) => !k.startsWith('_')).map((k) => [k, g.stampHash(u, k)])))); })")
        try: r = subprocess.run(['node', '-e', js], cwd=A.REPO, capture_output=True, text=True, encoding='utf-8', timeout=120)
        except FileNotFoundError: self.skipTest('node 없음')
        self.assertEqual(r.returncode, 0, r.stderr)
        node = json.loads(r.stdout)
        self.assertEqual(node, {k: A.stamp_hash(k) for k in node})


if __name__ == '__main__':
    unittest.main()
