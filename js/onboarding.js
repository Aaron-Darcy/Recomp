/* Recomp · onboarding: first-run setup and demo data */
/* =====================================================================
   Onboarding + demo data
   ===================================================================== */
let OB = null;
function openOnboarding() {
  const s = S.settings;
  OB = { units: s.units, sex: s.sex, age: s.onboarded ? s.age : '', heightCm: s.onboarded ? s.heightCm : '', weight: s.onboarded ? s.startWeight : '',
    goal: s.onboarded ? s.goal : 'maintain', adjust: s.onboarded ? s.adjust : 0, factor: s.factor, sport: s.sport, matchDay: s.matchDay,
    checkInDay: s.checkInDay, startDate: s.onboarded && s.startDate ? s.startDate : todayIso(), maint: s.onboarded ? +s.maintWeeks > 0 : false,
    days: S.template.map(a => ({ ...a })) };
  renderOnboarding();
  $('#onboard').classList.remove('hidden');
}
function paceOptions(goal) {
  const conv = kg => OB.units === 'imperial' ? kg * LB : kg;
  const rr = kcal => `${sgn(conv(kcal * 7 / KCAL_PER_KG).toFixed(2))} ${OB.units === 'imperial' ? 'lb' : 'kg'}/week`;
  return { cut: [[-300, `Steady: −300 kcal/day (~${rr(-300)})`], [-500, `Faster: −500 kcal/day (~${rr(-500)})`]],
    maintain: [[0, 'Maintain: 0 kcal/day']],
    bulk: [[150, `Lean: +150 kcal/day (~${rr(150)})`], [250, `Faster: +250 kcal/day (~${rr(250)})`]] }[goal];
}
function renderOnboarding() {
  const im = OB.units === 'imperial', po = paceOptions(OB.goal);
  if (!po.some(([v]) => v === +OB.adjust)) OB.adjust = po[0][0];
  const hFt = OB.heightCm ? Math.floor(OB.heightCm / 30.48) : '', hIn = OB.heightCm ? Math.round(OB.heightCm / 2.54 % 12) : '';
  const wv = OB.weight ? +(im ? OB.weight * LB : OB.weight).toFixed(1) : '';
  const cell = (i, f) => `<td><input type="checkbox" data-d="${i}" data-f="${f}" ${OB.days[i][f] ? 'checked' : ''} aria-label="${DAYS[i]} ${f}"></td>`;
  $('#onboard').innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="obTitle">
    <div class="brand"><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)"/><path d="M6 22 L13 15 L18 19 L26 10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><h2 id="obTitle" style="margin:0">Welcome to Recomp</h2></div>
    <p class="help">About a minute to set up. Everything stays in this browser. You can change any of it later in Settings.</p>
    <div class="grid2">
      <label class="f">Units<select data-ob="units"><option value="metric" ${!im ? 'selected' : ''}>Metric (kg, cm, km)</option><option value="imperial" ${im ? 'selected' : ''}>Imperial (lb, ft/in, mi)</option></select></label>
      <label class="f">Sex<select data-ob="sex"><option value="m" ${OB.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${OB.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
      <label class="f">Age<input type="number" data-ob="age" value="${OB.age}" min="14" max="90"></label>
      ${im ? `<label class="f">Height (ft / in)<span class="row" style="gap:6px"><input type="number" data-ob="hft" value="${hFt}" style="width:70px"><input type="number" data-ob="hin" value="${hIn}" style="width:70px"></span></label>`
           : `<label class="f">Height (cm)<input type="number" data-ob="hcm" value="${OB.heightCm ? Math.round(OB.heightCm) : ''}"></label>`}
      <label class="f">Weight (${im ? 'lb' : 'kg'})<input type="number" step="0.1" data-ob="weight" value="${wv}"></label>
      <label class="f">Goal<select data-ob="goal">${Object.entries(GOALS).map(([k, n]) => `<option value="${k}" ${OB.goal === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">Pace<select data-ob="adjust">${po.map(([v, n]) => `<option value="${v}" ${+OB.adjust === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">Day to day (outside training)<select data-ob="factor">${[[1.25,'Desk job, under 5k steps'],[1.3,'Desk job, 5–8k steps'],[1.4,'On your feet a lot, 8–12k steps'],[1.5,'Physical job, 12k+ steps']].map(([v, n]) => `<option value="${v}" ${+OB.factor === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">Team sport (optional)<input type="text" list="obSports" data-ob="sport" value="${esc(OB.sport)}" placeholder="e.g. Football"><datalist id="obSports">${Object.keys(SPORT_EMOJI).map(s => `<option value="${cap(s)}">`).join('')}</datalist></label>
      <label class="f">Weekly check-in day<select data-ob="checkInDay">${DAYS.map((d, i) => `<option value="${i}" ${+OB.checkInDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="f">Start date<input type="date" data-ob="startDate" value="${OB.startDate}"></label>
      <label class="f" style="flex-direction:row;align-items:center;gap:6px;color:var(--ink2);font-size:13px"><input type="checkbox" data-ob="maint" ${OB.maint ? 'checked' : ''}> Start with 1 week at maintenance (recommended: gives a clean baseline)</label>
    </div>
    <h3 style="margin:16px 0 4px">Your usual week</h3>
    <div class="tablewrap" style="margin-top:4px"><table class="obweek">
      <tr><th></th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr>
      <tr><td>🏋️ Gym</td>${DAYS.map((_, i) => cell(i, 'gym')).join('')}</tr>
      ${OB.sport.trim() ? `<tr><td>${SPORT_EMOJI[OB.sport.trim().toLowerCase()] || '🏅'} ${esc(cap(OB.sport.trim()))} training</td>${DAYS.map((_, i) => cell(i, 'train')).join('')}</tr>
      <tr><td>🏟️ Match</td>${DAYS.map((_, i) => cell(i, 'match')).join('')}</tr>` : ''}
      <tr><td>🏃 Run (${im ? 'mi' : 'km'})</td>${DAYS.map((_, i) => `<td><input type="number" min="0" step="0.5" data-d="${i}" data-f="run" value="${OB.days[i].run ? +(im ? OB.days[i].run / MI : OB.days[i].run).toFixed(1) : ''}" aria-label="${DAYS[i]} run"></td>`).join('')}</tr>
    </table></div>
    <p class="status" id="obErr"></p>
    <div class="row between" style="margin-top:8px">
      <button class="btn" id="obDemo">Try with demo data</button>
      <div class="row">${S.settings.onboarded ? '<button class="btn" id="obCancel">Cancel</button>' : ''}<button class="btn primary" id="obStart">${S.settings.onboarded ? 'Save' : 'Start'}</button></div>
    </div></div>`;
}
function finishOnboarding() {
  const im = OB.units === 'imperial';
  const h = OB.heightCm, w = +OB.weight, age = +OB.age;
  if (!(age >= 14 && age <= 90) || !(h >= 120 && h <= 230) || !(w >= 35 && w <= 300))
    return $('#obErr').innerHTML = '<span class="warn">Please fill in age, height and weight.</span>';
  const sport = OB.sport.trim();
  Object.assign(S.settings, { units: OB.units, sex: OB.sex, age, heightCm: Math.round(h), startWeight: +w.toFixed(2), goal: OB.goal,
    adjust: +OB.adjust, factor: +OB.factor, sport, checkInDay: +OB.checkInDay, startDate: OB.startDate || todayIso(),
    maintWeeks: OB.maint ? 1 : 0, onboarded: true });
  S.template = OB.days.map(a => { const r = { ...a }; if (!sport) { delete r.train; delete r.match; } return r; });
  for (const k of Object.keys(S.plans)) if (k >= weekKey(0)) delete S.plans[k];
  applyImports(); save();
  $('#onboard').classList.add('hidden');
  renderSettings(); renderAll(); fillLogForm(todayIso());
}
// Deterministic fake data so people (and README screenshots) can see every feature.
function loadDemo() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const today = new Date(), start = addDays(monday(today), -7 * 10);
  S = defaults(); S.demo = true;
  Object.assign(S.settings, { units: 'metric', sex: 'm', age: 28, heightCm: 180, startWeight: 76, goal: 'bulk', adjust: 200, factor: 1.3,
    sport: 'Football', matchDay: 5, checkInDay: 0, startDate: iso(start), maintWeeks: 1, onboarded: true, train: 550, match: 700 });
  S.template = [{ gym: 1, w: 'Legs' }, { gym: 1, w: 'Push', run: 5 }, { gym: 1, train: 1, w: 'Pull' }, { run: 8 }, { gym: 1, w: 'Upper' }, { match: 1 }, {}];
  const plan = {
    Legs: [['Leg Press', 130, 10], ['Romanian Deadlift (Dumbbell)', 30, 10], ['Leg Extension (Machine)', 55, 12], ['Seated Leg Curl (Machine)', 45, 12], ['Standing Calf Raise (Machine)', 60, 12]],
    Push: [['Bench Press (Barbell)', 72.5, 8], ['Incline Bench Press (Dumbbell)', 26, 10], ['Shoulder Press (Machine)', 45, 10], ['Lateral Raise (Dumbbell)', 10, 12], ['Triceps Pushdown (Cable)', 25, 12]],
    Pull: [['Lat Pulldown (Cable)', 62.5, 10], ['Seated Row (Cable)', 55, 10], ['Reverse Fly (Cable)', 10, 12], ['Preacher Curl (Dumbbell)', 14, 10], ['Hammer Curl (Dumbbell)', 16, 10]],
    Upper: [['Incline Bench Press (Dumbbell)', 26, 10], ['T Bar Row', 40, 10], ['Lateral Raise (Dumbbell)', 10, 12], ['Bicep Curl (Cable)', 25, 12], ['Triceps Extension', 20, 12]]
  };
  const dayOf = { Legs: 0, Push: 1, Pull: 2, Upper: 4 }, rnd25 = v => Math.round(v / 2.5) * 2.5;
  for (let w = -30; w < 10; w++) {                       // 30 weeks of history before the start (peak, then a cut), then 10 weeks of recovery
    const f = w < -12 ? 0.96 + (w + 30) * 0.004 : w < 0 ? 1.03 - (w + 12) * 0.008 : 0.94 + w * 0.012;
    for (const [n, ex] of Object.entries(plan)) {
      const d = iso(addDays(start, 7 * w + dayOf[n])); if (d >= iso(today)) continue;
      S.workouts.push({ id: d + ' 18:00:00', d, n, m: 50 + Math.round(rnd() * 15),
        s: ex.flatMap(([e, base, reps]) => [0, 1, 2].map(i => [e, rnd25(base * f), Math.max(6, reps - i - Math.round(rnd() * 2)), String(i + 1)])) });
    }
  }
  let wt = 75.6, id = 1;
  for (let d = new Date(start); iso(d) < iso(today); d = addDays(d, 1)) {
    const ds = iso(d), a = S.template[dayIdx(d)], wk = Math.floor((d - start) / 6048e5);
    wt += (ds >= iso(addDays(start, 7)) ? 0.026 : 0) + (rnd() - 0.5) * 0.02;
    const l = logFor(ds);
    if (rnd() > 0.12) l.weight = +(wt + (rnd() - 0.5) * 0.7).toFixed(2);
    Object.assign(l, { gym: a.gym ? 1 : 0, train: a.train ? 1 : 0, match: a.match ? 1 : 0, run: 0 });
    const tgt = r10(formulaTDEE(a, 76) + (ds >= iso(addDays(start, 7)) ? 200 : 0));
    if (rnd() > 0.1) l.kcal = r10(tgt + (rnd() - 0.55) * 300 - ((a.train || a.match) ? 120 : 0));
    if (a.run) { const km = +(a.run + (rnd() - 0.5) * 1.5).toFixed(2); S.acts[id++] = { d: ds, type: 'Run', name: a.run > 6 ? 'Intervals' : 'Easy run', km, min: Math.round(km * (5.9 - wk * 0.03 + (rnd() - 0.5) * 0.4)), kcal: Math.round(km * 62) }; }
    if (a.train) S.acts[id++] = { d: ds, type: 'Soccer', name: 'Evening Football', km: 0, min: 75 + Math.round(rnd() * 20), kcal: 520 + Math.round(rnd() * 150) };
    if (a.match) S.acts[id++] = { d: ds, type: 'Soccer', name: 'Match vs Rovers', km: 0, min: 90, kcal: 650 + Math.round(rnd() * 150) };
  }
  // Apple Health: ~7 weeks of sleep, heart, steps and food. Short nights are followed by bigger eating days, so the insights have something to find.
  S.settings.targetWeight = 80;
  for (let i = 48; i >= 0; i--) {
    const ds = iso(addDays(today, -i)), a = S.template[dayIdx(parse(ds))], hard = a.match || a.train || a.run > 6;
    const sl = Math.max(4.8, Math.min(9, 7.3 + (rnd() - 0.5) * 2.2 - (dayIdx(parse(ds)) === 5 ? 0.6 : 0)));
    const bed = parse(ds).getTime() - (24 - 22.8 - (rnd() - 0.4) * 1.5) * 36e5, h = {
      sleep: { total: +sl.toFixed(2), deep: +(sl * (0.13 + rnd() * 0.05)).toFixed(2), rem: +(sl * (0.2 + rnd() * 0.05)).toFixed(2), awake: +(0.2 + rnd() * 0.4).toFixed(2), inBed: +(sl + 0.4).toFixed(2), start: bed, end: bed + (sl + 0.4) * 36e5 },
      rhr: Math.round(54 + (sl < 6.3 ? 3 : 0) + (rnd() - 0.5) * 4 - i * 0.03), hrv: Math.round(62 + (sl - 7) * 6 + (rnd() - 0.5) * 12 + (48 - i) * 0.1),
      rr: +(14.2 + (rnd() - 0.5) * 0.8).toFixed(1), steps: Math.round(7500 + rnd() * 6000 + (hard ? 3000 : 0)), active: Math.round(450 + rnd() * 250 + (hard ? 450 : 0)),
      basal: 1720, fiber: Math.round(18 + rnd() * 14)
    };
    h.sleep.core = +(sl - h.sleep.deep - h.sleep.rem).toFixed(2);
    if (i % 9 === 0) h.vo2 = +(49 + (48 - i) * 0.03).toFixed(1);
    S.health[ds] = h;
    const prev = S.health[iso(addDays(parse(ds), -1))], l = S.logs[ds];
    if (l && l.kcal > 0 && i > 0) {
      if (prev && prev.sleep.total < 6.5) l.kcal = r10(l.kcal + 280 + rnd() * 120);
      const p = Math.round(130 + rnd() * 45), f = Math.round(65 + rnd() * 30);
      Object.assign(l, { kSrc: 'health', mac: { p, f, c: Math.max(120, Math.round((l.kcal - p * 4 - f * 9) / 4)) } });
      Object.assign(h, { kcal: l.kcal, mac: l.mac });
    }
  }
  // Runs: per-km splits, and detected blocks for the interval sessions.
  for (const a of Object.values(S.acts)) if (a.type === 'Run') {
    const n = Math.floor(a.km), base = a.min * 60 / a.km, ivr = a.name === 'Intervals';
    a.hr = Math.round(150 + rnd() * 12); a.src = 'strava';
    a.splits = [...Array(n)].map((_, k) => ({ km: 1, s: Math.round(base * (ivr ? (k % 2 ? 1.12 : 0.86) : 1 + (rnd() - 0.5) * 0.06)), hr: Math.round(a.hr + (ivr && k % 2 === 0 ? 10 : 0) + k) }));
    if (ivr) {
      let t0 = 0, d0 = 0; a.workout = true;
      a.ivs = { structured: true, reps: 6, segs: [['easy', 600, 1.7], ...[...Array(6)].flatMap(() => [['fast', 180, 0.75], ['easy', 120, 0.3]]), ['easy', 300, 0.9]].map(([type, s, km]) => {
        const o = { type, t0, s, km, hr: type === 'fast' ? 172 : 145, hrMax: type === 'fast' ? 181 : 152, d0, d1: +(d0 + km).toFixed(3) }; t0 += s; d0 = +(d0 + km).toFixed(3); return o; }) };
    }
  }
  applyImports(); save();
  $('#onboard').classList.add('hidden');
  renderSettings(); renderAll(); fillLogForm(todayIso());
}

