// Zeichnet jede Ziffer mit potrace nach und rechnet die Pfade in Glyphen-Einheiten um:
// 1000 Einheiten = Ziffernhöhe, y = 0 auf der Grundlinie (negativ nach oben), x = 0 an der linken Tintenkante.
const fs = require('fs');
const potrace = require('potrace');
const meta = JSON.parse(fs.readFileSync('meta.json', 'utf8'));
const CAP = meta.bottom + 1 - meta.top; // Ziffernhöhe in Bildpixeln
const BASE = meta.bottom + 1;           // Grundlinie (Unterkante der Ziffern)
const U = 1000 / CAP;

function transformPath(d, g) {
  // potrace liefert absolute Koordinaten (M, C, L, Z) in Pixeln des vergrößerten Ausschnitts
  return d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (m, xs, ys) => {
    const x = (Number(xs) / meta.up + g.x0 - g.ink[0]) * U;
    const y = (Number(ys) / meta.up + g.y0 - BASE) * U;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
}

(async () => {
  const out = { cap: 1000, glyphs: {} };
  for (const [name, g] of Object.entries(meta.glyphs)) {
    const svg = await new Promise((res, rej) => potrace.trace(`g_${name}.png`, {
      turdSize: 20, optTolerance: 0.25, alphaMax: 1.0, optCurve: true, threshold: 128, blackOnWhite: true,
    }, (err, s) => (err ? rej(err) : res(s))));
    const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    const d = ds.map((x) => transformPath(x, g)).join(' ');
    // Tinten-Profil pro Zeile in Einheiten (für optischen Abstand), 40 Zeilen über die Ziffernhöhe
    const prof = [];
    for (let i = 0; i < 40; i++) {
      const yPx = Math.round(meta.top + (i + 0.5) * CAP / 40);
      const r = g.rows[String(yPx)];
      prof.push(r ? [Math.round((r[0] - g.ink[0]) * U), Math.round((r[1] - g.ink[0]) * U)] : null);
    }
    out.glyphs[name] = {
      d,
      w: Math.round((g.ink[2] - g.ink[0]) * U),            // Tintenbreite
      top: Math.round((g.ink[1] - BASE) * U),              // Oberkante (negativ)
      bottom: Math.round((g.ink[3] - BASE) * U),
      dx: Math.round((g.ink[0] - meta.glyphs['0'].ink[0]) * U), // nur für dot/dash: Lage relativ zur "0"
      prof,
    };
    console.log(name, 'Länge Pfad', d.length, 'Breite', out.glyphs[name].w);
  }
  // Abstände aus dem Bild: engster waagerechter Abstand zwischen aufeinanderfolgenden Zeichen
  const order = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const gaps = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = meta.glyphs[order[i]], b = meta.glyphs[order[i + 1]];
    let min = Infinity;
    for (const [y, ra] of Object.entries(a.rows)) {
      const rb = b.rows[y];
      if (rb) min = Math.min(min, rb[0] - ra[1]);
    }
    gaps.push(+(min * U).toFixed(1));
  }
  out.gaps = gaps;
  // ".-" relativ zur "0": Abstand der Punkt-Linkskante zur "0" (engste Stelle)
  const z = meta.glyphs['0'];
  const mins = {};
  for (const n of ['dot', 'dash']) {
    let min = Infinity;
    for (const [y, rz] of Object.entries(z.rows)) { const r = meta.glyphs[n].rows[y]; if (r) min = Math.min(min, r[0] - rz[1]); }
    mins[n] = +(min * U).toFixed(1);
  }
  out.dotDash = mins;
  fs.writeFileSync('glyphs.json', JSON.stringify(out));
  console.log('Abstände (Einheiten):', gaps.join(', '), '| dot/dash zur 0:', JSON.stringify(mins));
})();
