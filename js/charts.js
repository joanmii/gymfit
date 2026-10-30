// =========================================================
// Gráficas en SVG hechas a mano (sin librerías)
// =========================================================
import { esc } from './utils.js';

// Anillo de progreso
export function ring(value, max, { size = 120, stroke = 12, color = 'var(--accent)', track = 'var(--card2)' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, value / max) : 0;
  const mid = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    ${p > 0 ? `<circle class="ring-prog" style="--c:${c}" cx="${mid}" cy="${mid}" r="${r}" fill="none"
      stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${mid} ${mid})"/>` : ''}
  </svg>`;
}

// Barras verticales. items: [{ label, value, segments?: [{color, value}], highlight? }]
// opts.goal dibuja una línea discontinua de objetivo
export function bars(items, { height = 150, color = 'var(--accent)', goal = null, showValues = true, unit = '' } = {}) {
  const W = 340, H = height, top = 16, bottom = 22;
  const n = items.length || 1;
  const gap = n > 14 ? 3 : n > 8 ? 6 : 10;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, goal || 0, ...items.map(i => i.value)) * 1.05;
  const plotH = H - top - bottom;
  const y = v => top + plotH - (v / max) * plotH;
  const rx = Math.min(6, bw / 2.4);
  let out = '';

  items.forEach((it, i) => {
    const x = i * (bw + gap);
    // pista de fondo
    out += `<rect x="${x}" y="${top}" width="${bw}" height="${plotH}" rx="${rx}" fill="var(--card2)" opacity=".55"/>`;
    if (it.value > 0) {
      const delay = `style="animation-delay:${i * 25}ms"`;
      if (it.segments?.length) {
        let acc = 0;
        it.segments.forEach((s, j) => {
          const y1 = y(acc + s.value), y0 = y(acc);
          const h = Math.max(0, y0 - y1 - (j < it.segments.length - 1 ? 1.5 : 0));
          out += `<rect class="b" ${delay} x="${x}" y="${y1}" width="${bw}" height="${h}" rx="${Math.min(rx, 4)}" fill="${s.color}"/>`;
          acc += s.value;
        });
      } else {
        out += `<rect class="b" ${delay} x="${x}" y="${y(it.value)}" width="${bw}" height="${top + plotH - y(it.value)}" rx="${rx}" fill="${it.color || color}"/>`;
      }
      if (showValues && bw > 14) {
        out += `<text x="${x + bw / 2}" y="${y(it.value) - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text)">${esc(it.display ?? Math.round(it.value))}${unit}</text>`;
      }
    }
    out += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" font-weight="${it.highlight ? 800 : 600}" fill="${it.highlight ? 'var(--accent)' : 'var(--muted)'}">${esc(it.label)}</text>`;
  });

  if (goal) {
    out += `<line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4"/>`;
    out += `<text x="${W}" y="${y(goal) - 4}" text-anchor="end" font-size="10" font-weight="700" fill="var(--muted)">objetivo</text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${out}</svg>`;
}

// Barras horizontales (HTML). rows: [{ name, color, value }]
export function hbars(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows.map((r, i) => `
    <div class="hbar" style="--c:${r.color}">
      <div class="n"><i></i>${esc(r.name)}</div>
      <div class="t"><i style="width:${(r.value / max) * 100}%;animation-delay:${i * 40}ms"></i></div>
      <div class="v">${r.value}</div>
    </div>`).join('');
}

// Mapa de calor anual estilo GitHub. getLevel(date) -> 0..4 (0 = nada, -1 = no fue)
export function heatmap(year, getLevel) {
  const cell = 12, gap = 3, step = cell + gap;
  const first = new Date(year, 0, 1);
  const offset = (first.getDay() + 6) % 7;      // lunes = 0
  const days = (new Date(year + 1, 0, 1) - first) / 86400000;
  const cols = Math.ceil((days + offset) / 7);
  const W = cols * step, H = 7 * step + 16;
  const op = [0, .4, .62, .82, 1];
  let out = '';
  let lastMonth = -1;
  for (let i = 0; i < days; i++) {
    const d = new Date(year, 0, 1 + i);
    const idx = i + offset;
    const col = Math.floor(idx / 7), row = idx % 7;
    const lvl = getLevel(d);
    const fill = lvl > 0 ? 'var(--accent)' : 'var(--card2)';
    const o = lvl > 0 ? op[Math.min(4, lvl)] : lvl < 0 ? .5 : 1;
    out += `<rect x="${col * step}" y="${16 + row * step}" width="${cell}" height="${cell}" rx="3" fill="${lvl < 0 ? 'var(--card3)' : fill}" opacity="${o}"/>`;
    if (d.getMonth() !== lastMonth) {
      out += `<text x="${col * step}" y="10" font-size="10" font-weight="600" fill="var(--muted)">${'EFMAMJJASOND'[d.getMonth()]}</text>`;
      lastMonth = d.getMonth();
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">${out}</svg>`;
}

// Línea con puntos y área sombreada. points: [{ label, value }]
let lineId = 0;
// opts.goal dibuja una línea discontinua de objetivo (solo si queda cerca de los datos)
export function line(points, { height = 150, color = 'var(--accent)', unit = '', goal = null } = {}) {
  const W = 340, H = height, top = 22, bottom = 22, side = 16;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const showGoal = goal > 0 && goal > lo - Math.max(3, hi - lo) && goal < hi + Math.max(3, hi - lo);
  if (showGoal) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  const pad = Math.max(1, (hi - lo) * 0.2);
  lo -= pad; hi += pad;
  const n = points.length;
  const x = i => n === 1 ? W / 2 : side + i * (W - 2 * side) / (n - 1);
  const y = v => top + (hi - v) / (hi - lo) * (H - top - bottom);
  const pts = points.map((p, i) => [x(i), y(p.value)]);
  const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
  const id = `lg${++lineId}`;
  const every = Math.ceil(n / 6);
  const maxI = vals.lastIndexOf(Math.max(...vals));

  let out = `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" style="stop-color:${color};stop-opacity:.28"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/>
    </linearGradient></defs>`;
  out += `<path d="${d} L${pts.at(-1)[0]} ${H - bottom} L${pts[0][0]} ${H - bottom} Z" fill="url(#${id})"/>`;
  out += `<path class="ln" pathLength="1" d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (showGoal) {
    out += `<line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4"/>`;
    out += `<text x="2" y="${y(goal) - 4}" font-size="10" font-weight="700" fill="var(--muted)">objetivo</text>`;
  }
  pts.forEach(([a, b], i) => {
    // con muchos puntos solo se dibuja el último para no emborronar la línea
    if (n <= 40 || i === n - 1) out += `<circle cx="${a}" cy="${b}" r="${i === n - 1 ? 4.5 : 3}" fill="${i === n - 1 ? color : 'var(--card)'}" stroke="${color}" stroke-width="2"/>`;
    if (i % every === 0 || i === n - 1) {
      out += `<text x="${a}" y="${H - 6}" text-anchor="middle" font-size="10.5" font-weight="${i === n - 1 ? 800 : 600}" fill="${i === n - 1 ? 'var(--text)' : 'var(--muted)'}">${esc(points[i].label)}</text>`;
    }
    if (i === maxI || i === n - 1) {
      out += `<text x="${Math.min(W - 4, Math.max(4, a))}" y="${b - 9}" text-anchor="${a > W - 30 ? 'end' : a < 30 ? 'start' : 'middle'}" font-size="10.5" font-weight="700" fill="var(--text)">${esc(String(Math.round(vals[i] * 10) / 10).replace('.', ','))}${unit}</text>`;
    }
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${out}</svg>`;
}
