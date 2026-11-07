// =========================================================
// Pestaña Ajustes
// =========================================================
import { db } from './db.js';
import { testConnection, testGroq } from './api.js';
import { state, saveSettings, esc, toast, backupDue } from './utils.js';
import { bodyKg, hasBodyWeight } from './energy.js';
import { openSheet, closeSheet } from './sheet.js';

let root;
const APP_VERSION = '1.3.0';

export function initSettings(el) {
  root = el;

  root.addEventListener('change', e => {
    const k = e.target.dataset.k;
    if (!k) return;
    if (e.target.type === 'number') {
      const v = e.target.step === '0.1' ? Math.round(parseFloat(e.target.value) * 10) / 10 : parseInt(e.target.value, 10);
      if (!(v >= 0)) { e.target.value = state.settings[k]; return; }
      state.settings[k] = v;
    } else {
      state.settings[k] = e.target.value.trim();
    }
    saveSettings();
    toast('Guardado');
  });

  root.addEventListener('click', async e => {
    if (e.target.closest('#eye')) {
      const inp = root.querySelector('#apikey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    }
    const prov = e.target.closest('[data-provider]');
    if (prov) {
      state.settings.provider = prov.dataset.provider;
      saveSettings();
      renderSettings();
      return;
    }
    if (e.target.closest('#test')) {
      const btn = e.target.closest('#test');
      btn.disabled = true; btn.textContent = 'Probando…';
      try { await testConnection(); toast('✅ Conexión correcta'); }
      catch (err) { toast(`❌ ${err.message}`); }
      btn.disabled = false; btn.textContent = 'Probar conexión';
    }
    if (e.target.closest('#test-groq')) {
      const btn = e.target.closest('#test-groq');
      btn.disabled = true; btn.textContent = 'Probando…';
      try { await testGroq(); toast('✅ Groq conectado'); }
      catch (err) { toast(`❌ ${err.message}`); }
      btn.disabled = false; btn.textContent = 'Probar Groq';
    }
    if (e.target.closest('#eye-groq')) {
      const inp = root.querySelector('#groqkey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    }
    if (e.target.closest('#info')) return openInfo();
    if (e.target.closest('#calc')) return openGoalCalc();
    if (e.target.closest('#export')) exportData();
    if (e.target.closest('#import')) document.getElementById('import-input').click();
    if (e.target.closest('#wipe')) {
      if (!confirm('¿Seguro que quieres borrar TODOS tus entrenos, rutinas, comidas y pesadas? No se puede deshacer.')) return;
      await db.clearAll();
      state.workouts.clear();
      state.routines = [];
      state.sessions = [];
      try { localStorage.removeItem('gymfit-active'); } catch { /* nada */ }
      toast('Datos borrados');
    }
  });

  document.getElementById('import-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) importData(file);
  });
}

export function renderSettings() {
  const S = state.settings;
  const row = (k, label, unit, dec = false) => `
    <div class="list-row"><label for="s-${k}">${label}</label>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="s-${k}" data-k="${k}" type="number" inputmode="${dec ? 'decimal' : 'numeric'}" ${dec ? 'step="0.1"' : ''} min="0" value="${S[k] || ''}" placeholder="—">
        <span class="unit">${unit}</span>
      </div>
    </div>`;
  const isGemini = S.provider !== 'claude';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  root.innerHTML = `
    <h1 class="title">Ajustes</h1>
    <button class="card info-btn" id="info">
      <span class="e">ℹ️</span>
      <span class="t"><b>Información</b></span>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>

    <div class="section-label">Gimnasio</div>
    <div class="list">
      ${row('weeklyTarget', 'Objetivo semanal', 'días')}
      ${row('rest', 'Descanso entre series', 's')}
    </div>

    <div class="section-label">Objetivos diarios de nutrición</div>
    <div class="list">
      ${row('kcal', 'Calorías', 'kcal')}
      ${row('protein', 'Proteína', 'g')}
      ${row('carbs', 'Hidratos', 'g')}
      ${row('fat', 'Grasa', 'g')}
    </div>
    <button class="btn secondary" id="calc" style="margin-top:10px">🧮 Calcular mis objetivos</button>

    <div class="section-label">Actividad</div>
    <div class="list">
      ${row('stepsGoal', 'Objetivo de pasos diarios', 'pasos')}
      ${row('waterGoal', 'Objetivo de agua', 'vasos')}
    </div>

    <div class="section-label">Peso</div>
    <div class="list">
      ${row('goalWeight', 'Peso objetivo', 'kg', true)}
      ${row('height', 'Altura (para el IMC)', 'cm')}
    </div>

    <div class="section-label">Inteligencia artificial</div>
    <div class="card">
      <div class="seg" style="margin-bottom:6px">
        <button data-provider="gemini" class="${isGemini ? 'on' : ''}">Gemini · gratis</button>
        <button data-provider="claude" class="${isGemini ? '' : 'on'}">Claude · de pago</button>
      </div>
      <label class="field"><span>${isGemini ? 'Clave de la API de Gemini' : 'Clave de la API de Claude'}</span>
        <div class="input-wrap">
          <input id="apikey" data-k="${isGemini ? 'geminiKey' : 'apiKey'}" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${isGemini ? 'AIza...' : 'sk-ant-...'}" value="${esc(isGemini ? S.geminiKey : S.apiKey)}">
          <button class="icon-btn" id="eye" aria-label="Mostrar u ocultar clave">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </label>
      <label class="field"><span>${isGemini ? 'Modelo para fotos' : 'Modelo'}</span>
        <input data-k="${isGemini ? 'geminiModel' : 'model'}" autocapitalize="off" spellcheck="false" value="${esc(isGemini ? S.geminiModel : S.model)}">
      </label>
      ${isGemini ? `<label class="field"><span>Modelo para texto y recetas</span>
        <input data-k="geminiTextModel" autocapitalize="off" spellcheck="false" value="${esc(S.geminiTextModel)}">
      </label>` : ''}
      <button class="btn secondary" id="test" style="margin-top:14px">Probar conexión</button>
      <div class="muted small" style="margin-top:12px">
        ${isGemini ? 'Gratis en aistudio.google.com → <b>Get API key</b>.' : 'De pago en console.anthropic.com → <b>API Keys</b>.'}
      </div>
    </div>

    <div class="section-label">Texto y recetas · opcional</div>
    <div class="card">
      <label class="field" style="margin-top:0"><span>Clave de Groq</span>
        <div class="input-wrap">
          <input id="groqkey" data-k="groqKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gsk_..." value="${esc(S.groqKey)}">
          <button class="icon-btn" id="eye-groq" aria-label="Mostrar u ocultar clave">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </label>
      <label class="field"><span>Modelo de Groq</span>
        <input data-k="groqModel" autocapitalize="off" spellcheck="false" value="${esc(S.groqModel)}">
      </label>
      <button class="btn secondary" id="test-groq" style="margin-top:14px">Probar Groq</button>
      <div class="muted small" style="margin-top:12px">Gratis en console.groq.com → <b>API Keys</b>. Se usa para texto y recetas.</div>
    </div>

    <div class="section-label">Tus datos</div>
    <div class="card">
      <button class="btn secondary" id="export">⬇️ Exportar copia de seguridad</button>
      <button class="btn secondary" id="import">⬆️ Importar copia de seguridad</button>
      <button class="btn ghost danger" id="wipe">Borrar todos los datos</button>
      <div class="muted small" style="margin-top:8px">${backupAgo()}</div>
    </div>

    ${standalone ? '' : `
    <div class="section-label">Instalar en el iPhone</div>
    <div class="card">
      <ol class="steps">
        <li>Abre esta página en <b>Safari</b>.</li>
        <li>Pulsa el botón <b>Compartir</b> (cuadrado con flecha).</li>
        <li>Elige <b>Añadir a pantalla de inicio</b>.</li>
        <li>Abre GymFit desde el nuevo icono.</li>
      </ol>
    </div>`}

    <div class="about">GymFit ${APP_VERSION}</div>`;
}

// ---------- Copia de seguridad ----------
async function exportData() {
  const { apiKey, geminiKey, groqKey, ...settings } = state.settings;   // las claves no se exportan
  const data = {
    app: 'gymfit', version: 1, exportedAt: new Date().toISOString(),
    settings,
    workouts: await db.allWorkouts(),
    meals: await db.allMeals(),
    routines: await db.allRoutines(),
    sessions: await db.allSessions(),
    weights: await db.allWeights(),
    activity: await db.allActivity(),
    favorites: await db.allFavorites(),
    foodFavs: await db.allFoodFavs(),
    myFoods: await db.allMyFoods(),
  };
  const name = `gymfit-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  // En iPhone, el menú Compartir permite guardarlo en Archivos o enviarlo
  const done = () => {
    state.settings.lastBackup = Date.now();
    saveSettings();
    document.querySelector('.tab[data-tab="settings"]')?.classList.remove('dot');
    renderSettings();
  };
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de GymFit' }); return done(); }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  done();
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'gymfit') throw new Error('formato');
    if (!confirm(`Importar ${data.workouts?.length || 0} días, ${data.sessions?.length || 0} entrenos registrados, ${data.routines?.length || 0} rutinas, ${data.meals?.length || 0} comidas, ${data.weights?.length || 0} pesadas y ${(data.favorites?.length || 0) + (data.foodFavs?.length || 0)} favoritos? Se combinarán con los datos actuales.`)) return;
    for (const w of data.workouts || []) { await db.putWorkout(w); state.workouts.set(w.date, w); }
    for (const m of data.meals || []) await db.putMeal(m);
    for (const r of data.routines || []) await db.putRoutine(r);
    state.routines = await db.allRoutines();
    for (const x of data.sessions || []) await db.putSession(x);
    state.sessions = await db.allSessions();
    if (data.weights?.length) await db.putWeights(data.weights);
    for (const a of data.activity || []) await db.putActivity(a);
    for (const f of data.favorites || []) await db.putFavorite(f);
    for (const f of data.foodFavs || []) await db.putFoodFav(f);
    for (const f of data.myFoods || []) await db.putMyFood(f);
    for (const { id, ...r } of data.recipes || []) await db.putFavorite({ ...r, custom: true });   // copias antiguas
    if (data.settings) { Object.assign(state.settings, data.settings); saveSettings(); }
    renderSettings();
    toast('Copia importada ✅');
  } catch {
    toast('El archivo no es una copia válida de GymFit');
  }
}

// ---------- Información: qué se puede hacer en la app ----------
const INFO = [
  ['📅', 'Calendario', 'var(--accent)', [
    'Toca un día para marcar si entrenaste y qué grupos trabajaste.',
    'En Cardio eliges el deporte: correr, bici, fútbol, natación…',
    'Los colores del anillo de cada día son los grupos musculares.',
  ]],
  ['🏋️', 'Rutinas y ejercicios', 'var(--blue)', [
    'Crea rutinas a mano, desde plantillas o automáticas según tu tiempo y material.',
    'Cada ejercicio tiene su animación, los músculos que trabaja y cómo se hace.',
    'Toca el nombre de un ejercicio para ver su ficha en cualquier momento.',
  ]],
  ['⏱️', 'Entrenar', 'var(--orange)', [
    'Pulsa Empezar entreno y marca cada serie con ✓: el descanso se cuenta solo.',
    'Ves lo que levantaste la última vez y tus récords.',
    'Entrenamiento libre con series libres y cardio en minutos.',
  ]],
  ['📊', 'Estadísticas', 'var(--purple)', [
    'Días entrenados, asistencia, rachas y grupos más trabajados.',
    'Evolución de tus pasos y del peso en cada ejercicio.',
  ]],
  ['🍽️', 'Comidas', 'var(--pink)', [
    'Apunta lo que comes con una foto, describiéndolo por voz o texto, o con el código de barras.',
    'Introducir a mano: elige platos y alimentos y ajusta las cantidades con − y +.',
    'El anillo de calorías se pone verde, amarillo o rojo según lo cerca que estés de tu objetivo.',
  ]],
  ['🥚', 'Alimentos', 'var(--yellow)', [
    'Consulta los macros de cada alimento y guarda tus favoritos.',
    'Añade tus propios alimentos o escanéalos, con su categoría y su ración.',
    'Busca productos de Mercadona, Consum, Lidl… en internet.',
  ]],
  ['📖', 'Recetas', 'var(--accent)', [
    'Recetas listas para apuntar como comida con un toque.',
    'Crea las tuyas a mano o con IA: escribe lo que te apetece o elige alimentos, con qué cocinar y cuánto tiempo tienes.',
    'Guarda las que más uses en ⭐ Mis recetas y elige en qué comidas te las propone.',
  ]],
  ['⚖️', 'Peso y actividad', 'var(--blue)', [
    'Apunta tu peso o lee la captura de Zepp Life y se rellena sola.',
    'Pasos del día con su objetivo y el gasto de calorías estimado.',
  ]],
  ['🔒', 'Tus datos', 'var(--muted)', [
    'Todo se guarda solo en este iPhone. Haz copias de seguridad desde Ajustes.',
    'La IA (Gemini, Claude o Groq) solo recibe lo que le pides analizar.',
  ]],
];

function openInfo() { openSheet(infoHtml()); }

export function infoHtml() {
  return `
    <div class="info-hero">
      <img src="icons/icon-192.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'e', textContent: '💪' }))">
      <h2 class="sheet-title">GymFit</h2>
    </div>
    ${INFO.map(([e, title, c, lines]) => `
      <div class="card info-card" style="--c:${c}">
        <div class="info-head"><span class="e">${e}</span><b>${title}</b></div>
        <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>
      </div>`).join('')}`;
}

// ---------- Copia de seguridad: cuándo fue la última ----------
function backupAgo() {
  const t = state.settings.lastBackup;
  if (!t) return backupDue() ? '<span class="due">⚠️ Aún no has hecho ninguna copia</span>' : 'Aún no has hecho ninguna copia';
  const d = Math.floor((Date.now() - t) / 86400000);
  const txt = `Última copia: ${d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`}`;
  return backupDue() ? `<span class="due">⚠️ ${txt}</span>` : txt;
}

// ---------- Calcular objetivos (Mifflin-St Jeor + actividad + meta) ----------
const ACTIVITY = [[1.2, 'Poca'], [1.375, 'Ligera'], [1.55, 'Media'], [1.725, 'Alta']];
const GOALS = [['lose', 'Perder', -400], ['keep', 'Mantener', 0], ['gain', 'Ganar', 300]];

function calcGoals(c) {
  const bmr = 10 * c.weight + 6.25 * c.height - 5 * c.age + (c.sex === 'm' ? -161 : 5);
  const kcal = Math.round((bmr * c.act + GOALS.find(g => g[0] === c.goal)[2]) / 10) * 10;
  const protein = Math.round(c.weight * (c.goal === 'lose' ? 2.2 : 2) / 5) * 5;
  const fat = Math.round(c.weight * 0.9 / 5) * 5;
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);
  return { kcal, protein, carbs, fat };
}

function openGoalCalc() {
  const S = state.settings;
  const c = {
    sex: S.sex || 'h', age: S.age || '', height: S.height || '', weight: hasBodyWeight() ? Math.round(bodyKg() * 10) / 10 : '',
    act: S.activity || 1.55, goal: S.goal || 'keep',
  };
  const chips = (list, cur, attr) => list.map(([v, label]) => `<button class="chip ${v === cur ? 'on' : ''}" ${attr}="${v}" style="--c:var(--accent)">${label}</button>`).join('');
  openSheet(`
    <h2 class="sheet-title">🧮 Calcular objetivos</h2>
    <div class="chips">${chips([['h', 'Hombre'], ['m', 'Mujer']], c.sex, 'data-sex')}</div>
    <div class="card item" style="margin-top:12px"><div class="item-grid three">
      <label>Edad<input data-c="age" type="number" inputmode="numeric" min="10" value="${c.age}"></label>
      <label>Altura (cm)<input data-c="height" type="number" inputmode="numeric" min="100" value="${c.height}"></label>
      <label>Peso (kg)<input data-c="weight" type="number" inputmode="decimal" step="0.1" min="30" value="${c.weight}"></label>
    </div></div>
    <div class="label">Actividad</div>
    <div class="chips">${chips(ACTIVITY, c.act, 'data-act')}</div>
    <div class="label">Objetivo</div>
    <div class="chips">${chips(GOALS, c.goal, 'data-goal')}</div>
    <div class="card" style="margin-top:14px"><div class="totals-row" id="calc-res"></div></div>
    <button class="btn primary" id="apply" style="margin-top:16px" disabled>Aplicar</button>`, body => {
    const res = body.querySelector('#calc-res'), apply = body.querySelector('#apply');
    let out = null;
    const paint = () => {
      const ok = c.age > 0 && c.height > 0 && c.weight > 0;
      out = ok ? calcGoals(c) : null;
      apply.disabled = !ok;
      res.innerHTML = out ? `
        <div><b>${out.kcal}</b><span>kcal</span></div>
        <div><b class="p-c">${out.protein}g</b><span>proteína</span></div>
        <div><b class="c-c">${out.carbs}g</b><span>hidratos</span></div>
        <div><b class="f-c">${out.fat}g</b><span>grasa</span></div>` : '<div class="muted small" style="grid-column:1/-1;text-align:center">Rellena edad, altura y peso</div>';
    };
    paint();
    body.addEventListener('input', e => {
      const k = e.target.dataset.c;
      if (k) { c[k] = parseFloat(String(e.target.value).replace(',', '.')) || ''; paint(); }
    });
    body.addEventListener('click', e => {
      for (const [attr, key, parse] of [['data-sex', 'sex', String], ['data-act', 'act', Number], ['data-goal', 'goal', String]]) {
        const b = e.target.closest(`[${attr}]`);
        if (b) {
          c[key] = parse(b.getAttribute(attr));
          body.querySelectorAll(`[${attr}]`).forEach(x => x.classList.toggle('on', x === b));
          return paint();
        }
      }
      if (e.target.closest('#apply') && out) {
        Object.assign(S, out, { sex: c.sex, age: c.age, height: c.height, activity: c.act, goal: c.goal });
        saveSettings();
        closeSheet();
        renderSettings();
        toast('Objetivos actualizados 🎯');
      }
    });
  });
}
