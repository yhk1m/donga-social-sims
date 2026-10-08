# © 2026 김용현
# scripts/atlas/extract_text.py — 주제 원본(content/atlas/u2/topics.json)의 글을 교과서에서 원문 그대로 채우고 검사한다(C5).
#   python -I scripts/atlas/extract_text.py --fill     src 가 있는 글을 box_text 로 다시 채워 topics.json 에 쓴다
#   python -I scripts/atlas/extract_text.py --check    채워진 글이 PDF 원문과 같은지만 본다(다르면 종료 코드 1)
#   --fill·--check 가 경고 없이 끝나면 topics 도장(content.stamps.topics.stamp)을 남긴다. --labels 결과에는 inputsHash(stamps.labels).
#   python -I scripts/atlas/extract_text.py --labels   색칠하기 지도(content.coloring.page)의 나라 이름·수도 이름 글자 → $ATLAS_WORK/<content.labels>
#   (없으면 --labels --check). 경고가 있으면 종료 코드 1, 모르는 옵션은 2.
# 글 출처 표기: 어느 객체든 `src` = {page, bbox[, skip]} 이면 `text`, `<키>Src` 이면 `<키>`(예: titleSrc → title)를 box_text(page, bbox)로 채운다.
# skip = 글 앞에 붙어 나오는 다른 글(같은 줄 제목 등) — 정확히 그 글로 시작해야 하고, 떼어 낸다. 사람이 고친 값은 topics.json 이 아니라
# overrides.json 에 둔다(build_content.mjs 가 덮는다) — 그래서 --fill 은 언제 다시 돌려도 안전하다.
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit
from atlas_common import WORK, unit_config, stamp_hash, stamp_path

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
STEPS = ('fill', 'check', 'labels')


def content_config():
    return unit_config()['content']


def repo_path(rel): return os.path.join(ROOT, rel)


def src_fields(obj):
    """객체의 (원문 키, 채울 키) 목록: src → text, fooSrc → foo."""
    out = []
    for k, v in obj.items():
        if not isinstance(v, dict) or 'page' not in v or 'bbox' not in v: continue
        if k == 'src': out.append((k, 'text'))
        elif k.endswith('Src') and len(k) > 3: out.append((k, k[:-3]))
    return out


def walk(node, path=''):
    """(경로, 객체) 를 깊이 우선으로 모두 낸다(목록 순서 그대로)."""
    if isinstance(node, dict):
        yield path, node
        for k, v in node.items(): yield from walk(v, f'{path}.{k}' if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node): yield from walk(v, f'{path}[{i}]')


def source_text(src, getter):
    """src {page, bbox, skip?} → 원문 글. skip 으로 시작하지 않으면 ValueError."""
    s = getter(src['page'], src['bbox'])
    skip = src.get('skip')
    if skip:
        if not s.startswith(skip): raise ValueError(f'skip 「{skip}」으로 시작하지 않음: 「{s[:40]}」')
        s = s[len(skip):].strip()
    return s


def fill(doc, getter, write):
    """src 가 있는 모든 글을 원문으로 (write=True 면 채우고) 비교한다 → (바꾼 수, 경고 목록)."""
    changed, W = 0, []
    for path, obj in list(walk(doc)):
        for sk, tk in src_fields(obj):
            try: s = source_text(obj[sk], getter)
            except ValueError as e:
                W.append(f'{path}.{sk}: {e}'); continue
            if not s: W.append(f'{path}.{sk}: 영역에 글자가 없음 {obj[sk]}')
            if obj.get(tk) != s:
                if write: obj[tk] = s; changed += 1
                else: W.append(f'{path}.{tk}: 원문과 다름\n      지금: {obj.get(tk)!r}\n      원문: {s!r}')
    return changed, W


def box_getter(page, bbox): return pdfkit.box_text(page, bbox)


def p17_labels():
    """색칠하기 지도의 나라 이름(초성 또는 전체)·수도 이름 글자와 지면 상자."""
    c = content_config()['coloring']
    countries, capitals = [], []
    for s in pdfkit.page_spans(c['page']):
        if c['countryFont'] in s['font']: countries.append({'text': s['text'], 'bbox': s['bbox']})
        elif c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) < 0.2:
            capitals.append({'text': s['text'], 'bbox': s['bbox']})
    return {'page': c['page'], 'map': c['map'], 'countries': countries, 'capitals': capitals, 'inputsHash': stamp_hash('labels')}


_CREDIT = re.compile(r'\([^()]*?(?:19|20)\d\d\s*\)')


def printed_credits(page, max_size=7.2):
    """쪽에 인쇄된 출처 글(「(…, 2023)」꼴, 작은 글자)을 줄마다 찾아 공백을 지운 글 목록으로(겹친 것은 하나). 설정 content.expectCredits 대조용."""
    lines = {}
    for s in pdfkit.page_spans(page):
        if s['size'] < max_size: lines.setdefault(round((s['bbox'][1] + s['bbox'][3]) / 2), []).append(s)
    out = []
    for k in sorted(lines):
        t = ' '.join(s['text'] for s in sorted(lines[k], key=lambda s: s['bbox'][0]))
        for m in _CREDIT.finditer(t):
            c = ''.join(m.group(0).split())
            if c not in out: out.append(c)
    return out


def read_json(path):
    with open(path, encoding='utf-8') as f: return json.load(f)


def dumps(obj, indent=1, _level=0):
    """사람이 읽기 좋은 JSON: 들여쓰기 indent 칸, 숫자·글·참거짓·null 만 든 목록은 한 줄. 글자 값은 json.dumps 그대로(손대지 않음)."""
    pad, inner = ' ' * (indent * _level), ' ' * (indent * (_level + 1))
    if isinstance(obj, dict):
        if not obj: return '{}'
        items = [f'{inner}{json.dumps(k, ensure_ascii=False)}: {dumps(v, indent, _level + 1)}' for k, v in obj.items()]
        return '{\n' + ',\n'.join(items) + '\n' + pad + '}'
    if isinstance(obj, list):
        if not obj: return '[]'
        if all(not isinstance(v, (dict, list)) for v in obj):
            return '[' + ', '.join(json.dumps(v, ensure_ascii=False) for v in obj) + ']'
        return '[\n' + ',\n'.join(inner + dumps(v, indent, _level + 1) for v in obj) + '\n' + pad + ']'
    return json.dumps(obj, ensure_ascii=False)


def write_json(path, obj):
    """임시 파일 → os.replace(원자적). 내용이 같으면 쓰지 않는다(수정 시각을 지켜 뒤 단계의 낡은 산출물 검사가 헛돌지 않게)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = dumps(obj) + '\n'
    if os.path.exists(path):
        with open(path, encoding='utf-8', newline='') as f:
            if f.read() == text:
                print(f'  {path} (같음, 그대로)'); return
    tmp = path + '.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8', newline='\n') as f:   # 줄 끝 LF(운영체제와 상관없이 같은 바이트)
            f.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.remove(tmp)
    print(f'  {path} ({os.path.getsize(path):,} B)')


def parse_flags(argv):
    bad = [a for a in argv if not a.startswith('--') or a[2:] not in STEPS]
    if bad: raise ValueError(f'모르는 옵션: {" ".join(bad)} (쓸 수 있는 것: {" ".join("--" + s for s in STEPS)})')
    return {a[2:] for a in argv} or {'labels', 'check'}


def main(argv):
    try: flags = parse_flags(argv)
    except ValueError as e:
        print(e, file=sys.stderr); return 2
    W = []
    if 'labels' in flags:
        lab = p17_labels()
        print(f'{lab["page"]}쪽 나라 이름 {len(lab["countries"])}개, 수도 이름 {len(lab["capitals"])}개')
        write_json(os.path.join(WORK, content_config()['labels']), lab)
    if flags & {'fill', 'check'}:
        tpath = repo_path(content_config()['topics'])
        doc = read_json(tpath)
        n, ws = fill(doc, box_getter, write='fill' in flags)
        W += ws
        if 'fill' in flags:
            if ws: print('경고가 있어 topics.json 을 쓰지 않음')
            elif n: write_json(tpath, doc)
            print(f'원문으로 채운 글 {n}개')
        if not ws:   # 원문과 같음이 확인된 topics.json 의 도장(build_content.mjs 가 확인)
            st = content_config()['stamps']['topics']
            write_json(stamp_path(st['stamp']), {'inputsHash': stamp_hash('topics')})
    if W:
        print(f'\n경고 {len(W)}개:')
        for w in W: print('  - ' + w)
        return 1
    print('경고 없음')
    return 0


if __name__ == '__main__':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
    sys.exit(main(sys.argv[1:]))
