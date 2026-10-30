// =========================================================
// GymFit — punto de entrada
// =========================================================
import { db } from './db.js';
import { state } from './utils.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { initRoutines, renderRoutines } from './routines.js';
import { initStats, renderStats } from './stats.js';
import { initNutrition, renderNutrition } from './nutrition.js';
import { initSettings, renderSettings } from './settings.js';

const VIEWS = {
  calendar:  { init: initCalendar,  render: renderCalendar },
  routines:  { init: initRoutines,  render: renderRoutines },
  stats:     { init: initStats,     render: renderStats },
  nutrition: { init: initNutrition, render: renderNutrition },
  settings:  { init: initSettings,  render: renderSettings },
};
const LAST_TAB = 'gymfit-tab';
let currentTab = null;

async function start() {
  // Cargar entrenamientos en memoria
  const all = await db.allWorkouts();
  state.workouts = new Map(all.map(w => [w.date, w]));
  state.routines = await db.allRoutines();
  state.sessions = await db.allSessions();

  for (const [name, v] of Object.entries(VIEWS)) v.init(document.getElementById(`view-${name}`));

  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => show(btn.dataset.tab)));

  let first = 'calendar';
  try { first = localStorage.getItem(LAST_TAB) || 'calendar'; } catch { /* nada */ }
  show(VIEWS[first] ? first : 'calendar');

  // Sin zoom: Safari ignora user-scalable=no, así que se bloquea el gesto de pellizcar
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  }
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // Pedir que Safari no borre los datos
  navigator.storage?.persist?.().catch(() => {});

  // Service worker (necesita HTTPS o localhost)
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW:', err));
  }

  // Al volver a la app (p. ej. al día siguiente) refrescar la vista
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentTab) VIEWS[currentTab].render();
  });
}

function show(name) {
  if (currentTab === name) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  currentTab = name;
  try { localStorage.setItem(LAST_TAB, name); } catch { /* nada */ }
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.getElementById('fab').classList.toggle('hidden', name !== 'nutrition');
  window.scrollTo(0, 0);
  VIEWS[name].render();
}

start().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="padding:40px 20px;text-align:center">No se pudo iniciar GymFit: ${err.message}</div>`);
});
