// =========================================================
// Nutrición · menú «Añadir comida»: foto, describir, recientes y favoritos
// =========================================================
import { db } from './db.js';
import { analyzeFood, analyzeText } from './api.js';
import { openScanner } from './barcode.js';
import { chev } from './calendar.js';
import { closeSheet, onSheetCleanup, openSheet, setSheetContent } from './sheet.js';
import { addDays, esc, fmtLong, haptic, hasAiKey, hasTextAi, keyOf, r0, r1, toast, today } from './utils.js';
import { blankItem, day, defaultType, gradeBadge, inType, loadImage, MEAL_TYPES, mealScore, newDraft, perServing, servingsOf, sumItems, toJpeg, TYPE } from './nut-core.js';
import { loadFavorites, myDishes } from './nut-favs.js';
import { openReview } from './nut-review.js';
import { browserState, openFoodBrowser, pickerState } from './nut-foods.js';

// ---------- Añadir comida ----------
export function openAddMenu(inPlace = false) {
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
      ${tile('list', '🥕', 'Alimentos', 'Y tus platos', 'var(--orange)')}
    </div>
    <button class="action" data-a="man" style="--c:color-mix(in srgb,var(--muted) 22%,transparent);margin-top:10px"><span class="e">✍️</span><b>Introducir a mano</b></button>
    <div id="favs"></div>
    <div id="recent"></div>`, body => {
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'cam') { closeSheet(true); document.getElementById('photo-input').click(); }
      if (a === 'txt') openDescribe();
      if (a === 'bar') openScanner(product => openReview(newDraft(productToDraft(product)), false, true));
      if (a === 'man') openReview(newDraft({ items: [blankItem()] }), false, true);
      if (a === 'list') { browserState.q = ''; browserState.tab = 'foods'; openFoodBrowser(); }
      const r = e.target.closest('[data-recent]');
      if (r) repeatMeal(recentCache[Number(r.dataset.recent)]);
      const f = e.target.closest('[data-fav]');
      if (f) repeatMeal(dishList[Number(f.dataset.fav)], favType);
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
    <span class="k">${r0(m.items?.length ? sumItems(m.items).kcal / servingsOf(m) : m.kcal)} kcal</span>
  </button>`;

// Desplegable (cerrado por defecto) para favoritas y recientes
const fold = (title, count, inner) => `
  <details class="fold">
    <summary><span>${title}</span><span class="cnt">${count}</span>${chev('r')}</summary>
    <div class="fold-body">${inner}</div>
  </details>`;

// Favoritos del menú «Añadir comida»: pestañas por tipo (empieza en el de la hora actual)
let favType = 'comida';
let dishList = [];   // «Mis platos» del desplegable
async function renderFavorites(el) {
  await loadFavorites();
  if (!el.isConnected) return;
  favType = defaultType();
  dishList = myDishes();
  if (!dishList.length) { el.innerHTML = ''; return; }
  el.innerHTML = fold('⭐ Mis platos', dishList.length, `<div class="chips scroll fav-types">${MEAL_TYPES.map(t => {
        const n = dishList.filter(f => inType(f, t.id)).length;
        return `<button class="chip" data-ftype="${t.id}" style="--c:var(--accent)">${t.emoji} ${t.name}${n ? ` · ${n}` : ''}</button>`;
      }).join('')}</div><div data-favlist></div>`);
  paintFavList(el);
}

function paintFavList(el) {
  el.querySelectorAll('[data-ftype]').forEach(b => b.classList.toggle('on', b.dataset.ftype === favType));
  const list = dishList.map((m, i) => [m, i]).filter(([m]) => inType(m, favType));
  el.querySelector('[data-favlist]').innerHTML = list.length
    ? `<div class="recent-list">${list.map(([m, i]) => recentRow(m, `data-fav="${i}"`)).join('')}</div>`
    : `<div class="muted small" style="margin:6px 2px 0">Ninguno de ${TYPE(favType).name.toLowerCase()}</div>`;
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
  openReview(newDraft({ name: m.name, photo: m.photo, items: perServing(m), ...(type ? { type } : {}) }), false, true);
}

// ---------- Describir por texto o voz ----------
function openDescribe(initial = '') {
  const hasKey = hasTextAi();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  setSheetContent(`
    <h2 class="sheet-title">Describe tu comida</h2>
    <label class="field">
      <textarea id="desc" rows="4" placeholder="Ej: dos huevos fritos con una tostada de pan con aceite y un café con leche">${esc(initial)}</textarea>
    </label>
    <button class="mic-btn" id="mic" type="button">
      <span class="mic-dot"></span><span id="mic-label">${SR ? 'Toca para dictar' : 'Usa el micrófono 🎙️ del teclado para dictar'}</span>
    </button>
    ${hasKey ? '' : '<div class="notice">Añade tu clave de IA en <b>Ajustes</b>.</div>'}
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

export async function startPhotoFlow(file) {
  let big, thumb;
  try {
    const img = await loadImage(file);
    big = toJpeg(img, 1024, 0.78);   // para enviar a la IA (más pequeña = sube y se procesa antes)
    thumb = toJpeg(img, 360, 0.7);   // miniatura que se guarda (ligera para las copias)
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
    ${hasKey ? '' : '<div class="notice">Añade tu clave de IA en <b>Ajustes</b>.</div>'}
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
