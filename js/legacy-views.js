/* Recomp · views: Plan and Log renderers (moved from the old single page) */
/* ---------- render: plan ---------- */
function renderPlan() {
  const key = weekKey(), start = parse(key), cal = activeCal();
  const plan = weekPlan(key);
  const labels = {0:'This week', 1:'Next week', '-1':'Last week'};
  $('#wkLabel').textContent = `${labels[weekOffset] ?? 'Week of'} · ${fmtShort(key)} – ${fmtShort(iso(addDays(start, 6)))}`;
  const today = todayIso(), sp = sportName();
  $('#week').innerHTML = plan.map((a, i) => {
    const d = iso(addDays(start, i)), act = withActual(a, d), k = targetFor(act, cal, d), m = macros(k), log = S.logs[d];
    const watched = [['train', sportEmoji()], ['match', sportEmoji()], ['run', '🏃']].map(([kd, ic]) => {
      const v = (kd === 'run' ? +act.run > 0 : act[kd]) && watchKcal(act, kd); return v ? `${ic} ${v}` : null; }).filter(Boolean);
    const chip = (f, t, title) => `<button class="chip ${a[f] ? 'on' : ''}" data-i="${i}" data-f="${f}" title="${esc(title || t)}">${t}</button>`;
    return `<div class="day ${d === today ? 'today' : ''}">
      <h3>${DAYS[i]} <span class="date">${fmtShort(d)}</span></h3>
      ${chip('gym', '🏋️ ' + (a.w ? esc(a.w) : 'Gym'))}
      ${sp ? chip('train', `${sportEmoji()} Training`, `${sp} training`) + chip('match', '🏟️ Match', `${sp} match`) : ''}
      <label class="run">🏃 Run <input type="number" min="0" step="0.5" value="${a.run ? fd(a.run) : ''}" data-i="${i}" data-run placeholder="0"> ${du()}</label>
      <div class="kcal">${k}</div>
      <div class="mac">P ${m.p}g · C ${m.c}g · F ${m.f}g</div>
      ${watched.length ? `<div class="mac" title="Uses your watch's calories from Strava instead of the estimate">⌚ ${watched.join(' · ')} kcal (watch)</div>` : ''}
      ${d >= startDate() && d < goalStart() ? '<div class="mac"><span class="pill">Maintenance</span></div>' : ''}
      ${d === today && log && log.kSrc === 'health' ? `<div class="logged">Eaten so far ${log.kcal}${log.mac ? ` · P ${log.mac.p}g` : ''}<br><b>${Math.max(0, k - log.kcal)} kcal${log.mac ? ` &amp; ${Math.max(0, m.p - log.mac.p)}g protein` : ''} left</b></div>`
        : log && log.kcal ? `<div class="logged">${log.kSrc === 'health' ? 'Ate' : 'Logged'} ${log.kcal} kcal</div>` : ''}
    </div>`;
  }).join('');
  const ks = plan.map((a, i) => targetFor(a, cal, iso(addDays(start, i)))), total = sum(ks);
  const m = macros(r10(total/7));
  const perUnit = +(S.settings.proteinPerKg / (imp() ? LB : 1)).toFixed(2);
  $('#weekSummary').innerHTML = `
    <div>Week total<br><b>${total.toLocaleString()} kcal</b></div>
    <div>Prefer eating the same every day?<br><b>${r10(total/7)} kcal/day</b> <span class="pill">P ${m.p} · C ${m.c} · F ${m.f}</span></div>
    <div>Protein every day<br><b>${m.p} g</b> <span class="pill">${perUnit} g/${wu()}</span></div>`;
}

/* ---------- render: log ---------- */
function fillLogForm(d) {
  const l = S.logs[d], a = l || plannedActs(d);
  $('#lDate').value = d;
  $('#lWeight').value = l && l.weight ? +fw(l.weight, 2) : '';
  $('#lWeightSrc').textContent = l && l.weight && (l.wSrc === 'hevy' || l.wSrc === 'health') ? `from ${l.wSrc === 'hevy' ? 'Hevy' : 'Apple Health'} · changing it here makes it manual` : '';
  $('#lGym').checked = !!a.gym; $('#lTrain').checked = !!a.train; $('#lMatch').checked = !!a.match;
  $('#lRun').value = a.run ? fd(a.run, 2) : '';
  $('#lKcal').value = l && l.kcal ? l.kcal : targetFor(a, undefined, d);
  $('#lKcal').dataset.pre = $('#lKcal').value;   // unchanged = not a manual entry (Health can still fill it in)
}
function formActs() { return { gym: $('#lGym').checked ? 1 : 0, train: $('#lTrain').checked ? 1 : 0, match: $('#lMatch').checked ? 1 : 0, run: +dIn(+$('#lRun').value || 0).toFixed(2) }; }
function actsText(l) {
  const sp = sportName();
  return [l.gym && 'Gym', sp && l.train && `${sp} training`, sp && l.match && `${sp} match`, l.run > 0 && `Run ${fd(l.run)} ${du()}`].filter(Boolean).join(', ') || 'Rest';
}
function renderLog() {
  const trend = Object.fromEntries(trendSeries().map(o => [o.date, o.t]));
  const keys = Object.keys(S.logs).sort().reverse();
  $('#lWeightLbl').textContent = `Morning weight (${wu()})`;
  if (!keys.length) { $('#logTable').innerHTML = '<tr><td class="empty">Nothing logged yet. Start with today\'s weigh-in.</td></tr>'; return; }
  const src = l => {
    const out = [];
    if (l.strong) out.push(`${l.strong.src === 'hevy' ? 'Hevy' : 'Strong'}: ${esc(l.strong.name)} · ${l.strong.sets} sets`);
    for (const a of Object.values(l.strava || {})) out.push(`${a.src === 'health' ? 'Health' : 'Strava'}: ${esc(a.name)}${a.km ? ` · ${fd(a.km)} ${du()}` : ''} · ${a.min} min${a.kcal ? ` · ${a.kcal} kcal (watch)` : ''}`);
    return out.map(s => `<span class="src">${s}</span>`).join('');
  };
  const flagged = flaggedWeighIns();
  const wCell = (k, l) => !l.weight ? '—' : fw(l.weight, 2) +
    (l.wSrc === 'hevy' ? '<span class="src">via Hevy</span>' : l.wSrc === 'health' ? '<span class="src">via Health</span>' : '') +
    (flagged.has(k) ? `<span class="src warn">⚠ looks off, so it's left out of your trend · <button class="link" data-wok="${k}">It's right</button></span>` : '');
  $('#logTable').innerHTML = `<tr><th>Date</th><th>Weight</th><th>Trend</th><th>Eaten</th><th>Activity</th><th></th></tr>` +
    keys.map(k => { const l = S.logs[k]; return `<tr>
      <td>${DAYS[dayIdx(parse(k))]} ${fmtShort(k)}</td>
      <td>${wCell(k, l)}</td>
      <td>${trend[k] ? fw(trend[k], 2) : '—'}</td>
      <td>${l.kcal || '—'}${l.kSrc === 'health' ? `<span class="src">via Health${l.mac ? ` · P ${l.mac.p} C ${l.mac.c} F ${l.mac.f}` : ''}</span>` : ''}</td>
      <td>${actsText(l)}${src(l)}</td>
      <td class="x"><button data-edit="${k}" title="Edit" aria-label="Edit ${k}">✎</button><button data-del="${k}" title="Delete" aria-label="Delete ${k}">×</button></td></tr>`; }).join('');
}

/* ---------- render: settings ---------- */
const DAY_OPTS = Object.fromEntries(DAYS.map((d, i) => [i, d]));
const GOALS = { cut: 'Lose fat (cut)', maintain: 'Maintain', bulk: 'Build muscle (bulk)' };
const GOAL_DEFAULT = { cut: -400, maintain: 0, bulk: 200 };
// [key, label, type]: number step | 'w' weight | 'perW' g per weight unit | 'perD' kcal per distance unit | 'height' | 'date' | 'text' | {options}
const FIELDS = [
  ['units','Units',{metric:'Metric (kg, cm, km)', imperial:'Imperial (lb, ft/in, mi)'}],
  ['sex','Sex',{m:'Male',f:'Female'}],['age','Age',1],['heightCm','Height','height'],['startWeight','Starting weight','w'],['targetWeight','Target weight (0 = none, used for the goal projection)','w'],
  ['goal','Goal',GOALS],['adjust','Daily calories vs maintenance (− deficit, + surplus)',10],
  ['factor','Daily-life factor (1.25 desk job · 1.3 desk + walking · 1.4 on your feet · 1.5 physical job)',0.05],
  ['startDate','Start date','date'],['maintWeeks','Maintenance weeks before the goal starts',1],['checkInDay','Weekly check-in day',DAY_OPTS],
  ['gym','Gym session (kcal)',10],['runPerKm',() => `Run kcal per ${du()} (0 = auto)`,'perD'],
  ['sport','Team sport (blank = none)','text'],
  ['train',() => `${cap(sportName() || 'Sport')} training (kcal)`,10],['match',() => `${cap(sportName() || 'Sport')} match (kcal)`,10],
  ['matchDay','Match day (Strava sessions on this day count as a match)',DAY_OPTS],
  ['proteinPerKg',() => `Protein (g per ${wu()} bodyweight)`,'perW'],['fatPerKg',() => `Fat (g per ${wu()} bodyweight)`,'perW'],
  ['repLow','Rep range: bottom',1],['repHigh','Rep range: top (hit this on every set, then add weight)',1]
];
const SPORT_FIELDS = ['train', 'match', 'matchDay'];
function fieldVal(k, t) {
  const v = S.settings[k];
  if (t === 'w') return +fw(v);
  if (t === 'perW') return +(v / (imp() ? LB : 1)).toFixed(2);
  if (t === 'perD') return v ? Math.round(v * (imp() ? MI : 1)) : 0;
  return v;
}
function renderSettings() {
  $('#settingsForm').innerHTML = FIELDS.filter(([k]) => hasSport() || !SPORT_FIELDS.includes(k)).map(([k, lbl, t]) => {
    const L = typeof lbl === 'function' ? lbl() : lbl;
    if (t === 'height') return imp()
      ? `<label class="f">Height (ft / in)<span class="row" style="gap:6px"><input type="number" step="1" data-h="ft" value="${Math.floor(S.settings.heightCm / 30.48)}" style="width:70px"><input type="number" step="1" data-h="in" value="${Math.round(S.settings.heightCm / 2.54 % 12)}" style="width:70px"></span></label>`
      : `<label class="f">Height (cm)<input type="number" step="1" data-h="cm" value="${Math.round(S.settings.heightCm)}"></label>`;
    if (t === 'date') return `<label class="f">${L}<input type="date" data-s="${k}" data-t="date" value="${S.settings[k]}"></label>`;
    if (t === 'text') return `<label class="f">${L}<input type="text" list="sportList" data-s="${k}" data-t="text" value="${esc(S.settings[k])}"></label>`;
    if (typeof t === 'object') return `<label class="f">${L}<select data-s="${k}" data-t="opt">${Object.entries(t).map(([v, n]) => `<option value="${v}" ${String(S.settings[k]) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    const typ = typeof t === 'string' ? t : 'n', step = t === 'w' ? 0.1 : t === 'perW' ? 0.05 : t === 'perD' ? 1 : t;
    return `<label class="f">${k === 'startWeight' || k === 'targetWeight' ? `${L} (${wu()})` : L}<input type="number" step="${step}" data-s="${k}" data-t="${typ}" value="${fieldVal(k, t)}"></label>`;
  }).join('') + `<datalist id="sportList">${Object.keys(SPORT_EMOJI).map(s => `<option value="${cap(s)}">`).join('')}</datalist>`;
}

