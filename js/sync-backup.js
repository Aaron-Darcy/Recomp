/* Recomp · backup: Excel auto-backup + restore */
/* =====================================================================
   Excel backup — auto-writes to a linked .xlsx via the File System Access API
   ===================================================================== */
const idb = (mode, fn, name = 'recomp') => new Promise((res, rej) => {
  const o = indexedDB.open(name, 1);
  o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onerror = () => rej(o.error);
  o.onsuccess = () => {
    const tx = o.result.transaction('kv', mode), req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  };
});
let xlHandle = null, xlState = 'none', xlLast = null, xlErr = '', xlTimer = null;

function cellDate(v) {
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; }
  if (v instanceof Date) return iso(v);
  return v ? anyDate(String(v)) : null;
}
function anyDate(s) {
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;   // dd/mm/yyyy
  return null;
}

function buildWorkbook() {
  const trend = Object.fromEntries(trendSeries().map(o => [o.date, o.t]));
  const dates = Object.keys(S.logs).sort();
  const logRows = dates.map(d => {
    const l = S.logs[d], sv = Object.values(l.strava || {});
    return {
      Date: d, Day: DAYS[dayIdx(parse(d))],
      'Weight (kg)': l.weight || '', 'Trend (kg)': trend[d] ? +trend[d].toFixed(2) : '',
      'Calories eaten': l.kcal || '',
      Gym: l.gym ? 1 : 0, Training: l.train ? 1 : 0, Match: l.match ? 1 : 0, 'Run (km)': l.run || 0,
      'Strong workout': l.strong ? l.strong.name : '', 'Strong sets': l.strong ? l.strong.sets : '', 'Strong volume': l.strong ? l.strong.volume : '',
      'Strava activities': sv.map(a => `${a.name} (${a.type}${a.km ? ', ' + a.km + ' km' : ''})`).join('; '),
      'Watch kcal': sum(sv.map(a => a.kcal || 0)) || ''
    };
  });
  const weeks = {};
  for (const d of dates) (weeks[wkOf(d)] ||= []).push(d);
  const weekRows = Object.entries(weeks).map(([k, ds]) => {
    const ls = ds.map(d => S.logs[d]);
    const ws = ls.filter(l => l.weight > 0).map(l => +l.weight), ks = ls.filter(l => l.kcal > 0).map(l => +l.kcal);
    const lastT = ds.filter(d => trend[d]).pop();
    return {
      'Week starting': k, 'Weigh-ins': ws.length,
      'Avg weight (kg)': ws.length ? +avg(ws).toFixed(2) : '', 'Trend at end (kg)': lastT ? +trend[lastT].toFixed(2) : '',
      'Avg calories eaten': ks.length ? Math.round(avg(ks)) : '',
      'Gym sessions': ls.filter(l => l.gym).length, 'Sport sessions': ls.filter(l => l.train || l.match).length,
      'Run km': +sum(ls.map(l => +l.run || 0)).toFixed(1),
      'Gym volume': sum(ls.map(l => l.strong ? l.strong.volume : 0)) || ''
    };
  });
  const setRows = FIELDS.map(([k, lbl]) => ({ Key: k, Setting: typeof lbl === 'function' ? lbl() : lbl, Value: S.settings[k] }));

  const wb = XLSX.utils.book_new();
  const add = (name, rows, header, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws['!cols'] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Log', logRows, ['Date','Day','Weight (kg)','Trend (kg)','Calories eaten','Gym','Training','Match','Run (km)','Strong workout','Strong sets','Strong volume','Strava activities','Watch kcal'],
      [11,5,11,10,14,5,9,7,9,20,11,14,45,11]);
  add('Weekly', weekRows, ['Week starting','Weigh-ins','Avg weight (kg)','Trend at end (kg)','Avg calories eaten','Gym sessions','Sport sessions','Run km','Gym volume'],
      [14,10,15,17,18,13,15,9,12]);
  const nextRows = splitRows().flatMap(({ wk, exercises }) => exercises.map(({ ex, last, next, best, pct }) => ({
    Day: DAYS[dayIdx(parse(wk.d))], Workout: wk.n, Exercise: ex,
    'Last time': last.sets.map(([w, r]) => `${fmtW(w)}x${r}`).join(', '),
    'Next time': next ? next.sets.map(([w, r]) => `${fmtW(w)}x${r}`).join(', ') : '',
    'Best set': best.v ? `${fmtW(best.w)}x${best.r} (${best.d})` : '', '% of best': Math.round(pct)
  })));
  add('Next session', nextRows, ['Day','Workout','Exercise','Last time','Next time','Best set','% of best'], [5,10,34,26,26,24,10]);
  const ciRows = S.checkins.map(c => ({
    Date: c.date, 'Week reviewed': `${c.from} to ${c.to}`, 'Avg weight (kg)': c.avgW ?? '', 'Prev week avg (kg)': c.prevW ?? '',
    'Trend (kg)': c.trend ?? '', 'Rate (kg/wk)': c.rate != null ? +c.rate.toFixed(2) : '',
    'Avg eaten': c.kcal ?? '', 'Avg target': c.target, 'Days logged': c.kcalDays, Gym: `${c.gym}/${c.gymPlanned}`, Sport: c.football, 'Run km': c.runKm,
    'Lifts up': c.lifts.up, 'Lifts same': c.lifts.same, 'Lifts down': c.lifts.down,
    'Adjustment (kcal)': c.corr, 'New avg target': c.newTarget,
    Energy: c.feel.energy ?? '', Hunger: c.feel.hunger ?? '', Sleep: c.feel.sleep ?? '', 'Gym feel': c.feel.gymFeel ?? '', Notes: c.notes || ''
  }));
  add('Check-ins', ciRows, ['Date','Week reviewed','Avg weight (kg)','Prev week avg (kg)','Trend (kg)','Rate (kg/wk)','Avg eaten','Avg target','Days logged','Gym','Sport','Run km','Lifts up','Lifts same','Lifts down','Adjustment (kcal)','New avg target','Energy','Hunger','Sleep','Gym feel','Notes'],
      [11,24,15,17,10,12,10,10,11,6,7,7,8,10,10,16,14,7,7,6,9,40]);
  const hRows = Object.keys(S.health).sort().map(d => { const h = S.health[d], r1 = v => v == null ? '' : +(+v).toFixed(1);
    return { Date: d, 'Sleep (h)': h.sleep ? r1(h.sleep.total) : '', 'Resting HR': r1(h.rhr), HRV: r1(h.hrv), Steps: h.steps ? Math.round(h.steps) : '',
      'Active kcal': h.active ? Math.round(h.active) : '', 'Resting kcal': h.basal ? Math.round(h.basal) : '', 'Exercise min': h.exMin ? Math.round(h.exMin) : '',
      'VO2 max': r1(h.vo2), 'SpO2 %': r1(h.spo2), 'Resp. rate': r1(h.rr), 'Weight (kg)': h.weight || '', 'Body fat %': h.bf || '',
      Calories: h.kcal || '', Protein: h.mac ? h.mac.p : '', Carbs: h.mac ? h.mac.c : '', Fat: h.mac ? h.mac.f : '' }; });
  if (hRows.length) add('Health', hRows, ['Date','Sleep (h)','Resting HR','HRV','Steps','Active kcal','Resting kcal','Exercise min','VO2 max','SpO2 %','Resp. rate','Weight (kg)','Body fat %','Calories','Protein','Carbs','Fat'],
      [11,9,10,7,8,10,11,11,8,7,9,11,10,9,8,7,6]);
  add('Settings', setRows, ['Key','Setting','Value'], [14,60,12]);
  // Full data as JSON (split to fit Excel's 32k-char cell limit) so a restore is lossless.
  const json = JSON.stringify(S), chunks = [];
  for (let i = 0; i < json.length; i += 30000) chunks.push([json.slice(i, i + 30000)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chunks), '_data');
  wb.Workbook = { Sheets: wb.SheetNames.map(n => ({ Hidden: n === '_data' ? 1 : 0 })) };
  return wb;
}

function restoreWorkbook(wb) {
  const ds = wb.Sheets['_data'], ls = wb.Sheets['Log'], ss = wb.Sheets['Settings'];
  if (!ds && !ls) throw new Error('No Log sheet found');
  const raw = ds ? JSON.parse(XLSX.utils.sheet_to_json(ds, { header: 1 }).map(x => x[0] || '').join('')) : null;
  if (raw && raw.settings && 'surplus' in raw.settings && !('adjust' in raw.settings)) {   // backup from the old Lean Bulk Tracker
    Object.assign(raw.settings, { goal: 'bulk', adjust: raw.settings.surplus, units: 'metric', sport: 'Football', onboarded: true });
    delete raw.settings.surplus;
  }
  const r = normalize(raw);
  if (ls) {   // the visible Log sheet wins, so edits made in Excel come back in
    const seen = new Set();
    for (const row of XLSX.utils.sheet_to_json(ls)) {
      const d = cellDate(row.Date); if (!d) continue;
      seen.add(d);
      const l = r.logs[d] || (r.logs[d] = {});
      if (l.wSrc && Math.abs((+row['Weight (kg)'] || 0) - (+l.weight || 0)) > 0.005) delete l.wSrc;   // edited in Excel = manual
      Object.assign(l, {
        weight: +row['Weight (kg)'] || 0, kcal: +row['Calories eaten'] || 0,
        gym: +row.Gym ? 1 : 0, train: +row.Training ? 1 : 0, match: +row.Match ? 1 : 0, run: +row['Run (km)'] || 0
      });
    }
    for (const d of Object.keys(r.logs)) if (!seen.has(d)) delete r.logs[d];
  }
  if (ss) for (const row of XLSX.utils.sheet_to_json(ss))
    if (row.Key in r.settings && row.Value !== undefined && typeof r.settings[row.Key] !== 'boolean')
      r.settings[row.Key] = typeof r.settings[row.Key] === 'string' ? (row.Key === 'startDate' ? cellDate(row.Value) : String(row.Value)) : +row.Value;
  return r;
}

async function initBackup() {
  if (!window.XLSX) { xlState = 'nolib'; return renderBackup(); }
  if (!window.showSaveFilePicker) { xlState = 'unsupported'; return renderBackup(); }
  try {
    xlHandle = await idb('readonly', s => s.get('xlsx'));
    if (!xlHandle) {   // carry over a file linked in the old Lean Bulk Tracker
      xlHandle = await idb('readonly', s => s.get('xlsx'), 'leanBulkTracker');
      if (xlHandle) await idb('readwrite', s => s.put(xlHandle, 'xlsx'));
    }
  } catch (e) {}
  if (xlHandle) xlState = (await xlHandle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'paused';
  renderBackup();
}
function scheduleBackup() {
  if (xlState !== 'ok') return;
  clearTimeout(xlTimer);
  xlTimer = setTimeout(writeBackup, 1200);
}
async function writeBackup() {
  try {
    const w = await xlHandle.createWritable();
    await w.write(XLSX.write(buildWorkbook(), { bookType: 'xlsx', type: 'array' }));
    await w.close();
    xlLast = new Date(); xlErr = '';
  } catch (e) {
    xlErr = e.name === 'NotAllowedError' ? '' : 'Couldn\'t save the Excel file. If it\'s open in Excel, close it and it will save on your next change.';
    if (e.name === 'NotAllowedError') xlState = 'paused';
  }
  renderBackup();
}
async function reconnectBackup() {
  if ((await xlHandle.requestPermission({ mode: 'readwrite' })) === 'granted') { xlState = 'ok'; await writeBackup(); }
}
function renderBackup() {
  const msg = {
    nolib: '<span class="warn">Excel library missing. Keep the <code>lib</code> folder next to this file.</span>',
    unsupported: '<span class="warn">Auto-backup needs Chrome or Edge. Use "Download .xlsx now" instead.</span>',
    none: 'Not linked yet.',
    ok: `<span class="good">● Auto-saving</span> to <b>${esc(xlHandle ? xlHandle.name : '')}</b>${xlLast ? ` · last saved ${xlLast.toLocaleTimeString()}` : ''}`,
    paused: '<span class="warn">● Paused.</span> The browser needs your OK again after reopening. Click <b>Reconnect backup</b>.'
  }[xlState];
  $('#xlStatus').innerHTML = xlErr ? `<span class="warn">${xlErr}</span>` : msg;
  $('#xlReconnect').classList.toggle('hidden', xlState !== 'paused');
  $('#xlLink').classList.toggle('hidden', xlState === 'unsupported' || xlState === 'nolib');
  $('#xlLink').textContent = xlHandle ? 'Change backup file' : 'Link Excel backup file';
  $('#banner').classList.toggle('hidden', xlState !== 'paused');
  $('#banner').innerHTML = xlState === 'paused' ? `Excel backup is paused until you reconnect it. <button class="btn" id="bnReconnect">Reconnect backup</button>` : '';
}

