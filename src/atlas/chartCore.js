// © 2026 김용현
// src/atlas/chartCore.js — 그래프 자료(charts.json, Task C4 형식) → csat-chart.js 저수준 렌더러 자료, 그리고 라이브러리에 없는 그래프의
// 칸·눈금 계산. 순수 함수(DOM·캔버스 없음). 그리기는 charts.js.
//
// 종류별 길(chartPlan):
//   csat-chart.js  climograph → climate · line → line · stackedArea → line(stacked + areaFill) · pyramid → pyramid
//                  (쌓은 면은 1년 칸으로 펴서 — annualSeries)
//                  pie → stacked(pie) · 한 막대 stackedBar(카타르 외국인) → stacked(bar, labelInSegment) · bar → absbar
//   직접(SVG)      여러 막대 stackedBar(자원·수출 비율) — csat 가로 100% 막대는 칸 안 이름을 못 쓰고(값만), 칸마다 다른 색·막대 굵기(칸의 30%)도
//                  교과서(칸마다 「나라 비율」 글자, 지시선)와 달라 읽을 수 없다 · radialBar(고리 막대) — csat 에 없는 종류
//   표(HTML)       table(네옴시티) — 그래프가 아니라 글 표

const MONTHS = 12;

/** 그래프 하나를 어떤 길로 그릴지 → {via: 'csat'|'svg'|'table', renderer?, size?: [w, h](csat 논리 크기)} */
export function chartPlan(spec) {
  switch (spec?.type) {
    case 'climograph': return { via: 'csat', renderer: 'climate', size: [800, 700] };
    case 'line': return { via: 'csat', renderer: 'line', size: [960, 620] };
    case 'stackedArea': return { via: 'csat', renderer: 'line', size: [1100, 820] };
    case 'pyramid': return { via: 'csat', renderer: 'pyramid', size: [800, 720] };
    case 'pie': return { via: 'csat', renderer: 'stacked', size: [800, 640] };
    case 'bar': return { via: 'csat', renderer: 'absbar', size: [1000, 600] };
    case 'stackedBar':
      return spec.categories?.length === 1 ? { via: 'csat', renderer: 'stacked', size: [800, 720] } : { via: 'svg' };
    case 'radialBar': return { via: 'svg' };
    case 'table': return { via: 'table' };
    default: return { via: 'none' };
  }
}

const unitOf = (spec) => (spec.unit ? `(${spec.unit})` : '');
const colorOf = (s, i = 0) => s.color ?? s.colors?.[i] ?? null;
const roundTo = (v, step) => Math.round(v / step) * step;
const clean = (v) => Number(v.toPrecision(12));

/** 기후 그래프 축: 강수 0mm 높이(y0 = −a/b)에서 기온 아래 끝을 읽고, 눈금 수(n)로 위 끝 → {temp, prec: {min, max, step}} */
export function climoRanges(spec) {
  const { temp: t, prec: p } = spec.axes;
  const y0 = -p.a / p.b;
  const tmin = clean(roundTo(t.a + t.b * y0, t.step));
  return {
    temp: { min: tmin, max: clean(tmin + t.step * (t.n - 1)), step: t.step },
    prec: { min: 0, max: clean(p.step * (p.n - 1)), step: p.step },
  };
}

/** climograph → csat ClimateGraphData */
export function toClimateData(spec) {
  const temp = spec.series.find((s) => s.name === '기온')?.values || [];
  const prec = spec.series.find((s) => s.name === '강수량')?.values || [];
  const r = climoRanges(spec);
  return {
    months: Array.from({ length: MONTHS }, (_, i) => ({ temp: temp[i], precip: prec[i] })),
    monthInterval: 12,
    tempLabel: '(℃)',
    precipLabel: '(mm)',
    tempRange: { min: r.temp.min, max: r.temp.max, auto: false, step: r.temp.step },
    precipRange: { min: r.prec.min, max: r.prec.max, auto: false, step: r.prec.step },
  };
}

/** 해 눈금 이름: 첫 해 + step 의 배수. 첫 해와 step × 0.75 보다 가까운 배수는 비운다(1950 옆 1960). 나머지 자리는 ''. */
export function tickLabels(categories, step) {
  const first = categories[0];
  return categories.map((c, i) => {
    if (i === 0) return String(c);
    if (c % step !== 0) return '';
    return c - first < step * 0.75 ? '' : String(c);
  });
}

/** 값 축 범위: 간격(step)의 배수로 아래(0 이상이면 0)·위 끝을 넓힌다 → {min, max, step} */
export function valueRange(values, step) {
  const v = values.filter((x) => Number.isFinite(x));
  const lo = Math.min(0, ...v), hi = Math.max(...v);
  return { min: clean(Math.floor(lo / step) * step), max: clean(Math.ceil(hi / step - 1e-9) * step), step };
}

/** line → csat LineGraphData(계열 색 = 교과서 선 색, 범례 상자) */
export function toLineData(spec) {
  const xStep = spec.axes?.x?.step ?? 10;
  const yStep = spec.axes?.y?.step ?? 1;
  const r = valueRange(spec.series.flatMap((s) => s.values), yStep);
  return {
    series: spec.series.map((s) => ({ label: s.name, values: s.values.map((v) => (v == null ? null : v)), stroke: colorOf(s) || '#000', lineStyle: 'solid' })),
    xLabels: tickLabels(spec.categories, xStep),
    xUnit: spec.categoryKind === 'year' ? '(년)' : '',
    yUnit: unitOf(spec),
    yRange: { min: r.min, max: r.max, auto: false, step: r.step },
    labelPlacement: 'legend',
    showMarkers: false,
    xGrid: false,
  };
}

/** 쌓은 면에서 값이 있는 칸 바로 옆 빈 칸을 0 으로(띠가 끊겨 빈틈이 생기지 않고 가늘어지게). */
export function taperNulls(values) {
  return values.map((v, i) => {
    if (v != null) return v;
    const near = (values[i - 1] != null && i > 0) || (values[i + 1] != null && i < values.length - 1);
    return near ? 0 : null;
  });
}

/**
 * 해(정수) 범주 → 1년 간격 격자(쌓은 면, E1). csat 꺾은선 가로축은 범주 축이라 칸 간격이 고르다 — 10년 간격 그대로면
 * 「아시아(1950년 전)」 → 중국·인도·그 밖 아시아로 넘어가는 1940~1950 이 10년 폭 사선이 된다(교과서는 1950 에서 곧게 바뀜).
 * 1년 칸이면 넘어가는 폭이 1년(그래프 너비의 1/300)이라 곧게 보이고, 2021 처럼 고르지 않은 해도 제 자리에 들어간다.
 *   - 값이 있는 이웃 두 범주 사이는 선형 보간(csat 이 원래 그리던 직선과 같다).
 *   - 넘겨주기: 어떤 계열이 범주 i 에서 끝나고(다음 범주에 값 없음) 다음 범주 i+1 에서 시작하는 계열들이 있으면, 끝나는 계열은
 *     i+1 바로 앞 해(c_{i+1} − 1)까지 「시작하는 계열들의 c_{i+1} 합」을 향해 보간하고, 시작하는 계열들은 그때까지 0 이다.
 *     c_{i+1} 에서 끝난 계열은 0, 시작한 계열은 제 값 → 띠 경계가 1년 안에 바뀐다.
 *   - 그 밖의 값 없는 칸은 값 있는 칸 바로 옆만 0(taperNulls).
 * → { years: [c0, c0+1, …, cN], values: {이름: [..]} }
 */
export function annualSeries(categories, series) {
  const c0 = categories[0], cN = categories[categories.length - 1];
  const years = Array.from({ length: cN - c0 + 1 }, (_, i) => c0 + i);
  const values = {};
  const at = (s, i) => (i >= 0 && i < categories.length ? s.values[i] ?? null : null);
  for (const s of series) {
    const out = new Array(years.length).fill(null);
    for (let i = 0; i < categories.length; i++) {
      const v = at(s, i);
      if (v == null) continue;
      out[categories[i] - c0] = v;
      const w = at(s, i + 1);
      if (w != null) for (let y = categories[i] + 1; y < categories[i + 1]; y++) out[y - c0] = v + ((w - v) * (y - categories[i])) / (categories[i + 1] - categories[i]);
    }
    values[s.name] = out;
  }
  for (let i = 0; i + 1 < categories.length; i++) {
    const ending = series.filter((s) => at(s, i) != null && at(s, i + 1) == null);
    const starting = series.filter((s) => at(s, i) == null && at(s, i + 1) != null);
    if (!ending.length || !starting.length) continue;
    const target = starting.reduce((a, s) => a + at(s, i + 1), 0) / ending.length; // 끝나는 계열이 여럿이면 나눠 받음(지금은 하나)
    const a = categories[i], b = categories[i + 1];
    for (const s of ending) {
      const v = at(s, i);
      for (let y = a + 1; y < b; y++) values[s.name][y - c0] = v + ((target - v) * (y - a)) / (b - a);
      values[s.name][b - c0] = 0;
    }
    for (const s of starting) for (let y = a; y < b; y++) values[s.name][y - c0] = 0;
  }
  for (const k of Object.keys(values)) values[k] = taperNulls(values[k]);
  return { years, values };
}

/** stackedArea → csat LineGraphData(stacked, areaFill). 쌓는 순서 = spec.stackOrder(아래 → 위), 없으면 계열 역순. 가로는 1년 칸(annualSeries). */
export function toStackedAreaData(spec) {
  const { years, values } = annualSeries(spec.categories, spec.series);
  const order = spec.stackOrder || spec.series.map((s) => s.name).reverse();
  const byName = new Map(spec.series.map((s) => [s.name, s]));
  const xStep = spec.axes?.x?.step ?? 50;
  const series = order.filter((n) => byName.has(n)).map((n) => {
    const fill = colorOf(byName.get(n)) || '#999';
    return { label: n, values: values[n].map((v) => (v == null ? null : clean(v))), areaFill: fill, stroke: fill, lineWidth: 0.5, lineStyle: 'solid' };
  });
  const totals = years.map((_, k) => series.reduce((a, s) => a + (s.values[k] || 0), 0));
  const r = valueRange(totals, 20);
  return {
    series,
    xLabels: tickLabels(years, xStep),
    xUnit: '(년)',
    yUnit: unitOf(spec),
    yRange: { min: r.min, max: r.max, auto: false, step: r.step },
    stacked: true,
    // 범례는 캔버스에 그리지 않는다(charts.js 가 options.showLegend=false) — csat 범례는 계열 차례(= 쌓는 차례, 아래 → 위)라
    // 띠와 위아래가 거꾸로 읽힌다. 대신 stackLegend 차례(위 → 아래)로 그래프 옆에 HTML 범례.
    labelPlacement: 'legend',
    showMarkers: false,
  };
}

/** 쌓은 면 범례: 위 띠부터(쌓는 순서의 거꾸로) [{name, color}] — 범례를 위에서 아래로 읽으면 띠도 위에서 아래로. */
export function stackLegend(spec) {
  const byName = new Map(spec.series.map((s) => [s.name, s]));
  const order = spec.stackOrder || spec.series.map((s) => s.name).reverse();
  return order.filter((n) => byName.has(n)).reverse().map((n) => ({ name: n, color: colorOf(byName.get(n)) || '#999' }));
}

/** pyramid → csat PyramidGraphData(18구간이면 나이 수치 눈금 — csat 연령대 이름표는 17개) */
export function toPyramidData(spec) {
  const [m, f] = spec.series;
  const step = spec.axes?.x?.step ?? 2;
  const max = valueRange([...m.values, ...f.values], step).max;
  return {
    ages: m.values.map((v, i) => ({ male: v, female: f.values[i] })),
    unit: 'percent',
    maleLabel: m.name,
    femaleLabel: f.name,
    axisLabel: unitOf(spec),
    range: { max, auto: false },
    ageLabelSide: 'left',
    numericAgeAxis: true,
    ageUnit: '(세)',
    axisLabelInline: true,
    sexFills: [colorOf(m) || '#ccc', colorOf(f) || '#999'],
  };
}

const segLabel = (name, v) => `${name} ${v}`;

/** pie → csat StackedGraphData(pie). 조각 이름 = 「이름 값」. */
export function toPieData(spec) {
  return {
    displayMode: 'pie',
    barDirection: 'vertical',
    categories: [{ label: spec.categories[0] ?? '', values: spec.series.map((s) => s.values[0]) }],
    seriesLabels: spec.series.map((s) => segLabel(s.name, s.values[0])),
    seriesFills: spec.series.map((s) => colorOf(s) || '#ccc'),
    labelInSegment: true,
    seriesIsSymbol: spec.series.map(() => false),
    unit: unitOf(spec),
  };
}

/** 한 막대 stackedBar(카타르 외국인) → csat StackedGraphData(세로 막대, 칸 안 「이름 값」) */
export function toStackedBarData(spec) {
  return {
    displayMode: 'bar',
    barDirection: 'vertical',
    categories: spec.categories.map((label, i) => ({ label, values: spec.series.map((s) => s.values[i] ?? 0) })),
    seriesLabels: spec.series.map((s) => segLabel(s.name, s.values[0])),
    seriesFills: spec.series.map((s) => colorOf(s) || '#ccc'),
    labelInSegment: false, // 칸 너비(막대 칸의 30%)에 「방글라데시 9.5」가 눌려 읽히지 않는다 — 이름·값은 범례에
    unit: unitOf(spec),
    axisStep: 20,
  };
}

/** bar → csat AbsBarGraphData(가로). 범위 = 0 ~ 눈금 간격 × (눈금 수 − 1) */
export function toAbsBarData(spec) {
  const s = spec.series[0];
  const ax = spec.axes?.x;
  const yRange = ax ? { min: 0, max: clean(ax.step * (ax.n - 1)), auto: false, step: ax.step } : { min: 0, max: 100, auto: true };
  return {
    barDirection: 'horizontal',
    stacked: false,
    categories: spec.categories.map((label, i) => ({ label, values: [s.values[i]] })),
    seriesLabels: [s.name],
    unit: unitOf(spec),
    yRange,
    seriesFills: [colorOf(s) || '#999'],
    // csat 가로 막대는 범주 이름 칸이 100px 고정이라 「산업용 프린터」가 잘린다. 2단 라벨(groups)일 때만 이름 폭을 재므로
    // 빈 이름의 그룹 하나로 감싸 이름 폭을 재게 한다(그룹 이름 칸은 0).
    groups: [{ label: '', span: spec.categories.length }],
  };
}

/**
 * 여러 막대 100% 띠(자원·수출 비율) → 막대마다 {category, total, cells: [{name, value, x0, x1, color}]}.
 * 칸 차례 = spec.stackOrder[막대](교과서 칠한 순서, 왼쪽 → 오른쪽), x 는 값 누적(%).
 */
export function stackCells(spec) {
  return spec.categories.map((cat, k) => {
    const order = spec.stackOrder?.[cat] || spec.series.filter((s) => s.values[k] != null).map((s) => s.name);
    let x = 0;
    const cells = [];
    for (const name of order) {
      const s = spec.series.find((q) => q.name === name);
      const v = s?.values[k];
      if (v == null) continue;
      cells.push({ name, value: v, x0: clean(x), x1: clean(x + v), color: colorOf(s, k) || '#ccc' });
      x += v;
    }
    return { category: cat, total: spec.totals?.[k] ?? null, cells };
  });
}

/** 선형 눈금 함수 */
export function linearScale([d0, d1], [r0, r1]) {
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

const f1 = (v) => String(Math.round(v * 100) / 100);
const pt = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

/** 12시에서 시계 방향으로 pct% 만큼의 고리(r0 = 0 이면 부채꼴) SVG 경로. 100% 는 두 반원으로. */
export function arcPath(cx, cy, r0, r1, pct) {
  const sweep = Math.max(0, Math.min(100, pct)) * 3.6;
  if (sweep >= 359.999) {
    // 한 바퀴: 바깥 원(반원 둘) + 안 원(반대 방향, evenodd 없이도 구멍)
    const ring = (r, dir) => `M${f1(cx)},${f1(cy - r)}A${f1(r)},${f1(r)} 0 1,${dir} ${f1(cx)},${f1(cy + r)}A${f1(r)},${f1(r)} 0 1,${dir} ${f1(cx)},${f1(cy - r)}Z`;
    return ring(r1, 1) + (r0 > 0 ? ring(r0, 0) : '');
  }
  const large = sweep > 180 ? 1 : 0;
  const [ax, ay] = pt(cx, cy, r1, 0), [bx, by] = pt(cx, cy, r1, sweep);
  let d = `M${f1(ax)},${f1(ay)}A${f1(r1)},${f1(r1)} 0 ${large},1 ${f1(bx)},${f1(by)}`;
  if (r0 > 0) {
    const [cx2, cy2] = pt(cx, cy, r0, sweep), [dx, dy] = pt(cx, cy, r0, 0);
    d += `L${f1(cx2)},${f1(cy2)}A${f1(r0)},${f1(r0)} 0 ${large},0 ${f1(dx)},${f1(dy)}Z`;
  } else d += `L${f1(cx)},${f1(cy)}Z`;
  return d;
}

/** radialBar → 범주(중국·인도)마다 {category, rings: [{name, value, color}]}(바깥 고리부터 — 계열 차례) */
export function ringRows(spec) {
  return spec.categories.map((category, k) => ({
    category,
    rings: spec.series.map((s) => ({ name: s.name, value: s.values[k], color: colorOf(s, k) || '#999' })),
  }));
}

/**
 * 칸에 안 들어가는 글자 자리(교과서 지시선 글자처럼): items [{cx(칸 가운데), w(글자 폭)}] → 같은 순서로 [{lane: 'above'|'below', x(글자 가운데)}].
 * 왼쪽 → 오른쪽으로, 위 줄에 놓되 앞 글자와 겹치면 오른쪽으로 민다. maxShift 넘게 밀려야 하면 아래 줄, 둘 다 넘으면 덜 밀리는 줄.
 */
export function laneLabels(items, { gap = 4, maxShift = 60 } = {}) {
  const right = { above: -Infinity, below: -Infinity };
  const out = new Array(items.length);
  const order = items.map((it, i) => i).sort((a, b) => items[a].cx - items[b].cx);
  for (const i of order) {
    const { cx, w } = items[i];
    const cand = (lane) => Math.max(cx, right[lane] + gap + w / 2);
    const a = cand('above'), b = cand('below');
    const lane = a - cx <= maxShift ? 'above' : b - cx <= maxShift ? 'below' : (a - cx <= b - cx ? 'above' : 'below');
    const x = lane === 'above' ? a : b;
    right[lane] = x + w / 2;
    out[i] = { lane, x };
  }
  return out;
}
