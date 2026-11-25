const path = require('path');

// Einstellungen aus .env (z. B. PORT=...) laden, falls vorhanden
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
const { lookup, getBrowser, closeBrowser, STORE_ID } = require('./expert');
const { prepareLogo } = require('./logo');

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
    buf = (await prepareLogo(buf, 'image/png')).buf;
    fs.writeFileSync(path.join(LOGO_DIR, name + '.png'), buf);
    res.json({ brand: name, url: libraryLogo(name) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Einzelnes PNG aufbereiten (zuschneiden + hochskalieren), ohne es zu speichern
app.post('/api/logos/prepare', async (req, res) => {
  try {
    const m = /^data:image\/png;base64,(.+)$/.exec(String((req.body || {}).dataUrl || ''));
    if (!m) return res.status(400).json({ error: 'Bitte nur PNG-Dateien verwenden.' });
    const r = await prepareLogo(Buffer.from(m[1], 'base64'), 'image/png');
    res.json({ dataUrl: 'data:image/png;base64,' + r.buf.toString('base64'), ...r.info });
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
  res.json({ store: 'expert Asbach', storeId: STORE_ID });
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

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text) return res.status(400).end();
  const svg = await QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff00' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

// ---------- Herstellerlogos: immer als PNG ausliefern ----------
const imgCache = new Map();
const ALLOWED_IMG_HOSTS = ['cdn.expert.de', 'www.expert.de', 'production.brntgs.expert.de'];


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
    buf = (await prepareLogo(buf, isPng ? 'image/png' : (mime || 'image/svg+xml'))).buf;
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
});
httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist schon belegt – läuft der Schildgenerator schon? Sonst in .env einen anderen PORT eintragen.`);
    process.exit(1);
  }
  throw e;
});

// Sauber beenden (z. B. bei "docker compose down" oder Neustart)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    httpServer.close();
    await closeBrowser();
    process.exit(0);
  });
}
