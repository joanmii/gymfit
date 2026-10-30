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
    <div class="kcal">${r0(m.kcal)}<small>kcal</small></div>
  </button>`;
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
    });
    renderRecent(body.querySelector('#recent'));
  });
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
    <div class="recent-list">${recentCache.map((m, i) => `
      <button class="recent" data-recent="${i}">
        ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${MEAL_TYPES.find(t => t.id === m.type)?.emoji || '🍽️'}</span>`}
        <span class="n">${esc(m.name)}</span>
        <span class="k">${r0(m.kcal)} kcal</span>
      </button>`).join('')}</div>`;
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
    <h2 class="sheet-title">${editing ? 'Editar comida' : 'Revisa y guarda'}</h2>
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
      return t;
    };
    updateTotals();

    body.querySelector('#mname').addEventListener('input', e => { draft.name = e.target.value; });
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
      const t = updateTotals();
      const items = draft.items
        .filter(i => i.name.trim() || i.kcal)
        .map(({ base, ...i }) => ({ ...i, name: i.name.trim() || 'Alimento' }));
      if (!items.length) return toast('Añade al menos un alimento');
      const meal = {
        ...(draft.id ? { id: draft.id } : {}),
        date: draft.date,
        type: draft.type,
        name: draft.name.trim() || items.map(i => i.name).slice(0, 2).join(' y '),
        photo: draft.photo,
        confidence: draft.confidence,
        items,
        kcal: r0(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat),
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
