// =========================================================
// Pestaña Calendario
// =========================================================
import { db } from './db.js';
import { openSheet, closeSheet } from './sheet.js';
import { routineGroups } from './routines.js';
import { sessionStats, fmtKg } from './workout.js';
import {
  state, MUSCLES, M, MONTHS, WD_SHORT, keyOf, fromKey, today, fmtLong, cap,
  esc, toast, haptic, weekStreaks, ringGradient, startOfWeek, addDays,
} from './utils.js';

let root;
let viewMonth = (() => { const t = today(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
let animDir = 0;
let popKey = null;

export function initCalendar(el) {
  root = el;
  root.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return changeMonth(Number(nav.dataset.nav));
    const day = e.target.closest('[data-day]');
    if (day && !day.disabled) return openDay(day.dataset.day);
    if (e.target.closest('[data-today]')) return openDay(keyOf(today()));
    if (e.target.closest('[data-goto-today]')) {
      const t = today();
      viewMonth = new Date(t.getFullYear(), t.getMonth(), 1);
      animDir = 0; renderCalendar();
    }
  });

  // Deslizar para cambiar de mes
  let x0 = null, y0 = null;
  root.addEventListener('touchstart', e => {
    if (!e.target.closest('.cal-grid')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) changeMonth(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

function changeMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  animDir = delta;
  renderCalendar();
}

export function renderCalendar() {
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;
  const nDays = new Date(y, m + 1, 0).getDate();
  const t = today();
  const isCurrentMonth = y === t.getFullYear() && m === t.getMonth();

  // Cuadrícula
  let cells = WD_SHORT.map(d => `<div class="cal-wd">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += '<div></div>';
  let trainedMonth = 0;
  const groupCount = {};
  for (let d = 1; d <= nDays; d++) {
    const date = new Date(y, m, d);
    const k = keyOf(date);
    const w = state.workouts.get(k);
    let cls = 'day', style = '';
    if (w?.attended) {
      cls += ' trained';
      trainedMonth++;
      (w.groups || []).forEach(g => { groupCount[g] = (groupCount[g] || 0) + 1; });
      const main = M[w.groups?.[0]]?.color || 'var(--accent)';
      style = `--ringbg:${ringGradient(w.groups)};--fill:color-mix(in srgb, ${main} 20%, var(--card))`;
    } else if (w && w.attended === false) {
      cls += ' skipped';
    }
    if (+date === +t) cls += ' today';
    if (date > t) cls += ' future';
    if (k === popKey) cls += ' pop';
    const label = `${d} de ${MONTHS[m]}${w?.attended ? ', entrenado' : w ? ', no fuiste' : ''}`;
    cells += `<button class="${cls}" style="${style}" data-day="${k}" ${date > t ? 'disabled' : ''} aria-label="${label}"><span class="ring"></span><span class="num">${d}</span></button>`;
  }
  popKey = null;

  // Resumen del mes
  const top = Object.entries(groupCount).sort((a, b) => b[1] - a[1])[0];
  const { current } = weekStreaks(state.workouts, state.settings.weeklyTarget);

  // Esta semana
  const ws = startOfWeek(t);
  let thisWeek = 0;
  for (let i = 0; i < 7; i++) if (state.workouts.get(keyOf(addDays(ws, i)))?.attended) thisWeek++;

  root.innerHTML = `
    <h1 class="title">Calendario</h1>
    ${todayCard(t)}
    <div class="card">
      <div class="cal-head">
        <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">${chev('l')}</button>
        <div class="cal-month">${MONTHS[m]} ${y}</div>
        <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">${chev('r')}</button>
      </div>
      <div class="cal-grid ${animDir ? 'anim' : ''} ${animDir < 0 ? 'left' : ''}">${cells}</div>
      <div class="legend">${MUSCLES.map(g => `<span style="--c:${g.color}"><i></i>${g.name}</span>`).join('')}</div>
    </div>
    ${!isCurrentMonth ? `<button class="btn secondary" data-goto-today style="margin-bottom:14px">Volver a hoy</button>` : ''}
    <div class="kpis">
      <div class="card">
        <div class="kpi-label">Este mes</div>
        <div class="kpi-value">${trainedMonth}<small>días</small></div>
        <div class="kpi-sub">${top ? `Más trabajado: ${M[top[0]]?.name || top[0]}` : 'Aún sin entrenos'}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Esta semana</div>
        <div class="kpi-value">${thisWeek}<small>/ ${state.settings.weeklyTarget}</small></div>
        <div class="kpi-sub">Racha: ${current} ${current === 1 ? 'semana' : 'semanas'} 🔥</div>
      </div>
    </div>`;
  animDir = 0;
}

function todayCard(t) {
  const w = state.workouts.get(keyOf(t));
  let emoji = '🏋️', title = '¿Has entrenado hoy?', sub = 'Toca para registrar tu día', dots = '';
  if (w?.attended) {
    emoji = '💪'; title = 'Entreno de hoy registrado';
    const routine = state.routines.find(r => r.id === w.routine);
    sub = [routine?.name, ...(w.groups || []).map(g => M[g]?.name)].filter(Boolean).join(' · ') || 'Entrenamiento';
    dots = `<div class="today-dots">${(w.groups || []).map(g => `<i style="--c:${M[g]?.color}"></i>`).join('')}</div>`;
  } else if (w) {
    emoji = '😴'; title = 'Hoy toca descanso'; sub = 'Toca si quieres cambiarlo';
  }
  return `<button class="card today-card" data-today style="width:100%;border:0;text-align:left">
    <div class="big-emoji">${emoji}</div>
    <div class="info"><b>${title}</b><span>${esc(sub)}</span>${dots}</div>
    ${chev('r')}
  </button>`;
}

export function chev(dir) {
  const d = dir === 'l' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6';
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:.8"><path d="${d}"/></svg>`;
}

// ---------- Hoja de registro del día ----------
function openDay(k) {
  const existing = state.workouts.get(k);
  const draft = {
    attended: existing ? existing.attended : null,
    groups: new Set(existing?.groups || []),
    routine: existing?.routine ?? null,
  };

  const sessions = state.sessions.filter(s => s.date === k);
  const html = `
    <h2 class="sheet-title">${esc(cap(fmtLong(fromKey(k))))}</h2>
    ${sessions.map(s => {
      const st = sessionStats(s);
      return `<div class="wk-day"><span class="e">🏋️</span>
        <div><b>${esc(s.name)}</b><small>${s.duration} min · ${s.items.length} ejercicios · ${st.sets} series · ${fmtKg(st.volume)} kg</small></div>
        <button class="icon-btn" data-delsess="${s.id}" aria-label="Borrar este entreno"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
    }).join('')}
    <div class="label">¿Has ido al gimnasio?</div>
    <div class="yesno">
      <button data-att="1" class="yes ${draft.attended === true ? 'on' : ''}"><span class="e">💪</span>Sí, fui</button>
      <button data-att="0" class="no ${draft.attended === false ? 'on' : ''}"><span class="e">😴</span>No fui</button>
    </div>
    <div id="trained-fields" class="${draft.attended ? '' : 'hidden'}">
      ${state.routines.length ? `
      <div class="label">¿Qué rutina has hecho?</div>
      <div class="chips">
        ${state.routines.map(r => `<button class="chip ${draft.routine === r.id ? 'on' : ''}" data-r="${r.id}" style="--c:var(--accent)"><span class="dot"></span>${esc(r.name)}</button>`).join('')}
      </div>` : ''}
      <div class="label">¿Qué has entrenado?</div>
      <div class="chips">
        ${MUSCLES.map(g => `<button class="chip ${draft.groups.has(g.id) ? 'on' : ''}" data-g="${g.id}" style="--c:${g.color}"><span class="dot"></span>${g.name}</button>`).join('')}
      </div>
      <label class="field"><span>Duración (minutos)</span>
        <input id="dur" type="number" inputmode="numeric" min="0" placeholder="Opcional" value="${existing?.duration ?? ''}">
      </label>
    </div>
    <label class="field"><span>Notas</span>
      <textarea id="notes" rows="3" placeholder="Ej: press banca 4×8 con 80 kg">${esc(existing?.notes || '')}</textarea>
    </label>
    <div style="margin-top:20px">
      <button class="btn primary" id="save">Guardar</button>
      ${existing ? '<button class="btn ghost danger" id="del">Borrar registro</button>' : ''}
    </div>`;

  openSheet(html, body => {
    body.addEventListener('click', async e => {
      const att = e.target.closest('[data-att]');
      if (att) {
        draft.attended = att.dataset.att === '1';
        body.querySelectorAll('[data-att]').forEach(b => b.classList.toggle('on', b === att));
        body.querySelector('#trained-fields').classList.toggle('hidden', !draft.attended);
        haptic();
        return;
      }
      const ds = e.target.closest('[data-delsess]');
      if (ds) {
        if (!confirm('¿Borrar este entreno y sus series del historial?')) return;
        const id = Number(ds.dataset.delsess);
        await db.deleteSession(id);
        state.sessions = state.sessions.filter(s => s.id !== id);
        ds.closest('.wk-day').remove();
        return toast('Entreno borrado del historial');
      }
      const rchip = e.target.closest('[data-r]');
      if (rchip) {
        const id = Number(rchip.dataset.r);
        draft.routine = draft.routine === id ? null : id;
        body.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', Number(b.dataset.r) === draft.routine));
        // Marca automáticamente los grupos que trabaja la rutina
        if (draft.routine) {
          routineGroups(state.routines.find(r => r.id === id)).forEach(g => draft.groups.add(g));
          body.querySelectorAll('[data-g]').forEach(b => b.classList.toggle('on', draft.groups.has(b.dataset.g)));
        }
        haptic();
        return;
      }
      const chip = e.target.closest('[data-g]');
      if (chip) {
        const g = chip.dataset.g;
        draft.groups.has(g) ? draft.groups.delete(g) : draft.groups.add(g);
        chip.classList.toggle('on', draft.groups.has(g));
        haptic();
        return;
      }
      if (e.target.closest('#save')) {
        if (draft.attended === null) return toast('Indica si has ido o no');
        const dur = parseInt(body.querySelector('#dur').value, 10);
        const record = {
          date: k,
          attended: draft.attended,
          groups: draft.attended ? MUSCLES.map(m => m.id).filter(id => draft.groups.has(id)) : [],
          routine: draft.attended ? draft.routine : null,
          duration: draft.attended && dur > 0 ? dur : null,
          notes: body.querySelector('#notes').value.trim(),
        };
        await db.putWorkout(record);
        state.workouts.set(k, record);
        popKey = k;
        haptic();
        closeSheet();
        renderCalendar();
        toast(draft.attended ? '¡Entreno guardado! 💪' : 'Día de descanso guardado');
        return;
      }
      if (e.target.closest('#del')) {
        await db.deleteWorkout(k);
        state.workouts.delete(k);
        closeSheet();
        renderCalendar();
        toast('Registro borrado');
      }
    });
  });
}
