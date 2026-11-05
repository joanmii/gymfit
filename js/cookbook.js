// =========================================================
// Recetas predeterminadas (para 1 persona). Ingredientes de foods.js,
// en gramos o en unidades de su ración ([alimento, cantidad, 'u']).
// =========================================================
import { ingredientItem } from './recipes.js';

const RAW = [
  ['Tortilla de claras con espinacas', '🥬', 10,
    [['Clara de huevo', 4, 'u'], ['Huevo', 1, 'u'], ['Espinacas', 80], ['Aceite de oliva', 0.5, 'u']],
    ['Saltea las espinacas con el aceite 2 minutos.', 'Bate las claras con el huevo y una pizca de sal.', 'Viértelo sobre las espinacas y cuaja a fuego medio.', 'Dobla la tortilla y sirve.']],
  ['Porridge proteico', '🥣', 8,
    [['Copos de avena', 50], ['Leche semidesnatada', 200], ['Proteína whey (polvo)', 0.5, 'u'], ['Plátano', 1, 'u'], ['Arándanos', 50]],
    ['Calienta la leche con la avena 4–5 minutos removiendo.', 'Fuera del fuego, añade la proteína y mezcla bien.', 'Sirve con el plátano en rodajas y los arándanos.']],
  ['Pollo al curry con arroz', '🍛', 25,
    [['Pechuga de pollo (cruda)', 150], ['Arroz (crudo)', 70], ['Cebolla', 50], ['Nata para cocinar', 50], ['Aceite de oliva', 0.5, 'u']],
    ['Cuece el arroz.', 'Dora el pollo en dados con el aceite.', 'Añade la cebolla picada y una cucharadita de curry.', 'Incorpora la nata, deja reducir 5 minutos y sirve con el arroz.']],
  ['Bowl de salmón y aguacate', '🍣', 20,
    [['Salmón (crudo)', 130], ['Arroz (crudo)', 60], ['Aguacate', 60], ['Pepino', 50], ['Edamame', 50], ['Salsa de soja', 15]],
    ['Cuece el arroz y déjalo templar.', 'Haz el salmón a la plancha 3 minutos por cada lado.', 'Monta el bol con el arroz, el salmón, el aguacate, el pepino y el edamame.', 'Aliña con la salsa de soja.']],
  ['Pasta con atún y tomate', '🍝', 15,
    [['Pasta (cruda)', 90], ['Atún en lata al natural', 1, 'u'], ['Tomate triturado', 150], ['Cebolla', 30], ['Aceite de oliva', 0.5, 'u'], ['Queso rallado', 10]],
    ['Cuece la pasta.', 'Sofríe la cebolla con el aceite y añade el tomate 8 minutos.', 'Agrega el atún escurrido.', 'Mezcla con la pasta y termina con el queso.']],
  ['Ensalada de garbanzos', '🥗', 10,
    [['Garbanzos cocidos', 150], ['Tomate', 100], ['Pepino', 60], ['Cebolla', 20], ['Atún en lata al natural', 1, 'u'], ['Aceite de oliva', 1, 'u']],
    ['Escurre y enjuaga los garbanzos.', 'Trocea el tomate, el pepino y la cebolla.', 'Mezcla todo con el atún.', 'Aliña con aceite, sal y un chorrito de vinagre.']],
  ['Tortitas de avena y plátano', '🥞', 15,
    [['Copos de avena', 50], ['Huevo', 2, 'u'], ['Plátano', 1, 'u'], ['Yogur proteico / skyr', 1, 'u'], ['Miel', 10]],
    ['Tritura la avena, los huevos y el plátano.', 'Haz tortitas pequeñas en una sartén antiadherente.', 'Dales la vuelta cuando salgan burbujas.', 'Sirve con el yogur y la miel.']],
  ['Revuelto de champiñones y jamón', '🍳', 10,
    [['Huevo', 2, 'u'], ['Champiñones', 100], ['Jamón serrano', 2, 'u'], ['Pan integral', 40], ['Aceite de oliva', 0.5, 'u']],
    ['Saltea los champiñones laminados con el aceite.', 'Añade el jamón en tiras 1 minuto.', 'Incorpora los huevos batidos y remueve hasta que cuajen.', 'Acompaña con el pan tostado.']],
  ['Merluza con verduras al horno', '🐟', 25,
    [['Merluza (cruda)', 180], ['Patata (cruda)', 120], ['Calabacín', 120], ['Pimiento', 60], ['Aceite de oliva', 1, 'u']],
    ['Corta la patata en rodajas finas y hornéala 10 minutos a 200 °C.', 'Añade el calabacín y el pimiento con el aceite.', 'Pon la merluza encima con sal y ajo.', 'Hornea 12 minutos más.']],
  ['Yogur con frutos rojos y nueces', '🍓', 3,
    [['Yogur griego', 1, 'u'], ['Fresas', 80], ['Arándanos', 40], ['Nueces', 15], ['Miel', 10]],
    ['Pon el yogur en un bol.', 'Añade la fruta troceada y las nueces.', 'Termina con la miel.']],
];

export const COOKBOOK = RAW.map(([name, emoji, minutes, ings, steps], i) => ({
  key: `def-${i}`, name, emoji, minutes, servings: 1, steps, builtin: true,
  items: ings.map(ingredientItem),
}));
