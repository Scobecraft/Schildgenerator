const path = require('path');

// Einstellungen aus .env (z. B. ANTHROPIC_API_KEY=...) laden, falls vorhanden
try {
  const envFile = require('fs').readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch (_) { /* keine .env vorhanden */ }
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');
const { lookup, getBrowser, STORE_ID } = require('./expert');
const { findUvp, isConfigured } = require('./uvp');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // auf dem Server: 127.0.0.1 (nur über nginx erreichbar)
const app = express();
app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Logo-Bibliothek (hochauflösende PNGs pro Marke) ----------
const LOGO_DIR = path.join(__dirname, '..', 'data', 'logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });
app.use('/logos', express.static(LOGO_DIR, { maxAge: 0 }));
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function libraryLogo(...names) {
  for (const n of names) {
    const f = slug(n) && path.join(LOGO_DIR, slug(n) + '.png');
    if (f && fs.existsSync(f)) return `/logos/${slug(n)}.png?v=${Math.round(fs.statSync(f).mtimeMs)}`;
  }
  return null;
}
app.get('/api/logos', (req, res) => {
  const list = fs.readdirSync(LOGO_DIR).filter((f) => f.endsWith('.png')).sort().map((f) => ({
    brand: f.replace(/\.png$/, ''),
    url: `/logos/${f}?v=${Math.round(fs.statSync(path.join(LOGO_DIR, f)).mtimeMs)}`,
  }));
  res.json(list);
});
app.post('/api/logos', async (req, res) => {
  try {
    const { brand, dataUrl } = req.body || {};
    const name = slug(brand);
    if (!name) return res.status(400).json({ error: 'Markenname fehlt.' });
    const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return res.status(400).json({ error: 'Bitte nur PNG-Dateien verwenden.' });
    let buf = Buffer.from(m[1], 'base64');
    if (!buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return res.status(400).json({ error: 'Die Datei ist kein gültiges PNG.' });
    buf = await toTrimmedPng(buf, 'image/png');
    fs.writeFileSync(path.join(LOGO_DIR, name + '.png'), buf);
    res.json({ brand: name, url: libraryLogo(name) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/logos/:brand', (req, res) => {
  const f = path.join(LOGO_DIR, slug(req.params.brand) + '.png');
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  res.json({ store: 'expert Asbach', storeId: STORE_ID, uvpConfigured: isConfigured() });
});

app.get('/api/lookup', async (req, res) => {
  try {
    const r = await lookup(req.query.q);
    const lib = libraryLogo(r.brand, r.manufacturer);
    r.logoSource = lib ? 'library' : (r.logoUrl ? 'expert' : null);
    if (lib) { r.expertLogoUrl = r.logoUrl; r.logoUrl = lib; }
    r.logoBrand = slug(r.brand || r.manufacturer);
    res.json(r);
  } catch (e) {
    res.status(422).json({ error: e.message || String(e) });
  }
});

app.post('/api/uvp', async (req, res) => {
  try {
    res.json(await findUvp(req.body || {}));
  } catch (e) {
    res.status(500).json({ error: 'UVP-Recherche fehlgeschlagen: ' + (e.message || String(e)) });
  }
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text) return res.status(400).end();
  const svg = await QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff00' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

// ---------- Herstellerlogos: immer als PNG ausliefern ----------
const imgCache = new Map();
const ALLOWED_IMG_HOSTS = ['cdn.expert.de', 'www.expert.de', 'production.brntgs.expert.de'];

// Wandelt jedes Bild in PNG um und schneidet leere (transparente oder weiße) Ränder ab,
// damit das Logo die vorgesehene Fläche wirklich ausfüllt.
async function toTrimmedPng(buf, mime) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    const out = await page.evaluate(async ({ src, isSvg }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      let w = img.naturalWidth, h = img.naturalHeight;
      if (isSvg || !w) { const s = 1600 / Math.max(w || 1, h || 1); w = Math.round((w || 800) * s); h = Math.round((h || 400) * s); }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const a = d[i + 3];
          const nearWhite = d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245;
          if (a > 16 && !nearWhite) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 < 0) return c.toDataURL('image/png');
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const c2 = document.createElement('canvas');
      c2.width = cw; c2.height = ch;
      c2.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
      return c2.toDataURL('image/png');
    }, { src: dataUrl, isSvg: /svg/.test(mime) });
    return Buffer.from(out.split(',')[1], 'base64');
  } finally {
    await page.close();
  }
}

app.get('/api/img', async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    if (url.protocol !== 'https:' || !ALLOWED_IMG_HOSTS.includes(url.hostname)) return res.status(400).send('Host nicht erlaubt');
    if (imgCache.has(url.href)) return res.type('image/png').send(imgCache.get(url.href));
    const r = await fetch(url.href);
    if (!r.ok) return res.status(502).send('Logo konnte nicht geladen werden');
    const mime = (r.headers.get('content-type') || '').split(';')[0];
    let buf = Buffer.from(await r.arrayBuffer());
    const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    buf = await toTrimmedPng(buf, isPng ? 'image/png' : (mime || 'image/svg+xml'));
    imgCache.set(url.href, buf);
    res.type('image/png').set('Cache-Control', 'public, max-age=86400').send(buf);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ---------- PDF ----------
const printJobs = new Map();
app.get('/print/:id', (req, res) => {
  const html = printJobs.get(req.params.id);
  if (!html) return res.status(404).end();
  res.type('html').send(html);
});

app.post('/api/pdf', async (req, res) => {
  const html = req.body && req.body.html;
  if (!html) return res.status(400).json({ error: 'Kein Inhalt' });
  const id = crypto.randomUUID();
  printJobs.set(id, html);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${PORT}/print/${id}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.__fitAll && window.__fitAll());
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    res.type('application/pdf').set('Content-Disposition', `attachment; filename="preisschilder-${new Date().toISOString().slice(0, 10)}.pdf"`).send(pdf);
  } catch (e) {
    res.status(500).json({ error: 'PDF konnte nicht erstellt werden: ' + e.message });
  } finally {
    printJobs.delete(id);
    await page.close().catch(() => {});
  }
});

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`Schildgenerator läuft auf http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`UVP-Recherche: ${isConfigured() ? 'aktiv' : 'aus (ANTHROPIC_API_KEY setzen, um sie zu aktivieren)'}`);
});
httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist schon belegt – läuft der Schildgenerator schon? Sonst in .env einen anderen PORT eintragen.`);
    process.exit(1);
  }
  throw e;
});
