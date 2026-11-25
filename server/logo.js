// Logos aufbereiten, bevor sie aufs Schild kommen:
//  1. in PNG umwandeln
//  2. leere (transparente/weiße) Ränder abschneiden
//  3. kleine Logos hochskalieren und die Kanten schärfen
//
// Hochskalieren: Logos bestehen meist aus wenigen, flächigen Farben. Das Bild wird stark
// vergrößert und jeder Pixel auf die nächste Logofarbe "eingerastet" -> scharfe, glatte Kanten
// statt Matsch (ähnlich wie Vektorisieren). Logos mit Verläufen/Fotos werden nur weich vergrößert.

const { getBrowser } = require('./expert');

const TARGET_WIDTH = 1600; // Zielbreite in Pixeln (~ 600 dpi bei 64 mm Logobreite)
const MAX_FACTOR = 16;
const BLUR = 0.45; // Glättung in Original-Pixeln

// Läuft im Browser (Chromium) – dort gibt es Canvas mit hochwertiger Skalierung.
async function processInPage({ src, isSvg, targetWidth, maxFactor, blurPx }) {
  const img = new Image();
  img.src = src;
  await img.decode();

  // --- in Canvas zeichnen (SVG groß rendern) ---
  let w = img.naturalWidth, h = img.naturalHeight;
  if (isSvg || !w) { const s = 1600 / Math.max(w || 1, h || 1); w = Math.round((w || 800) * s); h = Math.round((h || 400) * s); }
  let c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);

  // --- Ränder abschneiden ---
  let d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 16 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 >= 0) {
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const t = document.createElement('canvas');
    t.width = cw; t.height = ch;
    t.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    c = t; w = cw; h = ch;
  }

  // Schon groß genug (z. B. selbst hochgeladenes Logo) -> fertig
  if (isSvg || w >= targetWidth * 0.75) return { dataUrl: c.toDataURL('image/png'), upscaled: false, method: 'none' };

  const S = Math.min(maxFactor, Math.max(2, Math.ceil(targetWidth / w)));
  const src0 = c.getContext('2d').getImageData(0, 0, w, h).data;

  // --- Logofarben bestimmen (k-means auf deckenden Pixeln) ---
  const pts = [];
  const step = Math.max(1, Math.floor((w * h) / 20000));
  for (let i = 0; i < w * h; i += step) {
    if (src0[i * 4 + 3] > 242) pts.push([src0[i * 4] / 255, src0[i * 4 + 1] / 255, src0[i * 4 + 2] / 255]);
  }
  function kmeans(k) {
    let C = [pts[0]];
    while (C.length < k) { // k-means++ (deterministisch: weitester Punkt)
      let best = null, bd = -1;
      for (const p of pts) {
        let m = Infinity;
        for (const q of C) { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < m) m = dd; }
        if (m > bd) { bd = m; best = p; }
      }
      C.push(best.slice());
    }
    let err = 0;
    for (let it = 0; it < 20; it++) {
      const sum = C.map(() => [0, 0, 0, 0]);
      err = 0;
      for (const p of pts) {
        let m = Infinity, j = 0;
        for (let q = 0; q < C.length; q++) { const dd = (p[0] - C[q][0]) ** 2 + (p[1] - C[q][1]) ** 2 + (p[2] - C[q][2]) ** 2; if (dd < m) { m = dd; j = q; } }
        sum[j][0] += p[0]; sum[j][1] += p[1]; sum[j][2] += p[2]; sum[j][3]++;
        err += Math.sqrt(m);
      }
      C = C.map((q, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : q));
    }
    return { C, err: err / pts.length };
  }

  let palette = null;
  if (pts.length >= 20) {
    for (let k = 1; k <= 6; k++) {
      const r = kmeans(k);
      if (r.err < 0.06) { palette = r.C; break; }
    }
  }

  // Bild weich vergrößern (Faktor 2*S, Chromium-Hochqualitäts-Skalierung)
  const factor = palette ? 2 * S : S;
  const W2 = w * factor, H2 = h * factor;
  const big = document.createElement('canvas');
  big.width = W2; big.height = H2;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  // Vor dem Einrasten leicht weichzeichnen -> Rundungen werden glatt statt treppig
  if (palette && blurPx > 0) bctx.filter = `blur(${(factor * blurPx).toFixed(2)}px)`;
  bctx.drawImage(c, 0, 0, W2, H2);
  bctx.filter = 'none';

  if (!palette) {
    // Verläufe/Fotos: nur weich vergrößern
    return { dataUrl: big.toDataURL('image/png'), upscaled: true, method: 'smooth', factor: S };
  }

  // --- auf Logofarben einrasten (premultipliziert, inkl. "transparent") ---
  const P = [[0, 0, 0, 0], ...palette.map((q) => [q[0], q[1], q[2], 1])];
  const P255 = P.map((q) => [Math.round(q[0] * 255), Math.round(q[1] * 255), Math.round(q[2] * 255), Math.round(q[3] * 255)]);
  const id = bctx.getImageData(0, 0, W2, H2);
  const px = id.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    const r = (px[i] / 255) * a, g = (px[i + 1] / 255) * a, b = (px[i + 2] / 255) * a;
    let m = Infinity, j = 0;
    for (let q = 0; q < P.length; q++) {
      const dd = (r - P[q][0] * P[q][3]) ** 2 + (g - P[q][1] * P[q][3]) ** 2 + (b - P[q][2] * P[q][3]) ** 2 + (a - P[q][3]) ** 2;
      if (dd < m) { m = dd; j = q; }
    }
    px[i] = P255[j][0]; px[i + 1] = P255[j][1]; px[i + 2] = P255[j][2]; px[i + 3] = P255[j][3];
  }
  bctx.putImageData(id, 0, 0);

  // --- halbieren -> geglättete Kanten ---
  const out = document.createElement('canvas');
  out.width = w * S; out.height = h * S;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL('image/png'), upscaled: true, method: 'sharp', factor: S, colors: palette.length };
}

async function prepareLogo(buf, mime, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const r = await page.evaluate(processInPage, {
      src: `data:${mime};base64,${buf.toString('base64')}`,
      isSvg: /svg/.test(mime),
      targetWidth: TARGET_WIDTH,
      maxFactor: MAX_FACTOR,
      blurPx: opts.blurPx != null ? opts.blurPx : BLUR,
    });
    return { buf: Buffer.from(r.dataUrl.split(',')[1], 'base64'), info: { upscaled: r.upscaled, method: r.method, factor: r.factor || 1 } };
  } finally {
    await page.close();
  }
}

module.exports = { prepareLogo };
