// =========================================================
// Utilidades compartidas: grupos musculares, fechas, ajustes
// =========================================================

// Grupos musculares. Puedes añadir, quitar o cambiar colores aquí.
export const MUSCLES = [
  { id: 'pecho',    name: 'Pecho',     color: '#ff453a' },
  { id: 'espalda',  name: 'Espalda',   color: '#0a84ff' },
  { id: 'piernas',  name: 'Piernas',   color: '#30d158' },
  { id: 'hombros',  name: 'Hombros',   color: '#ff9f0a' },
  { id: 'biceps',   name: 'Bíceps',    color: '#bf5af2' },
  { id: 'triceps',  name: 'Tríceps',   color: '#66d4cf' },
  { id: 'abdomen',  name: 'Abdomen',   color: '#ffd60a' },
  { id: 'gluteos',  name: 'Glúteos',   color: '#ff6fae' },
  { id: 'cardio',   name: 'Cardio',    color: '#64d2ff' },
  { id: 'full',     name: 'Full body', color: '#7d7aff' },
];
export const M = Object.fromEntries(MUSCLES.map(m => [m.id, m]));

// Tipos de cardio / deportes (met = gasto aproximado, Compendio de actividades físicas)
export const SPORTS = [
  { id: 'correr',     name: 'Correr',     emoji: '🏃', met: 9.8 },
  { id: 'bici',       name: 'Bicicleta',  emoji: '🚴', met: 7.5 },
  { id: 'natacion',   name: 'Natación',   emoji: '🏊', met: 7 },
  { id: 'futbol',     name: 'Fútbol',     emoji: '⚽', met: 7 },
  { id: 'baloncesto', name: 'Baloncesto', emoji: '🏀', met: 6.5 },
  { id: 'padel',      name: 'Pádel',      emoji: '🎾', met: 6 },
  { id: 'tenis',      name: 'Tenis',      emoji: '🎾', met: 7.3 },
  { id: 'caminar',    name: 'Caminar',    emoji: '🚶', met: 3.5 },
  { id: 'eliptica',   name: 'Elíptica',   emoji: '🏋️', met: 5 },
  { id: 'remo',       name: 'Remo',       emoji: '🚣', met: 6 },
  { id: 'otro',       name: 'Otro',       emoji: '🏅', met: 6 },
];
export const SP = Object.fromEntries(SPORTS.map(s => [s.id, s]));

// Nombres de los deportes de un día («Fútbol», o lo que escribiste en «Otro»)
export const sportNames = w => (w?.sports || []).map(id => id === 'otro' ? (w.sportOther?.trim() || 'Otro deporte') : SP[id]?.name).filter(Boolean);

// Grupos de un día para mostrar: «Cardio» se sustituye por los deportes si los hay
export const dayGroupNames = w => (w?.groups || []).flatMap(g => g === 'cardio' && w.sports?.length ? sportNames(w) : [M[g]?.name]).filter(Boolean);

// Grupos principales sobre los que avisar si llevas tiempo sin entrenarlos
export const NEGLECT_DAYS = 10;

// ---------- Ajustes (se guardan en el iPhone) ----------
const SETTINGS_KEY = 'gymfit-settings';
const DEFAULTS = {
  weeklyTarget: 4,
  rest: 90,                        // segundos de descanso entre series
  kcal: 2200,
  protein: 150,
  carbs: 230,
  fat: 70,
  stepsGoal: 8000,
  water: false,                     // apuntar el agua (se activa en Ajustes)
  waterGoal: 8,                     // vasos de agua al día
  lastBackup: 0,                    // última copia de seguridad exportada
  firstRun: 0,                 // pasos al día (0 = sin objetivo)
  goalWeight: 0,                   // kg (0 = sin objetivo)
  height: 0,                       // cm, para calcular el IMC
  provider: 'gemini',              // 'gemini' (gratis) o 'claude' (de pago)
  geminiKey: '',
  geminiModel: 'gemini-flash-lite-latest',     // fotos (comida, Zepp Life): el ligero, más rápido y con más límite
  geminiTextModel: 'gemini-flash-lite-latest',  // texto y recetas: más rápido y con más límite diario
  groqKey: '',                                  // opcional: texto y recetas con Groq (gratis, muy rápido)
  groqModel: 'llama-3.3-70b-versatile',
  apiKey: '',                      // clave de Claude
  model: 'claude-sonnet-5-5',
};

// ¿Hay una clave configurada para la IA elegida?
export const hasAiKey = () => !!(state.settings.provider === 'claude' ? state.settings.apiKey : state.settings.geminiKey)?.trim();
// ¿Toca hacer copia? Más de 30 días desde la última (o desde que empezaste a usar la app)
export const backupDue = () => Date.now() - (state.settings.lastBackup || state.settings.firstRun || Date.now()) > 30 * 86400000;

// Para texto y recetas también vale la clave de Groq
export const hasTextAi = () => hasAiKey() || !!state.settings.groqKey?.trim();

export const state = {
  workouts: new Map(),   // 'YYYY-MM-DD' -> { date, attended, groups, routine, duration, notes }
  routines: [],          // { id, name, items: [{ ex, sets, reps, kg }] }
  sessions: [],          // { id, date, routine, name, duration, items: [{ ex, sets: [{ kg, reps }] }] }
  settings: loadSettings(),
};

function loadSettings() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    if (s.geminiModel === 'gemini-flash-latest') s.geminiModel = DEFAULTS.geminiModel;   // el predeterminado de antes
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* sin almacenamiento */ }
}

// ---------- Fechas ----------
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WD_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = n => String(n).padStart(2, '0');
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);
export const fmtLong = d => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Varios ----------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const r0 = n => Math.round(Number(n) || 0);
export const r1 = n => Math.round((Number(n) || 0) * 10) / 10;

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Vibración (en iPhone Safari no existe; en Android sí)
export const haptic = () => { try { navigator.vibrate?.(12); } catch { /* nada */ } };

// ---------- Rachas ----------
// Racha = semanas seguidas cumpliendo el objetivo semanal de días.
// La semana actual solo cuenta si ya has llegado al objetivo (no rompe la racha si aún no).
export function weekStreaks(workouts, target) {
  const counts = new Map();
  for (const w of workouts.values()) {
    if (!w.attended) continue;
    const k = keyOf(startOfWeek(fromKey(w.date)));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const ok = d => (counts.get(keyOf(d)) || 0) >= target;
  const thisWeek = startOfWeek(today());

  let current = ok(thisWeek) ? 1 : 0;
  for (let w = addDays(thisWeek, -7); ok(w); w = addDays(w, -7)) current++;

  let best = 0;
  const keys = [...counts.keys()].sort();
  if (keys.length) {
    let run = 0;
    for (let w = fromKey(keys[0]); w <= thisWeek; w = addDays(w, 7)) {
      run = ok(w) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { current, best: Math.max(best, current) };
}

// Gradiente cónico para el anillo del día según los grupos entrenados
export function ringGradient(groups) {
  const cols = (groups || []).map(g => M[g]?.color).filter(Boolean);
  if (!cols.length) return 'var(--accent)';
  if (cols.length === 1) return cols[0];
  const step = 360 / cols.length;
  return `conic-gradient(${cols.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ')})`;
}
