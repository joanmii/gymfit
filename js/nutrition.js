// =========================================================
// Pestaña Nutrición: resumen del día, comidas y análisis por foto
// =========================================================
import { db } from './db.js';
import { analyzeFood, analyzeText } from './api.js';
import { openScanner } from './barcode.js';
import { renderWeight, openWeighIn } from './weight.js';
import { ring, bars } from './charts.js';
import { chev } from './calendar.js';
import { openSheet, setSheetContent, closeSheet, onSheetCleanup } from './sheet.js';
import { refreshBodyWeight, hasBodyWeight, bodyKg, stepsKcal, stepsKm, dayWorkout } from './energy.js';
import { state, hasAiKey, keyOf, today, addDays, fmtLong, cap, esc, r0, r1, toast, haptic, WD_SHORT } from './utils.js';

const MEAL_TYPES = [
  { id: 'desayuno', name: 'Desayuno', emoji: '🥐' },
  { id: 'comida',   name: 'Comida',   emoji: '🍝' },
  { id: 'merienda', name: 'Merienda', emoji: '🍎' },
  { id: 'cena',     name: 'Cena',     emoji: '🥗' },
  { id: 'snack',    name: 'Snack',    emoji: '🍫' },
];
const MACRO_COLORS = { protein: '#0a84ff', carbs: '#ff9f0a', fat: '#ff375f' };

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
    trendItems.push({ label, value: kc, highlight: +d === +today(), color: kc > S.kcal ? 'var(--danger)' : 'var(--accent)' });
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
        ${ring(tot.kcal, S.kcal, { size: 132, stroke: 14, color: over ? 'var(--danger)' : 'var(--accent)' })}
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
          <span class="t"><b>${steps ? steps.toLocaleString('es-ES') : 'Añadir pasos'}</b><small>${steps ? `pasos · ${r1(stepsKm(steps)).toLocaleString('es-ES')} km` : 'Toca para apuntarlos'}</small></span>
          <span class="k">${steps ? `${r0(kSteps)}<small>kcal</small>` : '+'}</span>
        </button>
        <div class="act">
          <span class="e">🏋️</span>
          <span class="t"><b>${wk ? `${wk.minutes} min` : 'Sin entreno'}</b><small>${wk ? (wk.assumed ? 'entreno (duración supuesta)' : 'de entreno') : 'Se suma al entrenar'}</small></span>
          <span class="k">${wk ? `${r0(kGym)}<small>kcal</small>` : '–'}</span>
        </div>
      </div>
      ${burned ? `<div class="act-note">Comido <b>${r0(tot.kcal)}</b> − actividad <b>${r0(burned)}</b> = <b>${r0(tot.kcal - burned)}</b> kcal netas</div>` : ''}
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
        </div>
        <div class="muted small" style="text-align:center;margin-top:8px">${loggedDays === 1 ? 'Solo 1 día con registros' : `Media de los ${loggedDays} días con registros`}</div>` : ''}
    </div>`;
}

const modeSeg = () => `
  <div class="seg wide">
    <button data-nmode="comidas" class="${mode === 'comidas' ? 'on' : ''}">🍽️ Comidas</button>
    <button data-nmode="peso" class="${mode === 'peso' ? 'on' : ''}">⚖️ Peso</button>
  </div>`;

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
      <div><b>${s.t} · ${r1(s.score).toLocaleString('es-ES')}/10</b><small>Según sus macros por gramo</small></div>
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
function openAddMenu() {
  const tile = (a, emoji, title, sub, color) =>
    `<button class="tile" data-a="${a}" style="--c:${color}"><span class="e">${emoji}</span><b>${title}</b><small>${sub}</small></button>`;

  openSheet(`
    <h2 class="sheet-title">Añadir comida</h2>
    <div class="muted small">${+day === +today() ? 'Se guardará en el día de hoy' : `Se guardará el ${esc(fmtLong(day))}`}</div>
    <div class="tiles">
      ${tile('cam', '📷', 'Foto', 'La IA lo calcula', 'var(--accent)')}
      ${tile('txt', '🎙️', 'Describir', 'Por texto o voz', 'var(--purple)')}
      ${tile('bar', '🏷️', 'Código de barras', 'Envasados exactos', 'var(--blue)')}
      ${tile('gal', '🖼️', 'Galería', 'Foto que ya tengas', 'var(--orange)')}
    </div>
    <button class="action" data-a="man" style="--c:color-mix(in srgb,var(--muted) 22%,transparent);margin-top:10px"><span class="e">✍️</span><div>Introducir a mano<small>Sin IA, tú pones los datos</small></div></button>
    <div id="favs"></div>
    <div id="recent"></div>`, body => {
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'cam') { closeSheet(true); document.getElementById('cam-input').click(); }
      if (a === 'gal') { closeSheet(true); document.getElementById('gal-input').click(); }
      if (a === 'txt') openDescribe();
      if (a === 'bar') openScanner(product => openReview(newDraft(productToDraft(product)), false, true));
      if (a === 'man') openReview(newDraft({ items: [blankItem()] }), false, true);
      const r = e.target.closest('[data-recent]');
      if (r) repeatMeal(recentCache[Number(r.dataset.recent)]);
      const f = e.target.closest('[data-fav]');
      if (f) repeatMeal(favCache[Number(f.dataset.fav)]);
    });
    renderFavorites(body.querySelector('#favs'));
    renderRecent(body.querySelector('#recent'));
  });
}

const recentRow = (m, attr) => `
  <button class="recent" ${attr}>
    ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${MEAL_TYPES.find(t => t.id === m.type)?.emoji || '🍽️'}</span>`}
    <span class="n">${esc(m.name)}</span>
    ${gradeBadge(mealScore(m))}
    <span class="k">${r0(m.kcal)} kcal</span>
  </button>`;

// ---------- Comidas favoritas ----------
let favCache = [];
const favKey = name => String(name || '').trim().toLowerCase();

async function loadFavorites() {
  favCache = (await db.allFavorites()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return favCache;
}

async function renderFavorites(el) {
  await loadFavorites();
  if (!el.isConnected) return;
  el.innerHTML = `<div class="label">⭐ Favoritas</div>${favCache.length
    ? `<div class="recent-list">${favCache.map((m, i) => recentRow(m, `data-fav="${i}"`)).join('')}</div>`
    : '<div class="muted small" style="margin:0 2px">Al revisar una comida, pulsa ☆ para guardarla aquí y añadirla con un toque.</div>'}`;
}

// ---------- Comidas recientes (repetir con un toque) ----------
let recentCache = [];
async function renderRecent(el) {
  const from = keyOf(addDays(today(), -45));
  const meals = (await db.mealsBetween(from, keyOf(today()))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const seen = new Set();
  recentCache = meals.filter(m => { const k = m.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  if (!recentCache.length || !el.isConnected) return;
  el.innerHTML = `<div class="label">Repetir una comida reciente</div>
    <div class="recent-list">${recentCache.map((m, i) => recentRow(m, `data-recent="${i}"`)).join('')}</div>`;
}

function repeatMeal(m) {
  if (!m) return;
  openReview(newDraft({ name: m.name, photo: m.photo, items: m.items.map(i => ({ ...i })) }), false, true);
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
    big = toJpeg(img, 1280, 0.8);    // para enviar a la IA
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

function openReview(draft, editing = false, fresh = false, inPlace = false) {
  draft.items = draft.items.map(withBase);
  const conf = { low: 'Confianza baja · revisa las cantidades', medium: 'Confianza media', high: 'Confianza alta' };

  const render = () => `
    <div class="sheet-title-row">
      <h2 class="sheet-title">${editing ? 'Editar comida' : 'Revisa y guarda'}</h2>
      <button class="icon-btn star" id="fav" aria-label="Guardar en favoritas">☆</button>
    </div>
    <div class="review-top">
      ${draft.photo ? `<img src="${draft.photo}" alt="">` : ''}
      <label class="field"><span>Nombre</span><input id="mname" value="${esc(draft.name)}" placeholder="Ej: Pollo con arroz"></label>
    </div>
    ${draft.confidence ? `<span class="badge ${draft.confidence}">● ${conf[draft.confidence]}</span>` : ''}
    ${draft.note ? `<div class="notice">${esc(draft.note)}</div>` : ''}
    <label class="field"><span>Tipo de comida</span>
      <select id="mtype">${MEAL_TYPES.map(t => `<option value="${t.id}" ${t.id === draft.type ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}</select>
    </label>
    <div class="label">Alimentos</div>
    <div id="items">${draft.items.map(itemCard).join('')}</div>
    <button class="btn secondary" id="add-item">+ Añadir alimento</button>
    <div class="label">Puntuación</div>
    <div class="card score-card" id="score"></div>
    ${editing ? '<button class="btn ghost danger" id="del">Borrar comida</button>' : ''}
    <div class="totals">
      <div class="totals-row" id="totals"></div>
      <button class="btn primary" id="save">Guardar</button>
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
      const on = !!findFav();
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
      star.setAttribute('aria-label', on ? 'Quitar de favoritas' : 'Guardar en favoritas');
    };
    loadFavorites().then(() => { if (star.isConnected) paintStar(); });
    star.addEventListener('click', async () => {
      const f = findFav();
      if (f) {
        await db.deleteFavorite(f.id);
        toast('Quitada de favoritas');
      } else {
        const m = buildMeal();
        if (!m.items.length) return toast('Añade al menos un alimento');
        await db.putFavorite({ name: m.name, type: draft.type, photo: draft.photo || null, items: m.items,
          kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, createdAt: Date.now() });
        toast('Guardada en favoritas ⭐');
      }
      haptic();
      await loadFavorites();
      paintStar();
    });

    body.querySelector('#mname').addEventListener('input', e => { draft.name = e.target.value; paintStar(); });
    body.querySelector('#mtype').addEventListener('change', e => { draft.type = e.target.value; });

    body.querySelector('#items').addEventListener('input', e => {
      const card = e.target.closest('[data-i]');
      if (!card) return;
      const it = draft.items[Number(card.dataset.i)];
      const f = e.target.dataset.f;
      if (f === 'name') { it.name = e.target.value; return; }
      const v = parseFloat(String(e.target.value).replace(',', '.')) || 0;
      if (f === 'grams') {
        it.grams = v;
        if (it.base.grams > 0) {
          const k = v / it.base.grams;
          for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
            it[key] = key === 'kcal' ? r0(it.base[key] * k) : r1(it.base[key] * k);
            card.querySelector(`[data-f="${key}"]`).value = it[key];
          }
        }
      } else {
        it[f] = v;
        it.base = { grams: +it.grams || 0, kcal: +it.kcal || 0, protein: +it.protein || 0, carbs: +it.carbs || 0, fat: +it.fat || 0 };
      }
      updateTotals();
    });

    body.querySelector('#items').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      draft.items.splice(Number(del.dataset.del), 1);
      setSheetContent(render(), mount);
    });

    body.querySelector('#add-item').addEventListener('click', () => {
      draft.items.push(withBase(blankItem()));
      setSheetContent(render(), mount);
      const inputs = document.querySelectorAll('.sheet [data-f="name"]');
      inputs[inputs.length - 1]?.focus();
    });

    body.querySelector('#del')?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta comida?')) return;
      await db.deleteMeal(draft.id);
      closeSheet();
      renderNutrition();
      toast('Comida borrada');
    });

    body.querySelector('#save').addEventListener('click', async () => {
      const m = buildMeal();
      if (!m.items.length) return toast('Añade al menos un alimento');
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

function itemCard(it, i) {
  const num = (f, label, step = '1') => `<label>${label}<input data-f="${f}" type="number" inputmode="decimal" step="${step}" min="0" value="${it[f]}"></label>`;
  return `<div class="card item" data-i="${i}">
    <div class="item-top">
      <input data-f="name" value="${esc(it.name)}" placeholder="Alimento">
      <button class="icon-btn" data-del="${i}" aria-label="Quitar alimento">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="item-grid">
      ${num('grams', 'Gramos')}${num('kcal', 'Kcal')}${num('protein', 'Prot.', '0.1')}${num('carbs', 'Hidr.', '0.1')}${num('fat', 'Grasa', '0.1')}
    </div>
  </div>`;
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
