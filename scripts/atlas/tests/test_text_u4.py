# © 2026 김용현
# scripts/atlas/tests/test_text_u4.py — U4-8 아프리카 주제 글(content/atlas/u4/topics.json)이 PDF 원문 그대로인지, 출처 목록·35쪽 글자 수 검사
# atlas_common 은 import 할 때 단원을 고르므로(u2 기본) u4 글 대조는 서브프로세스로 extract_text.py --unit u4 --check 를 돌린다.
import json, os, subprocess, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET
import atlas_common as A

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
HERE = os.path.dirname(os.path.abspath(__file__))
U4 = os.path.join(HERE, '..', 'config', 'u4.json')


def u4_content():
    with open(U4, encoding='utf-8') as f: return json.load(f)['content']


def run_u4(*args):
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    env.pop('ATLAS_UNIT_CONFIG', None)
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, '..', 'extract_text.py'), '--unit', 'u4', *args],
                          cwd=A.REPO, capture_output=True, text=True, encoding='utf-8', env=env, timeout=300)


class Files(unittest.TestCase):
    def test_dumps_matches_committed_files(self):
        # u4 원본 파일도 dumps 형식 그대로(--fill 로 다시 써도 바이트가 같음)
        c = u4_content()
        for k in ('topics', 'overrides'):
            p = ET.repo_path(c[k])
            with open(p, encoding='utf-8', newline='') as f: self.assertEqual(f.read(), ET.dumps(ET.read_json(p)) + '\n', k)

    def test_no_handwritten_text(self):
        # 글 칸(text·title·label·credit·note·legendTitle…)은 모두 출처 상자에서 — 손으로 적은 것은 블록 제목 「학습 목표」와 주제 제목(목차)뿐.
        # 교과서에 글자로 없는 범례 제목(자원 「주요 생산국」·태양광 그림 글자)은 overrides.json(from null + 까닭)에만.
        doc = ET.read_json(ET.repo_path(u4_content()['topics']))
        loose = []
        for path, o in ET.walk(doc):
            filled = {tk for _, tk in ET.src_fields(o)}
            for k in ('text', 'title', 'label', 'credit', 'note', 'legendTitle', 'lineLegendTitle'):
                if k not in o or k in filled: continue
                if k == 'title' and ('.' not in path or (o.get('role') == 'goal' and o[k] == '학습 목표')): continue
                loose.append(f'{path}.{k}')
        self.assertEqual(loose, [])

    def test_theme_activity_blocks(self):
        # 주제도 활동(38·39쪽): 문항 둘 — 첫 문항에만 활동 제목 상자, 원본 쪽 부분 보기 bbox 는 U4-6 이 잰 활동 상자
        doc = {t['id']: t for t in ET.read_json(ET.repo_path(u4_content()['topics']))}
        for tid, page, bbox in (('potential', 38, [30, 524, 750, 692]), ('sustainable', 39, [402, 499, 750, 692])):
            blocks = doc[tid]['blocks']
            theme = [b for b in blocks if b.get('role') == 'theme']
            self.assertEqual([b['id'] for b in theme], ['theme-1', 'theme-2'], tid)
            self.assertIn('titleSrc', theme[0]); self.assertNotIn('titleSrc', theme[1])
            self.assertTrue(all(b['src']['page'] == page for b in theme))
            self.assertIn({'id': f'page-{page}-part', 'type': 'page', 'page': page, 'bbox': bbox}, blocks)


@NEED_PDF
class ContentMatchesPdf(unittest.TestCase):
    def test_topics_text_is_verbatim(self):
        r = run_u4('--check')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('경고 없음', r.stdout)

    def test_expected_credits_match_pdf(self):
        exp = u4_content()['expectCredits']
        skip = {''.join(c.split()) for c in exp['notCredits']}
        not_printed = {''.join(c.split()) for c in exp.get('notPrinted', [])}
        for p in range(34, 40):
            found = [c for c in ET.printed_credits(p) if c not in skip]
            want = [''.join(c.split()) for c in exp.get(str(p), []) if ''.join(c.split()) not in not_printed]
            self.assertEqual(sorted(found), sorted(want), f'{p}쪽')

    def test_p35_labels(self):
        # 35쪽 나라 글자 57(초성 12.8pt 30 + 8.8pt 27 — 이름 21·작은 나라 초성 6) = 나라 54 + 서사하라 지역 1 + 두 줄 이름의 둘째 줄 2,
        # 수도 손글씨 27(7.5pt — 계획 어림 32·조각 「로」는 없음), 같은 손글씨 글꼴의 활동 글(9pt)·글머리(5pt)는 크기로 빠짐
        c = u4_content()['coloring']
        spans = pdfkit.page_spans(c['page'])
        countries = [s['text'] for s in spans if c['countryFont'] in s['font']]
        capitals = [s['text'] for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) < 0.2]
        self.assertEqual(len(countries), 57)
        self.assertEqual(sorted(round(s['size'], 1) for s in spans if c['countryFont'] in s['font']).count(12.8), 30)
        self.assertEqual(len(capitals), 27)
        self.assertNotIn('로', capitals)
        self.assertEqual(countries.count('ㄱㄴ'), 2)
        self.assertIn('서사하라', countries)
        for pair in c['joinLabels']:
            i = next(k for k in range(len(countries)) if countries[k:k + len(pair)] == pair); self.assertEqual(countries[i:i + len(pair)], pair)
        hand = [s for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) >= 0.2]
        self.assertEqual(sorted(round(s['size']) for s in hand), [5, 9])


if __name__ == '__main__':
    unittest.main()
