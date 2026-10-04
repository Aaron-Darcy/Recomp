/* Recomp · pages: Today, Body, Nutrition, Gym, Recovery, Recap and the Settings extras. Running lives in running.js. */

// ---------- building blocks ----------
const kpi = (lbl, val, cmp = '') => `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="cmp">${cmp}</div></div>`;
const phead = (title, sub, right = '') => `<div class="phead"><div><h2>${title}</h2><div class="psub">${sub}</div></div>${right}</div>`;
const cbox = (id, title, note = '', cls = '') => `<div class="box"><h3>${title}${note ? ` <span class="note">${note}</span>` : ''}</h3><div class="ch ${cls}" id="${id}"></div></div>`;
const dLabel = d => `${DAYS[dayIdx(parse(d))]} ${fmtShort(d)}`;
const tipHead = d => `<b>${dLabel(d)}</b>`;
const pctTxt = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
const signed = (v, dec = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(dec);
const upDown = (v, good) => v == null || Math.abs(v) < 0.5 ? '' : `<span class="${(v > 0) === good ? 'good' : 'warn'}">${v > 0 ? '▲' : '▼'}</span>`;
const fmtHM = h => h == null ? '–' : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1) + 'k' : Math.round(v);

// ================================================================ TODAY
function renderToday() {
  const d = todayIso(), acts = actsOn(d), tgt = dayTarget(d), eaten = intake(d), mac = macD(d), mt = macros(tgt);
  const cal = activeCal(), live = calibration(), w = currentWeight(), rate = recentRate(), aim = aimRate(d), rd = readiness(d);
  const rest = formulaTDEE({}, cal.w) + cal.corr;
  const hour = new Date().getHours(), hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // weigh-in status
  const l = LD(d), st = weighInStreak(), hevyOn = HV.key && HV.weights !== false;
  const wi = +l.weight > 0
    ? `<span class="good">✓</span> ${fw(l.weight)} ${wu()} this morning${l.wSrc === 'hevy' ? ' (Hevy)' : l.wSrc === 'health' ? ' (Health)' : ''}${flaggedWeighIns().has(d) ? ' <span class="warn">⚠ looks off</span>' : ''}`
    : `⏳ No weigh-in yet today${hevyOn || HX.url ? ' · <button class="link" id="wiCheck">Check now</button>' : ''}`;
  let rTxt = '–', rNote = aim ? `aim ${rateTxt(aim)}` : 'aim: hold steady';
  if (rate != null) { rTxt = rateTxt(rate); const df = rate - aim; rNote += Math.abs(df) < 0.1 ? ' · <span class="good">✓ on track</span>' : df > 0 ? ' · <span class="warn">▲ above aim</span>' : ' · <span class="warn">▼ below aim</span>'; }
  else rNote += ' · needs ~10 days of weigh-ins';
  const calTxt = cal.locked ? `locked at check-in ${fmtShort(cal.locked)} (${sgn(cal.corr)} kcal learnt)` : live.ready ? `learnt: ${sgn(live.corr)} kcal vs formula` : 'formula estimate (learns after ~2 weeks)';
  const nk = weekKey(1), npT = weekPlan(nk).map((a, i) => targetFor(a, cal, iso(addDays(parse(nk), i))));
  // training today
  const sp = sportName(), rows = [];
  if (acts.gym) rows.push(['🏋️', `Gym${acts.w ? `: ${esc(acts.w)}` : ''}`, LD(d).gym ? '<span class="good">done ✓</span>' : 'planned']);
  if (acts.train) rows.push([sportEmoji(), `${esc(cap(sp))} training`, LD(d).train ? '<span class="good">done ✓</span>' : 'planned']);
  if (acts.match) rows.push([sportEmoji(), `${esc(cap(sp))} match`, LD(d).match ? '<span class="good">done ✓</span>' : 'planned']);
  if (+acts.run > 0) rows.push(['🏃', `Run ${fd(acts.run)} ${du()}`, LD(d).run > 0 && LD(d).sv && LD(d).sv.run ? '<span class="good">done ✓</span>' : 'planned']);
  if (!rows.length) rows.push(['🛌', 'Rest day', 'recover, eat, sleep']);
  const sr = splitRows(), todayW = acts.gym && sr.find(r => acts.w && r.wk.n.trim().toLowerCase() === String(acts.w).trim().toLowerCase());
  const nextList = todayW ? todayW.exercises.filter(e => e.next).map(e => `<div class="tline"><div class="tt">${esc(e.ex)}<small>last: ${e.last.sets.filter(s => !/^w/i.test(s[2])).map(([w, r]) => `${fmtW(w)}×${r}`).join(', ')}</small></div><div style="text-align:right;font-size:13px">${e.next.sets.map(([w, r, up]) => `<span class="${up ? 'good' : ''}">${fmtW(w)}×${r}</span>`).join(', ')}</div></div>`).join('') : '';
  const tw = weekTotals(weekKey(0)), planned = weekPlan(weekKey(0)).filter(a => a.gym).length, sl7 = meanOf(daysBetween(iso(addDays(new Date(), -6))).map(sleepH).filter(x => x != null));
  const left = eaten != null ? tgt - eaten : null;

  $('#p-today').innerHTML = phead(`${hello}${S.settings.name ? ', ' + esc(S.settings.name) : ''}`, `${DAYS[dayIdx(new Date())]} ${fmtShort(d)} · ${phaseText()}`) + `
    <div class="grid g4">
      ${kpi('Trend weight', `${fw(w)} <small>${wu()}</small>`, wi)}
      ${kpi('Rate, last 3 weeks', rTxt, rNote)}
      ${kpi('Maintenance, rest day', `${r10(rest)} <small>kcal</small>`, calTxt)}
      ${kpi('Next week, avg target', `${r10(avg(npT))} <small>kcal</small>`, npT.join(' · '))}
    </div>
    <div class="hero" style="margin-top:14px">
      <div class="box"><h3>Readiness <span class="note">HRV, resting HR, sleep</span></h3>
        ${rd ? `<div class="ch sm" id="tReady"></div><p style="margin:4px 0 8px;font-size:14px">${rd.advice}</p>
          <div class="row" style="gap:6px">${rd.parts.map(p => `<span class="pill2 ${p.z >= 0.3 ? 'good' : p.z <= -0.5 ? 'warn' : ''}">${p.name} ${p.unit === 'h' ? fmtHM(p.v) : Math.round(p.v) + ' ' + p.unit} <span class="note">vs ${p.unit === 'h' ? fmtHM(p.m) : Math.round(p.m)}</span></span>`).join('')}</div>`
        : `<div class="empty2">Readiness needs a week of sleep, HRV and resting heart rate from Apple Health.</div>`}
      </div>
      <div class="box"><h3>Today's food <span class="note">${eaten == null ? 'nothing logged yet' : left >= 0 ? `${Math.round(left)} kcal left` : `${Math.round(-left)} kcal over`}</span></h3>
        <div class="rings">
          <div class="ring"><div class="ch" id="tRk"></div><div class="cap">Calories</div></div>
          <div class="ring"><div class="ch" id="tRp"></div><div class="cap">Protein</div></div>
          <div class="ring"><div class="ch" id="tRc"></div><div class="cap">Carbs</div></div>
          <div class="ring"><div class="ch" id="tRf"></div><div class="cap">Fat</div></div>
        </div>
        <p class="help" style="margin:6px 0 0">Target today ${tgt} kcal · ${mt.p} g protein · ${mt.c} g carbs · ${mt.f} g fat. ${eaten == null ? 'Food from Apple Health (MyFitnessPal etc.) shows up here automatically.' : ''}</p>
      </div>
    </div>
    <div class="grid g3" style="margin-top:14px">
      <div class="box"><h3>Training today</h3>
        ${rows.map(([i, t, s]) => `<div class="tline"><div class="ti">${i}</div><div class="tt">${t}</div><div class="note">${s}</div></div>`).join('')}
        ${nextList ? `<div class="secttl" style="margin:12px 0 2px">Next-session targets</div>${nextList}` : ''}
      </div>
      <div class="box"><h3>Weigh-ins <span class="note">streak ${st.cur} day${st.cur === 1 ? '' : 's'}${st.cur >= 3 ? ' 🔥' : ''} · best ${st.best}</span></h3>
        <div class="ch sm" id="tWt"></div>
      </div>
      <div class="box"><h3>This week</h3>
        <div class="tline"><div class="ti">🏋️</div><div class="tt">Gym<small>${tw.gym} of ${planned} planned</small></div><div class="bar" style="width:90px"><i style="width:${planned ? Math.min(100, tw.gym / planned * 100) : 0}%"></i></div></div>
        <div class="tline"><div class="ti">🏃</div><div class="tt">Running<small>${fd(tw.runKm)} ${du()}</small></div></div>
        ${sp ? `<div class="tline"><div class="ti">${sportEmoji()}</div><div class="tt">${esc(cap(sp))}<small>${tw.sport} session${tw.sport === 1 ? '' : 's'}</small></div></div>` : ''}
        <div class="tline"><div class="ti">🍽️</div><div class="tt">Calories vs target<small>${tw.kcal != null ? `avg ${Math.round(tw.kcal)} eaten vs ${Math.round(tw.target)}` : 'nothing logged yet'}</small></div><b>${tw.kcal != null ? sgn(Math.round(tw.kcal - tw.target)) : ''}</b></div>
        <div class="tline"><div class="ti">😴</div><div class="tt">Sleep<small>${sl7 != null ? `avg ${fmtHM(sl7)} a night` : 'no sleep data yet'}</small></div></div>
      </div>
    </div>
    <div class="secttl">Top insights <a class="link" href="#/insights" style="float:right;text-transform:none;letter-spacing:0">see all</a></div>
    ${insightCards(allInsights(), { tags: true, max: 4 })}`;
  const t = TH();
  if (rd) scoreGauge('#tReady', rd.score, rd.band === 'high' ? 'Ready to push' : rd.band === 'ok' ? 'Train as planned' : 'Take it easy');
  ringChart('#tRk', eaten || 0, tgt, 'kcal', t.accent);
  ringChart('#tRp', mac ? mac.p : 0, mt.p, 'g', t.pro, 'g');
  ringChart('#tRc', mac ? mac.c : 0, mt.c, 'g', t.carb, 'g');
  ringChart('#tRf', mac ? mac.f : 0, mt.f, 'g', t.fat, 'g');
  const tr = trendSeries().filter(o => o.date >= iso(addDays(new Date(), -30)));
  if (tr.length < 2) chEmpty('#tWt', 'Weigh in a few mornings to see your trend.');
  else ech('#tWt', { grid: { left: 4, right: 8, top: 10, bottom: 4, containLabel: true }, xAxis: xTime(), yAxis: yVal(v => (+v).toFixed(1)),
    series: [dotS('Weigh-in', tr.map(o => [o.date, +wOut(o.w).toFixed(2)]), t.dot, { symbolSize: 5 }), lineS('Trend', tr.map(o => [o.date, +wOut(o.t).toFixed(2)]), t.accent)],
    tooltip: { trigger: 'axis', valueFormatter: v => `${v} ${wu()}` } });
}
// Old code calls renderStats() after a weigh-in check.
const renderStats = () => { if (curPage() === 'today') renderToday(); };

// ================================================================ ALL INSIGHTS
function renderInsightsPage() {
  const all = allInsights(), areas = ['body', 'nutrition', 'gym', 'running', 'recovery'];
  $('#p-insights').innerHTML = phead('Insights', 'Everything Recomp has noticed in your data, most important first.', rangePicker()) +
    areas.map(a => { const l = all.filter(i => i.area === a || (a === 'recovery' && i.area === 'activity')); return l.length ? `<div class="secttl">${AREA_LABEL[a]}</div>${insightCards(l)}` : ''; }).join('') +
    (all.some(i => i.area === 'general') ? `<div class="secttl">Other</div>${insightCards(all.filter(i => i.area === 'general'))}` : '');
}

// ================================================================ BODY
function renderBody() {
  const from = rangeFrom(), t = TH(), all = trendSeries(), tr = all.filter(o => o.date >= from), fl = [...flaggedWeighIns()].filter(d => d >= from);
  const w = currentWeight(), rate = recentRate(), aim = aimRate(todayIso()), tw = +S.settings.targetWeight;
  const first = tr[0], last = tr[tr.length - 1], ch = first && last ? last.t - first.t : null;
  let proj = 'Set a target weight in Settings';
  if (tw > 0 && rate && Math.sign(tw - w) === Math.sign(rate) && Math.abs(rate) > 0.02) { const wk = (tw - w) / rate; proj = `${addDays(new Date(), Math.round(wk * 7)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`; }
  else if (tw > 0) proj = Math.abs(tw - w) < 0.2 ? 'Reached 🎉' : 'Not on current trend';
  const bfs = Object.keys(S.health).filter(d => d >= from && S.health[d].bf > 0).sort();
  $('#p-body').innerHTML = phead('Body', 'Weight trend, rate of change and where it’s heading. Daily weigh-ins jump around; the trend line is what matters.', rangePicker()) + `
    <div class="grid g4">
      ${kpi('Trend weight', `${fw(w)} <small>${wu()}</small>`, phaseText())}
      ${kpi('Change in range', ch == null ? '–' : `${signed(wOut(ch), 2)} <small>${wu()}</small>`, first ? `since ${fmtShort(first.date)}` : 'no weigh-ins in range')}
      ${kpi('Rate, last 3 weeks', rate == null ? '–' : rateTxt(rate), aim ? `aim ${rateTxt(aim)}` : 'aim: hold steady')}
      ${kpi(tw > 0 ? `Reach ${fw(tw)} ${wu()}` : 'Goal projection', proj, tw > 0 ? `${signed(wOut(tw - w), 1)} ${wu()} to go` : '')}
    </div>
    <div class="box" style="margin-top:14px"><h3>Weight <span class="note"><span style="color:${t.dot}">●</span> weigh-ins · <span style="color:${t.accent}">━</span> trend · <span style="opacity:.6">▒</span> on-track corridor · ◌ looks off (left out)</span></h3><div class="ch lg" id="bWeight"></div></div>
    <div class="grid g2" style="margin-top:14px">
      ${cbox('bWeekly', 'Weekly change', 'trend, end of week vs week before')}
      ${bfs.length >= 2 ? cbox('bBf', 'Body fat', 'from Apple Health') : cbox('bDev', 'Distance from trend', 'how far each weigh-in sits from the trend')}
    </div>
    <div class="secttl">Body insights</div>${insightCards(allInsights('body'))}`;
  if (tr.length < 2) chEmpty('#bWeight', 'Log at least 2 morning weigh-ins to see your chart.');
  else {
    const W = v => +wOut(v).toFixed(2), x0 = first.date, n0 = dayNum(x0), base = first.t;
    // corridor: from the first trend point, at the aim rate (per day), ± a small tolerance that widens with time
    const cd = daysBetween(x0);
    let acc = base; const aimLine = cd.map((d, i) => { if (i) acc += aimRate(d) / 7; return [d, acc]; });
    const lo = aimLine.map(([d, v], i) => [d, W(v - 0.25 - i * 0.004)]), hi = aimLine.map(([d, v], i) => [d, W(v + 0.25 + i * 0.004)]);
    const series = [...bandS('On track', lo, hi, t.good),
      dotS('Weigh-in', tr.map(o => [o.date, W(o.w)]), t.dot, { symbolSize: 6 }),
      dotS('Looks off', fl.map(d => [d, W(+S.logs[d].weight)]), t.warn, { symbol: 'emptyCircle', symbolSize: 9, itemStyle: { color: t.warn, opacity: 1 } }),
      lineS('Trend', tr.map(o => [o.date, W(o.t)]), t.accent, { lineStyle: { width: 3, color: t.accent } })];
    if (rate != null) {
      const ahead = Math.max(7, Math.min(42, Math.round(daysBetween(x0).length * 0.3)));
      const pts = [[last.date, W(last.t)], [iso(addDays(parse(last.date), ahead)), W(last.t + rate * ahead / 7)]];
      series.push(lineS('Projection', pts, t.accent, { smooth: false, lineStyle: { type: 'dashed', width: 1.6, color: t.accent, opacity: .7 } }));
    }
    if (tw > 0) series[series.length - 1].markLine = markY(W(tw), `target ${fw(tw)}`, t.good);
    ech('#bWeight', { xAxis: xTime(), yAxis: yVal(v => (+v).toFixed(1)), dataZoom: zoomIf(tr.length), series,
      tooltip: { trigger: 'axis', formatter: ps => { const d = iso(new Date(ps[0].value[0])); const o = all.find(q => q.date === d), lg = S.logs[d] || {};
        return `${tipHead(d)}${lg.weight > 0 ? `<br>Weigh-in ${fw(lg.weight, 2)} ${wu()}${flaggedWeighIns().has(d) ? ' <span style="color:' + t.warn + '">⚠ looks off</span>' : ''}` : ''}${o ? `<br>Trend <b>${fw(o.t, 2)} ${wu()}</b>` : ''}${intake(d) ? `<br>Ate ${intake(d)} kcal` : ''}`; } } });
  }
  // weekly change bars
  const weeks = weekStartsFrom(from), endT = ws => { const p = all.filter(o => o.date <= iso(addDays(parse(ws), 6))); return p.length ? p[p.length - 1].t : null; };
  const wb = weeks.map(ws => { const a = endT(ws), b = endT(iso(addDays(parse(ws), -7))); return [wkLabel(ws), a != null && b != null && ws <= todayIso() ? +wOut(a - b).toFixed(2) : null, ws]; }).filter(x => x[1] != null);
  if (!wb.length) chEmpty('#bWeekly', 'Needs two weeks of weigh-ins.');
  else ech('#bWeekly', { xAxis: xCat(wb.map(x => x[0])), yAxis: yVal(v => signed(+v, 2), { scale: false }),
    series: [barS('Change', wb.map(([, v, ws]) => ({ value: v, itemStyle: { color: Math.abs(v - wOut(aimRate(ws))) <= wOut(0.15) ? t.good : t.warn, borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })), t.accent,
      { markLine: aim ? markY(+wOut(aim).toFixed(2), 'aim', t.muted) : undefined })],
    tooltip: { trigger: 'axis', valueFormatter: v => `${signed(+v, 2)} ${wu()}` } });
  if (bfs.length >= 2) ech('#bBf', { xAxis: xTime(), yAxis: yVal(v => (+v).toFixed(1) + '%'), series: [lineS('Body fat', bfs.map(d => [d, S.health[d].bf]), t.c[2], { showSymbol: true })], tooltip: { trigger: 'axis', valueFormatter: v => v + '%' } });
  else if (tr.length >= 2) ech('#bDev', { xAxis: xTime(), yAxis: yVal(v => signed(+v, 1), { scale: false }), series: [barS('vs trend', tr.map(o => [o.date, +wOut(o.w - o.t).toFixed(2)]), t.c[3], { barMaxWidth: 10 })],
    tooltip: { trigger: 'axis', valueFormatter: v => `${signed(+v, 2)} ${wu()} vs trend` } });
  else chEmpty('#bDev', 'Needs weigh-ins.');
}

// ================================================================ NUTRITION
function renderNutrition() {
  const from = rangeFrom(), t = TH(), today = todayIso(), days = daysBetween(from).filter(d => d <= today);
  const meas = days.filter(d => intake(d) != null), past = meas.filter(d => d < today);
  const avgIn = meanOf(past.map(intake)), avgT = meanOf(past.map(dayTarget));
  const within = past.filter(d => Math.abs(intake(d) - dayTarget(d)) <= dayTarget(d) * .1).length;
  const pd = days.filter(d => macD(d) && macD(d).p > 0 && d < today), pt = proteinTarget(), ph = pd.filter(d => macD(d).p >= pt * .9).length;
  const hasMicro = days.some(d => HD(d).fiber > 0 || HD(d).sugar > 0 || HD(d).sodium > 0);
  $('#p-nutrition').innerHTML = phead('Nutrition', 'What you ate against your daily targets. Food logged in MyFitnessPal (or any app that writes to Apple Health) comes in automatically.', rangePicker()) + `
    <div class="grid g4">
      ${kpi('Average eaten', avgIn == null ? '–' : `${Math.round(avgIn)} <small>kcal</small>`, avgT ? `target ${Math.round(avgT)} · ${sgn(Math.round(avgIn - avgT))}` : 'nothing logged in range')}
      ${kpi('On target', past.length ? pctTxt(within, past.length) : '–', `${within} of ${past.length} days within ±10%`)}
      ${kpi('Protein', pd.length ? `${Math.round(avg(pd.map(d => macD(d).p)))} <small>g/day</small>` : '–', pd.length ? `target ${pt} g · hit on ${ph} of ${pd.length} days` : 'no macros yet')}
      ${kpi('Logged days', `${meas.length}<small> / ${days.length}</small>`, 'with calories from Health or typed')}
    </div>
    <div class="box" style="margin-top:14px"><h3>Daily calories <span class="note"><span style="color:${t.good}">■</span> within 10% · <span style="color:${t.warn}">■</span> over · <span style="color:${t.c[3]}">■</span> under · ┄ target</span></h3><div class="ch lg" id="nKcal"></div></div>
    <div class="grid g2" style="margin-top:14px">
      ${cbox('nMac', 'Macros', 'grams per day')}
      ${cbox('nProt', 'Protein target hit', `${pt} g a day`, 'sm')}
      ${cbox('nDow', 'By weekday', 'average eaten vs target')}
      ${cbox('nBal', 'Energy balance', 'what your eating predicts vs what the scale did, per week')}
      ${hasMicro ? cbox('nMicro', 'Fibre, sugar & sodium', 'daily') : ''}
    </div>
    <div class="secttl">Nutrition insights</div>${insightCards(allInsights('nutrition'))}`;
  if (!meas.length) chEmpty('#nKcal', 'No calories logged in this range. Connect Apple Health (Settings → Connections) or type them in the Daily log.');
  else ech('#nKcal', { xAxis: xTime(), yAxis: yVal(v => fmtK(+v)), dataZoom: zoomIf(days.length),
    series: [barS('Eaten', meas.map(d => { const v = intake(d), tg = dayTarget(d), c = Math.abs(v - tg) <= tg * .1 ? t.good : v > tg ? t.warn : t.c[3]; return { value: [d, v], itemStyle: { color: c, borderRadius: [4, 4, 0, 0] } }; }), t.accent, { barMaxWidth: 18 }),
      lineS('Target', days.map(d => [d, dayTarget(d)]), t.ink2, { step: 'middle', smooth: false, lineStyle: { type: 'dashed', width: 1.5, color: t.ink2 } })],
    tooltip: { trigger: 'axis', formatter: ps => { const d = iso(new Date(ps[0].value[0])), m = macD(d), v = intake(d), tg = dayTarget(d);
      return `${tipHead(d)}<br>Eaten <b>${v != null ? v : '–'} kcal</b><br>Target ${tg} kcal${v != null ? ` (${sgn(Math.round(v - tg))})` : ''}${m ? `<br>P ${m.p} g · C ${m.c} g · F ${m.f} g` : ''}${isTrainDay(d) ? '<br>Training day' : ''}`; } } });
  const md = days.filter(d => macD(d));
  if (!md.length) chEmpty('#nMac', 'No macros yet. MyFitnessPal Premium writes them to Apple Health.');
  else ech('#nMac', { xAxis: xTime(), yAxis: yVal(v => Math.round(v) + 'g'), dataZoom: zoomIf(md.length),
    series: [['Protein', 'p', t.pro], ['Carbs', 'c', t.carb], ['Fat', 'f', t.fat]].map(([n, k, c], i) => barS(n, md.map(d => [d, macD(d)[k]]), c, { stack: 'm', barMaxWidth: 16, itemStyle: { color: c, borderRadius: i === 2 ? [4, 4, 0, 0] : 0 } })),
    legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    tooltip: { trigger: 'axis', valueFormatter: v => v + ' g' } });
  if (!md.length) chEmpty('#nProt', 'No protein data yet.');
  else calHeat('#nProt', md.map(d => [d, macD(d).p]), iso(addDays(parse(today), -Math.min(days.length, 182) + 1)), today, { fmt: v => `${v} g protein`,
    pieces: [{ lt: pt * .7, color: t.bad, label: '<70%' }, { gte: pt * .7, lt: pt * .9, color: t.warn, label: '70–90%' }, { gte: pt * .9, color: t.good, label: 'hit' }] });
  // weekday pattern
  const dow = [0, 1, 2, 3, 4, 5, 6].map(i => { const ds = past.filter(d => dayIdx(parse(d)) === i); return { e: ds.length ? Math.round(avg(ds.map(intake))) : null, t: ds.length ? Math.round(avg(ds.map(dayTarget))) : null, n: ds.length }; });
  if (past.length < 5) chEmpty('#nDow', 'Needs a week or so of logged food.');
  else ech('#nDow', { xAxis: xCat(DAYS.map(x => x.slice(0, 3))), yAxis: yVal(v => fmtK(+v)),
    series: [barS('Eaten', dow.map(x => x.e), t.accent), lineS('Target', dow.map(x => x.t), t.ink2, { smooth: false, showSymbol: true, lineStyle: { type: 'dashed', color: t.ink2, width: 1.5 } })],
    tooltip: { trigger: 'axis', valueFormatter: v => v == null ? '–' : v + ' kcal' } });
  // energy balance per week: predicted change from (intake − maintenance) vs actual trend change
  const all = trendSeries(), endT = d => { const p = all.filter(o => o.date <= d); return p.length ? p[p.length - 1].t : null; };
  const eb = weekStartsFrom(from).filter(ws => iso(addDays(parse(ws), 6)) < today).map(ws => {
    const ds = span7(ws, 0).filter(d => intake(d) != null); if (ds.length < 4) return null;
    const bal = avg(ds.map(d => intake(d) - (dayTarget(d) - adjustOn(d)))), a = endT(iso(addDays(parse(ws), 6))), b = endT(iso(addDays(parse(ws), -1)));
    return a != null && b != null ? [wkLabel(ws), +wOut(bal * 7 / KCAL_PER_KG).toFixed(2), +wOut(a - b).toFixed(2), Math.round(bal)] : null;
  }).filter(Boolean);
  if (!eb.length) chEmpty('#nBal', 'Needs full weeks with both food and weigh-ins.');
  else ech('#nBal', { xAxis: xCat(eb.map(x => x[0])), yAxis: yVal(v => signed(+v, 2), { scale: false }),
    legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    series: [barS('Predicted from food', eb.map(x => x[1]), t.c[1]), barS('Scale (trend)', eb.map(x => x[2]), t.accent)],
    tooltip: { trigger: 'axis', formatter: ps => `<b>Week of ${ps[0].name}</b><br>Avg balance ${sgn(eb[ps[0].dataIndex][3])} kcal/day<br>Food predicts ${signed(eb[ps[0].dataIndex][1], 2)} ${wu()}<br>Scale trend ${signed(eb[ps[0].dataIndex][2], 2)} ${wu()}` } });
  if (hasMicro) {
    const ser = [['Fibre (g)', 'fiber', t.good], ['Sugar (g)', 'sugar', t.warn], ['Sodium (g)', 'sodium', t.c[4]]].map(([n, k, c]) => lineS(n, days.filter(d => HD(d)[k] > 0).map(d => [d, +(k === 'sodium' && HD(d)[k] > 50 ? HD(d)[k] / 1000 : HD(d)[k]).toFixed(1)]), c, { showSymbol: true, symbolSize: 4 }));
    ech('#nMicro', { xAxis: xTime(), yAxis: yVal(), series: ser, legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 } }, tooltip: { trigger: 'axis' } });
  }
}

// ================================================================ GYM
function renderGym() {
  const from = rangeFrom(), t = TH(), today = todayIso(), ws = S.workouts.filter(w => w.d >= from && w.d <= today);
  const weeks = Math.max(1, (dayNum(today) - dayNum(from) + 1) / 7), sets = sum(ws.map(w => w.s.filter(s => !/^w/i.test(s[3])).length));
  const prs = prList(from, 200), mins = ws.filter(w => w.m > 0);
  $('#gymTop').innerHTML = phead('Gym', 'Sessions from Hevy (or Strong), volume per muscle and strength over time.', rangePicker()) + `
    <div class="grid g4">
      ${kpi('Sessions', ws.length, `${(ws.length / weeks).toFixed(1)} a week`)}
      ${kpi('Working sets', sets, `${Math.round(sets / weeks)} a week`)}
      ${kpi('New bests', prs.length, prs.length ? `latest: ${esc(prs[0].ex)}` : 'none in this range')}
      ${kpi('Session length', mins.length ? `${Math.round(avg(mins.map(w => w.m)))} <small>min</small>` : '–', 'average')}
    </div>
    <div class="grid g2" style="margin-top:14px">
      ${cbox('gSets', 'Sets per muscle', 'working sets per week · 10–20 is the usual growth range')}
      ${cbox('gHeat', 'Sessions', 'working sets per day', 'sm')}
    </div>
    <div class="secttl">Gym insights</div>${insightCards(allInsights('gym'))}`;
  const exs = [...new Set(splitRows().flatMap(r => r.exercises.map(e => e.ex)))], idx = exerciseIndex();
  $('#gymBottom').innerHTML = `<div class="secttl">Strength</div>
    <div class="grid g2">${cbox('gIdx', 'Strength index', 'average top set across your split, as % of each lift’s best', 'sm')}
      <div class="box"><h3>Personal bests <span class="note">estimated 1-rep max</span></h3>${prs.length ? `<div style="max-height:200px;overflow:auto">${prs.slice(0, 30).map(p => `<div class="tline"><div class="ti">🏅</div><div class="tt">${esc(p.ex)}<small>${fmtW(p.w)}×${p.r} · e1RM ${Math.round(p.v)} (was ${Math.round(p.prev)})</small></div><span class="note">${fmtShort(p.d)}</span></div>`).join('')}</div>` : '<div class="empty2">No new bests in this range yet.</div>'}</div></div>
    <div class="box" style="margin-top:14px"><h3>Every lift in your split <span class="note">top-set e1RM per session</span></h3>
      ${exs.length ? `<div class="minis">${exs.map((ex, i) => { const h = (idx[ex] || []).filter(x => x.d >= from), a = h.length ? topE1(h[0].sets) : 0, b = h.length ? topE1(h[h.length - 1].sets) : 0;
        return `<div class="mini"><div class="mt">${esc(ex)}<span>${h.length > 1 && a ? `${b >= a ? '<span class="good">▲' : '<span class="warn">▼'} ${Math.abs((b / a - 1) * 100).toFixed(0)}%</span>` : ''}</span></div><div class="ch" id="gm${i}"></div></div>`; }).join('')}</div>` : '<div class="empty2">Connect Hevy (Settings → Connections) to see your lifts.</div>'}
    </div>`;
  // weekly sets per muscle (stacked)
  const wks = weekStartsFrom(from).filter(w => w <= today), groups = {}, cnt = {};
  for (const w of ws) for (const [e, , , so] of w.s) if (!/^w/i.test(so)) { const mg = muscleOf(e), k = wkOf(w.d); (cnt[mg] ||= {})[k] = (cnt[mg][k] || 0) + 1; groups[mg] = (groups[mg] || 0) + 1; }
  const mgs = Object.keys(groups).sort((a, b) => groups[b] - groups[a]);
  if (!mgs.length) chEmpty('#gSets', 'No gym sessions in this range.');
  else if (wks.length <= 2) {
    const v = mgs.map(m => +(groups[m] / weeks).toFixed(1));
    ech('#gSets', { grid: { left: 8, right: 30, top: 10, bottom: 6, containLabel: true }, xAxis: yVal(null, { scale: false }), yAxis: xCat(mgs, { inverse: true }),
      series: [barS('Sets/week', v, t.accent, { itemStyle: { color: t.accent, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: t.ink2, fontSize: 11 }, markArea: { silent: true, itemStyle: { color: t.good, opacity: .08 }, data: [[{ xAxis: 10 }, { xAxis: 20 }]] } })] });
  } else ech('#gSets', { xAxis: xCat(wks.map(wkLabel)), yAxis: yVal(v => Math.round(v), { scale: false }),
    legend: { show: true, type: 'scroll', top: 0, textStyle: { color: t.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10 }, grid: { top: 34 },
    series: mgs.map((m, i) => barS(m, wks.map(k => (cnt[m] || {})[k] || 0), t.c[i % 8], { stack: 's', itemStyle: { color: t.c[i % 8], borderRadius: 0 } })),
    tooltip: { trigger: 'axis', formatter: ps => `<b>Week of ${ps[0].name}</b><br>${ps.filter(p => p.value).sort((a, b) => b.value - a.value).map(p => `${p.marker}${p.seriesName}: ${p.value}`).join('<br>')}` } });
  const perDay = {}; for (const w of ws) perDay[w.d] = (perDay[w.d] || 0) + w.s.filter(s => !/^w/i.test(s[3])).length;
  if (!ws.length) chEmpty('#gHeat', 'No sessions in this range.');
  else calHeat('#gHeat', Object.entries(perDay), iso(addDays(parse(today), -Math.min(daysBetween(from).length, 182) + 1)), today, { fmt: v => `${v} working sets`,
    pieces: [{ gt: 0, lt: 12, color: t.c[0] + '88', label: '<12' }, { gte: 12, lt: 20, color: t.c[0] + 'cc', label: '12–19' }, { gte: 20, color: t.c[0], label: '20+' }] });
  const ss = strengthSeries(from);
  if (ss.length < 2) chEmpty('#gIdx', 'Needs a few weeks of sessions.');
  else ech('#gIdx', { xAxis: xTime(), yAxis: yVal(v => Math.round(v) + '%'), series: [lineS('Strength', ss.map(p => [fromNum(p.x), +p.y.toFixed(1)]), t.accent, { showSymbol: true, markLine: markY(100, 'your best', t.good), areaStyle: { color: t.accent, opacity: .08 } })],
    tooltip: { trigger: 'axis', formatter: ps => `<b>Week of ${fmtShort(iso(new Date(ps[0].value[0])))}</b><br>${ps[0].value[1]}% of best` } });
  exs.forEach((ex, i) => { const h = (idx[ex] || []).filter(x => x.d >= from).map(x => [x.d, +topE1(x.sets).toFixed(1), x.sets]).filter(p => p[1] > 0);
    if (!h.length) return chEmpty('#gm' + i, 'Not in this range');
    sparkLine('#gm' + i, h.map(p => [p[0], p[1]]), t.c[i % 8], { tip: p => { const x = h[p.dataIndex]; return `${fmtShort(x[0])}<br>e1RM <b>${Math.round(x[1])}</b><br>${x[2].filter(s => !/^w/i.test(s[2])).map(([w, r]) => `${fmtW(w)}×${r}`).join(', ')}`; } }); });
}

// ================================================================ RECOVERY
function renderRecovery() {
  const from = rangeFrom(), t = TH(), today = todayIso(), days = daysBetween(from).filter(d => d <= today), hd = days.filter(d => S.health[d]);
  const rd = readiness(), w7 = daysBack(7, 0), s7 = meanOf(w7.map(sleepH).filter(x => x != null));
  const base = daysBetween(iso(addDays(new Date(), -30)), iso(addDays(new Date(), -3)));
  const cmp = (f, unit, good, dec = 0) => { const a = meanOf(daysBack(7, 0).map(f).filter(x => x > 0)), b = meanOf(base.map(f).filter(x => x > 0));
    return [a == null ? '–' : `${a.toFixed(dec)} <small>${unit}</small>`, a != null && b != null ? `${upDown(a - b, good)} ${signed(a - b, dec)} vs your normal (${b.toFixed(dec)})` : '7-day average']; };
  const [rhrV, rhrC] = cmp(d => HD(d).rhr, 'bpm', false), [hrvV, hrvC] = cmp(d => HD(d).hrv, 'ms', true), [stV, stC] = cmp(d => HD(d).steps, '', true);
  if (!hd.length) {
    $('#p-recovery').innerHTML = phead('Recovery', 'Sleep, heart and daily activity from Apple Health.', rangePicker()) +
      `<div class="box"><div class="empty2">No Apple Health data in this range. Set it up in <a href="#/settings" class="link">Settings → Connections</a>.</div></div>`;
    return;
  }
  const hasBed = hd.some(d => HD(d).sleep && HD(d).sleep.start);
  $('#p-recovery').innerHTML = phead('Recovery', 'Sleep, heart and daily activity from Apple Health, and how ready you are to train.', rangePicker()) + `
    <div class="grid g4">
      ${kpi('Readiness today', rd ? `${rd.score}<small> /100</small>` : '–', rd ? rd.advice.split('.')[0] + '.' : 'needs a week of data')}
      ${kpi('Sleep, last 7 nights', fmtHM(s7), s7 == null ? 'no sleep data' : s7 >= 7 ? '<span class="good">✓ enough</span>' : '<span class="warn">under 7 h</span>')}
      ${kpi('Resting HR', rhrV, rhrC)}
      ${kpi('HRV', hrvV, hrvC)}
    </div>
    <div class="grid g2" style="margin-top:14px">
      ${cbox('rReady', 'Readiness', 'daily score from HRV, resting HR and sleep vs your 4-week normal')}
      <div class="box"><h3>Sleep <span class="note"><span style="color:${t.deep}">■</span> deep <span style="color:${t.core}">■</span> core <span style="color:${t.rem}">■</span> REM <span style="color:${t.awake}">■</span> awake</span></h3><div class="ch" id="rSleep"></div></div>
      ${cbox('rRhr', 'Resting heart rate', 'lower is better · band = your normal')}
      ${cbox('rHrv', 'Heart rate variability', 'higher is better · band = your normal')}
      ${hasBed ? cbox('rBed', 'Sleep timing', 'bedtime and wake-up, consistency matters') : ''}
      ${cbox('rSteps', 'Steps', stC.replace('7-day average', 'daily'))}
      ${cbox('rActive', 'Active energy', 'kcal burned on top of resting, per day')}
      ${hd.some(d => HD(d).rr > 0) ? cbox('rRr', 'Breathing rate', 'during sleep; a rise with resting HR can mean illness coming') : ''}
    </div>
    <div class="secttl">Recovery insights</div>${insightCards(allInsights('recovery'))}`;
  const rs = days.map(d => [d, (readiness(d) || {}).score]).filter(p => p[1] != null);
  if (rs.length < 2) chEmpty('#rReady', 'Needs about a week of HRV, resting HR and sleep.');
  else ech('#rReady', { xAxis: xTime(), yAxis: yVal(null, { min: 0, max: 100, scale: false }), visualMap: { show: false, dimension: 1, pieces: [{ lt: 50, color: t.bad }, { gte: 50, lt: 75, color: t.warn }, { gte: 75, color: t.good }] },
    series: [lineS('Readiness', rs, t.accent, { showSymbol: true, symbolSize: 5, lineStyle: { width: 2.4 } })], tooltip: { trigger: 'axis', valueFormatter: v => v + ' / 100' } });
  const sd = hd.filter(d => sleepH(d) != null);
  if (!sd.length) chEmpty('#rSleep', 'No sleep data yet. Wear your watch to bed with Sleep tracking on.');
  else {
    const S2 = (k, n, c, last) => barS(n, sd.map(d => { const s = HD(d).sleep; return [d, +((k === 'core' && !(s.deep || s.rem || s.core) ? s.total : s[k]) || 0).toFixed(2)]; }), c, { stack: 'sl', barMaxWidth: 16, itemStyle: { color: c, borderRadius: last ? [4, 4, 0, 0] : 0 } });
    const ser = [S2('deep', 'Deep', t.deep), S2('core', 'Core', t.core), S2('rem', 'REM', t.rem), S2('awake', 'Awake', t.awake, true)];
    ser[0].markLine = markY(7, '7 h', t.muted);
    ech('#rSleep', { xAxis: xTime(), yAxis: yVal(v => v + 'h', { scale: false }), series: ser, dataZoom: zoomIf(sd.length),
      tooltip: { trigger: 'axis', formatter: ps => { const d = iso(new Date(ps[0].value[0])), s = HD(d).sleep; return `${tipHead(d)}<br>Asleep <b>${fmtHM(s.total)}</b>${s.deep || s.rem ? `<br>Deep ${fmtHM(s.deep)} · REM ${fmtHM(s.rem)} · Core ${fmtHM(s.core)}` : ''}${s.awake ? `<br>Awake ${Math.round(s.awake * 60)} min` : ''}`; } } });
  }
  const baseBand = (id, f, name, unit, color, good) => {
    const pts = series(hd, d => HD(d)[f] > 0 ? +HD(d)[f].toFixed(1) : null);
    if (pts.length < 2) return chEmpty(id, `No ${name.toLowerCase()} yet.`);
    const roll = rolling(pts, 28), sdv = pts.map((p, i) => sdOf(pts.slice(Math.max(0, i - 27), i + 1).map(q => q[1])) || 0);
    ech(id, { xAxis: xTime(), yAxis: yVal(v => Math.round(v)), dataZoom: zoomIf(pts.length),
      series: [...bandS('Normal', roll.map((p, i) => [p[0], +(p[1] - sdv[i]).toFixed(1)]), roll.map((p, i) => [p[0], +(p[1] + sdv[i]).toFixed(1)]), t.muted),
        dotS(name, pts, color, { symbolSize: 6 }), lineS('7-day avg', rolling(pts, 7).map(p => [p[0], +p[1].toFixed(1)]), color)],
      tooltip: { trigger: 'axis', formatter: ps => { const d = iso(new Date(ps[0].value[0])), v = HD(d)[f]; return `${tipHead(d)}<br>${name} <b>${v ? Math.round(v) + ' ' + unit : '–'}</b>`; } } });
  };
  baseBand('#rRhr', 'rhr', 'Resting HR', 'bpm', t.bad);
  baseBand('#rHrv', 'hrv', 'HRV', 'ms', t.good);
  if (hasBed) {
    const hrs = ms => { const x = new Date(ms); let h = x.getHours() + x.getMinutes() / 60; return h < 12 ? h + 24 : h; };   // bedtime after midnight → 24+
    const bd = hd.filter(d => HD(d).sleep && HD(d).sleep.start && HD(d).sleep.end);
    const fmtClock = v => { const h = Math.floor(v % 24), m = Math.round((v % 1) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    ech('#rBed', { xAxis: xTime(), yAxis: yVal(fmtClock, { inverse: true }),
      series: [dotS('Bedtime', bd.map(d => [d, +hrs(HD(d).sleep.start).toFixed(2)]), t.rem), dotS('Wake-up', bd.map(d => [d, +(hrs(HD(d).sleep.end) + (hrs(HD(d).sleep.end) < hrs(HD(d).sleep.start) ? 24 : 0)).toFixed(2)]), t.warn)],
      legend: { show: true, top: 0, right: 0, textStyle: { color: t.muted, fontSize: 11 } }, tooltip: { trigger: 'axis', valueFormatter: v => fmtClock(v) } });
  }
  const bars = (id, f, name, color, fmt) => { const pts = series(hd, d => HD(d)[f] > 0 ? Math.round(HD(d)[f]) : null);
    if (!pts.length) return chEmpty(id, `No ${name.toLowerCase()} data yet.`);
    ech(id, { xAxis: xTime(), yAxis: yVal(v => fmtK(+v), { scale: false }), dataZoom: zoomIf(pts.length), series: [barS(name, pts, color, { barMaxWidth: 14, markLine: markY(Math.round(avg(pts.map(p => p[1]))), 'avg', t.muted) })],
      tooltip: { trigger: 'axis', valueFormatter: fmt } }); };
  bars('#rSteps', 'steps', 'Steps', t.c[1], v => Math.round(v).toLocaleString() + ' steps');
  bars('#rActive', 'active', 'Active energy', t.warn, v => Math.round(v) + ' kcal');
  if ($('#rRr')) { const pts = series(hd, d => HD(d).rr > 0 ? +HD(d).rr.toFixed(1) : null); ech('#rRr', { xAxis: xTime(), yAxis: yVal(), series: [lineS('Breathing rate', pts, t.c[5], { showSymbol: true, symbolSize: 4 })], tooltip: { trigger: 'axis', valueFormatter: v => v + ' /min' } }); }
}

// ================================================================ RECAP
let recapMonth = null;
function monthsWithData() {
  const s = new Set([...Object.keys(S.logs), ...Object.keys(S.health), ...S.workouts.map(w => w.d)].map(d => d.slice(0, 7)));
  return [...s].filter(m => m <= todayIso().slice(0, 7)).sort().reverse();
}
function renderRecap() {
  const ms = monthsWithData();
  if (!ms.length) { $('#p-recap').innerHTML = phead('Monthly recap', 'Your month in review.') + '<div class="box"><div class="empty2">Nothing recorded yet.</div></div>'; return; }
  if (!recapMonth || !ms.includes(recapMonth)) recapMonth = new Date().getDate() <= 5 && ms[1] ? ms[1] : ms[0];
  const m = recapMonth, first = m + '-01', lastD = iso(addDays(parse(iso(new Date(+m.slice(0, 4), +m.slice(5, 7), 1))), -1)), end = lastD < todayIso() ? lastD : todayIso();
  const days = daysBetween(first, end), t = TH(), name = parse(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const tr = trendSeries().filter(o => o.date >= first && o.date <= end), wch = tr.length >= 2 ? tr[tr.length - 1].t - tr[0].t : null;
  const ws = S.workouts.filter(w => w.d >= first && w.d <= end), runs = runsList().filter(r => r.d >= first && r.d <= end), sp = sportList().filter(s => s.d >= first && s.d <= end);
  const kc = days.filter(d => d < todayIso() && intake(d) != null), sl = days.map(sleepH).filter(x => x != null), prs = prList(first, 500).filter(p => p.d <= end);
  const wi = days.filter(d => LD(d).weight > 0).length, pt = proteinTarget(), pdays = days.filter(d => macD(d) && macD(d).p > 0 && d < todayIso());
  const planned = days.filter(d => { const p = plannedActs(d); return d < todayIso() && (p.gym || p.train || p.match || p.run > 0); }), doneP = planned.filter(d => { const p = plannedActs(d), l = LD(d); return (!p.gym || l.gym) && (!p.train || l.train) && (!p.match || l.match); });
  const habits = [
    ['Weighed in', wi, days.length],
    ['Calories on target', kc.filter(d => Math.abs(intake(d) - dayTarget(d)) <= dayTarget(d) * .1).length, kc.length],
    ['Protein hit', pdays.filter(d => macD(d).p >= pt * .9).length, pdays.length],
    ['Slept 7 h+', sl.filter(h => h >= 7).length, sl.length],
    ['Trained to plan', doneP.length, planned.length]
  ].filter(h => h[2] > 0);
  // highlights
  const hl = [];
  const big = prs.map(p => ({ ...p, g: p.v / p.prev - 1 })).sort((a, b) => b.g - a.g)[0];
  if (big) hl.push(['🏅', 'Biggest lift jump', `${esc(big.ex)}: e1RM ${Math.round(big.prev)} → ${Math.round(big.v)} (+${Math.round(big.g * 100)}%)`]);
  if (runs.length) { const lg = runs.reduce((a, r) => r.km > a.km ? r : a); hl.push(['🏃', 'Longest run', `${fd(lg.km)} ${du()} on ${fmtShort(lg.d)}`]); }
  const sd = days.filter(d => sleepH(d) != null); if (sd.length) { const b = sd.reduce((a, d) => sleepH(d) > sleepH(a) ? d : a); hl.push(['😴', 'Best night', `${fmtHM(sleepH(b))} on ${fmtShort(b)}`]); }
  let run = 0, best = 0; for (const d of days) { run = LD(d).weight > 0 ? run + 1 : 0; best = Math.max(best, run); } if (best >= 3) hl.push(['🔥', 'Longest weigh-in streak', `${best} days`]);
  const vo = days.filter(d => HD(d).vo2 > 0); if (vo.length >= 2) hl.push(['🫁', 'VO2 max', `${HD(vo[0]).vo2.toFixed(1)} → ${HD(vo[vo.length - 1]).vo2.toFixed(1)}`]);
  const rhrs = days.map(d => HD(d).rhr).filter(x => x > 0); if (rhrs.length >= 5) hl.push(['❤️', 'Lowest resting HR', `${Math.round(Math.min(...rhrs))} bpm`]);
  $('#p-recap').innerHTML = phead(`${name}`, 'Your month in review.', `<select id="recapPick" class="btn">${ms.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${parse(x + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>`).join('')}</select>`) + `
    <div class="grid g4">
      ${kpi('Weight', wch == null ? '–' : `${signed(wOut(wch), 2)} <small>${wu()}</small>`, tr.length ? `trend ${fw(tr[0].t)} → ${fw(tr[tr.length - 1].t)}` : 'no weigh-ins')}
      ${kpi('Gym sessions', ws.length, `${sum(ws.map(w => w.s.filter(s => !/^w/i.test(s[3])).length))} working sets · ${prs.length} new best${prs.length === 1 ? '' : 's'}`)}
      ${kpi('Running', `${fd(sum(runs.map(r => r.km)))} <small>${du()}</small>`, `${runs.length} run${runs.length === 1 ? '' : 's'}${sp.length ? ` · ${sp.length} ${esc(sportName().toLowerCase())} session${sp.length === 1 ? '' : 's'}` : ''}`)}
      ${kpi('Average day', kc.length ? `${Math.round(avg(kc.map(intake)))} <small>kcal</small>` : '–', `${sl.length ? `sleep ${fmtHM(avg(sl))}` : 'no sleep data'}`)}
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="box"><h3>Habit scores</h3>${habits.length ? habits.map(([n, a, b]) => `<div class="habit"><span>${n}</span><div class="bar"><i style="width:${a / b * 100}%;background:${a / b >= .8 ? t.good : a / b >= .5 ? t.accent : t.warn}"></i></div><b style="text-align:right">${Math.round(a / b * 100)}%</b></div>`).join('') : '<div class="empty2">Nothing to score yet.</div>'}</div>
      <div class="box"><h3>Highlights</h3>${hl.length ? hl.map(([i, a, b]) => `<div class="tline"><div class="ti">${i}</div><div class="tt">${a}<small>${b}</small></div></div>`).join('') : '<div class="empty2">No highlights yet.</div>'}</div>
      ${cbox('rcW', 'Weight trend', name, 'sm')}
      ${cbox('rcAct', 'Training days', 'gym, runs and sport', 'sm')}
    </div>`;
  if (tr.length < 2) chEmpty('#rcW', 'Not enough weigh-ins this month.');
  else ech('#rcW', { xAxis: xTime(), yAxis: yVal(v => (+v).toFixed(1)), series: [dotS('Weigh-in', tr.map(o => [o.date, +wOut(o.w).toFixed(2)]), t.dot, { symbolSize: 5 }), lineS('Trend', tr.map(o => [o.date, +wOut(o.t).toFixed(2)]), t.accent)], tooltip: { trigger: 'axis', valueFormatter: v => v + ' ' + wu() } });
  const act = days.map(d => { const l = LD(d); return [d, (l.gym ? 1 : 0) + (l.train || l.match ? 1 : 0) + (l.run > 0 ? 1 : 0)]; }).filter(p => p[1] > 0);
  calHeat('#rcAct', act, first, lastD, { fmt: v => `${v} session${v > 1 ? 's' : ''}`, pieces: [{ value: 1, color: t.c[0] + '99', label: '1' }, { gte: 2, color: t.c[0], label: '2+' }] });
}

// ================================================================ SETTINGS EXTRAS
const CONNS = [
  ['health', 'Apple Health', 'Weigh-ins, food, sleep, heart, steps and workouts via Health Auto Export.', true],
  ['hevy', 'Hevy', 'Gym sessions, sets and reps.', true],
  ['strava', 'Strava', 'Runs and sport with splits, laps and interval detection.'],
  ['strong', 'Strong CSV import', 'For workout history from the Strong app.'],
  ['excel', 'Excel auto-backup', 'Saves everything to an .xlsx file on every change.'],
  ['json', 'Plain JSON backup', 'Manual export and import.']
];
function connOn(k) {
  const c = S.settings.connections || {};
  if (k === 'health' || k === 'hevy') return true;
  if (k in c) return !!c[k];
  return k === 'strava' ? !!(SV.refresh || SV.clientId) : k === 'excel' ? !!xlHandle : false;
}
function connStatus(k) {
  if (k === 'health') return HX.url ? `<span class="pill2 good">connected</span>` : '<span class="pill2">not set up</span>';
  if (k === 'hevy') return HV.key ? `<span class="pill2 good">connected</span>` : '<span class="pill2">not set up</span>';
  if (k === 'strava') return SV.refresh ? `<span class="pill2 good">connected</span>` : '';
  if (k === 'excel') return xlHandle ? `<span class="pill2 good">linked</span>` : '';
  return '';
}
function renderConnections() {
  $('#connList').innerHTML = `<p class="help" style="margin:0 0 4px">Apple Health and Hevy cover most people. Switch on the others only if you use them; their data is kept either way.</p>` +
    CONNS.map(([k, n, d, fixed]) => `<div class="conn"><div class="cn"><b>${n}</b> ${connStatus(k)}<small>${d}</small></div>${fixed ? '<button class="link" data-scroll="conn-' + k + '">set up ↓</button>' : `<label class="switch"><input type="checkbox" data-conn-t="${k}" ${connOn(k) ? 'checked' : ''}><span></span></label>`}</div>`).join('');
  document.querySelectorAll('.connbox').forEach(b => { b.id = 'conn-' + b.dataset.conn; b.classList.toggle('hidden', !connOn(b.dataset.conn)); });
}
function applyTheme() {
  const th = S.settings.theme || 'auto';
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
}
function renderAppearance() {
  const th = S.settings.theme || 'auto';
  $('#appearance').innerHTML = `<label class="f">Theme<select data-ap="theme">${[['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, n]) => `<option value="${v}" ${th === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="f">Default date range for charts<select data-ap="dashRange">${RANGES.map(([n, l]) => `<option value="${n}" ${rangeDays() === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
}
