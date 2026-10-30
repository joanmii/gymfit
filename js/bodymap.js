// =========================================================
// Mapa muscular en SVG (vista delantera y trasera)
// Cada músculo se dibuja solo en la mitad izquierda y se refleja,
// así el cuerpo siempre es simétrico.
// =========================================================
import { M } from './utils.js';

// Zonas musculares que se pueden tocar. "group" enlaza con los grupos del calendario.
export const PARTS = {
  'pecho-sup':     { name: 'Pecho superior',          group: 'pecho' },
  'pecho-inf':     { name: 'Pecho medio e inferior',  group: 'pecho' },
  'deltoide-ant':  { name: 'Deltoides anterior',      group: 'hombros' },
  'deltoide-lat':  { name: 'Deltoides lateral',       group: 'hombros' },
  'deltoide-post': { name: 'Deltoides posterior',     group: 'hombros' },
  'trapecio':      { name: 'Trapecio superior',       group: 'espalda' },
  'espalda-media': { name: 'Espalda media (romboides)', group: 'espalda' },
  'dorsal':        { name: 'Dorsal ancho',            group: 'espalda' },
  'lumbar':        { name: 'Lumbares',                group: 'espalda' },
  'biceps':        { name: 'Bíceps',                  group: 'biceps' },
  'antebrazo':     { name: 'Antebrazo',               group: 'biceps' },
  'triceps':       { name: 'Tríceps',                 group: 'triceps' },
  'abdominales':   { name: 'Abdominales',             group: 'abdomen' },
  'oblicuos':      { name: 'Oblicuos',                group: 'abdomen' },
  'gluteos':       { name: 'Glúteos',                 group: 'gluteos' },
  'cuadriceps':    { name: 'Cuádriceps',              group: 'piernas' },
  'isquios':       { name: 'Isquiotibiales',          group: 'piernas' },
  'aductores':     { name: 'Aductores',               group: 'piernas' },
  'gemelos':       { name: 'Gemelos',                 group: 'piernas' },
};
export const partColor = id => M[PARTS[id]?.group]?.color || 'var(--accent)';

// ---------- Dibujo (viewBox 200 × 420, centro en x = 100) ----------
const HEAD = '<ellipse class="bm-skin" cx="100" cy="30" rx="15" ry="20"/>';

// Silueta: cuello, torso, brazo y pierna izquierdos
const SKIN = `M101 44 L93 44 L93 55 C86 63 74 66 64 68 C52 70 44 78 44 92 C43 104 44 120 43 136
  L40 162 C36 180 33 198 32 216 C30 226 32 238 36 246 C40 248 44 244 46 236 L48 220
  C54 204 58 184 58 164 C60 150 62 136 64 118 C66 132 68 150 70 166 C70 180 66 192 64 206
  C60 230 60 262 67 298 C66 306 66 312 68 318 C62 336 62 356 70 390 C68 398 64 404 66 408
  L90 408 C90 400 86 396 85 390 C92 356 92 336 88 316 C90 310 90 304 89 298
  C92 274 96 250 98 230 L101 224 Z`;

const DELT_LAT = 'M62 70 C54 69 46 77 45 90 C45 102 49 112 54 118 C52 100 54 82 62 70 Z';
const FOREARM = 'M56 164 C58 178 54 200 47 216 L34 215 C34 200 38 178 42 164 Z';
const ARM_UPPER = 'M60 118 C64 128 62 146 58 158 C54 161 48 161 45 157 C44 142 46 128 52 120 Z';

const FRONT = [
  ['trapecio',     'M93 57 C88 63 78 67 68 69 C76 72 86 70 94 66 Z'],
  ['deltoide-lat', DELT_LAT],
  ['deltoide-ant', 'M62 70 C54 82 52 100 54 118 C60 108 65 96 69 84 C70 78 68 72 62 70 Z'],
  ['pecho-sup',    'M99 74 L75 74 C71 77 70 82 69 88 C79 88 90 90 99 92 Z'],
  ['pecho-inf',    'M99 94.5 C90 92.5 79 90.5 68.5 90.5 C67 96 65 100 62 105 C70 116 86 122 99 121 Z'],
  ['biceps',       ARM_UPPER],
  ['antebrazo',    FOREARM],
  ['abdominales',  'M85 125 h13.5 v17 h-13.5 Z M85 145 h13.5 v17 h-13.5 Z M85.5 165 h13 v17 h-13 Z M86 185 h12.5 v24 C93 207 88 200 86 192 Z'],
  ['oblicuos',     'M82.5 124 C76 122 70 118 66 114 C68 130 70 150 72 166 C72 178 70 188 70 194 C76 196 81 194 83.5 190 C82.5 168 82.5 146 82.5 124 Z'],
  ['cuadriceps',   'M66 208 C61 232 61 264 69 297 C75 302 83 302 88 296 C88 276 88 256 87 236 C84 226 76 214 66 208 Z'],
  ['aductores',    'M90 226 C95 228 98 232 98 238 C96 254 93 268 90 282 C89 266 89 246 90 226 Z'],
  ['gemelos',      'M70 318 C64 334 64 352 70 372 L75.5 372 C74 352 74 334 76 318 Z M86 318 C92 334 92 352 86 372 L81.5 372 C83 352 83 334 82 318 Z'],
];

const BACK = [
  ['dorsal',        'M65 100 C70 96 76 96 79 98 C84 112 90 126 95 142 C96 152 95 160 91 168 C84 170 77 170 72 168 C70 148 68 124 65 100 Z'],
  ['trapecio',      'M99 46 L93 48 C92 58 84 64 66 70 C74 76 81 84 85 92 L99 92 Z'],
  ['espalda-media', 'M99 95 L80 95 C82 104 86 114 90 122 C94 132 97 142 99 152 Z'],
  ['deltoide-lat',  DELT_LAT],
  ['deltoide-post', 'M63 70 C55 82 52 100 54 118 C60 106 66 92 76 78 C72 74 68 71 63 70 Z'],
  ['triceps',       'M60 116 C64 128 62 146 58 158 C54 161 48 161 45 157 C44 142 46 126 53 119 Z'],
  ['antebrazo',     FOREARM],
  ['lumbar',        'M99 156 L99 198 C93 199 88 196 86 192 C88 182 90 176 93 170 C96 166 98 161 99 156 Z'],
  ['gluteos',       'M70 196 C64 204 62 216 64 232 C72 244 88 246 99 240 L99 202 C90 198 78 196 70 196 Z'],
  ['isquios',       'M65 238 C62 258 64 280 70 298 C76 302 84 302 88 296 C90 278 92 262 94 246 C86 248 74 246 65 238 Z'],
  ['aductores',     'M96 246 C98 252 97 262 92 280 C91 268 92 256 96 246 Z'],
  ['gemelos',       'M68 316 C62 332 63 352 71 368 C75 370 78 362 78 332 L78 316 Z M80 316 L80 332 C80 362 82 370 86 368 C93 352 93 332 88 316 Z'],
];

function figure(paths, label, look) {
  const muscles = paths.map(([id, d]) => {
    const l = look(id);
    return `<path class="bm-m ${l.cls}" data-m="${id}" style="--c:${partColor(id)}" d="${d}"><title>${PARTS[id].name}</title></path>`;
  }).join('');
  const half = `<path class="bm-skin" d="${SKIN}"/>${muscles}`;
  return `<figure class="bm-fig">
    <svg viewBox="0 0 200 420" role="img" aria-label="Cuerpo, vista ${label.toLowerCase()}">
      ${HEAD}<g>${half}</g><g transform="matrix(-1 0 0 1 200 0)">${half}</g>
    </svg>
    <figcaption>${label}</figcaption>
  </figure>`;
}

// primary / secondary: músculos a resaltar (fuerte / suave). selected: músculo elegido en el mapa.
export function bodyMap({ primary = [], secondary = [], selected = null, interactive = false, small = false } = {}) {
  const look = id => ({
    cls: id === selected || primary.includes(id) ? 'p' : secondary.includes(id) ? 's' : '',
  });
  return `<div class="bodymap ${interactive ? 'interactive' : ''} ${small ? 'small' : ''}">
    ${figure(FRONT, 'Delante', look)}${figure(BACK, 'Detrás', look)}
  </div>`;
}

// Cambia el músculo resaltado de un mapa ya pintado (sin volver a dibujarlo)
export function setMapSelection(el, selected) {
  el.querySelectorAll('.bm-m').forEach(p => p.classList.toggle('p', p.dataset.m === selected));
}
