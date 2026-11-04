// =========================================================
// Platos caseros desglosados en ingredientes (cantidades para 1 persona, en crudo)
// Comidas en que se propone: d desayuno · c comida · m merienda · n cena · s snack
// Cada ingrediente: [alimento de foods.js, gramos]  o  [alimento, cantidad, 'u']
// Con 'u' la cantidad va en la ración del alimento (huevos, lonchas, cucharadas…)
// y en la comida aparecen botones − / + para cambiar cuántas.
// =========================================================
import { FOODS, norm } from './foods.js';

const RAW = [
  // Huevos
  ['Tortilla de patatas', 'cmn', '🍳', [['Huevo', 2, 'u'], ['Patata (cruda)', 150], ['Cebolla', 40], ['Aceite de oliva', 1.5, 'u']]],
  ['Tortilla francesa', 'dn', '🍳', [['Huevo', 2, 'u'], ['Aceite de oliva', 0.5, 'u']]],
  ['Huevos fritos con patatas', 'cn', '🍳', [['Huevo', 2, 'u'], ['Patata (cruda)', 200], ['Aceite de oliva', 2.5, 'u']]],
  ['Huevos rotos con jamón', 'cn', '🍳', [['Huevo', 2, 'u'], ['Patata (cruda)', 200], ['Jamón serrano', 3, 'u'], ['Aceite de oliva', 2.5, 'u']]],
  ['Huevos revueltos con jamón', 'dn', '🍳', [['Huevo', 2, 'u'], ['Jamón serrano', 2, 'u'], ['Aceite de oliva', 0.5, 'u']]],
  ['Tostadas con aguacate y huevo', 'dmn', '🥑', [['Pan de barra', 1.5, 'u'], ['Aguacate', 70], ['Huevo', 1, 'u'], ['Aceite de oliva', 0.5, 'u']]],

  // Arroz y pasta
  ['Arroz con pollo', 'c', '🍚', [['Arroz (crudo)', 80], ['Pechuga de pollo (cruda)', 150], ['Pimiento', 50], ['Cebolla', 30], ['Tomate triturado', 50], ['Aceite de oliva', 1, 'u']]],
  ['Paella mixta', 'c', '🥘', [['Arroz (crudo)', 80], ['Pechuga de pollo (cruda)', 80], ['Gambas / langostinos cocidos', 50], ['Calamar / sepia a la plancha', 40], ['Pimiento', 30], ['Tomate triturado', 30], ['Aceite de oliva', 1, 'u']]],
  ['Arroz a la cubana', 'cn', '🍚', [['Arroz (crudo)', 80], ['Huevo frito', 1, 'u'], ['Tomate frito', 80]]],
  ['Pollo a la plancha con arroz', 'cn', '🍗', [['Pechuga de pollo (cruda)', 150], ['Arroz (crudo)', 70], ['Aceite de oliva', 0.5, 'u']]],
  ['Macarrones con tomate', 'cn', '🍝', [['Pasta (cruda)', 90], ['Tomate frito', 100], ['Queso rallado', 15]]],
  ['Macarrones con carne', 'c', '🍝', [['Pasta (cruda)', 90], ['Carne picada mixta', 100], ['Tomate frito', 80], ['Cebolla', 30], ['Aceite de oliva', 0.5, 'u']]],
  ['Espaguetis a la carbonara', 'cn', '🍝', [['Pasta (cruda)', 90], ['Bacon / panceta', 3, 'u'], ['Huevo', 1, 'u'], ['Nata para cocinar', 50], ['Queso rallado', 20]]],
  ['Pasta con atún', 'cn', '🍝', [['Pasta (cruda)', 90], ['Atún en lata al natural', 1, 'u'], ['Tomate frito', 80]]],

  // Legumbres y cuchara
  ['Lentejas con chorizo', 'c', '🍲', [['Lentejas (secas)', 70], ['Chorizo', 30], ['Patata (cruda)', 80], ['Zanahoria', 40], ['Cebolla', 30], ['Aceite de oliva', 0.5, 'u']]],
  ['Garbanzos con espinacas', 'c', '🍲', [['Garbanzos cocidos', 200], ['Espinacas', 100], ['Ajo', 1, 'u'], ['Aceite de oliva', 1, 'u']]],
  ['Fabada', 'c', '🍲', [['Alubias cocidas', 250], ['Chorizo', 30], ['Morcilla', 30], ['Bacon / panceta', 2, 'u']]],
  ['Crema de calabacín', 'cn', '🥣', [['Calabacín', 250], ['Patata (cruda)', 50], ['Cebolla', 40], ['Aceite de oliva', 1, 'u']]],
  ['Gazpacho casero', 'cn', '🍅', [['Tomate', 200], ['Pepino', 40], ['Pimiento', 30], ['Pan de barra', 20], ['Aceite de oliva', 1.5, 'u']]],
  ['Pisto con huevo', 'cn', '🍆', [['Calabacín', 150], ['Pimiento', 60], ['Cebolla', 50], ['Tomate triturado', 100], ['Huevo', 1, 'u'], ['Aceite de oliva', 1.5, 'u']]],

  // Carne y pescado
  ['Pollo con patatas al horno', 'cn', '🍗', [['Muslo de pollo (sin piel, cocinado)', 2, 'u'], ['Patata (cruda)', 200], ['Aceite de oliva', 1, 'u']]],
  ['Pechuga empanada', 'cn', '🍗', [['Pechuga de pollo (cruda)', 150], ['Huevo', 0.5, 'u'], ['Pan rallado', 2.5, 'u'], ['Aceite de oliva', 1.5, 'u']]],
  ['Filete con patatas fritas', 'cn', '🥩', [['Filete de ternera (crudo)', 150], ['Patata (cruda)', 150], ['Aceite de oliva', 2, 'u']]],
  ['Lomo con patatas', 'cn', '🥩', [['Lomo de cerdo (crudo)', 150], ['Patata (cruda)', 150], ['Aceite de oliva', 1.5, 'u']]],
  ['Albóndigas con tomate', 'c', '🍖', [['Carne picada mixta', 125], ['Pan rallado', 1.5, 'u'], ['Tomate frito', 80], ['Aceite de oliva', 1, 'u']]],
  ['Hamburguesa casera', 'cn', '🍔', [['Pan de hamburguesa', 1, 'u'], ['Hamburguesa de ternera (cruda)', 1, 'u'], ['Queso en lonchas', 1, 'u'], ['Tomate', 30], ['Lechuga', 15], ['Ketchup', 1, 'u']]],
  ['Fajitas de pollo', 'cn', '🌯', [['Tortilla de trigo (wrap)', 2, 'u'], ['Pechuga de pollo (cruda)', 120], ['Pimiento', 60], ['Cebolla', 40], ['Aceite de oliva', 0.5, 'u']]],
  ['Merluza con verduras', 'cn', '🐟', [['Merluza (cruda)', 150], ['Calabacín', 100], ['Pimiento', 50], ['Aceite de oliva', 1, 'u']]],
  ['Salmón con brócoli', 'cn', '🐟', [['Salmón (crudo)', 150], ['Brócoli', 150], ['Aceite de oliva', 0.5, 'u']]],

  // Ensaladas
  ['Ensalada mixta', 'cn', '🥗', [['Lechuga', 80], ['Tomate', 100], ['Cebolla', 20], ['Atún en lata al natural', 1, 'u'], ['Huevo cocido', 1, 'u'], ['Aceitunas', 15], ['Aceite de oliva', 1, 'u']]],
  ['Ensaladilla rusa', 'cn', '🥗', [['Patata (cruda)', 150], ['Zanahoria', 30], ['Guisantes', 20], ['Atún en lata en aceite', 1, 'u'], ['Huevo cocido', 1, 'u'], ['Mayonesa', 2, 'u']]],

  // Bocadillos y desayunos
  ['Bocadillo de jamón', 'dmns', '🥖', [['Pan de barra', 100], ['Jamón serrano', 3, 'u'], ['Tomate', 30], ['Aceite de oliva', 0.5, 'u']]],
  ['Bocadillo de tortilla', 'dmn', '🥖', [['Pan de barra', 100], ['Huevo', 2, 'u'], ['Patata (cruda)', 75], ['Aceite de oliva', 1, 'u']]],
  ['Sándwich mixto', 'dmn', '🥪', [['Pan de molde', 2, 'u'], ['Jamón cocido / york', 2, 'u'], ['Queso en lonchas', 1, 'u'], ['Mantequilla', 0.5, 'u']]],
  ['Tostada con tomate y jamón', 'dm', '🍞', [['Pan de barra', 60], ['Tomate', 40], ['Jamón serrano', 2, 'u'], ['Aceite de oliva', 0.5, 'u']]],
  ['Café con leche y tostada', 'dm', '☕', [['Café con leche', 1, 'u'], ['Pan de barra', 60], ['Tomate', 30], ['Aceite de oliva', 0.5, 'u']]],
  ['Porridge de avena', 'd', '🥣', [['Copos de avena', 50], ['Leche semidesnatada', 200], ['Plátano', 1, 'u']]],
  ['Yogur con fruta y muesli', 'dms', '🥣', [['Yogur griego', 1, 'u'], ['Muesli', 30], ['Fresas', 80], ['Miel', 0.5, 'u']]],
  ['Batido de proteínas con leche', 'dms', '💪', [['Proteína whey (polvo)', 1, 'u'], ['Leche semidesnatada', 250], ['Plátano', 1, 'u']]],
];

const byName = new Map(FOODS.map(f => [f.name, f]));

// Alimento listo para la comida, con valores escalados. Si va por unidades guarda la ración (unitG/unitLabel)
function ingredientItem([name, qty, mode]) {
  const f = byName.get(name);
  if (!f) throw new Error(`Ingrediente desconocido en recipes.js: ${name}`);
  const [label, ug] = f.portions[0] || ['ración', 100];
  const grams = mode === 'u' ? qty * ug : qty;
  const k = grams / 100, p = f.per100;
  return {
    name: f.name, grams: Math.round(grams),
    kcal: Math.round(p.kcal * k),
    protein: Math.round(p.protein * k * 10) / 10,
    carbs: Math.round(p.carbs * k * 10) / 10,
    fat: Math.round(p.fat * k * 10) / 10,
    ...(mode === 'u' ? { unitG: ug, unitLabel: label } : {}),
  };
}

const TYPE_CODES = { d: 'desayuno', c: 'comida', m: 'merienda', n: 'cena', s: 'snack' };

export const RECIPES = RAW.map(([name, tags, emoji, ings]) => {
  const items = ings.map(ingredientItem);
  return { name, emoji, items, types: [...tags].map(c => TYPE_CODES[c]), kcal: items.reduce((a, i) => a + i.kcal, 0), hay: norm(name) };
});

// Sin búsqueda: solo los platos de ese tipo de comida (o todos si type es null). Al buscar: todos los que coincidan.
// typesOf permite usar las etiquetas que el usuario haya cambiado a mano
export function searchRecipes(query, type = null, typesOf = r => r.types) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length) return RECIPES.filter(r => words.every(w => r.hay.includes(w)));
  return type ? RECIPES.filter(r => typesOf(r).includes(type)) : RECIPES;
}
