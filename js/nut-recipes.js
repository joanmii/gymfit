// =========================================================
// Nutrición · Recetas: predeterminadas, guardadas y creadas con IA
// =========================================================
import { db } from './db.js';
import { createRecipe } from './api.js';
import { norm } from './foods.js';
import { BUILTIN } from './cookbook.js';
import { closeSheet, onSheetCleanup, openSheet, setSheetContent } from './sheet.js';
import { beep, unlockAudio } from './workout.js';
import { esc, haptic, hasTextAi, r0, r1, toast } from './utils.js';
import { renderNutrition } from './nutrition.js';
import { ALL_TYPES, defaultType, dishTypes, favKey, macroRow, newDraft, perServing, servingsOf, sumItems, TOOLS, TYPE, typeChips, typesOf, unitText } from './nut-core.js';
import { favCache, foodThumb, listFoods, loadFavorites, loadFoodFavs, loadMyFoods, setDishTypes } from './nut-favs.js';
import { openReview } from './nut-review.js';

// ---------- Recetas: las predeterminadas y «Mis recetas» (guardadas, creadas a mano o con IA) ----------
let recipeQ = '';
const recipeKcal = r => r0(sumItems(r.items).kcal / servingsOf(r));
// Minutos que dice un paso («hornea 20 min», «1 hora», «10-12 minutos») para ponerle temporizador
const stepMinutes = s => {
  const m = String(s).match(/(\d+(?:[.,]\d+)?)\s*(?:(?:-|a)\s*\d+\s*)?(h|horas?|min(?:utos?)?)\b/i);
  if (!m) return 0;
  const v = parseFloat(m[1].replace(',', '.')) * (/^h/i.test(m[2]) ? 60 : 1);
  return v > 0 && v <= 600 ? v : 0;
};
const clock = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const recipeEmoji = r => r.emoji || TYPE(typesOf(r)?.[0]).emoji;
const recipeCard = (r, attr) => `
  <button class="rc-card" ${attr}>
    ${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="e">${recipeEmoji(r)}</span>`}
    <b>${esc(r.name)}</b>
    <small>${r.minutes ? `${r.minutes} min · ` : ''}${recipeKcal(r)} kcal</small>
  </button>`;

export async function renderRecipes(el) {
  await loadFavorites();
  if (!el.isConnected) return;
  const words = norm(recipeQ).split(/\s+/).filter(Boolean);
  const match = r => words.every(w => norm(r.name).includes(w) || r.items.some(i => norm(i.name).includes(w)));
  const mine = favCache.filter(r => r.items?.length && match(r)), defs = BUILTIN.filter(match);
  el.innerHTML = `
    <div class="rc-actions">
      <button class="btn primary" data-rai>✨ Crear con IA</button>
      <button class="btn secondary" data-rnew>✍️ Crear a mano</button>
    </div>
    <input class="search" id="rq" type="search" enterkeyhint="search" autocomplete="off" aria-label="Buscar" value="${esc(recipeQ)}" style="margin-top:12px">
    <div data-rlist>
      ${mine.length ? `<div class="label">⭐ Mis recetas</div><div class="rc-grid">${mine.map(r => recipeCard(r, `data-rmine="${r.id}"`)).join('')}</div>` : ''}
      ${defs.length ? `<div class="label">📖 Recetas</div><div class="rc-grid">${defs.map(r => recipeCard(r, `data-rdef="${r.key}"`)).join('')}</div>` : ''}
      ${!mine.length && !defs.length ? '<div class="card empty"><span class="e">🔍</span><b>Sin resultados</b></div>' : ''}
    </div>`;
  const q = el.querySelector('#rq');
  q.addEventListener('input', () => {
    recipeQ = q.value;
    const pos = q.selectionStart;
    renderRecipes(el).then(() => { const n = el.querySelector('#rq'); n?.focus(); n?.setSelectionRange(pos, pos); });
  });
}

// Crear / editar una receta propia: la misma pantalla que una comida, con pasos opcionales
export function openRecipeEditor(r = {}, editing = false, inSheet = true) {
  openReview({
    ...newDraft(),
    name: r.name || '', photo: r.photo || null, items: (r.items || []).map(i => ({ ...i })),
    ...(editing ? { id: r.id, createdAt: r.createdAt } : {}),
    emoji: r.emoji || null, minutes: r.minutes || null, tools: [...(r.tools || [])], steps: [...(r.steps || [])],
    servings: servingsOf(r), notes: [r.also ? `Además: ${r.also}` : '', r.notes || ''].filter(Boolean).join('\n'),
    mode: 'dish', types: r.types?.length ? r.types : [defaultType()],
  }, editing, inSheet);
}

// Ficha de una receta. req: petición con la que la creó la IA (si aún no está guardada)
export function openRecipe(r, { req = null, inPlace = false } = {}) {
  const own = r.id != null;
  const n = servingsOf(r);
  const tot = sumItems(perServing(r));
  const meta = [r.minutes ? `⏱ ${r.minutes} min` : '', (r.tools || []).join(', '), n > 1 ? `${n} raciones` : ''].filter(Boolean).join(' · ');
  const savedCopy = () => (own ? r : favCache.find(s => favKey(s.name) === favKey(r.name)));
  const html = `
    <div class="rc-hero">${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="e">${recipeEmoji(r)}</span>`}
      <h2 class="sheet-title">${esc(r.name)}</h2>
      ${meta ? `<div class="muted small">${esc(meta)}</div>` : ''}
    </div>
    <div class="card">${macroRow(tot)}${n > 1 ? '<div class="muted small rc-per">por ración</div>' : ''}</div>
    <div class="label">Ingredientes${n > 1 ? ` · ${n} raciones` : ''}</div>
    <div class="card rc-ings">${r.items.map(i => `<div><span>${esc(i.name)}</span><b>${r0(i.grams)} g${i.unitG ? ` · ${unitText(i).replace(/<\/?b>/g, '')}` : ''}</b></div>`).join('')}</div>
    ${r.also ? `<div class="muted small rc-also">Además: ${esc(r.also)}</div>` : ''}
    ${r.steps?.length ? `<div class="label">Pasos</div><div class="card how"><ol class="steps">${r.steps.map((s, i) => {
      const m = stepMinutes(s);
      return `<li>${esc(s)}${m ? `<button class="step-timer" data-tm="${i}" data-min="${m}">⏱ ${m} min</button>` : ''}</li>`;
    }).join('')}</ol></div>` : ''}
    ${r.notes ? `<div class="label">Notas</div><div class="card rc-notes">${esc(r.notes)}</div>` : ''}
    ${req ? '' : `<div class="label">🏷️ Aparece en</div>${typeChips(t => dishTypes(r).includes(t), 'data-dt')}`}
    <button class="btn primary" data-ruse style="margin-top:18px">🍽️ ${n > 1 ? 'Apuntar 1 ración' : 'Apuntar como comida'}</button>
    ${own
      ? '<button class="btn secondary" data-redit>✏️ Editar</button><button class="btn ghost danger" data-rdel>Borrar receta</button>'
      : `<button class="btn secondary" data-rsave></button>${req ? '<button class="btn ghost" data-rcopy>✏️ Modificar</button><button class="btn ghost" data-ragain>🔄 Otra idea</button>' : '<button class="btn ghost" data-rcopy>✏️ Copiar y modificar</button>'}`}`;
  (inPlace ? setSheetContent : openSheet)(html, body => {
    const sb = body.querySelector('[data-rsave]');
    const paintSave = () => { if (sb) sb.textContent = savedCopy() ? '★ Guardada · quitar' : '⭐ Guardar en mis recetas'; };
    paintSave();
    const timers = new Map();
    onSheetCleanup(() => timers.forEach(id => clearInterval(id)));
    const stopTimer = b => { clearInterval(timers.get(b.dataset.tm)); timers.delete(b.dataset.tm); b.classList.remove('run'); b.textContent = `⏱ ${b.dataset.min} min`; };
    body.addEventListener('click', async e => {
      const tb = e.target.closest('[data-tm]');
      if (tb) {
        if (timers.has(tb.dataset.tm)) return stopTimer(tb);
        unlockAudio();
        const end = Date.now() + Number(tb.dataset.min) * 60000;
        tb.classList.add('run');
        const tick = () => {
          const left = end - Date.now();
          if (left > 0) { tb.textContent = `⏱ ${clock(left)}`; return; }
          stopTimer(tb);
          beep(); haptic();
          toast(`⏱ Paso ${Number(tb.dataset.tm) + 1} listo`);
        };
        timers.set(tb.dataset.tm, setInterval(tick, 500));
        tick();
        return haptic();
      }
      if (e.target.closest('[data-ruse]')) {
        return openReview(newDraft({ name: r.name, photo: r.photo || null, items: perServing(r) }), false, true);
      }
      const dt = e.target.closest('[data-dt]');
      if (dt) {
        const ts = new Set(dishTypes(r));
        ts.has(dt.dataset.dt) ? ts.delete(dt.dataset.dt) : ts.add(dt.dataset.dt);
        if (!ts.size) return toast('Déjalo al menos en una comida');
        await setDishTypes(r, ALL_TYPES.filter(t => ts.has(t)));
        dt.classList.toggle('on', ts.has(dt.dataset.dt));
        return haptic();
      }
      if (e.target.closest('[data-rsave]')) {
        const s = savedCopy();
        if (s) {
          await db.deleteFavorite(s.id);
          toast('Quitada de mis recetas');
        } else {
          await db.putFavorite({
            name: r.name, emoji: r.emoji || null, minutes: r.minutes || null, tools: r.tools || [], steps: r.steps || [],
            items: r.items, ...(n > 1 ? { servings: n } : {}),
            ...(r.notes || r.also ? { notes: [r.also ? `Además: ${r.also}` : '', r.notes || ''].filter(Boolean).join('\n') } : {}),
            kcal: r0(tot.kcal), protein: r1(tot.protein), carbs: r1(tot.carbs), fat: r1(tot.fat),
            ...(req ? {} : { types: dishTypes(r) }), custom: true, createdAt: Date.now(),
          });
          toast('Receta guardada ⭐');
        }
        await loadFavorites();
        haptic();
        paintSave();
        renderNutrition();
        return;
      }
      if (e.target.closest('[data-redit]')) return openRecipeEditor({ ...r, types: dishTypes(r) }, true);
      if (e.target.closest('[data-rcopy]')) return openRecipeEditor({ ...r, name: req ? r.name : `${r.name} (mía)`, types: dishTypes(r) });
      if (e.target.closest('[data-rdel]')) {
        if (!confirm(`¿Borrar «${r.name}»?`)) return;
        await db.deleteFavorite(r.id);
        await loadFavorites();
        closeSheet();
        renderNutrition();
        return toast('Receta borrada');
      }
      if (e.target.closest('[data-ragain]')) return runRecipeAI(req);
    });
  });
}

// ---------- Crear receta: escribiendo o con alimentos, con qué cocinarla y cuánto tiempo ----------
const TIMES = [10, 20, 30, 45];
const STOP = new Set(['con', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'un', 'una', 'unos', 'unas', 'para', 'que', 'algo', 'quiero', 'tengo',
  'sin', 'al', 'en', 'mi', 'me', 'por', 'algun', 'alguna', 'cruda', 'crudo', 'cocido', 'cocida', 'lata', 'natural', 'polvo', 'plancha', 'casero', 'casera']);
const stem = w => (w.length > 4 ? w.replace(/(es|s)$/, '') : w);
const recipeWords = text => [...new Set(norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(stem))];

// Recetas (tuyas y predeterminadas) que usan esos alimentos, de la que más coincide a la que menos
function matchRecipes(words) {
  if (!words.length) return [];
  const seen = new Set();
  return [...favCache.filter(r => r.items?.length), ...BUILTIN]
    .filter(r => { const k = favKey(r.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .map(r => {
      const hit = r.items.filter(i => recipeWords(i.name).some(w => words.some(t => w.startsWith(t) || t.startsWith(w)))).length;
      return { r, hit, n: r.items.length };
    })
    .filter(x => x.hit)
    .sort((a, b) => b.hit / b.n - a.hit / a.n || b.hit - a.hit)
    .slice(0, 6);
}

let recipeReq = null;
export function openRecipeAI(prev = null) {
  const hasKey = hasTextAi();
  const req = recipeReq = prev || { mode: 'text', text: '', foods: [], tools: [], time: null };
  let matches = [];
  openSheet(`
    <h2 class="sheet-title">✨ Crear receta</h2>
    <div class="seg wide" style="margin:6px 0 12px">
      <button data-rmode="text" class="${req.mode === 'text' ? 'on' : ''}">✍️ Escribir</button>
      <button data-rmode="foods" class="${req.mode === 'foods' ? 'on' : ''}">🥕 Alimentos</button>
    </div>
    <div data-rm-text ${req.mode === 'text' ? '' : 'hidden'}>
      <textarea id="rtext" class="rc-text" rows="3" placeholder="Algo rápido con pollo y verduras…">${esc(req.text)}</textarea>
    </div>
    <div data-rm-foods ${req.mode === 'foods' ? '' : 'hidden'}>
      <div class="chips" data-rfoods></div>
      <input class="search" id="rfq" type="search" enterkeyhint="done" autocomplete="off" aria-label="Añadir alimento" style="margin-top:8px">
      <div class="food-list" data-rfres></div>
    </div>
    <div class="label">Con qué</div>
    <div class="chips">${TOOLS.map(([t, e]) => `<button class="chip ${req.tools.includes(t) ? 'on' : ''}" data-rtool="${t}" style="--c:var(--accent)">${e} ${t}</button>`).join('')}</div>
    <div class="label">Tiempo</div>
    <div class="chips">${TIMES.map(m => `<button class="chip ${req.time === m ? 'on' : ''}" data-rtime="${m}" style="--c:var(--accent)">${m === 45 ? '45+ min' : `${m} min`}</button>`).join('')}</div>
    ${hasKey ? '' : '<div class="notice" style="margin-top:12px">Añade tu clave de IA en <b>Ajustes</b>.</div>'}
    <button class="btn primary" id="rgo" style="margin-top:16px" ${hasKey ? '' : 'disabled'}>✨ Crear con IA</button>
    <div data-rmatch></div>`, body => {
    const words = () => recipeWords(req.mode === 'text' ? req.text : req.foods.join(' '));
    const paintMatches = () => {
      matches = matchRecipes(words());
      body.querySelector('[data-rmatch]').innerHTML = matches.length
        ? `<div class="label">📖 Ya tienes recetas con esto</div><div class="rc-grid">${matches.map((m, i) => `
          <button class="rc-card" data-rmi="${i}"><span class="e">${m.r.emoji || '🍽️'}</span><b>${esc(m.r.name)}</b>
            <small>${m.hit === m.n ? '✓ Tienes todo' : `Tienes ${m.hit} de ${m.n}`}</small></button>`).join('')}</div>`
        : '';
    };
    const paintFoods = () => {
      body.querySelector('[data-rfoods]').innerHTML = req.foods.map((f, i) => `<button class="chip on" data-rfdel="${i}" style="--c:var(--accent)">${esc(f)} ✕</button>`).join('');
      paintMatches();
    };
    const fq = body.querySelector('#rfq'), res = body.querySelector('[data-rfres]');
    let found = [];
    const paintSearch = () => {
      const q = fq.value.trim();
      found = q ? listFoods('', q, 8) : [];
      res.innerHTML = found.map((f, i) => `<button class="food-row" data-rfadd="${i}">${foodThumb(f)}<span class="n">${esc(f.name)}</span><span class="plus">+</span></button>`).join('')
        + (q && !found.some(f => favKey(f.name) === favKey(q)) ? `<button class="food-row" data-rfadd="raw"><span class="e">➕</span><span class="n">Añadir «${esc(q)}»</span></button>` : '');
    };
    const addFood = name => {
      if (name && !req.foods.some(f => favKey(f) === favKey(name))) req.foods.push(name);
      fq.value = ''; paintSearch(); paintFoods(); haptic();
    };
    Promise.all([loadFoodFavs(), loadMyFoods(), loadFavorites()]).then(() => { if (body.isConnected) { paintFoods(); paintSearch(); } });
    paintFoods();

    const ta = body.querySelector('#rtext');
    ta.addEventListener('input', () => { req.text = ta.value; paintMatches(); });
    fq.addEventListener('input', paintSearch);
    fq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFood(fq.value.trim()); } });

    body.addEventListener('click', e => {
      const md = e.target.closest('[data-rmode]');
      if (md) {
        req.mode = md.dataset.rmode;
        body.querySelectorAll('[data-rmode]').forEach(b => b.classList.toggle('on', b === md));
        body.querySelector('[data-rm-text]').hidden = req.mode !== 'text';
        body.querySelector('[data-rm-foods]').hidden = req.mode !== 'foods';
        (req.mode === 'text' ? ta : fq).focus();
        return paintMatches();
      }
      const add = e.target.closest('[data-rfadd]');
      if (add) return addFood(add.dataset.rfadd === 'raw' ? fq.value.trim() : found[Number(add.dataset.rfadd)].name);
      const del = e.target.closest('[data-rfdel]');
      if (del) { req.foods.splice(Number(del.dataset.rfdel), 1); return paintFoods(); }
      const tl = e.target.closest('[data-rtool]');
      if (tl) {
        const t = tl.dataset.rtool;
        req.tools = req.tools.includes(t) ? req.tools.filter(x => x !== t) : [...req.tools, t];
        tl.classList.toggle('on', req.tools.includes(t));
        return haptic();
      }
      const tm = e.target.closest('[data-rtime]');
      if (tm) {
        const m = Number(tm.dataset.rtime);
        req.time = req.time === m ? null : m;
        body.querySelectorAll('[data-rtime]').forEach(b => b.classList.toggle('on', Number(b.dataset.rtime) === req.time));
        return haptic();
      }
      const mi = e.target.closest('[data-rmi]');
      if (mi) return openRecipe(matches[Number(mi.dataset.rmi)].r, { inPlace: true });
      if (e.target.closest('#rgo')) {
        if (req.mode === 'text' ? !req.text.trim() : !req.foods.length) {
          (req.mode === 'text' ? ta : fq).focus();
          return toast(req.mode === 'text' ? 'Escribe qué te apetece o qué tienes' : 'Añade algún alimento');
        }
        runRecipeAI(req);
      }
    });
  });
}

async function runRecipeAI(req) {
  setSheetContent(`<div class="loading"><div class="spinner"></div><div>Creando receta…</div></div>`);
  try {
    const r = await createRecipe({
      text: req.mode === 'text' ? req.text.trim() : '',
      foods: req.mode === 'foods' ? req.foods : [],
      tools: req.tools, time: req.time,
    });
    r.tools = req.tools;
    openRecipe(r, { req, inPlace: true });
  } catch (err) {
    setSheetContent(`
      <h2 class="sheet-title">✨ Crear receta</h2>
      <div class="notice err">${esc(err.message)}</div>
      <button class="btn primary" id="retry" style="margin-top:14px">Reintentar</button>
      <button class="btn ghost" id="edit">Cambiar</button>`, body => {
      body.querySelector('#retry').addEventListener('click', () => runRecipeAI(req));
      body.querySelector('#edit').addEventListener('click', () => { closeSheet(true); openRecipeAI(req); });
    });
  }
}
