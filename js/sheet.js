// =========================================================
// Hoja inferior deslizable (estilo iOS)
// openSheet(html, onMount)  -> abre una hoja nueva
// setSheetContent(html, onMount) -> cambia el contenido de la hoja abierta
// closeSheet()
// =========================================================

let current = null;
let cleanups = [];

// Registra una función que se ejecuta al cerrar la hoja o cambiar su contenido
// (por ejemplo, apagar la cámara o el micrófono)
export function onSheetCleanup(fn) { cleanups.push(fn); }
function runCleanups() {
  const fns = cleanups; cleanups = [];
  fns.forEach(fn => { try { fn(); } catch { /* nada */ } });
}

export function openSheet(html, onMount) {
  closeSheet(true);
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = '<div class="grabber"></div>';
  const body = document.createElement('div');
  body.innerHTML = html;
  sheet.appendChild(body);
  document.body.append(backdrop, sheet);
  document.body.classList.add('noscroll');

  backdrop.addEventListener('click', () => closeSheet());
  enableDragToClose(sheet);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }));

  current = { backdrop, sheet, body };
  onMount?.(body);
  return body;
}

export function setSheetContent(html, onMount) {
  if (!current) return openSheet(html, onMount);
  runCleanups();
  const body = document.createElement('div');
  body.innerHTML = html;
  body.style.animation = 'viewIn .3s var(--spring)';
  current.sheet.replaceChild(body, current.body);
  current.body = body;
  current.sheet.scrollTop = 0;
  onMount?.(body);
  return body;
}

export function closeSheet(instant = false) {
  runCleanups();
  if (!current) return;
  const { backdrop, sheet } = current;
  current = null;
  document.body.classList.remove('noscroll');
  if (instant) { backdrop.remove(); sheet.remove(); return; }
  backdrop.classList.remove('open');
  sheet.classList.remove('open');
  sheet.style.transform = '';
  setTimeout(() => { backdrop.remove(); sheet.remove(); }, 420);
}

// Arrastrar hacia abajo para cerrar (solo si la hoja está arriba del todo)
function enableDragToClose(sheet) {
  let startY = null, dy = 0;
  sheet.addEventListener('touchstart', e => {
    const tag = e.target.tagName;
    if (sheet.scrollTop > 0 || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { startY = null; return; }
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      sheet.classList.add('dragging');
      sheet.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (startY === null) return;
    sheet.classList.remove('dragging');
    if (dy > 110) closeSheet();
    else sheet.style.transform = '';
    startY = null;
  });
}
