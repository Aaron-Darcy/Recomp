/* Recomp · charts: Apache ECharts helpers with one look across the app (follows light/dark). */
const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function TH() {
  return { ink: cssv('--ink'), ink2: cssv('--ink2'), muted: cssv('--muted'), line: cssv('--line'), surface: cssv('--surface'), chip: cssv('--chip'),
    accent: cssv('--accent'), good: cssv('--good'), warn: cssv('--warn'), bad: cssv('--bad'), dot: cssv('--dot'),
    c: [1, 2, 3, 4, 5, 6, 7, 8].map(i => cssv('--c' + i)), pro: cssv('--pro'), carb: cssv('--carb'), fat: cssv('--fat'),
    deep: cssv('--deep'), core: cssv('--core'), rem: cssv('--rem'), awake: cssv('--awake') };
}
const chartRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => { const i = window.echarts && echarts.getInstanceByDom(e.target); if (i) i.resize(); })) : null;
const chEl = el => typeof el === 'string' ? document.querySelector(el) : el;
function chEmpty(el, msg) {
  el = chEl(el); if (!el) return;
  const i = window.echarts && echarts.getInstanceByDom(el); if (i) i.dispose();
  el.innerHTML = `<div class="empty2">${msg}</div>`;
}
// Render an option into el (re-uses the instance). Returns the ECharts instance.
function ech(el, opt) {
  el = chEl(el); if (!el) return null;
  if (!window.echarts) { el.innerHTML = '<div class="empty2">Chart library missing: keep the lib folder next to index.html.</div>'; return null; }
  let inst = echarts.getInstanceByDom(el);
  if (!inst) { el.innerHTML = ''; inst = echarts.init(el, null, { renderer: 'canvas' }); if (chartRO) chartRO.observe(el); }
  const t = TH();
  inst.setOption(Object.assign({
    animationDuration: 500, color: t.c,
    textStyle: { fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', color: t.ink2 },
    grid: { left: 8, right: 12, top: 30, bottom: 6, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: t.muted, type: 'dashed' } }, extraCssText: 'box-shadow:0 6px 20px rgba(0,0,0,.12);border-radius:10px' },
    legend: { show: false }
  }, opt), true);
  return inst;
}
const fmtD = v => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function xTime(extra = {}) {
  const t = TH();
  return Object.assign({ type: 'time', minInterval: 864e5, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: v => fmtD(v) }, splitLine: { show: false } }, extra);
}
function yVal(fmt, extra = {}) {
  const t = TH();
  return Object.assign({ type: 'value', scale: true, axisLabel: { color: t.muted, fontSize: 11, formatter: fmt || (v => +(+v).toFixed(1)) },
    splitLine: { lineStyle: { color: t.line } }, axisLine: { show: false }, axisTick: { show: false } }, extra);
}
function xCat(labels, extra = {}) {
  const t = TH();
  return Object.assign({ type: 'category', data: labels, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true } }, extra);
}
const lineS = (name, data, color, o = {}) => Object.assign({ name, type: 'line', data, smooth: 0.3, showSymbol: false, symbolSize: 6,
  lineStyle: { width: 2.2, color }, itemStyle: { color }, emphasis: { focus: 'none' } }, o);
const dotS = (name, data, color, o = {}) => Object.assign({ name, type: 'scatter', data, symbolSize: 7, itemStyle: { color, opacity: .75 } }, o);
const barS = (name, data, color, o = {}) => Object.assign({ name, type: 'bar', data, barMaxWidth: 26, itemStyle: { color, borderRadius: [4, 4, 0, 0] } }, o);
const markY = (y, label, color, dashed = true) => ({ silent: true, symbol: 'none', data: [{ yAxis: y, label: { formatter: label, position: 'insideEndTop', color, fontSize: 11 } }],
  lineStyle: { color, type: dashed ? 'dashed' : 'solid', width: 1.4 } });
// Shaded band between lo and hi (two stacked series). Each is [[x, y], ...] with matching x.
function bandS(name, lo, hi, color) {
  return [
    { name: name + ' low', type: 'line', data: lo, stack: name, symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, tooltip: { show: false }, silent: true },
    { name, type: 'line', data: hi.map((p, i) => [p[0], +(p[1] - (lo[i] ? lo[i][1] : 0)).toFixed(3)]), stack: name, symbol: 'none', lineStyle: { opacity: 0 },
      areaStyle: { color, opacity: .16 }, tooltip: { show: false }, silent: true }
  ];
}
const zoomIf = n => n > 45 ? [{ type: 'inside', minValueSpan: 7 * 864e5 }] : [];
// Ring: value vs target (e.g. calories eaten / target).
function ringChart(el, value, target, label, color, unit = '') {
  const t = TH(), pct = target > 0 ? Math.min(150, value / target * 100) : 0;
  return ech(el, { tooltip: { show: false }, series: [{ type: 'gauge', startAngle: 90, endAngle: -270, min: 0, max: 100, radius: '88%',
    progress: { show: true, roundCap: true, width: 11, itemStyle: { color: pct > 110 ? t.warn : color } }, pointer: { show: false },
    axisLine: { lineStyle: { width: 11, color: [[1, t.chip]] } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
    title: { show: true, offsetCenter: [0, '30%'], fontSize: 11, color: t.muted }, anchor: { show: false },
    detail: { valueAnimation: true, offsetCenter: [0, '-6%'], fontSize: 19, fontWeight: 700, color: t.ink, formatter: () => `${Math.round(value)}${unit}` },
    data: [{ value: Math.min(100, pct), name: target ? `of ${Math.round(target)}${unit}` : label }] }] });
}
// Readiness-style gauge (0–100) with coloured zones.
function scoreGauge(el, v, label) {
  const t = TH();
  return ech(el, { tooltip: { show: false }, series: [{ type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '92%', center: ['50%', '58%'],
    axisLine: { lineStyle: { width: 14, color: [[.5, t.bad], [.75, t.warn], [1, t.good]] } },
    progress: { show: false }, pointer: { length: '50%', width: 5, offsetCenter: [0, '-4%'], itemStyle: { color: t.ink } }, anchor: { show: true, size: 10, itemStyle: { color: t.ink } },
    axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
    title: { offsetCenter: [0, '66%'], fontSize: 12, color: t.muted },
    detail: { offsetCenter: [0, '38%'], fontSize: 30, fontWeight: 800, color: t.ink, formatter: x => v == null ? '–' : Math.round(x) },
    data: [{ value: v == null ? 0 : v, name: label }] }] });
}
// Calendar heatmap over [from, to] (ISO dates). data: [[iso, value], ...]
function calHeat(el, data, from, to, { pieces, fmt } = {}) {
  const t = TH(), weeks = Math.ceil((dayNum(to) - dayNum(from) + 1) / 7) + 1, w = Math.max(220, chEl(el).clientWidth || 600);
  return ech(el, {
    tooltip: { trigger: 'item', formatter: p => `${fmtShort(p.value[0])}<br><b>${fmt ? fmt(p.value[1]) : p.value[1]}</b>` },
    visualMap: { type: 'piecewise', show: true, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: t.muted, fontSize: 11 }, pieces },
    calendar: { range: [from, to], top: 26, left: 30, right: 10, bottom: 34, cellSize: ['auto', Math.max(12, Math.min(26, (w - 60) / weeks))],
      orient: 'horizontal', splitLine: { show: false }, itemStyle: { color: t.chip, borderColor: t.surface, borderWidth: 3 },
      dayLabel: { firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], color: t.muted, fontSize: 10 },
      monthLabel: { color: t.muted, fontSize: 11 }, yearLabel: { show: false } },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }]
  });
}
// Tiny line for small multiples / KPI sparklines.
function sparkLine(el, data, color, { area = true, yFmt, tip } = {}) {
  const t = TH();
  return ech(el, { grid: { left: 2, right: 2, top: 8, bottom: 2, containLabel: false },
    tooltip: { trigger: 'axis', formatter: ps => { const p = ps[0]; return tip ? tip(p) : `${fmtD(p.value[0])}: <b>${yFmt ? yFmt(p.value[1]) : p.value[1]}</b>`; } },
    xAxis: { type: 'time', show: false }, yAxis: { type: 'value', show: false, scale: true },
    series: [lineS('v', data, color, { showSymbol: data.length < 12, areaStyle: area ? { color, opacity: .12 } : undefined })] });
}
