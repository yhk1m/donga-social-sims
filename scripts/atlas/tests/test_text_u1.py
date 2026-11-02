# © 2026 김용현
# scripts/atlas/tests/test_text_u1.py — U1-8 세계화 주제 글(content/atlas/u1/topics.json)이 PDF 원문 그대로인지, 출처 목록·손글 없음·고침 검사
# atlas_common 은 import 할 때 단원을 고르므로(u2 기본) u1 글 대조는 서브프로세스로 extract_text.py --unit u1 --check 를 돌린다.
import json, os, subprocess, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET
import atlas_common as A

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
HERE = os.path.dirname(os.path.abspath(__file__))
U1 = os.path.join(HERE, '..', 'config', 'u1.json')


def u1_content():
    with open(U1, encoding='utf-8') as f: return json.load(f)['content']


def run_u1(*args):
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    env.pop('ATLAS_UNIT_CONFIG', None); env.pop('ATLAS_UNIT', None)
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, '..', 'extract_text.py'), '--unit', 'u1', *args],
                          cwd=A.REPO, capture_output=True, text=True, encoding='utf-8', env=env, timeout=300)


def topics():
    return {t['id']: t for t in ET.read_json(ET.repo_path(u1_content()['topics']))}


class Files(unittest.TestCase):
    def test_dumps_matches_committed_files(self):
        # u1 원본 파일도 dumps 형식 그대로(--fill 로 다시 써도 바이트가 같음)
        c = u1_content()
        for k in ('topics', 'overrides'):
            p = ET.repo_path(c[k])
            with open(p, encoding='utf-8', newline='') as f: self.assertEqual(f.read(), ET.dumps(ET.read_json(p)) + '\n', k)

    def test_no_handwritten_text(self):
        # 글 칸(text·title·label·credit·note·legendTitle…)은 모두 출처 상자에서 — 손으로 적은 것은 블록 제목 「학습 목표」와 주제 제목(목차)뿐.
        # 깨진 글(가운뎃점 빈칸·핀 그림 번호·글머리 글리프·표 칸 이음)과 지면 글자가 없는 8·9쪽 바로가기 이름은 overrides.json(from + 까닭)에만.
        doc = ET.read_json(ET.repo_path(u1_content()['topics']))
        loose = []
        for path, o in ET.walk(doc):
            filled = {tk for _, tk in ET.src_fields(o)}
            for k in ('text', 'title', 'label', 'credit', 'note', 'legendTitle', 'lineLegendTitle'):
                if k not in o or k in filled: continue
                if k == 'title' and ('.' not in path or (o.get('role') == 'goal' and o[k] == '학습 목표')): continue
                if path.endswith('.source'): continue   # 기후 그래프 마커 위치 출처(Natural Earth 지점 이름 — 화면 글이 아닌 자료 출처, u2 세계유산 source 와 같은 꼴)
                loose.append(f'{path}.{k}')
        self.assertEqual(loose, [])

    def test_activity_section_and_page_blocks(self):
        # 활동하기 1·2(12·13쪽 — 제목 상자 + 문항 상자), 주제도 활동(15쪽 — role theme), 12·13쪽 상자 소제목 넷씩(사진 설정 _section),
        # 원본 쪽 부분 보기 = 9·11쪽 지구본 열, 14쪽 작아지는 지구·삽화 셋(교사 Q11·Q12 A), 15쪽 주제도 활동 상자
        doc = topics()
        acts = {tid: [b for b in t['blocks'] if b['type'] == 'activity' and b.get('role') != 'theme'] for tid, t in doc.items()}
        for tid in ('relief', 'climate'):
            self.assertEqual(len(acts[tid]), 1, tid)
            self.assertIn('titleSrc', acts[tid][0]); self.assertIn('src', acts[tid][0])
        self.assertEqual(len(acts['continents']), 1)
        theme = [b for b in doc['themeActivity']['blocks'] if b.get('role') == 'theme']
        self.assertEqual(len(theme), 1); self.assertIn('titleSrc', theme[0])
        parts = [(tid, b['page'], b['bbox']) for tid, t in doc.items() for b in t['blocks'] if b['type'] == 'page' and 'bbox' in b]
        self.assertEqual(parts, [('general', 9, [626, 25, 760, 700]), ('continents', 11, [626, 25, 760, 700]),
                                 ('connection', 14, [30, 96, 382, 355]), ('connection', 14, [32, 389, 200, 493]),
                                 ('connection', 14, [211, 389, 379, 493]), ('connection', 14, [32, 554, 200, 658]),
                                 ('themeActivity', 15, [30, 495, 760, 700])])
        self.assertEqual([t['title'] for t in doc.values()], ['세계 일반도', '대륙과 대양', '지형', '기후', '세계의 연결', '공간적 상호 작용', '세계화와 지역화', '주제도 활동'])
        cfg = json.load(open(U1, encoding='utf-8'))
        sec = {it['id']: it['_section'].split(' ', 1)[1] for it in cfg['photos']['items']}
        for tid, pre in (('relief', 'p12-'), ('climate', 'p13-'), ('glocal', 'p15-')):
            cur, seen = None, []
            for b in doc[tid]['blocks']:
                if b.get('role') == 'section': cur = b['text']
                elif b['type'] == 'photo': seen.append((b['ref'], cur))
            self.assertEqual(seen, [(pid, sec[pid]) for pid in sec if pid.startswith(pre)], tid)   # 사진 블록은 자기 상자 소제목 아래, 설정 차례

    def test_overrides_from_match_topics(self):
        # overrides 의 from 이 지금 topics.json 값과 같음(build_content 「낡은 고침」 검사와 같은 뜻 — 원문 추출이 바뀌면 여기서 먼저 멈춤)
        c = u1_content()
        doc = topics()
        items = ET.read_json(ET.repo_path(c['overrides']))['items']
        for k, o in items.items():
            tid, kind, *rest = k.split('.')
            if kind == 'blocks': obj = next(b for b in doc[tid]['blocks'] if b['id'] == rest[0])
            elif kind == 'views': obj = next(v for v in doc[tid]['views'] if v['id'] == rest[0])
            elif kind == 'layers':
                ref = '.'.join(rest[:-1]); obj = next(l for l in doc[tid]['layers'] if l['ref'] == ref); rest = [ref, rest[-1]]
            else: self.fail(k)
            self.assertEqual(obj.get(rest[-1]), o['from'], k)
            self.assertGreater(len(o.get('why', '')), 20, k)


@NEED_PDF
class ContentMatchesPdf(unittest.TestCase):
    def test_topics_text_is_verbatim(self):
        r = run_u1('--check')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('경고 없음', r.stdout)

    def test_expected_credits_match_pdf(self):
        exp = u1_content()['expectCredits']
        skip = {''.join(c.split()) for c in exp['notCredits']}
        not_printed = {''.join(c.split()) for c in exp.get('notPrinted', [])}
        for p in range(8, 16):
            found = [c for c in ET.printed_credits(p) if c not in skip]
            want = [''.join(c.split()) for c in exp.get(str(p), []) if ''.join(c.split()) not in not_printed]
            self.assertEqual(sorted(found), sorted(want), f'{p}쪽')

    def test_ieodo_label_points_match_page(self):
        # U1-8: p08-stations 에 더한 「이어도 / 종합 해양 과학 기지」 = 8쪽 글자 줄 상자 가운데(4.9pt 명조)
        cfg = json.load(open(U1, encoding='utf-8'))
        lp = {x['text']: x for x in cfg['layers']['p08-stations']['labelPoints']}
        runs = [r for r in pdfkit.text_runs(8, [621, 226, 666, 239])]
        self.assertTrue(runs)
        for name, box in (('이어도', [624, 228, 640, 234]), ('종합 해양 과학 기지', [623, 233, 665, 239])):
            self.assertEqual(pdfkit.box_text(8, box), name)
            cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            self.assertLess(abs(lp[name]['xy'][0] - cx), 3, name); self.assertLess(abs(lp[name]['xy'][1] - cy), 2, name)
            self.assertEqual(lp[name]['size'], 4.9)


if __name__ == '__main__':
    unittest.main()
