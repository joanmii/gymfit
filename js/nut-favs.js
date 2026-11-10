// =========================================================
// Nutrición · favoritos (platos y alimentos), alimentos propios y emojis
// =========================================================
import { db } from './db.js';
import { FOOD_CATS, FOODS, foodsByCat, norm, searchFoods, subcatsIn, subOf } from './foods.js';
import { esc, saveSettings, state, toast } from './utils.js';
import { favKey, inType, isRecipe, MEAL_TYPES, typesOf } from './nut-core.js';

export async function setDishTypes(r, types) {
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
export async function toggleFavType(rec, t, create, put, del) {
  if (rec && inType(rec, t)) {
    const ts = (typesOf(rec) || MEAL_TYPES.map(x => x.id)).filter(x => x !== t);
    if (ts.length) await put({ ...rec, types: ts }); else await del(rec.id);
    return false;
  }
  if (rec) await put({ ...rec, types: [...typesOf(rec), t] });
  else await create([t]);
  return true;
}

// ---------- Comidas favoritas ----------
export let favCache = [];
// Las recetas que se guardaban aparte (antes de unificar platos y recetas) pasan a «Mis recetas»
let migrated = false;
async function migrateCookbook() {
  try {
    const old = await db.allRecipes();
    if (!old.length) return;
    const names = new Set((await db.allFavorites()).map(f => favKey(f.name)));
    for (const { id, ...r } of old) {
      if (!names.has(favKey(r.name))) await db.putFavorite({ ...r, custom: true });
      await db.deleteRecipe(id);
    }
  } catch { /* nada */ }
}

export const myDishes = () => favCache.filter(r => r.items?.length && !isRecipe(r));
export const myRecipes = () => favCache.filter(r => r.items?.length && isRecipe(r));

export async function loadFavorites() {
  if (!migrated) { migrated = true; await migrateCookbook(); }
  favCache = (await db.allFavorites()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return favCache;
}

// ---------- Alimentos favoritos (valores por 100 g + sus raciones) ----------
let foodFavCache = [];
export async function loadFoodFavs() {
  foodFavCache = (await db.allFoodFavs()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return foodFavCache;
}
const findFoodFav = name => { const k = favKey(name); return k ? foodFavCache.find(f => favKey(f.name) === k) : null; };

export const isFoodFav = name => !!findFoodFav(name);
// 0 = no es favorito (☆), 1 = favorito (estrella blanca), 2 = favorito favorito (estrella amarilla)
export const favLevel = name => { const f = findFoodFav(name); return !f ? 0 : f.top ? 2 : 1; };
const byLevel = list => [2, 1, 0].flatMap(l => list.filter(f => favLevel(f.name) === l));

const newFoodFav = (food, top) => ({
  name: food.name.trim(), emoji: food.emoji || knownFood(food.name)?.emoji || '🍽️', image: food.image || knownFood(food.name)?.image || null,
  cat: food.cat || knownFood(food.name)?.cat || null,
  per100: food.per100,
  portions: food.portions.filter(([l]) => l !== '100 g'),
  top, createdAt: Date.now(),
});

// Toque en ☆: lo guarda como favorito (estrella blanca), o lo quita si ya lo era
export async function toggleFoodFav(food) {
  const old = findFoodFav(food.name);
  if (old) await db.deleteFoodFav(old.id);
  else await db.putFoodFav(newFoodFav(food, false));
  await loadFoodFavs();
  toast(old ? 'Quitado de favoritos' : 'Guardado en favoritos ☆');
  return !old;
}

// Mantener pulsada la estrella: favorito favorito (amarilla); si ya lo era, vuelve a favorito normal
export async function toggleTopFav(food) {
  const old = findFoodFav(food.name);
  const top = !old?.top;
  await db.putFoodFav(old ? { ...old, top } : newFoodFav(food, true));
  await loadFoodFavs();
  toast(top ? 'Favorito favorito ⭐' : 'Ahora es favorito normal');
  return top;
}

// Estrella de una fila según el nivel
export function starSpan(f) {
  const l = favLevel(f.name);
  const label = ['Guardar en favoritos (mantén pulsado: favorito favorito)', 'Favorito (toca para quitar, mantén para favorito favorito)', 'Favorito favorito (toca para quitar)'][l];
  return `<span class="fstar lv${l}" data-star role="button" aria-label="${label}">${l ? '★' : '☆'}</span>`;
}

// Mantener pulsada una estrella [data-star] dentro de `el` llama a onLong(estrella);
// el toque que sigue a la pulsación larga se ignora para que no la vuelva a quitar
export function bindStarLongPress(el, onLong, ms = 450) {
  let timer = null, fired = false, x0 = 0, y0 = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', e => {
    const star = e.target.closest('[data-star]');
    if (!star) return;
    fired = false; x0 = e.clientX; y0 = e.clientY;
    cancel();
    timer = setTimeout(() => { timer = null; fired = true; onLong(star); }, ms);
  });
  el.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, cancel));
  el.addEventListener('contextmenu', e => { if (e.target.closest('[data-star]')) e.preventDefault(); });
  el.addEventListener('click', e => {
    if (fired && e.target.closest('[data-star]')) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

// Categorías de la lista: ⭐ Favoritos va la primera
const FOOD_CATS_ALL = [{ id: 'fav', name: 'Favoritos', emoji: '⭐' }, ...FOOD_CATS];
export const catChips = cur => FOOD_CATS_ALL.map(c => `<button class="chip ${c.id === cur ? 'on' : ''}" data-cat="${c.id}" style="--c:var(--accent)">${c.emoji} ${c.name}</button>`).join('');

// Categoría de un favorito (los antiguos no la guardaban: se busca en la base)
const favCat = f => f.cat || knownFood(f.name)?.cat || 'otros';
const catFoods = cat => [...myFoodsCache.filter(f => f.cat === cat), ...foodsByCat(cat)];
// Segunda fila de chips: subcategorías de la categoría, o en ⭐ Favoritos los tipos de alimento que tienes
export function subChips(cat, cur) {
  const subs = cat === 'fav'
    ? FOOD_CATS.filter(c => foodFavCache.some(f => favCat(f) === c.id))
    : subcatsIn(cat, catFoods(cat));
  if (cat === 'fav' && subs.length < 2) return '';
  if (!subs.length) return '';
  const chip = (id, label) => `<button class="chip ${id === cur ? 'on' : ''}" data-sub="${id}" style="--c:var(--accent)">${label}</button>`;
  return `<div class="chips scroll subchips">${chip('all', 'Todos')}${subs.map(s => chip(s.id, `${s.emoji} ${s.name}`)).join('')}</div>`;
}

// Alimentos de una categoría (y subcategoría), o de una búsqueda; siempre primero
// los favoritos favoritos (amarilla), luego los favoritos (blanca) y después el resto
export function listFoods(cat, query, limit, sub = 'all') {
  const q = query.trim();
  if (!q) {
    if (cat === 'fav') return byLevel(foodFavCache.filter(f => sub === 'all' || favCat(f) === sub));
    return byLevel(catFoods(cat).filter(f => sub === 'all' || subOf(f) === sub));
  }
  const words = norm(q).split(/\s+/).filter(Boolean);
  const match = f => words.every(w => norm(f.name).includes(w));
  const first = [...foodFavCache.filter(match), ...myFoodsCache.filter(match)];
  const seen = new Set();
  const found = [...first, ...searchFoods(q, limit)].filter(f => { const k = favKey(f.name); if (seen.has(k)) return false; seen.add(k); return true; });
  return byLevel(found);
}

// ---------- Alimentos añadidos por ti (con su categoría) ----------
export let myFoodsCache = [];
export async function loadMyFoods() {
  myFoodsCache = (await db.allMyFoods()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return myFoodsCache;
}
export const FAV_EMPTY = '<div class="hint-card">Aún no tienes favoritos. Toca <b>☆</b> en cualquier alimento para guardarlo; mantenla pulsada para que sea favorito favorito (<b style="color:#ffd60a">★</b>) y salga el primero.</div>';

// ---------- Emoji de los alimentos (se puede cambiar tocándolo en su ficha) ----------
export const FOOD_EMOJIS = ['🥚', '🍳', '🥛', '🧀', '🧈', '🥩', '🍗', '🍖', '🥓', '🌭', '🍔', '🍟', '🍕', '🥪', '🌮', '🌯', '🥙', '🥗', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🥘', '🥫', '🍞', '🥐', '🥖', '🥨', '🥯', '🧇', '🥞', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🫘', '🥜', '🌰', '🐟', '🦐', '🦑', '🥣', '🥤', '🧃', '☕', '🍵', '🍫', '🍪', '🍩', '🍰', '🧁', '🍦', '🍯', '🫒', '🍺', '🍷', '💪'];
// Alimento de tu lista o de la base con ese nombre (para recuperar su emoji o su foto)
const knownFood = name => { const k = favKey(name); return myFoodsCache.find(f => favKey(f.name) === k) || FOODS.find(f => favKey(f.name) === k); };
// El favorito conserva el emoji del alimento (los antiguos se guardaban con ⭐)
const foodEmoji = f => state.settings.foodEmoji?.[f.name] || (f.emoji && f.emoji !== '⭐' ? f.emoji : knownFood(f.name)?.emoji) || '🍽️';
// Miniatura: el emoji elegido manda sobre la foto del producto
export function foodThumb(f) {
  const img = f.image || knownFood(f.name)?.image;   // foto del envase escaneado, aunque sea un favorito
  return img && !state.settings.foodEmoji?.[f.name]
    ? `<img src="${esc(img)}" alt="" loading="lazy">`
    : `<span class="e">${foodEmoji(f)}</span>`;
}
