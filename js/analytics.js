/* Recomp · analytics: shared series and the original insight rules */
/* =====================================================================
   Dashboard
   ===================================================================== */
const MUSCLES = [
  ['Calves', /calf/i],
  ['Abs', /crunch|plank|\bab\b|abs|leg raise|sit.?up|hanging knee|russian twist/i],
  ['Legs', /leg press|squat|lunge|leg extension|leg curl|hamstring|romanian|\brdl\b|deadlift|hip thrust|glute|step.?up|hack|good morning/i],
  ['Shoulders', /shoulder|overhead press|military|lateral|reverse fly|rear delt|face pull|upright|arnold/i],
  ['Back', /row|pulldown|pull.?up|chin.?up|\blat\b|pullover|shrug|back extension/i],
  ['Chest', /bench|chest|fly|flye|push.?up|pec|dip/i],
  ['Triceps', /tricep|pushdown|skull|extension|close.?grip|kickback/i],
  ['Biceps', /curl/i]
];
const muscleOf = ex => (MUSCLES.find(([, re]) => re.test(ex)) || ['Other'])[0];
function earliestData() {
  const c = [Object.keys(S.logs).sort()[0], S.workouts[0] && S.workouts[0].d, Object.values(S.acts).map(a => a.d).sort()[0]].filter(Boolean).sort();
  return c[0] || todayIso();
}
function dashFrom() { return dashWeeks ? iso(addDays(monday(new Date()), -7 * (dashWeeks - 1))) : iso(monday(parse(earliestData()))); }
function weekStartsFrom(from) { const out = []; for (let d = parse(from); iso(d) <= todayIso(); d = addDays(d, 7)) out.push(iso(d)); return out; }
const wkOf = d => iso(monday(parse(d)));
const wkLabel = ws => fmtShort(ws);

function runsList() {
  const out = [], viaStrava = new Set();
  for (const a of Object.values(S.acts)) if (!a.dup && stravaKind(a, a.d) === 'run' && a.km > 0) { out.push({ d: a.d, km: a.km, min: a.min, name: a.name }); viaStrava.add(a.d); }
  for (const [d, l] of Object.entries(S.logs)) if (+l.run > 0 && !viaStrava.has(d)) out.push({ d, km: +l.run, min: 0, name: 'Logged run' });
  return out.sort((a, b) => a.d < b.d ? -1 : 1);
}
function sportList() {
  const out = [], seen = new Set();
  for (const a of Object.values(S.acts)) { if (a.dup) continue; const k = stravaKind(a, a.d); if (k === 'train' || k === 'match') { out.push({ d: a.d, kind: k, min: a.min, kcal: a.kcal }); seen.add(a.d + k); } }
  for (const [d, l] of Object.entries(S.logs)) for (const k of ['train', 'match']) if (l[k] && !seen.has(d + k)) out.push({ d, kind: k, min: 0, kcal: null });
  return out.sort((a, b) => a.d < b.d ? -1 : 1);
}
function gymDays() {
  const s = new Set(S.workouts.map(w => w.d));
  for (const [d, l] of Object.entries(S.logs)) if (l.gym) s.add(d);
  return [...s].sort();
}
function weekTotals(ws) {
  const days = span7(ws, 0).filter(d => d <= todayIso()), set = new Set(days);
  const ls = days.map(d => S.logs[d]).filter(Boolean), cal = activeCal();
  const eat = days.filter(d => S.logs[d] && S.logs[d].kcal > 0);
  return {
    gym: gymDays().filter(d => set.has(d)).length,
    runKm: sum(runsList().filter(r => set.has(r.d)).map(r => r.km)),
    sport: sportList().filter(s => set.has(s.d)).length,
    weighIns: ls.filter(l => l.weight > 0).length,
    kcal: eat.length ? avg(eat.map(d => +S.logs[d].kcal)) : null,
    target: eat.length ? avg(eat.map(d => targetFor(S.logs[d], cal, d))) : null,
    days: days.length
  };
}
function strengthSeries(from) {
  const idx = exerciseIndex(), exs = [...new Set(splitRows().flatMap(r => r.exercises.map(e => e.ex)))];
  const byWeek = {};
  for (const ex of exs) {
    const best = Math.max(0, ...idx[ex].map(h => topE1(h.sets)));
    if (!best) continue;
    for (const h of idx[ex]) {
      if (h.d < from) continue;
      const v = topE1(h.sets); if (!v) continue;
      (byWeek[wkOf(h.d)] ||= []).push(v / best * 100);
    }
  }
  return Object.keys(byWeek).sort().map(k => ({ x: dayNum(k), y: avg(byWeek[k]), n: byWeek[k].length }));
}
function prList(from, n = 6) {
  const out = [];
  for (const [ex, hist] of Object.entries(exerciseIndex())) {
    let best = 0;
    for (const h of hist) {
      let top = null;
      for (const [w, r] of h.sets) { const v = e1rm(w, r); if (v > (top ? top.v : 0)) top = { v, w, r }; }
      if (top && top.v > best * 1.001) { if (best > 0 && h.d >= from) out.push({ d: h.d, ex, ...top, prev: best }); best = top.v; }
    }
  }
  return out.sort((a, b) => a.d < b.d ? 1 : -1).slice(0, n);
}
function muscleSets() {
  const from = iso(addDays(new Date(), -28)), c = {};
  for (const wk of S.workouts) if (wk.d > from) for (const [e, , , so] of wk.s) if (!/^w/i.test(so)) { const mg = muscleOf(e); c[mg] = (c[mg] || 0) + 1; }
  return Object.entries(c).map(([mg, n]) => [mg, n / 4]).sort((a, b) => b[1] - a[1]);
}
function insights() {
  const out = [], sp = sportName(), today = todayIso();
  // weight vs goal
  const rate = recentRate(), aim = aimRate(today);
  if (rate != null) {
    const [vt] = verdict({ rate, aim, avgW: 0, prevW: 0 });
    out.push({ ok: vt.startsWith('✓'), t: `Weight: ${vt.replace(/^[✓▲▼] /, '')}` });
  } else out.push({ ok: null, t: 'Weight: log ~10 days of morning weigh-ins to see your real rate of change.' });
  // lifts vs best
  const ex = splitRows().flatMap(r => r.exercises);
  if (ex.length) {
    const near = ex.filter(e => e.pct >= 95).length, worst = [...ex].sort((a, b) => a.pct - b.pct)[0];
    out.push({ ok: near >= ex.length * 0.7, t: `Lifts: ${near} of ${ex.length} exercises are at 95%+ of your best.${worst.pct < 95 ? ` Furthest back: ${esc(worst.ex)} at ${Math.round(worst.pct)}%.` : ''}` });
  }
  // muscle balance
  const ms = muscleSets().filter(([mg]) => !['Abs', 'Calves', 'Other'].includes(mg));
  const low = ms.filter(([, n]) => n < 8), high = ms.filter(([, n]) => n > 20);
  if (ms.length && (low.length || high.length))
    out.push({ ok: false, t: `Volume: ${low.length ? `${low.map(([m, n]) => `${m} ${n.toFixed(1)}`).join(', ')} sets/week (under ~8)` : ''}${low.length && high.length ? '; ' : ''}${high.length ? `${high.map(([m, n]) => `${m} ${n.toFixed(1)}`).join(', ')} sets/week (over ~20)` : ''}.` });
  else if (ms.length) out.push({ ok: true, t: 'Volume: every major muscle group gets 8–20 hard sets a week.' });
  // running trend
  const runs = runsList(), d28 = iso(addDays(new Date(), -28)), d56 = iso(addDays(new Date(), -56));
  const r4 = runs.filter(r => r.d > d28), p4 = runs.filter(r => r.d > d56 && r.d <= d28);
  if (r4.length) {
    const k4 = sum(r4.map(r => r.km)), kp = sum(p4.map(r => r.km));
    const paced = rs => rs.filter(r => r.min > 0 && r.km > 1), pace = rs => sum(rs.map(r => r.min)) / dOut(sum(rs.map(r => r.km)));
    let t = `Running: ${fd(k4 / 4)} ${du()}/week over the last 4 weeks`;
    if (kp) t += ` (${sgn(Math.round((k4 / kp - 1) * 100))}% vs the 4 before)`;
    if (paced(r4).length && paced(p4).length) { const a = pace(paced(r4)), b = pace(paced(p4)); t += `. Average pace ${fmtPace(a)}/${du()} (${a < b ? 'faster' : 'slower'} than ${fmtPace(b)})`; }
    const big = kp && k4 / kp > 1.3;
    out.push({ ok: big ? false : true, t: t + (big ? '. That\'s a big jump. Build distance gradually to avoid injury.' : '.') });
  }
  // calories on heavy days
  const cal = activeCal(), days = Object.keys(S.logs).filter(d => d > d28 && S.logs[d].kcal > 0);
  const heavy = days.filter(d => { const l = S.logs[d]; return l.train || l.match || l.run > 0; }), rest = days.filter(d => !heavy.includes(d));
  const gap = ds => avg(ds.map(d => S.logs[d].kcal - targetFor(S.logs[d], cal, d)));
  if (heavy.length >= 3) {
    const gh = gap(heavy);
    if (gh < -120) out.push({ ok: false, t: `Fuel: on ${sp ? esc(sp.toLowerCase()) + '/' : ''}run days you log ~${Math.round(-gh)} kcal under target. That's where the ${S.settings.goal === 'bulk' ? 'surplus' : 'plan'} leaks.` });
    else if (rest.length >= 3 && gap(rest) > 150) out.push({ ok: false, t: `Fuel: rest days run ~${Math.round(gap(rest))} kcal over target.` });
    else out.push({ ok: true, t: 'Fuel: your logged calories match the targets on training and rest days.' });
  }
  out.push(...healthInsights());
  // consistency
  const d14 = iso(addDays(new Date(), -14)), odd = [...flaggedWeighIns()].filter(d => d > d14);
  if (odd.length) out.push({ ok: false, t: `Weigh-in check: ${odd.map(d => `${fmtShort(d)} (${fw(S.logs[d].weight)} ${wu()})`).join(', ')} ${odd.length > 1 ? 'look' : 'looks'} off, so ${odd.length > 1 ? 'they’re' : 'it’s'} left out of your trend. Fix ${odd.length > 1 ? 'them' : 'it'} in Edit a day, or tap “It’s right”.` });
  const wi = Object.keys(S.logs).filter(d => d > d14 && S.logs[d].weight > 0).length, st = weighInStreak();
  out.push({ ok: wi >= 8, t: `Consistency: ${wi} weigh-ins in the last 14 days · streak ${st.cur} day${st.cur === 1 ? '' : 's'} (best ${st.best})${S.checkins.length ? ` · ${S.checkins.length} check-in${S.checkins.length > 1 ? 's' : ''} done` : ''}.` });
  return out;
}

/* ---------- Health in the check-in, insights and dashboard ---------- */
const hAvg = (ds, f) => { const v = ds.map(d => f(S.health[d] || {})).filter(x => x != null && !isNaN(x) && x > 0); return v.length ? avg(v) : null; };
const proteinTarget = () => macros(0).p;
function healthWeek(days) {
  if (!days.some(d => S.health[d])) return null;
  const pd = days.filter(d => S.health[d] && S.health[d].mac);
  return { sleep: hAvg(days, h => h.sleep && h.sleep.total), rhr: hAvg(days, h => h.rhr), hrv: hAvg(days, h => h.hrv), steps: hAvg(days, h => h.steps),
    pDays: pd.length ? pd.filter(d => S.health[d].mac.p >= proteinTarget() * 0.95).length : null, pOf: pd.length };
}
const daysBack = (n, from = 0) => [...Array(n)].map((_, i) => iso(addDays(new Date(), -(i + from))));
function recoveryState() {
  const recent = daysBack(3, 1), base = daysBack(21, 8);   // last 3 full days vs the 3 weeks before
  const r3 = hAvg(recent, h => h.rhr), rb = hAvg(base, h => h.rhr), v3 = hAvg(recent, h => h.hrv), vb = hAvg(base, h => h.hrv);
  return { rhrUp: r3 != null && rb != null ? r3 - rb : null, hrvDrop: v3 != null && vb != null ? (vb - v3) / vb : null };
}
function healthInsights() {
  const out = [], w7 = daysBack(7, 1), s7 = daysBack(7, 0);   // sleep is dated by the morning you wake up, so it includes today
  if (!Object.keys(S.health).some(d => d >= iso(addDays(new Date(), -14)))) return out;
  const rs = recoveryState();
  if (rs.rhrUp != null || rs.hrvDrop != null) {
    const bad = (rs.rhrUp != null && rs.rhrUp > 5) || (rs.hrvDrop != null && rs.hrvDrop > 0.15);
    out.push({ ok: !bad, t: bad
      ? `Recovery: ${rs.rhrUp > 5 ? `resting HR is ${Math.round(rs.rhrUp)} bpm above your usual` : ''}${rs.rhrUp > 5 && rs.hrvDrop > 0.15 ? ' and ' : ''}${rs.hrvDrop > 0.15 ? `HRV is ${Math.round(rs.hrvDrop * 100)}% below normal` : ''} over the last 3 days. Consider an easier session, extra sleep and plenty of food today.`
      : 'Recovery: resting heart rate and HRV are in your normal range.' });
  }
  const sl = hAvg(s7, h => h.sleep && h.sleep.total);
  if (sl != null) out.push({ ok: sl >= 7, t: `Sleep: ${sl.toFixed(1)} h a night over the last week${sl < 7 ? '. Under 7 h slows recovery and makes hunger and gains harder to manage.' : '.'}` });
  const pd = w7.filter(d => S.health[d] && S.health[d].mac);
  if (pd.length >= 3) { const hit = pd.filter(d => S.health[d].mac.p >= proteinTarget() * 0.95).length;
    out.push({ ok: hit >= pd.length - 1, t: `Protein: hit ${proteinTarget()} g on ${hit} of ${pd.length} logged days this week${hit < pd.length - 1 ? '. Lifts recover on protein, so add a shake or yoghurt on the low days.' : '.'}` }); }
  const st = hAvg(daysBack(14, 1), h => h.steps);
  if (st != null) {
    const sug = st < 5000 ? 1.25 : st < 8000 ? 1.3 : st < 12000 ? 1.4 : 1.5;
    if (Math.abs(sug - S.settings.factor) >= 0.05) out.push({ ok: null, t: `Daily activity: you average ${Math.round(st).toLocaleString()} steps, which fits a daily-life factor of about ${sug} (yours is ${S.settings.factor}). Change it in Settings if that looks right, or let the check-ins correct it.` });
  }
  const vo = Object.keys(S.health).filter(d => S.health[d].vo2).sort();
  if (vo.length >= 2 && dayNum(vo[vo.length - 1]) - dayNum(vo[0]) >= 21) {
    const a = S.health[vo[0]].vo2, b = S.health[vo[vo.length - 1]].vo2;
    out.push({ ok: b >= a, t: `VO2 max: ${b.toFixed(1)} (${sgn((b - a).toFixed(1))} since ${fmtShort(vo[0])}).` });
  }
  return out;
}
