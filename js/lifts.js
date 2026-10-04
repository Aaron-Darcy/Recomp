/* Recomp · lifts: split detection, next-session targets (double progression) */
/* =====================================================================
   Lifts — latest Strong session of each workout, with next-time targets
   ===================================================================== */
const fmtW = w => +(+w).toFixed(2) + '';
const e1rm = (w, r) => r > 15 ? 0 : w * (1 + r / 30);   // Epley; unreliable past 15 reps
const monthYr = d => parse(d).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

// Latest session of each distinct workout name within ~2 weeks of your most recent one.
function currentSplit() {
  const ws = S.workouts; if (!ws.length) return [];
  const lastD = dayNum(ws[ws.length - 1].d), seen = new Map();
  for (let i = ws.length - 1; i >= 0 && dayNum(ws[i].d) > lastD - 13; i--) {
    const k = ws[i].n.trim().toLowerCase();
    if (!seen.has(k)) seen.set(k, ws[i]);
  }
  return [...seen.values()].sort((a, b) => dayIdx(parse(a.d)) - dayIdx(parse(b.d)));
}
function exerciseIndex() {
  const idx = {};
  for (const wk of S.workouts) {
    const per = {};
    for (const [e, w, r, so] of wk.s) (per[e] ||= []).push([w, r, so]);
    for (const [e, sets] of Object.entries(per)) (idx[e] ||= []).push({ d: wk.d, sets });
  }
  return idx;
}
function incFor(ex, w) {
  if (S.incr[ex]) return S.incr[ex];
  const lb = imp();
  if (/Leg Press|Hack Squat/i.test(ex)) return lb ? 20 : 10;
  if (/Barbell|Dumbbell|^T Bar/i.test(ex)) return lb ? 5 : 2.5;
  return lb ? (w < 40 ? 2.5 : 5) : (w < 20 ? 1 : 2.5);   // machine / cable stacks
}
// Double progression per set: +1 rep, or once a set reaches the top of the range, +1 step and back to the bottom.
function nextTarget(ex, sets) {
  const lo = +S.settings.repLow, hi = +S.settings.repHigh;
  const work = sets.filter(s => !/^w/i.test(s[2]));   // skip warm-ups
  if (!work.length) return null;
  const inc = incFor(ex, Math.max(...work.map(s => s[0])));
  const next = work.map(([w, r]) => r >= hi ? [+(w + inc).toFixed(2), lo, true] : [w, Math.max(r + 1, Math.min(lo, r + 2)), false]);
  return { sets: next, up: next.some(s => s[2]), inc };
}
const topE1 = sets => Math.max(0, ...sets.map(([w, r]) => e1rm(w, r)));
function splitRows() {
  const idx = exerciseIndex();
  return currentSplit().map(wk => ({
    wk,
    exercises: [...new Set(wk.s.map(s => s[0]))].map(ex => {
      const hist = idx[ex], last = hist[hist.length - 1];
      let best = { v: 0 };
      for (const h of hist) for (const [w, r] of h.sets) { const v = e1rm(w, r); if (v > best.v) best = { v, w, r, d: h.d }; }
      return { ex, last, next: nextTarget(ex, last.sets), best, pct: best.v ? topE1(last.sets) / best.v * 100 : 0 };
    })
  }));
}
function renderSplit() {
  $('#repRange').textContent = `${S.settings.repLow}–${S.settings.repHigh} reps`;
  const rows = splitRows();
  $('#splitTemplate').classList.toggle('hidden', !rows.length);
  if (!rows.length) { $('#splitBox').innerHTML = '<p class="empty">Connect Hevy or import a Strong CSV in <b>Sync &amp; backup</b> and your split shows up here.</p>'; return; }
  $('#splitBox').innerHTML = rows.map(({ wk, exercises }) => `<div class="wk">
    <h3>${DAYS[dayIdx(parse(wk.d))]} · ${esc(wk.n)} <span class="date">last done ${fmtShort(wk.d)}${wk.m ? ` · ${wk.m} min` : ''}</span></h3>
    <table><tr><th>Exercise</th><th>Last time</th><th>Next time</th><th>vs your best</th></tr>
    ${exercises.map(({ ex, last, next, best, pct }) => `<tr>
      <td>${esc(ex)}</td>
      <td>${last.sets.map(([w, r]) => `${fmtW(w)}×${r}`).join(', ')}${last.d !== wk.d ? `<span class="src">${fmtShort(last.d)}</span>` : ''}</td>
      <td>${next ? next.sets.map(([w, r, up]) => up ? `<b class="good">${fmtW(w)}×${r}</b>` : `${fmtW(w)}×<b>${r}</b>`).join(', ') +
        `<span class="src">${next.up ? `<span class="good">▲ weight up</span> on sets that hit ${S.settings.repHigh}, others +1 rep` : '+1 rep a set'} · <button class="link" data-inc="${esc(ex)}">step ${fmtW(next.inc)}</button></span>` : '—'}</td>
      <td>${pct >= 99.5 ? '<span class="good">🏆 at your best</span>' : `${Math.round(pct)}%<span class="src">best ${fmtW(best.w)}×${best.r} (${monthYr(best.d)})</span>`}</td>
    </tr>`).join('')}</table></div>`).join('');
}

