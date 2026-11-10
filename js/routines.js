// =========================================================
// Pestaña Rutinas: tus rutinas y biblioteca de ejercicios con mapa muscular
// =========================================================
import { db } from './db.js';
import { chev } from './calendar.js';
import { openSheet, setSheetContent, closeSheet } from './sheet.js';
import { bodyMap, setMapSelection, PARTS, partColor } from './bodymap.js';
import { EXERCISES, EX, EQUIPMENT, TEMPLATES, videoUrl, isCardio, variantChips, variantsOf } from './exercises.js';
import { startWorkout, openWorkout, getActive, progressBlock } from './workout.js';
import { GEN_GROUPS, PRESETS, generateRoutine, swapExercise, estimateMinutes, routineName, templateFor } from './generator.js';
import { state, MUSCLES, M, esc, toast, haptic } from './utils.js';
import { mountAnim, hasAnim } from './anim.js';

const EQ_EMOJI = { barra: '🏋️', mancuernas: '💪', maquina: '⚙️', polea: '🔗', corporal: '🤸', kettlebell: '🔔', cardio: '🏃' };
// Color y músculos de un ejercicio (el cardio no tiene músculo principal)
const exColor = e => (e?.cardio ? M.cardio.color : partColor(e?.p[0]));
const exMuscles = e => (e?.cardio ? 'Cardio' : (e?.p || []).map(p => PARTS[p].name).join(', '));

let root;
let tab = 'routines';                           // 'routines' | 'library'
const TPL_KEY = 'gymfit-tplmin';
let tplMin = 0;                                 // minutos para adaptar las plantillas (0 = como vienen)
try { tplMin = Number(localStorage.getItem(TPL_KEY)) || 0; } catch { /* nada */ }
const libFilter = { muscle: null, eq: null, q: '' };   // filtros de la pestaña Ejercicios
const pickFilter = { muscle: null, eq: null, q: '' };  // filtros al añadir a una rutina

export function initRoutines(el) {
  root = el;
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-rtab]');
    if (t) { tab = t.dataset.rtab; return renderRoutines(); }
    if (e.target.closest('#wk-resume')) return openWorkout();
    if (e.target.closest('#free-workout')) return startWorkout(null);
    const st = e.target.closest('[data-start]');
    if (st) return startWorkout(state.routines.find(x => x.id === Number(st.dataset.start)));
    const r = e.target.closest('[data-routine]');
    if (r) return openEditor(state.routines.find(x => x.id === Number(r.dataset.routine)));
    if (e.target.closest('#new-routine')) return openEditor();
    if (e.target.closest('#gen-routine')) return openGenerator();
    const tm = e.target.closest('[data-tplmin]');
    if (tm) {
      tplMin = Number(tm.dataset.tplmin);
      try { localStorage.setItem(TPL_KEY, String(tplMin)); } catch { /* nada */ }
      haptic();
      return renderRoutines();
    }
    const tp = e.target.closest('[data-template]');
    if (tp) {
      const tpl = TEMPLATES[Number(tp.dataset.template)];
      return openEditor({ name: tplMin ? `${tpl.name} · ${tplMin} min` : tpl.name, items: templateFor(tpl, tplMin) });
    }
  });
}

export function renderRoutines() {
  const active = getActive();
  const done = active?.items.flatMap(i => i.sets) || [];
  root.innerHTML = `
    <h1 class="title">Rutinas</h1>
    ${active ? `<button class="card wk-banner" id="wk-resume">
      <span class="live"></span>
      <div><b>Entreno en curso</b><small>${esc(active.name)} · ${done.filter(x => x.done).length}/${done.length} series</small></div>
      <span class="btn small primary">Continuar</span>
    </button>` : ''}
    <div class="seg wide">
      <button data-rtab="routines" class="${tab === 'routines' ? 'on' : ''}">Mis rutinas</button>
      <button data-rtab="library" class="${tab === 'library' ? 'on' : ''}">Ejercicios</button>
    </div>
    <div id="rt-body"></div>`;
  const body = root.querySelector('#rt-body');
  if (tab === 'routines') { body.innerHTML = routinesHtml(); setupRoutineScroller(body.querySelector('#rt-scroll.on')); }
  else mountLibrary(body, libFilter, openExercise);
}

// Grupos musculares (del calendario) que trabaja una rutina, según los músculos principales
export function routineGroups(r) {
  const used = new Set((r?.items || []).flatMap(i => EX[i.ex]?.p || []).map(p => PARTS[p].group));
  if ((r?.items || []).some(i => isCardio(i.ex))) used.add('cardio');
  return MUSCLES.map(m => m.id).filter(id => used.has(id));
}

// Pastillas de color con los grupos que trabaja una rutina o un entreno (como la leyenda del calendario)
export function groupPills(r) {
  const groups = routineGroups(r);
  return groups.length ? `<div class="grp-pills">${groups.map(g => `<span style="--c:${M[g].color}"><i></i>${M[g].name}</span>`).join('')}</div>` : '';
}

// ---------- Mis rutinas ----------
// Con más de dos rutinas: se ven dos y el resto se desliza; las tarjetas que entran o salen se encogen y difuminan
function setupRoutineScroller(box) {
  if (!box) return;
  const cards = [...box.children];
  const fit = () => {
    const a = cards[0].getBoundingClientRect(), b = cards[1].getBoundingClientRect();
    box.style.maxHeight = `${Math.ceil(b.bottom - a.top)}px`;
  };
  const dots = [...(box.parentElement.querySelector('#rt-ind')?.children || [])];
  const paint = () => {
    const r = box.getBoundingClientRect();
    cards.forEach((c, i) => {
      const cr = c.getBoundingClientRect();
      const vis = Math.max(0, Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)) / (cr.height || 1);
      c.style.transform = `scale(${(0.88 + 0.12 * vis).toFixed(3)})`;
      c.style.opacity = (0.25 + 0.75 * vis).toFixed(3);
      dots[i]?.classList.toggle('on', vis > 0.6);   // puntos de abajo: los que se ven, marcados
    });
  };
  let raf = 0;
  box.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
  requestAnimationFrame(() => { fit(); paint(); });
}
function routinesHtml() {
  const list = [...state.routines].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cards = list.map(r => {
    const groups = routineGroups(r);
    return `<div class="card routine" data-routine="${r.id}" role="button" tabindex="0">
      <div class="routine-top"><b>${esc(r.name)}${r.items.length ? `<small class="rt-min">${estimateMinutes(r.items)} min</small>` : ''}</b><span class="rt-dots">${groups.map(g => `<i style="--c:${M[g].color}" title="${M[g].name}"></i>`).join('')}</span>${chev('r')}</div>
      ${r.items.length ? `<button class="btn small primary start" data-start="${r.id}">▶ Empezar entreno</button>` : ''}
    </div>`;
  }).join('');

  return `
    ${cards ? `<div class="rt-scroll ${list.length > 2 ? 'on' : ''}" id="rt-scroll">${cards}</div>
      ${list.length > 2 ? `<div class="rt-ind" id="rt-ind">${list.map(() => '<i></i>').join('')}</div>` : ''}` : `<div class="card empty"><span class="e">📋</span><b>Aún no tienes rutinas</b>Crea una desde cero o empieza con una plantilla.</div>`}
    <button class="btn primary" id="gen-routine">✨ Crear rutina automática</button>
    <button class="btn primary" id="new-routine">+ Nueva rutina</button>
    <button class="btn tint" id="free-workout">⚡ Entrenamiento libre</button>
    <div class="section-label">Plantillas</div>
    <div class="chips scroll tpl-min">
      ${[0, ...DURATIONS].map(m => `<button class="chip ${tplMin === m ? 'on' : ''}" data-tplmin="${m}" style="--c:var(--accent)">${m ? `${m} min` : 'Todas'}</button>`).join('')}
    </div>
    <div class="action-list">
      ${TEMPLATES.map((t, i) => `<button class="action" data-template="${i}" style="--c:color-mix(in srgb,var(--accent) 22%,transparent)">
        <span class="e">${t.emoji || '📋'}</span>
        <div>${esc(t.name)}<small>${estimateMinutes(templateFor(t, tplMin))} min</small></div>
      </button>`).join('')}
    </div>`;
}

// ---------- Biblioteca con mapa muscular (se usa en la pestaña y al añadir ejercicios) ----------
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function filterExercises(f) {
  const q = norm(f.q.trim());
  const list = EXERCISES.filter(e => (!f.eq || e.eq === f.eq) && (!q || norm(e.name).includes(q)));
  if (!f.muscle) return list;
  return list.filter(e => e.p.includes(f.muscle) || e.s.includes(f.muscle))
    .sort((a, b) => b.p.includes(f.muscle) - a.p.includes(f.muscle));
}

function exRow(e, f, pick) {
  const tag = f.muscle ? (e.p.includes(f.muscle) ? '<span class="zone-tag p">Principal</span>' : '<span class="zone-tag s">Secundario</span>') : '';
  return `<button class="ex-row" data-ex="${e.id}">
    <span class="ex-ico" style="--c:${exColor(e)}">${EQ_EMOJI[e.eq] || '🏋️'}</span>
    <span class="info"><b>${esc(e.name)}</b><small>${e.cardio ? 'Cardio · en minutos' : `${EQUIPMENT[e.eq]} · ${exMuscles(e)}`}</small></span>
    ${tag}
    ${pick ? '<span class="ex-add">+</span>' : chev('r')}
  </button>`;
}

// pick: modo «añadir» (rutina o entreno): el + añade (onPick) y tocar el ejercicio abre su ficha (onInfo)
export function mountLibrary(el, f, onPick, pick = false, onInfo = null) {
  el.insertAdjacentHTML('beforeend', `
    <div class="card bm-card">
      ${bodyMap({ interactive: true, selected: f.muscle })}
      <div class="bm-hint" id="bm-hint"></div>
    </div>
    <input class="search" type="search" aria-label="Buscar ejercicio" autocomplete="off" value="${esc(f.q)}">
    <div class="chips scroll">
      <button class="chip ${!f.eq ? 'on' : ''}" data-eq="" style="--c:var(--accent)">Todo</button>
      ${Object.entries(EQUIPMENT).map(([id, name]) => `<button class="chip ${f.eq === id ? 'on' : ''}" data-eq="${id}" style="--c:var(--accent)">${EQ_EMOJI[id]} ${name}</button>`).join('')}
    </div>
    <div id="ex-list"></div>`);

  const draw = () => {
    const list = filterExercises(f);
    el.querySelector('#bm-hint').innerHTML = f.muscle
      ? `<i style="--c:${partColor(f.muscle)}"></i><b>${PARTS[f.muscle].name}</b><span>${list.length} ${list.length === 1 ? 'ejercicio' : 'ejercicios'}</span><button class="link" data-clear>Quitar</button>`
      : '<span>Toca un músculo para ver sus ejercicios</span>';

    let html;
    if (f.muscle || f.q.trim()) {
      html = list.map(e => exRow(e, f, pick)).join('');
    } else {
      // Sin músculo elegido: por grupos. Con un material elegido, todos a la vista;
      // con «Todo», un desplegable por grupo (se pueden abrir varios a la vez)
      const open = f.open ||= new Set();
      html = MUSCLES.map(g => {
        const items = list.filter(e => (e.cardio ? 'cardio' : PARTS[e.p[0]].group) === g.id);
        if (!items.length) return '';
        if (f.eq) return `<div class="ex-group-head" style="--c:${g.color}"><i></i>${g.name}</div>${items.map(e => exRow(e, f, pick)).join('')}`;
        const isOpen = open.has(g.id);
        return `<button class="ex-grp ${isOpen ? 'open' : ''}" data-grp="${g.id}" style="--c:${g.color}">
            <i></i><b>${g.name}</b>${chev('r')}
          </button>${isOpen ? `<div class="ex-grp-list">${items.map(e => exRow(e, f, pick)).join('')}</div>` : ''}`;
      }).join('');
    }
    el.querySelector('#ex-list').innerHTML = html || '<div class="card empty"><span class="e">🔍</span><b>Sin resultados</b>Prueba con otro músculo o material.</div>';
  };

  el.addEventListener('click', e => {
    const m = e.target.closest('[data-m]');
    if (m) {
      f.muscle = f.muscle === m.dataset.m ? null : m.dataset.m;
      setMapSelection(el, f.muscle);
      haptic();
      return draw();
    }
    if (e.target.closest('[data-clear]')) { f.muscle = null; setMapSelection(el, null); return draw(); }
    const grp = e.target.closest('[data-grp]');
    if (grp) {
      const open = f.open ||= new Set(), id = grp.dataset.grp;
      open.has(id) ? open.delete(id) : open.add(id);
      haptic();
      return draw();
    }
    const eq = e.target.closest('[data-eq]');
    if (eq) {
      f.eq = eq.dataset.eq || null;
      el.querySelectorAll('[data-eq]').forEach(b => b.classList.toggle('on', b === eq));
      return draw();
    }
    const ex = e.target.closest('[data-ex]');
    if (!ex) return;
    if (pick && onInfo && !e.target.closest('.ex-add')) return onInfo(ex.dataset.ex);
    onPick(ex.dataset.ex);
  });
  el.querySelector('.search').addEventListener('input', e => { f.q = e.target.value; draw(); });
  draw();
}

// ---------- Ficha de un ejercicio ----------
function zoneList(ids) {
  return ids.map(id => `<span class="zone"><i style="--c:${partColor(id)}"></i>${PARTS[id].name}</span>`).join('');
}

function openExercise(id) { showExercise(id); }

// back: si se abre desde una rutina o un entreno, botón para volver a donde estabas
// replace: cambiar de variante sin volver a abrir la hoja
// add: { label, fn(id) } botón para añadir el ejercicio a la rutina o al entreno desde su ficha
export function showExercise(id, back = null, replace = false, add = null) {
  const ex = EX[id];
  if (!ex) return;
  const prog = progressBlock(id);
  const vg = variantsOf(id);
  (back || replace ? setSheetContent : openSheet)(`
    ${back ? `<button class="link back" id="ex-back">${chev('l')} Volver</button>` : ''}
    <h2 class="sheet-title">${esc(ex.name)}</h2>
    <div class="muted small">${EQ_EMOJI[ex.eq]} ${EQUIPMENT[ex.eq]}</div>
    ${vg ? `<div class="label">Variantes · ${esc(vg.name)}</div>${variantChips(id)}` : ''}
    ${ex.cardio ? '' : `<div class="card" style="margin-top:14px">
      ${bodyMap({ primary: ex.p, secondary: ex.s, small: true })}
      <div class="zones">
        <div><span class="zone-tag p">Principal</span>${zoneList(ex.p)}</div>
        ${ex.s.length ? `<div><span class="zone-tag s">Secundario</span>${zoneList(ex.s)}</div>` : ''}
      </div>
    </div>`}
    ${prog ? `<div class="label">Tu progreso</div><div class="card">${prog}</div>` : ''}
    <div class="label">Cómo se hace</div>
    <div class="card how"><ol class="steps">${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
    ${ex.tips ? `<div class="tip-card"><span class="e">💡</span><div><b>Consejo</b><p>${esc(ex.tips)}</p></div></div>` : ''}
    ${hasAnim(id) ? '<div class="card ex-anim" id="ex-anim"></div>' : ''}
    ${ex.cardio ? '' : `<a class="link" href="${videoUrl(ex)}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:12px">¿Más dudas? Ver vídeos en YouTube</a>`}
    ${add ? `<button class="btn primary" id="add-this" style="margin-top:14px">${esc(add.label)}</button>` : back ? '' : '<button class="btn primary" id="add-to" style="margin-top:14px">Añadir a una rutina</button>'}`, body => {
    const anim = body.querySelector('#ex-anim');
    if (anim) mountAnim(anim, id);
    body.querySelector('#add-to')?.addEventListener('click', () => chooseRoutine(id));
    body.querySelector('#add-this')?.addEventListener('click', () => add.fn(id));
    body.querySelector('#ex-back')?.addEventListener('click', back);
    body.querySelector('.variants')?.addEventListener('click', e => {
      const v = e.target.closest('[data-variant]')?.dataset.variant;
      if (v && v !== id) { haptic(); showExercise(v, back, true, add); }
    });
  });
}

function chooseRoutine(exId) {
  setSheetContent(`
    <h2 class="sheet-title">Añadir a…</h2>
    <div class="muted small">${esc(EX[exId].name)}</div>
    <div class="action-list">
      ${state.routines.map(r => `<button class="action" data-to="${r.id}" style="--c:color-mix(in srgb,var(--accent) 22%,transparent)"><span class="e">📋</span><div>${esc(r.name)}<small>${r.items.length} ejercicios</small></div></button>`).join('')}
      <button class="action" data-to="new" style="--c:color-mix(in srgb,var(--blue) 22%,transparent)"><span class="e">＋</span><div>Nueva rutina<small>Empieza una con este ejercicio</small></div></button>
    </div>`, body => {
    body.addEventListener('click', async e => {
      const to = e.target.closest('[data-to]')?.dataset.to;
      if (!to) return;
      const item = isCardio(exId) ? { ex: exId, sets: 1, reps: '20', kg: '' } : { ex: exId, sets: 3, reps: '10', kg: '' };
      if (to === 'new') return openEditor({ name: '', items: [item] });
      const r = state.routines.find(x => x.id === Number(to));
      await saveRoutine({ ...r, items: [...r.items, item] });
      haptic();
      closeSheet();
      toast(`Añadido a ${r.name} 💪`);
    });
  });
}

// ---------- Editor de rutinas ----------
async function saveRoutine(r) {
  r.updatedAt = Date.now();
  r.createdAt ||= r.updatedAt;
  r.id = await db.putRoutine(r);
  state.routines = [...state.routines.filter(x => x.id !== r.id), r];
  renderRoutines();
}

function openEditor(existing) {
  const draft = existing ? structuredClone(existing) : { name: '', items: [] };

  const itemsHtml = () => draft.items.length ? draft.items.map((it, i) => {
    const ex = EX[it.ex];
    return `<div class="card item rt-item">
      <div class="item-top">
        <span class="rt-num" style="--c:${exColor(ex)}">${i + 1}</span>
        <div class="rt-name"><b class="ex-link" data-info="${it.ex}">${esc(ex?.name || it.ex)}</b><small>${exMuscles(ex)}</small></div>
        <button class="icon-btn" data-mv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${arrow('M12 19V5M5 12l7-7 7 7')}</button>
        <button class="icon-btn" data-mv="${i}" data-d="1" ${i === draft.items.length - 1 ? 'disabled' : ''} aria-label="Bajar">${arrow('M12 5v14M5 12l7 7 7-7')}</button>
        <button class="icon-btn" data-rm="${i}" aria-label="Quitar">${arrow('M6 6l12 12M18 6L6 18')}</button>
      </div>
      ${variantChips(it.ex, `data-vi="${i}"`, true)}
      ${ex?.cardio ? `<div class="item-grid rt-grid one">
        <label>Minutos<input data-i="${i}" data-f="reps" inputmode="numeric" value="${esc(it.reps)}"></label>
      </div>` : `<div class="item-grid rt-grid">
        <label>Series<input data-i="${i}" data-f="sets" inputmode="numeric" value="${esc(it.sets)}"></label>
        <label>Reps<input data-i="${i}" data-f="reps" value="${esc(it.reps)}"></label>
        <label>Kg<input data-i="${i}" data-f="kg" inputmode="decimal" placeholder="–" value="${esc(it.kg)}"></label>
      </div>`}
    </div>`;
  }).join('') : '<div class="muted small" style="margin:0 2px 12px">Añade ejercicios eligiendo músculos en el mapa.</div>';

  const editorHtml = () => `
    <h2 class="sheet-title">${draft.id ? 'Editar rutina' : 'Nueva rutina'}</h2>
    <label class="field"><span>Nombre</span>
      <input id="rt-name" placeholder="Ej: Pecho y tríceps" value="${esc(draft.name)}">
    </label>
    <div id="rt-groups">${groupPills(draft)}</div>
    <div class="label">Ejercicios</div>
    <div id="rt-items">${itemsHtml()}</div>
    <button class="btn secondary" id="add-ex">+ Añadir ejercicio</button>
    <div style="margin-top:20px">
      <button class="btn primary" id="save">Guardar rutina</button>
      ${draft.id ? '<button class="btn ghost danger" id="del">Borrar rutina</button>' : ''}
    </div>`;

  const mountEditor = body => {
    const redrawItems = () => {
      body.querySelector('#rt-items').innerHTML = itemsHtml();
      body.querySelector('#rt-groups').innerHTML = groupPills(draft);
    };
    body.querySelector('#rt-name').addEventListener('input', e => { draft.name = e.target.value; });
    body.addEventListener('input', e => {
      const i = e.target.dataset.i;
      if (i !== undefined) draft.items[i][e.target.dataset.f] = e.target.value.trim();
    });
    body.addEventListener('click', async e => {
      const info = e.target.closest('[data-info]');
      if (info) return showExercise(info.dataset.info, () => setSheetContent(editorHtml(), mountEditor));
      const vb = e.target.closest('[data-variant][data-vi]');
      if (vb) {   // cambiar el ejercicio por otra variante, conservando series, reps y kg
        draft.items[Number(vb.dataset.vi)].ex = vb.dataset.variant;
        haptic();
        return redrawItems();
      }
      const mv = e.target.closest('[data-mv]');
      if (mv) {
        const i = Number(mv.dataset.mv), j = i + Number(mv.dataset.d);
        [draft.items[i], draft.items[j]] = [draft.items[j], draft.items[i]];
        return redrawItems();
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { draft.items.splice(Number(rm.dataset.rm), 1); return redrawItems(); }
      if (e.target.closest('#add-ex')) return openPicker();
      if (e.target.closest('#save')) {
        if (!draft.name.trim()) { body.querySelector('#rt-name').focus(); return toast('Ponle un nombre a la rutina'); }
        draft.name = draft.name.trim();
        await saveRoutine(draft);
        haptic();
        closeSheet();
        return toast('Rutina guardada 💪');
      }
      if (e.target.closest('#del')) {
        if (!confirm(`¿Borrar la rutina "${draft.name}"?`)) return;
        await db.deleteRoutine(draft.id);
        state.routines = state.routines.filter(x => x.id !== draft.id);
        closeSheet();
        renderRoutines();
        toast('Rutina borrada');
      }
    });
  };

  const openPicker = () => setSheetContent(`
    <button class="link back" id="back">${chev('l')} Volver a la rutina</button>
    <h2 class="sheet-title">Añadir ejercicio</h2>`, body => {
    body.querySelector('#back').addEventListener('click', () => setSheetContent(editorHtml(), mountEditor));
    const addEx = exId => {
      draft.items.push(isCardio(exId) ? { ex: exId, sets: 1, reps: '20', kg: '' } : { ex: exId, sets: 3, reps: '10', kg: '' });
      haptic();
      toast(`Añadido: ${EX[exId].name}`);
      setSheetContent(editorHtml(), mountEditor);
    };
    mountLibrary(body, pickFilter, addEx, true, exId => showExercise(exId, openPicker, false, { label: '＋ Añadir a la rutina', fn: addEx }));
  });

  openSheet(editorHtml(), mountEditor);
}

// ---------- Creador automático de rutinas ----------
const GEN_KEY = 'gymfit-gen';
const DURATIONS = [30, 45, 60, 75, 90, 120];
const GEN_EQS = Object.keys(EQUIPMENT).filter(id => id !== 'cardio');
function loadGenOpts() {
  const def = { minutes: 60, groups: ['pecho', 'triceps'], eqs: Object.keys(EQUIPMENT) };
  try { return { ...def, ...JSON.parse(localStorage.getItem(GEN_KEY) || '{}') }; } catch { return def; }
}

function openGenerator() {
  const saved = loadGenOpts();
  const opts = { minutes: saved.minutes, groups: new Set(saved.groups), eqs: new Set(saved.eqs) };

  const html = () => `
    <h2 class="sheet-title">✨ Crear rutina</h2>

    <div class="label">Duración</div>
    <div class="chips">
      ${DURATIONS.map(m => `<button class="chip ${opts.minutes === m ? 'on' : ''}" data-min="${m}" style="--c:var(--accent)">${m} min</button>`).join('')}
    </div>

    <div class="label">Grupos musculares</div>
    <div class="chips gen-presets">
      ${PRESETS.map((p, i) => `<button class="link" data-preset="${i}">${p.name}</button>`).join('')}
    </div>
    <div class="chips">
      ${GEN_GROUPS.map(g => `<button class="chip ${opts.groups.has(g) ? 'on' : ''}" data-gg="${g}" style="--c:${M[g].color}"><span class="dot"></span>${M[g].name}</button>`).join('')}
    </div>

    <div class="label">Material disponible</div>
    <div class="chips">
      <button class="chip ${GEN_EQS.every(q => opts.eqs.has(q)) ? 'on' : ''}" data-geq-all style="--c:var(--blue)">Todo</button>
      ${Object.entries(EQUIPMENT).filter(([id]) => id !== 'cardio').map(([id, name]) => `<button class="chip ${opts.eqs.has(id) ? 'on' : ''}" data-geq="${id}" style="--c:var(--blue)">${EQ_EMOJI[id]} ${name}</button>`).join('')}
    </div>

    <button class="btn primary" id="gen-go" style="margin-top:22px">Crear rutina</button>`;

  const mount = body => {
    body.addEventListener('click', e => {
      const mn = e.target.closest('[data-min]');
      if (mn) { opts.minutes = Number(mn.dataset.min); haptic(); return setSheetContent(html(), mount); }
      const pr = e.target.closest('[data-preset]');
      if (pr) { opts.groups = new Set(PRESETS[Number(pr.dataset.preset)].groups); haptic(); return setSheetContent(html(), mount); }
      const gg = e.target.closest('[data-gg]');
      if (gg) {
        const g = gg.dataset.gg;
        opts.groups.has(g) ? opts.groups.delete(g) : opts.groups.add(g);
        gg.classList.toggle('on', opts.groups.has(g)); haptic(); return;
      }
      if (e.target.closest('[data-geq-all]')) {   // todo el material (o nada si ya estaba todo)
        const all = GEN_EQS.every(q => opts.eqs.has(q));
        opts.eqs = new Set(all ? [] : GEN_EQS);
        haptic();
        return setSheetContent(html(), mount);
      }
      const ge = e.target.closest('[data-geq]');
      if (ge) {
        const q = ge.dataset.geq;
        opts.eqs.has(q) ? opts.eqs.delete(q) : opts.eqs.add(q);
        ge.classList.toggle('on', opts.eqs.has(q));
        body.querySelector('[data-geq-all]').classList.toggle('on', GEN_EQS.every(x => opts.eqs.has(x)));
        haptic(); return;
      }
      if (e.target.closest('#gen-go')) {
        if (!opts.groups.size) return toast('Elige al menos un grupo muscular');
        if (!opts.eqs.size) return toast('Elige al menos un tipo de material');
        try { localStorage.setItem(GEN_KEY, JSON.stringify({ minutes: opts.minutes, groups: [...opts.groups], eqs: [...opts.eqs] })); } catch { /* nada */ }
        showGenerated(opts, html, mount);
      }
    });
  };
  openSheet(html(), mount);
}

function showGenerated(opts, formHtml, formMount) {
  const groups = GEN_GROUPS.filter(g => opts.groups.has(g));
  let res = generateRoutine({ minutes: opts.minutes, groups, eqs: opts.eqs });
  let name = `${routineName(groups)} · ${opts.minutes} min`;

  const html = () => {
    const items = res.items;
    const primary = [...new Set(items.flatMap(i => EX[i.ex].p))];
    const secondary = [...new Set(items.flatMap(i => EX[i.ex].s))].filter(p => !primary.includes(p));
    const sets = items.reduce((a, i) => a + Number(i.sets), 0);
    return `
      <button class="link back" id="gen-back">${chev('l')} Cambiar opciones</button>
      <h2 class="sheet-title">${esc(name)}</h2>
      <div class="muted small">≈ ${estimateMinutes(items)} min · ${items.length} ejercicios · ${sets} series</div>
      ${res.warnings.map(w => `<div class="notice">${esc(w)}</div>`).join('')}
      ${items.length ? `
      <div class="card" style="margin-top:14px">${bodyMap({ primary, secondary, small: true })}</div>
      <div id="gen-items">${items.map((it, i) => {
        const ex = EX[it.ex];
        return `<div class="card item rt-item">
          <div class="item-top">
            <span class="rt-num" style="--c:${partColor(ex.p[0])}">${i + 1}</span>
            <div class="rt-name"><b class="ex-link" data-exname="${it.ex}">${esc(ex.name)}</b><small>${EQ_EMOJI[ex.eq]} ${EQUIPMENT[ex.eq]} · ${ex.p.map(p => PARTS[p].name).join(', ')}</small></div>
            <button class="icon-btn" data-swap="${i}" aria-label="Cambiar por otro ejercicio">🔀</button>
          </div>
          <div class="gen-plan"><b>${it.sets} × ${esc(it.reps)}</b><button class="link" data-info="${it.ex}">▶️ Ver técnica</button></div>
          <div class="ex-anim" data-anim="${it.ex}" hidden></div>
        </div>`;
      }).join('')}</div>
      <button class="btn primary" id="gen-start">▶ Empezar entreno ahora</button>
      <button class="btn secondary" id="gen-save">Guardar rutina</button>
      <button class="btn ghost" id="gen-again">🔀 Generar otra variante</button>` : `
      <div class="card empty"><span class="e">🤷</span><b>No hay ejercicios</b>Prueba con otro material o más grupos.</div>`}`;
  };

  const plain = () => res.items.map(({ g, ...it }) => ({ ...it }));
  const mount = body => {
    body.addEventListener('click', e => {
      if (e.target.closest('#gen-back')) return setSheetContent(formHtml(), formMount);
      if (e.target.closest('#gen-again')) {
        res = generateRoutine({ minutes: opts.minutes, groups, eqs: opts.eqs });
        haptic();
        return setSheetContent(html(), mount);
      }
      const sw = e.target.closest('[data-swap]');
      if (sw) {
        if (!swapExercise(res.items, Number(sw.dataset.swap), opts.eqs)) return toast('No hay otro ejercicio de ese grupo con tu material');
        haptic();
        return setSheetContent(html(), mount);
      }
      const exn = e.target.closest('[data-exname]');
      if (exn) return showExercise(exn.dataset.exname, () => setSheetContent(html(), mount));
      const info = e.target.closest('[data-info]');
      if (info) {
        const box = info.closest('.rt-item').querySelector('[data-anim]');
        box.hidden = !box.hidden;
        info.textContent = box.hidden ? '▶️ Ver técnica' : 'Ocultar técnica';
        if (!box.hidden) {
          if (hasAnim(box.dataset.anim)) mountAnim(box, box.dataset.anim);
          else window.open(videoUrl(EX[box.dataset.anim]), '_blank', 'noopener');
        } else box.innerHTML = '';
        return;
      }
      if (e.target.closest('#gen-start')) {
        closeSheet(true);
        return startWorkout({ id: null, name, items: plain() });
      }
      if (e.target.closest('#gen-save')) return openEditor({ name, items: plain() });
    });
  };
  setSheetContent(html(), mount);
}

const arrow = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
