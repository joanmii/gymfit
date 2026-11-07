// =========================================================
// Nutrición · buscador de alimentos, lista de Alimentos, fichas y editores
// =========================================================
import { db } from './db.js';
import { openScanner, searchProducts, STORES } from './barcode.js';
import { FOOD_CATS, FOODS } from './foods.js';
import { chev } from './calendar.js';
import { setSheetContent } from './sheet.js';
import { cap, esc, haptic, r0, r1, saveSettings, state, toast } from './utils.js';
import { favKey, freshBox, macroRow, mealScore, productToFood, scaleFood, scoreCard, TYPE, typesOf } from './nut-core.js';
import { catChips, FAV_EMPTY, FOOD_EMOJIS, foodThumb, isFoodFav, listFoods, loadFoodFavs, loadMyFoods, myFoodsCache, toggleFoodFav } from './nut-favs.js';
import { openAddMenu } from './nut-add.js';

// ---------- Desplegable «Añadir alimento» (dentro de la revisión de la comida) ----------
// Se pinta dentro de `el`. ctx: { onPick(item), onManual(), onScan() }
export const pickerState = { q: '', cat: 'fav' };

const portionText = f => {
  const [label, g] = f.portions[0] || ['100 g', 100];
  return `${label === '100 g' ? '100 g' : `1 ${label} (${r0(g)} g)`} · ${r0(f.per100.kcal * g / 100)} kcal`;
};
const starSpan = f => {
  const on = isFoodFav(f.name);
  return `<span class="fstar ${on ? 'on' : ''}" data-star role="button" aria-label="${on ? 'Quitar de' : 'Guardar en'} favoritos">${on ? '★' : '☆'}</span>`;
};
const foodRow = (f, attr) => `
  <button class="food-row" ${attr}>
    ${foodThumb(f)}
    <span class="n">${esc(f.name)}${f.store ? `<small>${esc(f.store)}</small>` : ''}</span>
    ${starSpan(f)}
    <span class="plus">+</span>
  </button>`;

// Supermercado elegido para buscar en internet (se recuerda mientras usas la app)
let onlineStore = null;
const storeChips = () => `<div class="label">🌐 Buscar en internet · España</div><div class="chips scroll">
  <button class="chip ${!onlineStore ? 'on' : ''}" data-store="" style="--c:var(--accent)">Todos</button>
  ${STORES.map(([id, name]) => `<button class="chip ${onlineStore === id ? 'on' : ''}" data-store="${id}" style="--c:var(--accent)">${name}</button>`).join('')}
</div>`;

export function mountFoodPicker(el, ctx) {
  const st = pickerState;
  let shown = [], online = [];
  const box = freshBox(el);
  const row = foodRow;

  box.innerHTML = `
    <input class="search" id="pk-q" type="search" enterkeyhint="search" autocomplete="off" aria-label="Buscar" value="${esc(st.q)}">
    <div class="pick-actions">
      <button class="action" data-pk="scan" style="--c:color-mix(in srgb,var(--blue) 30%,transparent)"><span class="e">🏷️</span><div>Escanear<small>Código de barras</small></div></button>
      <button class="action" data-pk="manual" style="--c:color-mix(in srgb,var(--muted) 22%,transparent)"><span class="e">✍️</span><div>En blanco<small>Pon tú los datos</small></div></button>
    </div>
    <div class="label" data-pk-label>🍽️ Alimentos</div>
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
    const chips = storeChips();
    if (state === 'idle') onl.innerHTML = `${chips}<button class="btn secondary" data-pk="web" style="margin-top:10px">🌐 Buscar «${esc(query)}» en internet</button>`;
    if (state === 'loading') onl.innerHTML = `${chips}<div class="online-load"><div class="spinner"></div>Buscando en Open Food Facts…</div>`;
    if (state === 'error') onl.innerHTML = `${chips}<div class="notice err">${esc(msg)}</div>`;
    if (state === 'done') onl.innerHTML = chips + (online.length
      ? `<div class="food-list" style="margin-top:8px">${online.map((f, i) => row(f, `data-on="${i}"`)).join('')}</div>`
      : `<div class="muted small" style="text-align:center;margin:12px 0">No hay productos para «${esc(query)}»${onlineStore ? ' en esa tienda' : ''}.</div>`);
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
      : (!query && st.cat === 'fav' ? FAV_EMPTY : '<div class="muted small" style="text-align:center;margin:14px 0 4px">No está en la lista</div>');
    online = [];
    paintOnline('idle');
  };
  paint();
  Promise.all([loadFoodFavs(), loadMyFoods()]).then(() => { if (box.isConnected) paint(); });

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
    if (fr && e.target.closest('[data-star]')) {
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
    const so = e.target.closest('[data-store]');
    if (so) { onlineStore = so.dataset.store || null; haptic(); }
    if (act === 'web' || so) {
      const query = st.q.trim();
      paintOnline('loading');
      try {
        online = (await searchProducts(query, onlineStore)).map(productToFood);
        if (st.q.trim() === query && onl.isConnected) paintOnline('done');
      } catch (err) {
        if (onl.isConnected) paintOnline('error', err.message);
      }
    }
  });
}

// ---------- Lista de alimentos y platos: ficha completa de cada uno y crear platos ----------
export const browserState = { q: '', cat: 'fav' };
const infoRow = (f, attr, sub) => `
  <button class="food-row" ${attr}>
    ${f.items ? (f.photo ? `<img src="${esc(f.photo)}" alt="" loading="lazy">` : `<span class="e">${f.emoji || TYPE(typesOf(f)?.[0]).emoji}</span>`) : foodThumb(f)}
    <span class="n">${esc(f.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    ${chev('r')}
  </button>`;
export function openFoodBrowser() {
  const st = browserState;
  let foods = [], online = [];
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Volver</button>
    <h2 class="sheet-title">🍽️ Alimentos</h2>
    <button class="btn primary" data-newfood>＋ Añadir alimento</button>
    <input class="search" id="bq" type="search" enterkeyhint="search" autocomplete="off" style="margin-top:12px" aria-label="Buscar" value="${esc(st.q)}">
    <div data-blist></div>`, body => {
    const listEl = body.querySelector('[data-blist]');

    const paint = () => {
      const query = st.q.trim();
      foods = listFoods(st.cat, query, 60);
      listEl.innerHTML = `
        <div class="label">📋 ${query ? 'Resultados' : 'Alimentos'}</div>
        ${query ? '' : `<div class="chips scroll">${catChips(st.cat)}</div>`}
        <div class="food-list">${foods.map((f, i) => infoRow(f, `data-fi="${i}"`, '')).join('')
          || (!query && st.cat === 'fav' ? FAV_EMPTY : '<div class="muted small" style="text-align:center;margin:12px 0">No está en la lista.</div>')}</div>
        ${query.length >= 2 ? `<div data-web>${storeChips()}<button class="btn secondary" data-websearch style="margin-top:10px">🌐 Buscar «${esc(query)}» en internet</button></div>` : ''}`;
    };
    paint();
    Promise.all([loadFoodFavs(), loadMyFoods()]).then(() => { if (listEl.isConnected) paint(); });

    let tm;
    body.querySelector('#bq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; paint(); }, 120); });
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openAddMenu(true);
      if (e.target.closest('[data-newfood]')) return openFoodEditor({ cat: st.cat === 'fav' ? 'lacteos' : st.cat });
      const c = e.target.closest('[data-cat]');
      if (c) { st.cat = c.dataset.cat; return paint(); }
      const pick = (attr, arr) => { const b = e.target.closest(`[${attr}]`); return b ? arr[Number(b.getAttribute(attr))] : null; };
      const food = pick('data-fi', foods) || pick('data-on', online);
      if (food) return openFoodDetail(food);
      const so = e.target.closest('[data-store]');
      if (so) { onlineStore = so.dataset.store || null; haptic(); }
      if (e.target.closest('[data-websearch]') || so) {
        const web = body.querySelector('[data-web]');
        const query = st.q.trim();
        web.innerHTML = `${storeChips()}<div class="online-load"><div class="spinner"></div>Buscando en Open Food Facts…</div>`;
        try {
          online = (await searchProducts(query, onlineStore)).map(productToFood);
          if (!web.isConnected) return;
          web.innerHTML = storeChips() + (online.length
            ? `<div class="food-list" style="margin-top:8px">${online.map((f, i) => infoRow(f, `data-on="${i}"`, f.store || '')).join('')}</div>`
            : `<div class="muted small" style="text-align:center;margin:12px 0">No hay productos para «${esc(query)}»${onlineStore ? ' en esa tienda' : ''}.</div>`);
        } catch (err) {
          if (web.isConnected) web.innerHTML = `${storeChips()}<div class="notice err">${esc(err.message)}</div>`;
        }
      }
    });
  });
}

const nutriRow = (title, sub, m) => `
  <div class="portion-row"><div><b>${title}</b><small>${sub}</small></div>
    <span class="pk">${r0(m.kcal)} kcal</span>
    <span class="pm"><i class="p-c">P ${r1(m.protein)}</i> <i class="c-c">H ${r1(m.carbs)}</i> <i class="f-c">G ${r1(m.fat)}</i></span></div>`;

function openFoodDetail(food) {
  const p = food.per100;
  const portions = [...(food.portions || [])];
  if (!portions.some(([, g]) => g === 100)) portions.push(['100 g', 100]);
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Alimentos</button>
    <div class="food-hero">
      <button class="fh-emoji" data-emoji aria-label="Cambiar emoji">${foodThumb(food)}</button>
      <div><b>${esc(food.name)}</b><small>${r0(p.kcal)} kcal por 100 g</small></div>
    </div>
    <div class="emoji-grid" data-egrid hidden>${FOOD_EMOJIS.map(em => `<button data-em="${em}">${em}</button>`).join('')}</div>
    <div class="label">Por 100 g</div>
    <div class="card">${macroRow(p)}</div>
    <div class="label">Raciones</div>
    <div class="card portion-list">${portions.map(([l, g]) => nutriRow(l === '100 g' ? '100 g' : `1 ${esc(l)}`, `${r0(g)} g`, scaleFood(food, g))).join('')}</div>
    <div class="label">Puntuación</div>
    <div class="card score-card">${scoreCard(mealScore({ items: [scaleFood(food, 100)] }))}</div>
    <button class="btn secondary" data-ffav style="margin-top:18px"></button>
    ${food.custom ? '<button class="btn secondary" data-fedit>✏️ Editar alimento</button><button class="btn ghost danger" data-fdel>Borrar alimento</button>' : ''}`, body => {
    const fb = body.querySelector('[data-ffav]');
    const paintFav = () => { fb.textContent = isFoodFav(food.name) ? '★ En favoritos · quitar' : '☆ Añadir a favoritos'; };
    paintFav();
    loadFoodFavs().then(() => { if (body.isConnected) paintFav(); });
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openFoodBrowser();
      if (e.target.closest('[data-emoji]')) { const g = body.querySelector('[data-egrid]'); g.hidden = !g.hidden; return haptic(); }
      const em = e.target.closest('[data-em]');
      if (em) {
        state.settings.foodEmoji = { ...(state.settings.foodEmoji || {}), [food.name]: em.dataset.em };
        saveSettings();
        if (food.custom && food.id != null) { food.emoji = em.dataset.em; await db.putMyFood(food); await loadMyFoods(); }
        body.querySelector('[data-emoji]').innerHTML = foodThumb(food);
        body.querySelector('[data-egrid]').hidden = true;
        return haptic();
      }
      if (e.target.closest('[data-fedit]')) return openFoodEditor(food);
      if (e.target.closest('[data-fdel]')) {
        if (!confirm(`¿Borrar «${food.name}» de tus alimentos?`)) return;
        await db.deleteMyFood(food.id);
        await loadMyFoods();
        toast('Alimento borrado');
        return openFoodBrowser();
      }
      if (e.target.closest('[data-ffav]')) {
        await toggleFoodFav(food);
        haptic();
        paintFav();
      }
    });
  });
}

// Añadir / editar un alimento propio: categoría, valores por 100 g y una ración opcional
function openFoodEditor(food = {}) {
  const editing = food.id != null;
  let cat = food.cat || 'lacteos';
  const p = food.per100 || {};
  const [pl, pg] = food.portions?.[0] || ['', ''];
  const num = (id, label, v, step = '0.1') => `<label>${label}<input id="${id}" type="number" inputmode="decimal" min="0" step="${step}" value="${v ?? ''}" placeholder="0"></label>`;
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Alimentos</button>
    <h2 class="sheet-title">${editing ? 'Editar alimento' : 'Añadir alimento'}</h2>
    ${editing ? '' : '<button class="btn secondary" data-fscan>🏷️ Escanear código de barras</button>'}
    ${food.image ? `<div class="food-hero" style="margin-top:12px">${foodThumb(food)}<div><small>Datos del envase · revísalos</small></div></div>` : ''}
    <label class="field"><span>Nombre</span><input id="fname" value="${esc(food.name || '')}" placeholder="Ej: Queso fresco batido Hacendado"></label>
    <div class="label">Categoría</div>
    <div class="chips">${FOOD_CATS.map(c => `<button class="chip ${c.id === cat ? 'on' : ''}" data-fcat="${c.id}" style="--c:var(--accent)">${c.emoji} ${c.name}</button>`).join('')}</div>
    <div class="label">Valores por 100 g</div>
    <div class="card item"><div class="item-grid four">
      ${num('fk', 'Kcal', p.kcal != null ? r0(p.kcal) : '', '1')}${num('fp', 'Prot.', p.protein != null ? r1(p.protein) : '')}${num('fc', 'Hidr.', p.carbs != null ? r1(p.carbs) : '')}${num('ff', 'Grasa', p.fat != null ? r1(p.fat) : '')}
    </div></div>
    <div class="label">Ración (opcional)</div>
    <div class="card item"><div class="item-grid two">
      <label>Nombre<input id="fpl" value="${esc(pl)}" placeholder="unidad, loncha, vaso…"></label>
      ${num('fpg', 'Gramos', pg, '1')}
    </div></div>
    <button class="btn primary" data-fsave style="margin-top:18px">${editing ? 'Guardar cambios' : 'Añadir alimento'}</button>`, body => {
    const val = id => parseFloat(String(body.querySelector('#' + id).value).replace(',', '.'));
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return editing ? openFoodDetail(food) : openFoodBrowser();
      // Escanear: rellena nombre, valores por 100 g y la ración del envase; la categoría y la unidad las eliges tú
      if (e.target.closest('[data-fscan]')) {
        const typed = body.querySelector('#fname').value.trim();
        return openScanner(prod => openFoodEditor({
          name: prod.name || typed, cat, image: prod.image || null, code: prod.code,
          per100: prod.per100,
          portions: prod.servingGrams ? [['ración', prod.servingGrams]] : [],
        }), () => openFoodEditor({ ...food, cat }));
      }
      const c = e.target.closest('[data-fcat]');
      if (c) {
        cat = c.dataset.fcat;
        body.querySelectorAll('[data-fcat]').forEach(b => b.classList.toggle('on', b === c));
        return haptic();
      }
      if (!e.target.closest('[data-fsave]')) return;
      const name = body.querySelector('#fname').value.trim();
      if (!name) { body.querySelector('#fname').focus(); return toast('Ponle nombre al alimento'); }
      const kcal = val('fk');
      if (!(kcal >= 0)) { body.querySelector('#fk').focus(); return toast('Indica las kcal por 100 g'); }
      const label = body.querySelector('#fpl').value.trim(), grams = val('fpg');
      const saved = {
        ...(editing ? { id: food.id, createdAt: food.createdAt } : { createdAt: Date.now() }),
        name, cat, custom: true,
        emoji: FOOD_CATS.find(x => x.id === cat)?.emoji || '🍽️',
        ...(food.image ? { image: food.image } : {}), ...(food.code ? { code: food.code } : {}),
        per100: { kcal, protein: val('fp') || 0, carbs: val('fc') || 0, fat: val('ff') || 0 },
        portions: label && grams > 0 ? [[label, grams]] : [],
      };
      saved.id = await db.putMyFood(saved);
      await loadMyFoods();
      haptic();
      toast(editing ? 'Alimento actualizado' : 'Alimento añadido 🍽️');
      browserState.cat = cat; browserState.q = '';
      openFoodBrowser();
    });
  });
}

// Elegir cantidad de un alimento: raciones típicas o gramos exactos. ☆ lo guarda en Mis alimentos
export function mountPortion(el, food, ctx) {
  const portions = [...food.portions];
  if (!portions.some(([, g]) => g === 100)) portions.push(['100 g', 100]);
  let sel = 0, units = 1, grams = portions[0][1];
  const p = food.per100;
  const box = freshBox(el);
  // Producto escaneado o de internet que aún no está en tu lista: se puede guardar con su categoría
  const isProduct = !food.custom && !FOODS.some(f => f.name === food.name) && !myFoodsCache.some(f => favKey(f.name) === favKey(food.name));

  box.innerHTML = `
    <div class="sheet-title-row">
      <button class="link back" data-pk="back" style="margin:0 0 0 -6px">${chev('l')} Volver a la lista</button>
      <button class="icon-btn star" data-pk="fav" aria-label="Guardar en mis alimentos">☆</button>
    </div>
    <div class="food-hero">
      ${foodThumb(food)}
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
    <button class="btn primary" data-pk="add" style="margin-top:14px">Añadir</button>
    ${isProduct ? `<div class="save-food" data-savebox>
      <div class="label">Guardar en mis alimentos</div>
      <div class="chips">${FOOD_CATS.map(c => `<button class="chip" data-pcat="${c.id}" style="--c:var(--accent)">${c.emoji} ${c.name}</button>`).join('')}</div>
    </div>` : ''}`;

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
    const pc = e.target.closest('[data-pcat]');
    if (pc) {
      const cat = pc.dataset.pcat;
      await db.putMyFood({
        name: food.name, cat, custom: true, createdAt: Date.now(),
        emoji: FOOD_CATS.find(x => x.id === cat)?.emoji || '🍽️',
        ...(food.image ? { image: food.image } : {}), ...(food.code ? { code: food.code } : {}),
        per100: food.per100, portions: food.portions.filter(([l]) => l !== '100 g'),
      });
      await loadMyFoods();
      box.querySelector('[data-savebox]').innerHTML = `<div class="notice" style="margin-top:14px">✓ Guardado en ${esc(FOOD_CATS.find(x => x.id === cat)?.name || '')}. Edita su ración en 🍽️ Alimentos.</div>`;
      haptic();
      return toast('Guardado en mis alimentos 🍽️');
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
