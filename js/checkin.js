/* Recomp · check-in: weekly review, verdict, calorie lock */
/* =====================================================================
   Weekly check-in
   ===================================================================== */
const FEEL = [['energy','Energy'],['hunger','Hunger'],['sleep','Sleep'],['gymFeel','Gym performance']];
// The check-in day for the current week: the latest one on or before today, or tomorrow's (early check-in).
function lastSlot() {
  const t = new Date(), back = (dayIdx(t) - S.settings.checkInDay + 7) % 7;
  return iso(addDays(t, back === 6 ? 1 : -back));
}
function checkinDone() { const s = lastSlot(); return S.checkins.find(c => (c.slot || c.date) >= s); }
// First check-in: the check-in day on/after the goal start (and at least a week after starting).
function firstCheckin() {
  const gs = goalStart(), wk = iso(addDays(parse(startDate()), 7));
  let d = parse(gs > wk ? gs : wk);
  while (dayIdx(d) !== +S.settings.checkInDay) d = addDays(d, 1);
  return iso(d);
}
function checkinDue() { return S.settings.onboarded && !checkinDone() && lastSlot() >= firstCheckin(); }

function liftChanges(days) {
  const set = new Set(days);
  let up = 0, same = 0, down = 0;
  for (const hist of Object.values(exerciseIndex())) hist.forEach((h, i) => {
    if (!i || !set.has(h.d)) return;
    const now = topE1(h.sets), before = topE1(hist[i - 1].sets);
    if (!now || !before) return;
    if (now > before * 1.005) up++; else if (now < before * 0.995) down++; else same++;
  });
  return { up, same, down };
}
function weekReview(slot) {
  const days = span7(slot, -7), prev = span7(slot, -14), cal = activeCal();
  const L = ds => ds.map(d => S.logs[d]).filter(Boolean);
  const wts = ds => L(ds).filter(l => l.weight > 0).map(l => +l.weight);
  const cw = wts(days), pw = wts(prev), ls = L(days), kc = ls.filter(l => l.kcal > 0).map(l => +l.kcal);
  const trendMap = Object.fromEntries(trendSeries().map(o => [o.date, o.t]));
  const tEnd = days.filter(d => trendMap[d]).pop();
  return {
    from: days[0], to: days[6],
    avgW: cw.length ? +avg(cw).toFixed(2) : null, weighIns: cw.length,
    prevW: pw.length ? +avg(pw).toFixed(2) : null,
    trend: tEnd ? +trendMap[tEnd].toFixed(2) : null,
    rate: recentRate(),
    kcal: kc.length ? Math.round(avg(kc)) : null, kcalDays: kc.length,
    target: r10(avg(days.map(d => targetFor(S.logs[d] || plannedActs(d), cal, d)))),
    aim: avg(days.map(aimRate)),
    gym: ls.filter(l => l.gym).length, gymPlanned: days.filter(d => plannedActs(d).gym).length,
    football: ls.filter(l => l.train || l.match).length,
    runKm: +sum(ls.map(l => +l.run || 0)).toFixed(1),
    lifts: liftChanges(days),
    health: healthWeek(days)
  };
}
// Goal-aware verdict on the weight trend.
function verdict(R) {
  const aim = R.aim || 0, goal = S.settings.goal;
  if (!S.checkins.length && R.prevW == null && R.avgW != null)
    return [`Baseline set: ${fw(R.avgW)} ${wu()} average`, 'This is your starting point. From next week the check-in compares against it.'];
  const rate = R.rate != null ? R.rate : (R.avgW != null && R.prevW != null ? R.avgW - R.prevW : null);
  if (rate == null) return ['Not enough weigh-ins yet', 'Aim for 4+ morning weigh-ins a week. After about 10 days the trend starts to mean something.'];
  const r = `${rateTxt(rate)} (aim ${aim ? rateTxt(aim) : 'steady'})`, diff = rate - aim;
  const adjNote = 'The learnt adjustment below corrects your calories automatically.';
  if (!aim) {
    if (Math.abs(rate) <= 0.1) return ['✓ Holding steady: ' + r, 'Maintenance is dialled in. Keep doing exactly this.'];
    return [(rate > 0 ? '▲ Drifting up: ' : '▼ Drifting down: ') + r, adjNote];
  }
  if (Math.abs(diff) <= (aim > 0 ? 0.12 : 0.15)) return ['✓ On track: ' + r, 'Keep doing exactly this.'];
  if (goal === 'cut' || aim < 0) {
    return diff < 0
      ? ['▼ Losing faster than planned: ' + r, 'Losing much faster than planned risks muscle and performance. ' + adjNote]
      : ['▲ Losing slower than planned: ' + r, 'Check your logged calories are honest, especially weekends. ' + adjNote];
  }
  return diff > 0
    ? ['▲ Gaining faster than planned: ' + r, 'In the first week or two this is mostly water and stored carbs. If it continues, ' + adjNote.toLowerCase()]
    : ['▼ Gaining slower than planned: ' + r, 'Make sure you actually eat the extra on training days. ' + adjNote];
}
function renderCheckin() {
  const due = checkinDue(), done = checkinDone(), slot = lastSlot();
  $('#ciBanner').classList.toggle('hidden', !due);
  $('#ciBanner').innerHTML = due ? `📋 <b>${slot > todayIso() ? `Check-in is tomorrow (${DAYS[S.settings.checkInDay]}). You can do it now.` : 'It\'s check-in time.'}</b> Review last week and lock in the coming week's calories. <button class="btn primary" data-go="checkin">Open check-in</button>` : '';
  const nextSlot = iso(addDays(parse(slot), 7)), first = firstCheckin(), sp = sportName();
  if (!done && slot < first) {
    const maint = todayIso() < goalStart() && S.settings.maintWeeks > 0;
    $('#ciBody').innerHTML = `<h2>First check-in: ${DAYS[dayIdx(parse(first))]} ${fmtShort(first)}</h2>
      <p class="help">${maint ? `Until then you're at <b>maintenance</b>. Eat to the targets on the Week plan, weigh in every morning and log your calories. That gives Recomp a clean baseline for your real maintenance.` : 'Until then, weigh in every morning and log your calories.'}
      At the first check-in you'll review the week and lock in the next one. You can change the start date, maintenance weeks and check-in day in Settings.</p>`;
  } else if (done) {
    const nd = span7(done.slot || done.date, 0);
    $('#ciBody').innerHTML = `<h2>✓ Checked in ${DAYS[dayIdx(parse(done.date))]} ${fmtShort(done.date)} for the week starting ${fmtShort(nd[0])}</h2>
      <p class="help">This week's calories are locked in: <b>${done.newTarget} kcal/day</b> on average. Next check-in: <b>${DAYS[dayIdx(parse(nextSlot))]} ${fmtShort(nextSlot)}</b>.</p>
      <div class="daypills">${nd.map(d => `<span>${DAYS[dayIdx(parse(d))]} <b>${targetFor(plannedActs(d), undefined, d)}</b></span>`).join('')}</div>
      <p><button class="btn" id="ciRedo">Redo this check-in</button></p>`;
  } else {
    const R = weekReview(slot), [vt, vd] = verdict(R), prevCal = activeCal(), newCal = liveCal();
    const nd = span7(slot, 0), newT = nd.map(d => targetFor(plannedActs(d), newCal, d)), oldT = nd.map(d => targetFor(plannedActs(d), prevCal, d));
    const lastStrong = S.workouts.length ? S.workouts[S.workouts.length - 1].d : null;
    const tick = ok => ok ? '<span class="good">✓</span>' : '<span class="warn">•</span>';
    const L = R.lifts, lt = L.up + L.same + L.down;
    $('#ciBody').innerHTML = `<h2>Weekly check-in · reviewing ${fmtShort(R.from)} – ${fmtShort(R.to)}</h2>
      <div class="summary">
        <div>Weight<br><b>${R.avgW != null ? fw(R.avgW) + ' ' + wu() : '—'}</b> avg<span class="src">${R.weighIns} weigh-in${R.weighIns === 1 ? '' : 's'} · streak ${weighInStreak().cur}${R.avgW != null && R.prevW != null ? ` · ${sgn(fw(R.avgW - R.prevW, 2))} ${wu()} vs week before` : ''}</span></div>
        <div>Eating<br><b>${R.kcal != null ? R.kcal : '—'}</b> kcal avg<span class="src">target avg ${R.target} · ${R.kcalDays}/7 days logged</span></div>
        <div>Training<br><b>${R.gym}/${R.gymPlanned}</b> gym<span class="src">${sp ? `${R.football} ${esc(sp.toLowerCase())} · ` : ''}${fd(R.runKm)} ${du()} run</span></div>
        ${R.health ? `<div>Recovery<br><b>${R.health.sleep != null ? R.health.sleep.toFixed(1) + ' h' : '—'}</b> sleep<span class="src">${[R.health.rhr != null && `RHR ${Math.round(R.health.rhr)}`, R.health.hrv != null && `HRV ${Math.round(R.health.hrv)}`, R.health.steps != null && `${(R.health.steps / 1000).toFixed(1)}k steps`, R.health.pDays != null && `protein ${R.health.pDays}/${R.health.pOf} days`].filter(Boolean).join(' · ')}</span></div>` : ''}
        <div>Lifts<br><b>${lt ? `${L.up} up` : '—'}</b>${lt ? ` · ${L.same} same · ${L.down} down` : ''}<span class="src">${lt ? 'vs the previous time you did each exercise' : 'Connect Hevy or import Strong to see this'}</span></div>
      </div>
      <div class="verdict"><b>${vt}</b><br>${vd}</div>
      <h2>Before you lock it in</h2>
      <ul class="checklist">
        <li>${tick(R.weighIns >= 4)} Weigh-ins last week: ${R.weighIns}/7 <button class="link" data-go="log">Edit a day</button></li>
        ${HV.key ? `<li>${tick(HV.lastSync && Date.now() - HV.lastSync < 864e5)} Hevy: last synced ${HV.lastSync ? new Date(HV.lastSync).toLocaleString() : 'never'} <button class="link" id="ciHevy">Sync now</button></li>`
          : S.workouts.length ? `<li>${tick(lastStrong && dayNum(lastStrong) >= dayNum(R.to) - 3)} Strong data: latest workout ${lastStrong ? fmtShort(lastStrong) : 'none'}. Export from Strong and <button class="link" data-go="settings">import it</button> if you've trained since.</li>` : ''}
        ${SV.refresh ? `<li>${tick(SV.lastSync && Date.now() / 1000 - SV.lastSync < 86400)} Strava: last synced ${SV.lastSync ? new Date(SV.lastSync * 1000).toLocaleString() : 'never'} <button class="link" id="ciSync">Sync now</button></li>` : ''}
        <li>${tick(true)} Anything different this week${sp ? ` (no ${esc(sp.toLowerCase())}, extra runs)` : ''}? Change it in the <button class="link" data-go="plan">Week plan</button>. Targets below update.</li>
      </ul>
      <h2>This week's calories</h2>
      <p class="help">Learnt adjustment: <b>${sgn(newCal.corr)} kcal</b>${S.checkins.length ? ` (was ${sgn(prevCal.corr)})` : ''} · average target <b>${r10(avg(newT))} kcal/day</b>${S.checkins.length ? ` (was ${r10(avg(oldT))})` : ''}</p>
      <div class="daypills">${nd.map((d, i) => `<span>${DAYS[dayIdx(parse(d))]} <b>${newT[i]}</b></span>`).join('')}</div>
      <h2>How did the week feel?</h2>
      <div class="grid2">${FEEL.map(([k, t]) => `<label class="f">${t}<select id="ci_${k}"><option value="">–</option>${[1,2,3,4,5].map(v => `<option>${v}</option>`).join('')}</select></label>`).join('')}</div>
      <label class="f" style="margin-top:10px">Notes (injuries, missed sessions, anything odd)<textarea id="ciNotes"></textarea></label>
      <p><button class="btn primary" id="ciDone">Complete check-in &amp; lock this week's calories</button></p>`;
  }
  const hist = [...S.checkins].reverse();
  $('#ciHistory').innerHTML = hist.length ? `<tr><th>Date</th><th>Avg weight</th><th>Change</th><th>Ate / target</th><th>Gym</th><th>Lifts ↑/=/↓</th><th>New target</th><th>Feel (E/H/S/G)</th><th>Notes</th></tr>` +
    hist.map(c => `<tr><td>${fmtShort(c.date)}</td><td>${c.avgW != null ? fw(c.avgW) : '—'}</td>
      <td>${c.avgW != null && c.prevW != null ? sgn(fw(c.avgW - c.prevW, 2)) : '—'}</td>
      <td>${c.kcal || '—'} / ${c.target}</td><td>${c.gym}/${c.gymPlanned}</td>
      <td>${c.lifts.up}/${c.lifts.same}/${c.lifts.down}</td><td>${c.newTarget}</td>
      <td>${FEEL.map(([k]) => c.feel[k] || '–').join('/')}</td><td>${esc(c.notes || '')}</td></tr>`).join('')
    : '<tr><td class="empty">No check-ins yet.</td></tr>';
}
function completeCheckin() {
  const slot = lastSlot(), R = weekReview(slot), c = liveCal();
  const feel = Object.fromEntries(FEEL.map(([k]) => [k, +$('#ci_' + k).value || null]));
  S.checkins.push({ date: todayIso(), slot, ...R, corr: c.corr, w: +c.w.toFixed(2),
    newTarget: r10(avg(span7(slot, 0).map(d => targetFor(plannedActs(d), c, d)))), feel, notes: $('#ciNotes').value.trim() });
  save(); renderAll();
}

