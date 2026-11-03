// =========================================================
// Creador automático de rutinas
// Eliges duración, grupos musculares y material, y se monta una rutina
// equilibrada: primero ejercicios multiarticulares, luego aislamiento,
// cubriendo las distintas zonas de cada grupo (p. ej. pecho superior,
// medio e inferior). Funciona sin IA y sin conexión.
// =========================================================
import { EXERCISES, EX } from './exercises.js';
import { PARTS } from './bodymap.js';
import { state, M } from './utils.js';

// Grupos que se pueden elegir y su "peso" (cuántos ejercicios merecen)
export const GEN_GROUPS = ['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'piernas', 'gluteos', 'abdomen'];
const WEIGHT = { pecho: 3, espalda: 3, piernas: 3, hombros: 2, gluteos: 2, biceps: 1.5, triceps: 1.5, abdomen: 1 };

// Combinaciones rápidas
export const PRESETS = [
  { name: 'Empuje', groups: ['pecho', 'hombros', 'triceps'] },
  { name: 'Tirón', groups: ['espalda', 'biceps'] },
  { name: 'Pierna', groups: ['piernas', 'gluteos'] },
  { name: 'Torso', groups: ['pecho', 'espalda', 'hombros', 'biceps', 'triceps'] },
  { name: 'Full body', groups: ['pecho', 'espalda', 'hombros', 'piernas', 'gluteos', 'abdomen'] },
];

// Ejercicios multiarticulares (van primero, con más series y menos repeticiones)
const COMPOUND = new Set([
  'press-banca', 'press-inclinado', 'press-mancuernas', 'press-inclinado-mancuernas', 'press-declinado',
  'press-declinado-mancuernas', 'press-maquina', 'press-inclinado-maquina', 'flexiones', 'flexiones-declinadas',
  'fondos-paralelas', 'dominadas', 'jalon-pecho', 'remo-barra', 'remo-mancuerna', 'remo-polea', 'peso-muerto',
  'press-militar', 'press-hombro-mancuernas', 'press-arnold', 'press-cerrado', 'sentadilla', 'sentadilla-frontal',
  'sentadilla-goblet', 'prensa', 'zancadas', 'bulgara', 'peso-muerto-rumano', 'hip-thrust',
]);
const TIMED = new Set(['plancha', 'plancha-lateral']);
// Ejercicios de peso corporal que sí sirven como básico pesado (se puede lastrar)
const HEAVY_BODYWEIGHT = new Set(['dominadas', 'fondos-paralelas']);
// Importancia de cada zona al repartir ejercicios (las pequeñas se trabajan de rebote)
const ZONE_W = { dorsal: 1.6, 'espalda-media': 1, trapecio: 0.4, lumbar: 0.4, antebrazo: 0.3, aductores: 0.5, gemelos: 0.8,
  cuadriceps: 1.5, isquios: 1.3, biceps: 1.5, triceps: 1.5, 'deltoide-lat': 1.2, 'deltoide-ant': 0.9, 'deltoide-post': 1 };
const VERTICAL_PULL = new Set(['dominadas', 'jalon-pecho']);
// Preferencia de material para el primer ejercicio de cada grupo (el más pesado)
const LOAD = { barra: 2.5, mancuernas: 2, maquina: 1.2, polea: 0.6, kettlebell: 0.6, corporal: 0 };
const HIGH_REPS = new Set(['elevaciones-laterales', 'pajaros', 'face-pull', 'gemelos-pie', 'gemelos-sentado', 'curl-muneca', 'abduccion', 'aductores-maquina']);

const WARMUP_MIN = 5;
const WORK_S = 45;         // lo que dura una serie
const SETUP_S = 60;        // cambiar de ejercicio, preparar el material
const restS = () => state.settings.rest || 90;

export const isCompound = id => COMPOUND.has(id);
const groupsOf = e => new Set(e.p.map(p => PARTS[p].group));

// Duración estimada de una lista de ejercicios, en minutos
export function estimateMinutes(items) {
  const secs = items.reduce((a, it) => a + SETUP_S + (Number(it.sets) || 0) * (WORK_S + restS()), 0);
  return Math.round(WARMUP_MIN + secs / 60);
}

// Ejercicios disponibles para un grupo con el material elegido
export function poolFor(group, eqs) {
  return EXERCISES.filter(e => groupsOf(e).has(group) && (!eqs || eqs.has(e.eq)));
}

function planFor(id, slot) {
  if (TIMED.has(id)) return { sets: 3, reps: '30-45 s' };
  if (EX[id].eq === 'corporal' && !HEAVY_BODYWEIGHT.has(id)) return { sets: 3, reps: '10-15' };
  if (COMPOUND.has(id)) return slot === 0 ? { sets: 4, reps: '6-8' } : { sets: 3, reps: '8-10' };
  if (PARTS[EX[id].p[0]].group === 'abdomen') return { sets: 3, reps: '12-15' };
  return { sets: 3, reps: HIGH_REPS.has(id) ? '12-15' : '10-12' };
}

// Elige el mejor ejercicio del grupo: cubrir zonas nuevas, empezar por un multiarticular, algo de azar
// covered: Map zona → veces que ya se ha trabajado en este grupo
function pickOne(group, pool, used, covered, nth) {
  let best = null, bestScore = -Infinity;
  for (const e of pool) {
    if (used.has(e.id)) continue;
    const zones = e.p.filter(p => PARTS[p].group === group);
    const fresh = zones.filter(p => !covered.has(p)).length;
    const value = zones.reduce((a, z) => a + (ZONE_W[z] ?? 1) / (1 + 2 * (covered.get(z) || 0)), 0);
    let score = value * 3 + Math.random() * 2.5;
    if (group === 'espalda' && VERTICAL_PULL.has(e.id) && ![...used].some(id => VERTICAL_PULL.has(id))) score += 1.5;
    if (COMPOUND.has(e.id)) score += nth === 0 && group !== 'abdomen' ? 4 : 0.8;
    if (nth === 0 && COMPOUND.has(e.id)) score += HEAVY_BODYWEIGHT.has(e.id) ? 2 : LOAD[e.eq] || 0;
    if (nth >= 2 && !COMPOUND.has(e.id)) score += 2;     // a partir del 3.º, mejor un aislamiento
    if (!fresh && zones.length) score -= 1;               // zona ya trabajada
    if (PARTS[e.p[0]].group !== group) score -= 1.5;      // su músculo principal es de otro grupo
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// Reparte N ejercicios entre los grupos según su peso (mínimo 1 cada uno)
function allocate(groups, n, pools) {
  const alloc = Object.fromEntries(groups.map(g => [g, 0]));
  const cap = g => pools[g].length;
  let left = n;
  for (const g of groups) if (cap(g) && left > 0) { alloc[g] = 1; left--; }
  while (left > 0) {
    // El grupo más "por debajo" de su parte justa que aún tenga ejercicios libres
    const cand = groups
      .filter(g => alloc[g] < cap(g))
      .sort((a, b) => (alloc[a] / WEIGHT[a]) - (alloc[b] / WEIGHT[b]) || WEIGHT[b] - WEIGHT[a])[0];
    if (!cand) break;
    alloc[cand]++; left--;
  }
  return alloc;
}

// ---------- Generar ----------
// opts: { minutes, groups: [ids], eqs: Set de material }
export function generateRoutine({ minutes, groups, eqs }) {
  const warnings = [];
  const pools = {};
  for (const g of groups) {
    let pool = poolFor(g, eqs);
    if (!pool.length && !eqs.has('corporal')) {
      pool = poolFor(g, new Set(['corporal']));
      if (pool.length) warnings.push(`No hay ejercicios de ${M[g].name.toLowerCase()} con ese material: he usado peso corporal.`);
    }
    if (!pool.length) warnings.push(`No hay ejercicios de ${M[g].name.toLowerCase()} con ese material.`);
    pools[g] = pool;
  }
  const active = groups.filter(g => pools[g].length);
  if (!active.length) return { items: [], warnings, minutes: 0 };

  // Cuántos ejercicios caben en el tiempo (media de 3,4 series por ejercicio)
  const perEx = (SETUP_S + 3.4 * (WORK_S + restS())) / 60;
  let n = Math.max(1, Math.round((minutes - WARMUP_MIN) / perEx));
  n = Math.min(n, 12);
  if (n < active.length) {
    warnings.push(`En ${minutes} min van justos ${active.length} grupos: 1 ejercicio por grupo con menos series.`);
    n = active.length;
  }
  const alloc = allocate(active, n, pools);

  // Elegir ejercicios grupo a grupo (los grandes primero, así se quedan sus multiarticulares)
  const used = new Set();
  const picks = [];
  for (const g of [...active].sort((a, b) => WEIGHT[b] - WEIGHT[a])) {
    const covered = new Map();
    for (let k = 0; k < alloc[g]; k++) {
      const e = pickOne(g, pools[g], used, covered, k);
      if (!e) break;
      used.add(e.id);
      e.p.forEach(p => covered.set(p, (covered.get(p) || 0) + 1));
      picks.push({ ex: e.id, g, nth: k });
    }
  }

  // Orden: multiarticulares → aislamiento → abdomen, y los grupos grandes antes
  const rank = p => (PARTS[EX[p.ex].p[0]].group === 'abdomen' ? 2 : COMPOUND.has(p.ex) ? 0 : 1);
  picks.sort((a, b) => rank(a) - rank(b) || WEIGHT[b.g] - WEIGHT[a.g] || a.nth - b.nth);

  let firstCompound = true;
  const items = picks.map(p => {
    const plan = planFor(p.ex, COMPOUND.has(p.ex) && firstCompound ? 0 : 1);
    if (COMPOUND.has(p.ex)) firstCompound = false;
    return { ex: p.ex, sets: plan.sets, reps: plan.reps, kg: '', g: p.g };
  });

  fitToTime(items, minutes);
  const est = estimateMinutes(items);
  if (est < minutes - 8) warnings.push(`Con ese material no hay ejercicios suficientes para ${minutes} min: la rutina dura unos ${est} min. Añade más material para alargarla.`);
  return { items, warnings, minutes: est };
}

// Ajusta las series para acercarse a la duración pedida
function fitToTime(items, minutes) {
  // Sobra tiempo: quita series a los de aislamiento (desde el final), mínimo 2
  for (let guard = 0; estimateMinutes(items) > minutes + 2 && guard < 40; guard++) {
    const it = [...items].reverse().find(x => x.sets > 2 && !COMPOUND.has(x.ex))
      || [...items].reverse().find(x => x.sets > 2);
    if (!it) break;
    it.sets--;
  }
  // Falta tiempo: añade series (hasta 4) a los multiarticulares, luego al resto, y como mucho 5 al primero
  for (let guard = 0; estimateMinutes(items) < minutes - 3 && guard < 40; guard++) {
    const it = items.find(x => COMPOUND.has(x.ex) && x.sets < 4) || items.find(x => x.sets < 4)
      || (items[0]?.sets < 5 ? items[0] : null);
    if (!it) break;
    it.sets++;
  }
}

// Cambia un ejercicio por otro del mismo grupo y material
export function swapExercise(items, i, eqs) {
  const it = items[i];
  const g = it.g || PARTS[EX[it.ex].p[0]].group;
  const used = new Set(items.map(x => x.ex));
  const zones = new Set(EX[it.ex].p);
  const cands = poolFor(g, eqs).filter(e => !used.has(e.id));
  if (!cands.length) return false;
  // Preferir uno que trabaje la misma zona y sea del mismo tipo (multiarticular o no)
  const score = e => (e.p.some(p => zones.has(p)) ? 2 : 0) + (COMPOUND.has(e.id) === COMPOUND.has(it.ex) ? 1 : 0) + Math.random() * 1.5;
  const next = cands.sort((a, b) => score(b) - score(a))[0];
  const plan = planFor(next.id, COMPOUND.has(next.id) && it.sets >= 4 ? 0 : 1);
  items[i] = { ...it, ex: next.id, reps: plan.reps };
  return true;
}

// Nombre sugerido: "Pecho, hombros y tríceps"
export function routineName(groups) {
  const names = groups.map(g => M[g].name.toLowerCase());
  const txt = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] || 'Rutina';
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
