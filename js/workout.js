// =========================================================
// Modo entrenar: apunta series, pesos y descansos en directo
// y guarda el historial de cada ejercicio
// =========================================================
import { db } from './db.js';
import { line } from './charts.js';
import { chev } from './calendar.js';
import { openSheet, setSheetContent, closeSheet, onSheetCleanup } from './sheet.js';
import { EX } from './exercises.js';
import { PARTS, partColor } from './bodymap.js';
import { mountLibrary, renderRoutines } from './routines.js';
import { state, MUSCLES, keyOf, today, fromKey, esc, toast, haptic } from './utils.js';

// El entreno en curso se guarda aquí a cada cambio, así no se pierde si cierras la hoja o la app
const ACTIVE_KEY = 'gymfit-active';
export function getActive() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch { return null; }
}
function persist(s) {
  try { s ? localStorage.setItem(ACTIVE_KEY, JSON.stringify(s)) : localStorage.removeItem(ACTIVE_KEY); } catch { /* sin almacenamiento */ }
}

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const fmtKg = n => (Math.round(n * 10) / 10).toLocaleString('es-ES');
const e1rm = (kg, reps) => reps > 1 ? kg * (1 + reps / 30) : kg;   // 1RM estimado (fórmula de Epley)
const fmtClock = ms => {
  const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`;
};
const shortDate = k => { const d = fromKey(k); return `${d.getDate()}/${d.getMonth() + 1}`; };

// ---------- Historial ----------
// Una entrada por sesión en la que hiciste el ejercicio, de la más antigua a la más reciente
export function exHistory(exId) {
  return state.sessions
    .filter(s => s.items.some(i => i.ex === exId))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(s => {
      const sets = s.items.filter(i => i.ex === exId).flatMap(i => i.sets);
      const top = sets.reduce((b, x) => (x.kg > b.kg || (x.kg === b.kg && x.reps > b.reps) ? x : b));
      return { date: s.date, sets, top, e1rm: Math.max(...sets.map(x => e1rm(x.kg, x.reps))) };
    });
}
const bestOf = hist => hist.reduce((b, h) => (!b || h.top.kg > b.kg ? h.top : b), null);

export function sessionStats(s) {
  const sets = s.items.flatMap(i => i.sets);
  return { sets: sets.length, volume: sets.reduce((a, x) => a + x.kg * x.reps, 0) };
}

// Récord, 1RM, gráfica y últimas sesiones de un ejercicio (ficha del ejercicio y Estadísticas)
export function progressBlock(exId) {
  const hist = exHistory(exId);
  if (!hist.length) return '';
  const best = bestOf(hist);
  const recent = hist.slice(-12);
  return `
    <div class="totals-row three">
      <div><b>${fmtKg(best.kg)}<small> kg</small></b><span>récord</span></div>
      <div><b>${fmtKg(Math.max(...hist.map(h => h.e1rm)))}<small> kg</small></b><span>1RM estimado</span></div>
      <div><b>${hist.length}</b><span>${hist.length === 1 ? 'sesión' : 'sesiones'}</span></div>
    </div>
    ${recent.length > 1 ? line(recent.map(h => ({ label: shortDate(h.date), value: h.top.kg })), { unit: ' kg', color: partColor(EX[exId]?.p[0]) }) : ''}
    <div class="hist">
      ${hist.slice(-3).reverse().map(h => `<div><span>${shortDate(h.date)}</span><b>${h.sets.map(x => `${fmtKg(x.kg)}×${x.reps}`).join(' · ')}</b></div>`).join('')}
    </div>`;
}

// ---------- Empezar / continuar ----------
function newItem(exId, plan = {}) {
  const last = exHistory(exId).at(-1)?.sets || [];
  const n = Math.max(1, parseInt(plan.sets, 10) || last.length || 3);
  return {
    ex: exId,
    target: plan.reps ? String(plan.reps) : '',
    sets: Array.from({ length: n }, (_, i) => ({
      kg: last[i]?.kg ?? last.at(-1)?.kg ?? num(plan.kg) ?? '',
      reps: last[i]?.reps ?? '',
      done: false,
    })),
  };
}

export function startWorkout(routine) {
  const active = getActive();
  if (active && !confirm(`Tienes un entreno en curso (${active.name}). ¿Descartarlo y empezar uno nuevo?`)) return openWorkout();
  persist({
    routine: routine?.id ?? null,
    name: routine?.name || 'Entreno libre',
    date: keyOf(today()),
    startedAt: Date.now(),
    restEnd: null,
    items: (routine?.items || []).filter(it => EX[it.ex]).map(it => newItem(it.ex, it)),
  });
  haptic();
  openWorkout();
}

export function openWorkout() {
  const s = getActive();
  if (s) openSheet(workoutHtml(s), body => mountWorkout(body, s));
}

const progress = s => {
  const all = s.items.flatMap(i => i.sets);
  return { done: all.filter(x => x.done).length, total: all.length };
};

// ---------- Pantalla del entreno ----------
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function setRow(it, x, st, k) {
  return `<div class="wk-row ${st.done ? 'done' : ''}">
    <span class="n">${k + 1}</span>
    <input data-x="${x}" data-k="${k}" data-f="kg" inputmode="decimal" placeholder="kg" value="${esc(st.kg)}" aria-label="Kilos serie ${k + 1}">
    <input data-x="${x}" data-k="${k}" data-f="reps" inputmode="numeric" placeholder="${esc(it.target || 'reps')}" value="${esc(st.reps)}" aria-label="Repeticiones serie ${k + 1}">
    <button class="wk-check" data-done="${x}-${k}" aria-label="Serie hecha">${CHECK}</button>
  </div>`;
}

function itemHtml(it, x) {
  const ex = EX[it.ex];
  const hist = exHistory(it.ex), last = hist.at(-1), best = bestOf(hist);
  const sub = last
    ? `Última vez: ${fmtKg(last.top.kg)} kg × ${last.top.reps}${best.kg > last.top.kg ? ` · Récord ${fmtKg(best.kg)} kg` : ''}`
    : ex.p.map(p => PARTS[p].name).join(', ');
  return `<div class="card wk-ex">
    <div class="item-top">
      <span class="rt-num" style="--c:${partColor(ex.p[0])}">${x + 1}</span>
      <div class="rt-name"><b>${esc(ex.name)}</b><small>${esc(sub)}</small></div>
      <button class="icon-btn" data-rmex="${x}" aria-label="Quitar ejercicio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="wk-row wk-hdr"><span>Serie</span><span>Kg</span><span>Reps${it.target ? ` · ${esc(it.target)}` : ''}</span><span></span></div>
    ${it.sets.map((st, k) => setRow(it, x, st, k)).join('')}
    <div class="wk-foot">
      <button class="link" data-addset="${x}">+ Añadir serie</button>
      ${it.sets.length > 1 ? `<button class="link muted" data-rmset="${x}">Quitar la última</button>` : ''}
    </div>
  </div>`;
}

const itemsHtml = s => s.items.length
  ? s.items.map(itemHtml).join('')
  : '<div class="card empty"><span class="e">🏋️</span><b>Entreno vacío</b>Añade los ejercicios que vayas haciendo.</div>';

function workoutHtml(s) {
  const p = progress(s);
  return `
    <div class="wk-head">
      <div class="wk-title"><h2 class="sheet-title">${esc(s.name)}</h2>
        <span class="muted small">⏱ <b id="wk-clock">${fmtClock(Date.now() - s.startedAt)}</b> · <span id="wk-count">${p.done}/${p.total}</span> series</span></div>
      <button class="btn small primary" id="wk-finish">Terminar</button>
    </div>
    <div class="bar wk-bar" style="--c:var(--accent)"><i id="wk-bar" style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div>
    <div id="wk-items">${itemsHtml(s)}</div>
    <button class="btn secondary" id="wk-addex">+ Añadir ejercicio</button>
    <button class="btn ghost danger" id="wk-discard">Descartar entreno</button>
    <div class="wk-rest hidden" id="wk-rest">
      <div class="wk-rest-t"><small>Descanso</small><b id="wk-rest-t">0:00</b></div>
      <button class="icon-btn" data-rest="-15">−15</button>
      <button class="icon-btn" data-rest="15">+15</button>
      <button class="btn small secondary" data-rest="0">Saltar</button>
    </div>`;
}

function mountWorkout(body, s) {
  const save = () => persist(s);
  const redraw = () => { body.querySelector('#wk-items').innerHTML = itemsHtml(s); updateProgress(); };
  const updateProgress = () => {
    const p = progress(s);
    body.querySelector('#wk-count').textContent = `${p.done}/${p.total}`;
    body.querySelector('#wk-bar').style.width = `${p.total ? p.done / p.total * 100 : 0}%`;
  };

  // Reloj del entreno y cuenta atrás del descanso
  const restBox = body.querySelector('#wk-rest');
  const tick = () => {
    body.querySelector('#wk-clock').textContent = fmtClock(Date.now() - s.startedAt);
    if (!s.restEnd) return restBox.classList.add('hidden');
    const left = s.restEnd - Date.now();
    if (left <= 0) {
      if (left > -3000) { beep(); haptic(); toast('¡A por la siguiente serie! 💪'); }
      s.restEnd = null; save();
      return restBox.classList.add('hidden');
    }
    restBox.classList.remove('hidden');
    body.querySelector('#wk-rest-t').textContent = fmtClock(left);
  };
  tick();
  const timer = setInterval(tick, 500);
  onSheetCleanup(() => { clearInterval(timer); renderRoutines(); });

  body.addEventListener('input', e => {
    const { x, k, f } = e.target.dataset;
    if (x === undefined) return;
    s.items[x].sets[k][f] = e.target.value.trim();
    save();
  });

  body.addEventListener('click', async e => {
    const d = e.target.closest('[data-done]');
    if (d) {
      const [x, k] = d.dataset.done.split('-').map(Number);
      const it = s.items[x], st = it.sets[k];
      if (!st.done) {
        if (num(st.reps) === null) st.reps = parseInt(it.target, 10) || '';
        if (num(st.reps) === null) { toast('Apunta las repeticiones'); return d.closest('.wk-row').querySelector('[data-f=reps]').focus(); }
        st.done = true;
        // Lleva el peso a la siguiente serie si está vacía
        const next = it.sets[k + 1];
        if (next && num(next.kg) === null) next.kg = st.kg;
        unlockAudio();
        s.restEnd = Date.now() + (state.settings.rest || 90) * 1000;
      } else {
        st.done = false;
      }
      save(); haptic(); redraw(); tick();
      return;
    }
    const rest = e.target.closest('[data-rest]');
    if (rest) {
      const delta = Number(rest.dataset.rest);
      s.restEnd = delta && s.restEnd ? Math.max(Date.now() + 1000, s.restEnd + delta * 1000) : null;
      save(); return tick();
    }
    const add = e.target.closest('[data-addset]');
    if (add) {
      const it = s.items[Number(add.dataset.addset)], last = it.sets.at(-1);
      it.sets.push({ kg: last?.kg ?? '', reps: last?.reps ?? '', done: false });
      save(); return redraw();
    }
    const rmset = e.target.closest('[data-rmset]');
    if (rmset) { s.items[Number(rmset.dataset.rmset)].sets.pop(); save(); return redraw(); }
    const rmex = e.target.closest('[data-rmex]');
    if (rmex) {
      const x = Number(rmex.dataset.rmex);
      if (s.items[x].sets.some(st => st.done) && !confirm(`¿Quitar ${EX[s.items[x].ex].name} con sus series hechas?`)) return;
      s.items.splice(x, 1); save(); return redraw();
    }
    if (e.target.closest('#wk-addex')) return openPicker(s);
    if (e.target.closest('#wk-discard')) {
      if (!confirm('¿Descartar este entreno? No se guardará nada.')) return;
      persist(null); closeSheet(); toast('Entreno descartado');
      return;
    }
    if (e.target.closest('#wk-finish')) finishWorkout(s);
  });
}

const pickFilter = { muscle: null, eq: null, q: '' };
function openPicker(s) {
  const back = () => setSheetContent(workoutHtml(s), b => mountWorkout(b, s));
  setSheetContent(`
    <button class="link back" id="back">${chev('l')} Volver al entreno</button>
    <h2 class="sheet-title">Añadir ejercicio</h2>`, body => {
    body.querySelector('#back').addEventListener('click', back);
    mountLibrary(body, pickFilter, exId => {
      s.items.push(newItem(exId));
      persist(s); haptic();
      back();
    }, true);
  });
}

// ---------- Terminar ----------
async function finishWorkout(s) {
  const items = s.items
    .map(it => ({ ex: it.ex, sets: it.sets.filter(x => x.done).map(x => ({ kg: num(x.kg) ?? 0, reps: num(x.reps) ?? 0 })) }))
    .filter(i => i.sets.length);
  if (!items.length) return toast('Marca al menos una serie como hecha ✓');

  const prevBest = Object.fromEntries(items.map(i => [i.ex, bestOf(exHistory(i.ex))]));
  const endedAt = Date.now();
  const duration = Math.max(1, Math.round((endedAt - s.startedAt) / 60000));
  const session = { date: s.date, routine: s.routine, name: s.name, startedAt: s.startedAt, endedAt, duration, items };
  session.id = await db.putSession(session);
  state.sessions.push(session);

  // Marca el día en el calendario con los grupos trabajados
  const prev = state.workouts.get(s.date);
  const groups = new Set(prev?.attended ? prev.groups : []);
  items.forEach(i => EX[i.ex]?.p.forEach(p => groups.add(PARTS[p].group)));
  const record = {
    date: s.date,
    attended: true,
    groups: MUSCLES.map(m => m.id).filter(id => groups.has(id)),
    routine: s.routine ?? prev?.routine ?? null,
    duration: (prev?.attended ? prev.duration || 0 : 0) + duration,
    notes: prev?.notes || '',
  };
  await db.putWorkout(record);
  state.workouts.set(s.date, record);
  persist(null);

  const st = sessionStats(session);
  const prs = items
    .map(i => ({ ex: i.ex, kg: Math.max(...i.sets.map(x => x.kg)) }))
    .filter(r => r.kg > 0 && prevBest[r.ex] && r.kg > prevBest[r.ex].kg);
  haptic();
  setSheetContent(`
    <div class="wk-done"><span class="e">🎉</span><h2 class="sheet-title">¡Entreno completado!</h2><div class="muted">${esc(s.name)}</div></div>
    <div class="card"><div class="totals-row">
      <div><b>${duration}</b><span>min</span></div>
      <div><b>${items.length}</b><span>ejercicios</span></div>
      <div><b>${st.sets}</b><span>series</span></div>
      <div><b>${fmtKg(st.volume)}</b><span>kg totales</span></div>
    </div></div>
    ${prs.length ? `<div class="section-label">Nuevos récords</div>${prs.map(r => `<div class="alert pr"><span class="e">🏆</span><div><b>${esc(EX[r.ex].name)}</b>: ${fmtKg(r.kg)} kg <span class="muted">(antes ${fmtKg(prevBest[r.ex].kg)} kg)</span></div></div>`).join('')}` : ''}
    <div class="muted small" style="text-align:center;margin:10px 0 16px">Guardado en el calendario 📅</div>
    <button class="btn primary" id="wk-close">Cerrar</button>`, body => {
    body.querySelector('#wk-close').addEventListener('click', () => closeSheet());
  });
}

// ---------- Pitido al acabar el descanso ----------
let audio = null;
function unlockAudio() {   // iPhone solo deja sonar audio creado tras tocar la pantalla
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* sin audio */ }
}
function beep() {
  if (!audio) return;
  try {
    [0, 0.22].forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
    });
  } catch { /* sin audio */ }
}
