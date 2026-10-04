/* Recomp · insights: data helpers, readiness score, correlation finder and the insight rule bank. */

// ---------- small memo cache, cleared on every render ----------
let MEMO = {};
const memo = (k, fn) => k in MEMO ? MEMO[k] : (MEMO[k] = fn());
const clearMemo = () => { MEMO = {}; };

// ---------- range ----------
const RANGES = [[7, '7 d'], [28, '4 w'], [91, '3 m'], [182, '6 m'], [0, 'All']];
const rangeDays = () => S.settings.dashRange == null ? 28 : +S.settings.dashRange;
function rangeFrom() {
  const n = rangeDays();
  if (n) return iso(addDays(new Date(), -(n - 1)));
  const c = [Object.keys(S.logs).sort()[0], Object.keys(S.health).sort()[0], S.workouts[0] && S.workouts[0].d].filter(Boolean).sort();
  return c[0] || todayIso();
}
const daysBetween = (from, to = todayIso()) => { const out = []; for (let d = parse(from); iso(d) <= to; d = addDays(d, 1)) out.push(iso(d)); return out; };
function rangePicker(page) {
  return `<div class="segbar" role="group" aria-label="Date range">${RANGES.map(([n, l]) => `<button data-range="${n}" class="${rangeDays() === n ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

// ---------- day accessors ----------
const HD = d => S.health[d] || {};
const LD = d => S.logs[d] || {};
const sleepH = d => { const s = HD(d).sleep; return s && s.total > 0 ? s.total : null; };
// "Measured" intake = from Apple Health or typed by hand (not a pre-filled target).
function intake(d) {
  const l = LD(d), h = HD(d);
  if (l.kSrc === 'manual' && l.kcal > 0) return +l.kcal;
  if (h.kcal > 0) return h.kcal;
  if (l.kSrc === 'health' && l.kcal > 0) return +l.kcal;
  return null;
}
const loggedKcal = d => intake(d) ?? (LD(d).kcal > 0 ? +LD(d).kcal : null);
const macD = d => LD(d).mac || HD(d).mac || null;
const actsOn = d => S.logs[d] || plannedActs(d);
const dayTarget = d => targetFor(withActual(actsOn(d), d), undefined, d);
const isTrainDay = d => { const l = LD(d); return !!(l.gym || l.train || l.match || l.run > 0); };
const series = (days, f) => days.map(d => [d, f(d)]).filter(p => p[1] != null && !isNaN(p[1]));
const meanOf = a => a.length ? avg(a) : null;
const sdOf = a => { if (a.length < 2) return null; const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
const rolling = (pts, n = 7) => pts.map((p, i) => [p[0], avg(pts.slice(Math.max(0, i - n + 1), i + 1).map(q => q[1]))]);

// ---------- readiness (0–100) ----------
function readiness(d = todayIso()) {
  return memo('ready' + d, () => {
    const base = [...Array(28)].map((_, i) => iso(addDays(parse(d), -(i + 2))));
    const stat = f => { const v = base.map(x => f(x)).filter(x => x > 0); return v.length >= 7 ? { m: avg(v), sd: Math.max(sdOf(v) || 0, 1e-6), n: v.length } : null; };
    const recent = f => { const a = f(d); if (a > 0) return a; const b = f(iso(addDays(parse(d), -1))); return b > 0 ? b : null; };
    const parts = [], z = (v, st, sign) => Math.max(-2.5, Math.min(2.5, sign * (v - st.m) / st.sd));
    const add = (name, f, sign, w, unit) => { const st = stat(f), v = recent(f); if (st && v != null) parts.push({ name, v, m: st.m, z: z(v, st, sign), w, unit }); };
    add('HRV', x => HD(x).hrv, 1, .4, 'ms');
    add('Resting HR', x => HD(x).rhr, -1, .3, 'bpm');
    add('Sleep', sleepH, 1, .3, 'h');
    if (parts.length < 2) return null;
    let zc = sum(parts.map(p => p.z * p.w)) / sum(parts.map(p => p.w)), score = 65 + 15 * zc;
    const sl = sleepH(d); if (sl != null && sl < 6) score -= 8;
    const act = stat(x => HD(x).active), a2 = [HD(iso(addDays(parse(d), -1))).active, HD(iso(addDays(parse(d), -2))).active].filter(x => x > 0);
    let load = null;
    if (act && a2.length) { load = avg(a2) / act.m; if (load > 1.35) score -= 6; }
    score = Math.round(Math.max(0, Math.min(100, score)));
    const band = score >= 75 ? 'high' : score >= 50 ? 'ok' : 'low';
    const p = plannedActs(d), session = p.match ? 'your match' : p.gym ? `${p.w || 'gym'} session` : p.train ? 'training' : p.run ? 'run' : null;
    const advice = band === 'high' ? (session ? `Well recovered. Push it in ${session === 'run' ? 'your run' : 'your ' + session}: go for those rep targets.` : 'Well recovered. A good day for a hard session if you fancy it.')
      : band === 'ok' ? (session ? `Normal recovery. Train as planned.` : 'Normal recovery. A normal day.')
      : (session ? `Recovery is low. Keep ${session === 'run' ? 'the run easy' : 'the ' + session + ' lighter'} (fewer hard sets, stop 2–3 reps short) and prioritise food and sleep.` : 'Recovery is low. Take it easy, eat well and get to bed early.');
    return { score, band, parts, load, advice };
  });
}

// ---------- correlation finder ----------
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return 0;
  const mx = avg(xs), my = avg(ys); let a = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); bx += (xs[i] - mx) ** 2; by += (ys[i] - my) ** 2; }
  return bx && by ? a / Math.sqrt(bx * by) : 0;
}
const prevDay = d => iso(addDays(parse(d), -1));
const nextDay = d => iso(addDays(parse(d), 1));
// Each finder: x(d) → number|bool, y(d) → number; split groups x by `cut`; report if both groups ≥4 and the gap is meaningful.
const FINDERS = [
  { area: 'nutrition', x: d => sleepH(d), y: d => intake(d), cut: 6.5, min: 120, unit: 'kcal',
    say: (lo, hi, g) => `After nights under 6.5 h of sleep you ate ~${Math.abs(Math.round(g))} kcal ${g > 0 ? 'more' : 'less'} (${Math.round(lo)} vs ${Math.round(hi)} kcal).` },
  { area: 'recovery', x: d => sleepH(d), y: d => HD(d).hrv, cut: 7, minPct: .08, unit: 'ms',
    say: (lo, hi, g) => `HRV was ${Math.round(Math.abs(g) / hi * 100)}% ${g > 0 ? 'higher' : 'lower'} after short nights (&lt;7 h) than after 7 h+ (${Math.round(lo)} vs ${Math.round(hi)} ms).` },
  { area: 'nutrition', x: d => isTrainDay(d) ? 0 : 1, y: d => intake(d), cut: .5, min: 150, unit: 'kcal', labels: ['training', 'rest'],
    say: (tr, rest, g) => `You eat ~${Math.abs(Math.round(g))} kcal ${g > 0 ? 'more' : 'less'} on training days than rest days (${Math.round(tr)} vs ${Math.round(rest)}).${g < 0 ? ' Training days need more, not less.' : ''}` },
  { area: 'recovery', x: d => HD(prevDay(d)).active, y: d => HD(d).rhr, rel: 'r', minR: .45,
    say: r => `Your resting heart rate rises after big activity days (r = ${r.toFixed(2)}). Plan easier days after matches and long runs.` },
  { area: 'body', x: d => (macD(prevDay(d)) || {}).c, y: d => { const a = LD(d).weight, b = LD(prevDay(d)).weight; return a > 0 && b > 0 ? a - b : null; }, rel: 'r', minR: .4,
    say: r => `High-carb days are followed by overnight weight jumps (r = ${r.toFixed(2)}). That's water and glycogen, not fat.` },
  { area: 'activity', x: d => HD(d).steps, y: d => intake(d), rel: 'r', minR: .45,
    say: r => `Your appetite tracks your steps: more walking, more eating (r = ${r.toFixed(2)}).` }
];
function correlations(from = rangeFrom()) {
  return memo('corr' + from, () => {
    const days = daysBetween(from), out = [];
    for (const f of FINDERS) {
      const pr = days.map(d => [f.x(d), f.y(d)]).filter(([x, y]) => x != null && y != null && !isNaN(x) && !isNaN(y));
      if (pr.length < 10) continue;
      if (f.rel === 'r') { const r = pearson(pr.map(p => p[0]), pr.map(p => p[1])); if (Math.abs(r) >= f.minR) out.push({ area: f.area, sev: 'info', title: 'Pattern', text: f.say(r) + ` <span class="note">(${pr.length} days)</span>`, prio: 3 }); continue; }
      const lo = pr.filter(p => p[0] < f.cut).map(p => p[1]), hi = pr.filter(p => p[0] >= f.cut).map(p => p[1]);
      if (lo.length < 4 || hi.length < 4) continue;
      const g = avg(lo) - avg(hi);
      if ((f.min && Math.abs(g) >= f.min) || (f.minPct && Math.abs(g) / Math.abs(avg(hi)) >= f.minPct))
        out.push({ area: f.area, sev: 'info', title: 'Pattern', text: f.say(avg(lo), avg(hi), g) + ` <span class="note">(${pr.length} days)</span>`, prio: 3 });
    }
    return out;
  });
}

// ---------- rule bank ----------
const PREFIX_AREA = { 'Weight': 'body', 'Lifts': 'gym', 'Volume': 'gym', 'Running': 'running', 'Fuel': 'nutrition', 'Weigh-in check': 'body', 'Consistency': 'body',
  'Recovery': 'recovery', 'Sleep': 'recovery', 'Protein': 'nutrition', 'Daily activity': 'activity', 'VO2 max': 'running' };
function legacyInsights() {
  const raw = [...(typeof insights === 'function' ? insights() : []), ...(typeof healthInsights === 'function' ? healthInsights() : [])];
  return raw.map(i => { const m = String(i.t).match(/^([^:]+):\s*(.*)$/s), title = m ? m[1] : 'Note', text = m ? m[2] : i.t;
    return { area: PREFIX_AREA[title] || 'general', sev: i.ok === true ? 'good' : i.ok === false ? 'warn' : 'info', title, text, prio: i.ok === false ? 1 : 4 }; });
}
function ruleInsights(from = rangeFrom()) {
  const out = [], today = todayIso(), days = daysBetween(from), push = (area, sev, title, text, prio = 2) => out.push({ area, sev, title, text, prio });
  // --- Body ---
  const tw = +S.settings.targetWeight, cw = currentWeight(), rate = recentRate();
  if (tw > 0 && Math.abs(tw - cw) > 0.2) {
    if (rate && Math.sign(tw - cw) === Math.sign(rate) && Math.abs(rate) > 0.02) {
      const wks = (tw - cw) / rate, eta = addDays(new Date(), Math.round(wks * 7));
      push('body', 'info', 'Goal projection', `At your current ${rateTxt(rate)} you'll reach ${fw(tw)} ${wu()} around <b>${eta.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b> (${Math.round(wks)} weeks).`, 2);
    } else if (rate != null) push('body', 'warn', 'Goal projection', `Your trend is moving ${rate > 0 ? 'up' : 'down'} but your target (${fw(tw)} ${wu()}) is ${tw > cw ? 'above' : 'below'} you. Check your goal setting.`, 1);
  }
  const w0 = LD(today).weight || LD(prevDay(today)).weight, dd = LD(today).weight ? today : prevDay(today);
  if (w0 > 0) {
    const tr = trendSeries().filter(o => o.date < dd).pop(), mp = macD(prevDay(dd)), carbsAvg = meanOf(days.map(d => (macD(d) || {}).c).filter(x => x > 0));
    if (tr && w0 - tr.t > 0.6 && ((mp && carbsAvg && mp.c > carbsAvg * 1.25) || (intake(prevDay(dd)) || 0) > dayTarget(prevDay(dd)) + 400))
      push('body', 'info', 'Probably water', `${fmtShort(dd)}'s weigh-in is ${fw(w0 - tr.t, 1)} ${wu()} above your trend after a big ${mp && carbsAvg && mp.c > carbsAvg * 1.25 ? 'carb' : 'food'} day. That's water and glycogen; it'll settle in a day or two.`, 2);
  }
  // --- Nutrition ---
  const meas = days.filter(d => d < today && intake(d) != null);
  if (meas.length >= 5) {
    const within = meas.filter(d => Math.abs(intake(d) - dayTarget(d)) <= dayTarget(d) * 0.1).length, pct = Math.round(within / meas.length * 100);
    push('nutrition', pct >= 70 ? 'good' : pct >= 45 ? 'info' : 'warn', 'Adherence', `${pct}% of logged days were within ±10% of target (${within} of ${meas.length}).`, pct >= 45 ? 4 : 1);
    const gap = meas.map(d => intake(d) - dayTarget(d)), avgGap = avg(gap);
    if (Math.abs(avgGap) >= 120) push('nutrition', 'warn', 'Average vs target', `On average you're eating ${Math.abs(Math.round(avgGap))} kcal ${avgGap > 0 ? 'over' : 'under'} target. ${S.settings.goal === 'bulk' ? (avgGap < 0 ? 'That eats into your surplus.' : 'That speeds the bulk up, and more of it will be fat.') : S.settings.goal === 'cut' ? (avgGap > 0 ? 'That slows the cut.' : 'Fast cuts cost muscle.') : ''}`, 1);
    const wk = meas.filter(d => [5, 6].includes(dayIdx(parse(d)))), wd = meas.filter(d => ![5, 6].includes(dayIdx(parse(d))));
    if (wk.length >= 2 && wd.length >= 4) { const g = avg(wk.map(intake)) - avg(wd.map(intake)); if (Math.abs(g) >= 250) push('nutrition', 'info', 'Weekends', `You eat ~${Math.abs(Math.round(g))} kcal ${g > 0 ? 'more' : 'less'} on weekends than weekdays.`, 3); }
    const byDow = [0, 1, 2, 3, 4, 5, 6].map(i => { const ds = meas.filter(d => dayIdx(parse(d)) === i); return ds.length ? avg(ds.map(d => intake(d) - dayTarget(d))) : null; });
    const top = byDow.reduce((b, v, i) => v != null && (b < 0 || v > byDow[b]) ? i : b, -1);
    if (top >= 0 && byDow[top] > 300) push('nutrition', 'info', 'Biggest day', `${DAYS[top]}s run ~${Math.round(byDow[top])} kcal over target on average. That's where most of your surplus comes from.`, 3);
    const tr = meas.filter(isTrainDay).map(d => (macD(d) || {}).c).filter(x => x > 0), rs = meas.filter(d => !isTrainDay(d)).map(d => (macD(d) || {}).c).filter(x => x > 0);
    if (tr.length >= 3 && rs.length >= 3 && avg(tr) < avg(rs)) push('nutrition', 'warn', 'Carbs', `You eat fewer carbs on training days (${Math.round(avg(tr))} g) than rest days (${Math.round(avg(rs))} g). Flip that so training is fuelled.`, 2);
  }
  const fib = days.map(d => HD(d).fiber).filter(x => x > 0);
  if (fib.length >= 5) { const a = avg(fib); push('nutrition', a >= 25 ? 'good' : 'info', 'Fibre', `Fibre averages ${Math.round(a)} g a day${a < 25 ? '. Aim for 25–35 g (oats, beans, fruit, veg).' : '.'}`, 4); }
  // --- Gym ---
  const idx = memo('exidx', exerciseIndex), split = memo('split', splitRows);
  const stalled = split.flatMap(r => r.exercises).filter(e => { const h = idx[e.ex] || []; if (h.length < 4) return false; const last3 = h.slice(-3).map(x => topE1(x.sets)), prior = Math.max(...h.slice(0, -3).map(x => topE1(x.sets))); return Math.max(...last3) <= prior * 1.0 && Math.max(...last3) > 0 && last3[2] <= last3[0]; });
  if (stalled.length) push('gym', 'warn', 'Stalled lifts', `No progress in the last 3 sessions: ${stalled.slice(0, 3).map(e => esc(e.ex)).join(', ')}${stalled.length > 3 ? ` +${stalled.length - 3} more` : ''}. Try a small deload (−10% for a week), a rep-range change, or check you're eating enough.`, 1);
  const prs = prList(from, 50).length;
  if (prs) push('gym', 'good', 'New bests', `${prs} new personal best${prs > 1 ? 's' : ''} in this period.`, 3);
  const ms = Object.fromEntries(muscleSets()), pushV = (ms.Chest || 0) + (ms.Shoulders || 0) + (ms.Triceps || 0), pullV = (ms.Back || 0) + (ms.Biceps || 0);
  if (pushV && pullV && (pushV / pullV > 1.4 || pullV / pushV > 1.4)) push('gym', 'info', 'Balance', `${pushV > pullV ? 'Push' : 'Pull'} work outweighs ${pushV > pullV ? 'pull' : 'push'} (${pushV.toFixed(0)} vs ${pullV.toFixed(0)} sets/week). Even them up for healthy shoulders.`, 3);
  const g4 = daysBetween(iso(addDays(new Date(), -27))).filter(d => d < today), done = g4.filter(d => LD(d).gym).length, planned = g4.filter(d => plannedActs(d).gym).length;
  if (planned >= 4) push('gym', done >= planned * .9 ? 'good' : 'info', 'Consistency', `${done} of ${planned} planned gym sessions done in the last 4 weeks.`, done >= planned * .9 ? 4 : 2);
  const sess = S.workouts.filter(w => w.d >= iso(addDays(new Date(), -56)) && w.m > 0);
  if (sess.length >= 8) { const h = Math.floor(sess.length / 2), a = avg(sess.slice(0, h).map(w => w.m)), b = avg(sess.slice(h).map(w => w.m)); if (Math.abs(b - a) >= 8) push('gym', 'info', 'Session length', `Sessions are ${b > a ? 'longer' : 'shorter'} lately (${Math.round(b)} vs ${Math.round(a)} min).`, 4); }
  // --- Running ---
  const runs = runsList(), wkKm = ws => sum(runs.filter(r => wkOf(r.d) === ws).map(r => r.km));
  const lw = weekKey(-1), lw2 = weekKey(-2), k1 = wkKm(lw), k2 = wkKm(lw2);
  if (k2 > 3 && k1 > k2 * 1.25) push('running', 'warn', 'Mileage jump', `Last week was ${fd(k1)} ${du()}, up ${Math.round((k1 / k2 - 1) * 100)}% on the week before. Keep weekly increases around 10% to stay injury-free.`, 1);
  const rr = runs.filter(r => r.d >= from);
  if (rr.length) { const lg = rr.reduce((a, r) => r.km > a.km ? r : a); push('running', 'info', 'Longest run', `${fd(lg.km)} ${du()} on ${fmtShort(lg.d)}.`, 5); }
  // --- Recovery ---
  const s7 = daysBetween(iso(addDays(new Date(), -6))).map(sleepH).filter(x => x != null);
  if (s7.length >= 4) { const debt = sum(s7.map(h => Math.max(0, 7.5 - h))); if (debt >= 3.5) push('recovery', 'warn', 'Sleep debt', `You're about ${debt.toFixed(1)} h short of 7.5 h a night this week. Two earlier nights would clear most of it.`, 1); }
  const st = days.map(d => HD(d).sleep).filter(s => s && s.total > 0 && (s.deep || s.rem));
  if (st.length >= 5) { const share = avg(st.map(s => (s.deep + s.rem) / s.total)); push('recovery', share >= .35 ? 'good' : 'info', 'Sleep quality', `Deep + REM make up ${Math.round(share * 100)}% of your sleep${share < .3 ? ', on the low side. Alcohol, late meals and late caffeine all cut it.' : '.'}`, 4); }
  const base = d => daysBetween(iso(addDays(parse(d), -30)), iso(addDays(parse(d), -3)));
  const b28 = f => meanOf(base(today).map(f).filter(x => x > 0)), now2 = f => meanOf([today, prevDay(today)].map(f).filter(x => x > 0));
  const rB = b28(d => HD(d).rhr), rN = now2(d => HD(d).rhr), qB = b28(d => HD(d).rr), qN = now2(d => HD(d).rr);
  if (rB && rN && qB && qN && rN - rB >= 4 && qN - qB >= 0.8) push('recovery', 'warn', 'Possible illness', `Resting HR (+${Math.round(rN - rB)} bpm) and breathing rate (+${(qN - qB).toFixed(1)}/min) are both up on your normal. That combination often shows up before a cold. Go easy for a day or two.`, 0);
  const aB = b28(d => HD(d).active), a7 = meanOf(daysBetween(iso(addDays(new Date(), -6))).map(d => HD(d).active).filter(x => x > 0));
  if (aB && a7 && a7 / aB > 1.4) push('recovery', 'warn', 'Training load', `Your activity this week is ${Math.round((a7 / aB - 1) * 100)}% above your 4-week norm. Watch recovery and eat to your higher targets.`, 1);
  const rd = readiness();
  if (rd) push('recovery', rd.band === 'high' ? 'good' : rd.band === 'ok' ? 'info' : 'warn', `Readiness ${rd.score}`, rd.advice, rd.band === 'low' ? 0 : 3);
  return out;
}
function allInsights(area) {
  return memo('all' + (area || '') + rangeFrom(), () => {
    const list = [...ruleInsights(), ...legacyInsights(), ...correlations()];
    const seen = new Set(), uniq = list.filter(i => { const k = i.area + i.title + i.text.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
    const sevRank = { warn: 0, info: 1, good: 2 };
    return uniq.filter(i => !area || i.area === area || (area === 'recovery' && i.area === 'activity'))
      .sort((a, b) => (a.prio - b.prio) || (sevRank[a.sev] - sevRank[b.sev]));
  });
}
const AREA_LABEL = { body: 'Body', nutrition: 'Nutrition', gym: 'Gym', running: 'Running', recovery: 'Recovery', activity: 'Activity', general: '' };
function insightCards(list, { tags = false, max } = {}) {
  const l = max ? list.slice(0, max) : list;
  if (!l.length) return '<div class="empty2">No insights yet. They appear as data builds up.</div>';
  const ic = { good: '✓', warn: '⚠', info: '💡' };
  return `<div class="ins">${l.map(i => `<div class="i ${i.sev}"><span class="ic">${ic[i.sev]}</span><div><b class="t">${i.title}</b>${i.text}</div>${tags && AREA_LABEL[i.area] ? `<span class="tag">${AREA_LABEL[i.area]}</span>` : ''}</div>`).join('')}</div>`;
}
