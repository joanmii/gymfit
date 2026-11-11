// =========================================================
// Posturas clave de cada ejercicio para la animación (anim.js)
// Vista de lado mirando a la derecha (salvo v:'front'). y hacia arriba, suelo = 0.
//   hip: cadera · t: ángulo del tronco (90 = de pie) · sh0: hombro fijo (en vez de cadera)
//   ha/hb: mano (absoluta) · hr/hr2: mano relativa al hombro · an/an2: tobillos
//   eb/kb: hacia dónde se doblan codos/rodillas (+1 / −1) · ual: brazo acortado (escorzo)
//   v:'front' de frente · v:'back' de espaldas (misma postura, se ve la espalda) · el: codo puesto a mano
//   en esas dos vistas (así el brazo no hace quiebros) · behind: material que queda detrás del cuerpo
//   arms: 'cross' (brazos cruzados) · 'back' (barra en la espalda) · 'rack' · 'goblet'
// =========================================================

const stand = (o = {}) => ({ hip: [0, 86], t: 90, an: [0, 4], ...o });

// Bancos
const FLAT = { k: 'bench', p: [-62, 43, 40, 43] };
const INCL = [{ k: 'bench', p: [0, 43, 34, 43] }, { k: 'bench', p: [4, 45, -48, 82], legs: false }, { k: 'seg', p: [-30, 68, -30, 0], w: 3 }];
const DECL = [{ k: 'bench', p: [36, 60, -58, 36], legs: false }, { k: 'seg', p: [-40, 40, -40, 0], w: 3 }, { k: 'seg', p: [24, 57, 24, 0], w: 3 }, { k: 'pad', at: [44, 49], r: 6 }];
const SEAT = [{ k: 'bench', p: [-22, 43, 22, 43] }, { k: 'seg', p: [-15, 46, -21, 100], w: 7 }];
const FLOOR_MAT = [];

// Press tumbado en banco plano (barra o mancuernas)
const benchPress = (w, extra = {}) => ({
  props: [FLAT, { k: w, at: 'ha' }],
  k: [
    { hip: [22, 49], t: 180, an: [60, 4], ha: [-27, 102], ...extra.top },
    { hip: [22, 49], t: 180, an: [60, 4], ha: [-25, 56], ual: 0.72, ...extra.bottom },
  ],
});
const inclinePress = w => ({
  props: [...INCL, { k: w, at: 'ha' }],
  k: [
    { hip: [12, 49], t: 145, an: [52, 4], ha: [-27, 130] },
    { hip: [12, 49], t: 145, an: [52, 4], ha: [-23, 84], ual: 0.72 },
  ],
});
const declinePress = w => ({
  props: [...DECL, { k: w, at: 'ha' }],
  k: [
    { hip: [22, 65], t: 194, an: [50, 40], kb: 1, ha: [-24, 106] },
    { hip: [22, 65], t: 194, an: [50, 40], kb: 1, ha: [-22, 60], ual: 0.72 },
  ],
});

// Curl de pie (3 posturas para que la mano haga un arco)
const curl = (w, extraProps = []) => ({
  props: [...extraProps, { k: w, at: 'ha', ...(w === 'bar' ? { r: 10 } : {}) }],
  k: [stand({ hr: [3, -50] }), stand({ hr: [26, -26] }), stand({ hr: [12, -6] })],
});

// Dominadas, de espaldas: colgado de una barra fija; hw = media anchura de agarre (abierto, supino o neutro)
const pullUp = (hw, pegs = false) => ({
  v: 'back', noGround: true,
  props: [{ k: 'seg', p: [-52, 190, 52, 190], w: 4 }, ...(pegs ? [{ k: 'seg', p: [hw, 190, hw, 181], w: 4 }, { k: 'seg', p: [-hw, 190, -hw, 181], w: 4 }] : [])],
  k: [
    { hip: [0, 92], an: [9, 10.2], el: [(15 + hw) / 2 + 2, 164], ha: [hw, pegs ? 183 : 188] },
    { hip: [0, 128], an: [9, 46.2], el: hw > 25 ? [hw + 3, 163] : [hw + 8, 160], ha: [hw, pegs ? 183 : 188] },
  ],
});
// Jalón, de espaldas: sentado en la máquina; la barra baja por delante hasta la parte alta del pecho.
// triangle = agarre estrecho en V (asa en el centro)
const latPull = (top, elTop, bottom, elBottom, triangle = false) => ({
  v: 'back',
  props: [{ k: 'seg', p: [-44, 206, 44, 206], w: 5 }, { k: 'bench', p: [-28, 46, 28, 46] },
    { k: 'cable', from: [0, 200], at: 'mid' }, { k: triangle ? 'handle' : 'hbar', at: 'mid', behind: true },
    { k: 'pad', at: [17, 57], r: 6, behind: true }, { k: 'pad', at: [-17, 57], r: 6, behind: true }],
  k: [
    { hip: [0, 52], kn: [15, 48], an: [14, 6], el: elTop, ha: top },
    { hip: [0, 52], kn: [15, 48], an: [14, 6], el: elBottom, ha: bottom },
  ],
});
// Press de hombros sentado, de frente, con una mancuerna en cada mano (codo y mano abajo y arriba)
const seatedPress = (elBottom, bottom, elTop, top) => ({
  v: 'front',
  props: [{ k: 'bench', p: [-28, 46, 28, 46] }, { k: 'seg', p: [0, 46, 0, 112], w: 7 }, { k: 'db', at: 'ha' }, { k: 'db', at: 'ha2' }],
  k: [
    { hip: [0, 52], legsFront: true, kn: [15, 48], an: [14, 6], el: elBottom, ha: bottom },
    { hip: [0, 52], legsFront: true, kn: [15, 48], an: [14, 6], el: elTop, ha: top },
  ],
});

export const ANIMS = {
  // ---------- Pecho ----------
  'press-banca': benchPress('bar'),
  'press-inclinado': inclinePress('bar'),
  'press-mancuernas': benchPress('db'),
  'press-inclinado-mancuernas': inclinePress('db'),
  'press-declinado': declinePress('bar'),
  'press-declinado-mancuernas': declinePress('db'),
  'press-cerrado': benchPress('bar'),
  // Visto desde arriba: tumbado en el banco; las mancuernas empiezan juntas sobre el pecho y se abren
  'aperturas': {
    v: 'front', noGround: true,
    props: [{ k: 'bench', p: [-70, 100, 30, 100], w: 22, legs: false }, { k: 'db', at: 'ha' }, { k: 'db', at: 'ha2' }],
    k: [
      { hip: [20, 100], t: 180, an: [104, 108], el: [-28, 112], ha: [-27, 106] },
      { hip: [20, 100], t: 180, an: [104, 108], el: [-24, 139], ha: [-21, 161] },
    ],
  },
  'cruce-poleas': {
    v: 'front',
    props: [{ k: 'seg', p: [-88, 0, -88, 192] }, { k: 'seg', p: [88, 0, 88, 192] }, { k: 'cable', from: [82, 185], at: 'ha' }, { k: 'cable', from: [-82, 185], at: 'ha2' }],
    k: [{ hip: [0, 86], ha: [52, 156] }, { hip: [0, 86], ha: [7, 84], al: 0.85, eb: -1 }],
  },
  'cruce-poleas-medio': {
    v: 'front',
    props: [{ k: 'seg', p: [-88, 0, -88, 192] }, { k: 'seg', p: [88, 0, 88, 192] }, { k: 'cable', from: [84, 128], at: 'ha' }, { k: 'cable', from: [-84, 128], at: 'ha2' }],
    k: [{ hip: [0, 86], ha: [62, 128] }, { hip: [0, 86], ha: [6, 118], al: 0.6, eb: -1 }],
  },
  'cruce-poleas-bajo': {
    v: 'front',
    props: [{ k: 'seg', p: [-88, 0, -88, 192] }, { k: 'seg', p: [88, 0, 88, 192] }, { k: 'cable', from: [84, 12], at: 'ha' }, { k: 'cable', from: [-84, 12], at: 'ha2' }],
    k: [{ hip: [0, 86], ha: [44, 76] }, { hip: [0, 86], ha: [9, 128], al: 0.7, eb: -1 }],
  },
  'pec-deck': {
    v: 'front',
    props: [{ k: 'seg', p: [0, 46, 0, 112], w: 7 }, { k: 'bench', p: [-28, 46, 28, 46] },
      { k: 'vbar', at: 'ha' }, { k: 'vbar', at: 'ha2' }],
    k: [
      { hip: [0, 52], legsFront: true, kn: [14, 48], an: [13, 6], el: [39, 94], ha: [60, 102] },
      { hip: [0, 52], legsFront: true, kn: [14, 48], an: [13, 6], el: [17, 85], ha: [8, 97] },
    ],
  },
  'flexiones': {
    k: [
      { prone: true, sh0: [-42, 54], t: 156.3, ha: [-45, 3], an: [80, 3], ft: -60, eb: 1 },
      { prone: true, sh0: [-50, 17], t: 173.3, ha: [-45, 3], an: [80, 3], ft: -60, eb: 1 },
    ],
  },
  'flexiones-declinadas': {
    props: [{ k: 'bench', p: [62, 38, 104, 38] }],
    k: [
      { prone: true, sh0: [-42, 54], t: 175.5, ha: [-45, 3], an: [89, 44], ft: -60, eb: 1 },
      { prone: true, sh0: [-50, 17], t: 191.3, ha: [-45, 3], an: [89, 44], ft: -60, eb: 1 },
    ],
  },
  'press-maquina': {
    props: [...SEAT, { k: 'seg', p: [62, 0, 62, 150], w: 6 }, { k: 'handle', at: 'ha' }],
    k: [{ hip: [0, 50], t: 98, an: [40, 4], ha: [4, 96], ual: 0.7 }, { hip: [0, 50], t: 98, an: [40, 4], ha: [46, 99] }],
  },
  'press-inclinado-maquina': {
    props: [...SEAT, { k: 'seg', p: [62, 0, 62, 170], w: 6 }, { k: 'handle', at: 'ha' }],
    k: [{ hip: [0, 50], t: 98, an: [40, 4], ha: [4, 100], ual: 0.7 }, { hip: [0, 50], t: 98, an: [40, 4], ha: [36, 132] }],
  },
  'fondos-paralelas': {
    props: [{ k: 'seg', p: [0, 0, 0, 104], w: 5 }, { k: 'pad', at: [0, 104], r: 4 }],
    k: [
      { sh0: [3, 155], t: 80, ha: [0, 105], an: [-38, 50] },
      { sh0: [3, 128], t: 64, ha: [0, 105], an: [-50, 32] },
    ],
  },

  // ---------- Espalda ----------
  // De espaldas, para que se vea trabajar el dorsal: prono abierto, supino y neutro
  'dominadas': pullUp(36),
  'dominadas-supinas': pullUp(15),
  'dominadas-neutras': pullUp(11, true),
  // Jalón de espaldas: abierto (prono), supino estrecho y triángulo (neutro estrecho)
  'jalon-pecho': latPull([36, 148], [26, 123], [31, 100], [29, 75]),
  'jalon-supino': latPull([13, 150], [15, 124], [13, 102], [20, 77]),
  'jalon-triangulo': latPull([5, 150], [11, 124], [5, 100], [20, 78], true),
  'remo-barra': {
    props: [{ k: 'bar', at: 'ha' }],
    k: [{ hip: [-22, 74], t: 40, an: [0, 4], hr: [0, -50] }, { hip: [-22, 74], t: 40, an: [0, 4], ha: [-2, 78] }],
  },
  'remo-mancuerna': {
    props: [{ k: 'bench', p: [-72, 43, 40, 43] }, { k: 'db', at: 'ha' }],
    k: [
      { hip: [-25, 86], t: 0, an: [-25, 4], an2: [-62, 47], ft2: 180, hb: [27, 47], ha: [28, 36] },
      { hip: [-25, 86], t: 0, an: [-25, 4], an2: [-62, 47], ft2: 180, hb: [27, 47], ha: [7, 71] },
    ],
  },
  'remo-polea': {
    props: [{ k: 'bench', p: [-42, 23, 0, 23] }, { k: 'seg', p: [64, 8, 64, 46], w: 5 }, { k: 'cable', from: [84, 30], at: 'ha' }, { k: 'handle', at: 'ha' }],
    k: [{ hip: [-20, 29], t: 90, an: [56, 26], ha: [30, 80] }, { hip: [-20, 29], t: 95, an: [56, 26], ha: [-8, 66] }],
  },
  // Peso muerto de espaldas (las tres variantes igual): se ven lumbar, glúteos e isquios.
  // Al inclinarse, el tronco se ve más corto (se aleja de la cámara)
  'peso-muerto': {
    v: 'back',
    props: [{ k: 'hbar', at: 'mid', under: true }],
    k: [
      { hip: [0, 50], tl: 0.5, an: [12, 4], kn: [16, 28], el: [22, 38], ha: [19, 18] },
      { hip: [0, 85], an: [11, 4], kn: [11, 45], el: [21, 108], ha: [20, 82] },
    ],
  },
  'pullover-polea': {
    props: [{ k: 'cable', from: [70, 196], at: 'ha' }, { k: 'handle', at: 'ha' }],
    k: [
      { hip: [-6, 85], t: 80, an: [0, 4], ha: [40, 172] },
      { hip: [-6, 85], t: 80, an: [0, 4], ha: [54, 128] },
      { hip: [-6, 85], t: 80, an: [0, 4], ha: [12, 88] },
    ],
  },
  'encogimientos': {
    v: 'back',
    props: [{ k: 'db', at: 'ha' }, { k: 'db', at: 'ha2' }],
    k: [{ hip: [0, 86], an: [11, 4], ha: [16.5, 82.3] }, { hip: [0, 86], an: [11, 4], su: 9, ha: [16.5, 91.3] }],
  },
  'hiperextensiones': {
    props: [{ k: 'seg', p: [-52, 6, 6, 60], w: 5 }, { k: 'pad', at: [6, 62], r: 7 }, { k: 'pad', at: [-40, 22], r: 5 }],
    k: [{ hip: [13, 72], t: -55, an: [-45, 14], arms: 'cross' }, { hip: [13, 72], t: 45, an: [-45, 14], arms: 'cross' }],
  },

  // ---------- Hombros ----------
  // De frente: de pie, la barra sube desde la clavícula hasta estirar los brazos
  'press-militar': {
    v: 'front',
    props: [{ k: 'hbar', at: 'mid' }],
    k: [{ hip: [0, 86], an: [11, 4], ha: [27, 140], eb: -1 }, { hip: [0, 86], an: [11, 4], ha: [19, 183], eb: -1 }],
  },
  'press-hombro-mancuernas': seatedPress([34, 82], [33, 106], [25, 124], [18, 150]),
  // Arnold: empieza con las mancuernas delante de los hombros y los codos abajo
  'press-arnold': seatedPress([18, 80], [9, 106], [25, 124], [18, 150]),
  'elevaciones-laterales': {
    v: 'front',
    props: [{ k: 'db', at: 'ha' }, { k: 'db', at: 'ha2' }],
    k: [{ hip: [0, 86], ha: [22, 88] }, { hip: [0, 86], ha: [64, 130] }],
  },
  'elevaciones-frontales': {
    props: [{ k: 'db', at: 'ha' }],
    k: [stand({ hr: [3, -50] }), stand({ hr: [36, -36] }), stand({ hr: [50, 6] })],
  },
  // De espaldas: se ve trabajar el hombro posterior y la espalda alta
  'pajaros': {
    v: 'back',
    props: [{ k: 'db', at: 'ha' }, { k: 'db', at: 'ha2' }],
    k: [{ hip: [0, 85], tl: 0.45, an: [11, 4], ha: [12, 56] }, { hip: [0, 85], tl: 0.45, an: [11, 4], ha: [62, 100] }],
  },
  'face-pull': {
    props: [{ k: 'seg', p: [100, 0, 100, 190] }, { k: 'cable', from: [96, 150], at: 'ha' }, { k: 'handle', at: 'ha' }],
    k: [stand({ hr: [48, 10] }), stand({ hr: [-2, 18], eb: 1 })],
  },
  // De frente: la barra sube pegada al cuerpo y los codos quedan altos y abiertos
  'remo-menton': {
    v: 'front',
    props: [{ k: 'hbar', at: 'mid' }],
    k: [
      { hip: [0, 86], an: [11, 4], el: [18, 109], ha: [8, 84] },
      { hip: [0, 86], an: [11, 4], el: [37, 138], ha: [9, 126] },
    ],
  },


  // ---------- Bíceps y antebrazo ----------
  'curl-barra': curl('bar'),
  'curl-martillo': curl('db'),
  'curl-polea': curl('handle', [{ k: 'cable', from: [34, 10], at: 'ha' }]),
  'curl-mancuernas': {
    props: [{ k: 'db', at: 'ha' }, { k: 'db', at: 'ha2' }],
    k: [
      stand({ hr: [3, -50], hr2: [12, -6] }),
      stand({ hr: [26, -26], hr2: [26, -26] }),
      stand({ hr: [12, -6], hr2: [3, -50] }),
    ],
  },
  'curl-predicador': {
    props: [{ k: 'bench', p: [-36, 43, 6, 43] }, { k: 'seg', p: [-8, 92, 14, 73], w: 10 }, { k: 'seg', p: [10, 72, 10, 0], w: 3 }, { k: 'bar', at: 'ha', r: 10 }],
    k: [
      { hip: [-15, 49], t: 80, an: [22, 4], ha: [32, 64] },
      { hip: [-15, 49], t: 80, an: [22, 4], ha: [39, 86] },
      { hip: [-15, 49], t: 80, an: [22, 4], ha: [23, 105] },
    ],
  },
  'curl-concentrado': {
    // Sentado e inclinado, con el codo apoyado en la cara interna del muslo; solo se mueve el antebrazo
    one: true,
    props: [{ k: 'bench', p: [-40, 43, 10, 43] }, { k: 'db', at: 'ha' }],
    k: [
      { hip: [-10, 49], t: 40, an: [36, 4], ha: [27, 30], hb: [34, 46] },
      { hip: [-10, 49], t: 40, an: [36, 4], ha: [48, 50], hb: [34, 46] },
      { hip: [-10, 49], t: 40, an: [36, 4], ha: [40, 72], hb: [34, 46] },
    ],
  },
  'curl-muneca': {
    props: [{ k: 'bench', p: [-40, 43, 50, 43] }, { k: 'db', at: 'hn' }],
    k: [
      { hip: [-30, 49], t: 50, an: [10, 4], ha: [28, 49], hn: -55 },
      { hip: [-30, 49], t: 50, an: [10, 4], ha: [28, 49], hn: 45 },
    ],
  },

  // ---------- Tríceps ----------
  'press-frances': {
    props: [FLAT, { k: 'bar', at: 'ha', r: 10 }],
    k: [
      { hip: [22, 49], t: 180, an: [60, 4], ha: [-35, 101] },
      { hip: [22, 49], t: 180, an: [60, 4], ha: [-54, 89] },
      { hip: [22, 49], t: 180, an: [60, 4], ha: [-53, 63] },
    ],
  },
  'extension-polea': {
    props: [{ k: 'cable', from: [40, 196], at: 'ha' }, { k: 'handle', at: 'ha' }],
    k: [
      { hip: [0, 86], t: 85, an: [0, 4], ha: [24, 121] },
      { hip: [0, 86], t: 85, an: [0, 4], ha: [25, 98] },
      { hip: [0, 86], t: 85, an: [0, 4], ha: [4, 84] },
    ],
  },
  'extension-overhead': {
    props: [{ k: 'db', at: 'ha' }],
    k: [stand({ hr: [-5, 51] }), stand({ hr: [-28, 35] }), stand({ hr: [-19, 6] })],
  },
  'fondos-banco': {
    props: [{ k: 'bench', p: [-74, 43, -33, 43] }],
    k: [
      { sh0: [-28, 99], t: 92, ha: [-37, 47], an: [46, 4] },
      { sh0: [-25, 76], t: 92, ha: [-37, 47], an: [46, 4] },
    ],
  },
  'patada-triceps': {
    one: true,
    props: [{ k: 'bench', p: [30, 43, 80, 43] }, { k: 'db', at: 'ha' }],
    k: [
      { hip: [-25, 74], t: 15, an: [-14, 4], hb: [46, 46], ha: [-3, 53] },
      { hip: [-25, 74], t: 15, an: [-14, 4], hb: [46, 46], ha: [-22, 62] },
      { hip: [-25, 74], t: 15, an: [-14, 4], hb: [46, 46], ha: [-27, 72] },
    ],
  },

  // ---------- Abdomen ----------
  'crunch': {
    k: [{ hip: [0, 8], t: 180, an: [46, 6], arms: 'cross' }, { hip: [0, 8], t: 148, an: [46, 6], arms: 'cross' }],
  },
  'plancha': {
    hold: 1400, dur: 1400,
    k: [
      { prone: true, sh0: [-40, 31], t: 167.3, ha: [-65, 4], an: [88, 3], ft: -70, eb: 1 },
      { prone: true, sh0: [-40, 32], t: 167.8, ha: [-65, 4], an: [88, 3], ft: -70, eb: 1 },
    ],
  },
  'elevacion-piernas': {
    props: [{ k: 'seg', p: [-30, 188, 50, 188], w: 3 }],
    k: [
      { sh0: [0, 134], t: 90, ha: [10, 187], an: [2, 4] },
      { sh0: [0, 134], t: 92, ha: [10, 187], an: [56, 28] },
      { sh0: [0, 134], t: 95, ha: [10, 187], an: [80, 86] },
    ],
  },
  'rueda-abdominal': {
    props: [{ k: 'wheel', at: 'ha' }],
    k: [
      { hip: [-80, 44], t: 25, an: [-108, 5], ft: 180, ha: [-24, 9] },
      { hip: [-40, 17], t: 8, an: [-108, 5], ft: 180, ha: [60, 9] },
    ],
  },
  'giros-rusos': {
    v: 'front',
    props: [{ k: 'plate', at: 'mid' }],
    k: [
      { hip: [0, 12], t: 82, tl: 0.9, legsFront: true, kn: [14, 36], knB: [-14, 36], an: [13, 12], bn: [-13, 12], ha: [38, 44], hb: [24, 40], al: 0.85, eb: -1, ebB: -1 },
      { hip: [0, 12], t: 98, tl: 0.9, legsFront: true, kn: [14, 36], knB: [-14, 36], an: [13, 12], bn: [-13, 12], ha: [-24, 40], hb: [-38, 44], al: 0.85, eb: 1, ebB: 1 },
    ],
  },
  'plancha-lateral': {
    v: 'front', hold: 900,
    k: [
      { hip: [10, 21], t: 158, ha: [-29, 102], hb: [-40, 4], alB: 0.43, an: [92, 8], bn: [91, 3] },
      { hip: [12, 30], t: 168, ha: [-32, 104], hb: [-38, 4], alB: 0.43, an: [92, 8], bn: [91, 3] },
    ],
  },
  'lenador-polea': {
    v: 'front',
    props: [{ k: 'seg', p: [-88, 0, -88, 192] }, { k: 'cable', from: [-82, 186], at: 'mid' }, { k: 'handle', at: 'mid' }],
    k: [
      { hip: [0, 86], t: 96, an: [12, 4], bn: [-12, 4], el: [-8, 156], ha: [-26, 172], elB: [-41, 144], hb: [-40, 168] },
      { hip: [0, 86], t: 88, an: [12, 4], bn: [-12, 4], el: [27, 113], ha: [7, 132], elB: [-27, 114], hb: [-7, 130] },
      { hip: [0, 86], t: 80, an: [12, 4], bn: [-12, 4], el: [38, 112], ha: [36, 92], elB: [9, 111], hb: [27, 90] },
    ],
  },

  // ---------- Piernas ----------
  'sentadilla': {
    props: [{ k: 'bar', at: 'back' }],
    k: [stand({ arms: 'back' }), { hip: [-26, 44], t: 52, an: [0, 4], arms: 'back' }],
  },
  'sentadilla-frontal': {
    props: [{ k: 'bar', at: 'front' }],
    k: [stand({ arms: 'rack' }), { hip: [-20, 40], t: 70, an: [0, 4], arms: 'rack' }],
  },
  'sentadilla-goblet': {
    props: [{ k: 'kb', at: 'ha' }],
    k: [stand({ arms: 'goblet' }), { hip: [-18, 36], t: 72, an: [0, 4], arms: 'goblet' }],
  },
  'prensa': {
    props: [{ k: 'seg', p: [6, 18, 100, 96], w: 4 }, { k: 'bench', p: [-6, 30, -48, 80], w: 9, legs: false }, { k: 'box', p: [-20, 0, 40, 26] }, { k: 'sled', at: 'an', a: 40 }],
    k: [
      { hip: [0, 37], t: 130, an: [58, 86], ft: 130, ha: [8, 34] },
      { hip: [0, 37], t: 130, an: [36, 66], ft: 130, ha: [8, 34] },
    ],
  },
  'zancadas': {
    // Da el paso, baja y vuelve
    props: [{ k: 'db', at: 'ha' }],
    k: [
      { hip: [0, 86], t: 90, an: [3, 4], an2: [-3, 4], hr: [2, -50] },
      { hip: [4, 84], t: 90, an: [16, 15], ft: 12, an2: [-9, 5], ft2: -20, hr: [2, -50] },
      { hip: [6, 80], t: 90, an: [28, 4], ft: 0, an2: [-26, 6], ft2: -40, hr: [2, -50] },
      { hip: [0, 44], t: 90, an: [28, 4], ft: 0, an2: [-26, 6], ft2: -40, hr: [2, -50] },
    ],
  },
  'bulgara': {
    props: [{ k: 'bench', p: [-80, 36, -38, 36] }, { k: 'db', at: 'ha' }],
    k: [
      { hip: [-8, 78], t: 90, an: [22, 4], an2: [-52, 41], ft2: 190, hr: [2, -50] },
      { hip: [-14, 42], t: 88, an: [22, 4], an2: [-52, 41], ft2: 190, hr: [2, -50] },
    ],
  },
  'extension-cuadriceps': {
    props: [...SEAT, { k: 'pad', at: 'an', r: 6 }],
    k: [
      { hip: [0, 50], t: 100, an: [40, 10], ha: [10, 48] },
      { hip: [0, 50], t: 100, an: [80, 52], ha: [10, 48] },
    ],
  },
  'peso-muerto-rumano': {
    v: 'back',
    props: [{ k: 'hbar', at: 'mid', under: true }],
    k: [
      { hip: [0, 85], an: [11, 4], kn: [11, 45], el: [21, 108], ha: [20, 82] },
      { hip: [0, 82], tl: 0.45, an: [11, 4], kn: [12, 43], el: [21, 72], ha: [19, 44] },
    ],
  },
  // Sumo: piernas muy abiertas, manos por dentro de las rodillas, torso más vertical
  'peso-muerto-sumo': {
    v: 'back',
    props: [{ k: 'hbar', at: 'mid', under: true }],
    k: [
      { hip: [0, 54], tl: 0.62, an: [36, 4], kb: 1, ha: [11, 33] },
      { hip: [0, 81], an: [30, 4], kb: 1, ha: [12, 72] },
    ],
  },
  'curl-femoral': {
    props: [{ k: 'bench', p: [-60, 40, 60, 40] }, { k: 'pad', at: 'an', r: 6 }],
    k: [
      { prone: true, hip: [10, 47], t: 180, an: [90, 49], ha: [-58, 34], eb: 1, ft: 0, kb: -1 },
      { prone: true, hip: [10, 47], t: 180, an: [38, 85], ha: [-58, 34], eb: 1, ft: 0, kb: -1 },
    ],
  },
  'aductores-maquina': {
    v: 'front',
    props: [{ k: 'seg', p: [0, 46, 0, 100], w: 7 }, { k: 'bench', p: [-28, 46, 28, 46] }, { k: 'pad', at: 'knA', r: 6.5 }, { k: 'pad', at: 'knB', r: 6.5 }],
    k: [
      { hip: [0, 52], legsFront: true, kn: [38, 48], an: [36, 6], ha: [30, 50] },
      { hip: [0, 52], legsFront: true, kn: [13, 48], an: [12, 6], ha: [30, 50] },
    ],
  },
  'aductores-polea': {
    v: 'front',
    props: [{ k: 'seg', p: [88, 0, 88, 150], w: 6 }, { k: 'cable', from: [86, 10], at: 'anA' }],
    k: [
      { hip: [0, 86], an: [30, 6], bn: [-11, 4], ha: [56, 112], hb: [-22, 82] },
      { hip: [0, 86], an: [-7, 8], bn: [-11, 4], ha: [56, 112], hb: [-22, 82] },
    ],
  },
  'abduccion': {
    v: 'front',
    props: [{ k: 'seg', p: [0, 46, 0, 100], w: 7 }, { k: 'bench', p: [-28, 46, 28, 46] }, { k: 'pad', at: 'knA', r: 6.5 }, { k: 'pad', at: 'knB', r: 6.5 }],
    k: [
      { hip: [0, 52], legsFront: true, kn: [13, 48], an: [12, 6], ha: [30, 50] },
      { hip: [0, 52], legsFront: true, kn: [38, 48], an: [36, 6], ha: [30, 50] },
    ],
  },
  'gemelos-pie': {
    props: [{ k: 'box', p: [-14, 0, 30, 14] }, { k: 'pad', at: 'sh', r: 7 }],
    k: [
      { hip: [-2, 96], t: 90, an: [-2, 14], ft: 20, hr: [14, -8] },
      { hip: [-2, 110], t: 90, an: [-2, 28], ft: -62, hr: [14, -8] },
    ],
  },
  'gemelos-sentado': {
    props: [{ k: 'bench', p: [-30, 43, 10, 43] }, { k: 'box', p: [30, 0, 22, 8] }, { k: 'pad', at: 'kn', r: 7 }],
    k: [
      { hip: [-10, 49], t: 90, an: [32, 10], ft: 15, ha: [24, 56] },
      { hip: [-10, 49], t: 90, an: [32, 18], ft: -40, ha: [24, 56] },
    ],
  },

  // ---------- Glúteos ----------
  'hip-thrust': {
    props: [{ k: 'bench', p: [-66, 40, -24, 40] }, { k: 'bar', at: 'hipbar' }],
    k: [
      { sh0: [-30, 46], t: 145.6, an: [45, 4], arms: null, ha: [6, 30] },
      { sh0: [-30, 46], t: 180, an: [45, 4], ha: [18, 54] },
    ],
  },
  'puente-gluteo': {
    k: [
      { sh0: [-40, 8], t: 180, an: [42, 4], ha: [12, 4] },
      { sh0: [-40, 8], t: 205, an: [42, 4], ha: [12, 4] },
    ],
  },
  'patada-gluteo': {
    props: [{ k: 'seg', p: [40, 0, 40, 150], w: 6 }, { k: 'cable', from: [36, 10], at: 'an2' }],
    k: [
      { hip: [-2, 84], t: 76, an: [0, 4], an2: [4, 10], ha: [36, 110] },
      { hip: [-2, 84], t: 70, an: [0, 4], an2: [-64, 44], ha: [36, 110] },
    ],
  },
};
