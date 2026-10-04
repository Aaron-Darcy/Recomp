/* =====================================================================
   Apple Health — Health Auto Export (iPhone) → your relay (Cloudflare Worker) → Recomp
   ===================================================================== */
const XKEY = 'recomp.health';                // kept separate so the relay key never ends up in backups
let HX = (() => { try { return JSON.parse(localStorage.getItem(XKEY)) || {}; } catch (e) { return {}; } })();
const saveHX = () => { try { localStorage.setItem(XKEY, JSON.stringify(HX)); } catch (e) {} };
const hxMsg = (t, cls = '') => { $('#hxMsg').innerHTML = t ? `<span class="${cls}">${t}</span>` : ''; };
const relayUrl = (u = HX.url) => String(u || '').trim().replace(/\/+$/, '').replace(/\/(ingest|batches)$/, '');
const RELAY_CODE_URL = 'https://github.com/Aaron-Darcy/Recomp/blob/main/tools/health-relay-worker.js';

async function relayGet(path, url = relayUrl(), key = HX.key) {
  let r;
  try { r = await fetch(url + path, { headers: { 'X-API-Key': key } }); }
  catch (e) { throw new Error('Can’t reach your relay. Check the worker URL (it looks like https://recomp-health.yourname.workers.dev).'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('The relay rejected the key. It must match the RELAY_KEY secret in Cloudflare exactly.');
  if (!r.ok) throw new Error(j.error || 'Relay error ' + r.status);
  return j;
}

// Health Auto Export metric names (normalised) → [field Recomp stores, how a day's values combine]
const hkey = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const HMAP = {
  weight_body_mass: ['weight', 'first'], body_mass: ['weight', 'first'], weight: ['weight', 'first'],
  body_fat_percentage: ['bf', 'first'],
  dietary_energy: ['kcal', 'sum'], dietary_energy_consumed: ['kcal', 'sum'],
  protein: ['p', 'sum'], dietary_protein: ['p', 'sum'],
  carbohydrates: ['c', 'sum'], dietary_carbohydrates: ['c', 'sum'],
  total_fat: ['f', 'sum'], dietary_fat_total: ['f', 'sum'],
  active_energy: ['active', 'sum'], active_energy_burned: ['active', 'sum'],
  basal_energy_burned: ['basal', 'sum'], resting_energy: ['basal', 'sum'],
  step_count: ['steps', 'sum'], apple_exercise_time: ['exMin', 'sum'], walking_running_distance: ['walkKm', 'sum'],
  resting_heart_rate: ['rhr', 'avg'], heart_rate_variability: ['hrv', 'avg'], heart_rate_variability_sdnn: ['hrv', 'avg'],
  walking_heart_rate_average: ['walkHr', 'avg'], vo2_max: ['vo2', 'avg'],
  respiratory_rate: ['rr', 'avg'], blood_oxygen_saturation: ['spo2', 'avg'], oxygen_saturation: ['spo2', 'avg'],
  apple_sleeping_wrist_temperature: ['wristT', 'avg'],
  fiber: ['fiber', 'sum'], dietary_fiber: ['fiber', 'sum'], sugar: ['sugar', 'sum'], dietary_sugar: ['sugar', 'sum'],
  sodium: ['sodium', 'sum'], dietary_sodium: ['sodium', 'sum'], water: ['water', 'sum'], dietary_water: ['water', 'sum']
};
function hUnit(v, units, field) {
  const u = String(units || '').toLowerCase();
  if (/^kj/.test(u)) return v / 4.184;
  if (u === 'lb' || u === 'lbs') return v / LB;
  if (u === 'mi') return v * MI;
  if (u === 'm' && (field === 'walkKm' || field === 'km')) return v / 1000;
  if ((field === 'bf' || field === 'spo2') && v <= 1) return v * 100;
  return v;
}
const haeTime = t => Date.parse(String(t || '').replace(' ', 'T').replace(/ ([+-]\d{2}):?(\d{2})$/, '$1:$2'));
function haeType(name) {
  const n = String(name || '');
  return /run/i.test(n) ? 'Run' : /soccer|football/i.test(n) ? 'Soccer' : /strength|weight|crossfit|functional/i.test(n) ? 'WeightTraining'
    : /cycl|bike/i.test(n) ? 'Ride' : /walk/i.test(n) ? 'Walk' : /hik/i.test(n) ? 'Hike' : n.replace(/\s+/g, '') || 'Workout';
}
// One Health Auto Export JSON payload → { days: {date: {field: value, sleep}}, workouts: [...] }
function parseHAE(j) {
  const data = (j && j.data) || j || {}, days = {}, acc = {};
  for (const m of data.metrics || []) {
    const n = hkey(m.name), units = m.units;
    if (n === 'sleep_analysis') {
      for (const p of m.data || []) {
        const d = anyDate(String(p.date || p.sleepEnd || '')); if (!d) continue;
        const h = x => +x > 0 ? +x : 0, tot = h(p.totalSleep) || h(p.asleep) || (h(p.core) + h(p.deep) + h(p.rem));
        if (!tot) continue;
        const s = ((days[d] ||= {}).sleep ||= { total: 0, deep: 0, rem: 0, core: 0, awake: 0, inBed: 0 });
        s.total += tot; s.deep += h(p.deep); s.rem += h(p.rem); s.core += h(p.core); s.awake += h(p.awake); s.inBed += h(p.inBed);
        const a = haeTime(p.sleepStart || p.inBedStart), b = haeTime(p.sleepEnd || p.inBedEnd);   // bed/wake times, for sleep consistency
        if (a > 0 && (!s.start || a < s.start)) s.start = a; if (b > 0 && (!s.end || b > s.end)) s.end = b;
      }
      continue;
    }
    if (n === 'heart_rate') {
      for (const p of m.data || []) {
        const d = anyDate(String(p.date || '')); if (!d) continue;
        const o = (acc[d + '|hr'] ||= { min: Infinity, max: 0, s: 0, k: 0 });
        if (+p.Min) o.min = Math.min(o.min, +p.Min); if (+p.Max) o.max = Math.max(o.max, +p.Max);
        const a = +p.Avg || +p.qty; if (a) { o.s += a; o.k++; }
      }
      continue;
    }
    const map = HMAP[n]; if (!map) continue;
    const [field, how] = map;
    for (const p of m.data || []) {
      const d = anyDate(String(p.date || '')), raw = p.qty != null ? p.qty : p.Avg;
      if (!d || raw == null || isNaN(+raw)) continue;
      const v = hUnit(+raw, units, field), o = (acc[d + '|' + field] ||= { s: 0, k: 0, first: null, firstT: null, how });
      o.s += v; o.k++;
      const t = String(p.date);
      if (o.firstT == null || t < o.firstT) { o.first = v; o.firstT = t; }
    }
  }
  for (const [key, o] of Object.entries(acc)) {
    const [d, field] = key.split('|'), day = (days[d] ||= {});
    if (field === 'hr') { if (o.k) day.hrAvg = o.s / o.k; if (o.max) day.hrMax = o.max; if (o.min !== Infinity) day.hrMin = o.min; continue; }
    day[field] = o.how === 'sum' ? o.s : o.how === 'avg' ? o.s / o.k : o.first;
  }
  const workouts = [];
  for (const w of data.workouts || []) {
    const st = haeTime(w.start), d = anyDate(String(w.start || ''));
    if (isNaN(st) || !d) continue;
    const q = x => x == null ? null : typeof x === 'object' ? x : { qty: +x };
    const e = q(w.activeEnergyBurned || w.activeEnergy), dist = q(w.distance);
    const hr = q(w.avgHeartRate || (w.heartRate && w.heartRate.avg)), hrMax = q(w.maxHeartRate || (w.heartRate && w.heartRate.max));
    const dur = +w.duration > 0 ? +w.duration : ((haeTime(w.end) - st) / 1000 || 0);
    workouts.push({ id: 'health:' + new Date(st).toISOString().slice(0, 16), src: 'health', d, start: st, type: haeType(w.name), name: String(w.name || 'Workout'),
      km: dist && +dist.qty > 0 ? +hUnit(+dist.qty, dist.units || 'km', 'km').toFixed(2) : 0,
      min: Math.round(dur / 60), kcal: e && +e.qty > 0 ? Math.round(hUnit(+e.qty, e.units, 'kcal')) : null,
      hr: hr && +hr.qty > 0 ? Math.round(+hr.qty) : null, hrMax: hrMax && +hrMax.qty > 0 ? Math.round(+hrMax.qty) : null });
  }
  return { days, workouts };
}
// Newest batch wins for each day/field. Weights and calories you typed yourself are never overwritten.
function mergeHealth(parsed) {
  const start = startDate(), today = todayIso(), r = { days: 0, workouts: 0 };
  for (const [d, v] of Object.entries(parsed.days)) {
    if (d > today) continue;
    const { kcal, p, c, f, weight, bf, ...rest } = v, h = (S.health[d] ||= {});
    Object.assign(h, rest);
    if (kcal > 0) h.kcal = Math.round(kcal);
    if (p != null || c != null || f != null) h.mac = { p: Math.round(p || 0), c: Math.round(c || 0), f: Math.round(f || 0) };
    if (weight > 0) h.weight = +weight.toFixed(2);
    if (bf > 0) h.bf = +bf.toFixed(1);
    r.days++;
    if (d < start) continue;
    const l = S.logs[d];
    if (h.weight && (!l || !(+l.weight > 0) || l.wSrc === 'hevy' || l.wSrc === 'health')) {
      const L = logFor(d);
      if (+L.weight !== h.weight) delete L.wOk;
      L.weight = h.weight; L.wSrc = 'health';
    }
    if (h.kcal && (!l || l.kSrc !== 'manual')) { const L = logFor(d); L.kcal = h.kcal; L.kSrc = 'health'; if (h.mac) L.mac = h.mac; }
  }
  for (const w of parsed.workouts) { if (w.d <= today) { S.acts[w.id] = w; r.workouts++; } }
  return r;
}
// A workout that's on Strava and in Health (watch → both) only counts once: Strava's copy is kept.
function markHealthDups() {
  const others = Object.values(S.acts).filter(a => a.src !== 'health');
  for (const a of Object.values(S.acts)) if (a.src === 'health') {
    const k = stravaKind(a, a.d);
    a.dup = others.some(s => s.d === a.d && (
      (s.start && a.start && Math.abs(s.start - a.start) < 5 * 6e4) ||
      (s.km > 0 && a.km > 0 && Math.abs(s.km - a.km) < 0.15) ||                                    // same watch workout: same distance…
      (s.kcal > 0 && a.kcal > 0 && Math.abs(s.kcal - a.kcal) <= Math.max(10, 0.03 * s.kcal)) ||   // …or same calories, even if retyped

      (stravaKind(s, s.d) === k && (s.start && a.start ? Math.abs(s.start - a.start) < 15 * 6e4 : (!s.min || !a.min || Math.abs(s.min - a.min) <= 10)))));
  }
}
let hxBusy = false;
async function healthSync(loud) {
  if (!HX.url || !HX.key || hxBusy) return;
  hxBusy = true;
  let n = 0, days = 0, wk = 0, bad = 0;
  try {
    for (let i = 0; i < 50; i++) {
      const j = await relayGet('/batches?after=' + encodeURIComponent(HX.after || ''));
      for (const b of j.batches || []) {
        try { const r = mergeHealth(parseHAE(JSON.parse(b.body))); days += r.days; wk += r.workouts; n++; }
        catch (e) { bad++; }
        HX.after = b.key; HX.lastBatch = b.ts;
      }
      HX.stored = j.stored;
      if (!j.more) break;
    }
    HX.lastCheck = Date.now(); HX.err = ''; saveHX();
    if (n) { applyImports(); save(); renderAll(); if ($('#lDate').value === todayIso()) fillLogForm(todayIso()); }
    if (loud) hxMsg(n ? `Received ${n} update${n === 1 ? '' : 's'} from your iPhone (${days} day summaries, ${wk} workouts)${bad ? `, ${bad} unreadable` : ''}.`
      : 'Up to date. Nothing new from Health Auto Export since the last check.', 'good');
  } catch (e) { HX.err = e.message; saveHX(); if (loud) hxMsg(esc(e.message), 'warn'); }
  hxBusy = false;
  renderHealthBox();
}
let relayCode = null;   // fetched when the setup guide shows, so "Copy relay code" can copy instantly on click
async function loadRelayCode() {
  try { const r = await fetch(RELAY_CODE_URL.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')); if (r.ok) relayCode = await r.text(); } catch (e) {}
  return relayCode;
}
function newRelayKey() { const a = new Uint8Array(24); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); }
function renderHealthBox() {
  const box = $('#healthBox'); if (!box) return;
  const key = HX.key || HX.draftKey || (HX.draftKey = newRelayKey(), saveHX(), HX.draftKey), url = relayUrl() || 'https://recomp-health.<you>.workers.dev';
  const haeSteps = `<ol class="steps">
      <li>In <b>Health Auto Export</b> go to <b>Automations → +</b> and choose <b>REST API</b>.</li>
      <li><b>URL:</b> <code>${esc(url)}/ingest</code></li>
      <li><b>Headers:</b> add one. Key <code>X-API-Key</code>, value <code>${esc(key)}</code> <button class="link" data-copy="${esc(key)}">copy key</button></li>
      <li><b>Data:</b> Health Metrics (select all) + Workouts. <b>Format:</b> JSON, version 2. <b>Summarize data:</b> on, by Day. <b>Date range:</b> Default (yesterday + today).</li>
      <li><b>Workouts need their own automation:</b> each automation sends one data type, so duplicate this one and set its <b>Data Type</b> to <b>Workouts</b> (same URL, header and format). Without it, Recomp gets your heart, sleep and food but no workouts.</li>
      <li><b>Sync cadence:</b> every 1 hour. Turn the automation on, then use its manual sync once to send the first update.</li>
    </ol><p>The exact labels in Health Auto Export may differ slightly. Your phone only syncs while it's unlocked, so updates arrive through the day as you use it.</p>`;
  if (!HX.url || !HX.key) {
    if (!relayCode) loadRelayCode();
    box.innerHTML = `<details class="help" open><summary><b>1. Set up your relay on Cloudflare</b> (free, one-off, ~10 min)</summary>
      <p>Cloudflare calls a small program like this an <b>application</b> (a "Worker"). You'll make one, paste in Recomp's relay code, give it some storage and a password, and copy its web address back here.</p>
      <p><b>A. Create the application</b></p>
      <ol class="steps">
        <li>Sign up or log in at <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">dash.cloudflare.com</a> (the free plan is enough).</li>
        <li>In the left-hand menu open <b>Compute (Workers) → Workers &amp; Pages</b>, then click <b>Create application</b>.</li>
        <li>Choose <b>Start with Hello World!</b> → <b>Get started</b>.</li>
        <li>Name it <code>recomp-health</code> and click <b>Deploy</b>. It now shows a page saying it's live.</li>
      </ol>
      <p><b>B. Paste in the relay code</b></p>
      <ol class="steps" start="5">
        <li>Click <b>Edit code</b> (top right, or the <code>&lt;/&gt;</code> icon). An editor opens with a file called <code>worker.js</code>.</li>
        <li><button class="btn" id="hxCopyCode">Copy relay code</button> then in that editor press <b>Ctrl+A</b> (select all) and <b>Ctrl+V</b> (paste over it).</li>
        <li>Click <b>Deploy</b> (top right of the editor), then go back to the application's page.</li>
      </ol>
      <p><b>C. Give it storage</b></p>
      <ol class="steps" start="8">
        <li>In the left-hand menu open <b>Storage &amp; Databases → Workers KV</b>, click <b>Create instance</b> (older screens: <b>Create namespace</b>), name it <code>recomp-health</code>, then <b>Create</b>.</li>
        <li>Go back to <b>Workers &amp; Pages → recomp-health</b>. Open the <b>Bindings</b> tab (on some screens: <b>Settings → Bindings</b>) and click <b>Add binding</b>.</li>
        <li>Choose <b>KV namespace</b>. Set <b>Variable name</b> to exactly <code>HEALTH</code>, pick <code>recomp-health</code> from the list, then <b>Add binding</b>.</li>
      </ol>
      <p><b>D. Give it a password</b></p>
      <ol class="steps" start="11">
        <li>Still in recomp-health: <b>Settings → Variables and Secrets → Add</b>.</li>
        <li>Type: <b>Secret</b>. Variable name: <code>RELAY_KEY</code>. Value: <code>${esc(key)}</code> <button class="link" data-copy="${esc(key)}">copy</button>. Then <b>Deploy</b> (or <b>Save</b>).</li>
      </ol>
      <p><b>E. Connect Recomp</b></p>
      <ol class="steps" start="13">
        <li>On the application's main page, copy its address under <b>Domains &amp; Routes</b> or the <b>Visit</b> link, like <code>https://recomp-health.yourname.workers.dev</code>.</li>
        <li>Paste it into the box below and click <b>Save &amp; test</b>.</li>
      </ol>
      <p>Cloudflare renames buttons now and then. If one isn't there, look for the closest match. The three things that must be exact are the binding name <code>HEALTH</code>, the secret name <code>RELAY_KEY</code> and the key value.</p></details>
      <div class="row" style="margin:8px 0"><input id="hxUrl" placeholder="https://recomp-health.yourname.workers.dev" value="${esc(HX.url || '')}" style="flex:1;min-width:240px">
        <input id="hxKey" type="password" value="${esc(key)}" size="20" aria-label="Relay key"><button class="btn primary" id="hxSave">Save &amp; test</button></div>
      <details class="help"><summary><b>2. Point Health Auto Export at it</b></summary>${haeSteps}</details>`;
    return;
  }
  const last = HX.lastBatch ? new Date(HX.lastBatch).toLocaleString() : 'nothing yet';
  const days = Object.keys(S.health).sort();
  box.innerHTML = `<div class="row"><span class="pill"><span class="${HX.err ? 'warn' : 'good'}">●</span> Relay connected</span>
      <span class="help">Last update from your iPhone: ${last}${days.length ? ` · ${days.length} days of Health data (${fmtShort(days[0])} – ${fmtShort(days[days.length - 1])})` : ''}</span>
      <button class="btn primary" id="hxCheck">Check now</button><button class="btn" id="hxForget">Disconnect</button></div>
    ${HX.err ? `<p class="status warn">${esc(HX.err)}</p>` : ''}
    <details class="help"${HX.lastBatch ? '' : ' open'}><summary><b>Health Auto Export settings</b>${HX.lastBatch ? '' : ' (waiting for the first update)'}</summary>${haeSteps}</details>
    <p class="help">Recomp uses Apple Health for: weigh-ins and calories/macros (anything you type yourself always wins), workouts with their calories (a workout that's also on Strava only counts once), and sleep, heart, steps and VO2 max for the Recovery &amp; heart dashboard and your check-in.</p>`;
}

