// =========================================================
// Nutrición · favoritos (platos y alimentos), alimentos propios y emojis
// =========================================================
import { db } from './db.js';
import { FOOD_CATS, FOODS, foodsByCat, norm, searchFoods } from './foods.js';
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

// ☆ de un alimento: lo guarda (o quita) en la categoría ⭐ Favoritos
export async function toggleFoodFav(food) {
  const old = findFoodFav(food.name);
  if (old) await db.deleteFoodFav(old.id);
  else await db.putFoodFav({
    name: food.name.trim(), emoji: food.emoji || knownFood(food.name)?.emoji || '🍽️', image: food.image || knownFood(food.name)?.image || null,
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
export const catChips = cur => FOOD_CATS_ALL.map(c => `<button class="chip ${c.id === cur ? 'on' : ''}" data-cat="${c.id}" style="--c:var(--accent)">${c.emoji} ${c.name}</button>`).join('');
// Alimentos de una categoría, o de una búsqueda (con tus favoritos primero)
export function listFoods(cat, query, limit) {
  const q = query.trim();
  if (!q) {
    if (cat === 'fav') return foodFavCache;
    // En cada categoría, primero tus favoritos (★) y luego el resto
    const all = [...myFoodsCache.filter(f => f.cat === cat), ...foodsByCat(cat)];
    return [...all.filter(f => isFoodFav(f.name)), ...all.filter(f => !isFoodFav(f.name))];
  }
  const words = norm(q).split(/\s+/).filter(Boolean);
  const match = f => words.every(w => norm(f.name).includes(w));
  const first = [...foodFavCache.filter(match), ...myFoodsCache.filter(match)];
  const seen = new Set();
  return [...first, ...searchFoods(q, limit)].filter(f => { const k = favKey(f.name); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------- Alimentos añadidos por ti (con su categoría) ----------
export let myFoodsCache = [];
export async function loadMyFoods() {
  myFoodsCache = (await db.allMyFoods()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return myFoodsCache;
}
export const FAV_EMPTY = '<div class="hint-card">Aún no tienes favoritos. Pulsa <b>☆</b> en cualquier alimento (o escanea un envase) para tenerlo aquí.</div>';

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
