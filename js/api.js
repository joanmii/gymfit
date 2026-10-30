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
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Error ${res.status}`;
    if (res.status === 401 || res.status === 403 || /API key not valid/i.test(msg)) throw new Error('La clave de API no es válida.');
    if (res.status === 429) throw new Error('Has llegado al límite gratuito por ahora. Espera un rato (o hasta mañana) o introduce la comida a mano.');
    if (res.status === 404) throw new Error(`El modelo no existe o ya no está disponible. Cámbialo en Ajustes. (${msg})`);
    throw new Error(msg);
  }
  return res.json();
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
async function gemini(parts, { json = true, maxTokens = 8192 } = {}) {
  const S = state.settings;
  const key = requireKey(S.geminiKey);
  const model = (S.geminiModel || 'gemini-flash-latest').trim();
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': key },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }
  );
  const cand = data.candidates?.[0];
  if (!cand) throw new Error(data.promptFeedback?.blockReason ? 'La foto fue bloqueada por el filtro de seguridad.' : 'Respuesta vacía de la IA.');
  return (cand.content?.parts || []).map(p => p.text || '').join('');
}

// ---------- Claude (de pago) ----------
async function claude(content, { maxTokens = 1500, system = SYSTEM_PROMPT } = {}) {
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

// Prueba rápida de la clave
export async function testConnection() {
  if (state.settings.provider === 'claude') {
    await claude('Di "ok".', { maxTokens: 5, system: null });
  } else {
    await gemini([{ text: 'Responde {"ok":true}' }], { maxTokens: 256 });
  }
  return true;
}
