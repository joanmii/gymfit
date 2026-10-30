// =========================================================
// Pestaña Rutinas: tus rutinas y biblioteca de ejercicios con mapa muscular
// =========================================================
import { db } from './db.js';
import { chev } from './calendar.js';
import { openSheet, setSheetContent, closeSheet } from './sheet.js';
import { bodyMap, setMapSelection, PARTS, partColor } from './bodymap.js';
import { EXERCISES, EX, EQUIPMENT, TEMPLATES, videoUrl } from './exercises.js';
import { startWorkout, openWorkout, getActive, progressBlock } from './workout.js';
import { state, MUSCLES, M, esc, toast, haptic } from './utils.js';

const EQ_EMOJI = { barra: '🏋️', mancuernas: '💪', maquina: '⚙️', polea: '🔗', corporal: '🤸', kettlebell: '🔔' };

let root;
let tab = 'routines';                           // 'routines' | 'library'
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
    const tp = e.target.closest('[data-template]');
    if (tp) {
      const tpl = TEMPLATES[Number(tp.dataset.template)];
      return openEditor({ name: tpl.name, items: tpl.items.map(([ex, sets, reps]) => ({ ex, sets, reps, kg: '' })) });
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
  if (tab === 'routines') body.innerHTML = routinesHtml();
  else mountLibrary(body, libFilter, openExercise);
}

// Grupos musculares (del calendario) que trabaja una rutina, según los músculos principales
export function routineGroups(r) {
  const used = new Set((r?.items || []).flatMap(i => EX[i.ex]?.p || []).map(p => PARTS[p].group));
  return MUSCLES.map(m => m.id).filter(id => used.has(id));
}

// ---------- Mis rutinas ----------
function routinesHtml() {
  const list = [...state.routines].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cards = list.map(r => {
    const groups = routineGroups(r);
    return `<div class="card routine" data-routine="${r.id}" role="button" tabindex="0">
      <div class="routine-top"><b>${esc(r.name)}</b>${chev('r')}</div>
      <div class="muted small">${r.items.length} ${r.items.length === 1 ? 'ejercicio' : 'ejercicios'}${groups.length ? ` · ${groups.map(g => M[g].name).join(' · ')}` : ''}</div>
      <div class="today-dots">${groups.map(g => `<i style="--c:${M[g].color}"></i>`).join('')}</div>
      ${r.items.length ? `<ol class="routine-ex">${r.items.slice(0, 4).map(i => `<li><span>${esc(EX[i.ex]?.name || i.ex)}</span><b>${esc(i.sets)} × ${esc(i.reps)}${i.kg ? ` · ${esc(i.kg)} kg` : ''}</b></li>`).join('')}
        ${r.items.length > 4 ? `<li class="muted">y ${r.items.length - 4} más…</li>` : ''}</ol>` : ''}
      ${r.items.length ? `<button class="btn small primary start" data-start="${r.id}">▶ Empezar entreno</button>` : ''}
    </div>`;
  }).join('');

  return `
    ${cards || `<div class="card empty"><span class="e">📋</span><b>Aún no tienes rutinas</b>Crea una desde cero o empieza con una plantilla.</div>`}
    <button class="btn primary" id="new-routine">+ Nueva rutina</button>
    <button class="btn secondary" id="free-workout">⚡ Entreno libre (sin rutina)</button>
    <div class="section-label">Plantillas</div>
    <div class="action-list">
      ${TEMPLATES.map((t, i) => `<button class="action" data-template="${i}" style="--c:color-mix(in srgb,var(--accent) 22%,transparent)">
        <span class="e">${['💪', '🧗', '🦵', '⚡'][i] || '📋'}</span>
        <div>${esc(t.name)}<small>${t.items.map(([id]) => EX[id].name).join(', ')}</small></div>
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
    <span class="ex-ico" style="--c:${partColor(e.p[0])}">${EQ_EMOJI[e.eq] || '🏋️'}</span>
    <span class="info"><b>${esc(e.name)}</b><small>${EQUIPMENT[e.eq]} · ${e.p.map(p => PARTS[p].name).join(', ')}</small></span>
    ${tag}
    ${pick ? '<span class="ex-add">+</span>' : chev('r')}
  </button>`;
}

export function mountLibrary(el, f, onPick, pick = false) {
  el.insertAdjacentHTML('beforeend', `
    <div class="card bm-card">
      ${bodyMap({ interactive: true, selected: f.muscle })}
      <div class="bm-hint" id="bm-hint"></div>
    </div>
    <input class="search" type="search" placeholder="Buscar ejercicio" autocomplete="off" value="${esc(f.q)}">
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
      // Sin músculo elegido: agrupados por grupo muscular
      html = MUSCLES.map(g => {
        const items = list.filter(e => PARTS[e.p[0]].group === g.id);
        return items.length ? `<div class="ex-group-head" style="--c:${g.color}"><i></i>${g.name}</div>${items.map(e => exRow(e, f, pick)).join('')}` : '';
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
    const eq = e.target.closest('[data-eq]');
    if (eq) {
      f.eq = eq.dataset.eq || null;
      el.querySelectorAll('[data-eq]').forEach(b => b.classList.toggle('on', b === eq));
      return draw();
    }
    const ex = e.target.closest('[data-ex]');
    if (ex) onPick(ex.dataset.ex);
  });
  el.querySelector('.search').addEventListener('input', e => { f.q = e.target.value; draw(); });
  draw();
}

// ---------- Ficha de un ejercicio ----------
function zoneList(ids) {
  return ids.map(id => `<span class="zone"><i style="--c:${partColor(id)}"></i>${PARTS[id].name}</span>`).join('');
}

function openExercise(id) {
  const ex = EX[id];
  const prog = progressBlock(id);
  openSheet(`
    <h2 class="sheet-title">${esc(ex.name)}</h2>
    <div class="muted small">${EQ_EMOJI[ex.eq]} ${EQUIPMENT[ex.eq]}</div>
    <div class="card" style="margin-top:14px">
      ${bodyMap({ primary: ex.p, secondary: ex.s, small: true })}
      <div class="zones">
        <div><span class="zone-tag p">Principal</span>${zoneList(ex.p)}</div>
        ${ex.s.length ? `<div><span class="zone-tag s">Secundario</span>${zoneList(ex.s)}</div>` : ''}
      </div>
    </div>
    <a class="btn secondary" href="${videoUrl(ex)}" target="_blank" rel="noopener">▶️ Ver vídeos de la técnica</a>
    ${prog ? `<div class="label">Tu progreso</div><div class="card">${prog}</div>` : ''}
    <div class="label">Cómo se hace</div>
    <div class="card"><ol class="steps">${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
    ${ex.tips ? `<div class="notice">💡 ${esc(ex.tips)}</div>` : ''}
    <button class="btn primary" id="add-to" style="margin-top:18px">Añadir a una rutina</button>`, body => {
    body.querySelector('#add-to').addEventListener('click', () => chooseRoutine(id));
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
      const item = { ex: exId, sets: 3, reps: '10', kg: '' };
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
        <span class="rt-num" style="--c:${partColor(ex?.p[0])}">${i + 1}</span>
        <div class="rt-name"><b>${esc(ex?.name || it.ex)}</b><small>${ex ? ex.p.map(p => PARTS[p].name).join(', ') : ''}</small></div>
        <button class="icon-btn" data-mv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${arrow('M12 19V5M5 12l7-7 7 7')}</button>
        <button class="icon-btn" data-mv="${i}" data-d="1" ${i === draft.items.length - 1 ? 'disabled' : ''} aria-label="Bajar">${arrow('M12 5v14M5 12l7 7 7-7')}</button>
        <button class="icon-btn" data-rm="${i}" aria-label="Quitar">${arrow('M6 6l12 12M18 6L6 18')}</button>
      </div>
      <div class="item-grid rt-grid">
        <label>Series<input data-i="${i}" data-f="sets" inputmode="numeric" value="${esc(it.sets)}"></label>
        <label>Reps<input data-i="${i}" data-f="reps" value="${esc(it.reps)}"></label>
        <label>Kg<input data-i="${i}" data-f="kg" inputmode="decimal" placeholder="–" value="${esc(it.kg)}"></label>
      </div>
    </div>`;
  }).join('') : '<div class="muted small" style="margin:0 2px 12px">Añade ejercicios eligiendo músculos en el mapa.</div>';

  const editorHtml = () => `
    <h2 class="sheet-title">${draft.id ? 'Editar rutina' : 'Nueva rutina'}</h2>
    <label class="field"><span>Nombre</span>
      <input id="rt-name" placeholder="Ej: Pecho y tríceps" value="${esc(draft.name)}">
    </label>
    <div class="label">Ejercicios</div>
    <div id="rt-items">${itemsHtml()}</div>
    <button class="btn secondary" id="add-ex">+ Añadir ejercicio</button>
    <div style="margin-top:20px">
      <button class="btn primary" id="save">Guardar rutina</button>
      ${draft.id ? '<button class="btn ghost danger" id="del">Borrar rutina</button>' : ''}
    </div>`;

  const mountEditor = body => {
    const redrawItems = () => { body.querySelector('#rt-items').innerHTML = itemsHtml(); };
    body.querySelector('#rt-name').addEventListener('input', e => { draft.name = e.target.value; });
    body.addEventListener('input', e => {
      const i = e.target.dataset.i;
      if (i !== undefined) draft.items[i][e.target.dataset.f] = e.target.value.trim();
    });
    body.addEventListener('click', async e => {
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
    mountLibrary(body, pickFilter, exId => {
      draft.items.push({ ex: exId, sets: 3, reps: '10', kg: '' });
      haptic();
      toast(`Añadido: ${EX[exId].name}`);
      setSheetContent(editorHtml(), mountEditor);
    }, true);
  });

  openSheet(editorHtml(), mountEditor);
}

const arrow = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
