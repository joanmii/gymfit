// =========================================================
// IA para analizar fotos de comida
// - Gemini (Google): tiene nivel GRATUITO, no pide tarjeta  ← por defecto
// - Claude (Anthropic): de pago por uso
// =========================================================
import { state, hasAiKey } from './utils.js';

const SYSTEM_PROMPT = `Eres un nutricionista experto en estimar raciones de comida, especialmente cocina española.
Recibirás una foto de un plato o una descripción escrita (o dictada por voz) de lo que ha comido el usuario.
Identifica cada alimento y estima su peso en gramos:
- En fotos, usa referencias visuales (plato, cubiertos, manos).
- En descripciones, usa las cantidades que diga el usuario ("2 huevos", "un plato de lentejas", "media pizza"); si no las dice, usa una ración normal en España.
Responde ÚNICAMENTE con JSON válido, sin texto adicional ni bloques de código, con esta forma exacta:
{"mealName":"nombre corto del plato","confidence":"low|medium|high","items":[{"name":"","estimatedGrams":0,"calories":0,"protein":0,"carbs":0,"sugar":0,"fat":0}]}
- Nombres en español.
- calories en kcal; protein, carbs, sugar (azúcares, parte de carbs) y fat en gramos para la cantidad estimada.
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
    if (res.status === 429) {
      const e = new Error('Has llegado al límite gratuito por ahora. Espera un rato (o hasta mañana) o introduce la comida a mano.');
      e.quota = true;   // cada modelo tiene su propio cupo: se prueba con el otro
      throw e;
    }
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
      ...(i.sugar != null && i.sugar !== '' ? { sugar: +(+i.sugar || 0).toFixed(1) } : {}),
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

async function gemini(parts, { json = true, maxTokens = 8192, system = SYSTEM_PROMPT, temperature = 0.2, text = false } = {}) {
  const S = state.settings;
  const key = requireKey(S.geminiKey);
  // Fotos y texto con Flash-Lite por defecto (rápido y con más límite diario); se pueden cambiar en Ajustes
  const model = (text ? S.geminiTextModel : S.geminiModel)?.trim() || GEMINI_FALLBACK;
  const backup = model === GEMINI_FALLBACK ? 'gemini-flash-latest' : GEMINI_FALLBACK;   // si el ligero falla, el normal
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
    data = await withRetry(() => call(model), [1200]);
  } catch (e) {
    // Saturado o sin cupo: se pasa enseguida al otro modelo (tiene su propio cupo y otra demanda)
    if (!(e.busy || e.quota) || backup === model) throw e;
    data = await withRetry(() => call(backup), [1500, 3000]);
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
  return parseResult(await textAI(`El usuario ha comido esto: ${description}`, { system: SYSTEM_PROMPT }));
}

// ---------- Groq (opcional, gratis y muy rápido): solo texto ----------
async function groq(prompt, { system, temperature = 0.2, maxTokens = 2048 } = {}) {
  const S = state.settings;
  const data = await post('https://api.groq.com/openai/v1/chat/completions', { authorization: `Bearer ${requireKey(S.groqKey)}` }, {
    model: (S.groqModel || 'llama-3.3-70b-versatile').trim(),
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    temperature, max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });
  return data.choices?.[0]?.message?.content || '';
}

// Texto y recetas: con Groq si hay clave (gasta su cupo, no el de las fotos); si falla, con la IA principal
async function textAI(prompt, { system, temperature = 0.2, maxTokens = 1500 } = {}) {
  if (state.settings.groqKey?.trim()) {
    try { return await groq(prompt, { system, temperature, maxTokens: Math.max(2048, maxTokens) }); }
    catch (e) { if (!hasAiKey()) throw e; }
  }
  return state.settings.provider === 'claude'
    ? claude([{ type: 'text', text: prompt }], { system, maxTokens, temperature })
    : gemini([{ text: prompt }], { system, temperature, text: true });
}

export async function testGroq() {
  await groq('Responde {"ok":true}', { system: 'Responde solo JSON.', maxTokens: 20 });
  return true;
}

// ---------- Recetas con lo que tienes en casa ----------
const RECIPE_PROMPT = `Eres un cocinero y nutricionista. El usuario te dice qué ingredientes tiene o qué le apetece,
y a veces con qué quiere cocinar (sartén, olla, horno, airfryer, microondas o sin cocinar) y cuánto tiempo tiene.
Crea UNA receta sencilla, rica y saludable para 1 persona que respete eso, usando sobre todo sus ingredientes
(puedes añadir básicos de despensa: sal, especias, aceite de oliva, ajo, cebolla).
Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"name":"","emoji":"","minutes":0,"ingredients":[{"name":"","grams":0,"calories":0,"protein":0,"carbs":0,"fat":0}],"steps":[""]}
- Nombres en español, cortos. emoji: un único emoji de comida que represente el plato.
- minutes: tiempo total aproximado. steps: de 3 a 6 pasos cortos y claros.
- calories en kcal; protein, carbs y fat en gramos, para la cantidad de cada ingrediente.`;

export async function createRecipe(req) {
  const r = typeof req === 'string' ? { text: req } : req;
  const prompt = [
    r.foods?.length ? `Ingredientes que tengo: ${r.foods.join(', ')}.` : '',
    r.text ? `Lo que quiero: ${r.text}` : '',
    r.tools?.length ? `Cocinar con: ${r.tools.join(', ')}.` : '',
    r.time ? `Tiempo máximo: ${r.time >= 45 ? 'unos 45 minutos o más' : `${r.time} minutos`}.` : '',
  ].filter(Boolean).join('\n');
  const text = await textAI(prompt, { system: RECIPE_PROMPT, temperature: 0.8 });
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

// ---------- Convertir un plato en receta: pasos para esos ingredientes y cantidades ----------
const STEPS_PROMPT = `Eres un cocinero. Te doy un plato con sus ingredientes y cantidades exactas.
Explica cómo prepararlo usando SOLO esos ingredientes (y básicos sin apenas calorías: sal, especias, agua, caldo, limón, vinagre).
Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"emoji":"","minutes":0,"tools":[""],"steps":[""],"notes":""}
- tools: de entre Sartén, Olla, Horno, Airfryer, Microondas, Sin cocinar.
- steps: de 3 a 8 pasos claros y concretos, en español, con tiempos y temperaturas cuando haga falta (p. ej. «Hornea a 200 °C 20 minutos»).
- notes: un truco o consejo breve. minutes: tiempo total aproximado. emoji: un único emoji de comida.`;

export async function recipeSteps({ name, items }) {
  const prompt = `Plato: ${name}\nIngredientes:\n${items.map(i => `- ${i.name}: ${Math.round(+i.grams || 0)} g`).join('\n')}`;
  const text = await textAI(prompt, { system: STEPS_PROMPT, temperature: 0.5 });
  const match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No he podido leer los pasos. Inténtalo otra vez.');
  const j = JSON.parse(match[0]);
  const steps = (j.steps || []).map(x => String(x).trim()).filter(Boolean);
  if (!steps.length) throw new Error('La IA no ha devuelto pasos. Inténtalo otra vez.');
  return {
    emoji: [...String(j.emoji || '')][0] || null, minutes: Math.round(+j.minutes || 0) || null,
    tools: (j.tools || []).map(String), steps, notes: String(j.notes || '').trim(),
  };
}

// ---------- Receta completa (ingredientes con macros, pasos…) a partir del JSON de la IA ----------
const r1 = v => +(+v || 0).toFixed(1);
const nameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function parseFullRecipe(text, { known = [], servings = 1 } = {}) {
  const match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No he podido leer la receta. Inténtalo otra vez.');
  const j = JSON.parse(match[0]);
  // Si un ingrediente ya estaba (mismo nombre), se reutilizan sus valores escalados a los gramos nuevos
  const byName = new Map(known.map(i => [nameKey(i.name), i]));
  const items = (j.ingredients || []).map(i => {
    const grams = Math.round(+i.grams || 0);
    const old = byName.get(nameKey(i.name));
    if (old && +old.grams > 0 && grams > 0) {
      const k = grams / +old.grams;
      if (k === 1) return { ...old };
      const { base, ...rest } = old;
      return { ...rest, grams, kcal: Math.round((+old.kcal || 0) * k), protein: r1(old.protein * k), carbs: r1(old.carbs * k), fat: r1(old.fat * k),
        ...(old.sugar != null ? { sugar: r1(old.sugar * k) } : {}) };
    }
    return { name: String(i.name || 'Ingrediente'), grams, kcal: Math.round(+i.calories || 0), protein: r1(i.protein), carbs: r1(i.carbs), fat: r1(i.fat) };
  }).filter(i => i.grams > 0);
  if (!items.length) throw new Error('La IA no ha devuelto ingredientes. Inténtalo otra vez.');
  const steps = (j.steps || []).map(x => String(x).trim()).filter(Boolean);
  if (!steps.length) throw new Error('La IA no ha devuelto pasos. Inténtalo otra vez.');
  return {
    name: String(j.name || '').trim() || 'Receta', emoji: [...String(j.emoji || '')][0] || null,
    minutes: Math.round(+j.minutes || 0) || null, servings, items, steps,
    tools: (j.tools || []).map(String), notes: String(j.notes || '').trim(), also: String(j.also || '').trim(),
    changes: String(j.changes || '').trim(),
  };
}

const FULL_FORMAT = `Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"name":"","emoji":"","minutes":0,"tools":[""],"ingredients":[{"name":"","grams":0,"calories":0,"protein":0,"carbs":0,"fat":0}],"also":"","steps":[""],"notes":""CHANGES}
- Nombres en español, cortos. emoji: un único emoji de comida. minutes: tiempo total aproximado.
- tools: de entre Sartén, Olla, Horno, Airfryer, Microondas, Sin cocinar.
- ingredients: lo que aporta calorías, con gramos; calories en kcal y protein, carbs y fat en gramos para esa cantidad.
- also: básicos que apenas suman calorías (sal, especias, caldo, limón, vinagre…) en una línea, o "".
- steps: de 3 a 8 pasos claros y concretos, con tiempos y temperaturas cuando haga falta (p. ej. «Hornea a 200 °C 20 minutos»).
- notes: un truco o consejo breve.`;

// Plato de la base (paella, bocata de lomo…): la IA lo desglosa en ingredientes y escribe los pasos
const DISH_PROMPT = `Eres un cocinero y nutricionista experto en cocina española.
Te doy un plato y el tamaño de 1 ración (gramos y valores aproximados). Escribe su receta casera típica para 1 ración:
desglosa los ingredientes con cantidades que sumen aproximadamente esos gramos y esas calorías.
${FULL_FORMAT.replace('CHANGES', '')}`;

export async function dishToRecipe({ name, grams, kcal, protein, carbs, fat }) {
  const prompt = `Plato: ${name}\nRación: ${Math.round(grams)} g · ${Math.round(kcal)} kcal · proteína ${r1(protein)} g · hidratos ${r1(carbs)} g · grasa ${r1(fat)} g`;
  const r = parseFullRecipe(await textAI(prompt, { system: DISH_PROMPT, temperature: 0.4, maxTokens: 3000 }));
  return { ...r, name };
}

// Modificar una receta con lo que pide el usuario: «no tengo nata», «añade especias», «sin horno»…
const MODIFY_PROMPT = `Eres un cocinero y nutricionista. Te doy una receta y un cambio que pide el usuario
(le falta algún ingrediente, quiere añadir algo, más proteína, menos calorías, otro utensilio…).
Devuelve la receta COMPLETA ya modificada:
- Cambia solo lo necesario para cumplir lo que pide; lo demás queda igual (mismos nombres y gramos).
- Si le falta un ingrediente, sustitúyelo por una alternativa razonable o quítalo, y ajusta los pasos.
- Mantén el mismo número de raciones: las cantidades son de la receta entera.
- Si el cambio es grande, ajusta el nombre (p. ej. «Carbonara sin nata»); si no, deja el mismo.
${FULL_FORMAT.replace('CHANGES', ',"changes":""')}
- changes: en una frase corta, qué has cambiado.`;

export async function modifyRecipe(r, request) {
  const n = Math.max(1, Math.round(+r.servings || 1));
  const recipe = [
    `Receta: ${r.name}`, `Raciones: ${n}`,
    r.minutes ? `Tiempo: ${r.minutes} min` : '', r.tools?.length ? `Con: ${r.tools.join(', ')}` : '',
    `Ingredientes:\n${r.items.map(i => `- ${i.name}: ${Math.round(+i.grams || 0)} g`).join('\n')}`,
    r.also ? `Además: ${r.also}` : '',
    r.steps?.length ? `Pasos:\n${r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    r.notes ? `Notas: ${r.notes}` : '',
  ].filter(Boolean).join('\n');
  const text = await textAI(`${recipe}\n\nCambio que pide el usuario: ${request}`, { system: MODIFY_PROMPT, temperature: 0.4, maxTokens: 3000 });
  return parseFullRecipe(text, { known: r.items, servings: n });
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
