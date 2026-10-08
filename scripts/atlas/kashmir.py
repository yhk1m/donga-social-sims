# © 2026 김용현
# scripts/atlas/kashmir.py — p22-kashmir 레이어를 Natural Earth 실제 경계 자료로 만든다(교과서 도형은 양식화돼 쓰지 않음)
#   python -I scripts/atlas/kashmir.py            → $ATLAS_WORK/geo/p22-kashmir.raw.geojson
#   python -I scripts/atlas/kashmir.py --verify <layer.json> <out.png>  → overlay.py 로 교과서 지도 | 레이어(정거 원통) 나란히
# 설정: config/u2.json layers['p22-kashmir'].kashmir (관할 면·주장 국경·정전 라인·종교 범례·검증 범위)
# 자료($ATLAS_WORK/raw/ne/, github.com/nvkelso/natural-earth-vector geojson/):
#   ne_10m_admin_0_disputed_areas          분쟁 지역 면(실제 관할 기준) → 관할국 면
#   ne_10m_admin_0_countries_{pak,ind,chn}  각 나라 관점(POV) 국경 → '○○이 주장하는 국경'
#   ne_10m_admin_0_boundary_lines_land      '인도-파키스탄 정전 라인'(Line of control)
# 교과서(22쪽)에서는 이름·색·범례 글만 가져온다. 종교 비율 면은 대응 자료가 없어 범례 항목(geometry:false)으로만 둔다.
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, linemerge
from atlas_common import HERE, WORK, layer_config, polygonal

LAYER = 'p22-kashmir'
NE = os.path.join(WORK, 'raw', 'ne')


def load(name):
    with open(os.path.join(NE, f'{name}.geojson'), encoding='utf-8') as f:
        return json.load(f)['features']


def _merge(g):
    return linemerge(g) if g.geom_type == 'MultiLineString' else g


def build():
    kc = layer_config(LAYER)['kashmir']
    disp = {f['properties']['BRK_NAME']: polygonal(shape(f['geometry'])) for f in load('ne_10m_admin_0_disputed_areas')}
    feats, allarea = [], []
    for a in kc['areas']:
        miss = [n for n in a['ne'] if n not in disp]
        if miss: raise SystemExit(f'Natural Earth 분쟁 지역 없음: {miss}')
        g = unary_union([disp[n] for n in a['ne']])
        allarea.append(g)
        feats.append({'type': 'Feature', 'geometry': mapping(g),
                      'properties': {'type': 'area', 'cls': a['cls'], 'label': a['label'], 'color': a['color'], 'ne': a['ne']}})
    window = unary_union(allarea).buffer(kc['windowPadDeg'])
    for c in kc['claims']:
        ctry = [f for f in load(f"ne_10m_admin_0_countries_{c['pov']}") if f['properties']['ADMIN'] == c['admin']]
        if not ctry: raise SystemExit(f"Natural Earth {c['pov']} 관점에 {c['admin']} 없음")
        line = _merge(polygonal(unary_union([shape(f['geometry']) for f in ctry])).boundary.intersection(window))
        feats.append({'type': 'Feature', 'geometry': mapping(line),
                      'properties': {'type': 'line', 'cls': c['cls'], 'label': c['label'], 'color': c['color'], 'pov': c['pov']}})
    lc = kc['loc']
    locs = [shape(f['geometry']) for f in load('ne_10m_admin_0_boundary_lines_land')
            if str(f['properties'].get('FEATURECLA', '')).startswith(lc['featurecla'])]
    if not locs: raise SystemExit('Natural Earth 정전 라인 없음')
    feats.append({'type': 'Feature', 'geometry': mapping(_merge(unary_union(locs).intersection(window))),
                  'properties': {'type': 'line', 'cls': lc['cls'], 'label': lc['label'], 'color': lc['color'], 'dashed': True}})
    legend = ([{'cls': a['cls'], 'label': a['label'], 'color': a['color'], 'kind': 'fill'} for a in kc['areas']] +
              [{'cls': c['cls'], 'label': c['label'], 'color': c['color'], 'kind': 'line'} for c in kc['claims']] +
              [{'cls': lc['cls'], 'label': lc['label'], 'color': lc['color'], 'kind': 'line', 'dashed': True}] +
              [{**r, 'kind': 'fill', 'geometry': False} for r in kc['religion']])
    gj = {'type': 'FeatureCollection', 'properties': {'id': LAYER, 'source': kc['sourceText'], 'note': kc['note'], 'legend': legend},
          'features': feats}
    os.makedirs(os.path.join(WORK, 'geo'), exist_ok=True)
    out = os.path.join(WORK, 'geo', f'{LAYER}.raw.geojson')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(gj, f, ensure_ascii=False)
    print(out, len(feats))


def verify(layer_path, out_png):
    """overlay.py 의 경위도 모드: 왼쪽 = 교과서 쪽 렌더, 오른쪽 = 레이어(정거 원통, 범위 verifyExtent)."""
    kc = layer_config(LAYER)['kashmir']
    with open(layer_path, encoding='utf-8') as f:
        gj = json.load(f)
    areas, paths = [], []
    for ft in gj['features']:
        g, p = ft['geometry'], ft['properties']
        if g['type'] == 'MultiPolygon': areas.append({'color': p['color'], 'polygons': g['coordinates']})
        elif g['type'] in ('LineString', 'MultiLineString'):
            for L in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
                paths.append({'points': L, 'color': p['color'], 'width': 1.2 if p.get('dashed') else 2.0})
    vp = kc['verifyPage']
    ov = {'page': vp['page'], 'bbox': vp['bbox'], 'dpi': vp['dpi'], 'out': out_png, 'title': f'{LAYER}: textbook | Natural Earth layer',
          'lonlatExtent': kc['verifyExtent'], 'areas': areas, 'paths': paths}
    ovf = out_png.replace('.png', '.overlay.json')
    with open(ovf, 'w', encoding='utf-8') as f:
        json.dump(ov, f, ensure_ascii=False)
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'overlay.py'), ovf], check=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) > 1 and sys.argv[1] == '--verify': verify(sys.argv[2], sys.argv[3])
    else: build()
