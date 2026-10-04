/* =====================================================================
   Strava — OAuth + activity sync straight from this page
   ===================================================================== */
const REDIRECT = 'http://localhost/strava';
let SV = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
const saveSV = () => { try { localStorage.setItem(SKEY, JSON.stringify(SV)); } catch (e) {} };
const svMsg = (t, cls = '') => { $('#svMsg').innerHTML = t ? `<span class="${cls}">${t}</span>` : ''; };

async function stravaToken(params) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', body: new URLSearchParams({ client_id: SV.clientId, client_secret: SV.clientSecret, ...params })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message === 'Bad Request' ? 'Strava rejected the code. Try connecting again.' : (j.message || 'Strava login failed'));
  Object.assign(SV, { access: j.access_token, refresh: j.refresh_token, expiresAt: j.expires_at });
  if (j.athlete) SV.athlete = j.athlete.firstname;
  saveSV();
}
async function stravaGet(path) {
  if (!SV.expiresAt || SV.expiresAt - 120 < Date.now() / 1000) await stravaToken({ grant_type: 'refresh_token', refresh_token: SV.refresh });
  const r = await fetch('https://www.strava.com/api/v3' + path, { headers: { Authorization: 'Bearer ' + SV.access } });
  if (r.status === 429) throw new Error('Strava rate limit hit. Try again in 15 minutes.');
  if (r.status === 401) throw new Error('Strava access was revoked. Disconnect and connect again.');
  if (!r.ok) throw new Error('Strava error ' + r.status);
  return r.json();
}
function stravaKind(a, d) {
  const t = a.type || '', sp = sportName().toLowerCase();
  if (/Run/.test(t)) return 'run';
  if (sp) {
    const typeMatch = SPORT_TYPES[sp] && t === SPORT_TYPES[sp];
    const nameMatch = a.name && (a.name.toLowerCase().includes(sp) || ((sp === 'football' || sp === 'soccer') && /football|soccer|footy|5.?a.?side/i.test(a.name)));
    if (typeMatch || nameMatch) return dayIdx(parse(d)) === +S.settings.matchDay || /match|game|\bvs?\b/i.test(a.name || '') ? 'match' : 'train';
  }
  if (/WeightTraining|Crossfit|Workout/.test(t)) return 'gym';
  return null;
}
// Sets the day's ticks/run distance from Strava. l.sv remembers what Strava set, so if an activity's type changes
// on Strava (e.g. a match recorded as a run, then fixed), the old tick/distance is cleared instead of double-counted.
function applyStrava(d) {
  const l = S.logs[d], prev = l.sv || {}, now = {}, acts = Object.values(l.strava || {});
  let run = 0, hasRun = false;
  for (const a of acts) {
    const k = stravaKind(a, d);
    a.kind = k;   // remembered so watch calories can be matched to the session type
    if (k === 'run') { run += a.km; hasRun = true; } else if (k) { l[k] = 1; now[k] = 1; }
  }
  for (const k of ['train', 'match', 'gym']) if (prev[k] && !now[k] && !(k === 'gym' && l.strong)) l[k] = 0;
  if (hasRun) { l.run = +run.toFixed(2); now.run = 1; }
  else if (prev.run || (+l.run > 0 && Math.abs(+l.run - sum(acts.map(a => +a.km || 0))) < 0.01)) l.run = 0;   // second test: data synced before l.sv existed
  l.sv = now;
}
async function stravaSync() {
  // First sync pulls a year of history (for the dashboard); later syncs only look back a few days.
  const since = Math.floor(SV.backfilled ? Math.max(SV.lastSync ? SV.lastSync - 3 * 86400 : 0, Date.now() / 1000 - 60 * 86400) : Date.now() / 1000 - 365 * 86400);
  let all = [];
  for (let page = 1; ; page++) {
    const b = await stravaGet(`/athlete/activities?after=${since}&per_page=100&page=${page}`);
    all = all.concat(b);
    if (b.length < 100) break;
  }
  let details = 0, runDetails = 0;
  all.sort((x, y) => x.start_date < y.start_date ? 1 : -1);   // newest first, so the caps below favour recent activities
  for (const a of all) {
    const d = a.start_date_local.slice(0, 10), prev = S.acts[a.id] || {}, isRun = /Run/.test(a.sport_type || a.type || '');
    let kcal = prev.kcal, extra = {};
    // Calories, splits and laps are only on the detailed activity; cap per sync to stay under Strava's rate limit.
    const wantKcal = kcal == null && details < 60 && d >= iso(addDays(new Date(), -120)), wantSplits = isRun && !prev.splits && runDetails < 25;
    if (wantKcal || wantSplits) {
      try {
        const x = await stravaGet('/activities/' + a.id); details++; if (isRun) runDetails++;
        kcal = x.calories || 0;
        if (isRun) extra = runDetail(x);
      } catch (e) {}
    }
    S.acts[a.id] = Object.assign({}, prev.splits ? { splits: prev.splits, laps: prev.laps, workout: prev.workout } : {}, extra,
      { d, start: Date.parse(a.start_date) || null, type: a.sport_type || a.type, name: a.name, km: +(a.distance / 1000).toFixed(2), min: Math.round(a.moving_time / 60),
        kcal: kcal == null ? null : Math.round(kcal), hr: a.average_heartrate ? Math.round(a.average_heartrate) : null, hrMax: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        elev: a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null, src: 'strava' });
    if (prev.ivs) S.acts[a.id].ivs = prev.ivs;
  }
  applyImports();
  SV.lastSync = Math.floor(Date.now() / 1000); SV.backfilled = true; saveSV();
  save(); renderAll();
  return all.length;
}
// Keep the compact bits of a detailed run: per-km splits, laps (from the watch's lap button or workout steps) and the workout flag.
function runDetail(x) {
  const sp = (x.splits_metric || []).map(s => ({ km: +(s.distance / 1000).toFixed(3), s: s.moving_time, hr: s.average_heartrate ? Math.round(s.average_heartrate) : null, el: s.elevation_difference != null ? Math.round(s.elevation_difference) : null }));
  const lp = (x.laps || []).map(l => ({ km: +(l.distance / 1000).toFixed(3), s: l.moving_time, hr: l.average_heartrate ? Math.round(l.average_heartrate) : null, hrMax: l.max_heartrate ? Math.round(l.max_heartrate) : null }));
  return { splits: sp, laps: lp.length > 1 ? lp : [], workout: x.workout_type === 3 };
}
async function runSync(silent) {
  if (!silent) svMsg('Syncing…');
  try { const n = await stravaSync(); svMsg(`Synced. ${n} activit${n === 1 ? 'y' : 'ies'} checked.`, 'good'); }
  catch (e) { svMsg(e.message, 'warn'); }
}
function watchAverages() {
  const b = { gym: [], train: [], match: [], runPerKm: [] };
  for (const a of Object.values(S.acts)) {
    if (!(a.kcal > 0) || a.dup) continue;
    const k = stravaKind(a, a.d);
    if (k === 'run') { if (a.km > 0.5) b.runPerKm.push(a.kcal / a.km); }
    else if (k) b[k].push(a.kcal);
  }
  return Object.fromEntries(Object.entries(b).filter(([, v]) => v.length >= 2).map(([k, v]) => [k, Math.round(avg(v))]));
}
function renderStrava() {
  const box = $('#stravaBox'), sp = sportName();
  if (!SV.clientId || !SV.clientSecret) {
    box.innerHTML = `<ol class="help steps">
      <li>Go to <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> and create an app. Call it anything (e.g. "Recomp"), pick any category, set Website to <code>http://localhost</code> and <b>Authorization Callback Domain</b> to <code>localhost</code>.</li>
      <li>Paste the <b>Client ID</b> and <b>Client Secret</b> it shows you. They're stored only in this browser, never in backups:</li></ol>
      <div class="row"><input id="svId" placeholder="Client ID" size="10"><input id="svSecret" placeholder="Client Secret" size="36"><button class="btn primary" id="svSave">Save</button></div>`;
  } else if (!SV.refresh) {
    box.innerHTML = `<ol class="help steps" start="3">
      <li><button class="btn primary" id="svAuth">Connect Strava</button> A Strava tab opens. Click <b>Authorize</b>.</li>
      <li>The next page will say <i>"This site can't be reached"</i>. <b>That's expected.</b> Copy the full address from that tab's address bar and paste it here:</li></ol>
      <div class="row"><input id="svUrl" placeholder="http://localhost/strava?state=&code=…" style="flex:1;min-width:220px"><button class="btn primary" id="svFinish">Finish connecting</button><button class="btn" id="svForget">Change app details</button></div>`;
  } else {
    const wa = watchAverages(), names = { gym: 'Gym', train: `${cap(sp || 'Sport')} training`, match: 'Match', runPerKm: 'Run per km' };
    box.innerHTML = `<div class="row"><span class="pill"><span class="good">●</span> Connected${SV.athlete ? ' as ' + esc(SV.athlete) : ''}</span>
      <span class="help">Last sync: ${SV.lastSync ? new Date(SV.lastSync * 1000).toLocaleString() : 'never'}</span>
      <button class="btn primary" id="svSync">Sync now</button><button class="btn" id="svDisconnect">Disconnect</button></div>
      <p class="help">Runs add their distance. ${sp ? `${esc(cap(sp))} counts as training, or as a match if it's on your match day (${DAYS[S.settings.matchDay]}) or its name has "match", "game" or "vs". ` : 'Set a team sport in Settings to count those sessions too. '}Strength workouts count as gym. Syncs automatically when you open the page.</p>
      ${Object.keys(wa).length ? `<div class="summary"><div>Your watch's average calories: ${Object.entries(wa).filter(([k]) => sp || !['train', 'match'].includes(k)).map(([k, v]) => `${names[k]} <b>${v}</b>`).join(' · ')}<br>
        <button class="btn" id="svUseWatch" style="margin-top:6px">Use these for planning</button>
        <span class="help">Watches often read a bit high. Either way, the weight-trend adjustment corrects it over time.</span></div></div>` : ''}`;
  }
}

