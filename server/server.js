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
    buf = (await prepareLogo(buf, 'image/png', { upscale: false })).buf;
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
    const raw = Buffer.from(m[1], 'base64');
    const orig = await prepareLogo(raw, 'image/png', { upscale: false });
    const up = await prepareLogo(raw, 'image/png', { upscale: true });
    res.json({ dataUrl: 'data:image/png;base64,' + orig.buf.toString('base64'), dataUrlUp: 'data:image/png;base64,' + up.buf.toString('base64') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/logos/:brand', (req, res) => {
  const f = path.join(LOGO_DIR, slug(req.params.brand) + '.png');
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

// ---------- Sets (Sammlungen von Preisschildern, auf dem Server gespeichert) ----------
const SET_DIR = path.join(__dirname, '..', 'data', 'sets');
fs.mkdirSync(SET_DIR, { recursive: true });
const validSetId = (id) => /^[A-Za-z0-9_-]{6,80}$/.test(String(id || ''));
const setFile = (id) => path.join(SET_DIR, id + '.json');

// Sets werden 48 Stunden nach der letzten Änderung automatisch gelöscht (Speicherplatz sparen)
const SET_KEEP_MS = 48 * 60 * 60 * 1000;
function setLastChange(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const t = Date.parse(s.updatedAt || s.createdAt);
    if (!Number.isNaN(t)) return t;
  } catch (_) { /* Dateidatum nehmen */ }
  return fs.statSync(file).mtimeMs;
}
function cleanupSets() {
  const now = Date.now();
  let removed = 0;
  for (const f of fs.readdirSync(SET_DIR)) {
    const file = path.join(SET_DIR, f);
    try {
      if (f.endsWith('.tmp') && now - fs.statSync(file).mtimeMs > 60 * 60 * 1000) { fs.unlinkSync(file); continue; }
      if (f.endsWith('.json') && now - setLastChange(file) > SET_KEEP_MS) { fs.unlinkSync(file); removed++; }
    } catch (_) { /* nächste Datei */ }
  }
  if (removed) console.log(`${removed} Set(s) älter als 48 Stunden gelöscht.`);
}
cleanupSets();
setInterval(cleanupSets, 60 * 60 * 1000).unref();

app.get('/api/sets', (req, res) => {
  cleanupSets();
  const list = [];
  for (const f of fs.readdirSync(SET_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(SET_DIR, f), 'utf8'));
      const tags = Array.isArray(s.tags) ? s.tags : [];
      list.push({
        id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt,
        deleteAt: new Date((Date.parse(s.updatedAt || s.createdAt) || Date.now()) + SET_KEEP_MS).toISOString(),
        tagCount: tags.length,
        pieceCount: tags.reduce((n, t) => n + (Number(t.qty) || 0), 0),
        preview: tags.slice(0, 3).map((t) => (t.data && t.data.name) || t.query || '').filter(Boolean),
      });
    } catch (_) { /* kaputte Datei ignorieren */ }
  }
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(list);
});

app.get('/api/sets/:id', (req, res) => {
  if (!validSetId(req.params.id) || !fs.existsSync(setFile(req.params.id))) return res.status(404).json({ error: 'Set nicht gefunden.' });
  res.type('json').send(fs.readFileSync(setFile(req.params.id), 'utf8'));
});

app.put('/api/sets/:id', (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!validSetId(id) || b.id !== id || !Array.isArray(b.tags)) return res.status(400).json({ error: 'Ungültiges Set.' });
  const set = { id, name: String(b.name || '').slice(0, 100), createdAt: b.createdAt, updatedAt: new Date().toISOString(), tags: b.tags };
  const tmp = setFile(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(set));
  fs.renameSync(tmp, setFile(id)); // atomar: nie halb geschriebene Dateien
  res.json({ ok: true, updatedAt: set.updatedAt });
});

app.delete('/api/sets/:id', (req, res) => {
  if (validSetId(req.params.id) && fs.existsSync(setFile(req.params.id))) fs.unlinkSync(setFile(req.params.id));
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


// Logo als PNG: ?url=<expert-Logo> oder ?lib=<Marke aus der Bibliothek>; &up=1 = hochskaliert
app.get('/api/img', async (req, res) => {
  try {
    const up = req.query.up === '1';
    let key, load;
    if (req.query.lib) {
      const name = slug(req.query.lib);
      const file = path.join(LOGO_DIR, name + '.png');
      if (!name || !fs.existsSync(file)) return res.status(404).send('Logo nicht gefunden');
      key = `lib:${name}:${fs.statSync(file).mtimeMs}:${up}`;
      load = async () => ({ buf: fs.readFileSync(file), mime: 'image/png' });
    } else {
      const url = new URL(String(req.query.url || ''));
      if (url.protocol !== 'https:' || !ALLOWED_IMG_HOSTS.includes(url.hostname)) return res.status(400).send('Host nicht erlaubt');
      key = `url:${url.href}:${up}`;
      load = async () => {
        const r = await fetch(url.href);
        if (!r.ok) throw new Error('Logo konnte nicht geladen werden');
        return { buf: Buffer.from(await r.arrayBuffer()), mime: (r.headers.get('content-type') || '').split(';')[0] };
      };
    }
    if (!imgCache.has(key)) {
      const { buf, mime } = await load();
      const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      imgCache.set(key, (await prepareLogo(buf, isPng ? 'image/png' : (mime || 'image/svg+xml'), { upscale: up })).buf);
      if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value);
    }
    res.type('image/png').set('Cache-Control', 'public, max-age=86400').send(imgCache.get(key));
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
