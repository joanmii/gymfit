// =========================================================
// IA para analizar fotos de comida
// - Gemini (Google): tiene nivel GRATUITO, no pide tarjeta  ← por defecto
// - Claude (Anthropic): de pago por uso
// =========================================================
import { state } from './utils.js';

const SYSTEM_PROMPT = `Eres un nutricionista experto en estimar raciones de comida, especialmente cocina española.
Recibirás una foto de un plato o una descripción escrita (o dictada por voz) de lo que ha comido el usuario.
Identifica cada alimento y estima su peso en gramos:
- En fotos, usa referencias visuales (plato, cubiertos, manos).
- En descripciones, usa las cantidades que diga el usuario ("2 huevos", "un plato de lentejas", "media pizza"); si no las dice, usa una ración normal en España.
Responde ÚNICAMENTE con JSON válido, sin texto adicional ni bloques de código, con esta forma exacta:
{"mealName":"nombre corto del plato","confidence":"low|medium|high","items":[{"name":"","estimatedGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0}]}
- Nombres en español.
- calories en kcal; protein, carbs y fat en gramos para la cantidad estimada.
- Ten en cuenta aceites, salsas y la forma de cocinado.
- Si no hay comida en la foto o la descripción, devuelve items vacío y confidence "low".`;

// ---------- Utilidades comunes ----------
async function post(url, headers, body) {
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'La IA está tardando demasiado. Inténtalo de nuevo en un momento.' : 'Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Error ${res.status}`;
    if (res.status === 401 || res.status === 403 || /API key not valid/i.test(msg)) throw new Error('La clave de API no es válida.');
    if (res.status === 429) throw new Error('Has llegado al límite gratuito por ahora. Espera un rato (o hasta mañana) o introduce la comida a mano.');
    if (res.status === 404) throw new Error(`El modelo no existe o ya no está disponible. Cámbialo en Ajustes. (${msg})`);
    if (res.status === 500 || res.status === 503 || res.status === 529) {
      const e = new Error('Los servidores de la IA están saturados ahora mismo. Espera un minuto e inténtalo de nuevo, o introduce la comida a mano.');
      e.busy = true;
      throw e;
    }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Reintenta cuando el servidor está saturado (503 "high demand"), esperando cada vez más
async function withRetry(fn, waits = [1500, 4000]) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!e.busy || i >= waits.length) throw e;
      await sleep(waits[i]);
    }
  }
}

function requireKey(key) {
  if (!key?.trim()) throw new Error('Falta tu clave de API. Añádela en Ajustes.');
  return key.trim();
}

function parseResult(text) {
  const match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No he podido leer la respuesta. Inténtalo otra vez.');
  const json = JSON.parse(match[0]);
  return {
    name: json.mealName || 'Comida',
    confidence: ['low', 'medium', 'high'].includes(json.confidence) ? json.confidence : 'medium',
    items: (json.items || []).map(i => ({
      name: i.name || 'Alimento',
      grams: Math.round(+i.estimatedGrams || 0),
      kcal: Math.round(+i.calories || 0),
      protein: +(+i.protein || 0).toFixed(1),
      carbs: +(+i.carbs || 0).toFixed(1),
      fat: +(+i.fat || 0).toFixed(1),
    })),
  };
}

// ---------- Gemini (gratis) ----------
const GEMINI_FALLBACK = 'gemini-flash-lite-latest';
// Razonamiento mínimo para que responda rápido. Los modelos nuevos (Gemini 3) usan thinkingLevel,
// los 2.5 usan thinkingBudget; el que no admite una opción devuelve 400 y se prueba la siguiente.
const THINK = [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, { thinkingBudget: 0 }, null];
const THINK_KEY = 'gymfit-gemini-think';
const thinkMap = () => { try { return JSON.parse(localStorage.getItem(THINK_KEY) || '{}'); } catch { return {}; } };

async function gemini(parts, { json = true, maxTokens = 8192, system = SYSTEM_PROMPT, temperature = 0.2 } = {}) {
  const S = state.settings;
  const key = requireKey(S.geminiKey);
  const model = (S.geminiModel || 'gemini-flash-latest').trim();
  const request = (m, think) => post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
    { 'x-goog-api-key': key },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature, maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
        ...(think ? { thinkingConfig: think } : {}),
      },
    }
  );
  const call = async m => {
    const start = thinkMap()[m] ?? 0;
    for (let i = start; i < THINK.length; i++) {
      try {
        const r = await request(m, THINK[i]);
        if (i !== start) { try { localStorage.setItem(THINK_KEY, JSON.stringify({ ...thinkMap(), [m]: i })); } catch { /* nada */ } }
        return r;
      } catch (e) {
        if (e.status !== 400 || i === THINK.length - 1) throw e;
      }
    }
  };
  let data;
  try {
    data = await withRetry(() => call(model));
  } catch (e) {
    // Si el modelo elegido sigue saturado, prueba con el modelo ligero (suele tener menos demanda)
    if (!e.busy || model === GEMINI_FALLBACK) throw e;
    data = await withRetry(() => call(GEMINI_FALLBACK), [2000]);
  }
  const cand = data.candidates?.[0];
  if (!cand) throw new Error(data.promptFeedback?.blockReason ? 'La foto fue bloqueada por el filtro de seguridad.' : 'Respuesta vacía de la IA.');
  return (cand.content?.parts || []).map(p => p.text || '').join('');
}

// ---------- Claude (de pago) ----------
async function claude(content, { maxTokens = 1500, system = SYSTEM_PROMPT, temperature } = {}) {
  const S = state.settings;
  const data = await post('https://api.anthropic.com/v1/messages', {
    'x-api-key': requireKey(S.apiKey),
    'anthropic-version': '2023-06-01',
    // Necesario para llamar a la API directamente desde el navegador
    'anthropic-dangerous-direct-browser-access': 'true',
  }, {
    model: S.model || 'claude-sonnet-5-5',
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    ...(temperature != null ? { temperature } : {}),
    messages: [{ role: 'user', content }],
  });
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

// ---------- API pública ----------
// dataUrl: "data:image/jpeg;base64,...."
export async function analyzeFood(dataUrl, context = '') {
  const base64 = dataUrl.split(',')[1];
  const prompt = context ? `Contexto que da el usuario: ${context}` : 'Analiza esta comida.';
  const text = state.settings.provider === 'claude'
    ? await claude([
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: prompt },
      ])
    : await gemini([
        { inline_data: { mime_type: 'image/jpeg', data: base64 } },
        { text: prompt },
      ]);
  return parseResult(text);
}

// Descripción por texto o voz: "2 huevos fritos y una tostada con aceite"
export async function analyzeText(description) {
  const prompt = `El usuario ha comido esto: ${description}`;
  const text = state.settings.provider === 'claude'
    ? await claude([{ type: 'text', text: prompt }])
    : await gemini([{ text: prompt }]);
  return parseResult(text);
}

// ---------- Captura de la báscula (Zepp Life u otra app) ----------
const SCALE_PROMPT = `Lees capturas de pantalla de apps de básculas inteligentes (Zepp Life, Mi Fit, Renpho, etc.).
Extrae los datos de la pesada y responde ÚNICAMENTE con JSON válido, sin texto adicional:
{"date":"YYYY-MM-DD","weight":0,"fat":0,"muscle":0,"water":0,"visceral":0,"bone":0,"bmr":0}
- weight en kg; fat (grasa corporal) y water (agua) en %; muscle (músculo) y bone (masa ósea) en kg;
  visceral = grasa visceral (número); bmr = metabolismo basal en kcal.
- Usa null en lo que no aparezca. No confundas «Proteína %» con músculo.
- date: la fecha de la pesada que se vea en la captura; si no tiene año, usa el año indicado por el usuario.`;

export async function readScaleShot(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const t = new Date();
  const prompt = `Hoy es ${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}.`;
  const text = state.settings.provider === 'claude'
    ? await claude([
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: prompt },
      ], { system: SCALE_PROMPT, maxTokens: 400 })
    : await gemini([{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: prompt }], { system: SCALE_PROMPT, temperature: 0 });
  const match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No he podido leer la captura. Prueba con otra.');
  const j = JSON.parse(match[0]);
  const n = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) && x > 0 ? x : null; };
  const out = { date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : null };
  for (const k of ['weight', 'fat', 'muscle', 'water', 'visceral', 'bone', 'bmr']) out[k] = n(j[k]);
  if (!out.weight) throw new Error('No encuentro el peso en la captura. ¿Es la pantalla del informe de la báscula?');
  return out;
}

// ---------- Recetas con lo que tienes en casa ----------
const RECIPE_PROMPT = `Eres un cocinero y nutricionista. El usuario te dice qué ingredientes tiene.
Crea UNA receta sencilla, rica y saludable para 1 persona usando sobre todo esos ingredientes
(puedes añadir básicos de despensa: sal, especias, aceite de oliva, ajo, cebolla).
Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"name":"","emoji":"","minutes":0,"ingredients":[{"name":"","grams":0,"calories":0,"protein":0,"carbs":0,"fat":0}],"steps":[""]}
- Nombres en español, cortos. emoji: un único emoji de comida que represente el plato.
- minutes: tiempo total aproximado. steps: de 3 a 6 pasos cortos y claros.
- calories en kcal; protein, carbs y fat en gramos, para la cantidad de cada ingrediente.`;

export async function createRecipe(ingredients) {
  const prompt = `Tengo: ${ingredients}`;
  const text = state.settings.provider === 'claude'
    ? await claude([{ type: 'text', text: prompt }], { system: RECIPE_PROMPT, maxTokens: 1500, temperature: 0.8 })
    : await gemini([{ text: prompt }], { system: RECIPE_PROMPT, temperature: 0.8 });
  const match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No he podido leer la receta. Inténtalo otra vez.');
  const j = JSON.parse(match[0]);
  const items = (j.ingredients || []).map(i => ({
    name: i.name || 'Ingrediente',
    grams: Math.round(+i.grams || 0),
    kcal: Math.round(+i.calories || 0),
    protein: +(+i.protein || 0).toFixed(1),
    carbs: +(+i.carbs || 0).toFixed(1),
    fat: +(+i.fat || 0).toFixed(1),
  }));
  if (!items.length) throw new Error('La IA no ha devuelto ingredientes. Prueba a escribirlos de otra forma.');
  return {
    name: j.name || 'Receta', emoji: [...String(j.emoji || '🍽️')][0] || '🍽️',
    minutes: Math.round(+j.minutes || 0) || null, servings: 1, items,
    steps: (j.steps || []).map(String).filter(Boolean),
  };
}

// Prueba rápida de la clave
export async function testConnection() {
  if (state.settings.provider === 'claude') {
    await claude('Di "ok".', { maxTokens: 5, system: null });
  } else {
    await gemini([{ text: 'Responde {"ok":true}' }], { maxTokens: 256 });
  }
  return true;
}
