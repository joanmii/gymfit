// =========================================================
// Pestaña Nutrición: resumen del día, comidas y análisis por foto
// =========================================================
import { db } from './db.js';
import { analyzeFood, analyzeText } from './api.js';
import { openScanner, searchProducts } from './barcode.js';
import { FOOD_CATS, searchFoods, foodsByCat, norm } from './foods.js';
import { searchRecipes } from './recipes.js';
import { renderWeight, openWeighIn } from './weight.js';
import { ring, bars } from './charts.js';
import { chev } from './calendar.js';
import { openSheet, setSheetContent, closeSheet, onSheetCleanup } from './sheet.js';
import { refreshBodyWeight, hasBodyWeight, bodyKg, stepsKcal, stepsKm, dayWorkout, basalKcal } from './energy.js';
import { state, saveSettings, hasAiKey, keyOf, today, addDays, fmtLong, cap, esc, r0, r1, toast, haptic, WD_SHORT } from './utils.js';

const MEAL_TYPES = [
  { id: 'desayuno', name: 'Desayuno', emoji: '🥐' },
  { id: 'comida',   name: 'Comida',   emoji: '🍝' },
  { id: 'merienda', name: 'Merienda', emoji: '🍎' },
  { id: 'cena',     name: 'Cena',     emoji: '🥗' },
  { id: 'snack',    name: 'Snack',    emoji: '🍫' },
];
const MACRO_COLORS = { protein: '#0a84ff', carbs: '#ff9f0a', fat: '#ff375f' };
const TYPE = id => MEAL_TYPES.find(t => t.id === id) || MEAL_TYPES[1];

// ---------- Favoritos por tipo de comida ----------
// Cada favorito guarda `types` (p. ej. ['desayuno']). Los antiguos sin `types` valen para todas.
let curType = 'comida';   // tipo de la comida que se está revisando
const typesOf = f => f.types || (f.type ? [f.type] : null);
const inType = (f, t = curType) => { const ts = typesOf(f); return !ts || ts.includes(t); };

// Etiquetas de un plato: las de la lista (o las que cambiaste a mano) o, si es favorito, las suyas
const ALL_TYPES = MEAL_TYPES.map(t => t.id);
const dishTypes = r => r.id != null ? (typesOf(r) || ALL_TYPES) : (state.settings.dishTags?.[r.name] || r.types);
async function setDishTypes(r, types) {
  if (r.id != null) {
    r.types = types;
    delete r.type;
    return db.putFavorite({ ...r });
  }
  const tags = { ...(state.settings.dishTags || {}) };
  if (types.length === r.types.length && types.every(t => r.types.includes(t))) delete tags[r.name];
  else tags[r.name] = types;
  state.settings.dishTags = tags;
  saveSettings();
}

// Marca o desmarca el favorito para el tipo `t`. Devuelve true si queda marcado.
async function toggleFavType(rec, t, create, put, del) {
  if (rec && inType(rec, t)) {
    const ts = (typesOf(rec) || MEAL_TYPES.map(x => x.id)).filter(x => x !== t);
    if (ts.length) await put({ ...rec, types: ts }); else await del(rec.id);
    return false;
  }
  if (rec) await put({ ...rec, types: [...typesOf(rec), t] });
  else await create([t]);
  return true;
}

let root;
let day = today();
let trend = 7; // 7 | 30 días
const MODE_KEY = 'gymfit-nut-mode';
let mode = 'comidas'; // 'comidas' | 'peso'
try { mode = localStorage.getItem(MODE_KEY) === 'peso' ? 'peso' : 'comidas'; } catch { /* nada */ }

export function initNutrition(el) {
  root = el;
  root.addEventListener('click', async e => {
    const nm = e.target.closest('[data-nmode]');
    if (nm) {
      mode = nm.dataset.nmode;
      try { localStorage.setItem(MODE_KEY, mode); } catch { /* nada */ }
      return renderNutrition();
    }
    const dn = e.target.closest('[data-dnav]');
    if (dn) { day = addDays(day, Number(dn.dataset.dnav)); return renderNutrition(); }
    if (e.target.closest('[data-today]')) { day = today(); return renderNutrition(); }
    const tr = e.target.closest('[data-trend]');
    if (tr) { trend = Number(tr.dataset.trend); return renderNutrition(); }
    if (e.target.closest('[data-steps]')) return openSteps();
    const meal = e.target.closest('[data-meal]');
    if (meal) {
      const all = await db.mealsByDate(keyOf(day));
      const m = all.find(x => x.id === Number(meal.dataset.meal));
      if (m) openReview({ ...m, items: m.items.map(i => ({ ...i })) }, true);
    }
  });

  document.getElementById('fab').addEventListener('click', () => mode === 'peso' ? openWeighIn() : openAddMenu());
  for (const id of ['cam-input', 'gal-input']) {
    document.getElementById(id).addEventListener('change', async e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) startPhotoFlow(file);
    });
  }
}

// ---------- Vista principal ----------
export async function renderNutrition() {
  document.getElementById('fab').setAttribute('aria-label', mode === 'peso' ? 'Apuntar peso' : 'Añadir comida');
  if (mode === 'peso') {
    root.innerHTML = `<h1 class="title">Nutrición</h1>${modeSeg()}<div id="weight"></div>`;
    return renderWeight(root.querySelector('#weight'));
  }
  const k = keyOf(day);
  const isToday = +day === +today();
  const S = state.settings;
  const meals = (await db.mealsByDate(k)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const tot = sum(meals);
  const over = tot.kcal > S.kcal;
  const left = S.kcal - tot.kcal;

  // Actividad: pasos y entreno del día
  await refreshBodyWeight();
  const steps = (await db.activityByDate(k))?.steps || 0;
  const wk = dayWorkout(k);
  const kSteps = stepsKcal(steps), kGym = wk?.kcal || 0, burned = kSteps + kGym;

  // Tendencia
  const from = addDays(today(), -(trend - 1));
  const trendMeals = await db.mealsBetween(keyOf(from), keyOf(today()));
  const byDay = {};
  trendMeals.forEach(m => { (byDay[m.date] ||= []).push(m); });
  const trendItems = [];
  for (let i = 0; i < trend; i++) {
    const d = addDays(from, i);
    const kc = sum(byDay[keyOf(d)] || []).kcal;
    const label = trend === 7 ? WD_SHORT[(d.getDay() + 6) % 7] : (i % 5 === 0 || i === trend - 1 ? String(d.getDate()) : '');
    trendItems.push({ label, value: kc, highlight: +d === +today(), color: kcalColor(kc, S.kcal) });
  }
  const loggedDays = Object.keys(byDay).length;
  const avg = loggedDays ? sum(trendMeals, loggedDays) : null;

  // Comidas agrupadas
  const groups = MEAL_TYPES.map(t => ({ ...t, meals: meals.filter(m => m.type === t.id) })).filter(g => g.meals.length);

  root.innerHTML = `
    <h1 class="title">Nutrición</h1>
    ${modeSeg()}
    <div class="date-nav">
      <button class="icon-btn" data-dnav="-1" aria-label="Día anterior">${chev('l')}</button>
      <div class="lbl">${isToday ? 'Hoy' : esc(cap(fmtLong(day)))}</div>
      <button class="icon-btn" data-dnav="1" ${isToday ? 'disabled' : ''} aria-label="Día siguiente">${chev('r')}</button>
    </div>

    <div class="card nut-head">
      <div class="ring-wrap">
        ${ring(tot.kcal, S.kcal, { size: 132, stroke: 14, color: kcalColor(tot.kcal, S.kcal) })}
        <div class="ring-center"><b>${r0(Math.abs(left))}</b><span>${over ? 'kcal de más' : 'kcal restantes'}</span></div>
      </div>
      <div class="macros">
        <div class="muted small" style="margin-bottom:10px"><b style="color:var(--text);font-family:var(--rounded);font-size:15px">${r0(tot.kcal)}</b> / ${S.kcal} kcal</div>
        ${macroBar('Proteína', tot.protein, S.protein, MACRO_COLORS.protein)}
        ${macroBar('Hidratos', tot.carbs, S.carbs, MACRO_COLORS.carbs)}
        ${macroBar('Grasa', tot.fat, S.fat, MACRO_COLORS.fat)}
      </div>
    </div>

    <div class="card act-card">
      <div class="card-head"><h3>🔥 Actividad</h3><span class="act-total"><b>${r0(burned)}</b> kcal quemadas</span></div>
      <div class="act-grid">
        <button class="act" data-steps>
          <span class="e">👟</span>
          <span class="t"><b>${steps ? steps.toLocaleString('es-ES') : 'Añadir pasos'}</b><small>${stepsLine(steps)}</small>${stepsBar(steps)}</span>
          <span class="k">${steps ? `${r0(kSteps)}<small>kcal</small>` : '+'}</span>
        </button>
        <div class="act">
          <span class="e">🏋️</span>
          <span class="t"><b>${wk ? `${wk.minutes} min` : 'Sin entreno'}</b><small>${wk ? (wk.assumed ? 'entreno (duración supuesta)' : 'de entreno') : 'Se suma al entrenar'}</small></span>
          <span class="k">${wk ? `${r0(kGym)}<small>kcal</small>` : '–'}</span>
        </div>
      </div>
      ${burned ? `<div class="act-note">Comido <b>${r0(tot.kcal)}</b> − actividad <b>${r0(burned)}</b> = <b>${r0(tot.kcal - burned)}</b> kcal netas</div>` : ''}
      ${basalKcal() ? `<div class="act-note muted small">Gasto del día ≈ <b>${r0(basalKcal() + burned).toLocaleString('es-ES')}</b> kcal (basal ${r0(basalKcal()).toLocaleString('es-ES')} + actividad ${r0(burned)})</div>` : ''}
      ${hasBodyWeight() ? '' : `<div class="act-note muted">Calculado con ${bodyKg()} kg: apunta tu peso en ⚖️ Peso para afinar.</div>`}
    </div>

    ${!isToday ? `<button class="btn secondary" data-today style="margin-bottom:6px">Volver a hoy</button>` : ''}

    ${groups.length ? groups.map(g => `
      <div class="meal-group">
        <div class="meal-group-head"><h3>${g.emoji} ${g.name}</h3><span>${r0(sum(g.meals).kcal)} kcal</span></div>
        ${g.meals.map(mealRow).join('')}
      </div>`).join('') : `
      <div class="card empty">
        <span class="e">📸</span>
        <b>${isToday ? 'Aún no has registrado comidas' : 'Sin comidas este día'}</b>
        Pulsa <b style="display:inline;font-size:inherit">+</b> para añadir con foto, voz o código de barras.
      </div>`}

    <div class="card" style="margin-top:18px">
      <div class="card-head">
        <h3>Calorías</h3>
        <div class="seg">
          <button data-trend="7" class="${trend === 7 ? 'on' : ''}">7 días</button>
          <button data-trend="30" class="${trend === 30 ? 'on' : ''}">30 días</button>
        </div>
      </div>
      ${bars(trendItems, { height: 150, goal: S.kcal, showValues: trend === 7 })}
      ${avg ? `
        <div class="totals-row" style="margin:14px 0 0">
          <div><b>${r0(avg.kcal)}</b><span>kcal/día</span></div>
          <div><b class="p-c">${r0(avg.protein)}g</b><span>proteína</span></div>
          <div><b class="c-c">${r0(avg.carbs)}g</b><span>hidratos</span></div>
          <div><b class="f-c">${r0(avg.fat)}g</b><span>grasa</span></div>
        </div>` : ''}
    </div>`;
}

const modeSeg = () => `
  <div class="seg wide">
    <button data-nmode="comidas" class="${mode === 'comidas' ? 'on' : ''}">🍽️ Comidas</button>
    <button data-nmode="peso" class="${mode === 'peso' ? 'on' : ''}">⚖️ Peso</button>
  </div>`;

// Verde: ±200 kcal del objetivo · Amarillo: entre 200 y 500 · Rojo: más de 500 por arriba o por abajo
function kcalColor(kcal, goal) {
  const diff = Math.abs(kcal - goal);
  return diff <= 200 ? 'var(--accent)' : diff <= 500 ? 'var(--yellow)' : 'var(--danger)';
}

function macroBar(name, value, goal, color) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  return `<div class="macro" style="--c:${color}">
    <div class="macro-top">${name}<span><b style="color:var(--text)">${r0(value)}</b> / ${goal} g</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function mealRow(m) {
  return `<button class="meal" data-meal="${m.id}">
    ${m.photo ? `<img src="${m.photo}" alt="">` : `<div class="ph">${MEAL_TYPES.find(t => t.id === m.type)?.emoji || '🍽️'}</div>`}
    <div class="info">
      <div class="name">${esc(m.name)}</div>
      <div class="mac"><span><b class="p-c">P</b> ${r0(m.protein)}g</span><span><b class="c-c">H</b> ${r0(m.carbs)}g</span><span><b class="f-c">G</b> ${r0(m.fat)}g</span></div>
    </div>
    ${gradeBadge(mealScore(m))}
    <div class="kcal">${r0(m.kcal)}<small>kcal</small></div>
  </button>`;
}

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

const gradeBadge = s => s ? `<span class="grade" style="--c:${s.c}" title="Nota ${r1(s.score)}/10">${s.g}</span>` : '';

function scoreCard(s) {
  if (!s) return '<div class="muted small">Añade alimentos para ver la puntuación.</div>';
  const pct = x => `${r0(x * 100)} %`;
  return `<div class="score-head">
      <span class="grade big" style="--c:${s.c}">${s.g}</span>
      <div><b>${s.t} · ${r1(s.score).toLocaleString('es-ES')}/10</b></div>
    </div>
    ${s.per100 ? `<div class="per100"><span>Por 100 g</span>
      <b>${r0(s.per100.kcal)} kcal</b><b class="p-c">P ${r1(s.per100.protein)}</b><b class="c-c">H ${r1(s.per100.carbs)}</b><b class="f-c">G ${r1(s.per100.fat)}</b></div>` : ''}
    <div class="score-why">
      <span>Proteína: <b>${pct(s.pShare)}</b> de las kcal</span>
      ${s.density !== null ? `<span>Densidad: <b>${r1(s.density).toLocaleString('es-ES')}</b> kcal/g</span>` : ''}
      <span>Grasa: <b>${pct(s.fShare)}</b> de las kcal</span>
    </div>`;
}

// ---------- Pasos del día ----------
const stepsGoal = () => +state.settings.stepsGoal || 0;
// «6.200 / 8.000 pasos · 4,3 km» y barra de progreso hacia el objetivo
function stepsLine(steps) {
  const g = stepsGoal();
  if (!steps) return g ? `Objetivo: ${g.toLocaleString('es-ES')} pasos` : 'Toca para apuntarlos';
  const km = `${r1(stepsKm(steps)).toLocaleString('es-ES')} km`;
  if (!g) return `pasos · ${km}`;
  return steps >= g ? `🎯 ¡Objetivo cumplido! · ${km}` : `de ${g.toLocaleString('es-ES')} pasos · ${km}`;
}
function stepsBar(steps) {
  const g = stepsGoal();
  if (!g) return '';
  const pct = Math.min(100, Math.round(steps / g * 100));
  return `<i class="steps-bar${steps >= g ? ' done' : ''}"><i style="width:${pct}%"></i></i>`;
}

async function openSteps() {
  const k = keyOf(day);
  const current = (await db.activityByDate(k))?.steps || 0;
  const est = n => n > 0 ? `≈ <b>${r1(stepsKm(n)).toLocaleString('es-ES')} km</b> · <b>${r0(stepsKcal(n))} kcal</b> quemadas` : 'Escribe tus pasos para ver la estimación';
  openSheet(`
    <h2 class="sheet-title">Pasos</h2>
    <div class="muted small">${+day === +today() ? 'Hoy' : esc(cap(fmtLong(day)))}</div>
    <label class="field"><span>Pasos caminados</span>
      <input id="steps" type="number" inputmode="numeric" min="0" step="1" placeholder="Ej: 8500" value="${current || ''}">
    </label>
    <div class="chips" style="margin-top:10px">
      ${[1000, 2500, 5000].map(n => `<button class="chip" data-plus="${n}" style="--c:var(--accent)">+${n.toLocaleString('es-ES')}</button>`).join('')}
    </div>
    <div class="notice" id="steps-est">${est(current)}</div>
    ${stepsGoal() ? `<div class="muted small" style="margin-top:8px">🎯 Tu objetivo: <b>${stepsGoal().toLocaleString('es-ES')} pasos</b> (cámbialo en Ajustes)</div>` : ''}
    <div class="muted small" style="margin-top:10px;line-height:1.45">Los tienes en la app <b>Salud</b> del iPhone → Explorar → Actividad → Pasos.
      La estimación usa tu peso (${r1(bodyKg()).toLocaleString('es-ES')} kg${hasBodyWeight() ? '' : ', por defecto'})${state.settings.height ? ' y tu altura' : ''}, y cuenta solo lo que gastas de más al caminar.</div>
    <div style="margin-top:18px">
      <button class="btn primary" id="save">Guardar</button>
      ${current ? '<button class="btn ghost danger" id="del">Borrar pasos</button>' : ''}
    </div>`, body => {
    const inp = body.querySelector('#steps');
    const upd = () => { body.querySelector('#steps-est').innerHTML = est(parseInt(inp.value, 10) || 0); };
    inp.addEventListener('input', upd);
    body.addEventListener('click', async e => {
      const plus = e.target.closest('[data-plus]');
      if (plus) { inp.value = (parseInt(inp.value, 10) || 0) + Number(plus.dataset.plus); haptic(); return upd(); }
      if (e.target.closest('#save')) {
        const n = parseInt(inp.value, 10) || 0;
        if (n > 0) await db.putActivity({ date: k, steps: n, updatedAt: Date.now() });
        else await db.deleteActivity(k);
        haptic(); closeSheet(); renderNutrition();
        return toast(n > 0 ? 'Pasos guardados 👟' : 'Pasos borrados');
      }
      if (e.target.closest('#del')) {
        await db.deleteActivity(k);
        closeSheet(); renderNutrition(); toast('Pasos borrados');
      }
    });
    setTimeout(() => inp.focus(), 350);
  });
}

function sum(meals, divideBy = 1) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of meals) { t.kcal += +m.kcal || 0; t.protein += +m.protein || 0; t.carbs += +m.carbs || 0; t.fat += +m.fat || 0; }
  for (const k in t) t[k] /= divideBy;
  return t;
}

// ---------- Añadir comida ----------
function openAddMenu(inPlace = false) {
  pickerState.q = '';          // cada comida nueva empieza con el buscador vacío
  const tile = (a, emoji, title, sub, color) =>
    `<button class="tile" data-a="${a}" style="--c:${color}"><span class="e">${emoji}</span><b>${title}</b></button>`;

  (inPlace ? setSheetContent : openSheet)(`
    <h2 class="sheet-title">Añadir comida</h2>
    ${+day === +today() ? '' : `<div class="muted small">Se guardará el ${esc(fmtLong(day))}</div>`}
    <div class="tiles">
      ${tile('cam', '📷', 'Foto', 'La IA lo calcula', 'var(--accent)')}
      ${tile('txt', '🎙️', 'Describir', 'Por texto o voz', 'var(--purple)')}
      ${tile('bar', '🏷️', 'Código de barras', 'Envasados exactos', 'var(--blue)')}
      ${tile('gal', '🖼️', 'Galería', 'Foto que ya tengas', 'var(--orange)')}
    </div>
    <button class="action" data-a="man" style="--c:color-mix(in srgb,var(--muted) 22%,transparent);margin-top:10px"><span class="e">✍️</span><b>Introducir a mano</b></button>
    <button class="action" data-a="list" style="--c:color-mix(in srgb,var(--muted) 22%,transparent);margin-top:10px"><span class="e">📋</span><b>Lista de alimentos</b></button>
    <div id="favs"></div>
    <div id="recent"></div>`, body => {
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'cam') { closeSheet(true); document.getElementById('cam-input').click(); }
      if (a === 'gal') { closeSheet(true); document.getElementById('gal-input').click(); }
      if (a === 'txt') openDescribe();
      if (a === 'bar') openScanner(product => openReview(newDraft(productToDraft(product)), false, true));
      if (a === 'man') openReview(newDraft({ items: [blankItem()] }), false, true);
      if (a === 'list') { browserState.q = ''; openFoodBrowser(); }
      const r = e.target.closest('[data-recent]');
      if (r) repeatMeal(recentCache[Number(r.dataset.recent)]);
      const f = e.target.closest('[data-fav]');
      if (f) repeatMeal(favCache[Number(f.dataset.fav)], favType);
      const ft = e.target.closest('[data-ftype]');
      if (ft) { favType = ft.dataset.ftype; haptic(); paintFavList(body.querySelector('#favs')); }
    });
    renderFavorites(body.querySelector('#favs'));
    renderRecent(body.querySelector('#recent'));
  });
}

const recentRow = (m, attr) => `
  <button class="recent" ${attr}>
    ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${MEAL_TYPES.find(t => t.id === (m.type || m.types?.[0]))?.emoji || '🍽️'}</span>`}
    <span class="n">${esc(m.name)}</span>
    ${gradeBadge(mealScore(m))}
    <span class="k">${r0(m.kcal)} kcal</span>
  </button>`;

// Desplegable (cerrado por defecto) para favoritas y recientes
const fold = (title, count, inner) => `
  <details class="fold">
    <summary><span>${title}</span><span class="cnt">${count}</span>${chev('r')}</summary>
    <div class="fold-body">${inner}</div>
  </details>`;

// ---------- Comidas favoritas ----------
let favCache = [];
const favKey = name => String(name || '').trim().toLowerCase();

async function loadFavorites() {
  favCache = (await db.allFavorites()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return favCache;
}

// Favoritos del menú «Añadir comida»: pestañas por tipo (empieza en el de la hora actual)
let favType = 'comida';
async function renderFavorites(el) {
  await loadFavorites();
  if (!el.isConnected) return;
  favType = defaultType();
  el.innerHTML = fold('⭐ Platos favoritos', favCache.length, favCache.length
    ? `<div class="chips scroll fav-types">${MEAL_TYPES.map(t => {
        const n = favCache.filter(f => inType(f, t.id)).length;
        return `<button class="chip" data-ftype="${t.id}" style="--c:var(--accent)">${t.emoji} ${t.name}${n ? ` · ${n}` : ''}</button>`;
      }).join('')}</div><div data-favlist></div>`
    : '<div class="muted small" style="margin:0 2px">Al revisar una comida, pulsa ☆ para guardar el plato en los favoritos de ese desayuno, comida, cena…</div>');
  if (favCache.length) paintFavList(el);
}

function paintFavList(el) {
  el.querySelectorAll('[data-ftype]').forEach(b => b.classList.toggle('on', b.dataset.ftype === favType));
  const list = favCache.map((m, i) => [m, i]).filter(([m]) => inType(m, favType));
  el.querySelector('[data-favlist]').innerHTML = list.length
    ? `<div class="recent-list">${list.map(([m, i]) => recentRow(m, `data-fav="${i}"`)).join('')}</div>`
    : `<div class="muted small" style="margin:6px 2px 0">No tienes platos favoritos de ${TYPE(favType).name.toLowerCase()}. Al revisar una comida de ${TYPE(favType).name.toLowerCase()}, pulsa ☆ para guardarla aquí.</div>`;
}

// ---------- Comidas recientes (repetir con un toque) ----------
let recentCache = [];
async function renderRecent(el) {
  const from = keyOf(addDays(today(), -45));
  const meals = (await db.mealsBetween(from, keyOf(today()))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const seen = new Set();
  recentCache = meals.filter(m => { const k = m.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  if (!recentCache.length || !el.isConnected) return;
  el.innerHTML = fold('🕘 Recientes', recentCache.length,
    `<div class="recent-list">${recentCache.map((m, i) => recentRow(m, `data-recent="${i}"`)).join('')}</div>`);
}

function repeatMeal(m, type) {
  if (!m) return;
  openReview(newDraft({ name: m.name, photo: m.photo, items: m.items.map(i => ({ ...i })), ...(type ? { type } : {}) }), false, true);
}

// ---------- Describir por texto o voz ----------
function openDescribe(initial = '') {
  const hasKey = hasAiKey();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  setSheetContent(`
    <h2 class="sheet-title">Describe tu comida</h2>
    <div class="muted small">Cuanto más concreto, mejor: cantidades, cómo está cocinado…</div>
    <label class="field">
      <textarea id="desc" rows="4" placeholder="Ej: dos huevos fritos con una tostada de pan con aceite y un café con leche">${esc(initial)}</textarea>
    </label>
    <button class="mic-btn" id="mic" type="button">
      <span class="mic-dot"></span><span id="mic-label">${SR ? 'Toca para dictar' : 'Usa el micrófono 🎙️ del teclado para dictar'}</span>
    </button>
    ${hasKey ? '' : '<div class="notice">Para calcular con IA añade tu clave gratuita de Gemini en <b>Ajustes</b>.</div>'}
    <div style="margin-top:16px">
      <button class="btn primary" id="go" ${hasKey ? '' : 'disabled'}>✨ Calcular con IA</button>
    </div>`, body => {
    const ta = body.querySelector('#desc');
    const mic = body.querySelector('#mic');
    const label = body.querySelector('#mic-label');
    let rec = null, base = '';

    const stop = () => { try { rec?.stop(); } catch { /* nada */ } };
    onSheetCleanup(stop);

    mic.addEventListener('click', () => {
      if (!SR) { ta.focus(); return; }
      if (rec) { stop(); return; }
      rec = new SR();
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.continuous = true;
      base = ta.value ? ta.value.trim() + ' ' : '';
      rec.onresult = ev => {
        let txt = '';
        for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        ta.value = base + txt;
      };
      rec.onerror = ev => {
        toast(ev.error === 'not-allowed' ? 'Permite el micrófono en Ajustes del iPhone' : 'No se pudo dictar: usa el micrófono del teclado');
      };
      rec.onend = () => { rec = null; mic.classList.remove('on'); label.textContent = 'Toca para dictar'; };
      try {
        rec.start();
        mic.classList.add('on');
        label.textContent = 'Escuchando… toca para parar';
        haptic();
      } catch {
        rec = null;
        toast('Usa el micrófono del teclado para dictar');
      }
    });

    body.querySelector('#go').addEventListener('click', () => {
      stop();
      const text = ta.value.trim();
      if (text.length < 3) return toast('Escribe o dicta qué has comido');
      runTextAnalysis(text);
    });
    setTimeout(() => { if (!SR) ta.focus(); }, 350);
  });
}

async function runTextAnalysis(text) {
  setSheetContent(`
    <div class="loading">
      <div class="loading-emoji">🍽️</div>
      <b>Calculando…</b>
      <span>“${esc(text.length > 80 ? text.slice(0, 80) + '…' : text)}”</span>
      <div class="spinner"></div>
    </div>`);
  try {
    const res = await analyzeText(text);
    if (!res.items.length) throw new Error('No he reconocido ninguna comida en la descripción.');
    haptic();
    openReview(newDraft({ name: res.name, confidence: res.confidence, items: res.items }), false, false, true);
  } catch (err) {
    setSheetContent(`
      <h2 class="sheet-title">No se pudo calcular</h2>
      <div class="notice err">${esc(err.message)}</div>
      <div style="margin-top:18px">
        <button class="btn primary" id="retry">Reintentar</button>
        <button class="btn secondary" id="edit">Cambiar descripción</button>
      </div>`, body => {
      body.querySelector('#retry').addEventListener('click', () => runTextAnalysis(text));
      body.querySelector('#edit').addEventListener('click', () => openDescribe(text));
    });
  }
}

// ---------- Código de barras → borrador de comida ----------
function productToDraft(p) {
  const grams = p.servingGrams || 100;
  const k = grams / 100;
  return {
    name: p.name,
    photo: p.image || null,
    confidence: null,
    items: [{
      name: p.name,
      grams,
      kcal: r0(p.per100.kcal * k),
      protein: r1(p.per100.protein * k),
      carbs: r1(p.per100.carbs * k),
      fat: r1(p.per100.fat * k),
    }],
    note: p.servingGrams ? `Ración del envase: ${p.servingLabel || grams + ' g'}. Cambia los gramos si has tomado otra cantidad.` : 'Valores para 100 g. Cambia los gramos a lo que hayas tomado.',
  };
}

function defaultType() {
  if (+day !== +today()) return 'comida';
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 16 ? 'comida' : h < 19 ? 'merienda' : 'cena';
}
const blankItem = () => ({ name: '', grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0 });
const newDraft = (extra = {}) => ({ date: keyOf(day), type: defaultType(), name: '', photo: null, confidence: null, items: [], ...extra });

async function startPhotoFlow(file) {
  let big, thumb;
  try {
    const img = await loadImage(file);
    big = toJpeg(img, 1024, 0.78);   // para enviar a la IA (más pequeña = sube y se procesa antes)
    thumb = toJpeg(img, 480, 0.72);  // para guardar en el iPhone
  } catch {
    return toast('No he podido abrir la foto');
  }
  const hasKey = hasAiKey();

  openSheet(`
    <h2 class="sheet-title">Analizar comida</h2>
    <img class="preview" src="${thumb}" alt="Foto de la comida">
    <label class="field"><span>Contexto (opcional)</span>
      <input id="ctx" placeholder="Ej: media ración, frito con aceite de oliva">
    </label>
    ${hasKey ? '' : '<div class="notice">Para analizar fotos con IA añade tu clave gratuita de Gemini en <b>Ajustes</b>. Mientras tanto puedes introducir los datos a mano.</div>'}
    <div style="margin-top:18px">
      <button class="btn primary" id="go" ${hasKey ? '' : 'disabled'}>✨ Analizar con IA</button>
      <button class="btn secondary" id="manual">Introducir a mano</button>
    </div>`, body => {
    body.querySelector('#manual').addEventListener('click', () =>
      openReview(newDraft({ photo: thumb, items: [blankItem()] }), false, true));
    body.querySelector('#go').addEventListener('click', () =>
      runAnalysis(big, thumb, body.querySelector('#ctx').value.trim()));
  });
}

async function runAnalysis(big, thumb, ctx) {
  setSheetContent(`
    <div class="loading">
      <img src="${thumb}" alt="">
      <b>Analizando tu comida…</b>
      <span>Identificando alimentos y raciones</span>
      <div class="spinner"></div>
    </div>`);
  try {
    const res = await analyzeFood(big, ctx);
    if (!res.items.length) throw new Error('No he encontrado comida en la foto.');
    haptic();
    openReview(newDraft({ photo: thumb, name: res.name, confidence: res.confidence, items: res.items }), false, false, true);
  } catch (err) {
    setSheetContent(`
      <h2 class="sheet-title">No se pudo analizar</h2>
      <img class="preview" src="${thumb}" alt="">
      <div class="notice err">${esc(err.message)}</div>
      <div style="margin-top:18px">
        <button class="btn primary" id="retry">Reintentar</button>
        <button class="btn secondary" id="manual">Introducir a mano</button>
      </div>`, body => {
      body.querySelector('#retry').addEventListener('click', () => runAnalysis(big, thumb, ctx));
      body.querySelector('#manual').addEventListener('click', () =>
        openReview(newDraft({ photo: thumb, items: [blankItem()] }), false, true));
    });
  }
}

// ---------- Revisión / edición de una comida ----------
// Guarda una "base" por alimento para escalar macros al cambiar los gramos
function withBase(item) {
  return { ...item, base: { grams: +item.grams || 0, kcal: +item.kcal || 0, protein: +item.protein || 0, carbs: +item.carbs || 0, fat: +item.fat || 0 } };
}

let pendingFood = null;   // producto escaneado desde el desplegable, para abrirlo al volver

function openReview(draft, editing = false, fresh = false, inPlace = false) {
  draft.items = draft.items.map(withBase);
  curType = draft.type;
  const dish = draft.mode === 'dish';   // crear/editar un plato de «Mis platos» en vez de una comida
  const conf = { low: 'Confianza baja · revisa las cantidades', medium: 'Confianza media', high: 'Confianza alta' };

  const render = () => `
    ${dish ? `<button class="link back" id="dish-back">${chev('l')} Lista de alimentos</button>` : ''}
    <div class="sheet-title-row">
      <h2 class="sheet-title">${dish ? (editing ? 'Editar plato' : 'Crear plato') : editing ? 'Editar comida' : 'Revisa y guarda'}</h2>
      <button class="icon-btn star" id="fav" aria-label="Guardar plato en favoritos" ${dish ? 'hidden' : ''}>☆</button>
    </div>
    <div class="review-top">
      ${draft.photo ? `<img src="${draft.photo}" alt="">` : ''}
      <label class="field"><span>${dish ? 'Nombre del plato' : 'Nombre'}</span><input id="mname" value="${esc(draft.name)}" placeholder="Ej: Pollo con arroz"></label>
    </div>
    ${draft.confidence ? `<span class="badge ${draft.confidence}">● ${conf[draft.confidence]}</span>` : ''}
    ${draft.note ? `<div class="notice">${esc(draft.note)}</div>` : ''}
    ${dish ? `<div class="label">🏷️ ¿En qué comidas aparece?</div>
    ${typeChips(t => draft.types.includes(t), 'data-dtype')}` : `<label class="field"><span>Tipo de comida</span>
      <select id="mtype">${MEAL_TYPES.map(t => `<option value="${t.id}" ${t.id === draft.type ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}</select>
    </label>`}
    ${editing ? '' : `
    <div class="label">${dish ? 'Partir de un plato (opcional)' : 'Platos'}</div>
    <button class="btn secondary add-toggle" id="dish-toggle"><span>🍳 Elegir un plato</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="picker-panel" id="dishes" hidden></div>`}
    <div class="label">Alimentos</div>
    <div id="items">${draft.items.length ? draft.items.map(itemCard).join('') : '<div class="hint-card">Aún no hay alimentos. Pulsa <b>Añadir alimento</b>.</div>'}</div>
    <button class="btn secondary add-toggle" id="add-item"><span>＋ Añadir alimento</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="picker-panel" id="picker" hidden></div>
    <div class="label">Puntuación</div>
    <div class="card score-card" id="score"></div>
    ${editing ? `<button class="btn ghost danger" id="del">${dish ? 'Borrar plato' : 'Borrar comida'}</button>` : ''}
    <div class="totals">
      <div class="totals-row" id="totals"></div>
      <button class="btn primary" id="save">${dish ? 'Guardar plato' : 'Guardar'}</button>
    </div>`;

  const mount = body => {
    const updateTotals = () => {
      const t = draft.items.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0), carbs: a.carbs + (+i.carbs || 0), fat: a.fat + (+i.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      body.querySelector('#totals').innerHTML = `
        <div><b>${r0(t.kcal)}</b><span>kcal</span></div>
        <div><b class="p-c">${r0(t.protein)}g</b><span>proteína</span></div>
        <div><b class="c-c">${r0(t.carbs)}g</b><span>hidratos</span></div>
        <div><b class="f-c">${r0(t.fat)}g</b><span>grasa</span></div>`;
      body.querySelector('#score').innerHTML = scoreCard(mealScore({ items: draft.items }));
      return t;
    };
    updateTotals();

    // Comida lista para guardar (sin los datos internos de escalado)
    const buildMeal = () => {
      const t = updateTotals();
      const items = draft.items
        .filter(i => i.name.trim() || i.kcal)
        .map(({ base, ...i }) => ({ ...i, name: i.name.trim() || 'Alimento' }));
      return {
        items,
        name: draft.name.trim() || items.map(i => i.name).slice(0, 2).join(' y '),
        kcal: r0(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat),
      };
    };

    // Favorita: se reconoce por el nombre
    const star = body.querySelector('#fav');
    const findFav = () => { const n = favKey(draft.name || buildMeal().name); return n ? favCache.find(f => favKey(f.name) === n) : null; };
    const paintStar = () => {
      const f = findFav();
      const on = !!f && inType(f, draft.type);
      const tn = TYPE(draft.type).name.toLowerCase();
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
      star.setAttribute('aria-label', on ? `Quitar de favoritos de ${tn}` : `Guardar en favoritos de ${tn}`);
    };
    const paintItemStars = () => body.querySelectorAll('[data-ifav]').forEach(b => {
      const on = isFoodFav(draft.items[Number(b.dataset.ifav)]?.name);
      b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
    });
    loadFavorites().then(() => { if (star.isConnected) paintStar(); });
    loadFoodFavs().then(paintItemStars);
    star.addEventListener('click', async () => {
      const m = buildMeal();
      const t = TYPE(draft.type);
      const f = findFav();
      if (!f && !m.items.length) return toast('Añade al menos un alimento');
      const on = await toggleFavType(f, draft.type,
        types => db.putFavorite({ name: m.name, types, photo: draft.photo || null, items: m.items,
          kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, createdAt: Date.now() }),
        db.putFavorite, db.deleteFavorite);
      toast(on ? `Guardado en favoritos de ${t.name.toLowerCase()} ${t.emoji}` : `Quitado de favoritos de ${t.name.toLowerCase()}`);
      haptic();
      await loadFavorites();
      paintStar();
    });

    body.querySelector('#mname').addEventListener('input', e => { draft.name = e.target.value; paintStar(); });
    body.querySelector('#dish-back')?.addEventListener('click', () => openFoodBrowser('dishes'));
    body.querySelectorAll('[data-dtype]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.dtype;
      const ts = new Set(draft.types);
      ts.has(t) ? ts.delete(t) : ts.add(t);
      if (!ts.size) return toast('Déjalo al menos en una comida');
      draft.types = ALL_TYPES.filter(x => ts.has(x));
      b.classList.toggle('on', ts.has(t));
      haptic();
    }));
    body.querySelector('#mtype')?.addEventListener('change', e => {
      draft.type = curType = e.target.value;
      paintStar();
      paintItemStars();
      if (!body.querySelector('#picker').hidden && body.querySelector('#pk-q')) setPanel(true);
      const dp = body.querySelector('#dishes');
      if (dp && !dp.hidden) dp.repaint?.();
    });

    body.querySelector('#items').addEventListener('input', e => {
      const card = e.target.closest('[data-i]');
      if (!card) return;
      const it = draft.items[Number(card.dataset.i)];
      const f = e.target.dataset.f;
      if (f === 'name') { it.name = e.target.value; return; }
      const v = parseFloat(String(e.target.value).replace(',', '.')) || 0;
      if (f === 'grams') {
        setItemGrams(it, card, v, false);
      } else {
        it[f] = v;
        it.base = { grams: +it.grams || 0, kcal: +it.kcal || 0, protein: +it.protein || 0, carbs: +it.carbs || 0, fat: +it.fat || 0 };
      }
      updateTotals();
    });

    body.querySelector('#items').addEventListener('click', async e => {
      // − / + en alimentos que van por unidades (huevos, lonchas, cucharadas…)
      const ud = e.target.closest('[data-ud]');
      if (ud) {
        const card = ud.closest('[data-i]');
        const it = draft.items[Number(card.dataset.i)];
        let n = (+it.grams || 0) / it.unitG;
        n = Number(ud.dataset.ud) > 0 ? Math.floor(n + 1e-6) + 1 : Math.ceil(n - 1e-6) - 1;
        if (n < 1) n = 0.5;
        setItemGrams(it, card, n * it.unitG, true);
        haptic();
        return updateTotals();
      }
      // ☆ en un alimento: guardarlo en Mis alimentos con sus valores por 100 g
      const fb = e.target.closest('[data-ifav]');
      if (fb) {
        const it = draft.items[Number(fb.dataset.ifav)];
        const g = +it.grams || 0;
        if (!it.name.trim()) return toast('Ponle nombre al alimento');
        if (!(g > 0) || !(+it.kcal > 0)) return toast('Indica gramos y kcal para guardarlo');
        await loadFoodFavs();
        const k = 100 / g;
        await toggleFoodFav({ name: it.name, per100: { kcal: it.kcal * k, protein: it.protein * k, carbs: it.carbs * k, fat: it.fat * k },
          portions: it.unitG ? [[it.unitLabel, it.unitG]] : [['ración', g]] });
        haptic();
        paintItemStars();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (!del) return;
      draft.items.splice(Number(del.dataset.del), 1);
      setSheetContent(render(), mount);
    });

    // Desplegable «Añadir alimento»
    const panel = body.querySelector('#picker');
    const toggleBtn = body.querySelector('#add-item');
    const repaintItems = () => {
      body.querySelector('#items').innerHTML = draft.items.map(itemCard).join('');
      updateTotals();
    };
    const setPanel = (open, food = null) => {
      panel.hidden = !open;
      toggleBtn.classList.toggle('open', open);
      toggleBtn.querySelector('span').textContent = open ? 'Cerrar' : '＋ Añadir alimento';
      if (!open) { panel.innerHTML = ''; return; }
      if (food) mountPortion(panel, food, pickCtx); else mountFoodPicker(panel, pickCtx);
    };
    const pickCtx = {
      onPick: item => {
        // Las filas vacías (sin nombre ni kcal) se sustituyen por el alimento elegido
        draft.items = draft.items.filter(i => i.name.trim() || +i.kcal);
        draft.items.push(withBase(item));
        repaintItems();
        setPanel(false);
        toast(`${item.name} añadido`);
        toggleBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      onManual: () => {
        draft.items.push(withBase(blankItem()));
        repaintItems();
        setPanel(false);
        const inputs = body.querySelectorAll('#items [data-f="name"]');
        inputs[inputs.length - 1]?.focus();
      },
      // El escáner ocupa la hoja; al terminar se vuelve a esta comida con el producto abierto
      onScan: () => openScanner(
        product => { pendingFood = productToFood(product); openReview(draft, editing, false, true); },
        () => openReview(draft, editing, false, true)),
    };
    toggleBtn.addEventListener('click', () => setPanel(panel.hidden));

    // Desplegable «Elegir un plato»: pone el nombre y añade sus ingredientes
    const dishBtn = body.querySelector('#dish-toggle');
    const dishPanel = body.querySelector('#dishes');
    const shortName = n => n.replace(/\s*\(.*\)$/, '').replace(/ \/.*$/, '');
    const setDishPanel = open => {
      dishPanel.hidden = !open;
      dishBtn.classList.toggle('open', open);
      dishBtn.querySelector('span').textContent = open ? 'Cerrar' : '🍳 Elegir un plato';
      if (!open) { dishPanel.innerHTML = ''; return; }
      let list = [], qv = '', all = false, editing = -1;
      const box = freshBox(dishPanel);
      box.innerHTML = `
        <input class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Busca cualquier plato: tortilla, arroz con pollo…">
        <div data-dl></div>`;
      const dishRow = (r, i) => `
        <button class="food-row" data-dish="${i}">
          ${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="e">${r.emoji || TYPE(typesOf(r)?.[0]).emoji}</span>`}
          <span class="n">${esc(r.name)}<small>${esc(r.items.slice(0, 4).map(x => shortName(x.name)).join(', '))}${r.items.length > 4 ? '…' : ''} · ${r0(r.kcal)} kcal</small></span>
          <span class="tagbtn ${editing === i ? 'on' : ''}" data-tags="${i}" role="button" aria-label="Cambiar en qué comidas aparece">🏷️</span>
          <span class="plus">+</span>
        </button>
        ${editing === i ? tagEditor(r) : ''}`;
      const tagEditor = r => {
        const ts = dishTypes(r);
        return `<div class="tag-editor">
          <div class="muted small">¿En qué comidas quieres que aparezca?</div>
          <div class="chips">${MEAL_TYPES.map(t => `<button class="chip ${ts.includes(t.id) ? 'on' : ''}" data-tt="${t.id}" style="--c:var(--accent)">${t.emoji} ${t.name}</button>`).join('')}</div>
          <button class="link" data-tdone>Listo</button>
        </div>`;
      };
      // Sin búsqueda: tus favoritos y los platos de este tipo de comida. Buscando: todos.
      const paintDishes = () => {
        const t = TYPE(draft.type);
        const words = norm(qv).split(/\s+/).filter(Boolean);
        const favs = favCache.filter(f => f.items?.length && (words.length ? words.every(w => norm(f.name).includes(w)) : all || inType(f, draft.type)));
        const recs = searchRecipes(qv, all ? null : draft.type, dishTypes);
        // Mientras editas las etiquetas de un plato, sigue en la lista aunque le quites esta comida
        const ed = editing >= 0 ? list[editing] : null;
        if (ed && !favs.includes(ed) && !recs.includes(ed)) (ed.id != null ? favs : recs).unshift(ed);
        if (ed) editing = [...favs, ...recs].indexOf(ed);
        list = [...favs, ...recs];
        let i = 0;
        const sec = (title, arr) => arr.length ? `<div class="label">${title}</div><div class="food-list">${arr.map(r => dishRow(r, i++)).join('')}</div>` : '';
        const tail = words.length ? '' : `<button class="link" data-allp style="margin:8px 2px 0">${all ? `Ver solo los de ${t.name.toLowerCase()}` : 'Ver todos los platos'}</button>`;
        box.querySelector('[data-dl]').innerHTML = list.length
          ? sec('⭐ Tus platos favoritos', favs) + sec(words.length || all ? '🍳 Platos' : `🍳 Platos de ${t.name.toLowerCase()} ${t.emoji}`, recs) + tail
          : (words.length ? '<div class="muted small" style="text-align:center;margin:10px 0">No hay ningún plato con ese nombre. Añade los alimentos uno a uno 👇</div>'
            : `<div class="muted small" style="text-align:center;margin:10px 0">No hay platos de ${t.name.toLowerCase()}. Busca uno arriba.</div>${tail}`);
      };
      dishPanel.repaint = paintDishes;
      paintDishes();
      box.querySelector('.search').addEventListener('input', e => { qv = e.target.value; editing = -1; paintDishes(); });
      box.addEventListener('click', async e => {
        if (e.target.closest('[data-allp]')) { all = !all; editing = -1; return paintDishes(); }
        // 🏷️ abre/cierra el editor de etiquetas de ese plato
        const tb = e.target.closest('[data-tags]');
        if (tb) { const i = Number(tb.dataset.tags); editing = editing === i ? -1 : i; haptic(); return paintDishes(); }
        if (e.target.closest('[data-tdone]')) { editing = -1; return paintDishes(); }
        const tt = e.target.closest('[data-tt]');
        if (tt) {
          const r = list[editing];
          const ts = new Set(dishTypes(r));
          ts.has(tt.dataset.tt) ? ts.delete(tt.dataset.tt) : ts.add(tt.dataset.tt);
          if (!ts.size) return toast('Déjalo al menos en una comida');
          await setDishTypes(r, ALL_TYPES.filter(t => ts.has(t)));
          tt.classList.toggle('on', ts.has(tt.dataset.tt));
          haptic();
          return;
        }
        const d = e.target.closest('[data-dish]');
        if (!d) return;
        const r = list[Number(d.dataset.dish)];
        draft.name = r.name;
        body.querySelector('#mname').value = r.name;
        paintStar();
        draft.items = draft.items.filter(i => i.name.trim() || +i.kcal);
        r.items.forEach(i => draft.items.push(withBase({ ...i })));
        repaintItems();
        setDishPanel(false);
        haptic();
        toast(`${r.name}: ajusta las cantidades`);
        body.querySelector('#items').scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    };
    dishBtn?.addEventListener('click', () => setDishPanel(dishPanel.hidden));
    if (pendingFood) {
      const f = pendingFood;
      pendingFood = null;
      setPanel(true, f);
      setTimeout(() => toggleBtn.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350);
    }

    body.querySelector('#del')?.addEventListener('click', async () => {
      if (dish) {
        if (!confirm('¿Borrar este plato?')) return;
        await db.deleteFavorite(draft.id);
        await loadFavorites();
        toast('Plato borrado');
        return openFoodBrowser('dishes');
      }
      if (!confirm('¿Borrar esta comida?')) return;
      await db.deleteMeal(draft.id);
      closeSheet();
      renderNutrition();
      toast('Comida borrada');
    });

    body.querySelector('#save').addEventListener('click', async () => {
      const m = buildMeal();
      if (!m.items.length) return toast('Añade al menos un alimento');
      if (dish) {
        if (!draft.name.trim()) { body.querySelector('#mname').focus(); return toast('Ponle nombre al plato'); }
        await db.putFavorite({
          ...(draft.id != null ? { id: draft.id } : {}),
          name: m.name, types: draft.types, photo: draft.photo || null, items: m.items,
          kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat,
          custom: true, createdAt: draft.createdAt || Date.now(),
        });
        await loadFavorites();
        haptic();
        toast(editing ? 'Plato actualizado' : 'Plato creado ⭐');
        return openFoodBrowser('dishes');
      }
      const meal = {
        ...(draft.id ? { id: draft.id } : {}),
        date: draft.date,
        type: draft.type,
        name: m.name,
        photo: draft.photo,
        confidence: draft.confidence,
        items: m.items,
        kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat,
        createdAt: draft.createdAt || Date.now(),
      };
      await db.putMeal(meal);
      haptic();
      closeSheet();
      renderNutrition();
      toast(editing ? 'Comida actualizada' : 'Comida guardada 🍽️');
    });
  };

  if (inPlace || fresh) setSheetContent(render(), mount);
  else openSheet(render(), mount);
}

// «2 unidades», «1,5 cucharadas», «3 lonchas»…
function unitText(it) {
  const n = Math.round((+it.grams || 0) / it.unitG * 10) / 10;
  const [w, ...rest] = String(it.unitLabel || 'ración').split(' ');
  const pl = n === 1 ? w : /ón$/.test(w) ? w.replace(/ón$/, 'ones') : /[aeiou]$/i.test(w) ? w + 's' : w + 'es';
  return `<b>${String(n).replace('.', ',')}</b> ${esc([pl, ...rest].join(' '))}`;
}

// Cambia los gramos de un alimento escalando sus macros (y repinta su tarjeta)
function setItemGrams(it, card, grams, writeGrams) {
  it.grams = r1(grams);
  if (writeGrams) card.querySelector('[data-f="grams"]').value = it.grams;
  if (it.base.grams > 0) {
    const k = it.grams / it.base.grams;
    for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
      it[key] = key === 'kcal' ? r0(it.base[key] * k) : r1(it.base[key] * k);
      card.querySelector(`[data-f="${key}"]`).value = it[key];
    }
  }
  const ut = card.querySelector('[data-utext]');
  if (ut) ut.innerHTML = unitText(it);
}

function itemCard(it, i) {
  const num = (f, label, step = '1') => `<label>${label}<input data-f="${f}" type="number" inputmode="decimal" step="${step}" min="0" value="${it[f]}"></label>`;
  return `<div class="card item" data-i="${i}">
    <div class="item-top">
      <input data-f="name" value="${esc(it.name)}" placeholder="Alimento">
      <button class="icon-btn star ${isFoodFav(it.name) ? 'on' : ''}" data-ifav="${i}" aria-label="Guardar en mis alimentos">${isFoodFav(it.name) ? '★' : '☆'}</button>
      <button class="icon-btn" data-del="${i}" aria-label="Quitar alimento">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    ${it.unitG ? `<div class="item-units">
      <button class="icon-btn" data-ud="-1" aria-label="Una menos">−</button>
      <span data-utext>${unitText(it)}</span>
      <button class="icon-btn" data-ud="1" aria-label="Una más">+</button>
    </div>` : ''}
    <div class="item-grid">
      ${num('grams', 'Gramos')}${num('kcal', 'Kcal')}${num('protein', 'Prot.', '0.1')}${num('carbs', 'Hidr.', '0.1')}${num('fat', 'Grasa', '0.1')}
    </div>
  </div>`;
}

// ---------- Alimentos favoritos (valores por 100 g + sus raciones) ----------
let foodFavCache = [];
async function loadFoodFavs() {
  foodFavCache = (await db.allFoodFavs()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return foodFavCache;
}
const findFoodFav = name => { const k = favKey(name); return k ? foodFavCache.find(f => favKey(f.name) === k) : null; };

const isFoodFav = name => !!findFoodFav(name);

// ☆ de un alimento: lo guarda (o quita) en la categoría ⭐ Favoritos
async function toggleFoodFav(food) {
  const old = findFoodFav(food.name);
  if (old) await db.deleteFoodFav(old.id);
  else await db.putFoodFav({
    name: food.name.trim(), emoji: food.emoji || '⭐', image: food.image || null,
    per100: food.per100,
    portions: food.portions.filter(([l]) => l !== '100 g'),
    createdAt: Date.now(),
  });
  await loadFoodFavs();
  toast(old ? 'Quitado de favoritos' : 'Guardado en favoritos ⭐');
  return !old;
}

// Categorías de la lista: ⭐ Favoritos va la primera
const FOOD_CATS_ALL = [{ id: 'fav', name: 'Favoritos', emoji: '⭐' }, ...FOOD_CATS];
const catChips = cur => FOOD_CATS_ALL.map(c => `<button class="chip ${c.id === cur ? 'on' : ''}" data-cat="${c.id}" style="--c:var(--accent)">${c.emoji} ${c.name}</button>`).join('');
// Alimentos de una categoría, o de una búsqueda (con tus favoritos primero)
function listFoods(cat, query, limit) {
  const q = query.trim();
  if (!q) return cat === 'fav' ? foodFavCache : foodsByCat(cat);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const favs = foodFavCache.filter(f => words.every(w => norm(f.name).includes(w)));
  const seen = new Set(favs.map(f => favKey(f.name)));
  return [...favs, ...searchFoods(q, limit).filter(f => !seen.has(favKey(f.name)))];
}
const FAV_EMPTY = '<div class="hint-card">Aún no tienes favoritos. Pulsa <b>☆</b> en cualquier alimento (o escanea un envase) para tenerlo aquí.</div>';

// ---------- Desplegable «Añadir alimento» (dentro de la revisión de la comida) ----------
// Se pinta dentro de `el`. ctx: { onPick(item), onManual(), onScan() }
const pickerState = { q: '', cat: 'fav' };

const portionText = f => {
  const [label, g] = f.portions[0] || ['100 g', 100];
  return `${label === '100 g' ? '100 g' : `1 ${label} (${r0(g)} g)`} · ${r0(f.per100.kcal * g / 100)} kcal`;
};
const starSpan = f => {
  const on = isFoodFav(f.name);
  return `<span class="fstar ${on ? 'on' : ''}" data-star role="button" aria-label="${on ? 'Quitar de' : 'Guardar en'} favoritos">${on ? '★' : '☆'}</span>`;
};
const foodRow = (f, attr, browse = false) => `
  <button class="food-row" ${attr}>
    ${f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy">` : `<span class="e">${f.emoji || '🍽️'}</span>`}
    <span class="n">${esc(f.name)}<small>${esc(portionText(f))}</small></span>
    ${starSpan(f)}
    ${browse ? '' : '<span class="plus">+</span>'}
  </button>`;

// Producto de Open Food Facts → mismo formato que la base local
const productToFood = p => ({
  name: p.name, emoji: '🏷️', image: p.image, per100: p.per100,
  portions: p.servingGrams ? [['ración del envase', p.servingGrams]] : [],
});

// Cada pantalla del desplegable usa un contenedor nuevo para no duplicar escuchadores
function freshBox(el) {
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'picker-box';
  el.append(box);
  return box;
}

// ctx.browse = true: solo para ver la lista y marcar favoritos (tocar la fila marca/desmarca ☆)
function mountFoodPicker(el, ctx) {
  const st = pickerState;
  const browse = !!ctx.browse;
  let shown = [], online = [];
  const box = freshBox(el);
  const row = (f, attr) => foodRow(f, attr, browse);

  box.innerHTML = `
    <input class="search" id="pk-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Busca: huevo, jamón, queso, café…" value="${esc(st.q)}">
    <div class="pick-actions" ${browse ? 'style="grid-template-columns:1fr"' : ''}>
      <button class="action" data-pk="scan" style="--c:color-mix(in srgb,var(--blue) 30%,transparent)"><span class="e">🏷️</span><div>Escanear<small>${browse ? 'Guarda un envasado en favoritos' : 'Código de barras'}</small></div></button>
      ${browse ? '' : `<button class="action" data-pk="manual" style="--c:color-mix(in srgb,var(--muted) 22%,transparent)"><span class="e">✍️</span><div>En blanco<small>Pon tú los datos</small></div></button>`}
    </div>
    <div class="label" data-pk-label>📋 Lista de alimentos</div>
    <div class="chips scroll" data-pk-cats>${catChips(st.cat)}</div>
    <div class="food-list" data-pk-res></div>
    <div data-pk-online></div>`;

  const q = box.querySelector('#pk-q');
  const res = box.querySelector('[data-pk-res]');
  const onl = box.querySelector('[data-pk-online]');
  const cats = box.querySelector('[data-pk-cats]');

  const paintOnline = (state, msg = '') => {
    const query = st.q.trim();
    if (query.length < 2) { onl.innerHTML = ''; return; }
    if (state === 'idle') onl.innerHTML = `<button class="btn secondary" data-pk="web" style="margin-top:10px">🌐 Buscar «${esc(query)}» en internet</button>`;
    if (state === 'loading') onl.innerHTML = '<div class="online-load"><div class="spinner"></div>Buscando en Open Food Facts…</div>';
    if (state === 'error') onl.innerHTML = `<div class="notice err">${esc(msg)}</div>`;
    if (state === 'done') onl.innerHTML = online.length
      ? `<div class="label">🌐 Productos de Open Food Facts</div><div class="food-list">${online.map((f, i) => row(f, `data-on="${i}"`)).join('')}</div>`
      : `<div class="muted small" style="text-align:center;margin:12px 0">No hay productos en internet para «${esc(query)}».</div>`;
  };

  // Tras marcar/desmarcar: repinta las estrellas sin perder la búsqueda en internet
  const refreshStars = () => {
    if (st.cat === 'fav' && !st.q.trim()) return paint();
    box.querySelectorAll('[data-pk-res] .food-row, [data-pk-online] .food-row').forEach(r => {
      const f = rowFood(r);
      if (f) r.querySelector('[data-star]').outerHTML = starSpan(f);
    });
  };
  const rowFood = r => r.dataset.fi != null ? shown[Number(r.dataset.fi)]
    : r.dataset.on != null ? online[Number(r.dataset.on)] : null;

  const paint = () => {
    const query = st.q.trim();
    cats.hidden = !!query;
    shown = listFoods(st.cat, query);
    box.querySelector('[data-pk-label]').hidden = !!query && !shown.length;
    res.innerHTML = shown.length
      ? shown.map((f, i) => row(f, `data-fi="${i}"`)).join('')
      : (!query && st.cat === 'fav' ? FAV_EMPTY : '<div class="muted small" style="text-align:center;margin:14px 0 4px">No está en la lista. Búscalo en internet o escanea el envase 👇</div>');
    online = [];
    paintOnline('idle');
  };
  paint();
  loadFoodFavs().then(() => { if (box.isConnected) paint(); });

  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; paint(); }, 120); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); } });

  box.addEventListener('click', async e => {
    const act = e.target.closest('[data-pk]')?.dataset.pk;
    if (act === 'manual') return ctx.onManual();
    if (act === 'scan') return ctx.onScan();
    const c = e.target.closest('[data-cat]');
    if (c) {
      st.cat = c.dataset.cat;
      cats.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b === c));
      return paint();
    }
    // ☆ de una fila (o la fila entera en la lista de favoritos)
    const fr = e.target.closest('.food-row');
    if (fr && (browse || e.target.closest('[data-star]'))) {
      const f = rowFood(fr);
      if (!f) return;
      await toggleFoodFav(f);
      haptic();
      return refreshStars();
    }
    const fi = e.target.closest('[data-fi]');
    if (fi) return mountPortion(el, shown[Number(fi.dataset.fi)], ctx);
    const on = e.target.closest('[data-on]');
    if (on) return mountPortion(el, online[Number(on.dataset.on)], ctx);
    if (act === 'web') {
      const query = st.q.trim();
      paintOnline('loading');
      try {
        online = (await searchProducts(query)).map(productToFood);
        if (st.q.trim() === query && onl.isConnected) paintOnline('done');
      } catch (err) {
        if (onl.isConnected) paintOnline('error', err.message);
      }
    }
  });
}

// ---------- Lista de alimentos y platos: ficha completa de cada uno y crear platos ----------
const browserState = { tab: 'foods', q: '', cat: 'fav' };
const macroRow = m => `
  <div class="totals-row">
    <div><b>${r0(m.kcal)}</b><span>kcal</span></div>
    <div><b class="p-c">${r1(m.protein)}g</b><span>proteína</span></div>
    <div><b class="c-c">${r1(m.carbs)}g</b><span>hidratos</span></div>
    <div><b class="f-c">${r1(m.fat)}g</b><span>grasa</span></div>
  </div>`;
const scaleFood = (f, g) => { const k = g / 100, p = f.per100; return { name: f.name, grams: g, kcal: p.kcal * k, protein: p.protein * k, carbs: p.carbs * k, fat: p.fat * k }; };
const sumItems = items => items.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0), carbs: a.carbs + (+i.carbs || 0), fat: a.fat + (+i.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
const infoRow = (f, attr, sub) => `
  <button class="food-row" ${attr}>
    ${f.image || f.photo ? `<img src="${esc(f.image || f.photo)}" alt="" loading="lazy">` : `<span class="e">${f.emoji || TYPE(typesOf(f)?.[0]).emoji}</span>`}
    <span class="n">${esc(f.name)}<small>${esc(sub)}</small></span>
    ${chev('r')}
  </button>`;
const dishSub = r => `${r.items.length} ${r.items.length === 1 ? 'ingrediente' : 'ingredientes'} · ${r0(sumItems(r.items).kcal)} kcal`;

function openFoodBrowser(tab) {
  const st = browserState;
  if (tab) st.tab = tab;
  let foods = [], mine = [], online = [], dishes = [];
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Volver</button>
    <h2 class="sheet-title">Lista de alimentos</h2>
    <div class="seg wide" style="margin:6px 0 12px">
      <button data-btab="foods" class="${st.tab === 'foods' ? 'on' : ''}">🥚 Alimentos</button>
      <button data-btab="dishes" class="${st.tab === 'dishes' ? 'on' : ''}">🍳 Platos</button>
    </div>
    <button class="btn primary" data-newdish>＋ Crear plato</button>
    <input class="search" id="bq" type="search" enterkeyhint="search" autocomplete="off" style="margin-top:12px"
      placeholder="${st.tab === 'foods' ? 'Busca: huevo, jamón, queso, café…' : 'Busca: tortilla, arroz con pollo…'}" value="${esc(st.q)}">
    <div data-blist></div>`, body => {
    const listEl = body.querySelector('[data-blist]');

    const paintFoods = () => {
      const query = st.q.trim();
      const words = norm(query).split(/\s+/).filter(Boolean);
      foods = listFoods(st.cat, query, 60);
      listEl.innerHTML = `
        <div class="label">📋 ${query ? 'Resultados' : 'Alimentos'}</div>
        ${query ? '' : `<div class="chips scroll">${catChips(st.cat)}</div>`}
        <div class="food-list">${foods.map((f, i) => infoRow(f, `data-fi="${i}"`, portionText(f))).join('')
          || (!query && st.cat === 'fav' ? FAV_EMPTY : '<div class="muted small" style="text-align:center;margin:12px 0">No está en la lista.</div>')}</div>
        ${query.length >= 2 ? `<div data-web><button class="btn secondary" data-websearch style="margin-top:10px">🌐 Buscar «${esc(query)}» en internet</button></div>` : ''}`;
    };
    const paintDishes = () => {
      const query = st.q.trim();
      const words = norm(query).split(/\s+/).filter(Boolean);
      mine = favCache.filter(f => f.items?.length && words.every(w => norm(f.name).includes(w)));
      dishes = searchRecipes(query);
      listEl.innerHTML = `
        <div class="label">⭐ Mis platos</div>
        ${mine.length ? `<div class="food-list">${mine.map((r, i) => infoRow(r, `data-md="${i}"`, dishSub(r))).join('')}</div>`
          : (query ? '<div class="muted small" style="margin:0 2px">Ninguno coincide.</div>' : '<div class="hint-card">Aquí salen los platos que crees y los que guardes con ☆ al apuntar una comida.</div>')}
        <div class="label">🍳 Platos caseros</div>
        <div class="food-list">${dishes.map((r, i) => infoRow(r, `data-rd="${i}"`, dishSub(r))).join('') || '<div class="muted small" style="text-align:center;margin:12px 0">No hay ningún plato con ese nombre.</div>'}</div>`;
    };
    const paint = () => (st.tab === 'foods' ? paintFoods : paintDishes)();
    paint();
    Promise.all([loadFoodFavs(), loadFavorites()]).then(() => { if (listEl.isConnected) paint(); });

    let tm;
    body.querySelector('#bq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; paint(); }, 120); });
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openAddMenu(true);
      const bt = e.target.closest('[data-btab]');
      if (bt) { st.tab = bt.dataset.btab; st.q = ''; haptic(); return openFoodBrowser(); }
      if (e.target.closest('[data-newdish]')) return openDishEditor({ name: '', items: [], types: [defaultType()] });
      const c = e.target.closest('[data-cat]');
      if (c) { st.cat = c.dataset.cat; return paint(); }
      const pick = (attr, arr) => { const b = e.target.closest(`[${attr}]`); return b ? arr[Number(b.getAttribute(attr))] : null; };
      if (st.tab === 'foods') {
        const food = pick('data-fi', foods) || pick('data-on', online);
        if (food) return openFoodDetail(food);
      } else {
        const dish = pick('data-md', mine) || pick('data-rd', dishes);
        if (dish) return openDishDetail(dish);
      }
      if (e.target.closest('[data-websearch]')) {
        const web = body.querySelector('[data-web]');
        const query = st.q.trim();
        web.innerHTML = '<div class="online-load"><div class="spinner"></div>Buscando en Open Food Facts…</div>';
        try {
          online = (await searchProducts(query)).map(productToFood);
          if (!web.isConnected) return;
          web.innerHTML = online.length
            ? `<div class="label">🌐 Productos de Open Food Facts</div><div class="food-list">${online.map((f, i) => infoRow(f, `data-on="${i}"`, portionText(f))).join('')}</div>`
            : `<div class="muted small" style="text-align:center;margin:12px 0">No hay productos en internet para «${esc(query)}».</div>`;
        } catch (err) {
          if (web.isConnected) web.innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
        }
      }
    });
  });
}

// Chips de tipos de comida (favorito en… / aparece en…)
const typeChips = (on, attr) => `<div class="chips">${MEAL_TYPES.map(t =>
  `<button class="chip ${on(t.id) ? 'on' : ''}" ${attr}="${t.id}" style="--c:var(--accent)">${t.emoji} ${t.name}</button>`).join('')}</div>`;

const nutriRow = (title, sub, m) => `
  <div class="portion-row"><div><b>${title}</b><small>${sub}</small></div>
    <span class="pk">${r0(m.kcal)} kcal</span>
    <span class="pm"><i class="p-c">P ${r1(m.protein)}</i> <i class="c-c">H ${r1(m.carbs)}</i> <i class="f-c">G ${r1(m.fat)}</i></span></div>`;

function openFoodDetail(food) {
  const p = food.per100;
  const portions = [...(food.portions || [])];
  if (!portions.some(([, g]) => g === 100)) portions.push(['100 g', 100]);
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Lista de alimentos</button>
    <div class="food-hero">
      ${food.image ? `<img src="${esc(food.image)}" alt="">` : `<span class="e">${food.emoji || '🍽️'}</span>`}
      <div><b>${esc(food.name)}</b><small>${r0(p.kcal)} kcal por 100 g</small></div>
    </div>
    <div class="label">Por 100 g</div>
    <div class="card">${macroRow(p)}</div>
    <div class="label">Raciones</div>
    <div class="card portion-list">${portions.map(([l, g]) => nutriRow(l === '100 g' ? '100 g' : `1 ${esc(l)}`, `${r0(g)} g`, scaleFood(food, g))).join('')}</div>
    <div class="label">Puntuación</div>
    <div class="card score-card">${scoreCard(mealScore({ items: [scaleFood(food, 100)] }))}</div>
    <button class="btn secondary" data-ffav style="margin-top:18px"></button>`, body => {
    const fb = body.querySelector('[data-ffav]');
    const paintFav = () => { fb.textContent = isFoodFav(food.name) ? '★ En favoritos · quitar' : '☆ Añadir a favoritos'; };
    paintFav();
    loadFoodFavs().then(() => { if (body.isConnected) paintFav(); });
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openFoodBrowser();
      if (e.target.closest('[data-ffav]')) {
        await toggleFoodFav(food);
        haptic();
        paintFav();
      }
    });
  });
}

function openDishDetail(r) {
  const own = r.id != null;
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Lista de alimentos</button>
    <div class="food-hero">
      ${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="e">${r.emoji || TYPE(typesOf(r)?.[0]).emoji}</span>`}
      <div><b>${esc(r.name)}</b><small>${own ? 'Tu plato' : 'Plato casero · cantidades para 1 persona'}</small></div>
    </div>
    <div class="label">Total del plato</div>
    <div class="card">${macroRow(sumItems(r.items))}</div>
    <div class="label">Ingredientes</div>
    <div class="card portion-list">${r.items.map(i => nutriRow(esc(i.name), `${r0(i.grams)} g${i.unitG ? ` · ${unitText(i).replace(/<\/?b>/g, '')}` : ''}`, i)).join('')}</div>
    <div class="label">Puntuación</div>
    <div class="card score-card">${scoreCard(mealScore({ items: r.items }))}</div>
    <div class="label">🏷️ Aparece en</div>
    ${typeChips(t => dishTypes(r).includes(t), 'data-dt')}
    <div class="muted small" style="margin:6px 2px 0">Comidas en las que te lo propone «Elegir un plato».</div>
    <button class="btn primary" data-use style="margin-top:18px">🍽️ Apuntarlo en una comida</button>
    ${own
      ? '<button class="btn secondary" data-edit>✏️ Editar plato</button><button class="btn ghost danger" data-del>Borrar plato</button>'
      : '<button class="btn secondary" data-copy>✏️ Copiar y modificar</button>'}`, body => {
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openFoodBrowser();
      const dt = e.target.closest('[data-dt]');
      if (dt) {
        const ts = new Set(dishTypes(r));
        ts.has(dt.dataset.dt) ? ts.delete(dt.dataset.dt) : ts.add(dt.dataset.dt);
        if (!ts.size) return toast('Déjalo al menos en una comida');
        await setDishTypes(r, ALL_TYPES.filter(t => ts.has(t)));
        dt.classList.toggle('on', ts.has(dt.dataset.dt));
        return haptic();
      }
      const copyItems = () => r.items.map(i => ({ ...i }));
      if (e.target.closest('[data-use]')) return openReview(newDraft({ name: r.name, photo: r.photo || null, items: copyItems() }), false, true);
      if (e.target.closest('[data-edit]')) return openDishEditor({ id: r.id, name: r.name, photo: r.photo || null, items: copyItems(), types: dishTypes(r), createdAt: r.createdAt }, true);
      if (e.target.closest('[data-copy]')) return openDishEditor({ name: `${r.name} (mío)`, items: copyItems(), types: dishTypes(r) });
      if (e.target.closest('[data-del]')) {
        if (!confirm(`¿Borrar el plato «${r.name}»?`)) return;
        await db.deleteFavorite(r.id);
        await loadFavorites();
        toast('Plato borrado');
        return openFoodBrowser('dishes');
      }
    });
  });
}

// Crear / editar un plato: la misma pantalla que una comida, pero se guarda en «Mis platos»
function openDishEditor(dish, editing = false) {
  openReview({ ...newDraft(), ...dish, mode: 'dish', types: dish.types?.length ? dish.types : [defaultType()] }, editing, true);
}

// Elegir cantidad de un alimento: raciones típicas o gramos exactos. ☆ lo guarda en Mis alimentos
function mountPortion(el, food, ctx) {
  const portions = [...food.portions];
  if (!portions.some(([, g]) => g === 100)) portions.push(['100 g', 100]);
  let sel = 0, units = 1, grams = portions[0][1];
  const p = food.per100;
  const box = freshBox(el);

  box.innerHTML = `
    <div class="sheet-title-row">
      <button class="link back" data-pk="back" style="margin:0 0 0 -6px">${chev('l')} Volver a la lista</button>
      <button class="icon-btn star" data-pk="fav" aria-label="Guardar en mis alimentos">☆</button>
    </div>
    <div class="food-hero">
      ${food.image ? `<img src="${esc(food.image)}" alt="">` : `<span class="e">${food.emoji || '🍽️'}</span>`}
      <div><b>${esc(food.name)}</b><small>100 g: ${r0(p.kcal)} kcal · P ${r1(p.protein)} · H ${r1(p.carbs)} · G ${r1(p.fat)}</small></div>
    </div>
    <div class="chips" style="margin-top:12px">
      ${portions.map(([l, g], i) => `<button class="chip" data-p="${i}" style="--c:var(--accent)">${l === '100 g' ? '100 g' : `${esc(cap(l))} · ${r0(g)} g`}</button>`).join('')}
    </div>
    <div class="qty-row">
      <div class="stepper">
        <button class="icon-btn" data-u="-1" aria-label="Menos">−</button>
        <b data-units></b>
        <button class="icon-btn" data-u="1" aria-label="Más">+</button>
      </div>
      <label class="grams"><input data-grams type="number" inputmode="decimal" min="0" step="1"><span>g</span></label>
    </div>
    <div class="totals-row" data-pv style="margin-top:14px"></div>
    <button class="btn primary" data-pk="add" style="margin-top:14px">Añadir</button>`;

  const gIn = box.querySelector('[data-grams]');
  const star = box.querySelector('[data-pk="fav"]');
  const paintStar = () => {
    const on = isFoodFav(food.name);
    star.classList.toggle('on', on);
    star.textContent = on ? '★' : '☆';
    star.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Guardar en favoritos');
  };
  loadFoodFavs().then(() => { if (star.isConnected) paintStar(); });

  const paint = (fromGrams = false) => {
    if (!fromGrams) gIn.value = r1(grams);
    box.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', Number(b.dataset.p) === sel));
    box.querySelector('[data-units]').textContent = sel < 0 ? '–' : `${String(units).replace('.', ',')} ×`;
    const k = grams / 100;
    box.querySelector('[data-pv]').innerHTML = `
      <div><b>${r0(p.kcal * k)}</b><span>kcal</span></div>
      <div><b class="p-c">${r1(p.protein * k)}g</b><span>proteína</span></div>
      <div><b class="c-c">${r1(p.carbs * k)}g</b><span>hidratos</span></div>
      <div><b class="f-c">${r1(p.fat * k)}g</b><span>grasa</span></div>`;
  };
  paint();

  box.addEventListener('click', async e => {
    const act = e.target.closest('[data-pk]')?.dataset.pk;
    if (act === 'back') return mountFoodPicker(el, ctx);
    if (act === 'fav') {
      // La ración elegida pasa a ser la primera (la que se propone al usarlo)
      const chosen = sel >= 0 ? portions[sel] : ['ración', r0(grams)];
      const rest = food.portions.filter(x => x !== chosen);
      await toggleFoodFav({ ...food, portions: chosen[0] === '100 g' ? food.portions : [chosen, ...rest] });
      haptic();
      return paintStar();
    }
    const pb = e.target.closest('[data-p]');
    if (pb) { sel = Number(pb.dataset.p); units = 1; grams = portions[sel][1]; haptic(); return paint(); }
    const ub = e.target.closest('[data-u]');
    if (ub) {
      if (sel < 0) { sel = 0; units = 0.5; }
      units = Math.max(0.5, units + 0.5 * Number(ub.dataset.u));
      grams = units * portions[sel][1];
      haptic();
      return paint();
    }
    if (act === 'add') {
      if (!(grams > 0)) return toast('Indica la cantidad');
      const k = grams / 100;
      haptic();
      const unit = sel >= 0 && portions[sel][0] !== '100 g' ? { unitG: portions[sel][1], unitLabel: portions[sel][0] } : {};
      ctx.onPick({ name: food.name, grams: r0(grams), kcal: r0(p.kcal * k), protein: r1(p.protein * k), carbs: r1(p.carbs * k), fat: r1(p.fat * k), ...unit });
    }
  });
  gIn.addEventListener('input', () => {
    grams = parseFloat(String(gIn.value).replace(',', '.')) || 0;
    sel = -1;
    paint(true);
  });
}

// ---------- Imágenes ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}

function toJpeg(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
