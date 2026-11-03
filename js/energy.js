// =========================================================
// Gasto de energía: pasos y entrenamientos
// Son estimaciones de las calorías que gastas DE MÁS por moverte
// (sin contar lo que tu cuerpo gasta en reposo).
// =========================================================
import { db } from './db.js';
import { state } from './utils.js';

export const DEFAULT_KG = 75;          // si aún no has apuntado tu peso
const WALK_KCAL_KG_KM = 0.5;           // caminar: ~0,5 kcal por kg y km (gasto neto)
const GYM_MET = 5;                     // pesas a intensidad media (Compendio de actividades físicas)
const GYM_DEFAULT_MIN = 60;            // si marcaste el día sin duración

// Último peso conocido (se refresca al abrir la app y la pestaña Nutrición)
let lastKg = null;
export async function refreshBodyWeight() {
  try {
    const all = await db.allWeights();
    const last = all.filter(w => w.weight > 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    lastKg = last ? last.weight : null;
  } catch { /* nada */ }
  return lastKg;
}
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
export function workoutKcal(minutes) {
  return (GYM_MET - 1) * bodyKg() * ((Number(minutes) || 0) / 60);
}

// Entreno de un día según el calendario (la duración incluye los entrenos del modo entrenar)
export function dayWorkout(dateKey) {
  const w = state.workouts.get(dateKey);
  if (!w?.attended) return null;
  const assumed = !(w.duration > 0);
  const minutes = assumed ? GYM_DEFAULT_MIN : w.duration;
  return { minutes, assumed, kcal: workoutKcal(minutes) };
}
