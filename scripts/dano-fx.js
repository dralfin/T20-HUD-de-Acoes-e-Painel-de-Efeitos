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
export function draw(f, name, t, o = {}) {
  const e = EFFECTS[resolveName(name)];
  if (!e) throw new Error("efeito desconhecido: " + name);
  e.fn(f, mod(t, e.duration), o);
}
export function durationOf(name) { return EFFECTS[resolveName(name)].duration; }

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
// opts: { pixel = 2, rise = 14 (px acima do elemento), intensity = 1, speed = 1, seed = 0 }
export function mountFx(el, name, opts = {}) {
  const key = resolveName(name);
  if (!key) throw new Error("efeito desconhecido: " + name);
  const o = { pixel: 2, rise: 14, intensity: 1, speed: 1, seed: 0, ...opts };
  const dur = EFFECTS[key].duration;
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
    draw(f, key, sec, { boxTop, intensity: o.intensity, seed: o.seed });
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
