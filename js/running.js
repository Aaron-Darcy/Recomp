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
  if (!SV.refresh || !/^\d+$/.test(String(id))) return null;   // Health traces only come from the sync
  const j = await stravaGet(`/activities/${id}/streams?keys=time,distance,velocity_smooth,heartrate&key_by_type=true`);
  const st = { time: j.time && j.time.data, distance: j.distance && j.distance.data, velocity_smooth: j.velocity_smooth && j.velocity_smooth.data, heartrate: j.heartrate && j.heartrate.data };
  if (!st.time) return null;
  const iv = detectIntervals(st);
  if (S.acts[id]) { S.acts[id].ivs = iv ? { structured: iv.structured, reps: iv.reps, segs: iv.segs } : { structured: false, reps: 0, segs: [] }; save(); }
  const thin = thinStream(st);
  try { await idb('readwrite', s => s.put(thin, 'stream:' + id)); } catch (e) {}
  return (STREAMS[id] = thin);
}

// ---------- page: Running | <sport> tabs ----------
let cardioTab = (() => { try { return localStorage.getItem('recomp.cardioTab') || 'run'; } catch (e) { return 'run'; } })();
const cardioName = () => hasSport() ? `Running & ${cap(sportName())}` : 'Running';
function renderRunning() {
  if (!hasSport()) cardioTab = 'run';
  const tabs = hasSport() ? `<div class="segbar" role="tablist" style="margin-bottom:14px">${[['run', '🏃 Running'], ['sport', `${sportEmoji()} ${esc(cap(sportName()))}`]].map(([k, n]) => `<button data-ctab="${k}" class="${cardioTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : '';
  if (cardioTab === 'sport') renderSportTab(tabs); else renderRunTab(tabs);
}
function renderRunTab(tabs) {
  const from = rangeFrom(), t = TH(), today = todayIso(), all = runActs(), runs = all.filter(r => r.d >= from && r.d <= today);
  const paced = runs.filter(paceOf), tot = sum(runs.map(r => r.km)), lg = runs.reduce((a, r) => !a || r.km > a.km ? r : a, null);
  const vo = Object.keys(S.health).filter(d => S.health[d].vo2 > 0).sort(), voL = vo.length ? S.health[vo[vo.length - 1]].vo2 : null, voF = vo.filter(d => d >= from)[0];
  const weeks = weekStartsFrom(from).filter(w => w <= today), wkKm = weeks.map(ws => sum(runs.filter(r => wkOf(r.d) === ws).map(r => r.km)));
  if (!runSel || !all.some(r => r.id === runSel)) runSel = (runs.find(r => r.id) || {}).id || null;
  $('#p-running').innerHTML = phead(cardioName(), `Every run from ${HX.url ? 'Apple Health and ' : ''}Strava, with splits, laps and detected intervals.`, rangePicker()) + tabs + `
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
  renderRunDetail();
}

function renderRunDetail() {
  const box = $('#runDetail'); if (!box) return;
  const r = runSel && S.acts[runSel] ? { id: runSel, ...S.acts[runSel] } : null, t = TH();
  if (!r) { box.innerHTML = '<div class="empty2">Pick a run to see its splits, laps and intervals.</div>'; return; }
  const tw = healthTwin(r), src = tw && tw.stream ? tw : r, sid = src.id;   // the watch's own trace (via Apple Health) beats Strava's when both exist
  const iv = src.ivs || r.ivs, laps = r.laps || [], splits = (src.splits && src.splits.length ? src.splits : r.splits) || [];
  const segRows = iv && iv.segs && iv.segs.length ? iv.segs.filter(s => s.s >= 20).map((s, i) => `<tr class="${s.type}"><td>${s.type === 'fast' ? '⚡ Fast' : 'Easy'}</td><td>${Math.floor(s.s / 60)}:${pad(s.s % 60)}</td><td>${fd(s.km, 2)}</td><td>${secPace(s.s, s.km) ? fmtPace(secPace(s.s, s.km)) : '–'}</td><td>${s.hr || '–'}${s.hrMax ? ` <span class="note">/ ${s.hrMax}</span>` : ''}</td></tr>`).join('') : '';
  const lapRows = laps.map((l, i) => `<tr><td>Lap ${i + 1}</td><td>${Math.floor(l.s / 60)}:${pad(l.s % 60)}</td><td>${fd(l.km, 2)}</td><td>${secPace(l.s, l.km) ? fmtPace(secPace(l.s, l.km)) : '–'}</td><td>${l.hr || '–'}</td></tr>`).join('');
  const canStream = !!src.stream || /^\d+$/.test(String(sid)), from = src.stream ? 'your Apple Watch' : 'Strava';
  box.innerHTML = `<h3>${esc(r.name || 'Run')} <span class="note">${dLabel(r.d)} · ${fd(r.km, 2)} ${du()} · ${r.min} min${paceOf(r) ? ` · ${fmtPace(paceOf(r))}/${du()}` : ''}${r.hr ? ` · ${r.hr} bpm` : ''}${r.elev ? ` · ${r.elev} m climb` : ''}</span></h3>
    <div class="ch" id="rdChart"></div>
    ${iv ? (iv.structured ? `<p class="help" style="margin:6px 0">⚡ <b>${iv.reps} fast reps detected</b> from your pace (${from}). Shaded on the chart above.</p>` : '<p class="help" style="margin:6px 0">Steady run: no intervals detected in your pace.</p>') : ''}
    ${segRows ? `<details ${iv.structured ? 'open' : ''}><summary class="note" style="cursor:pointer">Detected blocks</summary><table class="ivtbl"><tr><th></th><th>Time</th><th>${du()}</th><th>Pace</th><th>HR</th></tr>${segRows}</table></details>` : ''}
    ${lapRows ? `<details><summary class="note" style="cursor:pointer">Laps from your watch (${laps.length})</summary><table class="ivtbl"><tr><th></th><th>Time</th><th>${du()}</th><th>Pace</th><th>HR</th></tr>${lapRows}</table></details>` : ''}
    <div class="status" id="rdMsg"></div>`;
  const drawSplits = () => {
    if (!splits.length) return chEmpty('#rdChart', canStream ? (SV.refresh ? 'Loading…' : 'Connect Strava to see splits and intervals.') : 'No pace trace for this run. In Health Auto Export, turn on Include Workout Metrics (Seconds) and Include Route Data in your workouts automation; runs synced after that get splits and intervals.');
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
  if (STREAMS[sid]) return drawStream(STREAMS[sid]);
  drawSplits();
  if (canStream) loadStream(sid).then(st => {
    if (runSel !== r.id || !$('#runDetail')) return;
    if (st && !iv) return renderRunDetail();   // first look: show the detected blocks too
    if (st) drawStream(st);
  }).catch(e => { const m = $('#rdMsg'); if (m) m.innerHTML = `<span class="warn">${esc(e.message)}</span>`; });
}

// The Apple Health copy of a Strava activity (same watch workout), which may carry a 1 s trace.
function healthTwin(a) {
  if (!a || a.src === 'health') return null;
  for (const [id, h] of Object.entries(S.acts)) if (h.src === 'health' && h.d === a.d && (a.start && h.start ? Math.abs(a.start - h.start) < 15 * 6e4 : Math.abs((h.min || 0) - (a.min || 0)) <= 10)) return { id, ...h };
  return null;
}

// ---------- sport (football) ----------
let sportSel = null;
function sportActs() {
  const out = [], seen = new Set();
  for (const [id, a] of Object.entries(S.acts)) { if (a.dup) continue; const k = stravaKind(a, a.d); if (k === 'train' || k === 'match') { out.push({ id, kind: k, ...a }); seen.add(a.d + k); } }
  for (const [d, l] of Object.entries(S.logs)) for (const k of ['train', 'match']) if (l[k] && !seen.has(d + k)) out.push({ id: null, d, kind: k, name: k === 'match' ? 'Match (logged)' : 'Training (logged)', min: 0, kcal: null });
  return out.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (b.start || 0) - (a.start || 0));
}
// Max HR: the highest you've actually hit on the watch, or 220 − age if that's higher.
const maxHR = () => memo('maxhr', () => Math.max(220 - (+S.settings.age || 30), ...Object.values(S.acts).map(a => +a.hrMax || 0).filter(x => x < 230)));
const ZONES = [['Z1 easy', 0, .6], ['Z2 aerobic', .6, .7], ['Z3 tempo', .7, .8], ['Z4 hard', .8, .9], ['Z5 max', .9, 9]];
const zoneColors = t => [t.muted, t.c[1], t.good, t.warn, t.bad];
// Seconds in each heart-rate zone (step = seconds per sample).
function hrZones(hr, step = 1) {
  const m = maxHR(), z = [0, 0, 0, 0, 0];
  for (const h of hr) { if (!(h > 0)) continue; const f = h / m; z[ZONES.findIndex(([, lo, hi]) => f >= lo && f < hi)] += step; }
  return z;
}
function renderSportTab(tabs) {
  const from = rangeFrom(), t = TH(), today = todayIso(), sp = cap(sportName()), all = sportActs(), ss = all.filter(s => s.d >= from && s.d <= today);
  const mt = ss.filter(s => s.kind === 'match'), tr = ss.filter(s => s.kind === 'train'), timed = ss.filter(s => s.min > 0), kc = k => ss.filter(s => s.kind === k && s.kcal > 0).map(s => s.kcal);
  const weeks = weekStartsFrom(from).filter(w => w <= today), withHr = ss.filter(s => s.hr > 0);
  if (!sportSel || !all.some(s => s.id === sportSel)) sportSel = (ss.find(s => s.id) || {}).id || null;
  const watchAvg = k => { const v = kc(k); return v.length ? `${Math.round(avg(v))} <small>kcal</small>` : '–'; };
  const ins = [], wkMin = ws => sum(ss.filter(s => wkOf(s.d) === ws).map(s => s.min || 0));
  for (const [k, n, plan] of [['train', 'training', +S.settings.train], ['match', 'match', +S.settings.match]]) {
    const v = kc(k);
    if (v.length >= 3 && Math.abs(avg(v) - plan) >= 80) ins.push({ area: 'sport', sev: 'info', title: `${cap(n)} calories`, text: `Your watch averages ${Math.round(avg(v))} kcal per ${n} (${v.length} sessions) but your plan assumes ${plan}. Update it in Settings so ${n} days get the right target.`, prio: 2 });
  }
  if (weeks.length >= 5) {
    const last = wkMin(weeks[weeks.length - 1]), pa = avg(weeks.slice(-5, -1).map(wkMin));
    if (pa > 30 && last > pa * 1.4) ins.push({ area: 'sport', sev: 'warn', title: 'Load spike', text: `${Math.round(last)} min of ${esc(sp.toLowerCase())} this week vs ${Math.round(pa)} a week before. Go easier on legs in the gym.`, prio: 1 });
  }
  const hm = withHr.filter(s => s.kind === 'match').map(s => s.hr), ht = withHr.filter(s => s.kind === 'train').map(s => s.hr);
  if (hm.length && ht.length) ins.push({ area: 'sport', sev: 'info', title: 'Intensity', text: `Average heart rate is ${Math.round(avg(hm))} bpm in matches and ${Math.round(avg(ht))} bpm in training.`, prio: 4 });
  $('#p-running').innerHTML = phead(cardioName(), `Every ${esc(sp.toLowerCase())} session from your watch, matches and training kept apart.`, rangePicker()) + tabs + `
    <div class="grid g4">
      ${kpi('Sessions', ss.length, `${mt.length} match${mt.length === 1 ? '' : 'es'} · ${tr.length} training`)}
      ${kpi('Time played', timed.length ? `${(sum(timed.map(s => s.min)) / 60).toFixed(1)} <small>h</small>` : '–', timed.length ? `avg ${Math.round(avg(timed.map(s => s.min)))} min a session` : 'needs watch workouts')}
      ${kpi('Match calories', watchAvg('match'), `watch average · plan uses ${S.settings.match}`)}
      ${kpi('Training calories', watchAvg('train'), `watch average · plan uses ${S.settings.train}`)}
    </div>
    <div class="grid g2" style="margin-top:14px">
      ${cbox('spWeek', 'Minutes per week', 'matches and training')}
      ${cbox('spKcal', 'Calories per session', 'from your watch · dashed = what your plan assumes')}
    </div>
    <div class="secttl">Sessions</div>
    <div class="grid g2">
      <div class="box" style="padding:6px 8px">${ss.length ? `<div style="max-height:520px;overflow:auto"><table class="runlist"><tr><th>Date</th><th>Session</th><th>Min</th><th>kcal</th><th>HR</th></tr>
        ${ss.map(s => `<tr class="r ${s.id === sportSel ? 'on' : ''}" data-sport="${s.id || ''}"><td>${fmtShort(s.d)}</td><td><span class="pill2 ${s.kind === 'match' ? 'warn' : ''}">${s.kind === 'match' ? 'Match' : 'Training'}</span> ${esc(s.name || '')}</td><td>${s.min || '–'}</td><td>${s.kcal || '–'}</td><td>${s.hr || '–'}${s.hrMax ? ` <span class="note">/ ${s.hrMax}</span>` : ''}</td></tr>`).join('')}</table></div>`
        : `<div class="empty2">No ${esc(sp.toLowerCase())} sessions in this range. Record them on your watch (Apple Health) or Strava.</div>`}</div>
      <div class="box" id="sportDetail"></div>
    </div>
    <div class="secttl">${esc(sp)} insights</div>${insightCards(ins)}`;
  if (!ss.length) { chEmpty('#spWeek', 'No sessions in this range.'); chEmpty('#spKcal', 'No sessions in this range.'); }
  else {
    const per = k => weeks.map(ws => sum(ss.filter(s => s.kind === k && wkOf(s.d) === ws).map(s => s.min || 0)));
    ech('#spWeek', { xAxis: xCat(weeks.map(wkLabel)), yAxis: yVal(v => Math.round(v), { scale: false }),
      legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      series: [barS('Training', per('train'), t.c[2], { stack: 'm', itemStyle: { color: t.c[2], borderRadius: 0 } }), barS('Match', per('match'), t.warn, { stack: 'm' })],
      tooltip: { trigger: 'axis', valueFormatter: v => v + ' min' } });
    const kk = [...ss].reverse().filter(s => s.kcal > 0);
    if (!kk.length) chEmpty('#spKcal', 'No watch calories yet.');
    else ech('#spKcal', { xAxis: xTime(), yAxis: yVal(v => Math.round(v)),
      series: [dotS('Training', kk.filter(s => s.kind === 'train').map(s => [s.d, s.kcal]), t.c[2], { symbolSize: 9, markLine: markY(+S.settings.train, 'plan: training', t.c[2]) }),
        dotS('Match', kk.filter(s => s.kind === 'match').map(s => [s.d, s.kcal]), t.warn, { symbolSize: 11, markLine: markY(+S.settings.match, 'plan: match', t.warn) })],
      legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 } },
      tooltip: { trigger: 'item', formatter: p => `${tipHead(p.value[0])}<br>${p.seriesName}: <b>${p.value[1]} kcal</b>` } });
  }
  renderSportDetail();
}
function renderSportDetail() {
  const box = $('#sportDetail'); if (!box) return;
  const a = sportSel && S.acts[sportSel] ? { id: sportSel, ...S.acts[sportSel] } : null, t = TH();
  if (!a) { box.innerHTML = '<div class="empty2">Pick a session to see its heart rate and zones.</div>'; return; }
  const tw = healthTwin(a), src = tw && tw.stream ? tw : a, sid = src.id, kind = stravaKind(a, a.d), zc = zoneColors(t);
  box.innerHTML = `<h3>${esc(a.name || cap(sportName()))} <span class="note">${dLabel(a.d)} · ${kind === 'match' ? 'match' : 'training'} · ${a.min} min${a.kcal ? ` · ${a.kcal} kcal` : ''}${a.km ? ` · ${fd(a.km, 1)} ${du()}` : ''}</span></h3>
    <div class="ch sm" id="sdHr"></div><div class="ch xs" id="sdZones" style="height:70px"></div><div class="status" id="sdMsg"></div>`;
  const draw = st => {
    if (!st || !st.heartrate) { chEmpty('#sdZones', ''); return chEmpty('#sdHr', 'No heart-rate trace for this session. It comes from Apple Health workouts: turn on Include Workout Metrics in your Health Auto Export workouts automation.'); }
    const m = maxHR(), pts = st.time.map((x, i) => [+(x / 60).toFixed(2), st.heartrate[i]]).filter(p => p[1] > 0);
    const step = st.time.length > 1 ? (st.time[st.time.length - 1] - st.time[0]) / (st.time.length - 1) : 1;
    ech('#sdHr', { xAxis: { type: 'value', min: 0, max: 'dataMax', axisLabel: { color: t.muted, fontSize: 11, formatter: v => Math.round(v) + ' min' }, splitLine: { show: false }, axisLine: { lineStyle: { color: t.line } } },
      yAxis: yVal(v => Math.round(v)), visualMap: { show: false, dimension: 1, pieces: ZONES.map(([, lo, hi], i) => ({ gte: lo * m, lt: hi * m, color: zc[i] })) },
      series: [lineS('Heart rate', pts, t.bad, { smooth: 0.2, lineStyle: { width: 1.6 } })],
      tooltip: { trigger: 'axis', formatter: ps => `${Math.round(ps[0].value[0])} min<br><b>${ps[0].value[1]} bpm</b> (${Math.round(ps[0].value[1] / m * 100)}% of max ${m})` } });
    const z = hrZones(st.heartrate, step), tot = sum(z) || 1;
    ech('#sdZones', { grid: { left: 4, right: 4, top: 4, bottom: 4, containLabel: false }, xAxis: { type: 'value', show: false, max: tot }, yAxis: { type: 'category', show: false, data: [''] },
      tooltip: { trigger: 'item', formatter: p => `${p.seriesName}: <b>${Math.round(p.value / 60)} min</b> (${Math.round(p.value / tot * 100)}%)` },
      series: ZONES.map(([n], i) => ({ name: n, type: 'bar', stack: 'z', data: [z[i]], barWidth: 26, itemStyle: { color: zc[i] },
        label: { show: z[i] / tot > .09, formatter: () => `${n.split(' ')[0]} ${Math.round(z[i] / 60)} min`, color: '#fff', fontSize: 11 } })) });
  };
  if (STREAMS[sid]) return draw(STREAMS[sid]);
  chEmpty('#sdHr', 'Loading…');
  loadStream(sid).then(st => { if (sportSel === a.id && $('#sportDetail')) draw(st); })
    .catch(e => { const m = $('#sdMsg'); if (m) m.innerHTML = `<span class="warn">${esc(e.message)}</span>`; draw(null); });
}
