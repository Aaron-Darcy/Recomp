/* Recomp · core: state, storage, helpers, units, the calorie model, week plans */
const KEY = 'recomp.v1';
const SKEY = 'recomp.strava';                 // kept separate so tokens never end up in backups
const OLD_KEY = 'leanBulkTracker.v1', OLD_SKEY = 'leanBulkTracker.strava';
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const KCAL_PER_KG = 7700, LB = 2.20462, MI = 1.60934;

const defaults = () => ({
  settings: {
    units: 'metric', sex: 'm', age: 30, heightCm: 175, startWeight: 75,
    goal: 'maintain', adjust: 0, factor: 1.3,
    gym: 250, sport: '', train: 500, match: 650, matchDay: 5, runPerKm: 0,
    proteinPerKg: 2.0, fatPerKg: 0.9,
    repLow: 8, repHigh: 12, checkInDay: 0,
    startDate: '', maintWeeks: 0, onboarded: false,
    targetWeight: 0, theme: 'auto', dashRange: 28, connections: {}
  },
  template: [{gym:1},{},{gym:1},{},{gym:1},{},{}],   // Mon..Sun
  plans: {},    // weekStart ISO -> [7 activity objects]
  logs: {},     // ISO date -> {weight (kg), kcal, gym, train, match, run (km), strong?, strava?}
  workouts: [], // Strong sessions: {id, d, n: name, m: minutes, s: [[exercise, weight, reps, setOrder]]}
  incr: {},     // exercise -> weight step override
  checkins: [], // weekly check-ins; the latest one locks the calorie adjustment for the week
  acts: {},     // Strava + Apple Health workouts by id: {d, type, name, km, min, kcal, start?, src?}
  health: {}    // Apple Health daily summaries by date: {sleep:{total,deep,rem,core,awake}, rhr, hrv, steps, active, basal, vo2, kcal, mac, …}
});

let S = load();
let weekOffset = 0, dashWeeks = 12, dashEx = null;

function normalize(r) {
  const d = defaults();
  r = r || {};
  return { settings: {...d.settings, ...(r.settings || {})}, template: r.template || d.template, plans: r.plans || {}, logs: r.logs || {},
           workouts: r.workouts || [], health: r.health || {}, incr: r.incr || {}, checkins: r.checkins || [], acts: r.acts || {}, demo: !!r.demo };
}
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.settings) return normalize(r); } catch (e) {}
  // One-time move from the earlier single-user "Lean Bulk Tracker"
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old && old.settings) {
      const s = old.settings;
      old.settings = { ...s, goal: 'bulk', adjust: s.surplus > 0 ? s.surplus : 150, units: 'metric', sport: 'Football', onboarded: true };
      delete old.settings.surplus;
      const sv = localStorage.getItem(OLD_SKEY);
      if (sv && !localStorage.getItem(SKEY)) localStorage.setItem(SKEY, sv);
      const r = normalize(old);
      localStorage.setItem(KEY, JSON.stringify(r));
      return r;
    }
  } catch (e) {}
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Could not save. Browser storage is blocked.'); }
  scheduleBackup();
}

/* ---------- helpers ---------- */
function $(s) { return document.querySelector(s); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay()+6)%7)); };
const dayIdx = d => (d.getDay()+6) % 7;
const dayNum = s => Math.round(parse(s).getTime() / 864e5);
const fromNum = x => iso(new Date(Math.round(x) * 864e5 + 12 * 36e5));
const todayIso = () => iso(new Date());
const fmtShort = s => parse(s).toLocaleDateString(undefined, {day:'numeric', month:'short'});
const avg = a => a.reduce((x,y) => x+y, 0) / a.length;
const sum = a => a.reduce((x,y) => x+y, 0);
const r10 = n => Math.round(n/10) * 10;
const sgn = v => (+v >= 0 ? '+' : '') + v;
const logFor = d => S.logs[d] || (S.logs[d] = { weight: 0, kcal: 0 });
const span7 = (from, off) => [...Array(7)].map((_, i) => iso(addDays(parse(from), i + off)));
const startDate = () => S.settings.startDate || todayIso();

/* ---------- units (data is always stored in kg / cm / km) ---------- */
const imp = () => S.settings.units === 'imperial';
const wu = () => imp() ? 'lb' : 'kg';
const du = () => imp() ? 'mi' : 'km';
const wOut = kg => imp() ? kg * LB : kg;
const wIn = v => imp() ? v / LB : v;
const dOut = km => imp() ? km / MI : km;
const dIn = v => imp() ? v * MI : v;
const fw = (kg, dp = 1) => wOut(+kg).toFixed(dp);
const fd = (km, dp = 1) => +dOut(+km).toFixed(dp);
const fmtPace = minPerUnit => { const m = Math.floor(minPerUnit), s = Math.round((minPerUnit - m) * 60); return s === 60 ? `${m + 1}:00` : `${m}:${pad(s)}`; };
const heightTxt = cm => imp() ? `${Math.floor(cm / 30.48)}′${Math.round(cm / 2.54 % 12)}″` : `${Math.round(cm)} cm`;

/* ---------- sport ---------- */
const SPORT_TYPES = { football: 'Soccer', soccer: 'Soccer', basketball: 'Basketball', volleyball: 'Volleyball', tennis: 'Tennis',
  padel: 'Padel', badminton: 'Badminton', squash: 'Squash', cricket: 'Cricket', pickleball: 'Pickleball' };
const SPORT_EMOJI = { football: '⚽', soccer: '⚽', rugby: '🏉', basketball: '🏀', hockey: '🏑', netball: '🏐', volleyball: '🏐',
  tennis: '🎾', padel: '🎾', badminton: '🏸', cricket: '🏏', 'gaelic football': '🏐', hurling: '🏑', lacrosse: '🥍' };
const sportName = () => (S.settings.sport || '').trim();
const hasSport = () => !!sportName();
const sportEmoji = () => SPORT_EMOJI[sportName().toLowerCase()] || '🏅';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- model ---------- */
function bmr(w) { const s = S.settings; return 10*w + 6.25*s.heightCm - 5*s.age + (s.sex === 'f' ? -161 : 5); }
// Watch calories from Strava for that day's sport sessions (null if none): a match cut short counts as what it was.
function watchKcal(a, kind) {
  const v = Object.values(a.strava || {}).filter(x => x.kind === kind && x.kcal > 0);
  return v.length ? sum(v.map(x => x.kcal)) : null;
}
function actKcal(a, w) {
  const s = S.settings;
  const perKm = s.runPerKm > 0 ? s.runPerKm : 0.9 * w;
  const sport = k => hasSport() && a[k] ? (watchKcal(a, k) ?? s[k]) : 0;
  const runs = +a.run > 0 ? (watchKcal(a, 'run') ?? +a.run * perKm) : 0;   // watch calories when Strava has them, else per-km estimate
  return (a.gym ? s.gym : 0) + sport('train') + sport('match') + runs;
}
// The plan for a day, upgraded with what Strava says actually happened (so past/today targets use real sessions).
function withActual(a, d) {
  const l = S.logs[d];
  return l && l.strava ? { ...a, train: a.train || l.train, match: a.match || l.match, run: l.run || a.run, strava: l.strava } : a;
}
function formulaTDEE(a, w) { return bmr(w) * S.settings.factor + actKcal(a, w); }

function rawWeighIns() {
  return Object.keys(S.logs).filter(k => +S.logs[k].weight > 0).sort()
    .map(k => ({ date: k, x: dayNum(k), w: +S.logs[k].weight }));
}
// Weigh-ins that look like typos: more than max(1.5 kg, 2.5%) off the running trend, unless the next weigh-in
// agrees with it (two in a row = a real change) or you've confirmed it with "It's right".
function flaggedWeighIns() {
  const raw = rawWeighIns(), out = new Set();
  let e = null;
  raw.forEach((o, i) => {
    if (e != null && !S.logs[o.date].wOk) {
      const lim = Math.max(1.5, 0.025 * e), next = raw[i + 1];
      const confirmed = next && Math.abs(next.w - o.w) <= 1 && Math.abs(next.w - e) > lim;
      if (Math.abs(o.w - e) > lim && !confirmed) { out.add(o.date); return; }
    }
    e = e == null ? o.w : e + 0.15 * (o.w - e);
  });
  return out;
}
function weighIns() { const f = flaggedWeighIns(); return rawWeighIns().filter(o => !f.has(o.date)); }
// Consecutive days with a weigh-in, ending today (or yesterday if today isn't in yet), plus the best run ever.
function weighInStreak() {
  const has = d => S.logs[d] && +S.logs[d].weight > 0;
  let d = new Date(); if (!has(iso(d))) d = addDays(d, -1);
  let cur = 0; while (has(iso(d))) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const x of Object.keys(S.logs).filter(has).sort()) { run = prev && dayNum(x) - dayNum(prev) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { cur, best: Math.max(best, cur), today: has(todayIso()) };
}
function trendSeries() {
  let e = null;
  return weighIns().map(o => { e = e == null ? o.w : e + 0.15 * (o.w - e); return {...o, t: e}; });
}
function currentWeight() { const t = trendSeries(); return t.length ? t[t.length-1].t : +S.settings.startWeight; }
function slope(p) {
  const mx = avg(p.map(o => o.x)), my = avg(p.map(o => o.w));
  let a = 0, b = 0;
  for (const o of p) { a += (o.x-mx)*(o.w-my); b += (o.x-mx)**2; }
  return b ? a/b : 0;
}
function recentRate(days = 21) {
  const today = dayNum(todayIso());
  const p = weighIns().filter(o => o.x > today - days && o.x <= today);
  if (p.length < 5 || p[p.length-1].x - p[0].x < 10) return null;
  return slope(p) * 7;
}
// Learns the gap between formula maintenance and real maintenance from the last 4 weeks.
function calibration() {
  const today = dayNum(todayIso()), from = today - 28;
  const keys = Object.keys(S.logs).filter(k => dayNum(k) > from && dayNum(k) < today), flagged = flaggedWeighIns();   // today is still in progress
  const w = keys.filter(k => +S.logs[k].weight > 0 && !flagged.has(k)).map(k => ({ x: dayNum(k), w: +S.logs[k].weight }));
  const eat = keys.filter(k => +S.logs[k].kcal > 0);
  const xs = keys.filter(k => +S.logs[k].weight > 0 || +S.logs[k].kcal > 0).map(dayNum);
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const need = { weighIns: Math.max(0, 8 - w.length), intake: Math.max(0, 10 - eat.length), days: Math.max(0, 14 - span) };
  if (w.length < 8 || eat.length < 10 || span < 14) return { ready: false, corr: 0, need };
  const wNow = currentWeight();
  const intake = avg(eat.map(k => +S.logs[k].kcal));
  const predicted = avg(eat.map(k => formulaTDEE(S.logs[k], wNow)));
  const rateDay = slope(w);
  const actual = intake - rateDay * KCAL_PER_KG;
  let corr = (actual - predicted) * Math.min(1, span / 21);
  corr = Math.max(-500, Math.min(500, corr));
  return { ready: true, corr: Math.round(corr), intake, rate: rateDay * 7 };
}
// Targets use the adjustment + weight locked at the last check-in, so they stay put all week.
function activeCal() {
  const c = S.checkins[S.checkins.length - 1];
  return c ? { corr: c.corr, w: c.w, locked: c.date } : liveCal();
}
function liveCal() { return { corr: calibration().corr, w: currentWeight() }; }
// Optional maintenance weeks from the start date, then the goal's deficit/surplus kicks in.
const goalStart = () => iso(addDays(parse(startDate()), 7 * (+S.settings.maintWeeks || 0)));
const adjustOn = d => d < goalStart() ? 0 : +S.settings.adjust;
const aimRate = d => adjustOn(d) * 7 / KCAL_PER_KG;          // kg/week, signed
function targetFor(a, cal = activeCal(), d = todayIso()) {
  return r10(formulaTDEE(a, cal.w) + cal.corr + adjustOn(d));
}
function macros(kcal) {
  const w = currentWeight(), s = S.settings;
  const p = Math.round(s.proteinPerKg * w), f = Math.round(s.fatPerKg * w);
  return { p, f, c: Math.max(0, Math.round((kcal - p*4 - f*9) / 4)) };
}
const GOAL_WORD = { bulk: 'Bulking', cut: 'Cutting', maintain: 'Maintaining' };
function phaseText() {
  const today = todayIso(), gs = goalStart(), a = +S.settings.adjust;
  if (today < startDate()) return `Starts ${DAYS[dayIdx(parse(startDate()))]} ${fmtShort(startDate())}`;
  if (today < gs) return `Maintenance week · ${S.settings.goal === 'maintain' ? 'then maintain' : (S.settings.goal === 'cut' ? 'cut' : 'bulk') + ' starts ' + fmtShort(gs)}`;
  return `${GOAL_WORD[S.settings.goal] || 'Goal'}${a ? ` · ${sgn(a)} kcal/day` : ''}`;
}
const rateTxt = kgPerWk => `${sgn(fw(kgPerWk, 2))} ${wu()}/wk`;

/* ---------- plans ---------- */
function weekKey(off = weekOffset) { return iso(addDays(monday(new Date()), 7*off)); }
function weekPlan(key, create) {
  if (S.plans[key]) return S.plans[key];
  const p = S.template.map(a => ({...a}));
  if (create) S.plans[key] = p;
  return p;
}
function plannedActs(dateIso) { return weekPlan(iso(monday(parse(dateIso))))[dayIdx(parse(dateIso))]; }

