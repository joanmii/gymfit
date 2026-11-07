// =========================================================
// Nutrición · Sugerencias de comida según lo que falta del día
// =========================================================
import { BUILTIN, ingredientItem } from './cookbook.js';
import { esc, r0, today } from './utils.js';
import { ALL_TYPES, day, dishTypes, favKey, MEAL_TYPES, perServing, sum, sumItems, TYPE, typesOf } from './nut-core.js';
import { favCache } from './nut-favs.js';

// ---------- Sugerencias: qué comer según lo que te falta hoy ----------
// Reparto orientativo del día entre comidas (se normaliza con las que quedan)
const SLOT_W = { desayuno: 0.25, comida: 0.35, merienda: 0.12, cena: 0.28, snack: 0.1 };
const SLOT_ORDER = ['desayuno', 'comida', 'merienda', 'cena'];
const slotNow = () => { const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 11 ? 0 : h < 16 ? 1 : h < 19.5 ? 2 : 3; };
// Tentempiés sueltos para meriendas y picoteo
const SNACKS = [
  ['Plátano', '🍌', [['Plátano', 1, 'u']]],
  ['Yogur proteico', '🥛', [['Yogur proteico / skyr', 1, 'u']]],
  ['Puñado de almendras', '🌰', [['Almendras', 30]]],
  ['Manzana', '🍎', [['Manzana', 1, 'u']]],
  ['Barrita proteica', '🍫', [['Barrita proteica', 1, 'u']]],
  ['Tostada con pavo', '🍞', [['Pan integral', 40], ['Pechuga de pavo (fiambre)', 3, 'u']]],
].map(([name, emoji, ings]) => ({ name, emoji, items: ings.map(ingredientItem), types: ['merienda', 'snack'] }));

let suggSlot = null;      // hueco elegido a mano (si no, el que toca por la hora)
export function setSuggSlot(s) { suggSlot = s; }
export let suggList = [];
export let suggCurrent = 'comida';   // hueco de las sugerencias que se ven

function suggestions(meals, S) {
  const eaten = sum(meals);
  const left = { kcal: S.kcal - eaten.kcal, protein: S.protein - eaten.protein, carbs: S.carbs - eaten.carbs, fat: S.fat - eaten.fat };
  const logged = new Set(meals.map(m => m.type));
  if (suggSlot && logged.has(suggSlot)) suggSlot = null;   // ya apuntaste ese hueco: se pasa al siguiente
  // Hueco que toca: el primero desde ahora que no tenga comida apuntada
  const now = slotNow();
  const pending = SLOT_ORDER.filter((t, i) => i >= now && !logged.has(t));
  const slot = suggCurrent = suggSlot || pending[0] || 'snack';
  const rest = suggSlot ? [slot, ...pending.filter(t => t !== slot)] : (pending.length ? pending : ['snack']);
  const share = SLOT_W[slot] / rest.reduce((a, t) => a + SLOT_W[t], 0);
  // Lo que falta repartido entre las comidas que quedan, sin pasar de 1,5 veces lo normal para ese hueco
  const budget = Math.max(0, Math.min(left.kcal * share, S.kcal * SLOT_W[slot] * 1.5));

  const eatenNames = new Set(meals.map(m => favKey(m.name)));
  const pool = [
    ...favCache.filter(f => f.items?.length).map(f => ({ ...f, items: perServing(f), types: typesOf(f) || ALL_TYPES, fav: true })),
    ...BUILTIN.map(r => ({ ...r, items: perServing(r), types: dishTypes(r) })),
    ...SNACKS,
  ].filter(r => r.types.includes(slot));
  const seen = new Set();
  // Parte de las kcal que debería venir de proteína según lo que falta
  const pNeed = left.kcal > 0 ? Math.min(0.6, Math.max(0.1, (left.protein * 4) / left.kcal)) : 0.3;
  suggList = pool
    .filter(r => { const k = favKey(r.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .map(r => {
      const t = sumItems(r.items);
      const pShare = t.kcal ? (t.protein * 4) / t.kcal : 0;
      let score = -Math.abs(t.kcal - budget) / Math.max(budget, 150) - Math.abs(pShare - pNeed) * 1.2;
      if (r.fav) score += 0.15;
      if (eatenNames.has(favKey(r.name))) score -= 0.6;
      return { r, t, score, protein: pShare >= 0.3 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return { slot, budget, left };
}

export function suggestCard(meals, S) {
  if (+day !== +today()) return '';
  const { slot, budget, left } = suggestions(meals, S);
  const ty = TYPE(slot);
  const done = left.kcal <= 80;
  return `
    <div class="card sugg" id="sugg">
      <div class="card-head"><h3>💡 Sugerencias</h3>${done ? '' : `<span class="muted small">${ty.emoji} ${ty.name} · ~${r0(budget)} kcal</span>`}</div>
      ${done ? '<div class="sugg-done">🎯 Ya has llegado a tus calorías de hoy</div>' : `
      <div class="sugg-left">
        <span><b>${r0(left.kcal)}</b> kcal</span>
        <span class="p-c"><b>${r0(Math.max(0, left.protein))}</b>g P</span>
        <span class="c-c"><b>${r0(Math.max(0, left.carbs))}</b>g H</span>
        <span class="f-c"><b>${r0(Math.max(0, left.fat))}</b>g G</span>
      </div>
      <div class="chips scroll" style="margin:4px 0 8px">${MEAL_TYPES.map(t => `<button class="chip ${t.id === slot ? 'on' : ''}" data-sslot="${t.id}" style="--c:var(--accent)">${t.emoji} ${t.name}</button>`).join('')}</div>
      <div class="food-list">${suggList.map(({ r, t, protein }, i) => `
        <button class="food-row" data-sugg="${i}">
          ${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="e">${r.emoji || ty.emoji}</span>`}
          <span class="n">${esc(r.name)}<small>${r0(t.kcal)} kcal · P ${r0(t.protein)} g${protein ? ' · 💪 proteico' : ''}${r.fav ? ' · ⭐' : ''}</small></span>
          <span class="plus">+</span>
        </button>`).join('')}</div>`}
    </div>`;
}
