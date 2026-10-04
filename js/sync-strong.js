/* =====================================================================
   Strong CSV import
   ===================================================================== */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function importStrong(text) {
  const rows = parseCSV(text), h = (rows.shift() || []).map(x => x.trim().toLowerCase());
  const col = re => h.findIndex(x => re.test(x));
  const cDate = col(/^date/), cName = col(/^workout name/), cEx = col(/^exercise name/), cW = col(/^weight/), cR = col(/^reps/),
        cSet = col(/^set order/), cDur = col(/^duration/);
  if (cDate < 0 || cEx < 0) throw new Error('That doesn\'t look like a Strong export (no Date / Exercise Name columns).');
  const num = v => parseFloat(String(v || '').replace(',', '.')) || 0;
  const dur = v => { v = String(v || ''); const hh = v.match(/(\d+)\s*h/), mm = v.match(/(\d+)\s*m/);
    return hh || mm ? (hh ? +hh[1] * 60 : 0) + (mm ? +mm[1] : 0) : Math.round(num(v) / 60); };
  const fresh = {};
  for (const r of rows) {
    const d = anyDate(r[cDate] || ''), so = cSet >= 0 ? String(r[cSet] || '').trim() : '1', reps = num(r[cR]);
    if (!d || !r[cEx] || !(reps > 0) || /rest/i.test(so)) continue;
    const id = r[cDate].trim();
    const wk = fresh[id] || (fresh[id] = { id, src: 'strong', d, n: (cName >= 0 && r[cName].trim()) || 'Workout', m: 0, s: [] });
    if (cDur >= 0) { const m = dur(r[cDur]); wk.m = m > 0 && m < 240 ? m : 0; }   // ignore sessions left running for hours
    wk.s.push([r[cEx], num(r[cW]), reps, so]);
  }
  const byId = Object.fromEntries(S.workouts.map(w => [w.id, w]));
  Object.assign(byId, fresh);
  S.workouts = Object.values(byId).sort(byDate);
  dropStrongDuplicates();   // sessions already synced from Hevy win
  const days = applyImports();
  save(); renderAll();
  return { days, workouts: Object.keys(fresh).length };
}

// Strong workouts and Strava activities are stored in full (for the Lifts tab, dashboard and watch averages),
// but only days from your start date onwards appear in the daily log.
function applyImports() {
  const start = startDate(), today = todayIso();
  for (const [d, l] of Object.entries(S.logs)) if (d < start) {
    for (const [id, a] of Object.entries(l.strava || {})) S.acts[id] ||= { ...a, d };
    if (+l.weight > 0 || +l.kcal > 0) { delete l.strava; delete l.strong; } else delete S.logs[d];   // keep anything you typed
  }
  const days = {};
  for (const wk of S.workouts) {
    if (wk.d < start || wk.d > today) continue;
    const o = days[wk.d] || (days[wk.d] = { names: [], sets: 0, volume: 0, ex: new Set(), src: 'strong' });
    o.names.push(wk.n);
    if (wk.src === 'hevy') o.src = 'hevy';
    for (const [e, w, r] of wk.s) { o.sets++; o.volume += w * r; o.ex.add(e); }
  }
  // A session that was deleted (e.g. in Hevy) takes its imported gym tick with it.
  for (const [d, l] of Object.entries(S.logs)) if (d >= start && l.strong && !days[d]) { delete l.strong; l.gym = 0; }
  for (const [d, o] of Object.entries(days)) {
    const l = logFor(d);
    l.gym = 1;
    l.strong = { name: o.names.join(' + '), sets: o.sets, volume: Math.round(o.volume), exercises: o.ex.size, src: o.src };
  }
  markHealthDups();
  for (const l of Object.values(S.logs)) if (l.strava) for (const id of Object.keys(l.strava)) if (S.acts[id] && S.acts[id].dup) delete l.strava[id];
  for (const [id, a] of Object.entries(S.acts)) {
    if (a.d < start || a.d > today || a.dup) continue;
    (logFor(a.d).strava ||= {})[id] = { type: a.type, name: a.name, km: a.km, min: a.min, kcal: a.kcal, src: a.src || 'strava' };
  }
  for (const d of Object.keys(S.logs)) if (S.logs[d].strava) applyStrava(d);
  return Object.keys(days).length;
}

