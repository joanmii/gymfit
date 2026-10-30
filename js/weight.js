// =========================================================
// Control de peso (dentro de Nutrición): pesadas, gráfica y
// composición corporal.
// La báscula Xiaomi no se puede leer por Bluetooth desde Safari,
// así que los datos llegan de dos formas:
//   - Apple Salud → un Atajo los copia y aquí se pegan
//   - El archivo CSV que exporta Zepp Life (todo el historial)
// =========================================================
import { db } from './db.js';
import { line } from './charts.js';
import { openSheet, setSheetContent, closeSheet } from './sheet.js';
import { state, keyOf, fromKey, today, addDays, daysBetween, startOfWeek, MONTHS_SHORT, esc, r1, toast, haptic } from './utils.js';

// Datos que guarda la báscula. good: 'down' = mejor si baja, 'up' = mejor si sube
const METRICS = [
  { id: 'weight',   name: 'Peso',              short: 'Peso',     unit: 'kg',   color: 'var(--accent)', good: 'goal' },
  { id: 'fat',      name: 'Grasa corporal',    short: 'Grasa',    unit: '%',    color: '#ff375f', good: 'down' },
  { id: 'muscle',   name: 'Masa muscular',     short: 'Músculo',  unit: 'kg',   color: '#0a84ff', good: 'up' },
  { id: 'water',    name: 'Agua',              short: 'Agua',     unit: '%',    color: '#64d2ff', good: 'up' },
  { id: 'visceral', name: 'Grasa visceral',    short: 'Visceral', unit: '',     color: '#ff9f0a', good: 'down' },
  { id: 'bone',     name: 'Masa ósea',         short: 'Hueso',    unit: 'kg',   color: '#bf5af2', good: null },
  { id: 'bmr',      name: 'Metabolismo basal', short: 'Metab.',   unit: 'kcal', color: '#ffd60a', good: null },
];
const MT = Object.fromEntries(METRICS.map(m => [m.id, m]));
const COMP = METRICS.filter(m => m.id !== 'weight');

const RANGES = [{ days: 30, label: '30 días' }, { days: 90, label: '90 días' }, { days: 365, label: '1 año' }, { days: 0, label: 'Todo' }];

let host = null;       // contenedor donde se dibuja la sección
let entries = [];      // pesadas ordenadas por fecha
let range = 90;
let metric = 'weight';
let showAll = false;

// ---------- Formato ----------
const fmt = (n, d = 1) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);
const shortDate = k => { const d = fromKey(k); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };
const longDate = k => fromKey(k).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: fromKey(k).getFullYear() === today().getFullYear() ? undefined : 'numeric' });
const when = k => { const n = daysBetween(fromKey(k), today()); return n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null; };

// Verde si el cambio va en la buena dirección, rojo si no
function tone(m, delta) {
  if (!delta || Math.abs(delta) < 0.05) return '';
  let good = m.good;
  if (good === 'goal') {
    // Si empezaste por encima del objetivo, bajar es bueno (y al revés)
    const goal = state.settings.goalWeight;
    const start = entries[0]?.weight;
    good = goal > 0 && start && start !== goal ? (goal < start ? 'down' : 'up') : null;
  }
  if (!good) return '';
  return (good === 'down') === (delta < 0) ? 'good' : 'bad';
}

// Última pesada con ese dato a N días o más de la fecha dada
function valueAgo(id, fromDate, days) {
  const limit = keyOf(addDays(fromKey(fromDate), -days));
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].date <= limit && entries[i][id] != null) return entries[i][id];
  }
  return null;
}

// Ritmo en kg/semana con una recta de regresión sobre las últimas 4 semanas
function weeklyRate() {
  const last = entries.at(-1);
  const from = keyOf(addDays(fromKey(last.date), -28));
  const pts = entries.filter(e => e.date >= from && e.weight).map(e => [daysBetween(fromKey(from), fromKey(e.date)), e.weight]);
  if (pts.length < 3 || pts.at(-1)[0] - pts[0][0] < 7) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  return sxx ? (sxy / sxx) * 7 : null;
}

function bmiOf(e) {
  if (e.bmi) return e.bmi;
  const h = state.settings.height;
  return h > 0 && e.weight ? e.weight / (h / 100) ** 2 : null;
}
const bmiLabel = b => b < 18.5 ? 'bajo peso' : b < 25 ? 'normal' : b < 30 ? 'sobrepeso' : 'obesidad';

// ---------- Vista ----------
export async function renderWeight(el) {
  host = el;
  entries = (await db.allWeights()).sort((a, b) => a.date.localeCompare(b.date));
  if (!host.isConnected) return;

  if (!entries.length) {
    host.innerHTML = `
      <div class="card empty">
        <span class="e">⚖️</span>
        <b>Aún no hay pesadas</b>
        Apunta tu peso con <b style="display:inline;font-size:inherit">+</b> o tráete el historial de tu báscula.
      </div>
      <button class="btn primary" data-w="import">Importar de la báscula</button>
      <button class="btn secondary" data-w="add">Apuntar peso a mano</button>`;
    bind();
    return;
  }

  const S = state.settings;
  const last = entries.at(-1);
  const W = MT.weight;
  const d7 = valueAgo('weight', last.date, 7), d30 = valueAgo('weight', last.date, 30);
  const rate = weeklyRate();
  const bmi = bmiOf(last);

  // Progreso hacia el objetivo, contando desde la primera pesada
  let goalHtml = '';
  if (S.goalWeight > 0) {
    const start = entries[0].weight;
    const left = last.weight - S.goalWeight;
    const total = start - S.goalWeight;
    // Conseguido si estás a menos de 100 g o ya lo has pasado en la dirección buena
    const done = Math.abs(left) < 0.05 || (total !== 0 && Math.sign(total) !== Math.sign(left));
    const pct = done ? 100 : total ? Math.max(0, Math.min(100, (1 - left / total) * 100)) : 0;
    goalHtml = `
      <div class="macro" style="--c:var(--accent);margin-top:16px">
        <div class="macro-top">Objetivo ${fmt(S.goalWeight)} kg<span>${done ? '¡Conseguido! 🎉' : `te ${Math.abs(left) < 1.05 ? 'falta' : 'faltan'} <b style="color:var(--text)">${fmt(Math.abs(left))}</b> kg`}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>`;
  }

  // Gráfica del dato elegido
  const available = METRICS.filter(m => entries.some(e => e[m.id] != null));
  if (!available.some(m => m.id === metric)) metric = 'weight';
  const M = MT[metric];
  const from = range ? keyOf(addDays(today(), -(range - 1))) : '';
  let pts = entries.filter(e => e.date >= from && e[metric] != null).map(e => ({ date: e.date, value: e[metric] }));
  const weekly = pts.length > 60;
  if (weekly) pts = weeklyAverages(pts);
  const yearLabels = pts.length > 1 && daysBetween(fromKey(pts[0].date), fromKey(pts.at(-1).date)) > 120;
  const chartPts = pts.map(p => ({ label: yearLabels ? MONTHS_SHORT[fromKey(p.date).getMonth()] : shortDate(p.date), value: p.value }));

  // Composición de la última pesada que la tenga
  const lastComp = [...entries].reverse().find(e => COMP.some(m => e[m.id] != null));
  const compTiles = lastComp ? COMP.filter(m => lastComp[m.id] != null).map(m => {
    const prev = valueAgo(m.id, lastComp.date, 30);
    const delta = prev != null ? lastComp[m.id] - prev : null;
    return `<button class="w-tile ${metric === m.id ? 'on' : ''}" data-metric="${m.id}" style="--c:${m.color}">
      <span class="n">${m.name}</span>
      <b>${fmt(lastComp[m.id], m.id === 'bmr' || m.id === 'visceral' ? 0 : 1)}<small>${m.unit}</small></b>
      ${delta != null ? `<span class="delta ${tone(m, delta)}">${signed(delta, m.id === 'bmr' ? 0 : 1)} <small>30 d</small></span>` : '<span class="delta"> </span>'}
    </button>`;
  }).join('') : '';

  const list = [...entries].reverse();
  const shown = showAll ? list : list.slice(0, 10);

  host.innerHTML = `
    <div class="card">
      <div class="kpi-label">Último peso · ${when(last.date)}</div>
      <div class="w-big">${fmt(last.weight)}<small>kg</small></div>
      <div class="w-deltas">
        ${d7 != null ? `<span class="delta ${tone(W, last.weight - d7)}">${signed(last.weight - d7)} kg <small>7 días</small></span>` : ''}
        ${d30 != null ? `<span class="delta ${tone(W, last.weight - d30)}">${signed(last.weight - d30)} kg <small>30 días</small></span>` : ''}
        ${rate != null ? `<span class="delta ${tone(W, rate)}">${signed(rate, 2)} kg <small>/semana</small></span>` : ''}
        ${bmi ? `<span class="delta">IMC ${fmt(bmi)} <small>${bmiLabel(bmi)}</small></span>` : ''}
      </div>
      ${goalHtml}
    </div>

    <div class="card">
      <div class="card-head">
        <h3>${M.name}</h3>
        <select class="w-range" data-range aria-label="Periodo">
          ${RANGES.map(r => `<option value="${r.days}" ${r.days === range ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
      ${available.length > 1 ? `<div class="chips scroll" style="margin-bottom:10px">${available.map(m =>
        `<button class="chip ${m.id === metric ? 'on' : ''}" data-metric="${m.id}" style="--c:${m.color}">${m.short}</button>`).join('')}</div>` : ''}
      ${chartPts.length ? line(chartPts, { height: 170, color: M.color, unit: M.unit === '%' ? '%' : '', goal: metric === 'weight' ? S.goalWeight : null })
        : `<div class="empty" style="padding:20px 0"><b>Sin datos en este periodo</b>Prueba con un periodo más largo.</div>`}
      ${pts.length > 1 ? `<div class="muted small" style="text-align:center;margin-top:8px">${weekly ? 'Media por semana · ' : ''}${signed(pts.at(-1).value - pts[0].value, metric === 'bmr' ? 0 : 1)} ${M.unit} en el periodo</div>` : ''}
    </div>

    ${compTiles ? `
      <div class="card">
        <div class="card-head"><h3>Composición corporal</h3><span class="muted small">${esc(shortDate(lastComp.date))}</span></div>
        <div class="w-comp">${compTiles}</div>
      </div>` : ''}

    <div class="section-label">Historial</div>
    <div class="list">
      ${shown.map(e => {
        const i = entries.indexOf(e);
        const prev = i > 0 ? entries[i - 1].weight : null;
        const delta = prev != null ? e.weight - prev : null;
        return `<button class="w-row" data-entry="${e.date}">
          <span class="d">${esc(longDate(e.date))}${e.source && e.source !== 'manual' ? `<small>${e.source === 'zepp' ? 'Zepp Life' : 'Salud'}</small>` : ''}</span>
          ${e.fat != null ? `<span class="f">${fmt(e.fat)}%</span>` : ''}
          ${delta != null ? `<span class="delta ${tone(W, delta)}">${signed(delta)}</span>` : '<span class="delta"></span>'}
          <b>${fmt(e.weight)}<small> kg</small></b>
        </button>`;
      }).join('')}
    </div>
    ${list.length > 10 ? `<button class="link" data-w="all" style="display:block;margin:8px auto 0">${showAll ? 'Ver menos' : `Ver las ${list.length} pesadas`}</button>` : ''}

    <button class="btn secondary" data-w="import" style="margin-top:18px">⚖️ Importar de la báscula</button>`;
  bind();
}

function weeklyAverages(pts) {
  const groups = new Map();
  for (const p of pts) {
    const k = keyOf(startOfWeek(fromKey(p.date)));
    (groups.get(k) || groups.set(k, []).get(k)).push(p.value);
  }
  return [...groups].map(([date, v]) => ({ date, value: v.reduce((a, b) => a + b, 0) / v.length }));
}

function bind() {
  host.onclick = e => {
    const m = e.target.closest('[data-metric]');
    if (m) { metric = m.dataset.metric; return rerender(); }
    const row = e.target.closest('[data-entry]');
    if (row) return openWeighIn(entries.find(x => x.date === row.dataset.entry));
    const a = e.target.closest('[data-w]')?.dataset.w;
    if (a === 'add') openWeighIn();
    if (a === 'import') openImport();
    if (a === 'all') { showAll = !showAll; rerender(); }
  };
  host.onchange = e => {
    if (e.target.matches('[data-range]')) { range = Number(e.target.value); rerender(); }
  };
}

const rerender = () => { if (host?.isConnected) renderWeight(host); };

// ---------- Apuntar / editar una pesada ----------
export function openWeighIn(entry = null) {
  const editing = !!entry;
  const e = entry ? { ...entry } : { date: keyOf(today()), weight: entries.at(-1)?.weight ?? '' };
  const field = (m, step = '0.1') => `
    <label>${m.short}${m.unit ? ` (${m.unit})` : ''}
      <input data-m="${m.id}" type="number" inputmode="decimal" step="${step}" min="0" value="${e[m.id] ?? ''}">
    </label>`;

  openSheet(`
    <h2 class="sheet-title">${editing ? 'Editar pesada' : 'Apuntar peso'}</h2>
    <label class="field"><span>Fecha</span><input id="wdate" type="date" max="${keyOf(today())}" value="${e.date}"></label>
    <label class="field"><span>Peso (kg)</span>
      <input id="wkg" class="w-input" type="number" inputmode="decimal" step="0.1" min="0" value="${e.weight ?? ''}" placeholder="0,0">
    </label>
    <details class="w-more" ${COMP.some(m => e[m.id] != null) ? 'open' : ''}>
      <summary>Composición corporal (opcional)</summary>
      <div class="item-grid w-grid">
        ${field(MT.fat)}${field(MT.muscle)}${field(MT.water)}
        ${field(MT.visceral, '1')}${field(MT.bone)}${field(MT.bmr, '1')}
      </div>
      <div class="muted small" style="margin-top:8px">Los ves en Zepp Life al pesarte, en el informe de la báscula.</div>
    </details>
    ${editing ? '<button class="btn ghost danger" id="wdel" style="margin-top:10px">Borrar pesada</button>' : ''}
    <button class="btn primary" id="wsave" style="margin-top:16px">Guardar</button>`, body => {
    const kg = body.querySelector('#wkg');
    if (!editing) setTimeout(() => { kg.focus(); kg.select?.(); }, 350);

    body.querySelector('#wdel')?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta pesada?')) return;
      await db.deleteWeight(entry.date);
      closeSheet();
      rerender();
      toast('Pesada borrada');
    });

    body.querySelector('#wsave').addEventListener('click', async () => {
      const date = body.querySelector('#wdate').value;
      const weight = num(kg.value);
      if (!date) return toast('Elige una fecha');
      if (!(weight >= 20 && weight <= 400)) return toast('Escribe un peso válido');
      const rec = { ...e, date, weight: r1(weight), source: e.source || 'manual', time: e.time || Date.now() };
      body.querySelectorAll('[data-m]').forEach(inp => {
        const v = num(inp.value);
        if (v != null && v > 0) rec[inp.dataset.m] = r1(v); else delete rec[inp.dataset.m];
      });
      const existing = !editing || date !== entry.date ? entries.find(x => x.date === date) : null;
      if (existing && !confirm(`Ya hay una pesada el ${longDate(date)} (${fmt(existing.weight)} kg). ¿Sustituirla?`)) return;
      if (editing && date !== entry.date) await db.deleteWeight(entry.date);
      await db.putWeight(rec);
      haptic();
      closeSheet();
      rerender();
      toast(editing ? 'Pesada actualizada' : 'Peso guardado ⚖️');
    });
  });
}

// ---------- Importar de la báscula ----------
function openImport() {
  openSheet(`
    <h2 class="sheet-title">Importar de la báscula</h2>
    <div class="muted small" style="line-height:1.45">
      Tu Mi Body Composition Scale 2 guarda las pesadas en <b>Zepp Life</b>. Safari no deja a las webs usar Bluetooth,
      así que GymFit no puede hablar con la báscula directamente, pero sí traerse los datos de dos formas:
    </div>
    <div class="action-list">
      <button class="action" data-i="health" style="--c:color-mix(in srgb,var(--pink) 28%,transparent)"><span class="e">❤️</span><div>Desde Apple Salud<small>Con un Atajo · lo más cómodo para el día a día</small></div></button>
      <button class="action" data-i="csv" style="--c:color-mix(in srgb,var(--blue) 28%,transparent)"><span class="e">📄</span><div>Archivo de Zepp Life<small>Todo tu historial con composición corporal</small></div></button>
      <button class="action" data-i="man" style="--c:color-mix(in srgb,var(--muted) 22%,transparent)"><span class="e">✍️</span><div>Apuntar a mano<small>Copias el número de la báscula</small></div></button>
    </div>`, body => {
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-i]')?.dataset.i;
      if (a === 'health') openHealthImport();
      if (a === 'csv') openCsvImport();
      if (a === 'man') openWeighIn();
    });
  });
}

function openHealthImport() {
  setSheetContent(`
    <h2 class="sheet-title">Desde Apple Salud</h2>
    <details class="w-more" ${localFlag('shortcut') ? '' : 'open'}>
      <summary>Preparar el Atajo (solo la primera vez)</summary>
      <ol class="steps" style="margin-top:10px">
        <li>En <b>Zepp Life</b> conecta Apple Salud (Perfil → Añadir cuentas → Apple Salud) y permite escribir <b>Peso</b> y <b>Grasa corporal</b>.</li>
        <li>Abre la app <b>Atajos</b> → <b>+</b> y añade <b>Buscar muestras de salud</b>: tipo <b>Peso</b>, ordenar por <b>Fecha de inicio</b>, <b>Más reciente primero</b>, límite <b>90</b>.</li>
        <li>Añade <b>Repetir con cada</b>. Dentro pon un <b>Texto</b> con: <code>Elemento de repetición → Fecha de inicio</code> (formato <b>ISO 8601</b>), un <code>;</code> y <code>Elemento de repetición → Valor</code>.</li>
        <li>Debajo de “Fin de repetición” añade <b>Copiar al portapapeles</b>.</li>
        <li>Opcional, para la grasa: repite los pasos 2–3 con tipo <b>Porcentaje de grasa corporal</b> y escribe <code>grasa;</code> al principio del Texto. Junta los dos resultados en un Texto antes de copiar.</li>
        <li>Llámalo “Peso a GymFit”. Ejecútalo, vuelve aquí y pulsa <b>Pegar</b>.</li>
      </ol>
      <div class="muted small" style="margin-top:8px">Cada línea copiada se parece a <code>2026-10-30T08:12:00+01:00;72,4</code>.</div>
    </details>
    <button class="btn primary" id="paste" style="margin-top:16px">📋 Pegar del portapapeles</button>
    <label class="field"><span>…o pega aquí el texto</span>
      <textarea id="ptext" rows="4" placeholder="2026-10-30T08:12:00+01:00;72,4"></textarea>
    </label>
    <button class="btn secondary" id="read" style="margin-top:10px">Leer texto</button>`, body => {
    const ta = body.querySelector('#ptext');
    body.querySelector('#paste').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) return toast('El portapapeles está vacío: ejecuta antes el Atajo');
        localFlag('shortcut', true);
        showPreview(parseWeights(text), 'salud', openHealthImport);
      } catch {
        toast('No he podido leer el portapapeles: pégalo en el cuadro');
        ta.focus();
      }
    });
    body.querySelector('#read').addEventListener('click', () => {
      if (!ta.value.trim()) return toast('Pega antes el texto');
      showPreview(parseWeights(ta.value), 'salud', openHealthImport);
    });
  });
}

function openCsvImport() {
  setSheetContent(`
    <h2 class="sheet-title">Archivo de Zepp Life</h2>
    <ol class="steps">
      <li>En Zepp Life busca <b>Exportar datos</b> (Perfil → Ajustes → Cuenta, o Privacidad, según la versión). Te llega un enlace por correo.</li>
      <li>Descarga el ZIP en <b>Archivos</b> y tócalo para descomprimirlo.</li>
      <li>Dentro, en la carpeta <b>BODY</b>, está el archivo <code>BODY_….csv</code> con todas tus pesadas.</li>
    </ol>
    <div class="muted small" style="margin-top:10px">También vale cualquier CSV con una columna de fecha y otra de peso.</div>
    <input id="csvfile" type="file" accept=".csv,text/csv,text/plain,text/comma-separated-values" hidden>
    <button class="btn primary" id="pick" style="margin-top:16px">Elegir archivo CSV</button>`, body => {
    const inp = body.querySelector('#csvfile');
    body.querySelector('#pick').addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try { showPreview(parseWeights(await file.text()), 'zepp', openCsvImport); }
      catch { toast('No he podido leer el archivo'); }
    });
  });
}

// Recuerda pequeñas cosas en este iPhone (p. ej. si ya preparaste el Atajo)
function localFlag(name, set) {
  const k = `gymfit-w-${name}`;
  try {
    if (set !== undefined) localStorage.setItem(k, '1');
    return localStorage.getItem(k) === '1';
  } catch { return false; }
}

// Combina lo leído con lo que ya hay: cuenta nuevas y actualizadas
function plan(recs, source) {
  const byDate = new Map(entries.map(e => [e.date, e]));
  const out = [];
  let added = 0, updated = 0;
  for (const r of recs) {
    const old = byDate.get(r.date);
    if (!old && !r.weight) continue;            // grasa sin peso de ese día: no sirve sola
    const merged = { ...(old || {}), ...r, source: old?.source === 'manual' && !r.weight ? 'manual' : source };
    if (old && METRICS.every(m => old[m.id] === merged[m.id])) continue;
    old ? updated++ : added++;
    out.push(merged);
  }
  return { list: out, added, updated };
}

function showPreview(recs, source, back) {
  const p = plan(recs, source);
  if (!recs.length || !p.list.length) {
    return setSheetContent(`
      <h2 class="sheet-title">${recs.length ? 'Ya estaba todo' : 'No he encontrado pesadas'}</h2>
      <div class="notice ${recs.length ? '' : 'err'}">${recs.length
        ? `Las ${recs.length} pesadas leídas ya están en GymFit.`
        : 'Revisa que cada línea tenga una fecha y un peso, por ejemplo <code>2026-10-30;72,4</code>.'}</div>
      <button class="btn secondary" id="back" style="margin-top:16px">Volver</button>`, body =>
      body.querySelector('#back').addEventListener('click', back));
  }
  const sorted = [...p.list].sort((a, b) => a.date.localeCompare(b.date));
  const withComp = sorted.filter(r => COMP.some(m => r[m.id] != null)).length;
  setSheetContent(`
    <h2 class="sheet-title">Importar ${sorted.length} ${sorted.length === 1 ? 'pesada' : 'pesadas'}</h2>
    <div class="muted small">${sorted.length > 1 ? `Del ${esc(longDate(sorted[0].date))} al ${esc(longDate(sorted.at(-1).date))}` : esc(longDate(sorted[0].date))}</div>
    <div class="totals-row three" style="margin:16px 0 4px">
      <div><b>${p.added}</b><span>nuevas</span></div>
      <div><b>${p.updated}</b><span>actualizadas</span></div>
      <div><b>${withComp}</b><span>con composición</span></div>
    </div>
    <div class="list" style="margin-top:12px">
      ${[...sorted].reverse().slice(0, 5).map(r => `<div class="w-row"><span class="d">${esc(longDate(r.date))}</span>${r.fat != null ? `<span class="f">${fmt(r.fat)}%</span>` : ''}<b>${r.weight ? fmt(r.weight) : '—'}<small> kg</small></b></div>`).join('')}
    </div>
    ${sorted.length > 5 ? `<div class="muted small" style="text-align:center;margin-top:8px">y ${sorted.length - 5} más</div>` : ''}
    <button class="btn primary" id="go" style="margin-top:18px">Importar</button>
    <button class="btn secondary" id="back">Cancelar</button>`, body => {
    body.querySelector('#back').addEventListener('click', back);
    body.querySelector('#go').addEventListener('click', async () => {
      await db.putWeights(p.list);
      haptic();
      closeSheet();
      rerender();
      toast(`${p.list.length} ${p.list.length === 1 ? 'pesada importada' : 'pesadas importadas'} ✅`);
    });
  });
}

// ---------- Leer texto del Atajo o CSV ----------
// Devuelve una pesada por día: [{ date, time, weight, fat, ... }]
export function parseWeights(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].toLowerCase();
  const samples = /time|date|fecha/.test(head) && /weight|peso/.test(head) ? fromCsv(lines) : fromLines(lines);

  // Si hay varias del mismo día gana la más reciente
  samples.sort((a, b) => a.ts - b.ts);
  const days = new Map();
  for (const s of samples) {
    const d = days.get(s.date) || days.set(s.date, { date: s.date }).get(s.date);
    d[s.metric] = r1(s.value);
    d.time = Math.max(d.time || 0, s.ts);
  }
  return [...days.values()];
}

// Columnas del CSV de Zepp Life (time, weight, fatRate, bodyWaterRate, muscleRate, visceralFat, boneMass, metabolism, bmi)
const CSV_COLS = [
  ['visceral', /visceral/], ['fat', /fat|grasa/], ['water', /water|agua/], ['muscle', /muscle|m[uú]sc/],
  ['bone', /bone|hueso|[oó]sea/], ['bmr', /metabol|bmr|basal/], ['bmi', /bmi|imc/], ['weight', /weight|peso/],
];

function fromCsv(lines) {
  const sep = [';', '\t', ','].find(c => lines[0].includes(c)) || ',';
  const split = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map(h => h.toLowerCase());
  const dateCol = head.findIndex(h => /time|date|fecha/.test(h));
  const cols = [];
  const used = new Set();
  head.forEach((h, i) => {
    if (i === dateCol || /height|altura|impedance/.test(h)) return;
    const hit = CSV_COLS.find(([id, re]) => !used.has(id) && re.test(h));
    if (hit) { used.add(hit[0]); cols.push([hit[0], i]); }
  });
  const out = [];
  for (const l of lines.slice(1)) {
    const cells = split(l);
    const st = parseStamp(cells[dateCol] || '');
    if (!st) continue;
    for (const [id, i] of cols) {
      const v = clean(id, num(cells[i]));
      if (v != null) out.push({ date: st.date, ts: st.ts, metric: id, value: v });
    }
  }
  return out;
}

// Líneas sueltas: "fecha;peso", "fecha;peso;grasa" o "grasa;fecha;valor"
function fromLines(lines) {
  const out = [];
  for (const l of lines) {
    const st = parseStamp(l);
    if (!st) continue;
    const rest = st.rest.replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ');
    const nums = [...rest.matchAll(/\d+(?:[.,]\d+)?/g)].map(x => num(x[0]));
    if (!nums.length) continue;
    const low = rest.toLowerCase();
    const tag = /visceral/.test(low) ? 'visceral' : /grasa|fat|%/.test(low) ? 'fat' : /m[uú]sc|muscle/.test(low) ? 'muscle'
      : /agua|water/.test(low) ? 'water' : /imc|bmi/.test(low) ? 'bmi' : null;
    const pairs = tag ? [[tag, nums[0]]] : [['weight', nums[0]], ['fat', nums[1]]];
    for (const [id, raw] of pairs) {
      const v = clean(id, raw);
      if (v != null) out.push({ date: st.date, ts: st.ts, metric: id, value: v });
    }
  }
  return out;
}

// Descarta valores imposibles (y ceros, que Zepp usa para "sin dato")
function clean(id, v) {
  if (v == null || !(v > 0)) return null;
  if (id === 'fat' || id === 'water') { if (v < 1) v *= 100; return v >= 2 && v <= 80 ? v : null; }
  if (id === 'weight') return v >= 20 && v <= 400 ? v : null;
  return v;
}

const MONTH_RE = 'ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|apr|aug|dec';
const MONTH_IDX = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
const pad2 = n => String(n).padStart(2, '0');

// Busca una fecha en el texto. Devuelve { date: 'YYYY-MM-DD' local, ts, rest: texto sin la fecha }
function parseStamp(s) {
  let d = null, m;
  if (/^\d{10,13}$/.test(s.trim())) {
    // Marca de tiempo Unix (segundos o milisegundos)
    d = new Date(s.trim().length === 13 ? +s : s * 1000);
    m = [s];
  } else if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/))) {
    if (m[7]) {
      const tz = m[7] === 'Z' ? 'Z' : m[7].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
      d = new Date(`${m[1]}-${pad2(m[2])}-${pad2(m[3])}T${pad2(m[4])}:${m[5]}:${m[6] || '00'}${tz}`);
    } else {
      d = new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
  } else if ((m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s*(\d{1,2}):(\d{2}))?/))) {
    d = new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  } else if ((m = s.match(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_RE})[a-z.]*\\s+(?:de\\s+)?(\\d{4})(?:,?\\s*(\\d{1,2}):(\\d{2}))?`, 'i')))) {
    d = new Date(+m[3], MONTH_IDX[m[2].toLowerCase()], +m[1], +(m[4] || 0), +(m[5] || 0));
  }
  if (!d || isNaN(d) || d.getFullYear() < 2000 || d > addDays(today(), 1)) return null;
  return { date: keyOf(d), ts: +d, rest: s.replace(m[0], ' ') };
}
