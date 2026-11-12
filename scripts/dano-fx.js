// dmg-fx.js
// Efeitos pixel art em loop perfeito para a caixa de dano de cada tipo.
// fogo, ácido, eletricidade, essência mágica, frio, luz, psíquico, trevas.
// Cada efeito é função pura de t e periódica: o frame em t = duration é igual ao de t = 0.
// Duas camadas: color (pixels, bordas pontilhadas) e light (brilho aditivo). Sem dependências.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const pal = (a) => a.map(hex);
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mod = (n, m) => ((n % m) + m) % m;
const fr = (x) => x - Math.floor(x);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function h1(n) {
  n = (n | 0) + 0x6d2b79f5;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}
const R = (i, k = 0, s = 0) => h1(i * 131 + k * 7919 + s * 104729 + 1337);
const lat = (ix, iy, s) => h1(ix * 374761 + iy * 668265 + s * 1442695 + 17);
// ruído de valor, periódico em y com período Ly (em células)
function vnoise(x, y, Ly, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const y0 = mod(iy, Ly), y1 = mod(iy + 1, Ly);
  return lerp(lerp(lat(ix, y0, s), lat(ix + 1, y0, s), sx), lerp(lat(ix, y1, s), lat(ix + 1, y1, s), sx), sy);
}

export function createFrame(w, h) {
  return { w, h, color: new Uint8ClampedArray(w * h * 4), light: new Float32Array(w * h * 3) };
}
export function clearFrame(f) { f.color.fill(0); f.light.fill(0); }

function put(f, x, y, c, a = 1) {
  x = Math.floor(x); y = Math.floor(y);
  if (a <= 0 || x < 0 || y < 0 || x >= f.w || y >= f.h) return;
  if (a < 1 && (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 >= a) return;
  const i = (y * f.w + x) * 4;
  f.color[i] = c[0]; f.color[i + 1] = c[1]; f.color[i + 2] = c[2]; f.color[i + 3] = 255;
}
function lum(f, x, y, c, v) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
  const i = (y * f.w + x) * 3;
  f.light[i] += (c[0] / 255) * v; f.light[i + 1] += (c[1] / 255) * v; f.light[i + 2] += (c[2] / 255) * v;
}
function glow(f, cx, cy, rx, ry, c, k) {
  if (k <= 0) return;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(f.h - 1, Math.ceil(cy + ry)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(f.w - 1, Math.ceil(cx + rx)); x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d < 1) lum(f, x, y, c, (1 - d) * (1 - d) * k);
    }
}
function seg(f, x0, y0, x1, y1, c, a = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) put(f, lerp(x0, x1, i / n), lerp(y0, y1, i / n), c, a);
}
function ring(f, cx, cy, r, c, a = 1) {
  const n = Math.max(8, Math.round(r * 7));
  for (let i = 0; i < n; i++) put(f, cx + Math.cos((i / n) * TAU) * r, cy + Math.sin((i / n) * TAU) * r, c, a);
}
function star(f, x, y, s, c, a = 1) {
  x = Math.round(x); y = Math.round(y);
  put(f, x, y, c, a);
  for (let i = 1; i <= s; i++) { put(f, x + i, y, c, a * 0.8); put(f, x - i, y, c, a * 0.8); put(f, x, y + i, c, a * 0.8); put(f, x, y - i, c, a * 0.8); }
}

// ======================= FOGO =======================
const FIRE = pal(["#3d0a04", "#7a1407", "#b8260a", "#e8520e", "#ff8a1c", "#ffbd33", "#ffe480", "#fff7cf"]);
function flameField(f, t, dur, o, wantColor) {
  // devolve via callback; usado por fogo e trevas
  const W = f.w, Hh = f.h, H = Hh - 1, seed = o.seed | 0, inten = o.intensity ?? 1, u = mod(t / dur, 1), L = 4;
  for (let y = 0; y < Hh; y++) {
    const yb = Hh - 1 - y, g = yb / H;
    if (g > 1.15) continue;
    for (let x = 0; x < W; x++) {
      const sway = Math.sin(yb * 0.22 - u * TAU) * 1.6 * g + Math.sin(yb * 0.09 + u * TAU * 2) * 0.8 * g;
      const xs = x + sway;
      const n0 = vnoise(xs * 0.12, yb * 0.085 - u * L, L, seed) * 0.62 + vnoise(xs * 0.26 + 7.3, yb * 0.17 - u * L * 2, L * 2, seed + 1) * 0.38;
      const n = clamp((n0 - 0.5) * 1.7 + 0.5);
      const edge = Math.min(smooth(0, 9, x), smooth(0, 9, W - 1 - x));
      const bump = 0.9 + 0.1 * Math.sin((x / W) * Math.PI);
      let h = (n * 1.05 + 0.3 * Math.pow(1 - clamp(g), 2.2) - (g * 1.05) / bump) * inten;
      h -= (1 - edge) * 0.45;
      const j = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      h += j * 0.14;
      if (h < 0.2) continue;
      wantColor(x, y, h, j);
    }
  }
}
function fire(f, t, o) {
  const dur = 1.2, W = f.w, Hh = f.h, H = Hh - 1, seed = o.seed | 0, inten = o.intensity ?? 1, u = mod(t / dur, 1);
  flameField(f, t, dur, o, (x, y, h, j) => {
    const lvl = clamp(((h - 0.2) / 0.85) * 7 + j * 0.5, 0, 7);
    put(f, x, y, FIRE[Math.round(lvl)]);
  });
  for (let i = 0; i < 9; i++) {
    const m = 1 + (i % 2), ph = h1(i * 31 + seed), k = mod((t / dur) * m + ph, 1);
    const x = 6 + h1(i * 77 + 3 + seed) * (W - 12) + Math.sin((k + ph) * TAU) * 3;
    put(f, x, Hh - 2 - k * (H + 6), FIRE[clamp(Math.round(7 - k * 4.5), 3, 7)], 1 - Math.pow(k, 2.2));
  }
  for (let y = Math.max(0, Hh - 14); y < Hh; y++) {
    const gk = 1 - (Hh - 1 - y) / 14;
    for (let x = 0; x < W; x++) {
      const e = Math.min(smooth(0, 10, x), smooth(0, 10, W - 1 - x));
      const v = gk * gk * 0.34 * e * (0.85 + 0.15 * Math.sin(u * TAU * 2 + x * 0.3)) * inten;
      lum(f, x, y, [255, 107, 20], v);
    }
  }
}

// ======================= TREVAS (necrótico) =======================
const DARK = pal(["#05020a", "#12071f", "#2a1048", "#4a1f7a", "#7a3fc0", "#b48cff", "#e4d4ff"]);
const SOUL = pal(["#2f6b3a", "#6fd37a", "#b6ffb0", "#eaffe6"]);
function necrotic(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, H = Hh - 1, seed = (o.seed | 0) + 5, u = mod(t / dur, 1);
  flameField(f, t, dur, { ...o, seed, intensity: (o.intensity ?? 1) * 1.05 }, (x, y, h, j) => {
    const d = (h - 0.2) / 0.85;
    const idx = d < 0.1 ? 5 : d < 0.22 ? 4 : d < 0.4 ? 3 : d < 0.62 ? 2 : d < 0.85 ? 1 : 0;
    put(f, x, y, DARK[idx]);
  });
  // almas verdes subindo, devagar
  for (let i = 0; i < 6; i++) {
    const ph = R(i, 1, seed), k = mod(u + ph, 1);
    const x0 = 8 + R(i, 2, seed) * (W - 16);
    for (let tr = 0; tr < 4; tr++) {
      const kk = mod(k - tr * 0.025, 1);
      const x = x0 + Math.sin((kk + ph) * TAU) * 3, y = H - 1 - kk * (H + 3);
      const a = Math.pow(1 - kk, 0.7) * (1 - tr * 0.22);
      put(f, x, y, SOUL[clamp(3 - tr, 0, 3)], a);
      if (tr === 0) lum(f, x, y, [90, 255, 120], 0.35 * a);
    }
  }
  for (let y = Math.max(0, Hh - 12); y < Hh; y++) {
    const gk = 1 - (Hh - 1 - y) / 12;
    for (let x = 0; x < W; x++)
      lum(f, x, y, [110, 50, 200], gk * gk * 0.22 * Math.min(smooth(0, 10, x), smooth(0, 10, W - 1 - x)) * (0.85 + 0.15 * Math.sin(u * TAU + x * 0.2)));
  }
}

// ======================= ÁCIDO =======================
const ACID = pal(["#0c2308", "#1c5210", "#37a012", "#6edc1a", "#b5ff3d", "#eaff9c"]);
function acid(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16;
  const ys = (x) => 5.2 + 1.5 * Math.sin(x * 0.24 + u * TAU) + 1.0 * Math.sin(x * 0.13 - u * TAU * 2) + 0.6 * Math.sin(x * 0.5 + u * TAU * 3);
  for (let x = 0; x < W; x++) {
    const s = ys(x);
    for (let yb = 0; yb <= Math.ceil(s); yb++) {
      const d = s - yb;
      if (d < 0) continue;
      const n = vnoise(x * 0.2, yb * 0.22 - u * 3, 3, 4);
      const idx = d < 1 ? 5 : clamp(Math.round(4.1 - d * 0.5 + (n - 0.5) * 1.8), 1, 4);
      put(f, x, base - yb, ACID[idx]);
    }
  }
  for (let i = 0; i < 7; i++) { // bolhas
    const m = 1 + (i % 2), ph = R(i, 0, 2), k = fr(u * m + ph);
    const x = 4 + R(i, 1, 2) * (W - 8) + Math.sin((k + ph) * TAU) * 1.5;
    const r = 1.6 + R(i, 2, 2) * 1.4, sy = ys(x), yb = 1 + k * (sy + 1);
    if (k < 0.86) { ring(f, x, base - yb, r, ACID[5], 1); put(f, x - r * 0.5, base - yb - r * 0.5, ACID[5]); }
    else { const p = (k - 0.86) / 0.14; for (let j = 0; j < 5; j++) { const a = (j / 5) * Math.PI + 0.2; put(f, x + Math.cos(a) * (r + p * 3), base - sy - Math.sin(a) * (1 + p * 4), ACID[5], 1 - p); } }
    lum(f, x, base - yb, [120, 255, 40], 0.12);
  }
  for (let i = 0; i < 4; i++) { // gotas caindo de cima
    const ph = R(i, 3, 2), k = fr(u + ph);
    const x = Math.round(6 + (i + R(i, 4, 2) * 0.6) * ((W - 12) / 4)), sy = ys(x), surf = base - sy;
    const kk = Math.pow(k, 1.5), y = lerp(bt - 3, surf - 2, kk);
    if (k < 0.92) { put(f, x, y, ACID[4]); put(f, x, y + 1, ACID[3]); put(f, x, y - 1, ACID[5], 1 - kk * 0.6); }
    else { const p = (k - 0.92) / 0.08; put(f, x - 1 - p * 2, surf - 1 - p, ACID[5], 1 - p); put(f, x + 1 + p * 2, surf - 1 - p, ACID[5], 1 - p); }
  }
  for (let y = Math.max(0, Hh - 12); y < Hh; y++) {
    const gk = 1 - (base - y) / 12;
    for (let x = 0; x < W; x++) lum(f, x, y, [90, 230, 30], gk * gk * 0.3 * Math.min(smooth(0, 8, x), smooth(0, 8, W - 1 - x)));
  }
}

// ======================= ELETRICIDADE =======================
const ELEC = pal(["#07123a", "#12318a", "#2a6ee0", "#6cc0ff", "#b8e8ff", "#e8f8ff", "#ffffff"]);
function jag(x0, y0, x1, y1, amp, seed, rounds = 4) {
  let pts = [[x0, y0], [x1, y1]];
  for (let r = 0; r < rounds; r++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const off = (R(i + r * 17, r, seed) - 0.5) * 2 * amp;
      np.push([(ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off], pts[i + 1]);
    }
    pts = np; amp *= 0.55;
  }
  return pts;
}
function drawBolt(f, pts, fade, hot) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    seg(f, ax, ay - 1, bx, by - 1, ELEC[2], 0.7 * fade);
    seg(f, ax, ay + 1, bx, by + 1, ELEC[2], 0.7 * fade);
    seg(f, ax, ay, bx, by, ELEC[hot ? 6 : 5], 1);
    if (i % 3 === 0) lum(f, ax, ay, [90, 170, 255], 0.35 * fade);
  }
}
function lightning(f, t, o) {
  const dur = 1.2, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16, K = 8, KB = 24;
  const bh = Hh - bt;
  const s = Math.floor(u * K), p = u * K - s;
  const flash = p < 0.6 ? Math.pow(1 - p / 0.6, 1.4) : 0;
  if (flash > 0) {
    const horiz = s % 2 === 0;
    const pts = horiz
      ? jag(0, bt + 2 + R(s, 1, 9) * (bh - 4), W - 1, bt + 2 + R(s, 2, 9) * (bh - 4), 8, s * 3 + 1)
      : jag(8 + R(s, 3, 9) * (W - 16), 0, 6 + R(s, 4, 9) * (W - 12), base, 7, s * 3 + 2);
    drawBolt(f, pts, flash, p < 0.18);
    const bi = 4 + Math.floor(R(s, 5, 9) * (pts.length - 10));
    const [bx, by] = pts[bi];
    drawBolt(f, jag(bx, by, bx + (R(s, 6, 9) - 0.5) * 26, by + (R(s, 7, 9) < 0.5 ? -1 : 1) * (6 + R(s, 8, 9) * 8), 4, s * 5 + 3, 3), flash * 0.7, false);
    for (let y = bt - 6; y < Hh; y++) for (let x = 0; x < W; x++) lum(f, x, y, [70, 130, 255], 0.1 * flash);
  }
  const kb = Math.floor(u * KB); // estática no chão
  const sx = 4 + R(kb, 1, 8) * (W - 26);
  let px = sx, py = base - 1;
  for (let i = 0; i < 6; i++) {
    const nx = px + 2 + R(kb, 2 + i, 8) * 3, ny = base - 1 - R(kb, 9 + i, 8) * 3;
    seg(f, px, py, nx, ny, ELEC[i % 2 ? 3 : 4], 0.9); px = nx; py = ny;
  }
  for (let i = 0; i < 3; i++) put(f, R(kb, 20 + i, 8) * W, base - R(kb, 30 + i, 8) * 12, ELEC[5], 1);
  for (let x = 0; x < W; x++) lum(f, x, base, [60, 120, 255], 0.14 + 0.06 * Math.sin(u * TAU * 4 + x * 0.4));
}

// ======================= ESSÊNCIA MÁGICA (aurora) =======================
// duas cores apenas: violeta (corpo da cortina) e ciano (franja da borda de baixo)
const AUV = pal(["#1a0a3a", "#3b1d86", "#6a3be0", "#a07bff", "#d4c2ff", "#f4ecff"]);
const AUC = pal(["#0b3a4a", "#1b7a92", "#4fd0e0", "#b8f6ff"]);
function force(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur;
  for (let layer = 1; layer >= 0; layer--) { // 1 = cortina de trás, 0 = da frente
    const ph = layer * 2.3, back = layer === 1;
    for (let x = 0; x < W; x++) {
      const e = edgeFade(x, W, 10);
      const hem = Hh - 6 - layer * 2 + 2.2 * Math.sin(x * 0.15 + u * TAU + ph) + 1.5 * Math.sin(x * 0.07 - u * TAU * 2 + ph * 2);
      const w1 = 0.5 + 0.5 * Math.sin(x * 0.2 - u * TAU + ph * 1.7);
      const w2 = 0.5 + 0.5 * Math.sin(x * 0.47 + u * TAU * 2 + ph);
      const inten = clamp((0.25 + 0.75 * w1) * (0.55 + 0.45 * w2));
      const streak = 0.82 + 0.18 * Math.sin(x * 1.6 + u * TAU * 3 + layer);
      const hr = Math.min(hem - 1, (6 + 10 * inten) * (0.35 + 0.65 * e));
      for (let h = 0; h < hr; h++) {
        const b = (1 - h / hr) * streak;
        let idx = b > 0.78 ? 5 : b > 0.55 ? 4 : b > 0.35 ? 3 : b > 0.18 ? 2 : 1;
        if (back) idx = Math.max(1, idx - 1);
        let c = AUV[idx], al = 1;
        if (b <= 0.18) al = (b / 0.18) * 0.75;
        if (!back && h < 1) c = AUC[3]; else if (!back && h < 2.2) { c = AUC[2]; al = 0.9; }
        put(f, x, hem - h, c, al * (0.55 + 0.45 * e));
      }
      lum(f, x, hem, [130, 80, 255], 0.2 * inten * e * (back ? 0.6 : 1));
      for (let h = 1; h < 6; h++) lum(f, x, hem - h, [130, 80, 255], 0.07 * inten * e * (1 - h / 6));
    }
  }
}

// ======================= FRIO =======================
const ICE = pal(["#0a2240", "#1b5086", "#3b8fcf", "#7bd0f2", "#c2eeff", "#ffffff"]);
function cold(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  for (let x = 0; x < W; x++) { // camada de gelo no chão
    const top = 2 + Math.round(vnoise(x * 0.35, 0, 1, 11) * 2.4);
    for (let y = 0; y < top; y++) put(f, x, base - y, ICE[y === top - 1 ? 4 : y > 0 ? 3 : 2]);
  }
  const n = Math.floor(W / 5);
  for (let i = 0; i < n; i++) { // cristais
    const cx = 3 + i * (W - 6) / (n - 1) + (R(i, 1, 12) - 0.5) * 2.5, hh = 4 + Math.floor(R(i, 2, 12) * 7), w = 2 + Math.floor(R(i, 3, 12) * 2);
    for (let dx = -w; dx <= w; dx++) {
      const colh = Math.round(hh * (1 - Math.abs(dx) / (w + 0.6)));
      for (let y = 2; y < 2 + colh; y++) put(f, cx + dx, base - y, ICE[dx < 0 ? (y > hh ? 5 : 4) : dx === 0 ? 3 : 2]);
    }
    put(f, cx, base - 2 - hh, ICE[5]);
  }
  const band = u * (W + 40) - 20; // reflexo varrendo
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (f.color[i + 3] && Math.abs(x + (Hh - 1 - y) * 0.7 - band) < 1.4) put(f, x, y, ICE[5]);
  }
  for (let i = 0; i < 15; i++) { // neve caindo
    const m = 1 + (i % 2), ph = R(i, 4, 12), k = fr(u * m + ph);
    const x = 2 + R(i, 5, 12) * (W - 4) + Math.sin((k + ph) * TAU) * 2, y = k * (Hh - 3);
    const a = smooth(0, 0.1, k) * (1 - smooth(0.85, 1, k));
    if (R(i, 6, 12) > 0.7) star(f, x, y, 1, ICE[5], a); else put(f, x, y, ICE[R(i, 7, 12) > 0.5 ? 5 : 4], a);
  }
  for (let y = Math.max(0, Hh - 14); y < Hh; y++) {
    const gk = 1 - (base - y) / 14;
    for (let x = 0; x < W; x++) lum(f, x, y, [90, 190, 255], gk * gk * 0.26 * Math.min(smooth(0, 8, x), smooth(0, 8, W - 1 - x)));
  }
}

// ======================= LUZ (radiante) =======================
const GOLD = pal(["#4a2f05", "#8a5c0c", "#c98f14", "#f2c230", "#ffe27a", "#fff4c2", "#ffffff"]);
function radiant(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, cx = W / 2, sy = Hh + 5; // origem logo abaixo da borda
  const pulse = Math.sin(u * TAU * 2);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = sy - (y + 0.5);
    if (dy <= 0) continue;
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx * 0.6);
    const r = 8 + pulse * 1.2;
    if (d < r) { put(f, x, y, GOLD[d < r - 2.5 ? 6 : d < r - 1 ? 5 : 4]); continue; } // halo
    // fade: os raios somem aos poucos no topo e nas laterais, em vez de serem cortados
    const fade = smooth(0, 12, y) * Math.min(smooth(0, 12, x), smooth(0, 12, W - 1 - x));
    if (fade <= 0.02) continue;
    const dim = fade < 0.5 ? 1 : 0;
    const p2 = fr((a / Math.PI) * 13 + u); // raios finos ao fundo
    if (p2 < 0.2 && d > r + 1) put(f, x, y, GOLD[d < 18 ? 1 : 0], fade);
    const p1 = fr((a / Math.PI) * 9 - u); // raios principais, de bordas limpas
    if (p1 < 0.34) {
      const band = d + pulse * 2.5;
      let idx = band < 15 ? 3 : band < 24 ? 2 : 1;
      if (p1 < 0.07 || p1 > 0.27) idx = Math.min(5, idx + 2); // borda mais clara
      put(f, x, y, GOLD[Math.max(0, idx - dim)], Math.min(1, fade * 1.25));
    }
  }
  for (let i = 0; i < 9; i++) { // faíscas douradas subindo
    const m = 1 + (i % 2), ph = R(i, 1, 14), k = fr(u * m + ph);
    const x = 4 + R(i, 2, 14) * (W - 8) + Math.sin((k + ph) * TAU) * 2, y = Hh - 3 - k * (Hh - 2);
    const tw = Math.sin(fr(u * m * 2 + ph) * TAU) ** 2, al = smooth(0, 0.1, k) * (1 - smooth(0.8, 1, k));
    if (tw > 0.5) star(f, x, y, 1, GOLD[6], al); else put(f, x, y, GOLD[5], al);
    lum(f, x, y, [255, 215, 100], 0.25 * al);
  }
  glow(f, cx, Hh - 1, W * 0.5, Hh * 0.95, [255, 205, 80], 0.2 + 0.06 * pulse);
}

// ======================= PSÍQUICO (ondas de lago) =======================
const PSY = pal(["#3a0a2e", "#7a1560", "#c2288f", "#ff52b8", "#ff9ad9", "#ffe0f4"]);
function psychic(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt;
  const cx = W / 2, cy = bt + bh * 0.55, Rmax = W * 0.55;
  for (let fam = 0; fam < 2; fam++) for (let crest = 0; crest < 2; crest++) { // duas ondas, cada uma com duas cristas
    const q = fr(u * 2 + fam * 0.5 - crest * 0.07), r = q * Rmax;
    if (r < 1.5) continue;
    const al = Math.pow(1 - q, 0.8) * (crest ? 0.75 : 1), ry = r * 0.44, th = (1 - q) * 1.8 + 1.0;
    const n = Math.ceil(TAU * Math.max(r, ry) * 1.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      for (let d = 0; d < th; d++) {
        const yy = cy + Math.sin(a) * (ry - d * 0.44), tf = smooth(0, 9, yy); // fade no topo
        if (tf > 0.02) put(f, cx + Math.cos(a) * (r - d), yy, PSY[clamp(Math.round(2 + al * 3.2 - d * 1.1), 1, 5)], Math.min(1, al * 2.6) * tf);
      }
    }
  }
  const pr = 1.6 + 0.8 * Math.sin(u * TAU * 4); // ponto de origem pulsando
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; put(f, cx + Math.cos(a) * pr, cy + Math.sin(a) * pr * 0.6, PSY[5]); }
  glow(f, cx, cy, W * 0.5, bh * 0.9, [255, 70, 180], 0.16 + 0.06 * Math.sin(u * TAU * 2));
}

// ======================= helpers extras =======================
const eo3 = (t) => 1 - Math.pow(1 - clamp(t), 3);
const eo4 = (t) => 1 - Math.pow(1 - clamp(t), 4);
const bump = (p, c, w) => Math.exp(-(((p - c) / w) ** 2));
function disc(f, cx, cy, r, c, a = 1) {
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++)
    if (Math.hypot(x + 0.5, y + 0.5) <= r) put(f, cx + x, cy + y, c, a);
}
const edgeFade = (x, W, n = 8) => Math.min(smooth(0, n, x), smooth(0, n, W - 1 - x));

// ======================= CORTE =======================
const STEEL = pal(["#1a2030", "#3a4660", "#6f84a8", "#aebfd8", "#e6eefc", "#ffffff"]);
function slashing(f, t, o) {
  const dur = 1.5, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, K = 3;
  for (let k = 0; k < K; k++) {
    const A = fr(u - k / K) * dur; // segundos desde o início deste golpe
    if (A > 0.7) continue;
    const dirv = k % 2 ? -1 : 1;
    const x0 = dirv > 0 ? 6 + R(k, 1, 30) * 16 : W - 6 - R(k, 1, 30) * 16;
    const y0 = bt - 6 + R(k, 2, 30) * 3, x1 = x0 + dirv * (32 + R(k, 3, 30) * 10), y1 = Hh - 1 - R(k, 4, 30) * 3;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    const curv = (R(k, 5, 30) > 0.5 ? 1 : -1) * 7;
    const cx = mx - (dy / len) * curv * 2, cy = my + (dx / len) * curv * 2;
    const reveal = eo3(A / 0.12);
    const thick = (A < 0.12 ? 1 : 1 - (A - 0.12) / 0.58) * 3.1;
    const al = 1 - smooth(0.4, 0.7, A);
    for (let i = 0; i <= 70; i++) {
      const sN = i / 70;
      if (sN > reveal) break;
      const px = (1 - sN) * (1 - sN) * x0 + 2 * sN * (1 - sN) * cx + sN * sN * x1;
      const py = (1 - sN) * (1 - sN) * y0 + 2 * sN * (1 - sN) * cy + sN * sN * y1;
      let tx = 2 * (1 - sN) * (cx - x0) + 2 * sN * (x1 - cx), ty = 2 * (1 - sN) * (cy - y0) + 2 * sN * (y1 - cy);
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = thick * Math.pow(Math.sin(Math.PI * sN), 0.8);
      for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) {
        const aj = Math.abs(j);
        if (aj > w + 0.2) continue;
        const idx = aj < 0.6 ? (A < 0.3 ? 5 : 4) : aj < 1.5 ? 3 : 2;
        put(f, px - ty * j, py + tx * j, STEEL[idx], aj < 0.6 ? al : al * 0.8);
      }
      if (i % 9 === 0 && A < 0.3) lum(f, px, py, [170, 200, 255], 0.3 * (1 - A / 0.3));
    }
    if (A > 0.05 && A < 0.45) for (let j = 0; j < 5; j++) { // faíscas na ponta
      const a = Math.atan2(dy, dx) + (R(j + k * 7, 6, 30) - 0.5) * 2.2, sp = 14 + R(j + k * 7, 7, 30) * 26, q = A - 0.05;
      put(f, x1 + Math.cos(a) * sp * q, y1 + Math.sin(a) * sp * q + 40 * q * q, STEEL[j % 2 ? 5 : 4], 1 - q / 0.4);
    }
  }
  glow(f, W / 2, Hh - 1, W * 0.5, Hh * 0.9, [150, 180, 255], 0.1);
}

// ======================= PERFURAÇÃO =======================
const BRONZE = pal(["#2b1a08", "#5e3a10", "#a8661a", "#e0952a", "#ffc85a", "#fff0b8"]);
function piercing(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt;
  const n = 6;
  for (let i = 0; i < n; i++) { // lanças de aço que brotam do chão, em onda
    const p = fr(u - i * 0.07);
    const hmax = 13 + R(i, 1, 31) * 8, x = Math.round(5 + (i * (W - 10)) / (n - 1) + (R(i, 2, 31) - 0.5) * 3);
    let hgt = 0;
    if (p < 0.14) hgt = eo4(p / 0.14) * hmax; else if (p < 0.3) hgt = hmax; else if (p < 0.55) hgt = hmax * (1 - eo3((p - 0.3) / 0.25));
    if (hgt < 0.6) continue;
    for (let y = 0; y < hgt; y++) {
      const g = y / hgt, wd = (1 - g) * 2.6 + 0.2;
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) > wd) continue;
        let idx = dx < -0.5 ? 4 : dx > 0.5 ? 1 : 3;           // esquerda clara, direita escura
        if (Math.abs(dx) > wd - 0.9) idx = dx < 0 ? 5 : 2;      // fio do aço
        if (y > hgt - 2.2) idx = 5;                              // ponta
        put(f, x + dx, base - y, STEEL[idx]);
      }
    }
    if (p > 0.1 && p < 0.4) { const q = (p - 0.1) / 0.3; put(f, x - 3 - q * 3, base - hgt + 1 - q * 2, BRONZE[5], 1 - q); put(f, x + 3 + q * 3, base - hgt + 1 - q * 2, BRONZE[4], 1 - q); }
    if (p < 0.3) lum(f, x, base - hgt, [190, 215, 255], 0.3);
    if (p > 0.04 && p < 0.35) { const q = (p - 0.04) / 0.31; for (const sg of [-1, 1]) put(f, x + sg * (3 + q * 5), base - 0.5, BRONZE[3], 1 - q); }
  }
  for (let k = 0; k < 2; k++) { // estocadas horizontais
    const p = fr(u * 2 + k * 0.5 + 0.2), yy = Math.round(bt + bh * (0.3 + 0.35 * k));
    if (p > 0.4) continue;
    const e = eo3(p / 0.4), hx = lerp(-12, W + 8, e);
    for (let j = 0; j < 26; j++) {
      const a = 1 - j / 26;
      put(f, hx - j, yy, STEEL[j < 2 ? 5 : j < 8 ? 4 : 3], a * (1 - e * 0.3));
    }
    put(f, hx + 1, yy, STEEL[5]); put(f, hx, yy - 1, STEEL[4]); put(f, hx, yy + 1, STEEL[4]);
    lum(f, hx, yy, [190, 215, 255], 0.3);
  }
  glow(f, W / 2, Hh - 1, W * 0.5, Hh * 0.7, [170, 200, 255], 0.1);
}

// ======================= IMPACTO =======================
const DUST = pal(["#241d1a", "#4f4036", "#85705a", "#bda07a", "#e9d3a6", "#fff6dc"]);
function bludgeoning(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  const sl = Math.floor(u * 2), A = fr(u * 2) * 0.8, s = sl % 2;
  const cx = Math.round(W * (0.38 + 0.24 * s)), cy = base - 2;
  const str = s ? 0.85 : 1;
  // rachaduras
  const cr = eo3(A / 0.2), cf = 1 - smooth(0.35, 0.8, A);
  for (let c = 0; c < 6; c++) {
    const dirx = c % 2 ? 1 : -1, len = (8 + R(c + s * 9, 1, 32) * 26) * str;
    let px = cx, py = cy;
    for (let i = 0; i < len * cr; i++) {
      px += dirx * (0.8 + R(c + s * 9, 2 + i, 32) * 0.6); py += (R(c + s * 9, 40 + i, 32) - 0.5) * 1.4;
      put(f, px, Math.min(base, Math.max(base - 5, py)), DUST[i < 6 ? 4 : 3], cf);
    }
  }
  // ondas de choque
  for (let w = 0; w < 2; w++) {
    const aw = A - w * 0.08;
    if (aw < 0 || aw > 0.5) continue;
    const q = aw / 0.5, r = eo4(q) * (34 - w * 12) * str, ry = r * 0.42;
    const th = (1 - q) * 2 + 0.7, al = 1 - smooth(0.55, 1, q);
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * TAU;
      for (let d = 0; d < th; d++) put(f, cx + Math.cos(a) * (r - d), cy + Math.sin(a) * (ry - d * 0.42), DUST[clamp(Math.round(5 - q * 3 - d), 1, 5)], al);
    }
  }
  // poeira
  for (let i = 0; i < 6; i++) {
    const dx = (i - 2.5) * 5 + (R(i, 3, 32) - 0.5) * 4, r = 2 + A * 9 * (0.6 + R(i, 4, 32) * 0.6);
    disc(f, Math.round(cx + dx * (0.5 + A * 2)), Math.round(cy - A * 18 * (0.5 + R(i, 5, 32))), r, DUST[1 + (i % 2)], 0.85 * (1 - smooth(0.2, 0.8, A)));
  }
  // estilhaços
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (1.12 + R(i + s * 12, 6, 32) * 0.76), sp = (34 + R(i + s * 12, 7, 32) * 60) * str;
    const x = cx + Math.cos(a) * sp * A, y = cy + Math.sin(a) * sp * A + 150 * A * A;
    if (A > 0.7 || y > base + 1) continue;
    const c = DUST[2 + (i % 3)], al = 1 - smooth(0.5, 0.75, A);
    put(f, x, y, c, al); put(f, x + 1, y, c, al); put(f, x, y + 1, c, al); put(f, x + 1, y + 1, DUST[1], al); if (i % 2) { put(f, x + 2, y, DUST[2], al); put(f, x + 2, y + 1, DUST[1], al); }
  }
  if (A < 0.07) { // clarão
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; seg(f, cx, cy, cx + Math.cos(a) * 9, cy + Math.sin(a) * 6, DUST[5], 1); }
    disc(f, cx, cy, 3, DUST[5]);
  }
  if (A < 0.18) glow(f, cx, cy, 30, 16, [255, 210, 130], 0.8 * (1 - A / 0.18));
}

// ======================= RECUPERAÇÃO DE MANA =======================
const MANA = pal(["#06224a", "#0c4fa0", "#1a86e6", "#47c1ff", "#9be4ff", "#e0f8ff"]);
function manaheal(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  for (let x = 0; x < W; x++) { // líquido de mana
    const sf = 2.6 + 0.9 * Math.sin(x * 0.3 + u * TAU) + 0.6 * Math.sin(x * 0.17 - u * TAU * 2);
    for (let yb = 0; yb <= Math.ceil(sf); yb++) {
      const d = sf - yb; if (d < 0) continue;
      const sh = Math.sin(x * 0.55 + yb * 0.9 + u * TAU * 3) > 0.75;
      put(f, x, base - yb, MANA[d < 1 ? 5 : sh ? 4 : d < 2 ? 3 : 2]);
    }
  }
  for (let h = 0; h < 2; h++) { // hélices de luz subindo
    const cx = W * (h ? 0.8 : 0.2);
    for (let y = 0; y < Hh - 3; y++) {
      const g = y / (Hh - 3), amp = 2 + g * 4;
      for (let s = 0; s < 2; s++) {
        const x = cx + Math.sin(y * 0.4 - u * TAU * 2 + s * Math.PI) * amp, front = Math.cos(y * 0.4 - u * TAU * 2 + s * Math.PI) > 0;
        put(f, x, base - 4 - y, MANA[front ? 4 : 2], (1 - g) * 0.95);
      }
    }
  }
  for (let i = 0; i < 14; i++) { // gotas de mana subindo
    const m = 1 + (i % 2), ph = R(i, 1, 33), k = fr(u * m + ph), x0 = 3 + R(i, 2, 33) * (W - 6);
    for (let j = 0; j < 5; j++) {
      const kk = fr(k - j * 0.012 + 1), x = x0 + Math.sin((kk + ph) * TAU) * 3, y = base - 3 - kk * (Hh - 2);
      const al = smooth(0, 0.08, kk) * (1 - smooth(0.82, 1, kk)) * (1 - j * 0.18);
      put(f, x, y, MANA[clamp(5 - j, 2, 5)], al);
      if (j === 0) lum(f, x, y, [90, 190, 255], 0.22 * al);
    }
  }
  for (let i = 0; i < 5; i++) { // bolhas
    const ph = R(i, 3, 33), k = fr(u + ph), x = 6 + R(i, 4, 33) * (W - 12) + Math.sin((k + ph) * TAU) * 2, y = base - 2 - k * (Hh - 3);
    ring(f, x, y, 1.5 + R(i, 5, 33), MANA[4], smooth(0, 0.1, k) * (1 - smooth(0.7, 1, k)));
  }
  for (let i = 0; i < 8; i++) { // brilhos
    const m = 1 + (i % 2), ph = R(i, 6, 33), tw = Math.sin(fr(u * m + ph) * TAU) ** 2;
    const x = 3 + R(i, 7, 33) * (W - 6), y = 2 + R(i, 8, 33) * (Hh - 8);
    if (tw > 0.75) star(f, x, y, 2, MANA[5]); else if (tw > 0.35) star(f, x, y, 1, MANA[4]);
  }
  glow(f, W / 2, base, W * 0.5, Hh * 0.9, [60, 160, 255], 0.26 + 0.06 * Math.sin(u * TAU * 2));
}

// ======================= RECUPERAÇÃO DE VIDA =======================
const HEAL = pal(["#0a3014", "#16692a", "#2fb54a", "#6be879", "#b4ffb8", "#f0fff0"]);
function heal(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  for (let i = 0; i < 9; i++) { // colunas de luz verde subindo
    const x0 = 5 + R(i, 1, 34) * (W - 10), m = 1 + (i % 2), ph = R(i, 2, 34), pw = 0.5 + 0.5 * Math.sin(fr(u * m + ph) * TAU);
    const x = Math.round(x0 + Math.sin((u + ph) * TAU) * 2), hgt = Math.round((8 + R(i, 3, 34) * 12) * (0.4 + 0.6 * pw));
    for (let y = 0; y < hgt; y++) {
      const g = y / hgt;
      put(f, x, base - y, HEAL[g < 0.3 ? 4 : g < 0.6 ? 3 : 2], Math.min(1, (1 - g) * (0.9 + 0.5 * pw)));
      put(f, x + 1, base - y, HEAL[g < 0.5 ? 2 : 1], Math.min(1, (1 - g) * 1.1 * (0.5 + 0.5 * pw)));
      if (g < 0.35) put(f, x - 1, base - y, HEAL[1], (1 - g * 2.5) * pw);
    }
  }
  for (let i = 0; i < 8; i++) { // cruzes de cura subindo
    const m = 1 + (i % 2), ph = R(i, 4, 34), k = fr(u * m + ph), big = i % 3 === 0 ? 2 : 1;
    const x = Math.round(5 + R(i, 5, 34) * (W - 10) + Math.sin((k + ph) * TAU) * 2), y = Math.round(base - 2 - k * (Hh + 2));
    const al = smooth(0, 0.12, k) * (1 - smooth(0.7, 1, k));
    put(f, x, y, HEAL[5], al);
    for (let a = 1; a <= big; a++) { const c = HEAL[a === 1 ? 4 : 3]; put(f, x + a, y, c, al); put(f, x - a, y, c, al); put(f, x, y + a, c, al); put(f, x, y - a, c, al); }
    lum(f, x, y, [110, 255, 130], 0.3 * al);
  }
  for (let i = 0; i < 9; i++) { // brilhos dourados e brancos
    const m = 1 + (i % 2), ph = R(i, 6, 34), tw = Math.sin(fr(u * m + ph) * TAU) ** 2;
    const x = 3 + R(i, 7, 34) * (W - 6), y = 2 + R(i, 8, 34) * (Hh - 7);
    if (tw > 0.7) star(f, x, y, 1, i % 3 ? HEAL[5] : [255, 238, 150]); else if (tw > 0.3) put(f, x, y, HEAL[4]);
  }
  glow(f, W / 2, base, W * 0.55, Hh * 0.95, [70, 230, 110], 0.36 + 0.08 * Math.sin(u * TAU * 2));
}

// ======================= PERDA DE VIDA =======================
const BLOOD = pal(["#2a0508", "#5c0a12", "#9c1220", "#d4202e", "#ff5a4a", "#ffb0a0"]);
function drain(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  const pr = fr(u * 2), hb = bump(pr, 0.05, 0.06) + 0.7 * bump(pr, 0.28, 0.07);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { // vinheta de sangue pulsando
    const dEdge = Math.min(x, W - 1 - x, (base - y) * 1.5);
    const reach = 8 + hb * 6, dens = 1 - dEdge / reach;
    if (dens <= 0) continue;
    const tf = smooth(0, 11, y); // fade no topo
    if (tf <= 0.02) continue;
    if (dens > 0.72) put(f, x, y, BLOOD[1], tf);
    else if (dens > 0.4) put(f, x, y, BLOOD[2], (0.35 + hb * 0.25) * tf);
    else put(f, x, y, BLOOD[1], 0.35 * tf);
  }
  const pool = 1 + hb * 1.3; // poça no chão
  for (let x = 0; x < W; x++) for (let yb = 0; yb < Math.ceil(pool + 1); yb++) put(f, x, base - yb, BLOOD[yb >= pool - 0.4 ? 3 : 2], edgeFade(x, W, 6) * 0.9);
  for (let i = 0; i < 6; i++) { // gotas caindo
    const m = 1 + (i % 2), ph = R(i, 1, 35), k = fr(u * m + ph), x = Math.round(8 + (i + R(i, 2, 35) * 0.6) * ((W - 16) / 6));
    const kk = Math.pow(k, 1.7), y = lerp(-3, base - pool - 1, kk);
    if (k < 0.93) {
      const df = (yy) => smooth(0, 7, yy); // gotas surgem com fade, sem estalar no topo
      put(f, x, y, BLOOD[4], df(y)); put(f, x + 1, y, BLOOD[3], df(y)); put(f, x, y + 1, BLOOD[3], df(y + 1)); put(f, x + 1, y + 1, BLOOD[2], df(y + 1)); put(f, x, y - 1, BLOOD[5], df(y - 1));
      for (let j = 1; j <= 5; j++) put(f, x, y - 1 - j, BLOOD[j < 3 ? 3 : 2], (1 - j / 6) * 0.9 * df(y - 1 - j));
    } else { const q = (k - 0.93) / 0.07; put(f, x - 1 - q * 2, base - pool - 1 - q, BLOOD[5], 1 - q); put(f, x + 2 + q * 2, base - pool - 1 - q, BLOOD[4], 1 - q); }
  }
  for (let i = 0; i < 10; i++) { // vida escorrendo em partículas
    const ph = R(i, 3, 35), k = fr(u + ph), x = 4 + R(i, 4, 35) * (W - 8) + Math.sin((k + ph) * TAU) * 2, y = k * (Hh - 3);
    put(f, x, y, BLOOD[i % 2 ? 3 : 4], smooth(0, 0.15, k) * (1 - smooth(0.7, 1, k)) * 0.9);
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) {
    const dEdge = Math.min(x, W - 1 - x); if (dEdge < 12) lum(f, x, y, [220, 30, 40], (1 - dEdge / 12) ** 2 * (0.1 + hb * 0.16) * smooth(0, 11, y));
  }
}

// ======================= ACERTO CRÍTICO (permanente, lento) =======================
const CRIT = pal(["#4a2205", "#9a4d0a", "#e08a12", "#ffc233", "#ffe27a", "#fff6c8", "#ffffff"]);
function crit(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt;
  const cx = W / 2, cy = bt + bh * 0.5, tf = (y) => smooth(0, 8, y), br = Math.sin(u * TAU * 2);
  for (let h = 0; h < 2; h++) { // halo dourado respirando em volta do número
    const ph = h * Math.PI, rx = 16 + h * 5 + 1.4 * Math.sin(u * TAU * 2 + ph), ry = 7.2 + h * 2.2 + 0.6 * Math.sin(u * TAU * 2 + ph);
    for (let i = 0; i < 130; i++) {
      const a = (i / 130) * TAU, yy = cy + Math.sin(a) * ry;
      put(f, cx + Math.cos(a) * rx, yy, CRIT[h ? 2 : 4], (h ? 0.55 : 0.9) * tf(yy) * (0.75 + 0.25 * Math.sin(a * 3 + u * TAU)));
    }
  }
  for (let k = 0; k < 2; k++) { // estrelas orbitando devagar
    const n = k ? 5 : 8, rx = W * (k ? 0.3 : 0.44), ry = bh * (k ? 0.38 : 0.5), dir = k ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + k, tw = Math.sin(u * TAU * 2 + i) ** 2;
      for (let j = 0; j < 5; j++) {
        const a = a0 + dir * u * TAU - dir * j * 0.09, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        if (j === 0) star(f, x, y, tw > 0.5 ? 2 : 1, CRIT[6], tf(y));
        else put(f, x, y, CRIT[clamp(5 - j, 2, 5)], (1 - j / 5) * tf(y));
      }
    }
  }
  for (let i = 0; i < 8; i++) { // brilhos fixos piscando
    const m = 1 + (i % 2), ph = R(i, 2, 40), tw = Math.sin(fr(u * m + ph) * TAU) ** 2;
    const x = 3 + R(i, 3, 40) * (W - 6), y = bt - 2 + R(i, 4, 40) * (bh + 1);
    if (tw > 0.75) star(f, x, y, 2, CRIT[6], tf(y)); else if (tw > 0.35) star(f, x, y, 1, CRIT[5], tf(y)); else put(f, x, y, CRIT[4], tf(y));
  }
  for (let i = 0; i < 12; i++) { // poeira dourada subindo
    const m = 1 + (i % 2), ph = R(i, 5, 40), k = fr(u * m + ph);
    const x = 3 + R(i, 6, 40) * (W - 6) + Math.sin((k + ph) * TAU) * 2, y = base - 1 - k * Hh;
    put(f, x, y, CRIT[i % 3 ? 3 : 5], smooth(0, 0.15, k) * (1 - smooth(0.7, 1, k)) * tf(y));
  }
  const band = u * (W + 40) - 20; // reflexo dourado varrendo (um por ciclo)
  for (let y = bt; y < Hh; y++) for (let x = 0; x < W; x++) if (Math.abs(x + (Hh - 1 - y) * 0.8 - band) < 2) lum(f, x, y, [255, 225, 130], 0.22);
  glow(f, cx, cy, W * 0.5, bh * 0.95, [255, 190, 60], 0.26 + 0.1 * br);
}

// ======================= ERRO CRÍTICO (permanente, lento) =======================
const FUMB = pal(["#14060a", "#3a0e16", "#7a1a26", "#b83347", "#ff6b6b", "#ffd0d0"]);
const GLASS = pal(["#6a6a78", "#a9a9b8", "#d8d8e4", "#f6f6fa"]);
function tri(f, x, y, sz, c, a) { for (let r = 0; r < sz; r++) for (let d = -(sz - 1 - r); d <= sz - 1 - r; d++) put(f, x + d, y + r, c, a); }
function fumble(f, t, o) {
  const dur = 4.0, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt;
  const cx = Math.round(W * 0.24), cy = Math.round(bt + bh * 0.45), tf = (y) => smooth(0, 8, y);
  const crack = (pts, wd, ci) => { // rachadura fixa, com pulso vermelho correndo do centro para fora
    const n = pts.length - 1, p = fr(u * 2 - ci * 0.13);
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], al = tf((ay + by) / 2);
      if (al < 0.03) continue;
      const boost = clamp(1 - Math.abs(i / n - p) / 0.18);
      seg(f, ax, ay + 1, bx, by + 1, FUMB[boost > 0.3 ? 4 : 3], (0.5 + boost * 0.4) * al);
      seg(f, ax, ay, bx, by, boost > 0.55 ? FUMB[5] : GLASS[wd > 1 ? 3 : 2], al);
      if (boost > 0.3) lum(f, (ax + bx) / 2, (ay + by) / 2, [255, 60, 70], 0.35 * boost * al);
    }
  };
  const radials = [];
  for (let c = 0; c < 6; c++) {
    const a = (c / 6) * TAU + (R(c, 1, 50) - 0.5) * 0.5, len = 12 + R(c, 2, 50) * 24;
    const pts = jag(cx, cy, cx + Math.cos(a) * len * 1.2, cy + Math.sin(a) * len * 0.8, 3, c * 7 + 1, 3);
    radials.push(pts);
    crack(pts, 2, c);
    const m = pts[Math.floor(pts.length / 2)];
    crack(jag(m[0], m[1], m[0] + Math.cos(a + 0.9) * 12, m[1] + Math.sin(a + 0.9) * 9, 2, c * 11 + 3, 2), 1, c);
  }
  for (const [rr, a0, a1, sd] of [[8, 0.2, 2.6, 1], [16, 3.0, 5.6, 2]]) { // arcos concêntricos
    const pts = [];
    for (let k = 0; k <= 10; k++) { const a = lerp(a0, a1, k / 10); pts.push([cx + Math.cos(a) * rr * 1.2 + (R(k, sd, 51) - 0.5) * 2, cy + Math.sin(a) * rr * 0.8 + (R(k, sd + 5, 51) - 0.5) * 2]); }
    crack(pts, 1, sd * 2);
  }
  for (let i = 0; i < 6; i++) { // cacos soltando e caindo bem devagar
    const ph = R(i, 1, 54), k = fr(u + ph), pts = radials[i % 6], pt = pts[1 + Math.floor(R(i, 2, 54) * (pts.length - 2))];
    const x = pt[0] + Math.sin(k * TAU) * 1.5, y = pt[1] + k * (base + 4 - pt[1]);
    const al = smooth(0, 0.1, k) * (1 - smooth(0.75, 1, k)) * tf(y), sz = 2 + (i % 2);
    tri(f, Math.round(x), Math.round(y), sz, GLASS[2], al); put(f, Math.round(x), Math.round(y) - 1, FUMB[4], al);
  }
  const sl = Math.floor(t / 0.12); // falhas de sinal raras
  if (R(sl, 3, 50) < 0.1) {
    const yb = Math.round(bt + R(sl, 4, 50) * bh), x0 = R(sl, 5, 50) * W * 0.5, ln = 14 + R(sl, 6, 50) * 26;
    seg(f, x0, yb, x0 + ln, yb, FUMB[4], 0.7 * tf(yb)); seg(f, x0 + 2, yb + 1, x0 + ln + 2, yb + 1, FUMB[1], 0.8 * tf(yb + 1));
  }
  glow(f, cx, cy, W * 0.42, bh * 0.9, [190, 40, 60], 0.14 + 0.07 * Math.sin(u * TAU * 2));
}

// ############################################################################
// ##  VARIAÇÕES: cada efeito tem 2 desenhos alternativos, diferentes em forma,   ##
// ##  movimento e composição (não só na cor). variant: 0 = original, 1, 2.       ##
// ############################################################################

// ======================= FOGO B: tochas laterais =======================
function fireB(f, t, o) {
  const dur = 1.2, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  [[11, 0], [W - 12, 3]].forEach(([cx0, sd]) => {
    for (let y = 0; y < Hh; y++) for (let x = cx0 - 11; x <= cx0 + 11; x++) {
      if (x < 0 || x >= W) continue;
      const yb = base - y, g = yb / (Hh * 1.3), dxn = Math.abs(x - cx0) / 10;
      const xs = x + Math.sin(yb * 0.25 - (t / dur) * TAU + sd) * 1.8 * g;
      const n0 = vnoise(xs * 0.2, yb * 0.1 - u * 4, 4, 9 + sd) * 0.62 + vnoise(xs * 0.4 + 5, yb * 0.2 - u * 8, 8, 10 + sd) * 0.38;
      const n = clamp((n0 - 0.5) * 1.7 + 0.5);
      let h = n * 1.05 + 0.62 * Math.pow(1 - clamp(g), 1.5) - g * 0.85 - (dxn / (1 - g * 0.5)) * 0.55;
      const j = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      h += j * 0.14;
      if (h < 0.2) continue;
      put(f, x, y, FIRE[clamp(Math.round(((h - 0.2) / 0.85) * 7 + j * 0.5), 0, 7)]);
    }
    glow(f, cx0, base - 4, 13, 12, [255, 110, 25], 0.32 + 0.06 * Math.sin(u * TAU * 2));
  });
  for (let i = 0; i < 10; i++) { // brasas à deriva entre as tochas
    const ph = R(i, 1, 61), k = fr(u * (1 + (i % 2)) + ph), x = lerp(14, W - 15, R(i, 2, 61)) + Math.sin((k + ph) * TAU) * 3, y = base - 2 - k * (Hh - 4);
    put(f, x, y, FIRE[clamp(Math.round(7 - k * 4), 3, 7)], (1 - k * k) * smooth(0, 0.1, k));
  }
}

// ======================= FOGO C: bola de fogo =======================
function fireC(f, t, o) {
  const dur = 2.0, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cy0 = bt + bh * 0.5;
  const pos = (p) => [lerp(-14, W + 14, p), cy0 + Math.sin(p * TAU * 2) * 3.5];
  for (let j = 28; j >= 0; j--) { // rastro de chamas
    const [x, y] = pos(u - j * 0.011), r = Math.max(0.6, 4.4 - j * 0.14);
    const yy = y - j * 0.16 * (0.5 + 0.5 * Math.sin(j * 1.7 + u * TAU * 3)) - j * 0.12;
    disc(f, Math.round(x - j * 0.15), Math.round(yy), r, FIRE[clamp(Math.round(6 - j * 0.2), 1, 6)], clamp(1 - j / 30) * 0.95 + 0.05);
  }
  const [hx, hy] = pos(u);
  disc(f, Math.round(hx), Math.round(hy), 5, FIRE[3]); disc(f, Math.round(hx), Math.round(hy), 4, FIRE[4]);
  disc(f, Math.round(hx + 0.5), Math.round(hy), 3, FIRE[5]); disc(f, Math.round(hx + 1), Math.round(hy), 1.7, FIRE[7]);
  for (let i = 0; i < 9; i++) { // faíscas soltas
    const k = fr(u * 4 + i / 9), [ex, ey] = pos(u - k * 0.05);
    put(f, ex - k * 8, ey - k * 9 * (0.4 + R(i, 3, 62)) + (R(i, 4, 62) - 0.5) * 3, FIRE[clamp(Math.round(7 - k * 4), 3, 7)], 1 - k);
  }
  glow(f, hx, hy, 18, 12, [255, 120, 30], 0.5);
}

// ======================= ÁCIDO B: corrosão =======================
function acidB(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, tf = (y) => smooth(0, 8, y);
  for (let i = 0; i < 7; i++) {
    const ph = R(i, 1, 63), k = fr(u + ph), cx0 = Math.round(6 + R(i, 2, 63) * (W - 12)), cy0 = Math.round(bt + 3 + R(i, 3, 63) * (bh - 6));
    const rad = (k < 0.75 ? eo3(k / 0.75) : 1) * (2.5 + R(i, 4, 63) * 3.2), al = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    if (rad < 0.4) continue;
    const n = Math.ceil(rad + 2);
    for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) { // buraco corroído: miolo escuro, borda borbulhando
      const d = Math.hypot(x + 0.5, y + 0.5) - 0.6 * Math.sin(Math.atan2(y, x) * 3 + i);
      if (d < rad - 0.9) put(f, cx0 + x, cy0 + y, ACID[0], al * 0.95);
      else if (d < rad + 0.7) put(f, cx0 + x, cy0 + y, ACID[(x + y) & 1 ? 5 : 4], al);
      else if (d < rad + 1.8) put(f, cx0 + x, cy0 + y, ACID[2], al * 0.55);
    }
    for (let j = 0; j < 4; j++) { // bolhinhas chiando na borda
      const a = R(j + i * 5, 5, 63) * TAU;
      if (Math.sin(u * TAU * 6 + j * 1.9 + i) > 0.6) put(f, cx0 + Math.cos(a) * (rad + 0.5), cy0 + Math.sin(a) * (rad + 0.5), ACID[5], al);
    }
    for (let j = 0; j < 3; j++) { // fumaça verde subindo
      const kk = fr(u * 2 + ph + j / 3), yy = cy0 - 1 - kk * 11;
      put(f, cx0 + Math.sin((kk + j) * TAU) * 2, yy, ACID[2 + (j & 1)], 0.6 * (1 - kk) * al * tf(yy));
    }
    glow(f, cx0, cy0, rad * 3 + 3, rad * 2 + 3, [110, 255, 40], 0.18 * al);
  }
}

// ======================= ÁCIDO C: gosma escorrendo do teto =======================
function acidC(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16;
  const ceil = (x) => bt + 0.5 + 1.2 * Math.sin(x * 0.3 + u * TAU) + 0.8 * Math.sin(x * 0.13 - u * TAU * 2);
  for (let x = 0; x < W; x++) { // massa de gosma no topo da caixa
    const c = ceil(x);
    for (let y = Math.max(0, Math.floor(c) - 3); y <= Math.ceil(c); y++) {
      const d = c - y;
      put(f, x, y, ACID[d < 0.8 ? 5 : d < 2 ? 4 : d < 3 ? 3 : 2], Math.max(0.15, smooth(0, 6, y)));
    }
  }
  for (let i = 0; i < 8; i++) { // gotas que esticam, se soltam e caem
    const ph = R(i, 1, 64), k = fr(u + ph), x = Math.round(5 + (i + R(i, 2, 64) * 0.6) * ((W - 10) / 8)), cy0 = Math.round(ceil(x)), Lmax = 9 + R(i, 3, 64) * 8;
    if (k < 0.7) {
      const len = Lmax * Math.pow(k / 0.7, 1.4);
      for (let j = 0; j < len; j++) { put(f, x, cy0 + j, ACID[3]); put(f, x + 1, cy0 + j, ACID[j < 3 ? 3 : 2]); }
      put(f, x, cy0 + len, ACID[5]); put(f, x + 1, cy0 + len, ACID[4]); put(f, x, cy0 + len + 1, ACID[4]); put(f, x + 1, cy0 + len + 1, ACID[3]);
    } else {
      const q = (k - 0.7) / 0.3, stem = Lmax * Math.max(0, 1 - q / 0.2), y = lerp(cy0 + Lmax, base - 1, q * q);
      for (let j = 0; j < stem; j++) put(f, x, cy0 + j, ACID[3]);
      if (q < 0.93) { put(f, x, y, ACID[5]); put(f, x, y + 1, ACID[4]); put(f, x + 1, y + 1, ACID[3]); put(f, x, y - 1, ACID[4], 0.7); }
      else { const s2 = (q - 0.93) / 0.07; put(f, x - 1 - s2 * 2, base - 1 - s2, ACID[5], 1 - s2); put(f, x + 2 + s2 * 2, base - 1 - s2, ACID[4], 1 - s2); }
    }
  }
  glow(f, W / 2, bt, W * 0.5, 9, [100, 230, 40], 0.22);
}

// ======================= ELETRICIDADE B: orbe de plasma =======================
function lightningB(f, t, o) {
  const dur = 1.2, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.5;
  const slot = Math.floor(u * 12), p = u * 12 - slot, fl = 0.55 + 0.45 * Math.sin(u * TAU * 12);
  for (let a = 0; a < 6; a++) { // arcos saindo do orbe, mudando a cada 0,1 s
    const ang = (a / 6) * TAU + (R(slot, a, 70) - 0.5) * 0.9 + slot * 0.4, len = 16 + R(slot, a + 9, 70) * 22;
    drawBolt(f, jag(cx, cy, cx + Math.cos(ang) * len * 1.6, cy + Math.sin(ang) * len * 0.45, 3.5, slot * 17 + a, 3), fl * (1 - p * 0.4), p < 0.3);
  }
  disc(f, Math.round(cx), Math.round(cy), 3, ELEC[3]); disc(f, Math.round(cx), Math.round(cy), 2, ELEC[5]); put(f, cx, cy, ELEC[6]);
  for (let i = 0; i < 4; i++) { const a = u * TAU * 3 + (i / 4) * TAU; put(f, cx + Math.cos(a) * 8, cy + Math.sin(a) * 4.5, ELEC[6]); put(f, cx + Math.cos(a - 0.3) * 8, cy + Math.sin(a - 0.3) * 4.5, ELEC[4], 0.7); }
  glow(f, cx, cy, 16, 9, [80, 150, 255], 0.55 * fl);
}

// ======================= ELETRICIDADE C: corrente correndo pela borda =======================
function lightningC(f, t, o) {
  const dur = 1.2, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, w = W - 2, h = bh - 1, P = 2 * w + 2 * h;
  const perim = (s) => { // posição na borda da caixa + direção para dentro
    s = mod(s, P);
    if (s < w) return [1 + s, bt, 0, 1];
    if (s < w + h) return [W - 2, bt + (s - w), -1, 0];
    if (s < 2 * w + h) return [W - 2 - (s - w - h), Hh - 1, 0, -1];
    return [1, Hh - 1 - (s - 2 * w - h), 1, 0];
  };
  const slot = Math.floor(u * 16);
  for (let s = 0; s < P; s++) { const [px, py] = perim(s); if (R(slot, s, 72) < 0.22) put(f, px, py, ELEC[3], 0.7); } // borda crepitando
  for (let k = 0; k < 3; k++) {
    const head = fr(u + k / 3) * P, trail = [];
    for (let i = 30; i >= 0; i--) { // trilha irregular rente à borda, da cauda até a cabeça
      const [px, py, nx, ny] = perim(head - i), jt = Math.abs((R(slot, i + k * 31, 71) - 0.5) * 4.6 * (1 - i / 36));
      trail.push([px + nx * jt, py + ny * jt]);
    }
    drawBolt(f, trail, 1, true);
    const [hx, hy, nx, ny] = perim(head), L = 7 + R(slot, k + 40, 71) * 9;
    drawBolt(f, jag(hx, hy, hx + nx * L, hy + ny * L + (R(slot, k + 50, 71) - 0.5) * 6, 3, slot * 7 + k, 3), 0.9, false); // raio saltando para dentro
    lum(f, hx, hy, [120, 190, 255], 0.5);
  }
}

// ======================= ESSÊNCIA MÁGICA B: círculo rúnico =======================
const GLYPHS = [["111", "101", "111", "101", "101"], ["010", "111", "010", "010", "111"], ["101", "111", "010", "111", "101"], ["110", "101", "110", "101", "110"], ["111", "010", "111", "010", "111"]];
function forceB(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.45, tf = (y) => smooth(0, 8, y);
  for (const [rx, ry, dir, n] of [[24, 8, 1, 170], [17, 5.6, -1, 120]]) { // anéis rúnicos girando em sentidos opostos
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if (fr((i / n) * 12 + dir * u * 3) > 0.62) continue;
      const hot = Math.sin(a * 2 - dir * u * TAU * 2) > 0.5, y = cy + Math.sin(a) * ry;
      put(f, cx + Math.cos(a) * rx, y, AUV[hot ? 5 : 3], tf(y)); if (hot) put(f, cx + Math.cos(a) * (rx - 1), y + 0.5, AUV[2], 0.8 * tf(y));
    }
  }
  for (let i = 0; i < 6; i++) { // runas orbitando o círculo
    const a = u * TAU + (i / 6) * TAU, gx = cx + Math.cos(a) * 29, gy = cy + Math.sin(a) * 8.6, back = Math.sin(a) < 0;
    const pulse = 0.55 + 0.45 * Math.sin(u * TAU * 2 + i), g = GLYPHS[i % 5];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === "1") put(f, gx + c - 1, gy + r - 2, AUV[back ? 3 : 5], pulse * (back ? 0.6 : 1));
    lum(f, gx, gy, [150, 100, 255], 0.3 * pulse);
  }
  for (let i = 0; i < 8; i++) { const k = fr(u + R(i, 1, 81)), x = cx + (R(i, 2, 81) - 0.5) * 36, y = cy + 6 - k * 18; put(f, x, y, AUC[3], smooth(0, 0.15, k) * (1 - k) * tf(y)); }
  glow(f, cx, cy + 2, 26, 9, [120, 70, 255], 0.22 + 0.06 * Math.sin(u * TAU * 2));
}

// ======================= ESSÊNCIA MÁGICA C: constelação arcana =======================
function forceC(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, tf = (y) => smooth(0, 8, y), N = 14, pts = [];
  for (let i = 0; i < N; i++) {
    const m = 1 + (i % 2);
    pts.push([4 + (((i * 5) % N) + R(i, 1, 80) * 0.8) / N * (W - 8) + Math.sin(u * TAU * m + i) * 2.5, bt - 3 + R(i, 2, 80) * (Hh - bt + 1) + Math.cos(u * TAU * m + i * 1.7) * 2]);
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.hypot(pts[i][0] - pts[j][0], (pts[i][1] - pts[j][1]) * 1.6);
    if (d > 24) continue;
    const al = 1 - d / 24, ym = (pts[i][1] + pts[j][1]) / 2;
    seg(f, pts[i][0], pts[i][1], pts[j][0], pts[j][1], AUV[al > 0.45 ? 4 : 3], Math.min(1, 0.55 + al * 0.8) * tf(ym));
    if (al > 0.35) { const k = fr(u * 2 + (i * 7 + j * 3) / 20), sy = lerp(pts[i][1], pts[j][1], k); put(f, lerp(pts[i][0], pts[j][0], k), sy, AUV[5], tf(sy)); } // sinal viajando
  }
  pts.forEach(([x, y], i) => {
    const tw = Math.sin(u * TAU * 2 + i) ** 2;
    star(f, x, y, tw > 0.5 ? 2 : 1, i % 4 === 0 ? AUC[3] : AUV[5], tf(y)); put(f, x, y, AUV[5]);
    lum(f, x, y, i % 4 === 0 ? [90, 220, 240] : [140, 90, 255], 0.2 * tw);
  });
}

// ======================= FRIO B: nevasca =======================
function coldB(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, tf = (y) => smooth(0, 6, y);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { // geada crescendo nas laterais, ao ritmo do vento
    const d = Math.min(x, W - 1 - x), reach = 10 + 2 * Math.sin(u * TAU);
    if (d > reach) continue;
    const n = vnoise(x * 0.5, y * 0.45, 8, 21), th = 0.3 + (d / reach) * 0.8;
    if (n > th) put(f, x, y, ICE[d < 3 ? 4 : n > th + 0.18 ? 3 : 2], tf(y));
  }
  for (let i = 0; i < 24; i++) { // rajadas de vento
    const m = 1 + (i % 3), k = fr(u * m + R(i, 1, 81)), y = 1 + R(i, 2, 81) * (Hh - 2), len = 3 + m * 3, x = k * (W + 40) - 20;
    for (let j = 0; j < len; j++) put(f, x - j, y + Math.sin((x - j) * 0.2 + i) * 0.7, ICE[j < 2 ? 5 : j < len / 2 ? 4 : 3], (1 - j / len) * tf(y));
  }
  for (let i = 0; i < 16; i++) { // flocos empurrados na diagonal
    const m = 1 + (i % 2), k = fr(u * m + R(i, 3, 81)), x = mod(R(i, 4, 81) * W + k * 46, W + 8) - 4, y = k * (Hh + 4) - 2;
    if (i % 4 === 0) star(f, x, y, 1, ICE[5], tf(y)); else put(f, x, y, ICE[5], tf(y));
  }
  glow(f, W / 2, Hh * 0.6, W * 0.5, Hh * 0.8, [150, 210, 255], 0.14);
}

// ======================= FRIO C: flocos de neve gigantes =======================
function snowflake(f, cx, cy, r, rot, c1, c2, a) {
  for (let k = 0; k < 6; k++) {
    const ang = rot + (k * TAU) / 6, dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = r * 0.35; s <= r; s += 0.7) put(f, cx + dx * s, cy + dy * s, s > r * 0.8 ? c1 : c2, a);
    for (const [s0, bl] of [[0.55, 0.38], [0.78, 0.26]]) { // galhos
      const bx = cx + dx * r * s0, by = cy + dy * r * s0;
      for (const sg of [-1, 1]) { const ba = ang + sg * 1.05; for (let s = 0.6; s <= r * bl; s += 0.7) put(f, bx + Math.cos(ba) * s, by + Math.sin(ba) * s, c1, a); }
    }
    put(f, cx + dx * (r + 1), cy + dy * (r + 1), c1, a);
  }
}
function coldC(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cy = bt + bh * 0.5, rot = u * (TAU / 6);
  snowflake(f, W / 2, cy, 12, rot, ICE[5], ICE[4], 0.75);
  snowflake(f, 12, cy - 1, 7, -rot, ICE[5], ICE[3], 1);
  snowflake(f, W - 13, cy + 1, 7.5, rot + 0.3, ICE[5], ICE[3], 1);
  for (let i = 0; i < 12; i++) { // brilhos de gelo
    const tw = Math.sin(fr(u * (1 + (i % 2)) + R(i, 1, 82)) * TAU) ** 2, x = 3 + R(i, 2, 82) * (W - 6), y = 2 + R(i, 3, 82) * (Hh - 5);
    if (tw > 0.7) star(f, x, y, 1, ICE[5]); else if (tw > 0.3) put(f, x, y, ICE[4]);
  }
  glow(f, W / 2, cy, W * 0.5, bh * 0.9, [120, 190, 255], 0.2 + 0.05 * Math.sin(u * TAU * 2));
}

// ======================= LUZ B: luz divina (raios do alto) =======================
function radiantB(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { // feixes inclinados descendo do alto
    const s = x + y * 0.8, v = (0.5 + 0.5 * Math.sin(s * 0.34 + u * TAU * 2)) * (0.5 + 0.5 * Math.sin(s * 0.09 - u * TAU));
    const a = (v - 0.3) * 2.6 * smooth(0, 5, y) * (1 - 0.55 * (y / Hh)) * edgeFade(x, W, 6);
    if (a > 0.06) put(f, x, y, GOLD[clamp(Math.round(2 + v * 2.2), 1, 4)], Math.min(0.9, a));
  }
  for (let i = 0; i < 16; i++) { // poeira flutuando na luz
    const m = 1 + (i % 2), ph = R(i, 1, 90) * TAU, x = 4 + R(i, 2, 90) * (W - 8) + Math.sin(u * TAU * m + ph) * 3, y = 4 + R(i, 3, 90) * (Hh - 8) + Math.cos(u * TAU * m + ph) * 2;
    const tw = Math.sin(u * TAU * 2 + ph) ** 2;
    put(f, x, y, GOLD[tw > 0.6 ? 6 : 5], 0.5 + tw * 0.5); lum(f, x, y, [255, 220, 120], 0.18 * tw);
  }
  glow(f, W / 2, 0, W * 0.55, 14, [255, 210, 100], 0.24 + 0.05 * Math.sin(u * TAU * 2));
}

// ======================= LUZ C: penas de luz =======================
function radiantC(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur;
  for (let i = 0; i < 9; i++) {
    const ph = R(i, 1, 91), k = fr(u + ph), x = 5 + R(i, 2, 91) * (W - 10) + Math.sin(k * TAU * 1.5 + ph * TAU) * 6, y = -4 + k * (Hh + 8);
    const sway = Math.cos(k * TAU * 1.5 + ph * TAU), al = smooth(0, 0.1, k) * (1 - smooth(0.85, 1, k)), len = 9 + (i % 3) * 2;
    for (let j = 0; j < len; j++) { // pena: haste curva com barbas que alargam no meio e afinam na ponta
      const px = x + sway * j * 0.5, py = y + j * 0.85, bw = Math.sin((j / len) * Math.PI) * 3.2;
      put(f, px, py, GOLD[j < 2 ? 6 : 5], al);
      for (let q = 1; q <= bw; q++) { put(f, px - q, py + q * 0.5, GOLD[q < bw - 1 ? 4 : 3], al * 0.95); put(f, px + q, py - q * 0.3, GOLD[q < bw - 1 ? 5 : 4], al * 0.85); }
    }
    for (let j = 1; j < 4; j++) put(f, x + (R(i * 4 + j, 5, 92) - 0.5) * 3, y - j * 2, GOLD[5], al * 0.5 * (1 - j / 4)); // rastro de brilho
    lum(f, x, y + 2, [255, 215, 110], 0.3 * al);
  }
  glow(f, W / 2, 0, W * 0.55, 12, [255, 210, 100], 0.26);
}

// ======================= PSÍQUICO B: espiral hipnótica =======================
function psychicB(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.52, tf = (y) => smooth(0, 8, y);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.7, r = Math.hypot(dx, dy);
    if (r < 5 || r > 31) continue;
    const v = Math.sin(Math.atan2(dy, dx) * 3 + r * 0.42 - u * TAU * 2) * 0.5 + 0.5, val = v * smooth(5, 9, r) * (1 - smooth(20, 31, r));
    if (val > 0.5) put(f, x, y, PSY[clamp(Math.round(2 + (val - 0.5) * 7), 2, 5)], Math.min(1, (val - 0.45) * 3) * tf(y));
    else if (val > 0.3) put(f, x, y, PSY[1], (val - 0.3) * 2.2 * tf(y));
  }
  for (let i = 0; i < 44; i++) { const a = (i / 44) * TAU; put(f, cx + Math.cos(a) * 7, cy + Math.sin(a) * 4.1, PSY[5], 0.75 + 0.25 * Math.sin(u * TAU * 4)); }
  glow(f, cx, cy, W * 0.45, bh * 0.9, [255, 70, 180], 0.18 + 0.06 * Math.sin(u * TAU * 2));
}

// ======================= PSÍQUICO C: ondas mentais =======================
function psychicC(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt;
  for (let k = 0; k < 3; k++) {
    const yb = bt + bh * (0.22 + 0.28 * k), dir = k === 1 ? -1 : 1, pc = dir > 0 ? fr(u + k / 3) * (W + 50) - 25 : W + 25 - fr(u + k / 3) * (W + 50);
    let px = 0, py = yb;
    for (let x = 0; x < W; x++) {
      const env = Math.exp(-(((x - pc) / 15) ** 2)), y = yb + 5.2 * env * Math.sin(x * 0.58 - dir * u * TAU * 4);
      if (x > 0) seg(f, px, py, x, y, PSY[clamp(Math.round(2 + env * 3.4), 2, 5)], 0.55 + env * 0.45);
      if (env < 0.15 && x % 3 === 0) put(f, x, yb, PSY[1], 0.7); // linha de base pontilhada
      px = x; py = y;
    }
    const pyk = yb + 5.2 * Math.sin(pc * 0.58 - dir * u * TAU * 4); // brilho no pico do pacote
    lum(f, pc, pyk, [255, 90, 190], 0.45); put(f, pc, pyk, PSY[5]);
  }
}

// ======================= TREVAS B: tentáculos de sombra =======================
function necroticB(f, t, o) {
  const dur = 3.2, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  for (let y = Hh - 6; y < Hh; y++) for (let x = 0; x < W; x++) { // névoa escura no chão
    const n = vnoise(x * 0.14, y * 0.4 - u * 4, 4, 33);
    if (n > 0.38) put(f, x, y, DARK[n > 0.62 ? 1 : 2], 0.75);
  }
  [7, 22, 54, 69].forEach((x0, i) => {
    const L = 17 + (i % 2) * 4, sg = i < 2 ? 1 : -1, pts = [];
    for (let s = 0; s <= 1.0001; s += 0.05) pts.push([Math.round(x0 + Math.sin(s * 3.6 - u * TAU + i * 1.3) * (2 + s * 6) * sg + s * s * 7 * sg), Math.round(base - s * L), (1 - s) * 2.8 + 0.6, s]);
    for (const [x, y, w] of pts) disc(f, x, y, w + 1, DARK[4]);                       // contorno violeta
    for (const [x, y, w, s] of pts) disc(f, x, y, w, DARK[s < 0.5 ? 1 : 2]);          // corpo escuro
    const [tx, ty] = pts[pts.length - 1];
    put(f, tx, ty, SOUL[3]); put(f, tx, ty - 1, SOUL[2], 0.8); lum(f, tx, ty, [100, 255, 120], 0.35);
  });
  glow(f, W / 2, base, W * 0.5, 9, [110, 50, 200], 0.2);
}

// ======================= TREVAS C: almas errantes =======================
function necroticC(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, tf = (y) => smooth(0, 8, y);
  for (let y = Hh - 5; y < Hh; y++) for (let x = 0; x < W; x++) {
    const n = vnoise(x * 0.15, y * 0.4 - u * 3, 3, 34);
    if (n > 0.4) put(f, x, y, DARK[n > 0.6 ? 1 : 2], 0.7);
  }
  for (let i = 0; i < 5; i++) {
    const ph = R(i, 1, 100), k = fr(u + ph), x0 = 8 + R(i, 2, 100) * (W - 16);
    const path = (kk) => [x0 + Math.sin(kk * TAU * 1.2 + ph * TAU) * 5, base + 3 - kk * (Hh + 8)];
    const al = smooth(0, 0.12, k) * (1 - smooth(0.8, 1, k));
    for (let j = 18; j >= 1; j--) { const kk = k - j * 0.012; if (kk < 0) continue; const [x, y] = path(kk), w = 2.4 * (1 - j / 19); disc(f, Math.round(x), Math.round(y + 2), w, SOUL[j < 6 ? 1 : 0], (1 - j / 19) * al * 0.75 * tf(y)); }
    const [x, y] = path(k), a = al * tf(y);
    disc(f, Math.round(x), Math.round(y), 3.6, SOUL[1], a); disc(f, Math.round(x - 0.5), Math.round(y - 0.5), 2.8, SOUL[2], a);
    for (let j = 0; j < 5; j++) disc(f, Math.round(x - 3 + j * 1.5), Math.round(y + 3.5 + (j & 1)), 1, SOUL[2], a * 0.9);   // barra ondulada
    put(f, x - 1.5, y - 1, DARK[0], a); put(f, x - 1.5, y, DARK[0], a); put(f, x + 1.5, y - 1, DARK[0], a); put(f, x + 1.5, y, DARK[0], a); put(f, x, y + 1.5, DARK[0], a * 0.8); // olhos e boca
    lum(f, x, y, [100, 255, 130], 0.3 * a);
  }
  glow(f, W / 2, base, W * 0.5, 9, [100, 50, 180], 0.18);
}

// ======================= CORTE: helper de golpe em arco =======================
function clawArc(f, x0, y0, x1, y1, curv, reveal, thick, al, core, edge) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), mx = (x0 + x1) / 2 - (dy / len) * curv * 2, my = (y0 + y1) / 2 + (dx / len) * curv * 2;
  for (let i = 0; i <= 60; i++) {
    const sN = i / 60;
    if (sN > reveal) break;
    const px = (1 - sN) ** 2 * x0 + 2 * sN * (1 - sN) * mx + sN * sN * x1, py = (1 - sN) ** 2 * y0 + 2 * sN * (1 - sN) * my + sN * sN * y1;
    let tx = 2 * (1 - sN) * (mx - x0) + 2 * sN * (x1 - mx), ty = 2 * (1 - sN) * (my - y0) + 2 * sN * (y1 - my);
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const w = thick * Math.pow(Math.sin(Math.PI * sN), 0.7);
    for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) { const aj = Math.abs(j); if (aj > w + 0.2) continue; put(f, px - ty * j, py + tx * j, aj < 0.6 ? core : edge, al * (aj < 0.6 ? 1 : 0.85)); }
  }
}

// ======================= CORTE B: garras =======================
function slashingB(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, slot = Math.floor(u * 2), A = fr(u * 2) * 0.8, mir = slot % 2;
  const X = (x) => (mir ? W - 1 - x : x), bx = 8 + (mir ? 8 : 0) + R(slot, 1, 101) * 14, RED = [235, 70, 70];
  for (let c = 0; c < 3; c++) { // três arranhões paralelos, um logo depois do outro
    const rv = eo3((A - c * 0.05) / 0.1), th = 2.3 * (A < 0.4 ? 1 : 1 - (A - 0.4) / 0.4), al = 1 - smooth(0.5, 0.8, A);
    if (rv <= 0 || th <= 0) continue;
    const x0 = X(bx + c * 7), y0 = bt - 6, x1 = X(bx + c * 7 + 15), y1 = Hh;
    clawArc(f, x0 + (mir ? -1 : 1), y0 + 1, x1 + (mir ? -1 : 1), y1 + 1, mir ? -3 : 3, rv, th, al * 0.7, RED, [150, 40, 50]); // sangue na borda
    clawArc(f, x0, y0, x1, y1, mir ? -3 : 3, rv, th, al, STEEL[5], STEEL[3]);
    if (A < 0.3) lum(f, (x0 + x1) / 2, (y0 + y1) / 2, [255, 150, 150], 0.25 * (1 - A / 0.3));
  }
  if (A > 0.04 && A < 0.45) for (let j = 0; j < 8; j++) { // fagulhas
    const q = A - 0.04, a = R(j + slot * 9, 2, 101) * TAU, sp = 10 + R(j + slot * 9, 3, 101) * 22;
    put(f, X(bx + 12) + Math.cos(a) * sp * q, bt + 6 + Math.sin(a) * sp * q + 30 * q * q, j & 1 ? RED : STEEL[5], 1 - q / 0.41);
  }
}

// ======================= CORTE C: redemoinho de lâminas =======================
function slashingC(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.48;
  for (const [rx, ry, n, dir] of [[27, 8.2, 4, 1], [17, 5.4, 3, -1]]) {
    for (let i = 0; i < n; i++) {
      const a0 = u * TAU * dir + (i / n) * TAU;
      for (let j = 14; j >= 0; j--) { // rastro curvo atrás da lâmina
        const a = a0 - dir * j * 0.045;
        put(f, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, STEEL[clamp(5 - Math.floor(j / 3), 1, 5)], (1 - j / 15) * (Math.sin(a) < -0.2 ? 0.55 : 1)); put(f, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + 1, STEEL[2], (1 - j / 15) * 0.6);
      }
      const px = cx + Math.cos(a0) * rx, py = cy + Math.sin(a0) * ry, tx = -Math.sin(a0) * rx * dir, ty = Math.cos(a0) * ry * dir, tl = Math.hypot(tx, ty), ux = tx / tl, uy = ty / tl, nx = -uy, ny = ux;
      for (let j = -6; j <= 6; j++) { // lâmina em crescente
        const bow = -0.1 * j * j;
        put(f, px + ux * j + nx * bow, py + uy * j + ny * bow, STEEL[Math.abs(j) < 3 ? 5 : 4]);
        put(f, px + ux * j + nx * (bow + 1), py + uy * j + ny * (bow + 1), STEEL[3]);
        put(f, px + ux * j + nx * (bow + 2), py + uy * j + ny * (bow + 2), STEEL[2], 0.8);
      }
      lum(f, px, py, [170, 200, 255], 0.3);
    }
  }
  glow(f, cx, cy, W * 0.45, bh * 0.8, [150, 180, 255], 0.1);
}

// ======================= PERFURAÇÃO B: flechas =======================
function piercingB(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt;
  for (let i = 0; i < 6; i++) {
    const k = fr(u + ((i * 0.37) % 1)), y = Math.round(bt + 1.5 + i * ((bh - 3) / 5) + Math.sin(k * TAU) * 0.8), x = Math.round(lerp(-16, W + 6, k));
    for (let j = 1; j < 10; j++) put(f, x - 12 - j, y, STEEL[2], (1 - j / 10) * 0.5); // rastro
    for (let j = 0; j < 12; j++) put(f, x - j, y, j < 2 ? BRONZE[5] : BRONZE[3]);       // haste
    put(f, x + 1, y, STEEL[5]); put(f, x + 2, y, STEEL[5]); put(f, x, y - 1, STEEL[4]); put(f, x, y + 1, STEEL[4]); put(f, x - 1, y - 1, STEEL[3]); put(f, x - 1, y + 1, STEEL[3]); // ponta
    for (let j = 0; j < 3; j++) { put(f, x - 9 - j, y - 1 - (j > 0), STEEL[4]); put(f, x - 9 - j, y + 1 + (j > 0), STEEL[4]); } // penas
    lum(f, x + 1, y, [190, 215, 255], 0.2);
  }
}

// ======================= PERFURAÇÃO C: estacas do alto =======================
function piercingC(f, t, o) {
  const dur = 1.6, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, n = 6, L = 13, tf = (y) => smooth(0, 7, y);
  for (let i = 0; i < n; i++) {
    const x = Math.round(7 + i * ((W - 14) / (n - 1)) + (R(i, 1, 111) - 0.5) * 3), k = fr(u - i * 0.1);
    let tipY, al = 1, vib = 0;
    if (k < 0.22) tipY = lerp(-L, base - 1, Math.pow(k / 0.22, 2));
    else { tipY = base - 1; const q = (k - 0.22) / 0.78; vib = q < 0.3 ? Math.round(Math.sin(q * 60) * (1 - q / 0.3)) : 0; al = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4; }
    for (let j = 0; j < L; j++) {
      const y = tipY - j, xx = x + Math.round(vib * (j / L)), a = al * tf(y);
      put(f, xx, y, STEEL[j < 2 ? 5 : j < 9 ? 4 : 3], a);
      put(f, xx + 1, y, STEEL[j < 2 ? 4 : 2], a); if (j > 1) put(f, xx - 1, y, STEEL[5], a * 0.9);
    }
    for (let q = -2; q <= 2; q++) { put(f, x + q, tipY - L + 1, BRONZE[Math.abs(q) > 1 ? 2 : q ? 3 : 5], al * tf(tipY - L + 1)); put(f, x + q, tipY - L, BRONZE[2], al * tf(tipY - L)); } // cabo na ponta de cima
    if (k > 0.22 && k < 0.34) { const q = (k - 0.22) / 0.12; for (const sg of [-1, 1]) { put(f, x + sg * (2 + q * 4), base - 1 - q * 3, BRONZE[5], 1 - q); put(f, x + sg * (3 + q * 5), base - q * 2, BRONZE[3], 1 - q); } lum(f, x, base - 1, [255, 200, 120], 0.4 * (1 - q)); }
  }
}

// ======================= IMPACTO B: explosão de impacto (estilo quadrinhos) =======================
const IMP = pal(["#5a1a05", "#c4450a", "#ff8a1c", "#ffd84a", "#fff6c8"]);
function bludgeoningB(f, t, o) {
  const dur = 1.2, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cy = bt + bh * 0.5;
  const sc = u < 0.12 ? 0.3 + 0.7 * eo3(u / 0.12) : 1 + 0.05 * Math.sin(u * TAU * 6), fade = 1 - smooth(0.85, 1, u);
  const sh = u > 0.12 && u < 0.5 ? Math.round(Math.sin(u * TAU * 14) * 1.2 * (1 - (u - 0.12) / 0.38)) : 0, cx = W / 2 + sh, nS = 12, R1 = 21 * sc, R2 = 11 * sc;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.9, r = Math.hypot(dx, dy);
    if (r > R1 + 1) continue;
    const tw = Math.abs(fr((Math.atan2(dy, dx) / TAU) * nS) * 2 - 1), rth = R2 + (R1 - R2) * Math.pow(tw, 1.3), d = rth - r;
    if (d < 0) continue;
    if (d < 1.5) put(f, x, y, IMP[4], fade); else if (d < 3.2) put(f, x, y, IMP[d < 2.4 ? 3 : 2], fade);
  }
  for (let i = 0; i < 14; i++) { // riscos de velocidade saindo do centro
    const a = (i / 14) * TAU + 0.2, k = fr(u * 3 + i / 14), r0 = R1 * 1.08 + k * 9;
    for (let j = 0; j < 4; j++) put(f, cx + Math.cos(a) * (r0 + j), cy + Math.sin(a) * (r0 + j) / 1.9, IMP[3], (1 - k) * fade * (u > 0.1 ? 1 : 0));
  }
  glow(f, cx, cy, W * 0.4, bh * 0.9, [255, 150, 40], 0.3 * fade);
}

// ======================= IMPACTO C: martelo pendular =======================
function bludgeoningC(f, t, o) {
  const dur = 2.0, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, cx = W / 2, py0 = -3, L = 24, ang = (uu) => 1.05 * Math.sin(uu * TAU);
  const head = (th, al, hot) => {
    const tx = cx + Math.sin(th) * L, ty = py0 + Math.cos(th) * L, dx = Math.sin(th), dy = Math.cos(th), px = Math.cos(th), py = -Math.sin(th);
    for (let a = -4.5; a <= 4.5; a += 0.6) for (let b = -2.6; b <= 2.6; b += 0.6) put(f, tx + px * a + dx * b, ty + py * a + dy * b, STEEL[b < -1.4 ? 5 : b > 1.4 ? 1 : hot ? 4 : 3], al);
  };
  for (let j = 7; j >= 1; j--) head(ang(u - j * 0.012), (1 - j / 8) * 0.45, false); // rastro do balanço
  const th = ang(u), tx = cx + Math.sin(th) * L, ty = py0 + Math.cos(th) * L;
  seg(f, cx, py0, tx, ty, BRONZE[3], 1); seg(f, cx + 1, py0, tx + 1, ty, BRONZE[2], 1);
  head(th, 1, true);
  const q = fr(u * 2); // a cada passagem pelo ponto mais baixo: onda de poeira e fagulhas
  if (q < 0.35) {
    const k = q / 0.35;
    for (let i = 0; i < 160; i++) { const a = (i / 160) * TAU, r = q * 70; put(f, cx + Math.cos(a) * r, base - 1 + Math.sin(a) * r * 0.25, DUST[4], (1 - k) * 0.9); }
    for (let i = 0; i < 10; i++) { const a = Math.PI * (1.12 + R(i, 1, 112) * 0.76), sp = 20 + R(i, 2, 112) * 30; put(f, cx + Math.cos(a) * sp * q, base - 1 + Math.sin(a) * sp * q + 60 * q * q, DUST[3 + (i & 1)], 1 - k); }
    glow(f, cx, base - 1, 22, 10, [255, 210, 130], 0.7 * (1 - k));
  }
}

// ======================= MANA B: absorção de mana =======================
function manaB(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.5, tf = (y) => smooth(0, 8, y);
  for (let i = 0; i < 40; i++) { // partículas de mana espiralando para o centro
    const m = 1 + (i % 2), ph = R(i, 1, 120), a0 = R(i, 2, 120) * TAU;
    for (let j = 0; j < 9; j++) {
      const k = fr(u * m + ph - j * 0.014), r = 1 - k, a = a0 + k * 2.4, x = cx + Math.cos(a) * (38 * r + 3), y = cy + Math.sin(a) * (12 * r + 1.5);
      const al = smooth(0, 0.1, k) * (1 - smooth(0.9, 1, k)) * (1 - j * 0.1);
      put(f, x, y, MANA[clamp(5 - Math.floor(j / 2), 2, 5)], al * tf(y));
      if (j < 3) put(f, x + 1, y, MANA[clamp(5 - j, 2, 5)], al * tf(y)); if (j === 0) { put(f, x, y + 1, MANA[4], al * tf(y)); put(f, x + 1, y + 1, MANA[3], al * tf(y)); lum(f, x, y, [80, 180, 255], 0.25 * al); }
    }
  }
  const pulse = bump(fr(u * 2), 0.06, 0.05); // clarão quando as partículas chegam
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, r = 3 + pulse * 9; put(f, cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 0.7, MANA[5], pulse * 0.9); }
  glow(f, cx, cy, 16, 9, [90, 190, 255], 0.2 + 0.5 * pulse);
}

// ======================= MANA C: fonte de mana =======================
function manaC(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur;
  for (const [x0, Hmax, sp] of [[W * 0.18, 17, 15], [W * 0.5, 21, 11], [W * 0.82, 17, 15]]) {
    for (let j = 0; j < 12; j++) { // gotas em arcos parabólicos
      const dirx = ((j % 5) - 2) / 2, k = fr(u * 2 + j / 12 + 0.02);
      for (let tr = 0; tr < 6; tr++) {
        const kk = k - tr * 0.022; if (kk < 0) continue;
        const x = x0 + dirx * sp * kk, y = base - 4 * Hmax * kk * (1 - kk), a = (1 - tr * 0.16) * smooth(0, 0.05, kk);
        put(f, x, y, MANA[tr < 2 ? 5 : tr < 4 ? 4 : 3], a);
        if (tr < 2) { put(f, x + 1, y, MANA[4], a); put(f, x, y + 1, MANA[3], a); }
      }
      if (k > 0.93) { const q = (k - 0.93) / 0.07; put(f, x0 + dirx * sp - 1 - q, base - q, MANA[5], 1 - q); put(f, x0 + dirx * sp + 1 + q, base - q, MANA[5], 1 - q); }
    }
    const rr = fr(u * 2) * 10; // ondas na base
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; put(f, x0 + Math.cos(a) * rr * 1.5, base - 0.5 + Math.sin(a) * rr * 0.28, MANA[4], 1 - rr / 10); }
    lum(f, x0, base - 2, [90, 190, 255], 0.3);
  }
  for (let x = 0; x < W; x++) { put(f, x, base, MANA[2]); if (Math.sin(x * 0.55 + u * TAU * 3) > 0.6) put(f, x, base - 1, MANA[4]); }
  glow(f, W / 2, base, W * 0.5, 10, [60, 160, 255], 0.22);
}

// ======================= CURA B: brotos e flores =======================
function healB(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, n = 6, GOLDF = [255, 232, 130];
  for (let i = 0; i < n; i++) {
    const x0 = 6 + i * ((W - 12) / (n - 1)) + (R(i, 1, 130) - 0.5) * 3, Hm = 11 + R(i, 2, 130) * 8, k = fr(u + i * 0.16);
    const grow = eo3(Math.min(1, k / 0.55)), al = 1 - smooth(0.82, 1, k), Hn = Hm * grow;
    const vx = (s) => x0 + Math.sin(s * 0.45 + i + u * TAU) * 1.6 * (s / Hm);
    let lx = x0, ly = base;
    for (let s = 0; s <= Hn; s += 0.5) { // caule
      lx = vx(s); ly = base - s;
      put(f, lx, ly, HEAL[s < 3 ? 1 : 2], al); put(f, lx + 1, ly, HEAL[1], al * 0.8);
    }
    for (const [sl, sg] of [[3, 1], [6.4, -1], [9.8, 1], [13.2, -1]]) { // folhas
      if (Hn < sl + 1 || sl > Hm) continue;
      const lf = Math.min(1, (Hn - sl) / 3);
      for (let q = 1; q <= 4 * lf; q++) put(f, vx(sl) + sg * q, base - sl - q * 0.55, HEAL[q < 3 ? 3 : 4], al);
    }
    if (k > 0.5) { // flor abrindo
      const b = eo3((k - 0.5) / 0.15) * al, fx = lx, fy = ly - 1;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) put(f, fx + dx, fy + dy, i % 2 ? HEAL[5] : [255, 190, 210], b);
      put(f, fx, fy, GOLDF, b); put(f, fx + 1, fy, GOLDF, b * 0.8);
      lum(f, fx, fy, [140, 255, 150], 0.3 * b);
    }
  }
  for (let i = 0; i < 8; i++) { // pétalas subindo
    const k = fr(u * 2 + R(i, 3, 130)), x = 4 + R(i, 4, 130) * (W - 8) + Math.sin(k * TAU * 2 + i) * 3, y = base - 2 - k * (Hh - 4);
    put(f, x, y, i % 2 ? HEAL[5] : [255, 190, 210], (1 - k) * smooth(0, 0.1, k) * smooth(0, 7, y));
  }
  glow(f, W / 2, base, W * 0.5, 10, [70, 230, 110], 0.26);
}

// ======================= CURA C: batimento cardíaco =======================
function healC(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, yb = bt + bh * 0.62, P = 38;
  const wave = [[0, 0], [8, 0], [9.5, 1.4], [11, 0], [13, 0], [14, -1.8], [15.5, 9], [17, -3.5], [18.5, 0], [22, 0], [25, 2.4], [28, 0], [38, 0]];
  const hAt = (p) => { for (let i = 1; i < wave.length; i++) if (p <= wave[i][0]) { const [x0, y0] = wave[i - 1], [x1, y1] = wave[i]; return lerp(y0, y1, (p - x0) / (x1 - x0)); } return 0; };
  let px = 0, py = yb;
  for (let x = 0; x < W; x++) { // traçado rolando para a direita
    const h = hAt(mod(x - u * P, P)), y = yb - h;
    if (x > 0) { seg(f, px, py, x, y, HEAL[Math.abs(h) > 4 ? 5 : 4], 1); seg(f, px, py + 1, x, y + 1, HEAL[2], 0.85); }
    if (Math.abs(h) > 4) lum(f, x, y, [110, 255, 140], 0.35);
    px = x; py = y;
  }
  for (let k = 0; k < 2; k++) { // sinal de + subindo de cada pico
    const xp = mod(15.5 + u * P + k * P, 2 * P), q = fr(u * 2 + k * 0.5);
    star(f, xp, yb - 10 - q * 6, 1, HEAL[5], (1 - q) * smooth(0, 8, yb - 10 - q * 6));
  }
  glow(f, W / 2, yb, W * 0.5, 9, [70, 230, 110], 0.2);
}

// ======================= PERDA DE VIDA B: respingos de sangue =======================
function drainB(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, tf = (y) => smooth(0, 8, y);
  for (let i = 0; i < 5; i++) {
    const k = fr(u + i / 5), cx0 = Math.round(8 + R(i, 1, 140) * (W - 16)), cy0 = Math.round(bt + 3 + R(i, 2, 140) * (bh - 7)), rad = 2.8 + R(i, 3, 140) * 2.6;
    const al = 1 - smooth(0.8, 1, k), burst = Math.min(1, k / 0.07), bs = eo4(burst);
    for (let j = 0; j < 12; j++) { // gotas voando no impacto
      const a = (j / 12) * TAU + R(i * 12 + j, 4, 140), sp = (5 + R(i * 12 + j, 5, 140) * 12) * bs;
      if (sp > rad + 0.5) put(f, cx0 + Math.cos(a) * sp, cy0 + Math.sin(a) * sp * 0.8, BLOOD[3 + (j & 1)], al * 0.9 * tf(cy0));
    }
    const n = Math.ceil(rad + 3);
    for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) { // mancha irregular
      const ang = Math.atan2(y, x), rr = rad * (0.75 + 0.45 * R(Math.floor((ang + Math.PI) / (TAU / 9)), 6, 140 + i)) * bs, d = Math.hypot(x + 0.5, y + 0.5);
      if (d < rr) put(f, cx0 + x, cy0 + y, d < rr * 0.55 ? BLOOD[2] : BLOOD[3], al * tf(cy0 + y));
      if (d < rr && x < 0 && y < 0 && d > rr * 0.55) put(f, cx0 + x, cy0 + y, BLOOD[5], al * 0.9);
    }
    const run = clamp((k - 0.1) / 0.6) * (5 + R(i, 7, 140) * 8), rx = cx0 + Math.round((R(i, 8, 140) - 0.5) * 2); // escorrimento
    for (let j = 0; j < run; j++) { put(f, rx, cy0 + rad * 0.6 + j, BLOOD[3], al); put(f, rx + 1, cy0 + rad * 0.6 + j, BLOOD[2], al); }
    if (run > 1) put(f, rx, cy0 + rad * 0.6 + run, BLOOD[5], al);
  }
  glow(f, W / 2, bt + bh / 2, W * 0.45, bh * 0.8, [200, 20, 30], 0.1);
}

// ======================= PERDA DE VIDA C: coração partido =======================
function drainC(f, t, o) {
  const dur = 2.4, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.5;
  const pulse = bump(fr(u * 2), 0.08, 0.07) + 0.6 * bump(fr(u * 2), 0.3, 0.08), sc = 1 + 0.16 * pulse, hw = 8.5 * sc, hh = 7.5 * sc;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { // coração (equação clássica), com batimento
    const lx = ((x + 0.5 - cx) / hw) * 1.2, ly = (-(y + 0.5 - cy - 0.8) / hh) * 1.2, v = (lx * lx + ly * ly - 1) ** 3 - lx * lx * ly ** 3;
    if (v > 0) continue;
    put(f, x, y, v > -0.06 ? BLOOD[4] : lx < -0.2 && ly > 0.2 && v > -0.35 ? BLOOD[3] : BLOOD[v > -0.5 ? 2 : 1]);
  }
  const crack = jag(cx, cy - hh * 0.85, cx + 1, cy + hh * 0.95, 2.2, 5, 3); // rachadura no meio
  for (let i = 0; i < crack.length - 1; i++) { seg(f, crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], BLOOD[0], 1); seg(f, crack[i][0] + 1, crack[i][1], crack[i + 1][0] + 1, crack[i + 1][1], BLOOD[5], 0.8); }
  for (let i = 0; i < 3; i++) { // sangue pingando da rachadura
    const k = fr(u + i / 3), y0 = cy + hh * 0.95, y = lerp(y0, base, k * k), x = cx + 1 + (i - 1) * 1.5;
    put(f, x, y, BLOOD[4], 1 - k * 0.3); put(f, x, y + 1, BLOOD[3], 1 - k * 0.3); put(f, x, y - 1, BLOOD[5], 0.8 * (1 - k));
  }
  glow(f, cx, cy, 18, 10, [230, 30, 50], 0.25 + 0.4 * pulse);
}

// ======================= ACERTO CRÍTICO B: estrela radiante (permanente, lenta) =======================
function critB(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.5, tf = (y) => smooth(0, 8, y), rot = u * (TAU / 8);
  for (let k = 0; k < 8; k++) { // pontas da estrela, alternando longas e curtas
    const a = rot + (k * TAU) / 8, L = k % 2 === 0 ? 31 : 18;
    for (let r = 7; r < L; r += 0.45) {
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.5, g = (r - 7) / (L - 7);
      put(f, x, y, CRIT[clamp(Math.round(6 - g * 4), 2, 6)], (1 - g * 0.8) * tf(y));
      if (r < 22) { put(f, x, y + 1, CRIT[clamp(Math.round(5 - g * 3), 2, 5)], (1 - g) * 0.9 * tf(y + 1)); put(f, x, y - 1, CRIT[3], (1 - g) * 0.6 * tf(y - 1)); }
    }
  }
  for (let i = 0; i < 56; i++) { const a = (i / 56) * TAU, pr = 1 + 0.06 * Math.sin(u * TAU * 2); put(f, cx + Math.cos(a) * 9 * pr, cy + Math.sin(a) * 5 * pr, CRIT[4], 0.9); }
  for (let i = 0; i < 8; i++) { // brilhos
    const tw = Math.sin(fr(u * (1 + (i % 2)) + R(i, 1, 150)) * TAU) ** 2, x = 3 + R(i, 2, 150) * (W - 6), y = bt - 2 + R(i, 3, 150) * (bh + 1);
    if (tw > 0.75) star(f, x, y, 2, CRIT[6], tf(y)); else if (tw > 0.35) star(f, x, y, 1, CRIT[5], tf(y));
  }
  glow(f, cx, cy, W * 0.5, bh * 0.95, [255, 190, 60], 0.28 + 0.1 * Math.sin(u * TAU * 2));
}

// ======================= ACERTO CRÍTICO C: coroa de louros (permanente, lenta) =======================
function critC(f, t, o) {
  const dur = 4.8, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cx = W / 2, cy = bt + bh * 0.46, rx = 21, ry = 8.2, tf = (y) => smooth(0, 8, y);
  for (const side of [-1, 1]) {
    let prev = null;
    for (let i = 0; i < 8; i++) {
      const s = i / 7, phi = Math.PI - s * 0.85 * Math.PI, x = cx - side * rx * Math.sin(phi), y = cy - ry * Math.cos(phi);
      if (prev) seg(f, prev[0], prev[1], x, y, CRIT[2], tf(y)); // ramo
      prev = [x, y];
      const nx = x - cx, ny = (y - cy) * 2, nl = Math.hypot(nx, ny) || 1, sway = Math.sin(u * TAU + i * 0.6 + side) * 0.35;
      const glint = Math.sin(u * TAU * 2 - i * 0.7 - side) > 0.93;
      for (const off of [-0.75, 0.75]) { // duas folhas por ponto, abrindo para fora
        const ang = Math.atan2(ny, nx) + off + sway, lx = x + Math.cos(ang) * 3.3, ly = y + Math.sin(ang) * 3.3 * 0.65, a = tf(ly);
        disc(f, Math.round(lx), Math.round(ly), 2.3, glint ? CRIT[6] : CRIT[3], a);
        put(f, lx - 0.5, ly - 0.5, glint ? CRIT[6] : CRIT[5], a); put(f, lx + 1, ly + 1, CRIT[2], a * 0.9);
        seg(f, x, y, lx, ly, CRIT[2], a * 0.8);
      }
      if (glint) lum(f, x, y, [255, 230, 140], 0.5);
    }
  }
  for (let i = -1; i <= 1; i++) put(f, cx + i, cy + ry + 1, CRIT[i ? 3 : 5]);                       // laço embaixo
  star(f, cx, bt - 1, 1 + (Math.sin(u * TAU * 2) > 0.3 ? 1 : 0), CRIT[6], tf(bt - 1));            // estrela no topo
  glow(f, cx, cy, W * 0.45, bh * 0.9, [255, 190, 60], 0.24 + 0.08 * Math.sin(u * TAU * 2));
}

// ======================= ERRO CRÍTICO B: dados trincados (permanente, lento) =======================
function fumbleB(f, t, o) {
  const dur = 4.0, W = f.w, Hh = f.h, base = Hh - 1, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, cy = bt + bh * 0.5, tf = (y) => smooth(0, 8, y);
  for (const [dxc, side, ph] of [[15, -1, 0], [W - 16, 1, 1.7]]) {
    const rot = Math.sin(u * TAU + ph) * 0.2, bob = Math.round(Math.sin(u * TAU * 2 + ph) * 0.8), cyd = cy + bob;
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { // hexágono: dentro se estiver aquém do apótema em todas as 6 direções
      let inside = true, edge = false;
      for (let k = 0; k < 6; k++) { const na = rot + (k * TAU) / 6, d = x * Math.cos(na) + y * Math.sin(na); if (d > 6.5) inside = false; else if (d > 5.4) edge = true; }
      if (!inside) continue;
      put(f, dxc + x, cyd + y, edge ? GLASS[3] : x + y < -2 ? GLASS[1] : GLASS[0]);
    }
    const g = ["010", "110", "010", "010", "111"]; // o "1" do dado
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === "1") put(f, dxc + c - 1, cyd + r - 2, FUMB[4]);
    lum(f, dxc, cyd, [255, 60, 70], 0.3);
    const cr = jag(dxc - 1, cyd - 6, dxc + 2, cyd + 6, 2, ph * 3 + 7, 3); // rachadura
    for (let i = 0; i < cr.length - 1; i++) seg(f, cr[i][0], cr[i][1], cr[i + 1][0], cr[i + 1][1], FUMB[1], 1);
    for (let j = 0; j < 3; j++) { // fumaça subindo do dado
      const k = fr(u * 2 + ph / 4 + j / 3), y = cyd - 8 - k * 9;
      put(f, dxc + Math.sin((k + j) * TAU) * 2 + side * 0, y, GLASS[1], 0.55 * (1 - k) * tf(y));
    }
  }
  glow(f, W / 2, cy, W * 0.45, bh * 0.8, [190, 40, 60], 0.1);
}

// ======================= ERRO CRÍTICO C: falha de sinal (permanente, lenta) =======================
function fumbleC(f, t, o) {
  const dur = 4.0, W = f.w, Hh = f.h, u = t / dur, bt = o.boxTop ?? Hh - 16, bh = Hh - bt, slot = Math.floor(u * 12), s2 = Math.floor(u * 26), CY = [90, 210, 230];
  for (let y = bt; y < Hh; y += 3) for (let x = 0; x < W; x++) put(f, x, y, FUMB[0], 0.22); // linhas de varredura
  for (let b = 0; b < 6; b++) { // faixas de glitch com aberração de cor, trocando a cada ~0,33 s
    const y = Math.round(bt + R(slot, b, 150) * (bh - 1)), hgt = 1 + Math.floor(R(slot, b + 8, 150) * 3), x0 = R(slot, b + 16, 150) * W * 0.6, len = 14 + R(slot, b + 24, 150) * 34, off = Math.round((R(slot, b + 30, 150) - 0.5) * 6);
    for (let yy = 0; yy < hgt; yy++) for (let x = x0; x < x0 + len; x++) { put(f, x + off, y + yy, FUMB[4], 0.8); put(f, x - off, y + yy, CY, 0.45); }
  }
  for (let i = 0; i < 16; i++) { // blocos de ruído
    const x = Math.floor(R(s2, i, 151) * (W - 2)), y = Math.floor(bt - 3 + R(s2, i + 20, 151) * (bh + 3));
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) put(f, x + dx, y + dy, i % 3 ? FUMB[2] : GLASS[1], 0.85);
  }
  if (R(s2, 99, 151) > 0.45) { const g = ["10001", "01010", "00100", "01010", "10001"]; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (g[r][c] === "1") put(f, 10 + c, bt + 4 + r, FUMB[4]); } // "X" piscando
  glow(f, W / 2, bt + bh / 2, W * 0.45, bh * 0.8, [190, 40, 60], 0.1);
}

// ======================= REGISTRO =======================
export const EFFECTS = {
  fire: { fn: fire, duration: 1.2, label: "Fogo" },
  acid: { fn: acid, duration: 2.4, label: "Ácido" },
  lightning: { fn: lightning, duration: 1.2, label: "Eletricidade" },
  force: { fn: force, duration: 2.4, label: "Essência mágica" },
  cold: { fn: cold, duration: 2.4, label: "Frio" },
  radiant: { fn: radiant, duration: 2.4, label: "Luz" },
  psychic: { fn: psychic, duration: 2.4, label: "Psíquico" },
  necrotic: { fn: necrotic, duration: 1.6, label: "Trevas" },
  slashing: { fn: slashing, duration: 1.5, label: "Corte" },
  piercing: { fn: piercing, duration: 1.6, label: "Perfuração" },
  bludgeoning: { fn: bludgeoning, duration: 1.6, label: "Impacto" },
  manaheal: { fn: manaheal, duration: 2.4, label: "Recuperação de mana" },
  heal: { fn: heal, duration: 2.4, label: "Recuperação de vida" },
  drain: { fn: drain, duration: 1.6, label: "Perda de vida" },
  crit: { fn: crit, duration: 4.8, label: "Acerto crítico" },
  fumble: { fn: fumble, duration: 4.0, label: "Erro crítico" },
};
// desenhos alternativos de cada efeito (variant 1 e 2)
const ALTS = {
  fire: [{ fn: fireB, duration: 1.2, label: "Tochas laterais" }, { fn: fireC, duration: 2.0, label: "Bola de fogo" }],
  acid: [{ fn: acidB, duration: 2.4, label: "Corrosão" }, { fn: acidC, duration: 2.4, label: "Gosma escorrendo" }],
  lightning: [{ fn: lightningB, duration: 1.2, label: "Orbe de plasma" }, { fn: lightningC, duration: 1.2, label: "Corrente na borda" }],
  force: [{ fn: forceB, duration: 4.8, label: "Círculo rúnico" }, { fn: forceC, duration: 4.8, label: "Constelação arcana" }],
  cold: [{ fn: coldB, duration: 2.4, label: "Nevasca" }, { fn: coldC, duration: 4.8, label: "Flocos de neve gigantes" }],
  radiant: [{ fn: radiantB, duration: 4.8, label: "Luz divina (raios do alto)" }, { fn: radiantC, duration: 4.8, label: "Penas de luz" }],
  psychic: [{ fn: psychicB, duration: 2.4, label: "Espiral hipnótica" }, { fn: psychicC, duration: 2.4, label: "Ondas mentais" }],
  necrotic: [{ fn: necroticB, duration: 3.2, label: "Tentáculos de sombra" }, { fn: necroticC, duration: 4.8, label: "Almas errantes" }],
  slashing: [{ fn: slashingB, duration: 1.6, label: "Garras" }, { fn: slashingC, duration: 2.4, label: "Redemoinho de lâminas" }],
  piercing: [{ fn: piercingB, duration: 1.6, label: "Flechas" }, { fn: piercingC, duration: 1.6, label: "Estacas do alto" }],
  bludgeoning: [{ fn: bludgeoningB, duration: 1.2, label: "Explosão de impacto" }, { fn: bludgeoningC, duration: 2.0, label: "Martelo pendular" }],
  manaheal: [{ fn: manaB, duration: 2.4, label: "Absorção de mana" }, { fn: manaC, duration: 2.4, label: "Fonte de mana" }],
  heal: [{ fn: healB, duration: 4.8, label: "Brotos e flores" }, { fn: healC, duration: 2.4, label: "Batimento cardíaco" }],
  drain: [{ fn: drainB, duration: 2.4, label: "Respingos de sangue" }, { fn: drainC, duration: 2.4, label: "Coração partido" }],
  crit: [{ fn: critB, duration: 4.8, label: "Estrela radiante" }, { fn: critC, duration: 4.8, label: "Coroa de louros" }],
  fumble: [{ fn: fumbleB, duration: 4.0, label: "Dados trincados" }, { fn: fumbleC, duration: 4.0, label: "Falha de sinal" }],

};
const ALIAS = {
  fogo: "fire", acido: "acid", eletricidade: "lightning", eletrico: "lightning", raio: "lightning",
  essencia: "force", "essencia magica": "force", magica: "force", forca: "force", energia: "force",
  frio: "cold", gelo: "cold", luz: "radiant", radiante: "radiant", psiquico: "psychic",
  trevas: "necrotic", necrotico: "necrotic",
  corte: "slashing", cortante: "slashing", perfuracao: "piercing", perfurante: "piercing",
  impacto: "bludgeoning", contundente: "bludgeoning",
  mana: "manaheal", "recuperacao de mana": "manaheal", "recuperacao mana": "manaheal",
  cura: "heal", vida: "heal", "recuperacao de vida": "heal", "recuperacao vida": "heal",
  "acerto critico": "crit", "acerto": "crit", critico: "crit", "critico acerto": "crit",
  "erro critico": "fumble", "falha critica": "fumble", erro: "fumble", falha: "fumble",
  "perda de vida": "drain", "perda vida": "drain", dreno: "drain", sangramento: "drain",
};
export function resolveName(name) {
  const k = String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return EFFECTS[k] ? k : ALIAS[k] || null;
}

// o: { boxTop (linha onde a caixa começa), seed, intensity }
// o.variant: 0 = desenho original; 1 e 2 = desenhos alternativos
function pick(name, variant) {
  const key = resolveName(name), e = EFFECTS[key];
  if (!e) throw new Error("efeito desconhecido: " + name);
  const alt = variant ? ALTS[key]?.[variant - 1] : null;
  return alt || e;
}
export function draw(f, name, t, o = {}) {
  const e = pick(name, o.variant | 0);
  e.fn(f, mod(t, e.duration), o);
}
export function durationOf(name, variant = 0) { return pick(name, variant).duration; }
// lista de versões do efeito: [{label:"Original"}, {label:"..."}, {label:"..."}]
export function variantsOf(name) { return [{ label: "Original" }, ...(ALTS[resolveName(name)] || []).map((a) => ({ label: a.label }))]; }

export function composite(f, out, bg = null) {
  const n = f.w * f.h;
  for (let p = 0; p < n; p++) {
    const i = p * 4, l = p * 3, a = f.color[i + 3] > 0;
    const lr = f.light[l] * 255, lg = f.light[l + 1] * 255, lb = f.light[l + 2] * 255;
    out[i] = Math.min(255, (a ? f.color[i] : bg ? bg[0] : 0) + lr);
    out[i + 1] = Math.min(255, (a ? f.color[i + 1] : bg ? bg[1] : 0) + lg);
    out[i + 2] = Math.min(255, (a ? f.color[i + 2] : bg ? bg[2] : 0) + lb);
    out[i + 3] = a || bg ? 255 : Math.min(255, Math.max(lr, lg, lb));
  }
}

// ---------- helper para a web ----------
// Encaixa o efeito atrás do conteúdo de um elemento (ex.: a caixa do dano). O texto fica POR CIMA.
// opts: { pixel = 2, rise = 14 (px acima do elemento), intensity = 1, speed = 1, seed = 0, variant = 0 (0 = original, 1 e 2 = desenhos alternativos) }
export function mountFx(el, name, opts = {}) {
  const key = resolveName(name);
  if (!key) throw new Error("efeito desconhecido: " + name);
  const o = { pixel: 2, rise: 14, intensity: 1, speed: 1, seed: 0, variant: 0, ...opts };
  const dur = durationOf(key, o.variant);
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.style.isolation = "isolate";
  const cv = document.createElement("canvas");
  Object.assign(cv.style, { position: "absolute", left: "0", bottom: "0", zIndex: "-1", pointerEvents: "none", imageRendering: "pixelated" });
  el.appendChild(cv);
  const ctx = cv.getContext("2d");
  let f, img, boxTop, raf = 0, running = false, visible = true, t0 = 0;

  const size = () => {
    const cols = Math.max(8, Math.ceil(el.clientWidth / o.pixel));
    const boxRows = Math.max(4, Math.ceil(el.clientHeight / o.pixel));
    const rows = boxRows + Math.ceil(o.rise / o.pixel);
    cv.width = cols; cv.height = rows;
    cv.style.width = cols * o.pixel + "px"; cv.style.height = rows * o.pixel + "px";
    f = createFrame(cols, rows); img = new ImageData(cols, rows); boxTop = rows - boxRows;
  };
  const render = (sec) => {
    clearFrame(f);
    draw(f, key, sec, { boxTop, intensity: o.intensity, seed: o.seed, variant: o.variant });
    composite(f, img.data, null);
    ctx.putImageData(img, 0, 0);
  };
  const tick = (now) => { if (!running) return; render(((now - t0) / 1000) * o.speed % dur); raf = requestAnimationFrame(tick); };
  const start = () => { if (running || !visible || document.hidden) return; running = true; t0 = performance.now(); raf = requestAnimationFrame(tick); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  size();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) render(dur * 0.3); else start();
  const ro = new ResizeObserver(() => { size(); if (!running) render(dur * 0.3); });
  ro.observe(el);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? !reduce && start() : stop(); });
  io.observe(el);
  const vis = () => (document.hidden ? stop() : !reduce && start());
  document.addEventListener("visibilitychange", vis);
  return {
    canvas: cv, start, stop,
    destroy() { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis); cv.remove(); },
  };
}
