// =========================================================
// Nutrición · piezas comunes: tipos de comida, puntuación, borradores y ayudas
// =========================================================
import { norm } from './foods.js';
import { BUILTIN } from './cookbook.js';
import { esc, keyOf, r0, r1, state, today } from './utils.js';

export const MEAL_TYPES = [
  { id: 'desayuno', name: 'Desayuno', emoji: '🥐' },
  { id: 'comida',   name: 'Comida',   emoji: '🍝' },
  { id: 'merienda', name: 'Merienda', emoji: '🍎' },
  { id: 'cena',     name: 'Cena',     emoji: '🥗' },
  { id: 'snack',    name: 'Snack',    emoji: '🍫' },
];
export const MACRO_COLORS = { protein: '#0a84ff', carbs: '#ff9f0a', fat: '#ff375f' };
export const TYPE = id => MEAL_TYPES.find(t => t.id === id) || MEAL_TYPES[1];

// ---------- Favoritos por tipo de comida ----------
// Cada favorito guarda `types` (p. ej. ['desayuno']). Los antiguos sin `types` valen para todas.
export const typesOf = f => f.types || (f.type ? [f.type] : null);
export const inType = (f, t) => { const ts = typesOf(f); return !ts || ts.includes(t); };

// Etiquetas de un plato: las de la lista (o las que cambiaste a mano) o, si es favorito, las suyas
export const ALL_TYPES = MEAL_TYPES.map(t => t.id);
// Recetas predeterminadas: sin búsqueda, las de ese tipo de comida (o todas); buscando, las que coincidan
export function searchBuiltin(query = '', type = null) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return BUILTIN.filter(r => (words.length
    ? words.every(w => norm(r.name).includes(w) || r.items.some(i => norm(i.name).includes(w)))
    : !type || dishTypes(r).includes(type)));
}

export const dishTypes = r => r.id != null ? (typesOf(r) || ALL_TYPES) : (state.settings.dishTags?.[r.name] || r.types);
export let day = today();
export function setDay(d) { day = d; }
// ---------- Puntuación de una comida según sus macros por gramo ----------
// Premia mucha proteína por caloría, poca densidad calórica (kcal por gramo) y grasa moderada.
// Devuelve una nota de 0 a 10 y una letra de la A (mejor) a la E.
const GRADES = [
  { min: 8,   g: 'A', c: '#30d158', t: 'Excelente' },
  { min: 6.5, g: 'B', c: '#9bd55a', t: 'Buena' },
  { min: 5,   g: 'C', c: '#ffd60a', t: 'Correcta' },
  { min: 3.5, g: 'D', c: '#ff9f0a', t: 'Mejorable' },
  { min: 0,   g: 'E', c: '#ff453a', t: 'Pobre' },
];
const clamp01 = x => Math.max(0, Math.min(1, x));

export function mealScore(m) {
  const items = m.items || [];
  const sumOf = f => items.length ? items.reduce((a, i) => a + (+i[f] || 0), 0) : +m[f] || 0;
  const kcal = sumOf('kcal'), protein = sumOf('protein'), fat = sumOf('fat'), carbs = sumOf('carbs');
  const grams = items.reduce((a, i) => a + (+i.grams || 0), 0);
  if (kcal < 15) return null;

  const pShare = protein * 4 / kcal;                  // parte de las calorías que viene de la proteína
  const fShare = fat * 9 / kcal;                      // parte que viene de la grasa
  const density = grams > 0 ? kcal / grams : null;    // kcal por gramo
  const sP = clamp01(pShare / 0.30);                  // ≥30 % de proteína = nota máxima
  const sF = clamp01((0.60 - fShare) / 0.25);         // ≤35 % de grasa = máxima, ≥60 % = 0
  const sD = density === null ? null : clamp01((4 - density) / 3);   // ≤1 kcal/g = máxima, ≥4 = 0
  const score = 10 * (sD === null ? 0.7 * sP + 0.3 * sF : 0.5 * sP + 0.3 * sD + 0.2 * sF);
  const grade = GRADES.find(x => score >= x.min);
  const per100 = grams > 0 ? { kcal: kcal / grams * 100, protein: protein / grams * 100, carbs: carbs / grams * 100, fat: fat / grams * 100 } : null;
  return { score, ...grade, pShare, fShare, density, per100 };
}

export const gradeBadge = s => s ? `<span class="grade" style="--c:${s.c}" title="Nota ${r1(s.score)}/10">${s.g}</span>` : '';

export function scoreCard(s) {
  if (!s) return '<div class="muted small">Añade alimentos para ver la puntuación.</div>';
  const pct = x => `${r0(x * 100)} %`;
  return `<div class="score-head">
      <span class="grade big" style="--c:${s.c}">${s.g}</span>
      <div><b>${s.t} · ${r1(s.score).toLocaleString('es-ES')}/10</b></div>
    </div>
    ${s.per100 ? `<div class="per100"><span>Por 100 g</span>
      <b>${r0(s.per100.kcal)} kcal</b><b class="p-c">P ${r1(s.per100.protein)}</b><b class="c-c">H ${r1(s.per100.carbs)}</b><b class="f-c">G ${r1(s.per100.fat)}</b></div>` : ''}
    <div class="score-why">
      <span>Proteína: <b>${pct(s.pShare)}</b></span>
      ${s.density !== null ? `<span>Densidad: <b>${r1(s.density).toLocaleString('es-ES')}</b> kcal/g</span>` : ''}
      <span>Grasa: <b>${pct(s.fShare)}</b></span>
    </div>`;
}

export function sum(meals, divideBy = 1) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of meals) { t.kcal += +m.kcal || 0; t.protein += +m.protein || 0; t.carbs += +m.carbs || 0; t.fat += +m.fat || 0; }
  for (const k in t) t[k] /= divideBy;
  return t;
}

export const favKey = name => String(name || '').trim().toLowerCase();

export function defaultType() {
  if (+day !== +today()) return 'comida';
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 16 ? 'comida' : h < 19 ? 'merienda' : 'cena';
}
export const blankItem = () => ({ name: '', grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0 });
export const newDraft = (extra = {}) => ({ date: keyOf(day), type: defaultType(), name: '', photo: null, confidence: null, items: [], ...extra });

// ---------- Revisión / edición de una comida ----------
// Guarda una "base" por alimento para escalar macros al cambiar los gramos
export function withBase(item) {
  return { ...item, base: { grams: +item.grams || 0, kcal: +item.kcal || 0, protein: +item.protein || 0, carbs: +item.carbs || 0, fat: +item.fat || 0 } };
}

// Cada pantalla del desplegable usa un contenedor nuevo para no duplicar escuchadores
export function freshBox(el) {
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'picker-box';
  el.append(box);
  return box;
}

export const macroRow = m => `
  <div class="totals-row">
    <div><b>${r0(m.kcal)}</b><span>kcal</span></div>
    <div><b class="p-c">${r1(m.protein)}g</b><span>proteína</span></div>
    <div><b class="c-c">${r1(m.carbs)}g</b><span>hidratos</span></div>
    <div><b class="f-c">${r1(m.fat)}g</b><span>grasa</span></div>
  </div>`;
export const scaleFood = (f, g) => { const k = g / 100, p = f.per100; return { name: f.name, grams: g, kcal: p.kcal * k, protein: p.protein * k, carbs: p.carbs * k, fat: p.fat * k }; };
export const sumItems = items => items.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0), carbs: a.carbs + (+i.carbs || 0), fat: a.fat + (+i.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
// Chips de tipos de comida (favorito en… / aparece en…)
export const typeChips = (on, attr) => `<div class="chips">${MEAL_TYPES.map(t =>
  `<button class="chip ${on(t.id) ? 'on' : ''}" ${attr}="${t.id}" style="--c:var(--accent)">${t.emoji} ${t.name}</button>`).join('')}</div>`;

// «2 unidades», «1,5 cucharadas», «3 lonchas»…
export function unitText(it) {
  const n = Math.round((+it.grams || 0) / it.unitG * 10) / 10;
  const [w, ...rest] = String(it.unitLabel || 'ración').split(' ');
  const pl = n === 1 ? w : /ón$/.test(w) ? w.replace(/ón$/, 'ones') : /[aeiou]$/i.test(w) ? w + 's' : w + 'es';
  return `<b>${String(n).replace('.', ',')}</b> ${esc([pl, ...rest].join(' '))}`;
}

// Producto de Open Food Facts → mismo formato que la base local
export const productToFood = p => ({
  name: p.name, emoji: '🏷️', image: p.image, per100: p.per100, store: p.store, brand: p.brand, code: p.code,
  portions: p.servingGrams ? [['ración del envase', p.servingGrams]] : [],
});

// ---------- Recetas: raciones, con qué se cocinan y foto ----------
export const TOOLS = [['Sartén', '🍳'], ['Olla', '🍲'], ['Horno', '🔥'], ['Airfryer', '💨'], ['Microondas', '📡'], ['Sin cocinar', '🥗']];
// Los alimentos guardados son los de la receta entera; perServing da los de n raciones
export const servingsOf = r => Math.max(1, Math.round(+r?.servings || 1));
export function perServing(r, n = 1) {
  const k = n / servingsOf(r);
  return (r.items || []).map(i => (k === 1 ? { ...i } : {
    ...i, grams: r1((+i.grams || 0) * k), kcal: r0((+i.kcal || 0) * k),
    protein: r1((+i.protein || 0) * k), carbs: r1((+i.carbs || 0) * k), fat: r1((+i.fat || 0) * k),
  }));
}
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}
export function toJpeg(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

// Plato: lo que sueles comer (alimentos y cantidades). Receta: cómo se cocina (con pasos).
// Los dos se guardan en favoritos; las recetas llevan kind 'recipe' (las antiguas, pasos).
export const isRecipe = r => (r.kind ? r.kind === 'recipe' : !!r.steps?.length);
// Lista de ingredientes con sus gramos (y unidades si van por piezas)
export const ingList = items => `<div class="card rc-ings">${items.map(i =>
  `<div><span>${esc(i.name)}</span><b>${r0(i.grams)} g${i.unitG ? ` · ${unitText(i).replace(/<\/?b>/g, '')}` : ''}</b></div>`).join('')}</div>`;
