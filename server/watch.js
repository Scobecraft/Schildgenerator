// Preisänderungs-Wächter: merkt sich gedruckte Schilder und prüft sie täglich gegen expert.de.
//
// data/printed.json: { lastRun, items: { <key>: Eintrag } }
// Ein Eintrag pro Artikel (Schlüssel = Web-Code bzw. Suchbegriff). Neu drucken überschreibt ihn.

const fs = require('fs');
const path = require('path');
const { lookup } = require('./expert');

const FILE = path.join(__dirname, '..', 'data', 'printed.json');
const KEEP_DAYS = 180;
const RUN_HOUR = 6; // täglich ab 6 Uhr (Zeitzone über TZ, im Docker-Container Europe/Berlin)

let db = { lastRun: null, lastRunDay: null, items: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) { /* neu */ }
let running = null; // { done, total }

function persist() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

// Nach dem Drucken: gedruckte Schilder eintragen
function registerPrinted(list, setInfo) {
  const now = new Date().toISOString();
  let n = 0;
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || !it.query) continue; // Schilder ohne expert-Abruf kann man nicht prüfen
    const key = String(it.webcode || it.query);
    const prev = db.items[key];
    const templates = new Set([...(prev && prev.printedAt === now ? prev.templates : []), it.template].filter(Boolean));
    db.items[key] = {
      key,
      query: String(it.query),
      webcode: it.webcode || null,
      name: String(it.name || ''),
      group: String(it.group || ''),
      templates: [...templates],
      qty: (prev && prev.printedAt === now ? prev.qty : 0) + (Number(it.qty) || 1),
      printedPrice: num(it.price),
      printedUvp: num(it.uvp),
      expertPrice: num(it.expertPrice), // Preis auf expert.de beim Drucken
      expertUvp: num(it.expertUvp),
      uvpManual: Boolean(it.uvpManual),
      manualPrice: it.expertPrice != null && num(it.price) !== num(it.expertPrice),
      printedAt: now,
      setId: setInfo && setInfo.id, setName: setInfo && setInfo.name,
      check: null,
    };
    n++;
  }
  if (n) persist();
  return n;
}

function cleanup() {
  const limit = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  let changed = false;
  for (const [k, it] of Object.entries(db.items)) {
    if (Date.parse(it.printedAt) < limit) { delete db.items[k]; changed = true; }
  }
  if (changed) persist();
}

function isChanged(it) {
  const c = it.check;
  if (!c || c.error) return false;
  const priceChanged = c.price != null && it.expertPrice != null && Math.abs(c.price - it.expertPrice) >= 0.005;
  const uvpChanged = !it.uvpManual && Math.abs((c.uvp || 0) - (it.expertUvp || 0)) >= 0.005;
  return priceChanged || uvpChanged;
}

async function runCheck() {
  if (running) return false;
  cleanup();
  const items = Object.values(db.items);
  running = { done: 0, total: items.length };
  try {
    for (const it of items) {
      try {
        const r = await lookup(it.query);
        it.check = { at: new Date().toISOString(), price: num(r.price), uvp: num(r.expertUvp) };
      } catch (e) {
        it.check = { at: new Date().toISOString(), error: e.message };
      }
      running.done++;
      if (running.done % 5 === 0) persist();
    }
    db.lastRun = new Date().toISOString();
    db.lastRunDay = new Date().toDateString();
    persist();
  } finally {
    running = null;
  }
  return true;
}

function remove(keys) {
  for (const k of Array.isArray(keys) ? keys : []) delete db.items[k];
  persist();
}

function status() {
  const items = Object.values(db.items).map((it) => ({ ...it, changed: isChanged(it), unreachable: Boolean(it.check && it.check.error) }));
  items.sort((a, b) => (b.changed - a.changed) || (b.unreachable - a.unreachable) || String(b.printedAt).localeCompare(String(a.printedAt)));
  return {
    lastRun: db.lastRun, running, keepDays: KEEP_DAYS, runHour: RUN_HOUR,
    total: items.length,
    changedCount: items.filter((x) => x.changed).length,
    unreachableCount: items.filter((x) => x.unreachable).length,
    items,
  };
}

// Zeitplan: alle 10 Minuten nachsehen, ob heute ab RUN_HOUR schon geprüft wurde
function startSchedule() {
  const tick = () => {
    const now = new Date();
    if (now.getHours() >= RUN_HOUR && db.lastRunDay !== now.toDateString() && Object.keys(db.items).length) {
      runCheck().catch((e) => console.error('Preis-Wächter:', e.message));
    }
  };
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 10 * 60 * 1000).unref();
}

module.exports = { registerPrinted, runCheck, remove, status, startSchedule };
