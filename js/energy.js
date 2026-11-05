// =========================================================
// Gasto de energía: pasos y entrenamientos
// Son estimaciones de las calorías que gastas DE MÁS por moverte
// (sin contar lo que tu cuerpo gasta en reposo).
// =========================================================
import { db } from './db.js';
import { state, SP } from './utils.js';

export const DEFAULT_KG = 75;          // si aún no has apuntado tu peso
const WALK_KCAL_KG_KM = 0.5;           // caminar: ~0,5 kcal por kg y km (gasto neto)
const GYM_MET = 5;                     // pesas a intensidad media (Compendio de actividades físicas)
const GYM_DEFAULT_MIN = 60;            // si marcaste el día sin duración

// Último peso conocido (se refresca al abrir la app y la pestaña Nutrición)
let lastKg = null, lastBmr = null;
export async function refreshBodyWeight() {
  try {
    const all = (await db.allWeights()).sort((a, b) => a.date.localeCompare(b.date));
    lastKg = all.filter(w => w.weight > 0).at(-1)?.weight ?? null;
    lastBmr = all.filter(w => w.bmr > 0).at(-1)?.bmr ?? null;   // metabolismo basal de la última pesada que lo tenga
  } catch { /* nada */ }
  return lastKg;
}
export const basalKcal = () => lastBmr;
export const bodyKg = () => lastKg || DEFAULT_KG;
export const hasBodyWeight = () => !!lastKg;

// Longitud de la zancada: ~41,5 % de la altura (0,72 m si no sabemos la altura)
export const strideM = () => (state.settings.height > 0 ? state.settings.height * 0.415 : 72) / 100;

export function stepsKm(steps) {
  return (Number(steps) || 0) * strideM() / 1000;
}

export function stepsKcal(steps) {
  return stepsKm(steps) * bodyKg() * WALK_KCAL_KG_KM;
}

// MET neto (se resta 1 MET, el reposo) × kg × horas
export function workoutKcal(minutes, met = GYM_MET) {
  return (met - 1) * bodyKg() * ((Number(minutes) || 0) / 60);
}

// Si el día fue solo cardio con deportes elegidos, usa la media de sus MET; si hubo pesas, la de gimnasio
function dayMet(w) {
  const sp = (w.sports || []).map(id => SP[id]?.met).filter(Boolean);
  const onlyCardio = (w.groups || []).length && w.groups.every(g => g === 'cardio');
  return onlyCardio && sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : GYM_MET;
}

// Entreno de un día según el calendario (la duración incluye los entrenos del modo entrenar)
export function dayWorkout(dateKey) {
  const w = state.workouts.get(dateKey);
  if (!w?.attended) return null;
  const assumed = !(w.duration > 0);
  const minutes = assumed ? GYM_DEFAULT_MIN : w.duration;
  return { minutes, assumed, kcal: workoutKcal(minutes, dayMet(w)) };
}
