// =========================================================
// Nutrición · buscador de alimentos, lista de Alimentos, fichas y editores
// =========================================================
import { db } from './db.js';
import { openScanner, searchProducts, STORES } from './barcode.js';
import { FOOD_CATS, FOODS, norm } from './foods.js';
import { chev } from './calendar.js';
import { setSheetContent } from './sheet.js';
import { cap, esc, haptic, r0, r1, saveSettings, state, toast } from './utils.js';
import { ALL_TYPES, defaultType, favKey, freshBox, ingList, inType, macroRow, MEAL_TYPES, mealScore, newDraft, productToFood, scaleFood, scoreCard, sumItems, TYPE, typeChips, typesOf } from './nut-core.js';
import { bindStarLongPress, catChips, FAV_EMPTY, favLevel, FOOD_EMOJIS, foodThumb, isFoodFav, listFoods, loadFavorites, loadFoodFavs, loadMyFoods, myDishes, myFoodsCache, setDishTypes, starSpan, subChips, toggleFichaFav, toggleFoodFav, toggleTopFav } from './nut-favs.js';
import { openAddMenu } from './nut-add.js';
import { openReview } from './nut-review.js';
import { convertToRecipe } from './nut-recipes.js';

// ---------- Desplegable «Añadir alimento» (dentro de la revisión de la comida) ----------
// Se pinta dentro de `el`. ctx: { onPick(item), onManual(), onScan() }
export const pickerState = { q: '', cat: 'fav', sub: 'all' };

const portionText = f => {
  if (!f.per100) return '';
  const [label, g] = f.portions?.[0] || ['100 g', 100];
  return `${label === '100 g' ? '100 g' : `1 ${label} (${r0(g)} g)`} · ${r0(f.per100.kcal * g / 100)} kcal`;
};
const foodRow = (f, attr) => `
  <button class="food-row" ${attr}>
    ${foodThumb(f)}
    <span class="n">${esc(f.name)}<small>${esc([f.store, portionText(f)].filter(Boolean).join(' · '))}</small></span>
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
    <div data-pk-subs></div>
    <div class="food-list" data-pk-res></div>
    <div data-pk-online></div>`;

  const q = box.querySelector('#pk-q');
  const res = box.querySelector('[data-pk-res]');
  const onl = box.querySelector('[data-pk-online]');
  const cats = box.querySelector('[data-pk-cats]');
  const subs = box.querySelector('[data-pk-subs]');

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
    subs.innerHTML = query ? '' : subChips(st.cat, st.sub);
    shown = listFoods(st.cat, query, undefined, st.sub);
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

  bindStarLongPress(box, async star => {
    const f = rowFood(star.closest('.food-row'));
    if (!f) return;
    await toggleTopFav(f);
    haptic();
    return st.q.trim() ? refreshStars() : paint();
  });
  box.addEventListener('click', async e => {
    const act = e.target.closest('[data-pk]')?.dataset.pk;
    if (act === 'manual') return ctx.onManual();
    if (act === 'scan') return ctx.onScan();
    const c = e.target.closest('[data-cat]');
    if (c) {
      st.cat = c.dataset.cat; st.sub = 'all';
      cats.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b === c));
      return paint();
    }
    const sb = e.target.closest('[data-sub]');
    if (sb) { st.sub = sb.dataset.sub; haptic(); return paint(); }
    // ☆ de una fila: toque = favorito (blanca); mantener pulsada = favorito favorito (amarilla)
    const fr = e.target.closest('.food-row');
    if (fr && e.target.closest('[data-star]')) {
      const f = rowFood(fr);
      if (!f) return;
      await toggleFoodFav(f);
      haptic();
      return st.q.trim() ? refreshStars() : paint();   // en una categoría, los favoritos suben arriba
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
export const browserState = { q: '', cat: 'fav', sub: 'all', tab: 'foods', dtype: 'all' };
const infoRow = (f, attr, sub, star = false) => `
  <button class="food-row" ${attr}>
    ${f.items ? (f.photo ? `<img src="${esc(f.photo)}" alt="" loading="lazy">` : `<span class="e">${f.emoji || TYPE(typesOf(f)?.[0]).emoji}</span>`) : foodThumb(f)}
    <span class="n">${esc(f.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    ${star ? starSpan(f) : ''}${chev('r')}
  </button>`;
export function openFoodBrowser() {
  const st = browserState;
  const dishTab = st.tab === 'dishes';
  let foods = [], online = [], dishes = [];
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Volver</button>
    <h2 class="sheet-title">${dishTab ? '🍽️ Platos' : '🥕 Alimentos'}</h2>
    <div class="seg wide" style="margin:6px 0 12px">
      <button data-btab="foods" class="${dishTab ? '' : 'on'}">🥕 Alimentos</button>
      <button data-btab="dishes" class="${dishTab ? 'on' : ''}">🍽️ Platos</button>
    </div>
    ${dishTab ? '<button class="btn primary" data-newdish>＋ Crear plato</button>' : '<button class="btn primary" data-newfood>＋ Añadir alimento</button>'}
    <input class="search" id="bq" type="search" enterkeyhint="search" autocomplete="off" style="margin-top:12px" aria-label="Buscar" value="${esc(st.q)}">
    <div data-blist></div>`, body => {
    const listEl = body.querySelector('[data-blist]');

    // Mis platos: por tipo de comida y buscando por nombre o ingrediente
    const paintDishes = () => {
      const words = norm(st.q).split(/\s+/).filter(Boolean);
      const all = myDishes();
      dishes = all.filter(d => (st.dtype === 'all' || inType(d, st.dtype))
        && words.every(w => norm(d.name).includes(w) || d.items.some(i => norm(i.name).includes(w))));
      const chip = (id, label) => `<button class="chip ${st.dtype === id ? 'on' : ''}" data-dtype="${id}" style="--c:var(--accent)">${label}</button>`;
      listEl.innerHTML = `
        <div class="chips scroll">${chip('all', 'Todos')}${MEAL_TYPES.map(t => chip(t.id, `${t.emoji} ${t.name}`)).join('')}</div>
        ${dishes.length
          ? `<div class="food-list">${dishes.map((d, i) => infoRow(d, `data-di="${i}"`, `${r0(sumItems(d.items).kcal)} kcal · ${d.items.slice(0, 3).map(x => x.name).join(', ')}${d.items.length > 3 ? '…' : ''}`)).join('')}</div>`
          : `<div class="card empty"><span class="e">🍽️</span><b>${all.length ? 'Sin resultados' : 'Aún no tienes platos'}</b>${all.length ? '' : '<div class="muted small">Guarda una comida con ☆ o crea uno.</div>'}</div>`}`;
    };
    const paintFoods = () => {
      const query = st.q.trim();
      foods = listFoods(st.cat, query, 60, st.sub);
      listEl.innerHTML = `
        <div class="label">📋 ${query ? 'Resultados' : 'Alimentos'}</div>
        ${query ? '' : `<div class="chips scroll">${catChips(st.cat)}</div>${subChips(st.cat, st.sub)}`}
        <div class="food-list">${foods.map((f, i) => infoRow(f, `data-fi="${i}"`, portionText(f), true)).join('')
          || (!query && st.cat === 'fav' ? FAV_EMPTY : '<div class="muted small" style="text-align:center;margin:12px 0">No está en la lista.</div>')}</div>
        ${query.length >= 2 ? `<div data-web>${storeChips()}<button class="btn secondary" data-websearch style="margin-top:10px">🌐 Buscar «${esc(query)}» en internet</button></div>` : ''}`;
    };
    const paint = () => (dishTab ? paintDishes() : paintFoods());
    paint();
    Promise.all([loadFoodFavs(), loadMyFoods(), loadFavorites()]).then(() => { if (listEl.isConnected) paint(); });

    bindStarLongPress(listEl, async star => {
      const b = star.closest('[data-fi]');
      const f = b && foods[Number(b.dataset.fi)];
      if (!f) return;
      await toggleTopFav(f);
      haptic();
      paintFoods();
    });
    let tm;
    body.querySelector('#bq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; paint(); }, 120); });
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openAddMenu(true);
      const bt = e.target.closest('[data-btab]');
      if (bt) { if (bt.dataset.btab !== st.tab) { st.tab = bt.dataset.btab; st.q = ''; openFoodBrowser(); } return; }
      if (e.target.closest('[data-newdish]')) return openDishEditor();
      const dtp = e.target.closest('[data-dtype]');
      if (dtp) { st.dtype = dtp.dataset.dtype; haptic(); return paintDishes(); }
      const di = e.target.closest('[data-di]');
      if (di) return openDishDetail(dishes[Number(di.dataset.di)]);
      if (e.target.closest('[data-newfood]')) return openFoodEditor({ cat: st.cat === 'fav' ? 'lacteos' : st.cat });
      const c = e.target.closest('[data-cat]');
      if (c) { st.cat = c.dataset.cat; st.sub = 'all'; return paint(); }
      const sb = e.target.closest('[data-sub]');
      if (sb) { st.sub = sb.dataset.sub; haptic(); return paint(); }
      const pick = (attr, arr) => { const b = e.target.closest(`[${attr}]`); return b ? arr[Number(b.getAttribute(attr))] : null; };
      // ☆ en la lista: a favoritos (y sube arriba en su categoría)
      if (e.target.closest('[data-star]') && pick('data-fi', foods)) {
        await toggleFoodFav(pick('data-fi', foods));
        haptic();
        return paintFoods();
      }
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

// ---------- Mis platos: ficha y editor ----------
export function openDishDetail(d) {
  setSheetContent(`
    <button class="link back" data-back>${chev('l')} Platos</button>
    <div class="rc-hero">${d.photo ? `<img src="${d.photo}" alt="">` : `<span class="e">${d.emoji || TYPE(typesOf(d)?.[0]).emoji}</span>`}
      <h2 class="sheet-title">${esc(d.name)}</h2>
    </div>
    <div class="card">${macroRow(sumItems(d.items))}</div>
    <div class="label">Alimentos</div>
    ${ingList(d.items)}
    <div class="label">🏷️ Aparece en</div>
    ${typeChips(t => inType(d, t), 'data-dt')}
    <button class="btn primary" data-duse style="margin-top:18px">🍽️ Apuntar</button>
    <button class="btn secondary" data-dconv>✨ Convertir en receta</button>
    <button class="btn ghost" data-dedit>✏️ Editar</button>
    <button class="btn ghost danger" data-ddel>Borrar plato</button>`, body => {
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openFoodBrowser();
      const dt = e.target.closest('[data-dt]');
      if (dt) {
        const ts = new Set(typesOf(d) || ALL_TYPES);
        ts.has(dt.dataset.dt) ? ts.delete(dt.dataset.dt) : ts.add(dt.dataset.dt);
        if (!ts.size) return toast('Déjalo al menos en una comida');
        await setDishTypes(d, ALL_TYPES.filter(t => ts.has(t)));
        await loadFavorites();
        dt.classList.toggle('on', ts.has(dt.dataset.dt));
        return haptic();
      }
      if (e.target.closest('[data-duse]')) {
        return openReview(newDraft({ name: d.name, photo: d.photo || null, items: d.items.map(i => ({ ...i })) }), false, true);
      }
      if (e.target.closest('[data-dconv]')) return convertToRecipe(d);
      if (e.target.closest('[data-dedit]')) return openDishEditor(d);
      if (e.target.closest('[data-ddel]')) {
        if (!confirm(`¿Borrar «${d.name}»?`)) return;
        await db.deleteFavorite(d.id);
        await loadFavorites();
        toast('Plato borrado');
        return openFoodBrowser();
      }
    });
  });
}

export function openDishEditor(d = null) {
  openReview({
    ...newDraft(), mode: 'plato',
    name: d?.name || '', photo: d?.photo || null, emoji: d?.emoji || null,
    items: d ? d.items.map(i => ({ ...i })) : [],
    types: (d && typesOf(d)) || (d ? ALL_TYPES : [defaultType()]),
    ...(d ? { id: d.id, createdAt: d.createdAt } : {}),
  }, !!d, true);
}

const nutriRow = (title, sub, m) => `
  <div class="portion-row"><div><b>${title}</b><small>${sub}</small></div>
    <span class="pk">${r0(m.kcal)} kcal</span>
    <span class="pm"><i class="p-c">P ${r1(m.protein)}</i> <i class="c-c">H ${r1(m.carbs)}</i> <i class="f-c">G ${r1(m.fat)}</i></span></div>`;

function openFoodDetail(food) {
  const p = food.per100;
  const portions = [...(food.portions || [])];
  if (!portions.some(([, g]) => g === 100)) portions.push(['100 g', 100]);
  const [ul, ug] = portions[0];   // la ración principal: 1 bocata, 1 vaso, 1 unidad…
  const unitName = ul === '100 g' ? '100 g' : `1 ${ul} (${r0(ug)} g)`;
  setSheetContent(`
    <div class="sheet-title-row">
      <button class="link back" data-back style="margin:0 0 0 -6px">${chev('l')} Alimentos</button>
      <button class="fav-circle" data-ffav aria-label="Favorito"></button>
    </div>
    <div class="food-hero">
      <button class="fh-emoji" data-emoji aria-label="Cambiar emoji">${foodThumb(food)}</button>
      <div><b>${esc(food.name)}</b><small>${esc(unitName)} · ${r0(p.kcal * ug / 100)} kcal</small></div>
    </div>
    <div class="emoji-grid" data-egrid hidden>${FOOD_EMOJIS.map(em => `<button data-em="${em}">${em}</button>`).join('')}</div>
    <button class="btn primary" data-fuse style="margin-top:14px">🍽️ Añadir a una comida</button>
    <div class="label">${ul === '100 g' ? 'Por 100 g' : `Por ${esc(ul)} (${r0(ug)} g)`}</div>
    <div class="card">${macroRow(scaleFood(food, ug))}</div>
    <div class="label">Raciones</div>
    <div class="card portion-list">${portions.map(([l, g]) => nutriRow(l === '100 g' ? '100 g' : `1 ${esc(l)}`, `${r0(g)} g`, scaleFood(food, g))).join('')}</div>
    <div class="label">Puntuación</div>
    <div class="card score-card">${scoreCard(mealScore({ items: [scaleFood(food, 100)] }))}</div>
    ${food.custom ? '<button class="btn secondary" data-fedit style="margin-top:18px">✏️ Editar alimento</button><button class="btn ghost danger" data-fdel>Borrar alimento</button>' : ''}`, body => {
    const fb = body.querySelector('[data-ffav]');
    // Solo la amarilla (favorito de verdad); la blanca se pone desde la lista de su categoría
    const paintFav = () => { const on = favLevel(food.name) === 2; fb.classList.toggle('on', on); fb.textContent = on ? '★' : '☆'; };
    paintFav();
    loadFoodFavs().then(() => { if (body.isConnected) paintFav(); });
    body.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) return openFoodBrowser();
      // Elegir cuánto y abrir la comida nueva con ese alimento
      if (e.target.closest('[data-fuse]')) {
        setSheetContent('<div data-pbox></div>', b => mountPortion(b.querySelector('[data-pbox]'), food, {
          backLabel: food.name, onBack: () => openFoodDetail(food),
          onPick: item => openReview(newDraft({ name: food.name, items: [item] }), false, true),
        }));
        return haptic();
      }
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
        await toggleFichaFav(food);
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
      <button class="link back" data-pk="back" style="margin:0 0 0 -6px">${chev('l')} ${esc(ctx.backLabel || 'Volver a la lista')}</button>
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
    if (act === 'back') return ctx.onBack ? ctx.onBack() : mountFoodPicker(el, ctx);
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
