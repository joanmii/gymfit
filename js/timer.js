// =========================================================
// Temporizador de series (botón ⏱ de Rutinas): número de series, tiempo de cada serie y descanso.
// Suena al empezar cada serie, al pasar al descanso y al terminar (y 3-2-1 al final de cada tramo).
// =========================================================
import { onSheetCleanup, openSheet, setSheetContent, closeSheet } from './sheet.js';
import { haptic, saveSettings, state } from './utils.js';
import { tones, unlockAudio } from './workout.js';

const LIMITS = { sets: [1, 50], work: [5, 3600], rest: [0, 3600] };
const cfg = () => ({ sets: 5, work: 40, rest: 20, ...(state.settings.timer || {}) });
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const show = (k, v) => (k === 'sets' ? String(v) : k === 'rest' && !v ? 'Sin descanso' : mmss(v));
// Pasos: de 1 en 1 las series; los tiempos de 5 en 5 s hasta el minuto y luego de 15 en 15
const step = (k, v, d) => (k === 'sets' ? 1 : (d > 0 ? v >= 60 : v > 60) ? 15 : 5);
const total = c => c.sets * c.work + (c.sets - 1) * c.rest;

const SOUND = {
  work: [[660, 0, 0.14], [990, 0.17, 0.32]],                                  // empieza una serie
  rest: [[880, 0, 0.18], [660, 0.22, 0.28]],                                  // serie terminada → descanso
  tick: [[520, 0, 0.07]],                                                     // 3, 2, 1
  done: [[660, 0, 0.16], [880, 0.18, 0.16], [1100, 0.36, 0.16], [1320, 0.54, 0.6]],   // fin
};
const COLOR = { ready: 'var(--orange)', work: 'var(--accent)', rest: 'var(--blue)' };
const R = 96, C = 2 * Math.PI * R;

// Pantalla encendida mientras cuenta (si el iPhone lo permite)
let lock = null;
const keepAwake = async on => {
  try {
    if (on && !lock) lock = await navigator.wakeLock?.request('screen');
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
};

export function openTimer() {
  const c = cfg();
  const row = (k, label) => `
    <div class="rc-meta-row"><span>${label}</span>
      <div class="stepper"><button class="icon-btn" data-tv="${k}" data-d="-1" aria-label="Menos">−</button><b data-tvv="${k}">${show(k, c[k])}</b><button class="icon-btn" data-tv="${k}" data-d="1" aria-label="Más">+</button></div></div>`;
  openSheet(`
    <h2 class="sheet-title">⏱️ Temporizador</h2>
    <div class="card rc-meta tm-set">${row('sets', 'Series')}${row('work', 'Tiempo')}${row('rest', 'Descanso')}</div>
    <div class="tm-total" data-ttot>${mmss(total(c))}</div>
    <button class="btn primary" data-tstart style="margin-top:16px">▶︎ Empezar</button>`, body => {
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-tv]');
      if (b) {
        const k = b.dataset.tv, d = Number(b.dataset.d), [lo, hi] = LIMITS[k];
        c[k] = Math.min(hi, Math.max(lo, c[k] + d * step(k, c[k], d)));
        body.querySelector(`[data-tvv="${k}"]`).textContent = show(k, c[k]);
        body.querySelector('[data-ttot]').textContent = mmss(total(c));
        state.settings.timer = { ...c };
        saveSettings();
        return haptic();
      }
      if (e.target.closest('[data-tstart]')) { unlockAudio(); run(c); }
    });
  });
}

function run(c) {
  // Tramos: 3 s para prepararte, luego serie / descanso / serie…
  const phases = [{ kind: 'ready', dur: 3 }];
  for (let i = 1; i <= c.sets; i++) {
    phases.push({ kind: 'work', set: i, dur: c.work });
    if (i < c.sets && c.rest > 0) phases.push({ kind: 'rest', set: i, dur: c.rest });
  }
  let idx = 0, end = Date.now() + phases[0].dur * 1000, paused = null, lastTick = null, timer = null;

  setSheetContent(`
    <div class="tm-run" data-trun>
      <div class="tm-phase" data-tset></div>
      <div class="tm-ring">
        <svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="${R}" class="tm-track"/>
          <circle cx="110" cy="110" r="${R}" class="tm-prog" data-tprog stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
        <div class="tm-center"><b data-tleft></b><span data-tkind></span></div>
      </div>
      <div class="tm-next" data-tnext></div>
      <button class="btn secondary" data-tpause style="margin-top:18px">⏸ Pausa</button>
      <div class="rc-actions" data-tpaused hidden style="margin-top:18px">
        <button class="btn primary" data-tresume>▶︎ Seguir</button>
        <button class="btn secondary danger" data-tstop>Parar</button>
      </div>
    </div>`, body => {
    const $ = s => body.querySelector(s);
    const paint = leftMs => {
      const p = phases[idx], secs = Math.max(0, Math.ceil(leftMs / 1000));
      $('[data-trun]').style.setProperty('--c', COLOR[p.kind]);
      $('[data-tset]').textContent = p.kind === 'ready' ? 'Prepárate' : `Serie ${p.set} de ${c.sets}`;
      $('[data-tkind]').textContent = p.kind === 'ready' ? 'empieza en' : '';   // serie (verde) o descanso (azul): se ve por el color
      $('[data-tleft]').textContent = p.kind === 'ready' ? String(secs) : mmss(secs);
      $('[data-tprog]').setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, leftMs / (p.dur * 1000)))));
      // Series hechas / total y el tiempo que llevas
      const done = phases.slice(1, idx).reduce((a, x) => a + x.dur, 0) + (p.kind === 'ready' ? 0 : p.dur - leftMs / 1000);
      $('[data-tnext]').textContent = `${p.set || 1}/${c.sets} · ${mmss(Math.max(0, Math.floor(done)))}`;
    };
    const finish = () => {
      clearInterval(timer);
      keepAwake(false);
      tones(SOUND.done, 0.3);
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* nada */ }
      setSheetContent(`
        <div class="tm-done"><span class="e">🎉</span><h2 class="sheet-title">¡Hecho!</h2>
          <div class="muted">${c.sets} ${c.sets === 1 ? 'serie' : 'series'} · ${mmss(total(c))}</div></div>
        <button class="btn primary" data-tagain style="margin-top:18px">🔄 Repetir</button>
        <button class="btn secondary" data-tedit>⚙️ Cambiar tiempos</button>
        <button class="btn ghost" data-tclose>Cerrar</button>`, b2 => {
        b2.addEventListener('click', e => {
          if (e.target.closest('[data-tagain]')) { unlockAudio(); return run(c); }
          if (e.target.closest('[data-tedit]')) return openTimer();
          if (e.target.closest('[data-tclose]')) return closeSheet();
        });
      });
    };
    const tick = () => {
      if (paused != null) return;
      let left = end - Date.now();
      if (left <= 0) {
        // Si la app estuvo en segundo plano puede haber pasado más de un tramo
        while (left <= 0) {
          if (++idx >= phases.length) return finish();
          end += phases[idx].dur * 1000;
          left = end - Date.now();
        }
        tones(SOUND[phases[idx].kind] || SOUND.work);
        try { navigator.vibrate?.(phases[idx].kind === 'work' ? 120 : [60, 60, 60]); } catch { /* nada */ }
        lastTick = null;
      }
      const secs = Math.ceil(left / 1000);
      if (secs <= 3 && secs !== lastTick && phases[idx].dur > 3 && phases[idx].kind !== 'ready') { lastTick = secs; tones(SOUND.tick, 0.18); }
      if (phases[idx].kind === 'ready' && secs !== lastTick) { lastTick = secs; tones(SOUND.tick, 0.18); }
      paint(left);
    };
    timer = setInterval(tick, 100);
    onSheetCleanup(() => { clearInterval(timer); keepAwake(false); });
    keepAwake(true);
    tick();

    body.addEventListener('click', e => {
      const pb = e.target.closest('[data-tpause], [data-tresume]');
      if (pb) {
        if (paused == null) { paused = end - Date.now(); keepAwake(false); }
        else { end = Date.now() + paused; paused = null; unlockAudio(); keepAwake(true); }
        $('[data-trun]').classList.toggle('paused', paused != null);
        $('[data-tpause]').hidden = paused != null;
        $('[data-tpaused]').hidden = paused == null;
        return haptic();
      }
      if (e.target.closest('[data-tstop]')) { clearInterval(timer); keepAwake(false); return openTimer(); }
    });
  });
}
