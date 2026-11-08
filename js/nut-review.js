// =========================================================
// Nutrición · revisar, editar y guardar una comida (o un plato propio)
// =========================================================
import { db } from './db.js';
import { openScanner } from './barcode.js';
import { norm } from './foods.js';
import { chev } from './calendar.js';
import { closeSheet, openSheet, setSheetContent } from './sheet.js';
import { esc, haptic, keyOf, r0, r1, toast, today } from './utils.js';
import { renderNutrition } from './nutrition.js';
import { ALL_TYPES, blankItem, favKey, freshBox, inType, loadImage, MEAL_TYPES, mealScore, perServing, productToFood, scoreCard, searchBuiltin, servingsOf, sumItems, toJpeg, TOOLS, TYPE, typeChips, typesOf, unitText, withBase } from './nut-core.js';
import { isFoodFav, loadFavorites, loadFoodFavs, myDishes, myRecipes, toggleFavType, toggleFoodFav } from './nut-favs.js';
import { mountFoodPicker, mountPortion, openFoodBrowser } from './nut-foods.js';

let pendingFood = null;   // producto escaneado desde el desplegable, para abrirlo al volver

export function openReview(draft, editing = false, fresh = false, inPlace = false) {
  draft.items = draft.items.map(withBase);
  const recipe = draft.mode === 'recipe';   // crear/editar una receta (con pasos, raciones…)
  const plato = draft.mode === 'plato';     // crear/editar un plato de «Mis platos»
  const own = recipe || plato;              // no es una comida: se guarda en tus platos o recetas
  const conf = { low: 'Confianza baja · revisa las cantidades', medium: 'Confianza media', high: 'Confianza alta' };
  if (recipe) {
    draft.servings = servingsOf(draft);
    draft.tools = [...(draft.tools || [])];
    draft.steps = draft.steps?.length ? [...draft.steps] : [''];
  }
  const ingLabel = () => `Ingredientes${draft.servings > 1 ? ` · para ${draft.servings} raciones` : ''}`;
  const stepRows = () => draft.steps.map((s, i) => `
    <div class="step-row">
      <span class="n">${i + 1}</span>
      <textarea rows="1" data-step="${i}" enterkeyhint="next" placeholder="Paso ${i + 1}">${esc(s)}</textarea>
      <button class="icon-btn" data-sdel="${i}" aria-label="Quitar paso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>`).join('');

  const render = () => `
    ${own ? `<button class="link back" id="dish-back">${chev('l')} ${recipe ? 'Recetas' : 'Platos'}</button>` : ''}
    <div class="sheet-title-row">
      <h2 class="sheet-title">${recipe ? (editing ? 'Editar receta' : 'Crear receta') : plato ? (editing ? 'Editar plato' : 'Crear plato') : editing ? 'Editar comida' : 'Revisa y guarda'}</h2>
      <button class="icon-btn star" id="fav" aria-label="Guardar en mis platos" ${own ? 'hidden' : ''}>☆</button>
    </div>
    <div class="review-top">
      ${own ? `<button class="rc-photo" id="rphoto" aria-label="Foto">${draft.photo
        ? `<img src="${draft.photo}" alt=""><span class="x" data-rphoto-del aria-label="Quitar foto">✕</span>` : '📷'}</button>
      <input type="file" id="rphoto-f" accept="image/*" hidden>` : draft.photo ? `<img src="${draft.photo}" alt="">` : ''}
      <label class="field"><span>Nombre</span><input id="mname" value="${esc(draft.name)}" placeholder="Ej: Pollo con arroz"></label>
    </div>
    ${draft.confidence ? `<span class="badge ${draft.confidence}">● ${conf[draft.confidence]}</span>` : ''}
    ${draft.note ? `<div class="notice">${esc(draft.note)}</div>` : ''}
    ${own ? `<div class="label">🏷️ ¿En qué comidas aparece?</div>
    ${typeChips(t => draft.types.includes(t), 'data-dtype')}` : `<label class="field"><span>Tipo de comida</span>
      <select id="mtype">${MEAL_TYPES.map(t => `<option value="${t.id}" ${t.id === draft.type ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}</select>
    </label>`}
    ${editing ? '' : `
    <div class="label">${own ? 'Partir de otro (opcional)' : 'Platos y recetas'}</div>
    <button class="btn secondary add-toggle" id="dish-toggle"><span>📖 Elegir plato o receta</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="picker-panel" id="dishes" hidden></div>`}
    ${recipe ? `<div class="card rc-meta">
      <div class="rc-meta-row"><span>Raciones</span>
        <div class="stepper"><button class="icon-btn" data-serv="-1" aria-label="Menos">−</button><b id="serv">${draft.servings}</b><button class="icon-btn" data-serv="1" aria-label="Más">+</button></div></div>
      <div class="rc-meta-row"><span>Tiempo</span>
        <label class="rc-min"><input id="rmin" type="number" inputmode="numeric" min="0" value="${draft.minutes || ''}" aria-label="Minutos"> min</label></div>
    </div>
    <div class="label">Con qué</div>
    <div class="chips">${TOOLS.map(([t, e]) => `<button class="chip ${draft.tools.includes(t) ? 'on' : ''}" data-rtool="${t}" style="--c:var(--accent)">${e} ${t}</button>`).join('')}</div>` : ''}
    <div class="label" id="ing-label">${recipe ? ingLabel() : 'Alimentos'}</div>
    <div id="items">${draft.items.length ? draft.items.map(itemCard).join('') : '<div class="hint-card">Aún no hay alimentos. Pulsa <b>Añadir alimento</b>.</div>'}</div>
    <button class="btn secondary add-toggle" id="add-item"><span>＋ Añadir alimento</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="picker-panel" id="picker" hidden></div>
    ${recipe ? `<div class="label">Pasos</div>
    <div class="step-edit" id="rsteps">${stepRows()}</div>
    <button class="btn secondary" id="add-step">＋ Añadir paso</button>
    <div class="label">Notas</div>
    <textarea id="rnotes" class="rc-text" rows="2" placeholder="Opcional">${esc(draft.notes || '')}</textarea>` : ''}
    <div class="label">Puntuación</div>
    <div class="card score-card" id="score"></div>
    ${editing && !own && draft.date !== keyOf(today()) ? '<button class="btn secondary" id="copy-today">↺ Copiar a hoy</button>' : ''}
    ${editing ? `<button class="btn ghost danger" id="del">${recipe ? 'Borrar receta' : plato ? 'Borrar plato' : 'Borrar comida'}</button>` : ''}
    <div class="totals">
      <div class="totals-row" id="totals"></div>
      <button class="btn primary" id="save">${recipe ? 'Guardar receta' : plato ? 'Guardar plato' : 'Guardar'}</button>
    </div>`;

  const mountDish = body => {
    const photoF = body.querySelector('#rphoto-f');
    body.querySelector('#rphoto').addEventListener('click', e => {
      if (e.target.closest('[data-rphoto-del]')) { draft.photo = null; return setSheetContent(render(), mount); }
      photoF.click();
    });
    photoF.addEventListener('change', async () => {
      const f = photoF.files?.[0];
      if (!f) return;
      try { draft.photo = toJpeg(await loadImage(f), 360, 0.7); setSheetContent(render(), mount); }
      catch { toast('No he podido abrir la foto'); }
    });
    if (!recipe) return;
    body.querySelectorAll('[data-serv]').forEach(b => b.addEventListener('click', () => {
      draft.servings = Math.min(20, Math.max(1, draft.servings + Number(b.dataset.serv)));
      body.querySelector('#serv').textContent = draft.servings;
      body.querySelector('#ing-label').textContent = ingLabel();
      body.querySelector('#totals').dispatchEvent(new Event('repaint'));
      haptic();
    }));
    body.querySelector('#rmin').addEventListener('input', e => { draft.minutes = parseInt(e.target.value, 10) || null; });
    body.querySelectorAll('[data-rtool]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.rtool;
      draft.tools = draft.tools.includes(t) ? draft.tools.filter(x => x !== t) : [...draft.tools, t];
      b.classList.toggle('on', draft.tools.includes(t));
      haptic();
    }));
    body.querySelector('#rnotes').addEventListener('input', e => { draft.notes = e.target.value; });

    // Pasos: Intro crea el siguiente, borrar al principio lo une con el anterior, pegar varias líneas las separa
    const stepsEl = body.querySelector('#rsteps');
    const grow = ta => { ta.style.height = 'auto'; if (ta.scrollHeight) ta.style.height = `${ta.scrollHeight}px`; };
    const paintSteps = (focus = null, caret = 0) => {
      stepsEl.innerHTML = stepRows();
      stepsEl.querySelectorAll('textarea').forEach(grow);
      if (focus == null) return;
      const ta = stepsEl.querySelector(`[data-step="${focus}"]`);
      ta?.focus();
      ta?.setSelectionRange(caret, caret);
    };
    stepsEl.querySelectorAll('textarea').forEach(grow);
    stepsEl.addEventListener('input', e => {
      const ta = e.target.closest('[data-step]');
      if (!ta) return;
      const i = Number(ta.dataset.step);
      if (ta.value.includes('\n')) {
        const parts = ta.value.split(/\n+/).map(x => x.replace(/^\s*(?:\d+\s*[.)-]|[-•*])\s*/, '').trim()).filter(Boolean);
        draft.steps.splice(i, 1, ...(parts.length ? parts : ['']));
        const last = i + Math.max(parts.length, 1) - 1;
        return paintSteps(last, draft.steps[last].length);
      }
      draft.steps[i] = ta.value;
      grow(ta);
    });
    stepsEl.addEventListener('keydown', e => {
      const ta = e.target.closest('[data-step]');
      if (!ta || e.isComposing) return;
      const i = Number(ta.dataset.step);
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        draft.steps.splice(i, 1, ta.value.slice(0, ta.selectionStart).trimEnd(), ta.value.slice(ta.selectionEnd).trimStart());
        return paintSteps(i + 1, 0);
      }
      if (e.key === 'Backspace' && i > 0 && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault();
        const prev = draft.steps[i - 1], sep = prev && ta.value ? ' ' : '';
        draft.steps.splice(i - 1, 2, prev + sep + ta.value);
        paintSteps(i - 1, prev.length + sep.length);
      }
    });
    stepsEl.addEventListener('click', e => {
      const d = e.target.closest('[data-sdel]');
      if (!d) return;
      draft.steps.splice(Number(d.dataset.sdel), 1);
      if (!draft.steps.length) draft.steps.push('');
      paintSteps();
      haptic();
    });
    body.querySelector('#add-step').addEventListener('click', () => {
      const last = draft.steps.length - 1;
      if (last >= 0 && !draft.steps[last].trim()) return paintSteps(last, 0);
      draft.steps.push('');
      paintSteps(last + 1, 0);
    });
  };

  const mount = body => {
    const updateTotals = () => {
      const t = draft.items.reduce((a, i) => ({ kcal: a.kcal + (+i.kcal || 0), protein: a.protein + (+i.protein || 0), carbs: a.carbs + (+i.carbs || 0), fat: a.fat + (+i.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      const n = recipe ? draft.servings : 1;   // en recetas de varias raciones se enseña lo de una
      body.querySelector('#totals').innerHTML = `
        <div><b>${r0(t.kcal / n)}</b><span>${n > 1 ? 'kcal/ración' : 'kcal'}</span></div>
        <div><b class="p-c">${r0(t.protein / n)}g</b><span>proteína</span></div>
        <div><b class="c-c">${r0(t.carbs / n)}g</b><span>hidratos</span></div>
        <div><b class="f-c">${r0(t.fat / n)}g</b><span>grasa</span></div>`;
      body.querySelector('#score').innerHTML = scoreCard(mealScore({ items: draft.items }));
      return t;
    };
    updateTotals();
    body.querySelector('#totals').addEventListener('repaint', updateTotals);

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
    const findFav = () => { const n = favKey(draft.name || buildMeal().name); return n ? myDishes().find(f => favKey(f.name) === n) : null; };
    const paintStar = () => {
      const f = findFav();
      const on = !!f && inType(f, draft.type);
      const tn = TYPE(draft.type).name.toLowerCase();
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
      star.setAttribute('aria-label', on ? `Quitar de mis platos de ${tn}` : `Guardar en mis platos de ${tn}`);
    };
    const paintItemStars = () => body.querySelectorAll('[data-ifav]').forEach(b => {
      const on = isFoodFav(draft.items[Number(b.dataset.ifav)]?.name);
      b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
    });
    loadFavorites().then(() => { if (star.isConnected) paintStar(); });
    loadFoodFavs().then(paintItemStars);
    star.addEventListener('click', async () => {
      const m = buildMeal();
      const t = TYPE(draft.type);
      const f = findFav();
      if (!f && !m.items.length) return toast('Añade al menos un alimento');
      const on = await toggleFavType(f, draft.type,
        types => db.putFavorite({ name: m.name, kind: 'plato', types, photo: draft.photo || null, items: m.items,
          kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, createdAt: Date.now() }),
        db.putFavorite, db.deleteFavorite);
      toast(on ? `Guardado en mis platos de ${t.name.toLowerCase()} ${t.emoji}` : `Quitado de mis platos de ${t.name.toLowerCase()}`);
      haptic();
      await loadFavorites();
      paintStar();
    });

    body.querySelector('#mname').addEventListener('input', e => { draft.name = e.target.value; paintStar(); });
    body.querySelector('#dish-back')?.addEventListener('click', () => (recipe ? closeSheet() : openFoodBrowser()));
    body.querySelectorAll('[data-dtype]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.dtype;
      const ts = new Set(draft.types);
      ts.has(t) ? ts.delete(t) : ts.add(t);
      if (!ts.size) return toast('Déjalo al menos en una comida');
      draft.types = ALL_TYPES.filter(x => ts.has(x));
      b.classList.toggle('on', ts.has(t));
      haptic();
    }));
    body.querySelector('#mtype')?.addEventListener('change', e => {
      draft.type = e.target.value;
          paintStar();
      paintItemStars();
      if (!body.querySelector('#picker').hidden && body.querySelector('#pk-q')) setPanel(true);
      const dp = body.querySelector('#dishes');
      if (dp && !dp.hidden) dp.repaint?.();
    });

    body.querySelector('#items').addEventListener('input', e => {
      const card = e.target.closest('[data-i]');
      if (!card) return;
      const it = draft.items[Number(card.dataset.i)];
      const f = e.target.dataset.f;
      if (f === 'name') { it.name = e.target.value; return; }
      const v = parseFloat(String(e.target.value).replace(',', '.')) || 0;
      if (f === 'grams') {
        setItemGrams(it, card, v, false);
      } else {
        it[f] = v;
        it.base = { grams: +it.grams || 0, kcal: +it.kcal || 0, protein: +it.protein || 0, carbs: +it.carbs || 0, fat: +it.fat || 0 };
      }
      updateTotals();
    });

    body.querySelector('#items').addEventListener('click', async e => {
      // − / + en alimentos que van por unidades (huevos, lonchas, cucharadas…)
      const ud = e.target.closest('[data-ud]');
      if (ud) {
        const card = ud.closest('[data-i]');
        const it = draft.items[Number(card.dataset.i)];
        let n = (+it.grams || 0) / it.unitG;
        n = Number(ud.dataset.ud) > 0 ? Math.floor(n + 1e-6) + 1 : Math.ceil(n - 1e-6) - 1;
        if (n < 1) n = 0.5;
        setItemGrams(it, card, n * it.unitG, true);
        haptic();
        return updateTotals();
      }
      // ☆ en un alimento: guardarlo en Mis alimentos con sus valores por 100 g
      const fb = e.target.closest('[data-ifav]');
      if (fb) {
        const it = draft.items[Number(fb.dataset.ifav)];
        const g = +it.grams || 0;
        if (!it.name.trim()) return toast('Ponle nombre al alimento');
        if (!(g > 0) || !(+it.kcal > 0)) return toast('Indica gramos y kcal para guardarlo');
        await loadFoodFavs();
        const k = 100 / g;
        await toggleFoodFav({ name: it.name, per100: { kcal: it.kcal * k, protein: it.protein * k, carbs: it.carbs * k, fat: it.fat * k },
          portions: it.unitG ? [[it.unitLabel, it.unitG]] : [['ración', g]] });
        haptic();
        paintItemStars();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (!del) return;
      draft.items.splice(Number(del.dataset.del), 1);
      setSheetContent(render(), mount);
    });

    // Desplegable «Añadir alimento»
    const panel = body.querySelector('#picker');
    const toggleBtn = body.querySelector('#add-item');
    const repaintItems = () => {
      body.querySelector('#items').innerHTML = draft.items.map(itemCard).join('');
      updateTotals();
    };
    const setPanel = (open, food = null) => {
      panel.hidden = !open;
      toggleBtn.classList.toggle('open', open);
      toggleBtn.querySelector('span').textContent = open ? 'Cerrar' : '＋ Añadir alimento';
      if (!open) { panel.innerHTML = ''; return; }
      if (food) mountPortion(panel, food, pickCtx); else mountFoodPicker(panel, pickCtx);
    };
    const pickCtx = {
      onPick: item => {
        // Las filas vacías (sin nombre ni kcal) se sustituyen por el alimento elegido
        draft.items = draft.items.filter(i => i.name.trim() || +i.kcal);
        draft.items.push(withBase(item));
        repaintItems();
        setPanel(false);
        toast(`${item.name} añadido`);
        toggleBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      onManual: () => {
        draft.items.push(withBase(blankItem()));
        repaintItems();
        setPanel(false);
        const inputs = body.querySelectorAll('#items [data-f="name"]');
        inputs[inputs.length - 1]?.focus();
      },
      // El escáner ocupa la hoja; al terminar se vuelve a esta comida con el producto abierto
      onScan: () => openScanner(
        product => { pendingFood = productToFood(product); openReview(draft, editing, false, true); },
        () => openReview(draft, editing, false, true)),
    };
    toggleBtn.addEventListener('click', () => setPanel(panel.hidden));

    // Desplegable «Elegir un plato»: pone el nombre y añade sus ingredientes
    const dishBtn = body.querySelector('#dish-toggle');
    const dishPanel = body.querySelector('#dishes');
    const shortName = n => n.replace(/\s*\(.*\)$/, '').replace(/ \/.*$/, '');
    const setDishPanel = open => {
      dishPanel.hidden = !open;
      dishBtn.classList.toggle('open', open);
      dishBtn.querySelector('span').textContent = open ? 'Cerrar' : '📖 Elegir plato o receta';
      if (!open) { dishPanel.innerHTML = ''; return; }
      let list = [], qv = '', all = false;
      const box = freshBox(dishPanel);
      box.innerHTML = `
        <input class="search" type="search" enterkeyhint="search" autocomplete="off" aria-label="Buscar">
        <div data-dl></div>`;
      const dishRow = (r, i) => `
        <button class="food-row" data-dish="${i}">
          ${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="e">${r.emoji || TYPE(typesOf(r)?.[0]).emoji}</span>`}
          <span class="n">${esc(r.name)}<small>${esc(r.items.slice(0, 4).map(x => shortName(x.name)).join(', '))}${r.items.length > 4 ? '…' : ''} · ${r0(sumItems(r.items).kcal / servingsOf(r))} kcal</small></span>
          <span class="plus">+</span>
        </button>`;
      // Sin búsqueda: tus recetas y las de este tipo de comida. Buscando: todas.
      const paintDishes = () => {
        const t = TYPE(draft.type);
        const words = norm(qv).split(/\s+/).filter(Boolean);
        const ok = f => (words.length ? words.every(w => norm(f.name).includes(w)) : all || inType(f, draft.type));
        const dishes = myDishes().filter(ok), mine = myRecipes().filter(ok);
        const recs = searchBuiltin(qv, all ? null : draft.type);
        list = [...dishes, ...mine, ...recs];
        let i = 0;
        const sec = (title, arr) => arr.length ? `<div class="label">${title}</div><div class="food-list">${arr.map(r => dishRow(r, i++)).join('')}</div>` : '';
        const tail = words.length ? '' : `<button class="link" data-allp style="margin:8px 2px 0">${all ? `Ver solo las de ${t.name.toLowerCase()}` : 'Ver todas'}</button>`;
        box.querySelector('[data-dl]').innerHTML = list.length
          ? sec('🍽️ Mis platos', dishes) + sec('⭐ Mis recetas', mine) + sec(words.length || all ? '📖 Recetas' : `📖 Recetas de ${t.name.toLowerCase()} ${t.emoji}`, recs) + tail
          : `<div class="muted small" style="text-align:center;margin:10px 0">Sin resultados</div>${tail}`;
      };
      dishPanel.repaint = paintDishes;
      paintDishes();
      box.querySelector('.search').addEventListener('input', e => { qv = e.target.value; paintDishes(); });
      box.addEventListener('click', e => {
        if (e.target.closest('[data-allp]')) { all = !all; return paintDishes(); }
        const d = e.target.closest('[data-dish]');
        if (!d) return;
        const r = list[Number(d.dataset.dish)];
        if (recipe) {
          Object.assign(draft, {
            name: r.name, items: r.items.map(i => withBase({ ...i })), servings: servingsOf(r),
            minutes: r.minutes || draft.minutes, tools: r.tools?.length ? [...r.tools] : draft.tools,
            steps: r.steps?.length ? [...r.steps] : draft.steps, notes: r.notes || draft.notes,
            photo: draft.photo || r.photo || null, emoji: r.emoji || draft.emoji,
          });
          haptic();
          return setSheetContent(render(), mount);
        }
        draft.name = r.name;
        body.querySelector('#mname').value = r.name;
        paintStar();
        draft.items = draft.items.filter(i => i.name.trim() || +i.kcal);
        perServing(r).forEach(i => draft.items.push(withBase(i)));
        repaintItems();
        setDishPanel(false);
        haptic();
        toast(`${r.name}: ajusta las cantidades`);
        body.querySelector('#items').scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    };
    dishBtn?.addEventListener('click', () => setDishPanel(dishPanel.hidden));
    if (pendingFood) {
      const f = pendingFood;
      pendingFood = null;
      setPanel(true, f);
      setTimeout(() => toggleBtn.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350);
    }

    if (own) mountDish(body);

    body.querySelector('#copy-today')?.addEventListener('click', async () => {
      const m = buildMeal();
      await db.putMeal({ date: keyOf(today()), type: draft.type, name: m.name, photo: draft.photo, items: m.items,
        kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, createdAt: Date.now() });
      haptic();
      closeSheet();
      renderNutrition();
      toast('Copiada a hoy ↺');
    });

    body.querySelector('#del')?.addEventListener('click', async () => {
      if (own) {
        if (!confirm(recipe ? '¿Borrar esta receta?' : '¿Borrar este plato?')) return;
        await db.deleteFavorite(draft.id);
        await loadFavorites();
        if (plato) { toast('Plato borrado'); return openFoodBrowser(); }
        closeSheet();
        renderNutrition();
        return toast('Receta borrada');
      }
      if (!confirm('¿Borrar esta comida?')) return;
      await db.deleteMeal(draft.id);
      closeSheet();
      renderNutrition();
      toast('Comida borrada');
    });

    body.querySelector('#save').addEventListener('click', async () => {
      const m = buildMeal();
      if (!m.items.length) return toast('Añade al menos un alimento');
      if (plato) {
        if (!draft.name.trim()) { body.querySelector('#mname').focus(); return toast('Ponle nombre al plato'); }
        await db.putFavorite({
          ...(draft.id != null ? { id: draft.id } : {}),
          name: m.name, kind: 'plato', types: draft.types, photo: draft.photo || null, items: m.items,
          kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat,
          ...(draft.emoji ? { emoji: draft.emoji } : {}), createdAt: draft.createdAt || Date.now(),
        });
        await loadFavorites();
        haptic();
        toast(editing ? 'Plato actualizado' : 'Plato creado 🍽️');
        return openFoodBrowser();
      }
      if (recipe) {
        if (!draft.name.trim()) { body.querySelector('#mname').focus(); return toast('Ponle nombre a la receta'); }
        const n = draft.servings;
        await db.putFavorite({
          ...(draft.id != null ? { id: draft.id } : {}),
          name: m.name, kind: 'recipe', types: draft.types, photo: draft.photo || null, items: m.items,
          kcal: r0(m.kcal / n), protein: r1(m.protein / n), carbs: r1(m.carbs / n), fat: r1(m.fat / n),
          ...(draft.emoji ? { emoji: draft.emoji } : {}), ...(draft.minutes ? { minutes: draft.minutes } : {}),
          ...(draft.tools.length ? { tools: draft.tools } : {}), steps: draft.steps.map(x => x.trim()).filter(Boolean),
          ...(n > 1 ? { servings: n } : {}), ...(draft.notes?.trim() ? { notes: draft.notes.trim() } : {}),
          custom: true, createdAt: draft.createdAt || Date.now(),
        });
        await loadFavorites();
        haptic();
        closeSheet();
        renderNutrition();
        return toast(editing ? 'Receta actualizada' : 'Receta creada ⭐');
      }
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

// Cambia los gramos de un alimento escalando sus macros (y repinta su tarjeta)
function setItemGrams(it, card, grams, writeGrams) {
  it.grams = r1(grams);
  if (writeGrams) card.querySelector('[data-f="grams"]').value = it.grams;
  if (it.base.grams > 0) {
    const k = it.grams / it.base.grams;
    for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
      it[key] = key === 'kcal' ? r0(it.base[key] * k) : r1(it.base[key] * k);
      card.querySelector(`[data-f="${key}"]`).value = it[key];
    }
  }
  const ut = card.querySelector('[data-utext]');
  if (ut) ut.innerHTML = unitText(it);
}

function itemCard(it, i) {
  const num = (f, label, step = '1') => `<label>${label}<input data-f="${f}" type="number" inputmode="decimal" step="${step}" min="0" value="${it[f]}"></label>`;
  return `<div class="card item" data-i="${i}">
    <div class="item-top">
      <input data-f="name" value="${esc(it.name)}" placeholder="Alimento">
      <button class="icon-btn star ${isFoodFav(it.name) ? 'on' : ''}" data-ifav="${i}" aria-label="Guardar en mis alimentos">${isFoodFav(it.name) ? '★' : '☆'}</button>
      <button class="icon-btn" data-del="${i}" aria-label="Quitar alimento">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    ${it.unitG ? `<div class="item-units">
      <button class="icon-btn" data-ud="-1" aria-label="Una menos">−</button>
      <span data-utext>${unitText(it)}</span>
      <button class="icon-btn" data-ud="1" aria-label="Una más">+</button>
    </div>` : ''}
    <div class="item-grid">
      ${num('grams', 'Gramos')}${num('kcal', 'Kcal')}${num('protein', 'Prot.', '0.1')}${num('carbs', 'Hidr.', '0.1')}${num('fat', 'Grasa', '0.1')}
    </div>
  </div>`;
}
