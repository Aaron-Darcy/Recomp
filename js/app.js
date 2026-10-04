/* Recomp · app: navigation, rendering, events and start-up. */

// ---------- navigation ----------
const ICON = {
  today: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  body: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  nutrition: '<path d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18"/><path d="M17 3c-2 2-2 6 0 8v10"/>',
  gym: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  running: '<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v5M6 12l3-3 4 1 3 4 3 1"/>',
  recovery: '<path d="M20 15a8 8 0 1 1-11-11 7 7 0 0 0 11 11z"/>',
  insights: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/>',
  checkin: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  recap: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  log: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
};
const PAGES = [
  ['today', 'Today', renderToday], ['plan', 'Plan', renderPlan],
  ['_', 'Dashboards'], ['body', 'Body', renderBody], ['nutrition', 'Nutrition', renderNutrition], ['gym', 'Gym', () => { renderGym(); renderSplit(); }],
  ['running', 'Running', renderRunning], ['recovery', 'Recovery', renderRecovery], ['insights', 'Insights', renderInsightsPage],
  ['_', 'Review'], ['checkin', 'Check-in', renderCheckin], ['recap', 'Monthly recap', renderRecap],
  ['_', ''], ['log', 'Edit a day', renderLog], ['settings', 'Settings', () => { renderConnections(); renderAppearance(); renderHealthBox(); renderHevy(); renderStrava(); }]
];
const PAGE = Object.fromEntries(PAGES.filter(p => p[0] !== '_').map(p => [p[0], p]));
const BOTTOM = ['today', 'nutrition', 'gym', 'running', 'more'];
const OLD_TAB = { dash: 'body', split: 'gym', sync: 'settings', lifts: 'gym' };
const curPage = () => { const h = location.hash.replace(/^#\/?/, ''), p = OLD_TAB[h] || h; return PAGE[p] ? p : 'today'; };
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ''}</svg>`;
function renderNav() {
  const cur = curPage(), due = checkinDue();
  $('#nav').innerHTML = PAGES.map(([k, n]) => k === '_' ? (n ? `<div class="navgrp">${n}</div>` : '<div style="height:10px"></div>')
    : `<a class="nav ${k === cur ? 'on' : ''}" href="#/${k}">${svg(k)}<span>${k === 'running' ? cardioName() : n}</span>${k === 'checkin' && due ? '<span class="dotbadge" title="Check-in due"></span>' : ''}</a>`).join('');
  $('#bottombar').innerHTML = BOTTOM.map(k => k === 'more' ? `<a href="#" data-more="1" class="${!BOTTOM.includes(cur) ? 'on' : ''}">${svg('more')}<span>More</span></a>`
    : `<a href="#/${k}" class="${k === cur ? 'on' : ''}">${svg(k)}<span>${PAGE[k][1]}</span></a>`).join('');
  const bits = [HX.url && 'Apple Health', HV.key && 'Hevy', connOn('strava') && SV.refresh && 'Strava'].filter(Boolean);
  $('#sideFoot').innerHTML = bits.length ? `Syncing from ${bits.join(', ')}` : '<a class="link" href="#/settings">Connect your apps</a>';
}
function renderPage() {
  clearMemo();
  const cur = curPage();
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + cur));
  const title = cur === 'running' ? cardioName() : PAGE[cur][1];
  $('#topTitle').textContent = title;
  document.title = `${title} · Recomp`;
  try { PAGE[cur][2](); } catch (e) { console.error(e); $('#p-' + cur).insertAdjacentHTML('afterbegin', `<div class="banner">Something went wrong drawing this page: ${esc(e.message)}</div>`); }
}
// Shared bits every page relies on, then the page you're looking at.
function renderAll() {
  clearMemo();
  applyTheme();
  document.querySelectorAll('.sportOnly').forEach(e => e.classList.toggle('hidden', !hasSport()));
  document.querySelectorAll('.sportTrainLbl').forEach(e => e.textContent = `${cap(sportName())} training`);
  document.querySelectorAll('.sportMatchLbl').forEach(e => e.textContent = `${cap(sportName())} match`);
  document.querySelectorAll('.du').forEach(e => e.textContent = du());
  $('#demoBanner').classList.toggle('hidden', !S.demo);
  $('#demoBanner').innerHTML = S.demo ? `👀 <b>You're looking at demo data.</b> Have a click around. <button class="btn primary" id="leaveDemo">Start with my own data</button>` : '';
  renderCheckin();   // also sets the check-in banner
  renderNav();
  renderPage();
}
const go = p => { const h = '#/' + (OLD_TAB[p] || p); if (location.hash === h) renderPage(); else location.hash = h; };
window.addEventListener('hashchange', () => { $('#app').classList.remove('drawer'); renderNav(); renderPage(); window.scrollTo({ top: 0 }); });
$('#menuBtn').onclick = () => $('#app').classList.toggle('drawer');
$('#scrim').onclick = () => $('#app').classList.remove('drawer');
$('#bottombar').addEventListener('click', e => { if (e.target.closest('[data-more]')) { e.preventDefault(); $('#app').classList.add('drawer'); } });
// Charts follow the theme: redraw when the device switches light/dark.
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((S.settings.theme || 'auto') === 'auto') renderPage(); });

// ---------- page-level clicks ----------
document.addEventListener('wheel', e => { if (e.target.type === 'number' && e.target === document.activeElement) e.target.blur(); }, { passive: true });   // scrolling must not change a number box
document.addEventListener('click', async e => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const sc = e.target.closest('[data-scroll]'); if (sc) { const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth' }); return; }
  const r = e.target.closest('[data-range]');
  if (r) { S.settings.dashRange = +r.dataset.range; save(); renderPage(); return; }
  if (e.target.id === 'leaveDemo' && confirm('Clear the demo data and set up your own?')) { S = defaults(); save(); openOnboarding(); renderSettings(); renderAll(); }
  if (e.target.id === 'wiCheck') { e.target.textContent = 'Checking…'; await Promise.all([refreshWeighIns(true), healthSync(true)]); renderStats(); }
  const ct = e.target.closest('[data-ctab]');
  if (ct) { cardioTab = ct.dataset.ctab; try { localStorage.setItem('recomp.cardioTab', cardioTab); } catch (err) {} renderRunning(); return; }
  const so = e.target.closest('tr.r[data-sport]');
  if (so && so.dataset.sport) { sportSel = so.dataset.sport; document.querySelectorAll('tr.r[data-sport]').forEach(x => x.classList.toggle('on', x === so)); renderSportDetail(); if (innerWidth <= 900) $('#sportDetail').scrollIntoView({ behavior: 'smooth' }); return; }
  const tr = e.target.closest('tr.r[data-run]');
  if (tr && tr.dataset.run) { runSel = tr.dataset.run; document.querySelectorAll('tr.r[data-run]').forEach(x => x.classList.toggle('on', x === tr)); renderRunDetail(); if (innerWidth <= 900) $('#runDetail').scrollIntoView({ behavior: 'smooth' }); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'recapPick') { recapMonth = e.target.value; renderRecap(); }
  if (e.target.id === 'liftsFrom') { S.settings.liftsFrom = e.target.value; save(); renderSettings(); renderAll(); }
  const c = e.target.dataset.connT;
  if (c) { (S.settings.connections ||= {})[c] = e.target.checked; save(); renderConnections(); renderNav(); }
  const ap = e.target.dataset.ap;
  if (ap) { S.settings[ap] = ap === 'dashRange' ? +e.target.value : e.target.value; save(); applyTheme(); renderPage(); }
});

// ---------- onboarding ----------
$('#onboard').addEventListener('input', e => {
  const t = e.target, k = t.dataset.ob;
  if (t.dataset.d != null) {
    const a = OB.days[t.dataset.d];
    if (t.dataset.f === 'run') a.run = +((+t.value || 0) * (OB.units === 'imperial' ? MI : 1)).toFixed(2); else a[t.dataset.f] = t.checked ? 1 : 0;
    return;
  }
  if (!k) return;
  const im = OB.units === 'imperial';
  if (k === 'hcm') OB.heightCm = +t.value;
  else if (k === 'hft' || k === 'hin') { const ft = +$('[data-ob=hft]').value || 0, inch = +$('[data-ob=hin]').value || 0; OB.heightCm = (ft * 12 + inch) * 2.54; }
  else if (k === 'weight') OB.weight = im ? +t.value / LB : +t.value;
  else if (k === 'maint') OB.maint = t.checked;
  else OB[k] = t.value;
  if (['units', 'goal', 'sport'].includes(k)) {
    if (k === 'goal') OB.adjust = GOAL_DEFAULT[t.value] === 0 ? 0 : paceOptions(t.value)[0][0];
    if (k === 'sport') { clearTimeout(OB.t); OB.t = setTimeout(() => { const pos = t.selectionStart; renderOnboarding(); const n = $('[data-ob=sport]'); n.focus(); n.setSelectionRange(pos, pos); }, 400); return; }
    renderOnboarding();
  }
});
$('#onboard').addEventListener('click', e => {
  if (e.target.id === 'obStart') finishOnboarding();
  if (e.target.id === 'obCancel') $('#onboard').classList.add('hidden');
  if (e.target.id === 'obDemo' && (!Object.keys(S.logs).length || confirm('Replace everything on this page with demo data?'))) loadDemo();
});
$('#rerunSetup').onclick = openOnboarding;

// ---------- check-in ----------
$('#ciBody').addEventListener('click', async e => {
  if (e.target.id === 'ciDone') { completeCheckin(); window.scrollTo({ top: 0 }); }
  if (e.target.id === 'ciRedo' && confirm('Redo this week\'s check-in? The previous calorie lock comes back until you complete it again.')) {
    S.checkins = S.checkins.filter(c => c !== checkinDone()); save(); renderAll();
  }
  if (e.target.id === 'ciSync') { e.target.textContent = 'Syncing…'; await runSync(); }
  if (e.target.id === 'ciHevy') { e.target.textContent = 'Syncing…'; await runHevySync(); }
});

// ---------- plan ----------
$('#wkPrev').onclick = () => { weekOffset--; renderPlan(); };
$('#wkNext').onclick = () => { weekOffset++; renderPlan(); };
$('#wkReset').onclick = () => { delete S.plans[weekKey()]; save(); renderAll(); };
$('#wkDefault').onclick = () => { S.template = weekPlan(weekKey()).map(a => ({ ...a })); save(); renderAll(); alert('Saved as your default week.'); };
$('#week').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const p = weekPlan(weekKey(), true), a = p[b.dataset.i];
  a[b.dataset.f] = a[b.dataset.f] ? 0 : 1;
  save(); renderAll();
});
$('#week').addEventListener('change', e => {
  if (!e.target.hasAttribute('data-run')) return;
  weekPlan(weekKey(), true)[e.target.dataset.i].run = +dIn(+e.target.value || 0).toFixed(2);
  save(); renderAll();
});

// ---------- daily log ----------
$('#lDate').addEventListener('change', e => fillLogForm(e.target.value));
['#lGym', '#lTrain', '#lMatch', '#lRun'].forEach(id => $(id).addEventListener('change', () => {
  const l = S.logs[$('#lDate').value];
  if (!l || !l.kcal) $('#lKcal').value = $('#lKcal').dataset.pre = targetFor({ ...formActs(), strava: l && l.strava }, undefined, $('#lDate').value);   // keep target in sync until calories are saved
}));
$('#logForm').addEventListener('submit', e => {
  e.preventDefault();
  const d = $('#lDate').value; if (!d) return;
  const wv = +$('#lWeight').value;
  const l = logFor(d), shown = l.weight ? +fw(l.weight, 2) : 0;
  if (wv !== shown) { l.weight = wv ? +wIn(wv).toFixed(3) : 0; delete l.wSrc; delete l.wOk; }   // edited here = manual from now on
  const kv = +$('#lKcal').value || 0;
  if (String($('#lKcal').value) !== String($('#lKcal').dataset.pre)) { l.kcal = kv; l.kSrc = 'manual'; delete l.mac; }   // typed = manual, wins over Health
  else if (!l.kSrc) l.kcal = kv;
  Object.assign(l, formActs());
  save(); renderAll();
  fillLogForm(d);
});
$('#logTable').addEventListener('click', e => {
  const del = e.target.dataset.del, ed = e.target.dataset.edit, ok = e.target.dataset.wok;
  if (ok) { S.logs[ok].wOk = 1; save(); renderAll(); return; }
  if (del && confirm(`Delete ${del}?`)) { delete S.logs[del]; save(); renderAll(); fillLogForm($('#lDate').value); }
  if (ed) { fillLogForm(ed); window.scrollTo({ top: $('#logForm').offsetTop - 20, behavior: 'smooth' }); }
});

// ---------- settings ----------
$('#settingsForm').addEventListener('change', e => {
  const t = e.target, k = t.dataset.s;
  if (t.dataset.h) {
    const ft = $('[data-h=ft]'), inch = $('[data-h=in]'), cm = $('[data-h=cm]');
    S.settings.heightCm = cm ? +cm.value || S.settings.heightCm : Math.round(((+ft.value || 0) * 12 + (+inch.value || 0)) * 2.54);
  } else if (k) {
    const typ = t.dataset.t, v = t.value;
    S.settings[k] = typ === 'date' || typ === 'text' ? v.trim()
      : typ === 'opt' ? (typeof defaults().settings[k] === 'string' ? v : +v)
      : typ === 'w' ? +wIn(+v).toFixed(2)
      : typ === 'perW' ? +((+v) * (imp() ? LB : 1)).toFixed(2)
      : typ === 'perD' ? Math.round((+v) / (imp() ? MI : 1))
      : (+v || 0);
    if (k === 'goal' && Math.sign(S.settings.adjust) !== Math.sign(GOAL_DEFAULT[v])) S.settings.adjust = GOAL_DEFAULT[v];
    if (k === 'startDate' && v) applyImports();
    if (k === 'sport') applyImports();
  }
  save(); renderSettings(); renderAll();
});
$('#resetAll').onclick = () => {
  if (!confirm('Wipe ALL logs and settings? Make sure your Excel backup is up to date first.')) return;
  S = defaults(); save(); renderSettings(); renderAll(); openOnboarding();
};

// ---------- gym: split ----------
$('#splitBox').addEventListener('click', e => {
  const ex = e.target.dataset.inc; if (!ex) return;
  const v = prompt(`Weight step for ${ex}. Leave blank for the automatic one.`, S.incr[ex] || '');
  if (v === null) return;
  if (+v > 0) S.incr[ex] = +v; else delete S.incr[ex];
  save(); renderSplit();
});
$('#splitTemplate').onclick = () => {
  const names = Object.fromEntries(currentSplit().map(w => [dayIdx(parse(w.d)), w.n]));
  const apply = (a, i) => { const r = { ...a, gym: names[i] ? 1 : 0 }; if (names[i]) r.w = names[i]; else delete r.w; return r; };
  S.template = S.template.map(apply);
  for (const [k, p] of Object.entries(S.plans)) if (k >= weekKey(0)) S.plans[k] = p.map(apply);   // this week and planned future weeks, keeping sport/run choices
  save(); renderAll();
  alert('Done. Your week plan now uses ' + Object.entries(names).map(([i, n]) => `${DAYS[i]} ${n}`).join(', ') + '.');
};

// ---------- Excel / JSON ----------
function replaceData(r, what) { S = r; save(); renderSettings(); renderAll(); fillLogForm(todayIso()); alert(`${what} restored.`); }
$('#xlLink').onclick = async () => {
  try {
    const h = await window.showSaveFilePicker({ suggestedName: 'recomp-backup.xlsx',
      types: [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
    xlHandle = h; xlState = 'ok';
    try { await idb('readwrite', s => s.put(h, 'xlsx')); } catch (e) {}
    await writeBackup();
  } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
};
$('#xlReconnect').onclick = reconnectBackup;
$('#banner').addEventListener('click', e => { if (e.target.id === 'bnReconnect') reconnectBackup(); });
$('#xlDownload').onclick = () => {
  if (!window.XLSX) return alert('Excel library missing. Keep the lib folder next to this file.');
  XLSX.writeFile(buildWorkbook(), `recomp-${todayIso()}.xlsx`);
};
$('#xlImport').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const r = restoreWorkbook(XLSX.read(await f.arrayBuffer()));
    if (confirm(`Replace the data on this page with ${Object.keys(r.logs).length} days from "${f.name}"?`)) replaceData(r, 'Excel backup');
  } catch (err) { alert('Couldn\'t read that file: ' + err.message); }
});
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `recomp-backup-${todayIso()}.json`; a.click();
};
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const r = JSON.parse(await f.text());
    if (!r.settings || !r.logs) throw 0;
    if ('surplus' in r.settings && !('adjust' in r.settings)) { Object.assign(r.settings, { goal: 'bulk', adjust: r.settings.surplus, units: 'metric', sport: 'Football', onboarded: true }); delete r.settings.surplus; }
    replaceData(normalize(r), 'Backup');
  } catch { alert('That file doesn\'t look like a Recomp backup.'); }
});

// ---------- Strong ----------
$('#strongFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const n = importStrong(await f.text());
    $('#strongMsg').innerHTML = `<span class="good">Imported ${n.workouts} workouts. ${n.days} gym day${n.days === 1 ? '' : 's'} since your start date ticked in your log. See the <a class="link" href="#/gym">Gym</a> page.</span>`;
  } catch (err) { $('#strongMsg').innerHTML = `<span class="warn">${esc(err.message)}</span>`; }
});

// ---------- Apple Health ----------
$('#healthBox').addEventListener('click', async e => {
  const t = e.target;
  if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'copied ✓'; } catch (err) { prompt('Copy this:', t.dataset.copy); } return; }
  if (t.id === 'hxCopyCode') {
    t.textContent = 'Copying…';
    try {
      const code = relayCode || await loadRelayCode();
      if (!code) throw new Error();
      await Promise.race([navigator.clipboard.writeText(code), new Promise((_, no) => setTimeout(no, 3000))]);
      t.textContent = 'Copied ✓ now paste it in Cloudflare';
    } catch (err) { t.textContent = 'Copy relay code'; window.open(RELAY_CODE_URL.replace('/blob/', '/raw/'), '_blank'); hxMsg('Couldn’t copy automatically, so the code opened in a new tab. Press Ctrl+A then Ctrl+C there.', 'warn'); }
    return;
  }
  if (t.id === 'hxSave') {
    const url = relayUrl($('#hxUrl').value), key = $('#hxKey').value.trim();
    if (!/^https:\/\//.test(url)) return hxMsg('Paste your worker address, starting with https://', 'warn');
    if (!key) return hxMsg('The key box is empty.', 'warn');
    t.disabled = true; hxMsg('Testing the relay…');
    try {
      const j = await relayGet('/batches?after=batch:9', url, key);   // a no-op read that still checks the key and storage
      HX = { url, key, after: '' }; saveHX(); renderHealthBox();
      hxMsg(j.stored ? `Connected ✓ Collecting ${j.stored} waiting update${j.stored === 1 ? '' : 's'}…` : 'Connected ✓ Now set up Health Auto Export (step 2) and send the first update.', 'good');
      if (j.stored) await healthSync(true);
    } catch (err) { hxMsg(esc(err.message), 'warn'); t.disabled = false; }
  }
  if (t.id === 'hxCheck') { t.disabled = true; await healthSync(true); }
  if (t.id === 'hxForget' && confirm('Disconnect Apple Health? Data already collected stays in Recomp.')) { HX = { draftKey: HX.key }; saveHX(); hxMsg(''); renderHealthBox(); }
});

// ---------- Hevy ----------
$('#hevyBox').addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'hvConnect') {
    const key = $('#hvKey').value.trim();
    if (!key) return hvMsg('Paste your API key first.', 'warn');
    e.target.disabled = true; hvMsg('Checking key…');
    try {
      await hevyGet('/workouts/count', key);
      let name = ''; try { const u = await hevyGet('/user/info', key); name = (u.data && (u.data.name || u.data.username)) || ''; } catch (err) {}
      HV = { key, name }; saveHV(); renderHevy(); await runHevySync();
    } catch (err) { hvMsg(esc(err.message), 'warn'); e.target.disabled = false; }
  }
  if (id === 'hvSync') { e.target.disabled = true; await runHevySync(); }
  if (id === 'hvDisconnect' && confirm('Disconnect Hevy? Workouts already synced stay in Recomp.')) { HV = {}; saveHV(); hvMsg(''); renderHevy(); }
});
$('#hevyBox').addEventListener('change', e => {
  if (e.target.id === 'hvWeights') { HV.weights = e.target.checked; saveHV(); if (HV.weights) refreshWeighIns(true); }
});

// ---------- Strava ----------
$('#stravaBox').addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'svSave') {
    SV.clientId = $('#svId').value.trim(); SV.clientSecret = $('#svSecret').value.trim();
    if (!SV.clientId || !SV.clientSecret) return svMsg('Fill in both boxes.', 'warn');
    saveSV(); svMsg(''); renderStrava();
  }
  if (id === 'svAuth') window.open(`https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(SV.clientId)}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}&approval_prompt=auto&scope=read,activity:read_all`, '_blank');
  if (id === 'svFinish') {
    let u; try { u = new URL($('#svUrl').value.trim()); } catch { return svMsg('That isn\'t a full web address. Copy the whole thing from the address bar.', 'warn'); }
    if (u.searchParams.get('error')) return svMsg('Strava says access was denied. Try again and click Authorize.', 'warn');
    const code = u.searchParams.get('code'), scope = u.searchParams.get('scope') || '';
    if (!code) return svMsg('No code found in that address.', 'warn');
    if (!/activity:read/.test(scope)) return svMsg('Please leave the "View data about your activities" box ticked on Strava, then try again.', 'warn');
    e.target.disabled = true; svMsg('Connecting…');
    try { await stravaToken({ grant_type: 'authorization_code', code }); renderStrava(); await runSync(); }
    catch (err) { svMsg(err.message, 'warn'); e.target.disabled = false; }
  }
  if (id === 'svForget') { SV = {}; saveSV(); renderStrava(); }
  if (id === 'svSync') { e.target.disabled = true; await runSync(); }
  if (id === 'svDisconnect' && confirm('Disconnect Strava? Activities already imported stay in your log.')) {
    SV = { clientId: SV.clientId, clientSecret: SV.clientSecret }; saveSV(); svMsg(''); renderStrava();
  }
  if (id === 'svUseWatch') {
    Object.assign(S.settings, watchAverages()); save(); renderSettings(); renderAll();
    svMsg('Planning now uses your watch\'s calorie averages. Adjust them any time in Settings.', 'good');
  }
});

// ---------- start-up ----------
if (S.settings.onboarded) { applyImports(); save(); }   // tidy: nothing from before the start date in the log
renderSettings();
renderAll();
fillLogForm(todayIso());
initBackup().then(() => { if (curPage() === 'settings') renderConnections(); });
if (!S.settings.onboarded) openOnboarding();
if (SV.refresh && (!SV.lastSync || Date.now() / 1000 - SV.lastSync > 3 * 3600)) runSync(true);
if (HV.key && (!HV.lastSync || Date.now() - HV.lastSync > 3 * 3600e3)) runHevySync(true);   // full sync (includes weigh-ins)
else refreshWeighIns();                                                                   // otherwise just this morning's weigh-in
healthSync();
// Tab left open overnight? Check for a new weigh-in when you come back to it.
const wiStale = () => Date.now() - (HV.lastWeights || 0) > 10 * 6e4;
const hxStale = () => Date.now() - (HX.lastCheck || 0) > 10 * 6e4;
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (wiStale()) refreshWeighIns(); if (hxStale()) healthSync(); });
window.addEventListener('focus', () => { if (wiStale()) refreshWeighIns(); if (hxStale()) healthSync(); });
