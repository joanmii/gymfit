// =========================================================
// Pestaña Nutrición: resumen del día (anillo, actividad, pasos, gráfica) y navegación
// =========================================================
import { db } from './db.js';
import { BUILTIN } from './cookbook.js';
import { openWeighIn, renderWeight } from './weight.js';
import { bars, ring } from './charts.js';
import { chev } from './calendar.js';
import { closeSheet, openSheet } from './sheet.js';
import { basalKcal, dayWorkout, refreshBodyWeight, stepsKcal, stepsKm } from './energy.js';
import { addDays, cap, esc, fmtLong, haptic, keyOf, r0, r1, state, toast, today, WD_SHORT } from './utils.js';
import { day, gradeBadge, MACRO_COLORS, MEAL_TYPES, mealScore, newDraft, setDay, sum } from './nut-core.js';
import { favCache, loadFavorites } from './nut-favs.js';
import { openAddMenu, startPhotoFlow } from './nut-add.js';
import { openReview } from './nut-review.js';
import { openRecipe, openRecipeAI, openRecipeEditor, renderRecipes } from './nut-recipes.js';
import { setSuggSlot, suggCurrent, suggestCard, suggList } from './nut-suggest.js';

let root;
let trend = 7; // 7 | 30 días
const MODE_KEY = 'gymfit-nut-mode';
let mode = 'comidas'; // 'comidas' | 'recetas' | 'peso'
try { const m = localStorage.getItem(MODE_KEY); mode = ['peso', 'recetas'].includes(m) ? m : 'comidas'; } catch { /* nada */ }

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
    if (dn) { setDay(addDays(day, Number(dn.dataset.dnav))); return renderNutrition(); }
    if (e.target.closest('[data-today]')) { setDay(today()); return renderNutrition(); }
    const tr = e.target.closest('[data-trend]');
    if (tr) { trend = Number(tr.dataset.trend); return renderNutrition(); }
    if (e.target.closest('[data-steps]')) return openSteps();
    const wt = e.target.closest('[data-water]');
    if (wt) {
      const k = keyOf(day);
      const rec = (await db.activityByDate(k)) || { date: k };
      rec.water = Math.max(0, (rec.water || 0) + Number(wt.dataset.water));
      rec.updatedAt = Date.now();
      await db.putActivity(rec);
      haptic();
      return renderNutrition();
    }
    const ss = e.target.closest('[data-sslot]');
    if (ss) { setSuggSlot(ss.dataset.sslot); haptic(); return renderNutrition(); }
    const sg = e.target.closest('[data-sugg]');
    if (sg) {
      const { r } = suggList[Number(sg.dataset.sugg)];
      return openReview(newDraft({ name: r.name, photo: r.photo || null, type: suggCurrent, items: r.items.map(i => ({ ...i })) }));
    }
    if (e.target.closest('[data-rai]')) return openRecipeAI();
    const rm = e.target.closest('[data-rmine]');
    if (rm) return openRecipe(favCache.find(r => r.id === Number(rm.dataset.rmine)));
    const rd = e.target.closest('[data-rdef]');
    if (rd) return openRecipe(BUILTIN.find(r => r.key === rd.dataset.rdef));
    if (e.target.closest('[data-rnew]')) return openRecipeEditor({}, false, false);
    const meal = e.target.closest('[data-meal]');
    if (meal) {
      const all = await db.mealsByDate(keyOf(day));
      const m = all.find(x => x.id === Number(meal.dataset.meal));
      if (m) openReview({ ...m, items: m.items.map(i => ({ ...i })) }, true);
    }
  });

  document.getElementById('fab').addEventListener('click', () => (mode === 'peso' ? openWeighIn() : mode === 'recetas' ? openRecipeAI() : openAddMenu()));
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
  document.getElementById('fab').setAttribute('aria-label', mode === 'peso' ? 'Apuntar peso' : mode === 'recetas' ? 'Crear receta' : 'Añadir comida');
  if (mode === 'recetas') {
    root.innerHTML = `<h1 class="title">Nutrición</h1>${modeSeg()}<div id="recipes"></div>`;
    return renderRecipes(root.querySelector('#recipes'));
  }
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
  const actRec = await db.activityByDate(k);
  const steps = actRec?.steps || 0, water = actRec?.water || 0;
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
        ${waterRow(water)}
      </div>
      ${burned ? `<div class="act-note">Comido <b>${r0(tot.kcal)}</b> − actividad <b>${r0(burned)}</b> = <b>${r0(tot.kcal - burned)}</b> kcal netas</div>` : ''}
      ${basalKcal() ? `<div class="act-note muted small">Gasto del día ≈ <b>${r0(basalKcal() * dayFraction(day) + burned).toLocaleString('es-ES')}</b> kcal</div>` : ''}
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
    </div>
    ${suggestCard(meals, S)}`;
  // Con los favoritos cargados, las sugerencias pueden incluirlos
  if (+day === +today()) loadFavorites().then(() => {
    const el = root.querySelector('#sugg');
    if (el) el.outerHTML = suggestCard(meals, S);
  });
}

const modeSeg = () => `
  <div class="seg wide">
    <button data-nmode="comidas" class="${mode === 'comidas' ? 'on' : ''}">🍽️ Comidas</button>
    <button data-nmode="recetas" class="${mode === 'recetas' ? 'on' : ''}">📖 Recetas</button>
    <button data-nmode="peso" class="${mode === 'peso' ? 'on' : ''}">⚖️ Peso</button>
  </div>`;

// Parte del día ya transcurrida (el metabolismo basal se gasta poco a poco): hoy según la hora, días pasados enteros
function dayFraction(d) {
  const t = today();
  if (+d < +t) return 1;
  if (+d > +t) return 0;
  return Math.min(1, (Date.now() - +t) / 86400000);
}

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

// Guarda los pasos sin tocar el agua del mismo día
async function saveSteps(k, n) {
  const rec = { ...((await db.activityByDate(k)) || { date: k }), steps: n, updatedAt: Date.now() };
  if (n > 0 || rec.water) await db.putActivity(rec);
  else await db.deleteActivity(k);
}

// Agua del día: vasos de 250 ml
function waterRow(water) {
  const g = +state.settings.waterGoal || 0;
  if (!g) return '';
  const pct = Math.min(100, Math.round(water / g * 100));
  return `<div class="act">
    <span class="e">💧</span>
    <span class="t"><b>${water} ${water === 1 ? 'vaso' : 'vasos'}</b><small>${(water * 0.25).toLocaleString('es-ES')} de ${(g * 0.25).toLocaleString('es-ES')} L</small>
      <i class="steps-bar water${water >= g ? ' done' : ''}"><i style="width:${pct}%"></i></i></span>
    <span class="water-btns"><button class="icon-btn" data-water="-1" aria-label="Un vaso menos" ${water ? '' : 'disabled'}>−</button><button class="icon-btn" data-water="1" aria-label="Un vaso más">+</button></span>
  </div>`;
}

async function openSteps() {
  const k = keyOf(day);
  const current = (await db.activityByDate(k))?.steps || 0;
  const est = n => n > 0 ? `≈ <b>${r1(stepsKm(n)).toLocaleString('es-ES')} km</b> · <b>${r0(stepsKcal(n))} kcal</b> quemadas` : '';
  openSheet(`
    <h2 class="sheet-title">Pasos</h2>
    <div class="muted small">${+day === +today() ? 'Hoy' : esc(cap(fmtLong(day)))}</div>
    <label class="field"><span>Pasos caminados</span>
      <input id="steps" type="number" inputmode="numeric" min="0" step="1" placeholder="Ej: 8500" value="${current || ''}">
    </label>
    <div class="chips" style="margin-top:10px">
      ${[1000, 2500, 5000].map(n => `<button class="chip" data-plus="${n}" style="--c:var(--accent)">+${n.toLocaleString('es-ES')}</button>`).join('')}
    </div>
    <div class="notice" id="steps-est" ${current ? '' : 'hidden'}>${est(current)}</div>
    ${stepsGoal() ? `<div class="muted small" style="margin-top:8px">🎯 Objetivo: <b>${stepsGoal().toLocaleString('es-ES')} pasos</b></div>` : ''}
    <div style="margin-top:18px">
      <button class="btn primary" id="save">Guardar</button>
      ${current ? '<button class="btn ghost danger" id="del">Borrar pasos</button>' : ''}
    </div>`, body => {
    const inp = body.querySelector('#steps');
    const upd = () => {
      const n = parseInt(inp.value, 10) || 0, box = body.querySelector('#steps-est');
      box.innerHTML = est(n);
      box.hidden = !n;
    };
    inp.addEventListener('input', upd);
    body.addEventListener('click', async e => {
      const plus = e.target.closest('[data-plus]');
      if (plus) { inp.value = (parseInt(inp.value, 10) || 0) + Number(plus.dataset.plus); haptic(); return upd(); }
      if (e.target.closest('#save')) {
        const n = parseInt(inp.value, 10) || 0;
        await saveSteps(k, n);
        haptic(); closeSheet(); renderNutrition();
        return toast(n > 0 ? 'Pasos guardados 👟' : 'Pasos borrados');
      }
      if (e.target.closest('#del')) {
        await saveSteps(k, 0);
        closeSheet(); renderNutrition(); toast('Pasos borrados');
      }
    });
    setTimeout(() => inp.focus(), 350);
  });
}
