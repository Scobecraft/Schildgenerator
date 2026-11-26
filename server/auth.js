// Anmeldung mit Benutzername + Passwort.
//  - Benutzer: data/users.json (Passwörter nur als scrypt-Hash mit eigenem Salt)
//  - Sitzungen: data/sessions.json (zufälliges Token im HttpOnly-Cookie, 30 Tage, verlängert sich bei Nutzung)
//  - Gibt es noch keinen Benutzer, legt die Anmeldeseite das erste Konto (Administrator) an.
//  - Schutz gegen Durchprobieren: 15 Minuten Sperre nach 8 Fehlversuchen für einen Benutzernamen
//    bzw. nach 30 Fehlversuchen von einer Adresse (großzügiger, weil sich ein Markt oft eine Adresse teilt).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA, 'users.json');
const SESS_FILE = path.join(DATA, 'sessions.json');
const COOKIE = 'sg_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;
const MAX_FAILS = { u: 8, ip: 30 };
const LOCK_MS = 15 * 60 * 1000;
// Für den eigenen Druck-Browser (PDF): bei jedem Start neu, verlässt den Server nie
const INTERNAL_TOKEN = crypto.randomBytes(32).toString('hex');
// Einrichtungscode für das erste Konto, falls die Seite schon über das Internet erreichbar ist
const SETUP_CODE = crypto.randomBytes(5).toString('hex').toUpperCase();

fs.mkdirSync(DATA, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ---------- Benutzer ----------
const normName = (n) => String(n || '').trim();
const key = (n) => normName(n).toLowerCase();
// Fehlt die Datei, gibt es noch keine Benutzer. Ist sie vorhanden, aber unlesbar/kaputt, wird NICHT
// "keine Benutzer" angenommen (sonst könnte jemand ein neues Admin-Konto anlegen) – dann geht gar nichts.
let usersBroken = false;
function loadUsers() {
  let raw;
  try { raw = fs.readFileSync(USERS_FILE, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') { usersBroken = false; return []; }
    usersBroken = true; return [];
  }
  try {
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.users)) throw new Error('Format');
    usersBroken = false;
    return j.users;
  } catch (e) {
    if (!usersBroken) console.error('ACHTUNG: data/users.json ist beschädigt – Anmeldung gesperrt, bis die Datei repariert ist.');
    usersBroken = true;
    return [];
  }
}
function saveUsers(users) { writeJson(USERS_FILE, { users }); }
function hasUsers() { return loadUsers().length > 0 || usersBroken; }
function findUser(name) { return loadUsers().find((u) => key(u.name) === key(name)) || null; }

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}
function checkPassword(user, pw) {
  if (!user) {
    hashPassword(pw); // gleiche Rechenzeit, damit man nicht erkennt, ob es den Namen gibt
    return false;
  }
  const { hash } = hashPassword(pw, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

function validate(name, pw) {
  name = normName(name);
  if (!/^[\p{L}\p{N}._@-]{2,40}$/u.test(name)) return 'Benutzername: 2–40 Zeichen, nur Buchstaben, Ziffern und . _ - @';
  if (pw != null && String(pw).length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  return null;
}

function addUser(name, pw, admin = false) {
  const err = validate(name, pw);
  if (err) throw new Error(err);
  const users = loadUsers();
  if (usersBroken) throw new Error('data/users.json ist beschädigt.');
  if (users.some((u) => key(u.name) === key(name))) throw new Error('Diesen Benutzer gibt es schon.');
  users.push({ name: normName(name), ...hashPassword(pw), admin: !!admin, created: new Date().toISOString(), pwChanged: Date.now() });
  saveUsers(users);
}
function setPassword(name, pw) {
  const err = validate(name, pw);
  if (err) throw new Error(err);
  const users = loadUsers();
  const u = users.find((x) => key(x.name) === key(name));
  if (!u) throw new Error('Benutzer nicht gefunden.');
  Object.assign(u, hashPassword(pw), { pwChanged: Date.now() });
  saveUsers(users);
  dropSessions(u.name);
}
function removeUser(name) {
  const users = loadUsers();
  const u = users.find((x) => key(x.name) === key(name));
  if (!u) throw new Error('Benutzer nicht gefunden.');
  if (u.admin && users.filter((x) => x.admin).length === 1) throw new Error('Der letzte Administrator kann nicht gelöscht werden.');
  saveUsers(users.filter((x) => x !== u));
  dropSessions(u.name);
}
function setAdmin(name, admin) {
  const users = loadUsers();
  const u = users.find((x) => key(x.name) === key(name));
  if (!u) throw new Error('Benutzer nicht gefunden.');
  if (u.admin && !admin && users.filter((x) => x.admin).length === 1) throw new Error('Es muss mindestens einen Administrator geben.');
  u.admin = !!admin;
  saveUsers(users);
}
const publicUser = (u) => ({ name: u.name, admin: !!u.admin, created: u.created });

// ---------- Sitzungen ----------
let sessions = readJson(SESS_FILE, {});
let saveTimer = null;
function saveSessionsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { writeJson(SESS_FILE, sessions); } catch (e) { console.error('Sitzungen:', e.message); } }, 1000);
}
const tokenKey = (t) => crypto.createHash('sha256').update(String(t)).digest('hex'); // gespeichert wird nur der Hash
function createSession(name) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[tokenKey(token)] = { user: name, created: Date.now(), seen: Date.now() };
  saveSessionsSoon();
  return token;
}
function dropSessions(name, exceptToken) {
  const keep = exceptToken ? tokenKey(exceptToken) : null;
  for (const [k, s] of Object.entries(sessions)) if (key(s.user) === key(name) && k !== keep) delete sessions[k];
  saveSessionsSoon();
}
function cleanupSessions() {
  const now = Date.now();
  for (const [k, s] of Object.entries(sessions)) if (now - s.seen > SESSION_MS) delete sessions[k];
  saveSessionsSoon();
}
setInterval(cleanupSessions, 6 * 3600 * 1000).unref();

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { /* kaputtes Cookie ignorieren */ }
  }
  return out;
}
function isHttps(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}
function setCookie(req, res, token, maxAgeMs) {
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${isHttps(req) ? '; Secure' : ''}`);
}

function currentUser(req) {
  const it = req.headers['x-internal-token'];
  if (typeof it === 'string' && it.length === INTERNAL_TOKEN.length && crypto.timingSafeEqual(Buffer.from(it), Buffer.from(INTERNAL_TOKEN))) return { name: 'intern', admin: false, internal: true };
  const token = parseCookies(req)[COOKIE];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const s = Object.prototype.hasOwnProperty.call(sessions, tokenKey(token)) ? sessions[tokenKey(token)] : null;
  if (!s) return null;
  const now = Date.now();
  if (now - s.seen > SESSION_MS) { delete sessions[tokenKey(token)]; saveSessionsSoon(); return null; }
  const u = findUser(s.user);
  // Benutzer gelöscht oder Passwort inzwischen geändert (auch über die Kommandozeile) -> Sitzung ungültig
  if (!u || (u.pwChanged && s.created < u.pwChanged)) { delete sessions[tokenKey(token)]; saveSessionsSoon(); return null; }
  if (now - s.seen > 3600 * 1000) { s.seen = now; saveSessionsSoon(); }
  return { ...publicUser(u), token };
}

// ---------- Fehlversuche ----------
const fails = new Map(); // key -> {n, until}
const isPrivate = (ip) => /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i.test(String(ip || ''));
function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  // Kopfzeilen kann jeder fälschen – nur glauben, wenn ein Proxy im eigenen Netz (nginx, Cloudflare-Tunnel) sie setzt
  if (isPrivate(peer)) {
    const fwd = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return peer;
}
// Direkt aus dem eigenen Netz, ohne Proxy dazwischen (für das Anlegen des ersten Kontos)
function isDirectLocal(req) {
  const h = req.headers;
  return isPrivate(req.socket.remoteAddress) && !h['x-forwarded-for'] && !h['cf-connecting-ip'] && !h['x-real-ip'] && !h.forwarded && !h['cf-ray'];
}
function locked(keys) {
  const now = Date.now();
  for (const k of keys) {
    const f = fails.get(k);
    if (f && f.until > now) return Math.ceil((f.until - now) / 60000);
  }
  return 0;
}
function noteFail(keys) {
  for (const k of keys) {
    const f = fails.get(k) || { n: 0, until: 0 };
    f.n++;
    if (f.n >= MAX_FAILS[k.split(':')[0]]) { f.until = Date.now() + LOCK_MS; f.n = 0; }
    fails.set(k, f);
  }
}
setInterval(() => { const now = Date.now(); for (const [k, f] of fails) if (f.until < now && f.n === 0) fails.delete(k); }, 30 * 60 * 1000).unref();

// ---------- Express ----------
// Ohne Anmeldung erreichbar: Anmeldeseite und was sie zum Anzeigen braucht
const OPEN = [/^\/login(\.html)?$/, /^\/api\/(login|setup|auth-state)$/, /^\/css\/app\.css$/, /^\/fonts\/[a-z0-9-]+\.woff2$/];
function isOpen(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return false;
  let p;
  try { p = decodeURIComponent(req.path); } catch (_) { return false; }
  // Pfade mit Tricks ("..", "\", doppelt kodiert, Steuerzeichen) sind nie offen
  if (p !== req.path || /\.\.|\\|%|[\x00-\x1f]/.test(req.path)) return false;
  return OPEN.some((re) => re.test(p));
}

// Sicherheits-Kopfzeilen für alle Antworten
function securityHeaders(res) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "frame-ancestors 'none'");
  res.set('Referrer-Policy', 'same-origin');
}

// Änderungen nur von der eigenen Seite (Schutz gegen fremde Seiten, die im Namen des Nutzers etwas abschicken)
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true; // z. B. curl – Anmeldung ist trotzdem nötig
  try { return new URL(o).host === req.headers.host; } catch (_) { return false; }
}

function middleware(req, res, next) {
  securityHeaders(res);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req)) return res.status(403).json({ error: 'Anfrage von fremder Seite abgelehnt.' });
  const u = currentUser(req);
  if (u) { req.user = u; return next(); }
  if (isOpen(req)) return next();
  if (req.path.startsWith('/api/') || req.method !== 'GET') return res.status(401).json({ error: 'Bitte anmelden.', login: true });
  const nextUrl = req.originalUrl && req.originalUrl !== '/' ? '?next=' + encodeURIComponent(req.originalUrl) : '';
  return res.redirect('/login' + nextUrl);
}

function adminOnly(req, res, next) {
  if (req.user && req.user.admin) return next();
  return res.status(403).json({ error: 'Nur für Administratoren.' });
}

function routes(app) {
  app.get('/login', (req, res) => {
    if (currentUser(req)) return res.redirect('/');
    res.set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, '..', 'public', 'login.html'));
  });
  app.get('/api/auth-state', (req, res) => {
    const u = currentUser(req);
    const setup = !hasUsers();
    if (setup) announceSetup(); // Code (erneut) ins Server-Protokoll schreiben
    res.set('Cache-Control', 'no-store').json({ setup, needCode: setup && !isDirectLocal(req), broken: usersBroken, user: u && !u.internal ? publicUser(u) : null });
  });

  app.post('/api/setup', (req, res) => {
    if (hasUsers()) return res.status(409).json({ error: 'Es gibt schon ein Konto. Bitte anmelden.' });
    const { name, password, code } = req.body || {};
    if (typeof name !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Ungültige Eingabe.' });
    if (!isDirectLocal(req)) {
      const ok = typeof code === 'string' && code.trim().length === SETUP_CODE.length &&
        crypto.timingSafeEqual(Buffer.from(code.trim().toUpperCase()), Buffer.from(SETUP_CODE));
      if (!ok) {
        noteFail(['ip:' + clientIp(req)]);
        return res.status(403).json({ error: 'Einrichtungscode fehlt oder ist falsch. Er steht im Server-Protokoll (docker compose logs schildgenerator).', needCode: true });
      }
    }
    try { addUser(name, password, true); } catch (e) { return res.status(400).json({ error: e.message }); }
    setCookie(req, res, createSession(normName(name)), SESSION_MS);
    console.log(`Erstes Konto angelegt: ${normName(name)} (Administrator)`);
    res.json({ ok: true });
  });

  app.post('/api/login', (req, res) => {
    const { name, password } = req.body || {};
    if (typeof name !== 'string' || typeof password !== 'string' || name.length > 100 || password.length > 1000) {
      return res.status(400).json({ error: 'Benutzername oder Passwort ist falsch.' });
    }
    const keys = ['u:' + key(name), 'ip:' + clientIp(req)];
    const wait = locked(keys);
    if (wait) return res.status(429).json({ error: `Zu viele Fehlversuche. Bitte in ${wait} Minute${wait === 1 ? '' : 'n'} erneut versuchen.` });
    const u = findUser(name);
    if (!checkPassword(u, password || '')) {
      noteFail(keys);
      return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });
    }
    for (const k of keys) fails.delete(k);
    setCookie(req, res, createSession(u.name), SESSION_MS);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE];
    if (token) { delete sessions[tokenKey(token)]; saveSessionsSoon(); }
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => res.set('Cache-Control', 'no-store').json(publicUser(req.user)));

  app.post('/api/password', (req, res) => {
    const { current, password } = req.body || {};
    if (typeof current !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Ungültige Eingabe.' });
    const u = findUser(req.user.name);
    if (!checkPassword(u, current || '')) return res.status(400).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
    try { setPassword(u.name, password); } catch (e) { return res.status(400).json({ error: e.message }); }
    // andere Geräte abmelden, dieses Gerät angemeldet lassen
    setCookie(req, res, createSession(u.name), SESSION_MS);
    res.json({ ok: true });
  });

  app.get('/api/users', adminOnly, (req, res) => res.set('Cache-Control', 'no-store').json(loadUsers().map(publicUser)));
  app.post('/api/users', adminOnly, (req, res) => {
    const { name, password, admin } = req.body || {};
    if (typeof name !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Ungültige Eingabe.' });
    try { addUser(name, password, admin === true); } catch (e) { return res.status(400).json({ error: e.message }); }
    res.json({ ok: true });
  });
  app.post('/api/users/:name/password', adminOnly, (req, res) => {
    const pw = (req.body || {}).password;
    if (typeof pw !== 'string') return res.status(400).json({ error: 'Ungültige Eingabe.' });
    try { setPassword(req.params.name, pw); } catch (e) { return res.status(400).json({ error: e.message }); }
    res.json({ ok: true });
  });
  app.post('/api/users/:name/admin', adminOnly, (req, res) => {
    try { setAdmin(req.params.name, (req.body || {}).admin === true); } catch (e) { return res.status(400).json({ error: e.message }); }
    res.json({ ok: true });
  });
  app.delete('/api/users/:name', adminOnly, (req, res) => {
    if (key(req.params.name) === key(req.user.name)) return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen.' });
    try { removeUser(req.params.name); } catch (e) { return res.status(400).json({ error: e.message }); }
    res.json({ ok: true });
  });
}

let lastAnnounce = 0;
function announceSetup() {
  if (!hasUsers() && !usersBroken && Date.now() - lastAnnounce > 60 * 1000) {
    lastAnnounce = Date.now();
    console.log('==============================================================');
    console.log(' Noch kein Konto. Erstes Konto auf der Anmeldeseite anlegen.');
    console.log(` Einrichtungscode (nur nötig, wenn nicht direkt im eigenen Netz): ${SETUP_CODE}`);
    console.log('==============================================================');
  }
}

module.exports = { announceSetup, middleware, routes, INTERNAL_TOKEN, addUser, setPassword, removeUser, setAdmin, loadUsers, publicUser, hasUsers };
