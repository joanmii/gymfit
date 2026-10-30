// =========================================================
// Escáner de código de barras + base de datos Open Food Facts
// - Lector: librería ZXing (se descarga la primera vez y queda guardada)
// - Datos: openfoodfacts.org (gratis, sin clave, sin límite práctico)
// =========================================================
import { setSheetContent, onSheetCleanup } from './sheet.js';
import { esc, toast, haptic } from './utils.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
let zxingPromise = null;

function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingPromise) return zxingPromise;
  zxingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ZXING_URL;
    s.async = true;
    s.onload = () => window.ZXing ? resolve(window.ZXing) : reject(new Error('lector'));
    s.onerror = () => { zxingPromise = null; reject(new Error('No se pudo cargar el lector. Revisa tu conexión.')); };
    document.head.appendChild(s);
  });
  return zxingPromise;
}

function makeReader(ZX) {
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
    ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E,
  ]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  return new ZX.BrowserMultiFormatReader(hints, 250);
}

// Abre el escáner. Cuando encuentra un producto llama a onProduct(producto)
export function openScanner(onProduct) {
  const liveOk = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  setSheetContent(`
    <h2 class="sheet-title">Escanear código</h2>
    <div class="muted small">Apunta al código de barras del envase</div>
    ${liveOk ? `
      <div class="scanner">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="scan-frame"><i></i></div>
        <div class="scan-status" id="scan-status">Abriendo cámara…</div>
      </div>` : `
      <div class="notice">La cámara en vivo necesita la app publicada con <b>https</b> (GitHub Pages). Mientras tanto, haz una foto del código o escribe el número.</div>`}
    <button class="btn secondary" id="scan-photo" style="margin-top:12px">📷 Hacer foto del código</button>
    <label class="field"><span>…o escribe el número</span>
      <div class="input-wrap">
        <input id="scan-code" inputmode="numeric" pattern="[0-9]*" placeholder="Ej: 8410000000000" autocomplete="off">
        <button class="icon-btn" id="scan-go" aria-label="Buscar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        </button>
      </div>
    </label>
    <input type="file" id="scan-file" accept="image/*" capture="environment" hidden>
  `, async body => {
    let reader = null;
    let done = false;
    const status = body.querySelector('#scan-status');

    const stop = () => { try { reader?.reset(); } catch { /* nada */ } reader = null; };
    onSheetCleanup(stop);

    const found = code => {
      if (done) return;
      done = true;
      stop();
      haptic();
      searchProduct(code, onProduct);
    };

    // Buscar por número
    const go = () => {
      const code = body.querySelector('#scan-code').value.replace(/\D/g, '');
      if (code.length < 8) return toast('El código tiene 8 o 13 números');
      found(code);
    };
    body.querySelector('#scan-go').addEventListener('click', go);
    body.querySelector('#scan-code').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });

    // Foto del código
    const file = body.querySelector('#scan-file');
    body.querySelector('#scan-photo').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      try {
        const ZX = await loadZXing();
        const res = await makeReader(ZX).decodeFromImageUrl(url);
        found(res.getText?.() ?? res.text);
      } catch (err) {
        toast(err?.message?.includes('conexión') ? err.message : 'No he podido leer el código. Acércate más o escríbelo.');
      } finally {
        URL.revokeObjectURL(url);
        file.value = '';
      }
    });

    // Cámara en vivo
    if (!liveOk) return;
    try {
      const ZX = await loadZXing();
      if (done || !body.isConnected) return;
      reader = makeReader(ZX);
      await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        body.querySelector('#scan-video'),
        result => { if (result) found(result.getText?.() ?? result.text); }
      );
      if (status) status.textContent = 'Buscando código…';
    } catch (err) {
      if (status) status.textContent = err?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado'
        : (err?.message?.includes('conexión') ? err.message : 'No se pudo abrir la cámara');
    }
  });
}

async function searchProduct(code, onProduct) {
  setSheetContent(`
    <div class="loading">
      <div class="loading-emoji">🏷️</div>
      <b>Buscando producto…</b>
      <span>Código ${esc(code)}</span>
      <div class="spinner"></div>
    </div>`);
  try {
    const product = await lookupBarcode(code);
    onProduct(product);
  } catch (err) {
    setSheetContent(`
      <h2 class="sheet-title">Producto no encontrado</h2>
      <div class="notice err">${esc(err.message)}</div>
      <div style="margin-top:18px">
        <button class="btn primary" id="again">Escanear otro</button>
      </div>`, body => {
      body.querySelector('#again').addEventListener('click', () => openScanner(onProduct));
    });
  }
}

// Consulta Open Food Facts. Devuelve valores por 100 g y la ración del envase
export async function lookupBarcode(code) {
  const fields = 'code,product_name,product_name_es,generic_name_es,brands,nutriments,serving_quantity,serving_size,image_front_small_url';
  let res;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  } catch {
    throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 1 || !data.product) {
    throw new Error(`El código ${code} no está en Open Food Facts. Puedes añadir la comida a mano o con una foto.`);
  }
  const p = data.product;
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;   // kJ → kcal
  if (kcal == null) throw new Error('Este producto no tiene información nutricional. Añádelo a mano.');

  const name = (p.product_name_es || p.product_name || p.generic_name_es || 'Producto').trim();
  const brand = (p.brands || '').split(',')[0].trim();
  const serving = parseFloat(p.serving_quantity);
  return {
    code,
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    image: p.image_front_small_url || null,
    per100: {
      kcal: +kcal || 0,
      protein: +n.proteins_100g || 0,
      carbs: +n.carbohydrates_100g || 0,
      fat: +n.fat_100g || 0,
    },
    servingGrams: serving > 0 && serving < 2000 ? Math.round(serving) : null,
    servingLabel: p.serving_size || null,
  };
}
