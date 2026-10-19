# © 2026 김용현
# scripts/atlas/features.py — 주제 레이어 하나의 내용 뽑기(지면 pt 좌표). 설정은 config/u2.json 의 layers[id].
# extract_vectors.py --features <id ...|all> 이 부른다. 결과: $ATLAS_WORK/vec/<id>.features.json
#   {id, map, page, bbox, legend:[{cls,color,label,kind,pattern?}],
#    polys:[{cls,color,label,pattern?,polygons:[[바깥 고리, 구멍...], ...]}],
#    symbols:[{xy,cls,kind,color,size,label?,value?,anchor?,bar?}], lines:[{points,cls,kind,color,width?,value?,dir?,label?}],
#    report:{..., warnings:[...]}}
# mode: vector(zones.vector_zones) | raster(zones.raster_zones) | symbols(symbols.symbols) | density-markers(symbols.density_markers).
# 부가: hatch(빗금 분류), isotherm(lines.isotherms), flows(lines.flows).
# domain: build_layers.mjs 가 쓰는 $ATLAS_WORK/geo/<map>.domain.json(경위도로 되돌릴 수 있는 지면 범위, 원통 도법 세계 지도)이
#   있으면 면을 그 안으로 자른다(지도 가장자리 너머 꼭짓점이 역변환에 실패하지 않도록).
import json, os
from shapely.geometry import shape
import legend as LG, zones as Z, symbols as S, lines as LN
from atlas_common import WORK, maps, layer_config, layer_ids, poly_coords, polygonal


def pdf_layer_ids():
    """PDF 에서 뽑는 레이어(source 가 ne 가 아닌 것)."""
    return [i for i in layer_ids() if layer_config(i).get('source') != 'ne']


def _domain(map_id):
    p = os.path.join(WORK, 'geo', f'{map_id}.domain.json')
    if not os.path.exists(p): return None
    with open(p, encoding='utf-8') as f:
        return polygonal(shape(json.load(f)))


def features(layer_id):
    cfg = layer_config(layer_id)
    m = maps()[cfg['map']]
    mode = cfg['mode']
    warnings = []
    out = {'id': layer_id, 'map': cfg['map'], 'page': m['page'], 'bbox': m['bbox'], 'legend': [], 'polys': [],
           'symbols': [], 'lines': [], 'report': {}}
    if mode in ('vector', 'raster'):
        leg = LG.legend(m, cfg)
        if cfg.get('hatch'):
            h = LG.hatch_legend(m, cfg['hatch']); h['cls'] = f'c{len(leg) + 1}'; leg.append(h)
        fills = [e for e in leg if not e.get('pattern')]
        zones, rep = (Z.vector_zones if mode == 'vector' else Z.raster_zones)(m, fills, cfg, warnings)
        out['report'].update(rep)
        domain = _domain(cfg['map'])
        out['report']['domainClip'] = domain is not None
        zones = Z.finish_zones(m, zones, [e['cls'] for e in fills], cfg, domain)
        if cfg.get('hatch'):
            hz = Z.hatch_zone(m, cfg['hatch'])
            if hz is None: warnings.append('빗금 분류 윤곽이 없음')
            else: zones[leg[-1]['cls']] = hz.segmentize(cfg['densifyPt'])
        for e in leg:
            g = zones.get(e['cls'])
            if g is None: continue
            p = {'cls': e['cls'], 'color': e['color'], 'label': e['label'], 'polygons': poly_coords(g)}
            if e.get('pattern'): p['pattern'] = e['pattern']
            out['polys'].append(p)
        out['legend'] = leg
        if cfg.get('isotherm'):
            ic = cfg['isotherm']
            ls, r2 = LN.isotherms(m, ic, warnings)
            out['lines'] += ls; out['report'].update(r2)
            out['legend'].append({'cls': 'isotherm', 'color': ic['color'], 'kind': 'line', 'label': ic['label']})
        if cfg.get('flows'):
            fc = cfg['flows']
            any_color = next(iter(fc['classes'].values()))['legendColor']
            widths = LG.flow_legend(m, any_color)
            unit = LG.legend_unit(m, fc['unitTextRe'])
            if unit is None: warnings.append('흐름선 단위를 범례 제목에서 못 읽음')
            fl, r3 = LN.flows(m, fc, widths, cfg['densifyPt'], warnings)
            out['lines'] += fl; out['report']['flows'] = r3
            for ckey, cc in fc['classes'].items():
                out['legend'].append({'cls': ckey, 'color': cc['legendColor'], 'kind': 'flow', 'label': cc['label'],
                                      'values': [lab for _, lab in widths], 'widths': [w for w, _ in widths], 'unit': unit})
    elif mode == 'symbols':
        leg = LG.legend(m, cfg, max_area=cfg.get('legendMaxArea'))
        out['legend'] = leg
        out['symbols'], rep = S.symbols(m, leg, cfg, warnings)
        out['report'].update(rep)
    elif mode == 'density-markers':
        mc = cfg['marker']
        out['symbols'] = S.density_markers(m, mc, warnings)
        out['legend'] = [{'cls': 'c1', 'color': mc['color'], 'kind': 'symbol', 'label': mc['kind']}]
    else:
        raise ValueError(f'{layer_id}: 모르는 mode {mode}')
    for e in out['legend']: e.pop('box', None)
    present = {p['cls'] for p in out['polys']} | {s['cls'] for s in out['symbols']} | {l['cls'] for l in out['lines']}
    absent = [e['label'] for e in out['legend'] if e['cls'] not in present]
    if absent: warnings.append(f'도형 없는 범례 분류: {absent}')
    exp = cfg.get('expectLegend')
    if exp is not None and len(out['legend']) != exp:
        raise ValueError(f'{layer_id}: 범례 {len(out["legend"])}개 ≠ 설정 expectLegend {exp} — {[e["label"] for e in out["legend"]]}')
    out['report'].update(legendCount=len(out['legend']), outputClasses=len(present), absent=absent, warnings=warnings)
    return out


def write(layer_id, out_dir=None):
    out_dir = out_dir or os.path.join(WORK, 'vec')
    os.makedirs(out_dir, exist_ok=True)
    f = features(layer_id)
    path = os.path.join(out_dir, f"{f['id']}.features.json")
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(f, fh, ensure_ascii=False)
    return f, path
