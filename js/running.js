/* Recomp · running: the Running page, per-run splits/laps, and interval detection from Strava's pace stream. */

// Runs with their source activity (so a run can be opened). Logged-only runs have no id.
function runActs() {
  const out = [], seen = new Set();
  for (const [id, a] of Object.entries(S.acts)) if (!a.dup && a.km > 0 && stravaKind(a, a.d) === 'run') { out.push({ id, ...a }); seen.add(a.d); }
  for (const [d, l] of Object.entries(S.logs)) if (+l.run > 0 && !seen.has(d)) out.push({ id: null, d, km: +l.run, min: 0, name: 'Logged run' });
  return out.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (b.start || 0) - (a.start || 0));
}
const paceOf = r => r.min > 0 && r.km > 0.5 ? r.min / dOut(r.km) : null;               // minutes per km (or mile)
const speedToPace = v => v > 0.5 ? 1000 / (v * 60) / dOut(1) : null;                       // m/s → min per display unit
const secPace = (s, km) => km > 0 ? s / 60 / dOut(km) : null;
let runSel = null;
const STREAMS = {};

// ---------- interval detection ----------
// Splits a run into fast/easy blocks from the smoothed speed stream (2-cluster k-means), then merges blips under 20 s.
function detectIntervals(st) {
  const t = st.time, dist = st.distance, v0 = st.velocity_smooth, hr = st.heartrate || [];
  if (!t || !v0 || t.length < 60) return null;
  const win = 10, v = v0.map((_, i) => { const a = v0.slice(Math.max(0, i - win), i + win + 1); return avg(a); });
  const moving = v.filter(x => x > 1.2);
  if (moving.length < 30) return null;
  let lo = Math.min(...moving), hi = Math.max(...moving);
  for (let k = 0; k < 25; k++) {
    const A = [], B = []; for (const x of moving) (Math.abs(x - lo) <= Math.abs(x - hi) ? A : B).push(x);
    if (!A.length || !B.length) break; lo = avg(A); hi = avg(B);
  }
  const structured = hi / lo > 1.15;
  const cut = (lo + hi) / 2, lab = v.map(x => x < 1.2 ? 'stop' : x >= cut ? 'fast' : 'easy');
  let segs = [];
  for (let i = 0; i < t.length; i++) {
    const L = lab[i] === 'stop' ? 'easy' : lab[i], s = segs[segs.length - 1];
    if (s && s.type === L) s.j = i; else segs.push({ type: L, i, j: i });
  }
  for (let pass = 0; pass < 6; pass++) {                       // absorb short blips into their neighbours
    const short = segs.findIndex(s => t[s.j] - t[s.i] < 20 && segs.length > 1);
    if (short < 0) break;
    const s = segs[short], prev = segs[short - 1], next = segs[short + 1];
    if (prev && (!next || prev.type === (next && next.type))) { prev.j = next && next.type === prev.type ? next.j : s.j; segs.splice(short, next && next.type === prev.type ? 2 : 1); }
    else if (next) { next.i = s.i; segs.splice(short, 1); } else break;
  }
  segs = segs.map(s => {
    const secs = t[s.j] - t[s.i] || 1, m = (dist ? dist[s.j] - dist[s.i] : avg(v0.slice(s.i, s.j + 1)) * secs), h = hr.slice(s.i, s.j + 1).filter(x => x > 0);
    return { type: s.type, t0: t[s.i], s: Math.round(secs), km: +(m / 1000).toFixed(3), hr: h.length ? Math.round(avg(h)) : null, hrMax: h.length ? Math.max(...h) : null, d0: dist ? +(dist[s.i] / 1000).toFixed(3) : null, d1: dist ? +(dist[s.j] / 1000).toFixed(3) : null };
  });
  const reps = segs.filter(s => s.type === 'fast' && s.s >= 20);
  return { structured: structured && reps.length >= 2, segs, reps: reps.length, fastPace: speedToPace(hi), easyPace: speedToPace(lo) };
}
// Compact stream for the chart: one point every ~5 s.
const thinStream = st => { const n = st.time.length, keep = st.time.map((x, i) => i).filter(i => i % 5 === 0 || i === n - 1);
  const pick = a => a ? keep.map(i => a[i]) : null; return { time: pick(st.time), distance: pick(st.distance), velocity_smooth: pick(st.velocity_smooth), heartrate: pick(st.heartrate) }; };
async function loadStream(id) {
  if (STREAMS[id]) return STREAMS[id];
  try {
    const c = await idb('readonly', s => s.get('stream:' + id));
    if (c) { if (S.acts[id] && !S.acts[id].ivs) { const iv = detectIntervals(c); S.acts[id].ivs = iv ? { structured: iv.structured, reps: iv.reps, segs: iv.segs } : { structured: false, reps: 0, segs: [] }; save(); } return (STREAMS[id] = c); }
  } catch (e) {}
  if (!SV.refresh) return null;
  const j = await stravaGet(`/activities/${id}/streams?keys=time,distance,velocity_smooth,heartrate&key_by_type=true`);
  const st = { time: j.time && j.time.data, distance: j.distance && j.distance.data, velocity_smooth: j.velocity_smooth && j.velocity_smooth.data, heartrate: j.heartrate && j.heartrate.data };
  if (!st.time) return null;
  const iv = detectIntervals(st);
  if (S.acts[id]) { S.acts[id].ivs = iv ? { structured: iv.structured, reps: iv.reps, segs: iv.segs } : { structured: false, reps: 0, segs: [] }; save(); }
  const thin = thinStream(st);
  try { await idb('readwrite', s => s.put(thin, 'stream:' + id)); } catch (e) {}
  return (STREAMS[id] = thin);
}

// ---------- page ----------
function renderRunning() {
  const from = rangeFrom(), t = TH(), today = todayIso(), all = runActs(), runs = all.filter(r => r.d >= from && r.d <= today);
  const paced = runs.filter(paceOf), tot = sum(runs.map(r => r.km)), lg = runs.reduce((a, r) => !a || r.km > a.km ? r : a, null);
  const vo = Object.keys(S.health).filter(d => S.health[d].vo2 > 0).sort(), voL = vo.length ? S.health[vo[vo.length - 1]].vo2 : null, voF = vo.filter(d => d >= from)[0];
  const sp = sportName(), sl = sp ? sportList().filter(s => s.d >= from) : [];
  const weeks = weekStartsFrom(from).filter(w => w <= today), wkKm = weeks.map(ws => sum(runs.filter(r => wkOf(r.d) === ws).map(r => r.km)));
  if (!runSel || !all.some(r => r.id === runSel)) runSel = (runs.find(r => r.id) || {}).id || null;
  $('#p-running').innerHTML = phead('Running', `Every run from Strava${HX.url ? ' and Apple Health' : ''}, with splits, laps and detected intervals.`, rangePicker()) + `
    <div class="grid g4">
      ${kpi('Distance', `${fd(tot)} <small>${du()}</small>`, `${runs.length} run${runs.length === 1 ? '' : 's'} · ${(dOut(tot) / Math.max(1, weeks.length)).toFixed(1)} ${du()}/week`)}
      ${kpi('Average pace', paced.length ? `${fmtPace(avg(paced.slice(0, 8).map(paceOf)))} <small>/${du()}</small>` : '–', paced.length ? `last ${Math.min(8, paced.length)} runs` : 'needs synced runs')}
      ${kpi('Longest run', lg ? `${fd(lg.km)} <small>${du()}</small>` : '–', lg ? fmtShort(lg.d) : '')}
      ${kpi('VO2 max', voL ? voL.toFixed(1) : '–', voL ? (voF && voF !== vo[vo.length - 1] ? `${signed(voL - S.health[voF].vo2, 1)} in this range` : `latest ${fmtShort(vo[vo.length - 1])}`) : 'from your watch via Apple Health')}
    </div>
    <div class="grid g2" style="margin-top:14px">
      ${cbox('rnWeek', 'Weekly distance', 'labels = change vs the week before')}
      ${cbox('rnPace', 'Pace', 'each run · line = 5-run average · up is faster')}
      ${runs.some(r => r.hr && paceOf(r)) ? cbox('rnEff', 'Aerobic efficiency', 'metres per heartbeat · up = fitter (same pace at lower HR)') : ''}
      ${voL ? cbox('rnVo2', 'VO2 max', 'estimated by your watch') : ''}
    </div>
    <div class="secttl">Runs</div>
    <div class="grid g2">
      <div class="box" style="padding:6px 8px">${runs.length ? `<div style="max-height:520px;overflow:auto"><table class="runlist"><tr><th>Date</th><th>Run</th><th>${du()}</th><th>Pace</th><th>HR</th></tr>
        ${runs.map(r => `<tr class="r ${r.id === runSel ? 'on' : ''}" data-run="${r.id || ''}"><td>${fmtShort(r.d)}</td><td>${esc(r.name || 'Run')}${r.ivs && r.ivs.structured ? ' <span class="pill2">⚡ ' + r.ivs.reps + ' reps</span>' : r.workout ? ' <span class="pill2">workout</span>' : ''}</td><td>${fd(r.km, 2)}</td><td>${paceOf(r) ? fmtPace(paceOf(r)) : '–'}</td><td>${r.hr || '–'}</td></tr>`).join('')}</table></div>`
        : '<div class="empty2">No runs in this range. Connect Strava in Settings → Connections, or log run distance in the Daily log.</div>'}</div>
      <div class="box" id="runDetail"></div>
    </div>
    ${sp ? `<div class="secttl">${esc(cap(sp))}</div><div class="grid g2">${cbox('rnSport', `${esc(cap(sp))} sessions`, 'per week', 'sm')}
      <div class="box"><h3>${esc(cap(sp))} load</h3>${sl.length ? (() => { const wm = sl.filter(s => s.min > 0), wk = sl.filter(s => s.kcal > 0); return `
        <div class="tline"><div class="ti">${sportEmoji()}</div><div class="tt">Sessions<small>${sl.filter(s => s.kind === 'match').length} matches · ${sl.filter(s => s.kind === 'train').length} training</small></div><b>${sl.length}</b></div>
        <div class="tline"><div class="ti">⏱️</div><div class="tt">Average duration</div><b>${wm.length ? Math.round(avg(wm.map(s => s.min))) + ' min' : '–'}</b></div>
        <div class="tline"><div class="ti">🔥</div><div class="tt">Average watch calories<small>plan uses ${S.settings.train} training / ${S.settings.match} match</small></div><b>${wk.length ? Math.round(avg(wk.map(s => s.kcal))) + ' kcal' : '–'}</b></div>`; })() : `<div class="empty2">No ${esc(sp.toLowerCase())} sessions in this range.</div>`}</div></div>` : ''}
    <div class="secttl">Running insights</div>${insightCards(allInsights('running'))}`;
  // weekly km + ramp
  if (!runs.length) chEmpty('#rnWeek', 'No runs in this range.');
  else ech('#rnWeek', { xAxis: xCat(weeks.map(wkLabel)), yAxis: yVal(v => Math.round(v), { scale: false }),
    series: [barS('Distance', wkKm.map((k, i) => { const p = i ? wkKm[i - 1] : null, ramp = p > 0 ? k / p - 1 : null;
      return { value: +dOut(k).toFixed(1), ramp, itemStyle: { color: ramp != null && ramp > .25 && p > 3 ? t.warn : t.accent, borderRadius: [4, 4, 0, 0] },
        label: { show: ramp != null && k > 0, position: 'top', fontSize: 10, color: ramp > .25 ? t.warn : t.muted, formatter: () => (ramp > 0 ? '+' : '') + Math.round(ramp * 100) + '%' } }; }), t.accent)],
    tooltip: { trigger: 'axis', formatter: ps => { const i = ps[0].dataIndex, rs = runs.filter(r => wkOf(r.d) === weeks[i]); return `<b>Week of ${ps[0].name}</b><br>${fd(wkKm[i])} ${du()} · ${rs.length} run${rs.length === 1 ? '' : 's'}`; } } });
  const pp = [...paced].reverse().map(r => [r.d, +paceOf(r).toFixed(3), r]);
  if (pp.length < 2) chEmpty('#rnPace', 'Pace needs runs synced from Strava or Apple Health.');
  else ech('#rnPace', { xAxis: xTime(), yAxis: yVal(v => fmtPace(+v), { inverse: true }),
    series: [dotS('Run', pp.map(p => ({ value: [p[0], p[1]], symbolSize: Math.max(6, Math.min(16, p[2].km * 1.4)), itemStyle: { color: p[2].ivs && p[2].ivs.structured || p[2].workout ? t.c[1] : t.dot } }))),
      lineS('5-run avg', pp.map((p, i) => [p[0], +avg(pp.slice(Math.max(0, i - 4), i + 1).map(q => q[1])).toFixed(3)]), t.accent)],
    tooltip: { trigger: 'item', formatter: p => { const r = pp.find(q => q[0] === p.value[0] && q[1] === p.value[1]); return r ? `${tipHead(r[0])}<br>${esc(r[2].name || 'Run')}<br>${fd(r[2].km, 2)} ${du()} at <b>${fmtPace(r[1])}/${du()}</b>${r[2].hr ? `<br>avg HR ${r[2].hr}` : ''}` : `5-run avg ${fmtPace(p.value[1])}/${du()}`; } } });
  if ($('#rnEff')) { const e = [...runs].reverse().filter(r => r.hr && paceOf(r)).map(r => [r.d, +((r.km * 1000) / (r.min * r.hr)).toFixed(3), r]);
    ech('#rnEff', { xAxis: xTime(), yAxis: yVal(v => (+v).toFixed(2)), series: [dotS('Run', e.map(p => [p[0], p[1]]), t.c[2]), lineS('Trend', rolling(e.map(p => [p[0], p[1]]), 5).map(p => [p[0], +p[1].toFixed(3)]), t.good)],
      tooltip: { trigger: 'axis', formatter: ps => { const x = e[ps[0].dataIndex]; return x ? `${tipHead(x[0])}<br>${x[1]} m per beat<br>${fmtPace(paceOf(x[2]))}/${du()} at ${x[2].hr} bpm` : ''; } } }); }
  if ($('#rnVo2')) ech('#rnVo2', { xAxis: xTime(), yAxis: yVal(v => (+v).toFixed(1)), series: [lineS('VO2 max', vo.filter(d => d >= from).map(d => [d, +S.health[d].vo2.toFixed(1)]), t.c[4], { showSymbol: true, areaStyle: { color: t.c[4], opacity: .08 } })], tooltip: { trigger: 'axis' } });
  if (sp) { const sw = weeks.map(ws => { const s = sl.filter(x => wkOf(x.d) === ws); return [s.filter(x => x.kind === 'train').length, s.filter(x => x.kind === 'match').length]; });
    if (!sl.length) chEmpty('#rnSport', `No ${esc(sp.toLowerCase())} sessions in this range.`);
    else ech('#rnSport', { xAxis: xCat(weeks.map(wkLabel)), yAxis: yVal(v => Math.round(v), { scale: false, minInterval: 1 }),
      legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      series: [barS('Training', sw.map(x => x[0]), t.c[2], { stack: 'sp', itemStyle: { color: t.c[2], borderRadius: 0 } }), barS('Match', sw.map(x => x[1]), t.c[0], { stack: 'sp' })], tooltip: { trigger: 'axis' } }); }
  renderRunDetail();
}

function renderRunDetail() {
  const box = $('#runDetail'); if (!box) return;
  const r = runSel && S.acts[runSel] ? { id: runSel, ...S.acts[runSel] } : null, t = TH();
  if (!r) { box.innerHTML = '<div class="empty2">Pick a run to see its splits, laps and intervals.</div>'; return; }
  const iv = r.ivs, laps = r.laps || [], splits = r.splits || [];
  const segRows = iv && iv.segs && iv.segs.length ? iv.segs.filter(s => s.s >= 20).map((s, i) => `<tr class="${s.type}"><td>${s.type === 'fast' ? '⚡ Fast' : 'Easy'}</td><td>${Math.floor(s.s / 60)}:${pad(s.s % 60)}</td><td>${fd(s.km, 2)}</td><td>${secPace(s.s, s.km) ? fmtPace(secPace(s.s, s.km)) : '–'}</td><td>${s.hr || '–'}${s.hrMax ? ` <span class="note">/ ${s.hrMax}</span>` : ''}</td></tr>`).join('') : '';
  const lapRows = laps.map((l, i) => `<tr><td>Lap ${i + 1}</td><td>${Math.floor(l.s / 60)}:${pad(l.s % 60)}</td><td>${fd(l.km, 2)}</td><td>${secPace(l.s, l.km) ? fmtPace(secPace(l.s, l.km)) : '–'}</td><td>${l.hr || '–'}</td></tr>`).join('');
  const canStream = r.src === 'strava' || /^\d+$/.test(r.id);
  box.innerHTML = `<h3>${esc(r.name || 'Run')} <span class="note">${dLabel(r.d)} · ${fd(r.km, 2)} ${du()} · ${r.min} min${paceOf(r) ? ` · ${fmtPace(paceOf(r))}/${du()}` : ''}${r.hr ? ` · ${r.hr} bpm` : ''}${r.elev ? ` · ${r.elev} m climb` : ''}</span></h3>
    <div class="ch" id="rdChart"></div>
    ${iv ? (iv.structured ? `<p class="help" style="margin:6px 0">⚡ <b>${iv.reps} fast reps detected</b> from your pace. Shaded on the chart above.</p>` : '<p class="help" style="margin:6px 0">Steady run: no intervals detected in your pace.</p>') : ''}
    ${segRows ? `<details ${iv.structured ? 'open' : ''}><summary class="note" style="cursor:pointer">Detected blocks</summary><table class="ivtbl"><tr><th></th><th>Time</th><th>${du()}</th><th>Pace</th><th>HR</th></tr>${segRows}</table></details>` : ''}
    ${lapRows ? `<details><summary class="note" style="cursor:pointer">Laps from your watch (${laps.length})</summary><table class="ivtbl"><tr><th></th><th>Time</th><th>${du()}</th><th>Pace</th><th>HR</th></tr>${lapRows}</table></details>` : ''}
    <div class="status" id="rdMsg"></div>`;
  const drawSplits = () => {
    if (!splits.length) return chEmpty('#rdChart', canStream ? (SV.refresh ? 'Loading…' : 'Connect Strava to see splits and intervals.') : 'This run came from Apple Health, which doesn’t include splits. Runs synced from Strava do.');
    ech('#rdChart', { xAxis: xCat(splits.map((s, i) => `${i + 1}`), { name: imp() ? 'km split' : 'km', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: t.muted, fontSize: 11 } }), yAxis: yVal(v => fmtPace(+v), { inverse: true }),
      series: [lineS('Pace', splits.map(s => +secPace(s.s, s.km).toFixed(3)), t.accent, { smooth: false, showSymbol: true, symbolSize: 8, areaStyle: { color: t.accent, opacity: .08, origin: 'end' } })],
      tooltip: { trigger: 'axis', formatter: ps => { const s = splits[ps[0].dataIndex]; return `<b>Km ${ps[0].dataIndex + 1}</b>${s.km < .95 ? ` (${s.km} km)` : ''}<br>${fmtPace(ps[0].value)}/${du()}${s.hr ? `<br>${s.hr} bpm` : ''}${s.el ? `<br>${s.el > 0 ? '+' : ''}${s.el} m` : ''}`; } } });
  };
  const drawStream = st => {
    const pts = st.time.map((x, i) => [st.distance ? +dOut(st.distance[i] / 1000).toFixed(3) : x / 60, speedToPace(st.velocity_smooth[i])]).filter(p => p[1] != null && p[1] < 15);
    if (pts.length < 10) return drawSplits();
    const pv = pts.map(p => p[1]).sort((a, b) => a - b), yMax = pv[Math.floor(pv.length * .97)] * 1.05, yMin = pv[0] * .95;
    const areas = iv && iv.structured ? iv.segs.filter(s => s.type === 'fast' && s.s >= 20 && s.d0 != null).map(s => [{ xAxis: +dOut(s.d0).toFixed(3) }, { xAxis: +dOut(s.d1).toFixed(3) }]) : [];
    const hrAt = x => { if (!st.heartrate) return null; const i = st.distance ? st.distance.findIndex(d => dOut(d / 1000) >= x) : -1; return i >= 0 ? st.heartrate[i] : null; };
    ech('#rdChart', { xAxis: { type: 'value', min: 0, max: 'dataMax', axisLabel: { color: t.muted, fontSize: 11, formatter: v => v + ' ' + du() }, splitLine: { show: false }, axisLine: { lineStyle: { color: t.line } } },
      yAxis: yVal(v => fmtPace(+v), { inverse: true, min: +yMin.toFixed(2), max: +yMax.toFixed(2) }),
      series: [lineS('Pace', pts.map(p => [p[0], Math.min(p[1], yMax)]), t.accent, { smooth: 0.2, lineStyle: { width: 1.8, color: t.accent }, areaStyle: { color: t.accent, opacity: .07, origin: 'end' },
        markArea: areas.length ? { silent: true, itemStyle: { color: t.c[1], opacity: .16 }, data: areas } : undefined })],
      tooltip: { trigger: 'axis', formatter: ps => { const p = ps[0].value, h = hrAt(p[0]); return `${(+p[0]).toFixed(2)} ${du()}<br>${fmtPace(p[1])}/${du()}${h ? `<br>${h} bpm` : ''}`; } } });
  };
  if (STREAMS[r.id]) return drawStream(STREAMS[r.id]);
  drawSplits();
  if (canStream) loadStream(r.id).then(st => {
    if (runSel !== r.id || !$('#runDetail')) return;
    if (st && !r.ivs) return renderRunDetail();   // first look: show the detected blocks too
    if (st) drawStream(st);
  }).catch(e => { const m = $('#rdMsg'); if (m) m.innerHTML = `<span class="warn">${esc(e.message)}</span>`; });
}
