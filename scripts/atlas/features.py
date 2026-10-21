# © 2026 김용현
# scripts/atlas/features.py — 주제 레이어 하나의 내용 뽑기(지면 pt 좌표). 설정은 config/u2.json 의 layers[id].
# extract_vectors.py --features <id ...|all> 이 부른다. 결과: $ATLAS_WORK/vec/<id>.features.json
#   {id, map, page, bbox, legend:[{cls,color,label,kind,pattern?}],
#    polys:[{cls,color,label,pattern?,polygons:[[바깥 고리, 구멍...], ...]}],
#    symbols:[{xy,cls,kind,color,size,label?,value?,anchor?,bar?}], lines:[{points,cls,kind,color,width?,value?,dir?,label?}],
#    labels?:[{xy,text,size,color}](설정 labels — 지역 이름 글자),
#    report:{..., warnings:[...]}}
# mode: vector(zones.vector_zones) | raster(zones.raster_zones) | symbols(symbols.symbols) | density-markers(symbols.density_markers)
#   | raster-circles(symbols.raster_circles — 렌더 화소에서 찾는 크기 단계 원) | labelled-points(symbols.labelled_points — 이름 붙은 점)
#   | sized-circles(symbols.sized_circles — 지름 ∝ √값 원 + 겹친 원 범례 + 지시선 끝 자리, U5-3e 47쪽 본사)
#   | unit-symbols(symbols.unit_symbols — 주별 네모 칸 묶음, U5-3f 47쪽 마킬라도라 — build_layers 가 type 'unitSymbols' 로 주에 붙임).
# 부가: hatch(빗금 분류), isotherm(lines.isotherms), flows(lines.flows), extraLegend(범례에 없는 칠한 분류), outlineFills(띠로 그린 지역 경계 →
#   테두리만 분류 style 'outline'), labels(지역 이름 글자 → Point {type:'label'}).
# domain: build_layers.mjs 가 쓰는 $ATLAS_WORK/geo/<map>.domain.json(경위도로 되돌릴 수 있는 지면 범위, 원통 도법 세계 지도)이
#   있으면 면을 그 안으로 자른다(지도 가장자리 너머 꼭짓점이 역변환에 실패하지 않도록).
# 여러 지도 한 레이어(설정 maps: [본 지도, 삽입 …] — 29쪽 기후 구분 + 아이슬란드 삽입, 면 모드만): 범례는 본 지도(map)에서 한 번 읽고,
#   지도마다 같은 범례로 면을 뽑아 parts [{map, polys}] 로 둔다(맨 위 polys 는 비움). build_layers.mjs 가 지도마다 자기 fit 으로 되돌려
#   합치고(properties.src = 지도 id), 삽입 지도 틀이 덮는 곳은 본 지도 면에서 뺀다(clip_land.apply_covers — 겹치면 큰 축척 삽입 우선).
import json, os
from shapely.geometry import shape
import legend as LG, zones as Z, symbols as S, lines as LN
from atlas_common import WORK, maps, layer_config, layer_ids, poly_coords, polygonal


def pdf_layer_ids():
    """PDF 에서 도형을 뽑는 레이어(source 가 ne 가 아니고 나라 단위 단계구분도 type countryClass 도 아닌 것 — 그건 country_class.py,
    고리 기호 type chartSymbols·미확정 국경 source ne-disputed 도 아닌 것 — 그건 build_layers.mjs 가 바로 만듦, U4-3c·f)."""
    return [i for i in layer_ids() if layer_config(i).get('source') not in ('ne', 'ne-disputed') and layer_config(i).get('type') not in ('countryClass', 'chartSymbols')]


def _domain(map_id):
    p = os.path.join(WORK, 'geo', f'{map_id}.domain.json')
    if not os.path.exists(p): return None
    with open(p, encoding='utf-8') as f:
        return polygonal(shape(json.load(f)))


def mark_legend_only(leg, legend_only):
    """설정 legendOnly {범례 이름: 까닭}: 교과서 지도에 면이 없는 범례 항목(29쪽 온대·냉대 겨울 건조 — 21쪽과 같은 범례를 썼으나 유럽에는 없음)에
    geometry:false 를 붙이고(제자리, 앱 범례에는 남고 「출력에 없는 분류」 검사에서 빠짐) 면 분류 후보(빗금 아닌 것)에서 뺀 목록을 돌려준다."""
    lo = {k: v for k, v in (legend_only or {}).items() if not k.startswith('_')}
    bad = [k for k in lo if not any(e['label'] == k for e in leg)]
    if bad: raise ValueError(f'legendOnly 에 범례에 없는 이름 {bad}')
    for e in leg:
        if e['label'] in lo: e['geometry'] = False
    return [e for e in leg if not e.get('pattern') and e.get('geometry') is not False]


def extra_legend(leg, extra):
    """설정 extraLegend [{color, label, why}]: 교과서 범례에 없지만 지도에 칠한 분류(32쪽 브뤼셀 — 네덜란드어·프랑스어 함께)를 범례 끝에 더한다(제자리)."""
    for e in extra or []:
        if not e.get('why'): raise ValueError(f"extraLegend {e.get('label')}: why(까닭)가 없음")
        leg.append({'cls': f'c{len(leg) + 1}', 'color': e['color'], 'label': e['label'], 'kind': 'fill', 'extra': True})
    return leg


def outline_polys(m, oc, densify):
    """설정 outlineFills [{fill, label}]: 지역 경계를 띠(채움 도형)로 그린 것(32쪽 파다니아 지역 보라 띠) → 띠가 둘러싼 면(구멍 메움, 지면 pt).
    범례 style 'outline'(채우지 않고 테두리만)으로 그린다."""
    from atlas_common import drawings, hexc, drawing_geom, in_map, flat_polygons
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union
    gs = [drawing_geom(d) for d in drawings(m['page']) if hexc(d.get('fill')) == oc['fill'] and in_map(d, m, tol=1.0)]
    gs = [g for g in gs if g is not None]
    if not gs: return None
    u = unary_union(gs)
    filled = unary_union([Polygon(p.exterior) for p in flat_polygons(u)])
    return polygonal(filled.segmentize(densify)) if filled is not None else None


def text_labels(m, lc):
    """설정 labels {colors, sizePt:[최소, 최대], re}: 지도 안(덮개 상자 밖) 지역 이름 글자 → [{xy(가운데), text, size, color}] (외곽선 글자 겹침은 하나로)."""
    import re as _re
    from atlas_common import spans, overlaps, rect, excluded_boxes
    from symbols import unique_spans
    rx = _re.compile(lc['re']); lo, hi = lc['sizePt']
    out = []
    for t in unique_spans([t for t in spans(m['page']) if overlaps(rect(t['bbox']), m['bbox'])]):
        b = t['bbox']
        if t.get('color') not in lc['colors'] or not lo <= t['size'] <= hi or not rx.fullmatch(t['text']): continue
        if any(overlaps(rect(b), x) for x in excluded_boxes(m)): continue
        out.append({'xy': [round((b[0] + b[2]) / 2, 2), round((b[1] + b[3]) / 2, 2)], 'text': t['text'], 'size': round(t['size'], 1), 'color': t['color']})
    return out


def label_points(items):
    """설정 labelPoints [{text, xy, size, color}](U4-4 — 38쪽 태양광 세계 지도는 글자까지 그림 조각이라 PDF 글자로 못 읽음: 동해·독도·
    이어도 종합 해양 과학 기지) → labels 꼴 [{xy, text, size, color}]. 자리는 쪽 렌더를 보고 적은 글자 가운데(지면 pt)."""
    out = []
    for i, t in enumerate(items):
        if not t.get('text') or len(t.get('xy') or []) != 2: raise ValueError(f'labelPoints {i}: text·xy 가 있어야 함')
        out.append({'xy': [float(t['xy'][0]), float(t['xy'][1])], 'text': t['text'], 'size': t.get('size', 5.0), 'color': t.get('color', '#231f20')})
    return out


def area_polys(m, leg, cfg, warnings, report):
    """지도 하나(m)의 분류 면 → polys [{cls, color, label, pattern?, polygons}] (범례 leg 는 이미 읽은 것 — 빗금은 leg 끝 항목).
    geometry:false 범례(legendOnly)는 분류 후보에서 뺀다."""
    fills = [e for e in leg if not e.get('pattern') and e.get('geometry') is not False]
    zones, rep = (Z.vector_zones if cfg['mode'] == 'vector' else Z.raster_zones)(m, fills, cfg, warnings)
    report.update(rep)
    domain = _domain(m['id'])
    report['domainClip'] = domain is not None
    zones = Z.finish_zones(m, zones, [e['cls'] for e in fills], cfg, domain)
    if cfg.get('dots'):   # 점무늬 면(U4-3b) — 빗금 앞 범례 항목
        dz = Z.dots_zone(m, cfg['dots'])
        dc = next(e['cls'] for e in leg if e.get('pattern') == 'dots')
        if dz is None: warnings.append(f"{m['id']}: 점무늬 점이 없음")
        else: zones[dc] = dz.segmentize(cfg['densifyPt'])
    if isinstance(cfg.get('hatch'), list):   # 빗금 여럿(U5-3h): 범례의 빗금 항목 차례 = 설정 차례
        for hc, e in zip(cfg['hatch'], [e for e in leg if e.get('pattern') == 'hatch']):
            hz = Z.hatch_zone(m, hc)
            if hz is None: warnings.append(f"{m['id']}: 빗금 분류 {e['label']} 윤곽이 없음")
            else: zones[e['cls']] = hz.segmentize(cfg['densifyPt'])
    elif cfg.get('hatch'):
        hz = Z.hatch_zone(m, cfg['hatch'])
        if hz is None: warnings.append(f"{m['id']}: 빗금 분류 윤곽이 없음" if m['id'] != cfg['map'] else '빗금 분류 윤곽이 없음')
        else: zones[leg[-1]['cls']] = hz.segmentize(cfg['densifyPt'])
    polys = []
    for e in leg:
        g = zones.get(e['cls'])
        if g is None: continue
        p = {'cls': e['cls'], 'color': e['color'], 'label': e['label'], 'polygons': poly_coords(g)}
        if e.get('pattern'): p['pattern'] = e['pattern']
        if e.get('angle') is not None: p['angle'] = e['angle']   # 빗금 각도(U5-3h — 있을 때만)
        polys.append(p)
    return polys


def features(layer_id):
    cfg = layer_config(layer_id)
    m = maps()[cfg['map']]
    mode = cfg['mode']
    warnings = []
    out = {'id': layer_id, 'map': cfg['map'], 'page': m['page'], 'bbox': m['bbox'], 'legend': [], 'polys': [],
           'symbols': [], 'lines': [], 'report': {}}
    multi = cfg.get('maps')
    if multi and (mode not in ('vector', 'raster') or multi[0] != cfg['map'] or cfg.get('isotherm') or cfg.get('flows')):
        raise ValueError(f'{layer_id}: maps(여러 지도 한 레이어)는 면 모드(vector·raster)만, 첫째 = map(본 지도), 등온선·흐름선 없이')
    if mode in ('vector', 'raster'):
        leg = LG.manual_legend(cfg['legendItems']) if cfg.get('legendItems') else LG.legend(m, cfg)
        if cfg.get('dots'):   # 점무늬(설정 dots {color, swatch, spacingPt} — U4-3b): 빗금보다 앞(빗금은 leg 끝이어야 함), 그리는 차례 채움 → 점무늬 → 빗금
            d = LG.hatch_legend(m, cfg['dots'], 'dots'); d['cls'] = f'c{len(leg) + 1}'; leg.append(d)
        if isinstance(cfg.get('hatch'), list):   # 빗금 여럿(U5-3h — 46쪽 「혼혈」 가로 분홍 줄·「아프리카계」 사선 검은 빗금): 항목마다 angle(°, 0 = 가로)
            for hc in cfg['hatch']:
                h = LG.hatch_legend(m, hc); h['cls'] = f'c{len(leg) + 1}'
                if hc.get('angle') is not None: h['angle'] = hc['angle']
                leg.append(h)
        elif cfg.get('hatch'):
            h = LG.hatch_legend(m, cfg['hatch']); h['cls'] = f'c{len(leg) + 1}'
            if cfg['hatch'].get('angle') is not None: h['angle'] = cfg['hatch']['angle']
            leg.append(h)
        if cfg.get('extraLegend'): extra_legend(leg, cfg['extraLegend'])
        if cfg.get('legendOnly'): mark_legend_only(leg, cfg['legendOnly'])
        if multi:
            out['parts'] = []
            for mid in multi:
                rep = {}
                out['parts'].append({'map': mid, 'bbox': maps()[mid]['bbox'], 'polys': area_polys(maps()[mid], leg, cfg, warnings, rep), 'report': rep})
            out['report']['parts'] = [p['map'] for p in out['parts']]
        else:
            out['polys'] = area_polys(m, leg, cfg, warnings, out['report'])
        out['legend'] = leg
        for oc in cfg.get('outlineFills') or []:   # 띠로 그린 지역 경계(파다니아) → 테두리만 그리는 분류
            g = outline_polys(m, oc, cfg['densifyPt'])
            if g is None: warnings.append(f"outlineFills {oc['label']}: 띠 도형이 없음"); continue
            e = {'cls': f'c{len(leg) + 1}', 'color': oc['fill'], 'label': oc['label'], 'kind': 'fill', 'style': 'outline'}
            leg.append(e)
            out['polys'].append({'cls': e['cls'], 'color': e['color'], 'label': e['label'], 'style': 'outline', 'polygons': poly_coords(g)})
        if cfg.get('labels'): out['labels'] = text_labels(m, cfg['labels'])
        if cfg.get('labelPoints'): out['labels'] = out.get('labels', []) + label_points(cfg['labelPoints'])
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
        leg = LG.manual_legend(cfg['legendItems']) if cfg.get('legendItems') else LG.legend(m, cfg, max_area=cfg.get('legendMaxArea'))
        out['legend'] = leg
        manual = cfg.get('manualPoints') or []   # 손 기호(U5-4 — 47쪽 D사 본사 건물·판매 지사 지게차 그림: 여러 조각 그림이라 색으로 못 셈) — 그 분류는 색으로 찾지 않음
        only = {q['label'] for q in manual}
        out['symbols'], rep = S.symbols(m, [e for e in leg if e['label'] not in only], cfg, warnings)
        for q in manual:
            e = next((e for e in leg if e['label'] == q['label']), None)
            if e is None: raise ValueError(f"{layer_id}: manualPoints 분류 {q['label']} 가 범례에 없음")
            out['symbols'].append({'xy': [float(q['xy'][0]), float(q['xy'][1])], 'cls': e['cls'], 'kind': e['label'], 'color': e['color'],
                                   'size': q.get('size', 3.0), **({'label': q['name']} if q.get('name') else {})})
        out['report'].update(rep)
    elif mode == 'raster-circles':   # 30쪽 도시 인구 원(렌더 화소에서 찾음 — symbols.raster_circles) + 사례 도시
        out['legend'], out['symbols'], rep = S.raster_circles(m, cfg, warnings)
        out['report'].update(rep)
    elif mode == 'labelled-points':  # 31쪽 녹색 수도(그림자 + 「도시(연도)」)·리스본(점 + 지시선 + 이름표 아래 값) — symbols.labelled_points
        out['legend'], out['symbols'], rep = S.labelled_points(m, cfg, warnings)
        out['report'].update(rep)
    elif mode == 'sized-circles':    # 47쪽 본사 원(지름 ∝ √값, 겹친 원 범례, 지시선 끝 자리 — symbols.sized_circles, U5-3e)
        out['legend'], out['symbols'], rep = S.sized_circles(m, {**cfg, 'id': layer_id}, warnings)
        out['report'].update(rep)
    elif mode == 'unit-symbols':     # 47쪽 마킬라도라 네모 단위 기호(열 → 주별 칸 묶음, 꺾인 지시선 — symbols.unit_symbols, U5-3f)
        out['legend'], out['symbols'], rep = S.unit_symbols(m, cfg, warnings)
        out['report'].update(rep)
    elif mode == 'path-flow':        # 46쪽 지구본 인구 이동 화살표(채운 화살대·점선 토막 + 화살촉 → 가운데 선 — lines.path_flows, U5-4)
        out['legend'] = [{'cls': fc['cls'], 'color': fc['fill'], 'kind': 'flow', 'label': fc['label'], **({'dashed': True} if fc.get('dashed') else {})} for fc in cfg['flows']]
        out['lines'], rep = LN.path_flows(m, cfg, warnings)
        out['report']['flows'] = rep
    elif mode == 'density-markers':
        mc = cfg['marker']
        out['symbols'] = S.density_markers(m, mc, warnings)
        out['legend'] = [{'cls': 'c1', 'color': mc['color'], 'kind': 'symbol', 'label': mc['kind']}]
    else:
        raise ValueError(f'{layer_id}: 모르는 mode {mode}')
    if mode not in ('vector', 'raster') and cfg.get('labelPoints'):   # 기호 레이어의 지면 글자(U5-4 — 47쪽 세계 지도 동해·독도·이어도, 앱은 symbolLabels)
        out['labels'] = label_points(cfg['labelPoints'])
    for e in out['legend']: e.pop('box', None)
    present = ({p['cls'] for p in out['polys']} | {p['cls'] for part in out.get('parts', []) for p in part['polys']}
               | {s['cls'] for s in out['symbols']} | {l['cls'] for l in out['lines']}
               | {q['cls'] for s in out['symbols'] for q in s.get('series') or []})   # 네모 단위 기호 칸 묶음의 계열들(U5-3f)
    absent = [e['label'] for e in out['legend'] if e['cls'] not in present and e.get('geometry') is not False]
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
