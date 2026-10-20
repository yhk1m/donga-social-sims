# © 2026 김용현
# scripts/atlas/tests/test_text_u3.py — U3-8 유럽 주제 글(content/atlas/u3/topics.json)이 PDF 원문 그대로인지, 출처 목록·27쪽 글자 수 검사
# atlas_common 은 import 할 때 단원을 고르므로(u2 기본) u3 글 대조는 서브프로세스로 extract_text.py --unit u3 --check 를 돌린다.
import json, os, subprocess, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET
import atlas_common as A

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
HERE = os.path.dirname(os.path.abspath(__file__))
U3 = os.path.join(HERE, '..', 'config', 'u3.json')


def u3_content():
    with open(U3, encoding='utf-8') as f: return json.load(f)['content']


def run_u3(*args):
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    env.pop('ATLAS_UNIT_CONFIG', None)
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, '..', 'extract_text.py'), '--unit', 'u3', *args],
                          cwd=A.REPO, capture_output=True, text=True, encoding='utf-8', env=env, timeout=300)


class Files(unittest.TestCase):
    def test_dumps_matches_committed_files(self):
        # u3 원본 파일도 dumps 형식 그대로(--fill 로 다시 써도 바이트가 같음)
        c = u3_content()
        for k in ('topics', 'overrides'):
            p = ET.repo_path(c[k])
            with open(p, encoding='utf-8', newline='') as f: self.assertEqual(f.read(), ET.dumps(ET.read_json(p)) + '\n', k)

    def test_no_handwritten_text(self):
        # 글 칸(text·title·label·credit·note·legendTitle…)은 모두 출처 상자에서 — 손으로 적은 것은 블록 제목 「학습 목표」뿐(1단계와 같음)
        # 주제 제목(목차 이름, 맨 위 [i].title)도 1단계와 같이 손으로 둔다.
        doc = ET.read_json(ET.repo_path(u3_content()['topics']))
        loose = []
        for path, o in ET.walk(doc):
            filled = {tk for _, tk in ET.src_fields(o)}
            for k in ('text', 'title', 'label', 'credit', 'note', 'legendTitle', 'lineLegendTitle'):
                if k not in o or k in filled: continue
                if k == 'title' and ('.' not in path or (o.get('role') == 'goal' and o[k] == '학습 목표')): continue
                loose.append(f'{path}.{k}')
        self.assertEqual(loose, [])


@NEED_PDF
class ContentMatchesPdf(unittest.TestCase):
    def test_topics_text_is_verbatim(self):
        r = run_u3('--check')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('경고 없음', r.stdout)

    def test_expected_credits_match_pdf(self):
        exp = u3_content()['expectCredits']
        skip = {''.join(c.split()) for c in exp['notCredits']}
        not_printed = {''.join(c.split()) for c in exp.get('notPrinted', [])}
        for p in range(26, 34):
            found = [c for c in ET.printed_credits(p) if c not in skip]
            want = [''.join(c.split()) for c in exp.get(str(p), []) if ''.join(c.split()) not in not_printed]
            self.assertEqual(sorted(found), sorted(want), f'{p}쪽')

    def test_p27_labels(self):
        # 27쪽 나라 글자 48(이름·초성) = 나라 46 + 「(러)」 소속 표시 + 두 줄 「보스니아 / 헤르체고비나」의 한 줄, 수도 손글씨 32
        c = u3_content()['coloring']
        spans = pdfkit.page_spans(c['page'])
        countries = [s['text'] for s in spans if c['countryFont'] in s['font']]
        capitals = [s['text'] for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) < 0.2]
        self.assertEqual(len(countries), 48)
        self.assertEqual(len(capitals), 32)
        for g in c['ignoreLabels']: self.assertIn(g, countries)
        for pair in c['joinLabels']:
            i = countries.index(pair[0]); self.assertEqual(countries[i:i + len(pair)], pair)


if __name__ == '__main__':
    unittest.main()
