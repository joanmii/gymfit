// =========================================================
// Pestaña Ajustes
// =========================================================
import { db } from './db.js';
import { testConnection } from './api.js';
import { state, saveSettings, esc, toast } from './utils.js';

let root;
const APP_VERSION = '1.2.0';

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
      <label class="field"><span>Modelo</span>
        <input data-k="${isGemini ? 'geminiModel' : 'model'}" autocapitalize="off" spellcheck="false" value="${esc(isGemini ? S.geminiModel : S.model)}">
      </label>
      <button class="btn secondary" id="test" style="margin-top:14px">Probar conexión</button>
      <div class="muted small" style="margin-top:12px;line-height:1.45">
        ${isGemini
          ? `Gratis y sin tarjeta: entra en aistudio.google.com con tu cuenta de Google → <b>Get API key</b> → <b>Create API key</b>.
             El nivel gratuito tiene un límite diario de peticiones de sobra para tus comidas. Google puede usar las fotos del nivel gratuito para mejorar sus productos.`
          : `Consigue tu clave en console.anthropic.com → API Keys. Cada foto cuesta céntimos; pon un límite de gasto en la consola.`}
        La clave se guarda solo en este iPhone.
      </div>
    </div>

    <div class="section-label">Tus datos</div>
    <div class="card">
      <button class="btn secondary" id="export">⬇️ Exportar copia de seguridad</button>
      <button class="btn secondary" id="import">⬆️ Importar copia de seguridad</button>
      <button class="btn ghost danger" id="wipe">Borrar todos los datos</button>
      <div class="muted small" style="margin-top:8px;line-height:1.45">
        Tus datos viven en este iPhone. Haz una copia de vez en cuando por si borras los datos de Safari o cambias de móvil.
      </div>
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

    <div class="about">GymFit ${APP_VERSION} · hecho con 💚</div>`;
}

// ---------- Copia de seguridad ----------
async function exportData() {
  const { apiKey, geminiKey, ...settings } = state.settings;   // las claves no se exportan
  const data = {
    app: 'gymfit', version: 1, exportedAt: new Date().toISOString(),
    settings,
    workouts: await db.allWorkouts(),
    meals: await db.allMeals(),
    routines: await db.allRoutines(),
    sessions: await db.allSessions(),
    weights: await db.allWeights(),
  };
  const name = `gymfit-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  // En iPhone, el menú Compartir permite guardarlo en Archivos o enviarlo
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de GymFit' }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'gymfit') throw new Error('formato');
    if (!confirm(`Importar ${data.workouts?.length || 0} días, ${data.sessions?.length || 0} entrenos registrados, ${data.routines?.length || 0} rutinas, ${data.meals?.length || 0} comidas y ${data.weights?.length || 0} pesadas? Se combinarán con los datos actuales.`)) return;
    for (const w of data.workouts || []) { await db.putWorkout(w); state.workouts.set(w.date, w); }
    for (const m of data.meals || []) await db.putMeal(m);
    for (const r of data.routines || []) await db.putRoutine(r);
    state.routines = await db.allRoutines();
    for (const x of data.sessions || []) await db.putSession(x);
    state.sessions = await db.allSessions();
    if (data.weights?.length) await db.putWeights(data.weights);
    if (data.settings) { Object.assign(state.settings, data.settings); saveSettings(); }
    renderSettings();
    toast('Copia importada ✅');
  } catch {
    toast('El archivo no es una copia válida de GymFit');
  }
}
