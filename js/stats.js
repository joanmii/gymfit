// =========================================================
// Pestaña Estadísticas
// =========================================================
import { bars, hbars, ring, heatmap } from './charts.js';
import { chev } from './calendar.js';
import { EX } from './exercises.js';
import { progressBlock } from './workout.js';
import {
  state, MUSCLES, M, MONTHS, MONTHS_SHORT, WD_SHORT, NEGLECT_DAYS,
  keyOf, fromKey, today, addDays, startOfWeek, daysBetween, weekStreaks,
} from './utils.js';

let root;
let period = 'week';  // 'week' | 'month' | 'year'
let offset = 0;       // 0 = actual, -1 = anterior...
let progEx = null;    // ejercicio elegido en "Progreso por ejercicio"

export function initStats(el) {
  root = el;
  root.addEventListener('click', e => {
    const p = e.target.closest('[data-period]');
    if (p) { period = p.dataset.period; offset = 0; return renderStats(); }
    const nav = e.target.closest('[data-pnav]');
    if (nav) { offset += Number(nav.dataset.pnav); return renderStats(); }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'prog-ex') { progEx = e.target.value; renderStats(); }
  });
}

function getRange() {
  const t = today();
  if (period === 'week') {
    const s = addDays(startOfWeek(t), 7 * offset);
    const e = addDays(s, 6);
    const label = offset === 0 ? 'Esta semana'
      : `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;
    return { s, e, label };
  }
  if (period === 'month') {
    const s = new Date(t.getFullYear(), t.getMonth() + offset, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    return { s, e, label: `${MONTHS[s.getMonth()]} ${s.getFullYear()}` };
  }
  const s = new Date(t.getFullYear() + offset, 0, 1);
  const e = new Date(s.getFullYear(), 11, 31);
  return { s, e, label: String(s.getFullYear()) };
}

export function renderStats() {
  const { s, e, label } = getRange();
  const t = today();
  const target = state.settings.weeklyTarget;
  const W = state.workouts;

  // Datos del periodo
  const inRange = [];
  for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
    const w = W.get(keyOf(d));
    if (w) inRange.push(w);
  }
  const trained = inRange.filter(w => w.attended);
  const totalDays = daysBetween(s, e) + 1;
  const elapsed = s > t ? 0 : daysBetween(s, e < t ? e : t) + 1;
  const goal = period === 'week' ? target : Math.round(target * totalDays / 7);
  const attendance = elapsed ? Math.round((trained.length / elapsed) * 100) : 0;
  const minutes = trained.reduce((a, w) => a + (w.duration || 0), 0);
  const { current, best } = weekStreaks(W, target);

  // Gráfica principal
  let chartTitle, items;
  if (period === 'week') {
    chartTitle = 'Grupos por día';
    items = WD_SHORT.map((wd, i) => {
      const d = addDays(s, i);
      const w = W.get(keyOf(d));
      const segs = w?.attended
        ? ((w.groups || []).length ? w.groups.map(g => ({ color: M[g]?.color || 'var(--accent)', value: 1 })) : [{ color: 'var(--accent)', value: 1 }])
        : [];
      return { label: wd, value: segs.length, segments: segs, highlight: +d === +t, display: segs.length ? '' : '' };
    });
  } else if (period === 'month') {
    chartTitle = 'Días entrenados por semana';
    items = [];
    let i = 1;
    for (let ws = startOfWeek(s); ws <= e; ws = addDays(ws, 7), i++) {
      let c = 0;
      for (let j = 0; j < 7; j++) {
        const d = addDays(ws, j);
        if (d >= s && d <= e && W.get(keyOf(d))?.attended) c++;
      }
      items.push({ label: `S${i}`, value: c, highlight: t >= ws && t < addDays(ws, 7) });
    }
  } else {
    chartTitle = 'Días entrenados por mes';
    items = MONTHS_SHORT.map((mn, mi) => {
      const c = trained.filter(w => fromKey(w.date).getMonth() === mi).length;
      return { label: mn.charAt(0).toUpperCase(), value: c, highlight: s.getFullYear() === t.getFullYear() && mi === t.getMonth() };
    });
  }

  // Reparto por grupo muscular
  const counts = {};
  trained.forEach(w => (w.groups || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
  const groupRows = MUSCLES.filter(g => counts[g.id]).map(g => ({ name: g.name, color: g.color, value: counts[g.id] }))
    .sort((a, b) => b.value - a.value);

  root.innerHTML = `
    <h1 class="title">Estadísticas</h1>
    <div class="seg wide">
      <button data-period="week" class="${period === 'week' ? 'on' : ''}">Semana</button>
      <button data-period="month" class="${period === 'month' ? 'on' : ''}">Mes</button>
      <button data-period="year" class="${period === 'year' ? 'on' : ''}">Año</button>
    </div>
    <div class="period-nav">
      <button class="icon-btn" data-pnav="-1" aria-label="Anterior">${chev('l')}</button>
      <div class="lbl">${label}</div>
      <button class="icon-btn" data-pnav="1" ${offset >= 0 ? 'disabled' : ''} aria-label="Siguiente">${chev('r')}</button>
    </div>

    <div class="card kpi-hero">
      <div class="ring-wrap">
        ${ring(trained.length, goal, { size: 118, stroke: 13 })}
        <div class="ring-center"><b>${trained.length}</b><span>de ${goal}</span></div>
      </div>
      <div>
        <div class="kpi-label">Días entrenados</div>
        <div class="kpi-value" style="font-size:28px">${goal ? Math.min(100, Math.round(trained.length / goal * 100)) : 0}<small>% objetivo</small></div>
        <div class="kpi-sub">${trained.length >= goal && goal ? '¡Objetivo cumplido! 🎉' : `Te faltan ${Math.max(0, goal - trained.length)} días`}</div>
      </div>
    </div>

    <div class="kpis">
      <div class="card"><div class="kpi-label">Asistencia</div><div class="kpi-value">${attendance}<small>%</small></div><div class="kpi-sub">de los días transcurridos</div></div>
      <div class="card"><div class="kpi-label">Tiempo total</div><div class="kpi-value">${minutes >= 60 ? (minutes / 60).toFixed(1).replace('.', ',') : minutes}<small>${minutes >= 60 ? 'h' : 'min'}</small></div><div class="kpi-sub">${trained.length ? `${Math.round(minutes / trained.length) || 0} min de media` : 'sin datos'}</div></div>
      <div class="card"><div class="kpi-label">Racha actual</div><div class="kpi-value">${current}<small>sem</small></div><div class="kpi-sub">cumpliendo ${target} días/sem</div></div>
      <div class="card"><div class="kpi-label">Mejor racha</div><div class="kpi-value">${best}<small>sem</small></div><div class="kpi-sub">tu récord 🏆</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>${chartTitle}</h3></div>
      ${bars(items, { height: 160, goal: period === 'month' ? target : null, showValues: period !== 'week' })}
    </div>

    <div class="card">
      <div class="card-head"><h3>Grupos musculares</h3><span class="muted small">sesiones</span></div>
      ${groupRows.length ? hbars(groupRows) : `<div class="empty"><span class="e">📊</span><b>Sin datos todavía</b>Registra entrenos en el calendario.</div>`}
    </div>

    ${period === 'year' ? `
    <div class="card">
      <div class="card-head"><h3>Tu año de un vistazo</h3></div>
      <div class="heatmap-wrap" id="heat">${heatmap(s.getFullYear(), d => {
        const w = W.get(keyOf(d));
        if (!w) return 0;
        if (!w.attended) return -1;
        return Math.max(1, Math.min(4, (w.groups || []).length || 1));
      })}</div>
      <div class="muted small" style="margin-top:8px">Más intenso = más grupos entrenados ese día.</div>
    </div>` : ''}

    ${progressCard()}

    ${neglectAlerts()}
  `;

  const heat = root.querySelector('#heat');
  if (heat) heat.scrollLeft = heat.scrollWidth;
}

// Evolución del peso en cada ejercicio (entrenos hechos en modo entrenar)
function progressCard() {
  const recent = [...state.sessions].sort((a, b) => b.startedAt - a.startedAt);
  const done = [...new Set(recent.flatMap(s => s.items.map(i => i.ex)))].filter(id => EX[id]);
  if (!done.length) {
    return `<div class="card"><div class="card-head"><h3>Progreso por ejercicio</h3></div>
      <div class="empty"><span class="e">📈</span><b>Aún no hay entrenos registrados</b>Pulsa "Empezar entreno" en una rutina y aquí verás cómo suben tus pesos.</div></div>`;
  }
  if (!done.includes(progEx)) progEx = done[0];
  const options = [...done].sort((a, b) => EX[a].name.localeCompare(EX[b].name, 'es'))
    .map(id => `<option value="${id}" ${id === progEx ? 'selected' : ''}>${EX[id].name}</option>`).join('');
  return `<div class="card">
    <div class="card-head"><h3>Progreso por ejercicio</h3></div>
    <label class="field" style="margin:0 0 14px"><select id="prog-ex">${options}</select></label>
    ${progressBlock(progEx)}
  </div>`;
}

// Avisos de grupos musculares descuidados (solo los que sueles entrenar)
function neglectAlerts() {
  const last = {};
  for (const w of state.workouts.values()) {
    if (!w.attended) continue;
    for (const g of w.groups || []) if (!last[g] || w.date > last[g]) last[g] = w.date;
  }
  const t = today();
  const alerts = Object.entries(last)
    .map(([g, d]) => ({ g, days: daysBetween(fromKey(d), t) }))
    .filter(a => a.days >= NEGLECT_DAYS && M[a.g] && a.g !== 'cardio')
    .sort((a, b) => b.days - a.days)
    .slice(0, 3);
  if (!alerts.length) return '';
  return `<div class="section-label">Atención</div>` + alerts.map(a =>
    `<div class="alert"><span class="e">⚠️</span><div>Llevas <b>${a.days} días</b> sin entrenar <b>${M[a.g].name.toLowerCase()}</b>.</div></div>`
  ).join('');
}
