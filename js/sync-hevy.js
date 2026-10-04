/* =====================================================================
   Hevy — official API (Hevy Pro): workouts, plus optional weigh-ins
   ===================================================================== */
const HKEY = 'recomp.hevy';                  // kept separate so the API key never ends up in backups
let HV = (() => { try { return JSON.parse(localStorage.getItem(HKEY)) || {}; } catch (e) { return {}; } })();
const saveHV = () => { try { localStorage.setItem(HKEY, JSON.stringify(HV)); } catch (e) {} };
const hvMsg = (t, cls = '') => { $('#hvMsg').innerHTML = t ? `<span class="${cls}">${t}</span>` : ''; };
const SET_CODE = { warmup: 'W', dropset: 'D', failure: 'F' };

async function hevyGet(path, key = HV.key) {
  const r = await fetch('https://api.hevyapp.com/v1' + path, { headers: { 'api-key': key, accept: 'application/json' } });
  if (r.status === 401) throw new Error('Hevy rejected the API key. Check it at hevy.com/settings?developer (needs Hevy Pro).');
  if (r.status === 429) throw new Error('Hevy rate limit hit. Try again in a few minutes.');
  if (!r.ok) throw new Error('Hevy error ' + r.status);
  return r.json();
}
async function hevyPages(path, field) {      // the API caps pageSize at 10
  let out = [], page = 1, count = 1;
  do {
    const j = await hevyGet(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=10`);
    out = out.concat(j[field] || []);
    count = j.page_count || 1;
  } while (++page <= count && page <= 500);
  return out;
}
// Same shape as a Strong session, so the Lifts tab, dashboard and log treat both alike.
function hevyToWorkout(w) {
  const st = new Date(w.start_time), mins = Math.round((new Date(w.end_time) - st) / 6e4), s = [];
  for (const ex of [...(w.exercises || [])].sort((a, b) => a.index - b.index)) {
    let n = 0;
    for (const set of [...(ex.sets || [])].sort((a, b) => a.index - b.index)) {
      if (!(set.reps > 0)) continue;           // timed / distance-only sets
      const kg = set.weight_kg || 0;
      s.push([ex.title, +(imp() ? kg * LB : kg).toFixed(2), set.reps, SET_CODE[set.type] || String(++n)]);
    }
  }
  return { id: 'hevy:' + w.id, src: 'hevy', d: iso(st), start: st.getTime(), n: (w.title || 'Workout').trim(), m: mins > 0 && mins < 240 ? mins : 0, s };
}
const byDate = (a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.id < b.id ? -1 : 1;
// Hevy can import Strong history; if a Strong session matches a Hevy one (same day + same name or start time), keep Hevy's.
function dropStrongDuplicates() {
  const hevy = S.workouts.filter(w => w.src === 'hevy');
  const strongStart = w => { const m = w.id.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };
  const before = S.workouts.length;
  S.workouts = S.workouts.filter(w => w.src === 'hevy' || !hevy.some(h => h.d === w.d &&
    (h.n.toLowerCase() === w.n.toLowerCase() || (strongStart(w) && Math.abs(strongStart(w) - h.start) < 20 * 6e4))));
  return before - S.workouts.length;
}
async function hevySync() {
  const byId = Object.fromEntries(S.workouts.map(w => [w.id, w]));
  let changed = 0, removed = 0, weighIns = 0;
  if (!HV.lastSync) {                          // first sync: full history
    for (const w of await hevyPages('/workouts', 'workouts')) { byId['hevy:' + w.id] = hevyToWorkout(w); changed++; }
  } else {                                     // afterwards: only what changed (edits and deletions too)
    const since = new Date(HV.lastSync - 10 * 6e4).toISOString();
    for (const ev of await hevyPages(`/workouts/events?since=${encodeURIComponent(since)}`, 'events')) {
      if (ev.type === 'updated' && ev.workout) { byId['hevy:' + ev.workout.id] = hevyToWorkout(ev.workout); changed++; }
      else if (ev.type === 'deleted' && byId['hevy:' + ev.id]) { delete byId['hevy:' + ev.id]; removed++; }
    }
  }
  S.workouts = Object.values(byId).sort(byDate);
  const dupes = dropStrongDuplicates();
  if (HV.weights !== false) weighIns = await hevyWeighIns();
  HV.lastSync = Date.now(); saveHV();
  applyImports(); save(); renderAll();
  return { changed, removed, dupes, weighIns };
}
// Weigh-ins from Hevy (which also picks up Apple Health weights). Hevy-sourced days (wSrc) follow Hevy,
// including corrections and deletions; a weight you type in Recomp is manual and is never overwritten.
async function hevyWeighIns() {
  const list = await hevyPages('/body_measurements', 'body_measurements');
  const start = startDate(), today = todayIso(), seen = new Set(), r = { added: 0, updated: 0, removed: 0 };
  for (const b of list) {
    const d = anyDate(String(b.date || '')), kg = +b.weight_kg;
    if (!d || !(kg > 0) || d < start || d > today) continue;
    const v = +kg.toFixed(2), l = S.logs[d];
    seen.add(d);
    if (!l || !(+l.weight > 0)) { Object.assign(logFor(d), { weight: v, wSrc: 'hevy' }); delete S.logs[d].wOk; r.added++; }
    else if (l.wSrc === 'hevy' && +l.weight !== v) { l.weight = v; delete l.wOk; r.updated++; }
  }
  if (list.length) for (const [d, l] of Object.entries(S.logs))   // an empty reply is treated as a glitch, not "delete everything"
    if (l.wSrc === 'hevy' && !seen.has(d)) { l.weight = 0; delete l.wSrc; delete l.wOk; r.removed++; }
  HV.lastWeights = Date.now(); saveHV();
  return r;
}
let wiBusy = false;
async function refreshWeighIns(loud) {
  if (!HV.key || HV.weights === false || wiBusy) return;
  wiBusy = true;
  try {
    const r = await hevyWeighIns();
    if (r.added || r.updated || r.removed) {
      save(); renderAll();
      if ($('#lDate').value === todayIso()) fillLogForm(todayIso());
    } else if (loud) renderStats();
    if (loud) hvMsg(r.added || r.updated || r.removed ? `Weigh-ins: ${r.added} added, ${r.updated} updated${r.removed ? `, ${r.removed} removed` : ''}.` : 'Weigh-ins are up to date.', 'good');
  } catch (e) { if (loud) hvMsg(esc(e.message), 'warn'); }
  wiBusy = false;
}
async function runHevySync(silent) {
  if (!silent) hvMsg('Syncing…');
  try {
    const r = await hevySync(), pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    hvMsg(`Synced: ${pl(r.changed, 'workout')} added or updated${r.removed ? `, ${r.removed} removed` : ''}${r.dupes ? `, ${pl(r.dupes, 'duplicate Strong session')} replaced by Hevy's copy` : ''}${r.weighIns ? `, weigh-ins ${r.weighIns.added} added / ${r.weighIns.updated} updated${r.weighIns.removed ? ` / ${r.weighIns.removed} removed` : ''}` : ''}.`, 'good');
  } catch (e) { hvMsg(esc(e.message), 'warn'); }
}
function renderHevy() {
  const box = $('#hevyBox');
  if (!HV.key) {
    box.innerHTML = `<div class="row"><input id="hvKey" type="password" placeholder="Hevy API key" size="40" autocomplete="off"><button class="btn primary" id="hvConnect">Connect Hevy</button></div>`;
    return;
  }
  const n = S.workouts.filter(w => w.src === 'hevy').length;
  box.innerHTML = `<div class="row"><span class="pill"><span class="good">●</span> Connected${HV.name ? ' as ' + esc(HV.name) : ''}</span>
      <span class="help">${n} workout${n === 1 ? '' : 's'} · last sync: ${HV.lastSync ? new Date(HV.lastSync).toLocaleString() : 'never'}</span>
      <button class="btn primary" id="hvSync">Sync now</button><button class="btn" id="hvDisconnect">Disconnect</button></div>
    <label class="checks" style="margin-top:8px"><input type="checkbox" id="hvWeights" ${HV.weights !== false ? 'checked' : ''}> Import weigh-ins from Hevy (Apple Health weights land there too). Weights you type in Recomp always win.</label>
    <p class="help">Hevy workouts feed the <b>Gym</b> page and the gym ticks in your daily log, the same way Strong does. Exercise names match Strong's, so your old Strong history and new Hevy sessions join up. If you imported your Strong history into Hevy, the duplicates are swapped for the Hevy copies automatically. Syncs each time you open the page.</p>`;
}

