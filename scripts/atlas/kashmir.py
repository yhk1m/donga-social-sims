# © 2026 김용현
# scripts/atlas/kashmir.py — p22-kashmir 레이어를 Natural Earth 실제 경계 자료로 만든다(교과서 도형은 양식화돼 쓰지 않음)
#   python -I scripts/atlas/kashmir.py            → $ATLAS_WORK/geo/p22-kashmir.raw.geojson
#   python -I scripts/atlas/kashmir.py --verify <layer.json> <out.png>  → 교과서 지도 | 레이어 나란히 그림
# 자료($ATLAS_WORK/raw/ne/, github.com/nvkelso/natural-earth-vector geojson/):
#   ne_10m_admin_0_disputed_areas        분쟁 지역 면(실제 관할 기준)
#   ne_10m_admin_0_countries_{pak,ind,chn} 각 나라 관점(POV)의 국경 → '○○이 주장하는 국경'
#   ne_10m_admin_0_boundary_lines_land    '인도–파키스탄 정전 라인'(Line of control)
# 교과서(22쪽)에서는 이름·색·범례 글만 가져온다. 종교 비율 면(이슬람교·힌두교·불교 비율이 높은 지역)은
# Natural Earth 에 대응 자료가 없어 도형 없이 범례 항목(geometry:false)으로만 남긴다.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, linemerge

WORK = os.environ.get('ATLAS_WORK', 'C:/Users/Public/atlas-work')
NE = os.path.join(WORK, 'raw', 'ne')
SOURCE = 'Natural Earth 10m (disputed areas, POV countries, boundary lines) — 교과서는 이름·색·범례만'

# 관할 면(교과서 지도 글자) — 색은 교과서의 해당 나라 주장 국경 색을 옅게 한 것
AREAS = [
    ('pak-admin', '파키스탄 지배 지역', '#c9e5d2', ('Azad Kashmir', 'Gilgit-Baltistan')),
    ('ind-admin', '인도 지배 지역', '#c7dff0', ('Jammu and Kashmir', 'Siachen Glacier')),
    ('chn-admin', '중국-인도 분쟁 지역', '#f9dcc0', ('Aksai Chin', 'Shaksam Valley')),
]
# 교과서 범례(22쪽 [510,567,734,608]) 색·글
CLAIMS = [
    ('claim-pak', '파키스탄이 주장하는 국경', '#02944a', 'pak', 'Pakistan'),
    ('claim-ind', '인도가 주장하는 국경', '#0080b7', 'ind', 'India'),
    ('claim-chn', '중국이 주장하는 국경', '#f79548', 'chn', 'China'),
]
LOC = ('loc', '인도-파키스탄 정전 라인', '#ef5ba1')
RELIGION = [('rel-islam', '이슬람교 비율이 높은 지역', '#82c2a9'), ('rel-hindu', '힌두교 비율이 높은 지역', '#94c5e1'),
            ('rel-buddhism', '불교 비율이 높은 지역', '#e6cc8a')]
WINDOW_PAD = 0.25   # 분쟁 지역 둘레 이만큼(°) 안의 국경만 그린다


def load(name):
    with open(os.path.join(NE, f'{name}.geojson'), encoding='utf-8') as f:
        return json.load(f)['features']


def valid(g):
    return g if g.is_valid else shapely.make_valid(g)


def build():
    disp = {f['properties']['BRK_NAME']: valid(shape(f['geometry'])) for f in load('ne_10m_admin_0_disputed_areas')}
    feats = []
    allarea = []
    for cls, label, color, names in AREAS:
        miss = [n for n in names if n not in disp]
        if miss: raise SystemExit(f'Natural Earth 분쟁 지역 없음: {miss}')
        g = unary_union([disp[n] for n in names])
        allarea.append(g)
        feats.append({'type': 'Feature', 'geometry': mapping(g),
                      'properties': {'type': 'area', 'cls': cls, 'label': label, 'color': color, 'ne': list(names)}})
    window = unary_union(allarea).buffer(WINDOW_PAD)
    for cls, label, color, pov, admin in CLAIMS:
        ctry = [f for f in load(f'ne_10m_admin_0_countries_{pov}') if f['properties']['ADMIN'] == admin]
        g = valid(unary_union([shape(f['geometry']) for f in ctry]))
        line = g.boundary.intersection(window)
        line = linemerge(line) if line.geom_type == 'MultiLineString' else line
        feats.append({'type': 'Feature', 'geometry': mapping(line),
                      'properties': {'type': 'line', 'cls': cls, 'label': label, 'color': color, 'pov': pov}})
    locs = [shape(f['geometry']) for f in load('ne_10m_admin_0_boundary_lines_land')
            if str(f['properties'].get('FEATURECLA', '')).startswith('Line of control')]
    loc = linemerge(unary_union(locs).intersection(window))
    feats.append({'type': 'Feature', 'geometry': mapping(loc),
                  'properties': {'type': 'line', 'cls': LOC[0], 'label': LOC[1], 'color': LOC[2], 'dashed': True}})
    legend = ([{'cls': c, 'label': l, 'color': col, 'kind': 'fill'} for c, l, col, _ in AREAS] +
              [{'cls': c, 'label': l, 'color': col, 'kind': 'line'} for c, l, col, _, _ in CLAIMS] +
              [{'cls': LOC[0], 'label': LOC[1], 'color': LOC[2], 'kind': 'line', 'dashed': True}] +
              [{'cls': c, 'label': l, 'color': col, 'kind': 'fill', 'geometry': False} for c, l, col in RELIGION])
    gj = {'type': 'FeatureCollection',
          'properties': {'id': 'p22-kashmir', 'source': SOURCE, 'note': '위치: 실제 경계 자료', 'legend': legend},
          'features': feats}
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    out = os.path.join(WORK, 'geo', 'p22-kashmir.raw.geojson')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(gj, f, ensure_ascii=False)
    print(out, len(feats))


def verify(layer_path, out_png):
    """교과서 지도(왼쪽)와 레이어를 정거 원통(cos 위도 보정)으로 그린 그림(오른쪽)을 나란히."""
    import pdfkit
    from PIL import Image, ImageDraw
    with open(layer_path, encoding='utf-8') as f:
        gj = json.load(f)
    tmp = out_png + '.src.png'
    pdfkit.render_clip(22, [509, 458, 736, 566], 250, tmp)
    left = Image.open(tmp).convert('RGB')
    W, H = left.size
    right = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(right)
    lon0, lon1, lat0, lat1 = 72.3, 80.8, 32.0, 37.3
    import math
    k = math.cos(math.radians(34.5))
    sx = (W - 20) / ((lon1 - lon0) * k); sy = (H - 20) / (lat1 - lat0); sc = min(sx, sy)
    P = lambda p: (10 + (p[0] - lon0) * k * sc, 10 + (lat1 - p[1]) * sc)
    rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    for ft in gj['features']:
        g = ft['geometry']; pr = ft['properties']
        if g['type'] in ('Polygon', 'MultiPolygon'):
            for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
                d.polygon([P(p) for p in poly[0]], fill=rgb(pr['color']), outline=(90, 90, 90))
    for ft in gj['features']:
        g = ft['geometry']; pr = ft['properties']
        if g['type'] in ('LineString', 'MultiLineString'):
            for L in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]):
                d.line([P(p) for p in L], fill=rgb(pr['color']), width=3 if not pr.get('dashed') else 2)
    both = Image.new('RGB', (W * 2 + 6, H), (120, 120, 120))
    both.paste(left, (0, 0)); both.paste(right, (W + 6, 0))
    d = ImageDraw.Draw(both)
    d.rectangle([0, 0, 330, 14], fill=(255, 255, 255)); d.text((4, 2), 'p22-kashmir: textbook | Natural Earth layer (equirect.)', fill=(0, 0, 0))
    both.save(out_png)
    os.remove(tmp)
    print(out_png, both.size)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) > 1 and sys.argv[1] == '--verify': verify(sys.argv[2], sys.argv[3])
    else: build()
