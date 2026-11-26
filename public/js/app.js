/* Schildgenerator – Bedienoberfläche */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = PT.esc;
  const MM = 96 / 25.4; // px pro mm bei 100 %
  const STORE_KEY = 'schildgenerator.v1';
  const DEFAULT_TEMPLATE = 'expert-a5';

  // ---------------------------------------------------------------- Zustand
  // state.tags = Schilder des aktuellen Sets. Sets liegen auf dem Server (data/sets).
  // Im Browser werden nur Einstellungen gemerkt (Druckoptionen, Vorlage).
  let state = { tags: [], selectedId: null, print: { paper: 'A4', margin: 0, gap: 0, rotate: true, cut: true }, template: DEFAULT_TEMPLATE };
  let selectedField = null;
  let legacyTags = [];

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved) {
      state.print = { ...state.print, ...(saved.print || {}) };
      if (saved.template) state.template = saved.template;
      if (Array.isArray(saved.tags) && saved.tags.length) legacyTags = saved.tags; // aus der Zeit vor den Sets
    }
  } catch (_) { /* leer starten */ }

  function setName(d) {
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  }
  function makeSet() {
    const d = new Date();
    return { id: d.toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 8), name: setName(d), createdAt: d.toISOString(), version: 0, deleted: {} };
  }
  // Das aktuelle Set gehört zum Konto: beim Start wird es vom Server geholt (siehe "Start" unten),
  // damit Handy und PC dieselben Schilder sehen. Bis dahin ein leeres Platzhalter-Set.
  let currentSet = makeSet();
  let setReady = false;

  // Abrufe, die vor mehr als 2 Minuten begonnen wurden, gelten als abgebrochen
  // (jüngere laufen vielleicht gerade auf einem anderen Gerät)
  function markInterrupted(tags) {
    tags.forEach((t) => {
      if (t.status === 'loading' && !(t.rev && Date.now() - t.rev < 120000)) { t.status = 'error'; t.error = 'Abruf unterbrochen – bitte neu laden.'; }
    });
  }

  // ---------------------------------------------------------------- Rückgängig / Wiederholen
  // Verlauf aus Momentaufnahmen des Sets. Automatische Änderungen (z. B. fertiger Abruf)
  // werden in den aktuellen Schritt eingerechnet, schnelles Tippen zu einem Schritt zusammengefasst.
  let history = [];
  let future = [];
  let lastPush = 0;
  let restoring = false;
  const snap = () => JSON.stringify({ tags: state.tags, sel: state.selectedId });

  function recordHistory(kind) {
    if (restoring) return;
    const s = snap();
    if (history.length && history[history.length - 1] === s) return;
    const now = Date.now();
    if (history.length && (kind === 'auto' || now - lastPush < 800)) {
      history[history.length - 1] = s;
      if (kind !== 'auto') lastPush = now;
    } else {
      history.push(s);
      if (history.length > 80) history.shift();
      future = [];
      lastPush = now;
    }
    updateUndoButtons();
  }

  function resetHistory() {
    history = [snap()];
    future = [];
    lastPush = 0;
    updateUndoButtons();
  }

  function restore(s) {
    const o = JSON.parse(s);
    restoring = true;
    state.tags = o.tags;
    state.selectedId = getTag(o.sel) ? o.sel : (state.tags[0] ? state.tags[0].id : null);
    selectedField = null;
    save();
    restoring = false;
    renderAll();
  }

  function undo() {
    if (history.length < 2) return;
    future.push(history.pop());
    restore(history[history.length - 1]);
    lastPush = 0;
    updateUndoButtons();
  }

  function redo() {
    if (!future.length) return;
    const s = future.pop();
    history.push(s);
    restore(s);
    lastPush = 0;
    updateUndoButtons();
  }

  function updateUndoButtons() {
    const u = document.getElementById('btnUndo');
    const r = document.getElementById('btnRedo');
    if (u) u.disabled = history.length < 2;
    if (r) r.disabled = future.length === 0;
  }

  // ---------------------------------------------------------------- Speichern & Abgleich
  // Jedes Schild trägt "rev" (Zeitpunkt der letzten Änderung). Gelöschte Schilder werden in
  // currentSet.deleted gemerkt, damit sie beim Zusammenführen nicht wieder auftauchen.
  // Der Server zählt eine Version hoch; speichert jemand auf altem Stand -> 409 -> zusammenführen.
  let synced = new Map(); // id -> JSON des Schilds beim letzten Abgleich (ohne rev)

  const tagKey = (t) => { const { rev, ...rest } = t; return JSON.stringify(rest); };

  function stampChanges() {
    const now = Date.now();
    const ids = new Set();
    for (const t of state.tags) {
      ids.add(t.id);
      const k = tagKey(t);
      if (synced.get(t.id) !== k) { t.rev = now; synced.set(t.id, k); }
    }
    for (const id of [...synced.keys()]) {
      if (!ids.has(id)) { currentSet.deleted[id] = now; synced.delete(id); }
    }
  }

  function rememberSynced() {
    synced = new Map(state.tags.map((t) => [t.id, tagKey(t)]));
  }

  // Zwei Stände zusammenführen: pro Schild gewinnt die neuere Änderung
  function mergeSets(local, remote) {
    const deleted = { ...(remote.deleted || {}) };
    for (const [id, ts] of Object.entries(local.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, ts);
    const rMap = new Map((remote.tags || []).map((t) => [t.id, t]));
    const lIds = new Set(local.tags.map((t) => t.id));
    const alive = (t) => !(deleted[t.id] && deleted[t.id] >= (t.rev || 0));
    const out = [];
    for (const lt of local.tags) {
      const rt = rMap.get(lt.id);
      const pick = rt && (rt.rev || 0) > (lt.rev || 0) ? rt : lt;
      if (alive(pick)) out.push(pick);
    }
    for (const rt of remote.tags || []) if (!lIds.has(rt.id) && alive(rt)) out.push(rt);
    return { tags: out, deleted };
  }

  function setPayload() {
    return {
      id: currentSet.id, name: currentSet.name, createdAt: currentSet.createdAt,
      baseVersion: currentSet.version, deleted: currentSet.deleted, tags: state.tags,
    };
  }

  let saveTimer = null;
  let savePromise = Promise.resolve();
  let savePending = false;
  function save(kind) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ print: state.print, template: state.template })); } catch (_) { /* egal */ }
    recordHistory(kind);
    savePending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSetNow, 400);
    renderSetBar();
  }

  function applyRemote(remote, note) {
    const sel = selected();
    const selBefore = sel ? tagKey(sel) : null;
    const merged = mergeSets({ tags: state.tags, deleted: currentSet.deleted }, remote);
    state.tags = merged.tags;
    currentSet.deleted = merged.deleted;
    currentSet.version = remote.version || 0;
    if (!getTag(state.selectedId)) state.selectedId = state.tags[0] ? state.tags[0].id : null;
    renderList(); renderSetBar();
    const selNow = selected();
    if (!selNow || selBefore !== tagKey(selNow)) { renderStage(); renderEditor(); }
    resetHistory();
    if (note) toast(note, 'ok');
  }

  function saveSetNow() {
    clearTimeout(saveTimer);
    savePromise = savePromise.then(async () => {
      const set = currentSet;
      stampChanges();
      if (!state.tags.length && !set.version) { savePending = false; return; } // leeres Set nie speichern
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch('/api/sets/' + set.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setPayload()) });
          const body = await r.json().catch(() => ({}));
          if (r.status === 409) {
            if (set !== currentSet) return;
            if (body.set) {
              applyRemote(body.set, 'Das Set wurde inzwischen auf einem anderen Gerät geändert – beide Stände wurden zusammengeführt.');
            } else {
              set.version = 0; // woanders gelöscht -> neu anlegen
              toast('Das Set wurde woanders gelöscht und wird mit deinem Stand neu gespeichert.', 'err');
            }
            continue;
          }
          if (!r.ok) throw new Error(body.error || 'Status ' + r.status);
          set.version = body.version;
          if (set === currentSet) rememberSynced();
          break;
        } catch (e) {
          toast('Set konnte nicht auf dem Server gespeichert werden: ' + e.message, 'err');
          break;
        }
      }
      savePending = false;
    });
    return savePromise;
  }

  // Dem Server sagen, welches Set auf diesem Konto gerade das aktuelle ist (alle Geräte folgen)
  function announceCurrent() {
    return fetch('/api/sets/current', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: currentSet.id, name: currentSet.name, createdAt: currentSet.createdAt }) }).catch(() => {});
  }

  // Ein Set anzeigen, ohne vorher zu speichern (Start bzw. Wechsel durch ein anderes Gerät)
  function showSet(set) {
    markInterrupted(set.tags || []);
    currentSet = { id: set.id, name: set.name, createdAt: set.createdAt, version: set.version || 0, deleted: set.deleted || {} };
    state.tags = set.tags || [];
    state.selectedId = state.tags[0] ? state.tags[0].id : null;
    selectedField = null;
    rememberSynced();
    resetHistory();
    renderAll();
  }

  // Das aktuelle Set des Kontos laden (beim Start und wenn ein anderes Gerät das Set wechselt)
  async function followCurrent(cur, note) {
    if (cur.exists) {
      const set = await api('/api/sets/' + encodeURIComponent(cur.id));
      showSet(set);
    } else {
      showSet({ id: cur.id, name: cur.name, createdAt: cur.createdAt, version: 0, deleted: {}, tags: [] });
    }
    if (note) toast(note, 'ok');
  }

  // Live-Abgleich: Änderungen von anderen Geräten (z. B. Handy-Scans) übernehmen
  async function pollSet() {
    if (document.hidden || savePending || !setReady) return;
    const set = currentSet;
    try {
      const cur = await api('/api/sets/current', { cache: 'no-store' });
      if (set !== currentSet || savePending) return;
      // Anderes Gerät hat ein anderes Set aktiv gemacht -> folgen (eigene Änderungen sind schon gespeichert)
      if (cur && cur.id !== set.id) {
        await followCurrent(cur, `Set „${cur.name}“ wurde auf einem anderen Gerät geöffnet – hier ebenfalls.`);
        return;
      }
      if (!cur) { announceCurrent(); return; }
      const v = { exists: cur.exists, version: cur.version };
      if (!v.exists || v.version <= set.version) return;
      const remote = await api('/api/sets/' + set.id);
      if (set !== currentSet || savePending) return;
      applyRemote(remote);
      rememberSynced();
    } catch (_) { /* Server kurz nicht erreichbar */ }
  }
  setInterval(pollSet, 4000);
  document.addEventListener('visibilitychange', pollSet);

  // Beim Verlassen/Neuladen noch schnell speichern
  window.addEventListener('pagehide', () => {
    if (!savePending || !state.tags.length) return;
    stampChanges();
    try { fetch('/api/sets/' + currentSet.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setPayload()), keepalive: true }); } catch (_) { /* egal */ }
  });

  const uid = () => Math.random().toString(36).slice(2, 10);
  const tpl = (t) => PT.Templates[t.template] || PT.Templates[DEFAULT_TEMPLATE];
  const getTag = (id) => state.tags.find((t) => t.id === id);
  const selected = () => getTag(state.selectedId);
  const euro = (v) => (v > 0 ? v.toFixed(2).replace('.', ',') + ' €' : '–');

  function newTag(query, qty = 1) {
    return {
      id: uid(), query: query || '', qty, template: state.template || DEFAULT_TEMPLATE, status: query ? 'loading' : 'manual',
      error: null, warnings: [],
      data: { group: '', name: '', artnr: '', bullets: [], price: null, uvp: null, showUvp: true, qrUrl: '', logoUrl: '', logoData: '', logoDataUp: '', logoUpscale: false },
      meta: {}, layout: {},
    };
  }

  // ---------------------------------------------------------------- Helfer
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3500);
  }

  // Sitzung abgelaufen / abgemeldet -> zur Anmeldeseite (gilt für alle Anfragen der Seite)
  const rawFetch = window.fetch.bind(window);
  let goingToLogin = false;
  window.fetch = async (...args) => {
    const r = await rawFetch(...args);
    if (r.status === 401 && !goingToLogin) {
      const u = String(args[0] && args[0].url || args[0]);
      if (u.startsWith('/') && !/\/api\/(login|password)$/.test(u)) {
        goingToLogin = true;
        location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
      }
    }
    return r;
  };

  async function api(url, opts) {
    const r = await fetch(url, opts);
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error((body && body.error) || (typeof body === 'string' ? body : 'Fehler ' + r.status));
    return body;
  }

  // Eingabe auswerten: eine Zeile pro Artikel. Funktioniert auch mit aus Excel kopierten
  // Tabellen (Spalten mit Tab/Semikolon), egal in welcher Reihenfolge EAN und Menge stehen.
  function parseCodes(text) {
    const out = [];
    const skipped = [];
    const excelNumber = [];
    const byCode = new Map();
    for (const line of String(text).split(/\r?\n/)) {
      const l = line.trim();
      if (!l) continue;
      if (/\d[.,]\d+E\+?\d+/i.test(l)) { excelNumber.push(l); continue; }
      const tokens = l.split(/[\t;,|]+|\s+/).map((x) => x.trim()).filter(Boolean);
      // Code: 8–14 Ziffern (EAN, Web-Code), sonst erstes Wort mit Ziffern
      let code = tokens.find((x) => /^\d{8,14}$/.test(x));
      if (!code) code = tokens.find((x) => /\d/.test(x) && x.length >= 5 && !/^\d{1,3}$/.test(x) && !/^\d+[x×*]$|^[x×*]\d+$/i.test(x));
      if (!code) { skipped.push(l); continue; }
      // Menge: "x3", "3x", "3 Stk" oder eine allein stehende Zahl mit 1–3 Stellen.
      // Bei Tabellenzeilen zählt nur eine Zelle, die nur aus der Menge besteht (nicht "TV 55 Zoll").
      let qty = null;
      const cells = l.split(/[\t;|]+/).map((x) => x.trim()).filter(Boolean);
      if (cells.length > 1) {
        for (const c of cells) {
          const m = /^(?:[x×*]\s*)?(\d{1,3})(?:\s*(?:[x×*]|stk\.?|stück|st\.?))?$/i.exec(c);
          if (m) { qty = +m[1]; break; }
        }
      }
      for (let i = 0; qty == null && i < tokens.length; i++) {
        const x = tokens[i];
        let m = /^[x×*](\d{1,3})$/i.exec(x) || /^(\d{1,3})[x×*]$/i.exec(x);
        if (m) { qty = +m[1]; break; }
        if (cells.length > 1) continue; // Tabelle: keine Zahlen aus Text-Zellen raten
        if (/^\d{1,3}$/.test(x)) {
          if (/^[x×*]$/i.test(tokens[i - 1] || '') || /^(stk|stück|st|x)\.?$/i.test(tokens[i + 1] || '')) { qty = +x; break; }
          if (qty == null) qty = +x;
        }
      }
      if (qty == null) qty = 1;
      qty = Math.max(1, Math.min(999, qty));
      if (byCode.has(code)) byCode.get(code).qty += qty;
      else { const o = { code, qty }; byCode.set(code, o); out.push(o); }
    }
    return { items: out, skipped, excelNumber };
  }

  // Lange Artikelnamen sinnvoll kürzen: nur der Teil vor dem ersten Komma, ohne Klammern,
  // notfalls an einer Wortgrenze abgeschnitten. Der volle Name bleibt in data.nameFull.
  const NAME_MAX = 40;
  function shortenName(name) {
    let s = String(name || '').trim();
    if (!s) return s;
    const firstPart = s.split(/\s*,\s*/)[0];
    if (firstPart.length >= 3) s = firstPart;
    s = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > NAME_MAX) {
      const cut = s.slice(0, NAME_MAX + 1);
      const sp = cut.lastIndexOf(' ');
      s = (sp > 15 ? cut.slice(0, sp) : cut.slice(0, NAME_MAX)).trim();
    }
    return s;
  }

  // ---------------------------------------------------------------- Abruf
  let fetchQueue = Promise.resolve();

  function enqueueFetch(tag) {
    tag.status = 'loading';
    tag.error = null;
    renderList();
    fetchQueue = fetchQueue.then(() => fetchTag(tag.id)).catch(() => {});
  }

  async function fetchTag(id) {
    const tag = getTag(id);
    if (!tag) return;
    try {
      const r = await api('/api/lookup?q=' + encodeURIComponent(tag.query));
      const t = getTag(id);
      if (!t) return;
      Object.assign(t.data, {
        group: r.group || '',
        brand: r.brand || r.manufacturer || '',
        ean: r.ean || '',
        nameFull: r.name || '',
        nameShort: shortenName(r.name || ''),
        name: t.data.nameTwoLines ? (r.name || '') : shortenName(r.name || ''),
        artnr: r.webcode || '',
        bullets: r.bullets || [],
        price: r.price,
        qrUrl: r.qrUrl || '',
        logoUrl: r.logoUrl || '',
      });
      if (r.logoSource !== 'library') t.data.logoData = t.data.logoData || '';
      t.meta = {
        ...t.meta,
        fetchedAt: r.fetchedAt, productUrl: r.productUrl, fetchedPrice: r.price, ean: r.ean, webcode: r.webcode, mpn: r.mpn,
        fullName: r.fullName, brand: r.brand, manufacturer: r.manufacturer, logoBrand: r.logoBrand, logoSource: r.logoSource,
        expertLogoUrl: r.expertLogoUrl || (r.logoSource === 'expert' ? r.logoUrl : ''),
        storeStock: r.priceInfo && r.priceInfo.storeStock, shownOnPage: r.priceInfo && r.priceInfo.shownOnPage,
      };
      t.warnings = r.warnings || [];
      t.status = 'ok';
      t.error = null;
      save('auto');
      renderList();
      if (state.selectedId === id) { renderStage(); renderEditor(); }

      // UVP: nur von expert.de übernehmen. Von Hand eingetragene UVP bleibt erhalten.
      const u = t.meta.uvp || {};
      if (!u.manual) {
        if (r.expertUvp) {
          t.data.uvp = r.expertUvp;
          t.meta.uvp = { status: 'expert' };
        } else {
          t.data.uvp = null;
          t.meta.uvp = { status: 'none' };
        }
        save('auto'); refreshTag(id);
      }
    } catch (e) {
      const t = getTag(id);
      if (!t) return;
      t.status = 'error';
      t.error = e.message;
      save('auto');
      renderList();
      if (state.selectedId === id) renderEditor();
    }
  }

  function refreshTag(id) {
    renderList();
    if (state.selectedId === id) { renderStage(); renderEditor(); }
  }

  // ---------------------------------------------------------------- Liste
  function statusDot(t) {
    if (t.status === 'loading') return '<span class="dot dot-load" title="Wird abgerufen"></span>';
    if (t.status === 'error') return '<span class="dot dot-err" title="Fehler"></span>';
    if ((t.warnings && t.warnings.length) || priceChangeText(t)) return '<span class="dot dot-warn" title="Bitte prüfen"></span>';
    if (t.status === 'manual') return '<span class="dot" title="Manuell"></span>';
    return '<span class="dot dot-ok" title="OK"></span>';
  }

  function renderList() {
    const ul = $('#tagList');
    ul.innerHTML = state.tags.map((t) => `
      <li class="tag-item ${t.id === state.selectedId ? 'active' : ''}" data-id="${t.id}">
        <div class="tag-title">${statusDot(t)}<span>${esc(t.data.name || t.query || 'Neues Schild')}</span></div>
        <div class="tag-price">${t.status === 'loading' ? '<span class="spinner"></span>' : euro(t.data.price)}</div>
        <div class="tag-sub"><span class="tpl-pill" title="${esc(tpl(t).name)}">${esc(tpl(t).short || tpl(t).name)}</span>${esc([t.data.group, t.data.artnr && 'Art.Nr. ' + t.data.artnr].filter(Boolean).join(' · ') || (t.status === 'loading' ? 'Wird von expert.de abgerufen…' : tpl(t).name))}</div>
        <div class="tag-actions">
          <span class="qty" title="Menge">
            <button type="button" data-act="minus" aria-label="weniger">−</button>
            <input type="number" min="0" max="999" value="${t.qty}" data-act="qty" aria-label="Menge">
            <button type="button" data-act="plus" aria-label="mehr">+</button>
          </span>
          <button class="mini-btn" data-act="dup" title="Duplizieren"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button>
          <button class="mini-btn" data-act="del" title="Entfernen"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
        </div>
        ${t.status === 'error' ? `<div class="tag-err">${esc(t.error)}</div>` : ''}
        ${priceChangeText(t) ? `<div class="tag-change">${esc(priceChangeText(t))}</div>` : ''}
      </li>`).join('');
    $('#emptyHint').style.display = state.tags.length ? 'none' : '';
    $('#listCount').textContent = state.tags.length ? `(${state.tags.length})` : '';
    const n = printableItems().length;
    $('#printCount').textContent = n;
  }

  $('#tagList').addEventListener('click', (e) => {
    const li = e.target.closest('.tag-item');
    if (!li) return;
    const t = getTag(li.dataset.id);
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'minus') { t.qty = Math.max(0, t.qty - 1); }
      else if (a === 'plus') { t.qty = Math.min(999, t.qty + 1); }
      else if (a === 'dup') {
        const c = JSON.parse(JSON.stringify(t)); c.id = uid();
        state.tags.splice(state.tags.indexOf(t) + 1, 0, c); state.selectedId = c.id; selectedField = null;
        renderAll();
      } else if (a === 'del') {
        state.tags = state.tags.filter((x) => x !== t);
        if (state.selectedId === t.id) { state.selectedId = state.tags[0] ? state.tags[0].id : null; selectedField = null; }
        renderAll();
      } else if (a === 'qty') return;
      save(); renderList();
      return;
    }
    if (state.selectedId !== t.id) { state.selectedId = t.id; selectedField = null; save(); renderAll(); }
  });
  $('#tagList').addEventListener('change', (e) => {
    if (e.target.dataset.act !== 'qty') return;
    const t = getTag(e.target.closest('.tag-item').dataset.id);
    t.qty = Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0));
    save(); renderList();
  });

  // ---------------------------------------------------------------- Vorschau / Bühne
  function stageScale() {
    const t = selected();
    if (!t) return 1;
    const T = tpl(t);
    const st = $('#stage');
    return Math.min((st.clientWidth - 56) / (T.width * MM), (st.clientHeight - 56) / (T.height * MM));
  }

  function renderStage() {
    const t = selected();
    const sc = $('#stageScaler');
    $('#stageEmpty').style.display = t ? 'none' : '';
    if (!t) { sc.innerHTML = ''; updateFieldTools(); return; }
    sc.innerHTML = tpl(t).render(t);
    const pt = sc.firstElementChild;
    pt.classList.add('pt-editing');
    applyStageScale();
    if (selectedField) { const f = pt.querySelector(`[data-field="${selectedField}"]`); if (f) f.classList.add('is-selected'); }
    PT.fitAll(sc);
    updateFieldTools();
  }

  function applyStageScale() {
    const sc = $('#stageScaler');
    sc.style.transform = `translate(-50%, -50%) scale(${Math.max(0.1, stageScale())})`;
  }
  window.addEventListener('resize', applyStageScale);

  function updateFieldTools() {
    const t = selected();
    const has = Boolean(t && selectedField);
    $('#fieldScale').disabled = !has;
    $('#btnResetField').disabled = !has;
    $('#btnResetAll').disabled = !t;
    if (has) {
      const f = tpl(t).fields[selectedField];
      const s = Math.round(((t.layout[selectedField] || {}).s || 1) * 100);
      $('#fieldScale').value = s; $('#fieldScaleOut').textContent = s + '%';
      $('#fieldInfo').innerHTML = `Ausgewählt: <b>${esc(f.label)}</b> <span class="muted">· ziehen oder Pfeiltasten (Umschalt = schneller)</span>`;
    } else {
      $('#fieldScale').value = 100; $('#fieldScaleOut').textContent = '100%';
      $('#fieldInfo').innerHTML = '<span class="muted">Feld anklicken zum Auswählen · mit der Maus verschieben</span>';
    }
  }

  // Verschieben per Maus
  let drag = null;
  $('#stage').addEventListener('pointerdown', (e) => {
    const f = e.target.closest('.pt-f');
    const t = selected();
    if (!t) return;
    $$('.pt-f.is-selected', $('#stage')).forEach((x) => x.classList.remove('is-selected'));
    if (!f) { selectedField = null; updateFieldTools(); return; }
    e.preventDefault();
    selectedField = f.dataset.field;
    f.classList.add('is-selected');
    updateFieldTools();
    const o = t.layout[selectedField] || {};
    drag = { el: f, id: selectedField, sx: e.clientX, sy: e.clientY, dx0: o.dx || 0, dy0: o.dy || 0, scale: stageScale(), moved: false };
    f.setPointerCapture(e.pointerId);
  });
  $('#stage').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const t = selected();
    const k = MM * drag.scale;
    const dx = Math.round(((e.clientX - drag.sx) / k + drag.dx0) * 10) / 10;
    const dy = Math.round(((e.clientY - drag.sy) / k + drag.dy0) * 10) / 10;
    const b = tpl(t).fields[drag.id];
    drag.el.style.left = b.x + dx + 'mm';
    drag.el.style.top = b.y + dy + 'mm';
    drag.dx = dx; drag.dy = dy; drag.moved = true;
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      const t = selected();
      t.layout[drag.id] = { ...(t.layout[drag.id] || {}), dx: drag.dx, dy: drag.dy };
      save();
    }
    drag = null;
  };
  $('#stage').addEventListener('pointerup', endDrag);
  $('#stage').addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !inField && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); return; }
    }
    if (!selectedField || !selected()) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const step = e.shiftKey ? 2 : 0.5;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!map[e.key]) return;
    e.preventDefault();
    const t = selected();
    const o = t.layout[selectedField] || {};
    t.layout[selectedField] = { ...o, dx: Math.round(((o.dx || 0) + map[e.key][0]) * 10) / 10, dy: Math.round(((o.dy || 0) + map[e.key][1]) * 10) / 10 };
    save(); renderStage();
  });

  $('#fieldScale').addEventListener('input', (e) => {
    const t = selected();
    if (!t || !selectedField) return;
    t.layout[selectedField] = { ...(t.layout[selectedField] || {}), s: +e.target.value / 100 };
    $('#fieldScaleOut').textContent = e.target.value + '%';
    save(); renderStageDebounced();
  });
  $('#btnResetField').addEventListener('click', () => {
    const t = selected();
    if (!t || !selectedField) return;
    delete t.layout[selectedField];
    save(); renderStage();
  });
  $('#btnResetAll').addEventListener('click', () => {
    const t = selected();
    if (!t) return;
    t.layout = {};
    save(); renderStage();
  });

  let stageTimer = null;
  function renderStageDebounced() { clearTimeout(stageTimer); stageTimer = setTimeout(renderStage, 120); }

  // ---------------------------------------------------------------- Editor
  // Suchbegriff für die UVP: Marke + Gerätename (nie EAN oder Artikelnummer)
  function googleUvpQuery(t) {
    const m = t.meta || {};
    const d = t.data || {};
    const brand = (d.brand || m.brand || m.manufacturer || '').trim();
    let name = (d.nameFull || d.name || m.fullName || '').trim();
    // Zahlenfolgen wie EAN/Artikelnummer (6+ Ziffern) und Klammern entfernen
    name = name.replace(/\([^)]*\)/g, ' ').replace(/\b\d{6,}\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return '';
    const withBrand = brand && !name.toLowerCase().startsWith(brand.toLowerCase().split(' ')[0]) ? `${brand} ${name}` : name;
    return `${withBrand} UVP Preis`;
  }
  function openGoogleUvp(t) {
    const q = googleUvpQuery(t);
    if (!q) { toast('Für die Suche fehlt der Gerätename – bitte erst den Artikel abrufen oder den Namen eintragen.', 'err'); return; }
    // udm=50 öffnet direkt den KI-Modus der Google-Suche
    window.open('https://www.google.com/search?udm=50&q=' + encodeURIComponent(q), '_blank', 'noopener');
  }


  function uvpBlock(t) {
    const u = (t.meta && t.meta.uvp) || {};
    const pct = PT.savingsPercent(t.data.price, t.data.uvp);
    let pill = '';
    let note = '';
    if (u.manual) pill = '<span class="pill">manuell</span>';
    else if (u.status === 'expert') { pill = '<span class="pill pill-ok">von expert.de</span>'; note = 'Diese UVP ist auf der expert-Produktseite hinterlegt und wurde automatisch übernommen.'; }
    else if (u.status === 'none') { pill = '<span class="pill">nicht auf expert.de</span>'; note = 'Auf expert.de ist keine UVP hinterlegt. Bei Bedarf von Hand eintragen.'; }
    return `
      <div class="uvp-box">
        <div class="ed-grid">
          <label class="ed-field"><span>UVP (€) ${pill}</span><input type="number" step="0.01" min="0" data-k="uvp" value="${t.data.uvp != null ? t.data.uvp : ''}" placeholder="z. B. 69.99"></label>
          <label class="ed-field"><span>Ersparnis</span><input type="text" value="${pct !== null ? pct + ' %' : '–'}" disabled title="Wird automatisch berechnet: (UVP − Preis) / UVP, abgerundet"></label>
        </div>
        ${note ? `<div class="uvp-note">${esc(note)}</div>` : ''}
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn-sm" type="button" data-do="googleUvp" title="Öffnet die Google-Suche (KI-Modus) mit Marke und Gerätename in einem neuen Tab">UVP bei Google suchen ↗</button>
          ${u.manual && t.meta && t.meta.fetchedAt ? '<button class="btn btn-sm" type="button" data-do="uvpReset">UVP von expert.de übernehmen</button>' : ''}
          <label class="check"><input type="checkbox" data-k="showUvp" ${t.data.showUvp !== false ? 'checked' : ''}> UVP-Feld anzeigen</label>
        </div>
      </div>`;
  }

  function logoBlock(t) {
    const d = t.data;
    const src = PT.logoSrcFor(d);
    const up = d.logoUpscale === true;
    let pill = '';
    if (d.logoData) pill = '<span class="pill">eigenes PNG</span>';
    else if (d.logoUrl && d.logoUrl.startsWith('/logos/')) pill = '<span class="pill pill-ok">aus der Bibliothek</span>';
    else if (d.logoUrl) pill = '<span class="pill">von expert.de</span>';
    return `
      <div class="ed-field"><span>Herstellerlogo ${pill}</span>
        <div class="logo-prev">${src ? `<img src="${esc(src)}" alt="">` : '<span class="muted">kein Logo</span>'}</div>
        ${src ? `
        <div class="seg" role="group" aria-label="Logo-Darstellung">
          <button type="button" class="${up ? '' : 'on'}" data-do="logoMode" data-mode="original" aria-pressed="${!up}">Original</button>
          <button type="button" class="${up ? 'on' : ''}" data-do="logoMode" data-mode="up" aria-pressed="${up}">Hochskaliert</button>
        </div>
        <div class="uvp-note" style="margin:0 0 8px">${up ? 'Das Logo wird vergrößert und die Kanten werden geschärft. Sehr kleine Details können dabei verloren gehen.' : 'Das Logo wird so verwendet, wie es ist. Kleine Logos können im Druck unscharf wirken – dann „Hochskaliert“ wählen.'}</div>` : ''}
        <div class="btn-row">
          <label class="btn btn-sm"><input type="file" accept="image/png" hidden data-do="logoBrand">PNG für Marke${t.meta.logoBrand ? ' „' + esc(t.meta.logoBrand) + '“' : ''}</label>
          <label class="btn btn-sm"><input type="file" accept="image/png" hidden data-do="logoOnly">PNG nur hier</label>
          ${t.meta.expertLogoUrl && d.logoUrl !== t.meta.expertLogoUrl ? '<button class="btn btn-sm" type="button" data-do="logoExpert">expert-Logo</button>' : ''}
          ${src ? '<button class="btn btn-sm" type="button" data-do="logoRemove">Entfernen</button>' : ''}
        </div>
      </div>`;
  }

  function renderEditor() {
    const t = selected();
    const ed = $('#editor');
    if (!t) { ed.innerHTML = '<div class="editor-empty muted">Kein Schild ausgewählt.</div>'; return; }
    const d = t.data;
    const m = t.meta || {};
    const priceChanged = m.fetchedPrice != null && d.price != null && Math.abs(d.price - m.fetchedPrice) > 0.004;
    const T = tpl(t);
    ed.innerHTML = `
      ${t.status === 'error' ? `<div class="err-box"><b>Abruf fehlgeschlagen:</b> ${esc(t.error)}</div>` : ''}
      ${priceChangeText(t) ? `<div class="warn-box"><b>${esc(priceChangeText(t))}</b><br>Das Schild zeigt jetzt den neuen Wert. <button class="link" type="button" data-do="ackChange">Verstanden, Hinweis ausblenden</button></div>` : ''}
      ${(t.warnings || []).map((w) => `<div class="warn-box">${esc(w)}</div>`).join('')}
      <section class="ed-section">
        <h3>Artikel</h3>
        <div class="row" style="margin:0 0 10px">
          <input type="text" data-k="query" value="${esc(t.query)}" placeholder="EAN oder Artikelnummer">
          <button class="btn btn-sm" type="button" data-do="refetch" ${t.status === 'loading' ? 'disabled' : ''}>${t.status === 'loading' ? '<span class="spinner"></span>' : 'Von expert.de laden'}</button>
        </div>
        ${m.fetchedAt ? `<div class="ed-source">Quelle: <a href="${esc(m.productUrl)}" target="_blank" rel="noopener">expert.de · Markt Asbach</a> · abgerufen ${new Date(m.fetchedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${m.storeStock != null ? ` · Bestand im Markt: ${m.storeStock}` : ''}${m.ean ? ` · EAN ${esc(m.ean)}` : ''}</div>` : ''}
      </section>
      <section class="ed-section">
        <h3>Inhalt</h3>
        <div class="ed-field"><span>Vorlage</span>
          <div class="tpl-current"><div class="tpl-current-thumb" id="edTplThumb"></div>
            <div><b>${esc(T.name)}</b><div class="muted" style="font-size:12px">${esc(T.format)} · ${T.width} × ${T.height} mm</div></div></div>
          <div class="btn-row">
            <button class="btn btn-sm" type="button" data-do="tplChange">Vorlage wechseln</button>
            <button class="btn btn-sm" type="button" data-do="tplAdd" title="Denselben Artikel zusätzlich in einer anderen Vorlage/Größe anlegen">+ Weitere Vorlage</button>
          </div>
        </div>
        <label class="ed-field"><span>Warengruppe</span><input type="text" data-k="group" value="${esc(d.group)}"></label>
        <label class="ed-field"><span>Artikelname</span><input type="text" data-k="name" value="${esc(d.name)}"></label>
        ${T.twoLineName ? `<div class="seg" role="group" aria-label="Artikelname">
          <button type="button" class="${d.nameTwoLines ? '' : 'on'}" data-do="nameMode" data-mode="short">Kurz · 1 Zeile</button>
          <button type="button" class="${d.nameTwoLines ? 'on' : ''}" data-do="nameMode" data-mode="full">Vollständig · 2 Zeilen</button>
        </div>` : ''}
        ${d.nameFull && d.nameFull !== d.name ? `<div class="uvp-note" style="margin:-2px 0 10px">Voller Name: ${esc(d.nameFull)}</div>` : ''}
        <div class="ed-grid">
          <label class="ed-field"><span>Artikelnummer</span><input type="text" data-k="artnr" value="${esc(d.artnr)}"></label>
          <label class="ed-field"><span>EAN (Barcode)</span><input type="text" inputmode="numeric" data-k="ean" value="${esc(d.ean || '')}"></label>
        </div>
        <label class="ed-field"><span>Marke (als Text, z. B. beim Blister)</span><input type="text" data-k="brand" value="${esc(d.brand || '')}"></label>
        <label class="ed-field"><span>Eigenschaften <span class="muted" style="font-weight:400">eine pro Zeile</span></span><textarea rows="5" data-k="bullets" style="font-family:inherit;font-size:13px">${esc((d.bullets || []).join('\n'))}</textarea></label>
      </section>
      <section class="ed-section">
        <h3>Preis</h3>
        <label class="ed-field"><span>Preis (€) ${m.fetchedPrice != null ? (priceChanged ? '<span class="pill pill-warn">manuell geändert</span>' : '<span class="pill pill-ok">expert.de Asbach</span>') : ''}</span>
          <input type="number" step="0.01" min="0" data-k="price" value="${d.price != null ? d.price : ''}"></label>
        ${priceChanged ? `<div class="warn-box">Abweichung vom Marktpreis auf expert.de (${euro(m.fetchedPrice)}).</div>` : ''}
        ${uvpBlock(t)}
      </section>
      <section class="ed-section">
        <h3>Logo &amp; QR-Code</h3>
        ${logoBlock(t)}
        <label class="ed-field"><span>QR-Code führt zu</span><input type="url" data-k="qrUrl" value="${esc(d.qrUrl)}" placeholder="https://www.expert.de/…"></label>
      </section>`;
    PT.renderThumb($('#edTplThumb'), T.id, 52, 72, t.data);
  }

  // Eingaben im Editor
  $('#editor').addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const t = selected();
    if (!k || !t) return;
    const v = e.target.value;
    if (k === 'query') { t.query = v.trim(); save(); return; }
    if (k === 'bullets') t.data.bullets = v.split('\n');
    else if (k === 'price') t.data.price = v === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100) / 100;
    else if (k === 'uvp') {
      t.data.uvp = v === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100) / 100;
      t.meta.uvp = { manual: true, status: 'manual' };
    } else if (k === 'showUvp') t.data.showUvp = e.target.checked;
    else t.data[k] = v;
    if (t.status === 'manual' || t.status === 'ok' || t.status === 'error') { /* Status bleibt */ }
    save();
    renderList();
    renderStageDebounced();
    if (k === 'price' || k === 'uvp') updateSavingsField(t);
  });
  $('#editor').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (k === 'price' || k === 'uvp') renderEditor();
  });

  function updateSavingsField(t) {
    const pct = PT.savingsPercent(t.data.price, t.data.uvp);
    const inp = $('#editor input[title^="Wird automatisch"]');
    if (inp) inp.value = pct !== null ? pct + ' %' : '–';
  }

  $('#editor').addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    const t = selected();
    if (!b || !t || b.tagName === 'INPUT') return;
    const a = b.dataset.do;
    if (a === 'refetch') {
      if (!t.query) { toast('Bitte zuerst EAN oder Artikelnummer eintragen.', 'err'); return; }
      enqueueFetch(t); renderEditor();
    } else if (a === 'uvpReset') {
      t.meta.uvp = {};
      enqueueFetch(t); renderEditor();
    } else if (a === 'googleUvp') {
      openGoogleUvp(t);
    } else if (a === 'ackChange') {
      if (t.meta.priceCheck) t.meta.priceCheck.ack = true;
      save(); renderList(); renderEditor();
    } else if (a === 'nameMode') {
      const full = b.dataset.mode === 'full';
      if (full && !t.data.nameTwoLines) {
        t.data.nameTwoLines = true;
        if (t.data.nameFull && (!t.data.name || t.data.name === t.data.nameShort)) t.data.name = t.data.nameFull;
      } else if (!full && t.data.nameTwoLines) {
        t.data.nameTwoLines = false;
        if (t.data.nameFull && t.data.name === t.data.nameFull) t.data.name = t.data.nameShort || shortenName(t.data.nameFull);
      }
      save(); renderStage(); renderEditor();
    } else if (a === 'tplChange') {
      openTplPicker('change');
    } else if (a === 'tplAdd') {
      openTplPicker('add');
    } else if (a === 'logoMode') {
      t.data.logoUpscale = b.dataset.mode === 'up';
      save(); renderStage(); renderEditor();
    } else if (a === 'logoExpert') {
      t.data.logoUrl = t.meta.expertLogoUrl; t.data.logoData = ''; save(); renderStage(); renderEditor();
    } else if (a === 'logoRemove') {
      t.data.logoUrl = ''; t.data.logoData = ''; t.data.logoDataUp = ''; save(); renderStage(); renderEditor();
    }
  });

  $('#editor').addEventListener('change', async (e) => {
    const inp = e.target;
    const a = inp.dataset.do;
    const t = selected();
    if (!t || !(a === 'logoBrand' || a === 'logoOnly') || !inp.files[0]) return;
    const file = inp.files[0];
    if (file.type !== 'image/png') { toast('Bitte nur PNG-Dateien verwenden.', 'err'); return; }
    const dataUrl = await readFile(file);
    if (a === 'logoOnly') {
      try {
        const r = await api('/api/logos/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
        t.data.logoData = r.dataUrl;
        t.data.logoDataUp = r.dataUrlUp;
      } catch (err) { toast(err.message, 'err'); return; }
      save(); renderStage(); renderEditor(); return;
    }
    let brand = t.meta.logoBrand;
    if (!brand) brand = prompt('Für welche Marke ist dieses Logo? (z. B. logitech-g)', (t.meta.brand || '').toLowerCase()) || '';
    if (!brand.trim()) return;
    try {
      const r = await uploadLogo(brand, dataUrl);
      applyLibraryLogo(r.brand, r.url);
      toast('Logo gespeichert und für alle Artikel dieser Marke übernommen.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });

  function readFile(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }
  async function uploadLogo(brand, dataUrl) {
    return api('/api/logos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand, dataUrl }) });
  }
  function applyLibraryLogo(brand, url) {
    state.tags.forEach((x) => {
      if (x.meta && x.meta.logoBrand === brand) { x.data.logoUrl = url; x.data.logoData = ''; x.meta.logoSource = 'library'; }
    });
    const t = selected();
    if (t && !t.meta.logoBrand) { t.meta.logoBrand = brand; t.data.logoUrl = url; t.data.logoData = ''; }
    save(); renderStage(); renderEditor();
  }

  // ---------------------------------------------------------------- Hinzufügen
  $('#btnFetch').addEventListener('click', addFromInput);
  $('#inputCodes').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addFromInput(); });
  function addFromInput() {
    const parsed = parseCodes($('#inputCodes').value);
    const items = parsed.items;
    if (parsed.excelNumber.length) toast(`${parsed.excelNumber.length} Zeile(n) übersprungen: Excel hat die EAN als Zahl gespeichert (z. B. „5,09921E+12“), dabei gehen Ziffern verloren. Spalte in Excel als „Text“ formatieren und neu kopieren.`, 'err');
    if (parsed.skipped.length) toast(`${parsed.skipped.length} Zeile(n) ohne erkennbare EAN/Artikelnummer übersprungen (z. B. Überschriften).`);
    if (!items.length) { if (!parsed.excelNumber.length) toast('Bitte mindestens eine EAN oder Artikelnummer eingeben.', 'err'); return; }
    let first = null;
    for (const it of items) {
      const t = newTag(it.code, it.qty);
      state.tags.push(t);
      if (!first) first = t;
      enqueueFetch(t);
    }
    $('#inputCodes').value = '';
    state.selectedId = first.id; selectedField = null;
    save(); renderAll();
  }
  $('#btnEmpty').addEventListener('click', () => {
    const t = newTag('', 1);
    state.tags.push(t); state.selectedId = t.id; selectedField = null;
    save(); renderAll();
  });
  $('#btnClear').addEventListener('click', () => {
    if (!state.tags.length || !confirm('Alle Schilder aus der Liste entfernen?')) return;
    state.tags = []; state.selectedId = null; selectedField = null;
    save(); renderAll();
  });

  // ---------------------------------------------------------------- Druck
  // Was gedruckt wird: standardmäßig das aktuelle Set, aus der Set-Liste auch ein anderes
  let printSource = null;
  const printTags = () => (printSource ? printSource.tags : state.tags);

  function printableItems(tags = state.tags) {
    const out = [];
    for (const t of tags) {
      if (t.status === 'loading' || t.status === 'error') continue;
      if (!(t.data.price > 0)) continue;
      const T = tpl(t);
      for (let i = 0; i < t.qty; i++) out.push({ id: t.id, tag: t, w: T.width, h: T.height });
    }
    return out;
  }

  function sheetHtml(page, opt) {
    const slots = page.items.map((it) => {
      const t = it.tag || getTag(it.id);
      const inner = tpl(t).render(t);
      const sc = page.scale || 1;
      const scale = sc !== 1 ? ` scale(${sc})` : '';
      const rot = it.rot ? `transform:translateX(${it.th}mm) rotate(90deg)${scale};transform-origin:0 0;` : (scale ? `transform:${scale.trim()};transform-origin:0 0;` : '');
      return `<div class="slot" style="left:${it.x}mm;top:${it.y}mm;width:${it.w}mm;height:${it.h}mm">
        <div style="position:absolute;left:0;top:0;${rot}">${inner}</div>
        ${opt.cut ? '<div class="cut"></div>' : ''}
      </div>`;
    }).join('');
    return `<div class="sheet ${page.landscape ? 'L' : 'P'}" style="width:${page.w}mm;height:${page.h}mm">${slots}</div>`;
  }

  const SHEET_CSS = `
    .sheet{position:relative;overflow:hidden;background:#fff}
    .slot{position:absolute;overflow:hidden}
    .cut{position:absolute;inset:0;border:0.1mm solid #b5b5b5;pointer-events:none}`;

  function buildPrintDocument(pages, opt) {
    const paper = SheetLayout.PAPER[opt.paper];
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Preisschilder</title>
<link rel="stylesheet" href="/css/tag.css">
<style>
  @page portrait { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
  @page landscape { size: ${paper.h}mm ${paper.w}mm; margin: 0; }
  html,body{margin:0;padding:0;background:#fff}
  ${SHEET_CSS}
  .sheet{break-after:page}
  .sheet:last-child{break-after:auto}
  .sheet.P{page:portrait}
  .sheet.L{page:landscape}
</style></head><body>
${pages.map((p) => sheetHtml(p, opt)).join('\n')}
<script src="/js/price-glyphs.js"></script><script src="/js/tpl-specs.js"></script><script src="/js/templates.js"></script>
</body></html>`;
  }

  function currentLayout() {
    const opt = state.print;
    const res = SheetLayout.arrangeBest(printableItems(printTags()), { paper: opt.paper, margin: +opt.margin || 0, gap: +opt.gap || 0, rotate: opt.rotate, shrink: opt.shrink !== false, maxShrink: 0.05 });
    res.pages.forEach((pg) => { pg.scale = res.scale; });
    return res;
  }

  function renderPrintPreview() {
    const opt = state.print;
    $('#optPaper').value = opt.paper; $('#optMargin').value = opt.margin; $('#optGap').value = opt.gap;
    $('#optRotate').checked = opt.rotate; $('#optCut').checked = opt.cut; $('#optShrink').checked = opt.shrink !== false;
    const presetVal = ['0', '3', '5'].includes(String(opt.margin)) ? String(opt.margin) : 'custom';
    $('#optMarginPreset').value = presetVal;
    $('#optMargin').closest('label').hidden = presetVal !== 'custom';
    const res = currentLayout();
    const tags = printTags();
    const n = printableItems(tags).length;
    const pages = res.pages;
    $('#printSetName').textContent = '· Set ' + (printSource ? printSource.name : currentSet.name);
    $('#printSummary').innerHTML = n
      ? `<b>${n}</b> Schild${n === 1 ? '' : 'er'} auf <b>${pages.length}</b> Blatt ${esc(res.paper.label)}` +
        (res.scale < 1 ? `<div class="muted" style="margin-top:4px">Leicht verkleinert auf ${Math.round(res.scale * 100)} %, damit weniger Blätter nötig sind.</div>` : '')
      : 'Keine druckbaren Schilder. (Schilder brauchen einen Preis und eine Menge über 0.)';
    const warn = [];
    const skipped = tags.filter((t) => t.qty > 0 && (t.status === 'loading' || t.status === 'error' || !(t.data.price > 0)));
    if (skipped.length) warn.push(`${skipped.length} Schild(er) werden nicht gedruckt (Fehler, noch im Abruf oder ohne Preis).`);
    const changed = tags.filter((t) => t.qty > 0 && t.meta && t.meta.fetchedPrice != null && Math.abs((t.data.price || 0) - t.meta.fetchedPrice) > 0.004);
    if (changed.length) warn.push(`Preis weicht vom expert.de-Marktpreis ab bei: ${changed.map((t) => esc(t.data.name || t.query)).join(', ')}.`);
    if (res.tooBig.length) warn.push(`${res.tooBig.length} Schild(er) passen nicht aufs Papier – Rand verkleinern oder größeres Papier wählen.`);
    $('#printWarn').innerHTML = warn.join('<br>');
    $('#btnPdf').disabled = !pages.length;

    const prev = $('#printPreview');
    const thumbW = 300;
    prev.innerHTML = `<style>${SHEET_CSS}</style>` + pages.slice(0, 12).map((p, i) => {
      const s = thumbW / (p.w * MM);
      return `<div class="sheet-thumb" style="width:${p.w * MM * s}px;height:${p.h * MM * s}px">
        <div style="transform:scale(${s});transform-origin:0 0;width:${p.w}mm;height:${p.h}mm">${sheetHtml(p, opt)}</div>
        <span class="sheet-label">Blatt ${i + 1}${p.landscape ? ' · quer' : ''}</span></div>`;
    }).join('') + (pages.length > 12 ? `<p class="muted">… und ${pages.length - 12} weitere Blätter</p>` : '');
    PT.fitAll(prev);
  }

  function openPrint(source) {
    printSource = source || null;
    renderPrintPreview();
    if (!$('#printDialog').open) $('#printDialog').showModal();
  }
  $('#printDialog').addEventListener('close', () => { printSource = null; });
  $('#btnPrint').addEventListener('click', () => openPrint(null));
  $('#btnPrintSet').addEventListener('click', () => openPrint(null));
  ['optPaper', 'optMarginPreset', 'optMargin', 'optGap', 'optRotate', 'optCut', 'optShrink'].forEach((id) => $('#' + id).addEventListener('change', () => {
    if (id === 'optMarginPreset' && $('#optMarginPreset').value !== 'custom') $('#optMargin').value = $('#optMarginPreset').value;
    state.print = {
      paper: $('#optPaper').value,
      margin: Math.max(0, parseFloat($('#optMargin').value) || 0),
      gap: Math.max(0, parseFloat($('#optGap').value) || 0),
      rotate: $('#optRotate').checked,
      cut: $('#optCut').checked,
      shrink: $('#optShrink').checked,
    };
    save(); savePrintSettings(); renderPrintPreview();
  }));

  // Druckeinstellungen gelten für alle Nutzer (auf dem Server gespeichert)
  let printSettingsTimer = null;
  function savePrintSettings() {
    clearTimeout(printSettingsTimer);
    printSettingsTimer = setTimeout(() => {
      fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ print: state.print }) }).catch(() => {});
    }, 300);
  }
  api('/api/settings').then((st) => {
    if (st && st.print) state.print = { ...state.print, ...st.print };
  }).catch(() => {});

  $('#btnPdf').addEventListener('click', async () => {
    const btn = $('#btnPdf');
    const res = currentLayout();
    if (!res.pages.length) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> PDF wird erstellt…';
    try {
      const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        html: buildPrintDocument(res.pages, state.print),
        printed: printedList(printTags()),
        set: printSource ? { name: printSource.name, id: printSource.id } : { name: currentSet.name, id: currentSet.id },
      }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || 'PDF-Erstellung fehlgeschlagen');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `preisschilder-${(printSource ? printSource.name : currentSet.name).replace(/ Uhr$/, '').replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast('PDF heruntergeladen.', 'ok');
      loadWatch();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'PDF herunterladen';
    }
  });

  // ---------------------------------------------------------------- Barcode scannen
  // Ein gescannter Code landet sofort im aktuellen Set. Gleicher Artikel nochmal -> Menge +1.
  function addScannedCode(code) {
    code = String(code).trim();
    if (!code) return;
    const existing = state.tags.find((t) => t.query === code || (t.meta && (t.meta.ean === code || t.meta.webcode === code)));
    if (existing) {
      existing.qty = Math.min(999, (existing.qty || 0) + 1);
      save(); renderList();
      toast(`${existing.data.name || code}: Menge jetzt ${existing.qty}`, 'ok');
      return existing;
    }
    const t = newTag(code, 1);
    state.tags.push(t);
    state.selectedId = t.id;
    selectedField = null;
    enqueueFetch(t);
    save(); renderAll();
    toast(`Gescannt: ${code}`, 'ok');
    return t;
  }

  // USB-/Bluetooth-Scanner: tippen sehr schnell und drücken danach Enter
  let scanBuf = '';
  let scanTimes = [];
  document.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    const inCodes = el && el.id === 'inputCodes';
    const inOther = el && !inCodes && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
    if (inOther || e.ctrlKey || e.metaKey || e.altKey) { scanBuf = ''; scanTimes = []; return; }
    const now = performance.now();
    if (e.key === 'Enter') {
      const fast = scanTimes.length >= 7 && (scanTimes[scanTimes.length - 1] - scanTimes[0]) / (scanTimes.length - 1) < 35;
      const code = scanBuf;
      scanBuf = ''; scanTimes = [];
      if (fast && /^[0-9A-Za-z-]{6,20}$/.test(code)) {
        e.preventDefault();
        if (inCodes) { // gescannte Zeichen wieder aus dem Eingabefeld nehmen
          const v = el.value;
          if (v.endsWith(code)) el.value = v.slice(0, -code.length);
        }
        addScannedCode(code);
      }
      return;
    }
    if (e.key.length === 1) {
      if (scanTimes.length && now - scanTimes[scanTimes.length - 1] > 80) { scanBuf = ''; scanTimes = []; }
      scanBuf += e.key;
      scanTimes.push(now);
    }
  }, true);

  // Kamera
  let detector = null;
  let camStream = null;
  let camLoop = null;
  const recentScans = new Map();

  async function getDetector() {
    if (detector) return detector;
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        if (supported.includes('ean_13')) { detector = new window.BarcodeDetector({ formats: formats.filter((f) => supported.includes(f)) }); return detector; }
      } catch (_) { /* Ersatz nehmen */ }
    }
    const lib = window.BarcodeDetectionAPI;
    lib.setZXingModuleOverrides({ locateFile: (p, prefix) => (p.endsWith('.wasm') ? '/vendor/zxing_reader.wasm' : prefix + p) });
    detector = new lib.BarcodeDetector({ formats });
    return detector;
  }

  async function openCamera() {
    const dlg = $('#camDialog');
    $('#camHint').textContent = '';
    $('#camList').innerHTML = '';
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#camHint').innerHTML = 'Die Kamera funktioniert nur über eine sichere Verbindung (<b>https://</b>) oder direkt auf dem Server (localhost). Sobald die Seite über Cloudflare mit HTTPS läuft, geht es auch am Handy. Ein USB-Scanner funktioniert jederzeit.';
      dlg.showModal();
      return;
    }
    dlg.showModal();
    $('#camHint').textContent = 'Kamera wird gestartet …';
    try {
      const det = await getDetector();
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const v = $('#camVideo');
      v.srcObject = camStream;
      await v.play();
      $('#camHint').textContent = 'Barcode in den Rahmen halten …';
      const tick = async () => {
        if (!camStream) return;
        try {
          const found = await det.detect(v);
          for (const f of found) {
            const code = String(f.rawValue || '').trim();
            if (!code) continue;
            const last = recentScans.get(code) || 0;
            if (Date.now() - last < 2500) continue; // gleichen Code nicht doppelt zählen
            recentScans.set(code, Date.now());
            if (navigator.vibrate) navigator.vibrate(80);
            const t = addScannedCode(code);
            const li = document.createElement('li');
            li.textContent = `${code}${t && t.qty > 1 ? ' (Menge ' + t.qty + ')' : ''}`;
            $('#camList').prepend(li);
          }
        } catch (_) { /* nächstes Bild */ }
        camLoop = setTimeout(tick, 180);
      };
      tick();
    } catch (e) {
      $('#camHint').textContent = 'Kamera konnte nicht gestartet werden: ' + (e && e.message ? e.message : e);
      stopCamera();
    }
  }

  function stopCamera() {
    clearTimeout(camLoop);
    if (camStream) camStream.getTracks().forEach((tr) => tr.stop());
    camStream = null;
    const v = $('#camVideo');
    if (v) v.srcObject = null;
  }

  $('#btnScan').addEventListener('click', openCamera);
  $('#camDialog').addEventListener('close', stopCamera);

  // ---------------------------------------------------------------- Vorlagen-Auswahl
  let tplMode = 'default';

  function renderTplChip() {
    const T = PT.Templates[state.template] || PT.Templates[DEFAULT_TEMPLATE];
    $('#tplChipName').textContent = T.name;
    PT.renderThumb($('#tplChipThumb'), T.id, 34, 46);
  }

  function openTplPicker(mode) {
    tplMode = mode;
    const t = selected();
    const current = mode === 'default' ? state.template : t && t.template;
    $('#tplTitle').textContent = mode === 'change' ? 'Vorlage wechseln' : mode === 'add' ? 'Weitere Vorlage für diesen Artikel' : 'Vorlage für neue Schilder';
    $('#tplHint').textContent = mode === 'change'
      ? 'Das ausgewählte Schild bekommt die neue Vorlage. Die Daten bleiben, verschobene Felder werden zurückgesetzt.'
      : mode === 'add'
        ? 'Der Artikel wird zusätzlich als eigenes Schild in der gewählten Vorlage angelegt – z. B. für eine andere Größe.'
        : 'Diese Vorlage bekommen alle Artikel, die du ab jetzt abrufst. Bei einzelnen Schildern kannst du sie später noch wechseln.';
    // nach Format gruppiert (A4 hoch … A7 quer, Weitere), innerhalb der Gruppe in Definitionsreihenfolge
    const all = Object.values(PT.Templates);
    const groups = (PT.GROUP_ORDER || []).concat([...new Set(all.map((T) => T.group || 'Weitere'))]).filter((g, i, a) => a.indexOf(g) === i);
    const list = [];
    for (const g of groups) {
      const items = all.filter((T) => (T.group || 'Weitere') === g);
      if (items.length) list.push({ heading: g }, ...items);
    }
    $('#tplGrid').innerHTML = list.map((T) => T.heading ? `<li class="tpl-group">${esc(T.heading)}</li>` : `
      <li><button type="button" class="tpl-card ${T.id === current ? 'current' : ''}" data-tpl="${esc(T.id)}">
        <div class="tpl-card-thumb"></div>
        <div class="tpl-card-name">${esc(T.name)} ${T.id === current ? '<span class="pill pill-orange">aktuell</span>' : ''}</div>
        <div class="tpl-card-meta">${esc(T.format)} · ${T.width} × ${T.height} mm</div>
        ${T.description ? `<div class="tpl-card-desc">${esc(T.description)}</div>` : ''}
      </button></li>`).join('');
    // Vorschau: beim Wechseln/Hinzufügen mit den Daten des Artikels, sonst mit Beispieldaten
    const data = mode === 'default' || !t ? null : t.data;
    document.querySelectorAll('#tplGrid .tpl-card').forEach((card) => PT.renderThumb(card.querySelector('.tpl-card-thumb'), card.dataset.tpl, 170, 230, data));
    $('#tplDialog').showModal();
  }

  $('#btnPickTemplate').addEventListener('click', () => openTplPicker('default'));
  $('#tplGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-tpl]');
    if (!card) return;
    const id = card.dataset.tpl;
    const T = PT.Templates[id];
    const t = selected();
    if (tplMode === 'default') {
      state.template = id;
      renderTplChip();
      save();
    } else if (tplMode === 'change' && t) {
      if (t.template !== id) {
        t.template = id;
        t.layout = {};
        selectedField = null;
        save(); renderAll();
        toast(`Vorlage gewechselt zu „${T.name}“.`, 'ok');
      }
    } else if (tplMode === 'add' && t) {
      const c = JSON.parse(JSON.stringify(t));
      c.id = uid();
      c.template = id;
      c.layout = {};
      c.qty = 1;
      state.tags.splice(state.tags.indexOf(t) + 1, 0, c);
      state.selectedId = c.id;
      selectedField = null;
      save(); renderAll();
      toast(`„${c.data.name || c.query}“ zusätzlich als „${T.name}“ angelegt.`, 'ok');
    }
    $('#tplDialog').close();
  });

  // ---------------------------------------------------------------- Preise aktualisieren
  // Holt nur Preis, UVP (wenn nicht von Hand) und Bestand neu – eigene Änderungen an Name,
  // Eigenschaften usw. bleiben erhalten. Jede Änderung wird am Schild markiert.
  const fmtEur = (v) => (v > 0 ? v.toFixed(2).replace('.', ',') + ' €' : 'keine');

  async function checkPriceOf(id) {
    const t0 = getTag(id);
    if (!t0 || !t0.query) return 'skip';
    let r;
    try {
      r = await api('/api/lookup?q=' + encodeURIComponent(t0.query));
    } catch (e) {
      const t = getTag(id);
      if (t) { t.meta.priceCheck = { at: new Date().toISOString(), error: e.message }; save('auto'); }
      return 'error';
    }
    const t = getTag(id);
    if (!t) return 'skip';
    const changes = [];
    const oldPrice = t.data.price;
    if (!(Math.abs((oldPrice || 0) - r.price) < 0.005)) {
      changes.push({ what: 'Preis', from: oldPrice, to: r.price });
      t.data.price = r.price;
    }
    const u = t.meta.uvp || {};
    const newUvp = r.expertUvp || null;
    if (!u.manual && !(Math.abs((t.data.uvp || 0) - (newUvp || 0)) < 0.005)) {
      changes.push({ what: 'UVP', from: t.data.uvp, to: newUvp });
      t.data.uvp = newUvp;
      t.meta.uvp = { status: newUvp ? 'expert' : 'none' };
    }
    Object.assign(t.meta, {
      fetchedAt: r.fetchedAt, fetchedPrice: r.price,
      storeStock: r.priceInfo && r.priceInfo.storeStock, shownOnPage: r.priceInfo && r.priceInfo.shownOnPage,
      priceCheck: { at: new Date().toISOString(), changes },
    });
    t.warnings = r.warnings || [];
    if (t.status === 'error') { t.status = 'ok'; t.error = null; }
    save('auto');
    return changes.length ? 'changed' : 'same';
  }

  let checkingPrices = false;
  async function refreshPrices() {
    if (checkingPrices) return;
    const ids = state.tags.filter((t) => t.query && t.status !== 'loading').map((t) => t.id);
    if (!ids.length) { toast('In diesem Set gibt es keine Schilder, die von expert.de stammen.'); return; }
    checkingPrices = true;
    const btn = $('#btnCheckPrices');
    const label = btn.innerHTML;
    btn.disabled = true;
    const count = { changed: 0, same: 0, error: 0, skip: 0 };
    for (let i = 0; i < ids.length; i++) {
      btn.innerHTML = `<span class="spinner"></span> Prüfe ${i + 1} / ${ids.length} …`;
      count[await checkPriceOf(ids[i])]++;
      renderList();
      if (state.selectedId === ids[i]) { renderStage(); renderEditor(); }
    }
    btn.disabled = false;
    btn.innerHTML = label;
    checkingPrices = false;
    renderAll();
    const parts = [`${count.changed} geändert`, `${count.same} unverändert`];
    if (count.error) parts.push(`${count.error} nicht abrufbar`);
    toast('Preise geprüft: ' + parts.join(', ') + '.', count.changed || count.error ? 'err' : 'ok');
  }

  function priceChangeText(t) {
    const pc = t.meta && t.meta.priceCheck;
    if (!pc || pc.ack) return '';
    if (pc.error) return `Preisprüfung fehlgeschlagen: ${pc.error}`;
    if (!pc.changes || !pc.changes.length) return '';
    return pc.changes.map((c) => `${c.what} geändert: ${fmtEur(c.from)} → ${fmtEur(c.to)}`).join(' · ');
  }

  $('#btnCheckPrices').addEventListener('click', refreshPrices);

  // ---------------------------------------------------------------- Drucker-Testseite
  // A4 mit 10-cm-Quadrat, Linealen und Randlinien (1–10 mm vom Blattrand) zum Nachmessen.
  function buildTestPage() {
    const W = 210, H = 297;
    const parts = [];
    const line = (x1, y1, x2, y2, w = 0.2, c = '#000') => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`);
    const text = (x, y, t, size = 3, anchor = 'start', weight = 400, c = '#000') => parts.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${c}" font-family="Arial, sans-serif">${t}</text>`);
    const DIST = [0, 1, 2, 3, 4, 5, 6, 8, 10];
    // Randlinien an allen vier Seiten als Treppe: jede Linie hat ihren eigenen Abschnitt und eine Beschriftung
    DIST.forEach((d, i) => {
      const c = d === 0 ? '#e00' : '#000';
      const lbl = d === 0 ? 'Rand' : d + ' mm';
      const y0 = 105 + i * 8, x0 = 62 + i * 10;
      line(d, y0, d, y0 + 6, 0.3, c); text(d + 1.2, y0 + 4, lbl, 2.2, 'start', 400, c);               // links
      line(W - d, y0, W - d, y0 + 6, 0.3, c); text(W - d - 1.2, y0 + 4, lbl, 2.2, 'end', 400, c);       // rechts
      line(x0, d, x0 + 8, d, 0.3, c); text(x0 + 4, d + 3.2, lbl, 2, 'middle', 400, c);                  // oben
      line(x0, H - d, x0 + 8, H - d, 0.3, c); text(x0 + 4, H - d - 1.2, lbl, 2, 'middle', 400, c);      // unten
    });
    // Lineal oben (20–190 mm) mit mm-Strichen
    for (let x = 20; x <= 190; x++) {
      const len = x % 10 === 0 ? 5 : x % 5 === 0 ? 3.5 : 2;
      line(x, 22, x, 22 + len, 0.18);
      if (x % 10 === 0) text(x, 31, String(x / 10), 2.6, 'middle');
    }
    text(105, 35.5, 'Zentimeter ab linkem Blattrand', 2.6, 'middle', 400, '#555');
    // Lineal links (180–270 mm, unterhalb der Randlinien)
    for (let y = 180; y <= 270; y++) {
      const len = y % 10 === 0 ? 5 : y % 5 === 0 ? 3.5 : 2;
      line(14, y, 14 + len, y, 0.18);
      if (y % 10 === 0) text(21, y + 0.9, String(y / 10), 2.6, 'start');
    }
    // 10-cm-Quadrat
    parts.push('<rect x="55" y="140" width="100" height="100" fill="none" stroke="#000" stroke-width="0.35"/>');
    line(55, 190, 155, 190, 0.15, '#999'); line(105, 140, 105, 240, 0.15, '#999');
    text(105, 187, 'Dieses Quadrat muss genau', 3.6, 'middle', 700);
    text(105, 195.5, '10 cm × 10 cm groß sein', 3.6, 'middle', 700);
    // Anleitung
    text(105, 50, 'Drucker-Testseite – Schildgenerator', 6, 'middle', 700);
    const lines = [
      '1. Dieses PDF mit „Tatsächliche Größe“ bzw. „100 %“ drucken – nicht „An Seite anpassen“.',
      '2. Das Quadrat unten nachmessen. Ist es kleiner als 10 cm, verkleinert der Drucker:',
      '    im Druckdialog „Tatsächliche Größe“ / „Skalierung 100 %“ wählen.',
      '3. An den vier Blatträndern (Mitte) sind Linien 1 bis 10 mm vom Rand entfernt.',
      '    Die äußerste noch vollständig gedruckte Linie zeigt, wie nah der Drucker an den Rand kommt.',
      '    Diesen Wert (oder etwas mehr) im Druckdialog unter „Rand zum Blattrand“ einstellen.',
      '    Die rote Linie liegt genau auf der Blattkante und wird meist nicht gedruckt.',
    ];
    lines.forEach((l, i) => text(32, 62 + i * 6.2, l.replace(/ /g, ' '), 3.3));
    text(105, 285, 'Erstellt ' + new Date().toLocaleString('de-DE'), 2.6, 'middle', 400, '#777');
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Drucker-Testseite</title>
<style>@page { size: ${W}mm ${H}mm; margin: 0; } html,body{margin:0;padding:0;background:#fff}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" style="display:block">${parts.join('')}</svg>
</body></html>`;
  }

  $('#btnTestPage').addEventListener('click', async () => {
    const btn = $('#btnTestPage');
    btn.disabled = true;
    try {
      const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: buildTestPage() }) });
      if (!r.ok) throw new Error('Testseite konnte nicht erstellt werden.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = 'drucker-testseite.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
  });

  // ---------------------------------------------------------------- Preis-Wächter
  // Liste der gedruckten Schilder für den Server (nur Schilder aus expert.de mit Menge > 0)
  function printedList(tags) {
    return tags.filter((t) => t.query && t.qty > 0 && t.status !== 'loading' && t.status !== 'error' && t.data.price > 0).map((t) => ({
      query: t.query, webcode: (t.meta && t.meta.webcode) || t.data.artnr || null,
      name: t.data.name, group: t.data.group, template: t.template, qty: t.qty,
      price: t.data.price, uvp: t.data.uvp,
      expertPrice: t.meta ? t.meta.fetchedPrice : null,
      expertUvp: t.meta && t.meta.uvp && t.meta.uvp.status === 'expert' ? t.data.uvp : null,
      uvpManual: Boolean(t.meta && t.meta.uvp && t.meta.uvp.manual),
    }));
  }

  let watchData = null;
  let watchPoll = null;
  const fmtDay = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

  async function loadWatch() {
    try {
      watchData = await api('/api/watch');
      const n = watchData.changedCount + watchData.unreachableCount;
      const badge = $('#watchBadge');
      badge.textContent = n;
      badge.hidden = n === 0;
      $('#btnWatch').classList.toggle('alert', n > 0);
      $('#btnWatch').title = n ? `${watchData.changedCount} Schild(er) mit geändertem Preis, ${watchData.unreachableCount} nicht mehr abrufbar` : 'Preis-Wächter: alle gedruckten Schilder sind aktuell';
      if ($('#watchDialog').open) renderWatch();
    } catch (_) { /* egal */ }
  }

  function watchLine(it) {
    const c = it.check;
    const tplNames = (it.templates || []).map((id) => (PT.Templates[id] ? PT.Templates[id].short || PT.Templates[id].name : id)).join(', ');
    let state = '<span class="muted">noch nicht geprüft</span>';
    if (it.unreachable) state = `<span class="w-bad">Nicht mehr abrufbar: ${esc(c.error)}</span>`;
    else if (it.changed) {
      const parts = [];
      if (c.price != null && Math.abs(c.price - it.expertPrice) >= 0.005) parts.push(`Preis ${fmtEur(it.expertPrice)} → <b>${fmtEur(c.price)}</b>`);
      if (!it.uvpManual && Math.abs((c.uvp || 0) - (it.expertUvp || 0)) >= 0.005) parts.push(`UVP ${fmtEur(it.expertUvp)} → <b>${fmtEur(c.uvp)}</b>`);
      state = `<span class="w-bad">${parts.join(' · ')}</span>`;
    } else if (c) state = `<span class="w-ok">✓ aktuell (${fmtEur(c.price)})</span>`;
    return `
      <li class="w-row ${it.changed || it.unreachable ? 'bad' : ''}" data-key="${esc(it.key)}">
        <div class="w-main">
          <div class="w-name">${esc(it.name || it.query)} <span class="muted">${esc(it.group || '')}</span></div>
          <div class="w-state">${state}${it.manualPrice ? ' <span class="pill" title="Beim Drucken war ein eigener Preis eingetragen">eigener Preis ' + esc(fmtEur(it.printedPrice)) + '</span>' : ''}</div>
          <div class="w-meta">Gedruckt ${esc(fmtDay(it.printedAt))} · ${it.qty}× ${esc(tplNames)}${it.setName ? ' · Set ' + esc(it.setName) : ''}</div>
        </div>
        <div class="w-actions">
          <button class="btn btn-sm ${it.changed || it.unreachable ? 'btn-primary' : ''}" type="button" data-w="reprint">Nachdrucken</button>
          <button class="btn btn-sm" type="button" data-w="remove" title="Schild hängt nicht mehr im Laden – aus der Überwachung nehmen">Entfernen</button>
        </div>
      </li>`;
  }

  function renderWatch() {
    const d = watchData;
    if (!d) return;
    const bad = d.items.filter((x) => x.changed || x.unreachable);
    const run = d.running;
    $('#watchSummary').innerHTML = `
      <div><b>${d.total}</b> gedruckte Schilder werden überwacht · zuletzt geprüft: ${esc(fmtDay(d.lastRun))}</div>
      <div class="muted">Automatische Prüfung täglich ab ${d.runHour} Uhr. Einträge bleiben ${d.keepDays} Tage gespeichert und werden beim Nachdrucken erneuert.</div>`;
    $('#btnWatchRun').disabled = Boolean(run) || !d.total;
    $('#btnWatchRun').innerHTML = run ? `<span class="spinner"></span> Prüfe ${run.done} / ${run.total} …` : '↻ Jetzt prüfen';
    $('#btnWatchReprintAll').disabled = !bad.length;
    $('#btnWatchReprintAll').textContent = bad.length ? `Alle ${bad.length} betroffenen nachdrucken` : 'Nichts nachzudrucken';
    $('#watchList').innerHTML = d.items.length ? d.items.map(watchLine).join('') : '<li class="set-empty">Noch keine gedruckten Schilder. Sobald du ein PDF erstellst, werden die Schilder hier überwacht.</li>';
    clearTimeout(watchPoll);
    if (run && $('#watchDialog').open) watchPoll = setTimeout(loadWatch, 2000);
  }

  async function reprint(items) {
    if (!items.length) return;
    await newSet();
    let first = null;
    for (const it of items) {
      for (const tplId of (it.templates && it.templates.length ? it.templates : [state.template])) {
        const t = newTag(it.query, it.qty || 1);
        if (PT.Templates[tplId]) t.template = tplId;
        state.tags.push(t);
        if (!first) first = t;
        enqueueFetch(t);
      }
    }
    state.selectedId = first ? first.id : null;
    save(); renderAll();
    $('#watchDialog').close();
    toast(`Neues Set mit ${items.length} Artikel(n) zum Nachdrucken angelegt – aktuelle Preise werden geladen.`, 'ok');
  }

  $('#btnWatch').addEventListener('click', async () => {
    $('#watchDialog').showModal();
    await loadWatch();
    renderWatch();
  });
  $('#btnWatchRun').addEventListener('click', async () => {
    await api('/api/watch/run', { method: 'POST' });
    await new Promise((r) => setTimeout(r, 300));
    loadWatch();
  });
  $('#btnWatchReprintAll').addEventListener('click', () => {
    reprint(watchData.items.filter((x) => x.changed || x.unreachable));
  });
  $('#watchList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const key = b.closest('.w-row').dataset.key;
    const it = watchData.items.find((x) => x.key === key);
    if (b.dataset.w === 'reprint') reprint([it]);
    else if (b.dataset.w === 'remove') {
      if (!confirm(`„${it.name || it.query}“ aus der Überwachung nehmen? (z. B. weil das Schild nicht mehr hängt)`)) return;
      await api('/api/watch/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: [key] }) });
      loadWatch();
    }
  });
  loadWatch();
  setInterval(loadWatch, 60000);

  // ---------------------------------------------------------------- Sets
  function renderSetBar() {
    const pieces = state.tags.reduce((n, t) => n + (Number(t.qty) || 0), 0);
    $('#setName').textContent = currentSet.name;
    $('#setMeta').textContent = state.tags.length
      ? `${state.tags.length} Schild${state.tags.length === 1 ? '' : 'er'} · ${pieces} Stück zum Drucken`
      : 'Noch leer – wird gespeichert, sobald ein Schild drin ist';
    $('#btnPrintSet').disabled = printableItems(state.tags).length === 0;
  }

  const fmtDate = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function renderSetList() {
    const ul = $('#setList');
    ul.innerHTML = '<li class="set-empty"><span class="spinner"></span></li>';
    let list = [];
    try { list = await api('/api/sets'); } catch (e) { ul.innerHTML = `<li class="set-empty">${esc(e.message)}</li>`; return; }
    if (!list.length) { ul.innerHTML = '<li class="set-empty">Noch keine gespeicherten Sets.</li>'; return; }
    ul.innerHTML = list.map((x) => `
      <li class="set-row ${x.id === currentSet.id ? 'current' : ''}" data-id="${esc(x.id)}">
        <div class="set-row-name">${esc(x.name)} ${x.id === currentSet.id ? '<span class="pill pill-orange">aktuell</span>' : ''}</div>
        <div class="set-row-meta">${x.tagCount} Schild${x.tagCount === 1 ? '' : 'er'} · ${x.pieceCount} Stück${x.preview.length ? ' · ' + esc(x.preview.join(', ')) + (x.tagCount > 3 ? ' …' : '') : ''}${x.deleteAt ? ' · wird gelöscht am ' + fmtDate(x.deleteAt) : ''}</div>
        <div class="set-row-actions">
          ${x.id === currentSet.id ? '' : '<button class="btn btn-sm" type="button" data-set="open">Öffnen</button>'}
          <button class="btn btn-sm btn-primary" type="button" data-set="print">Drucken</button>
          <button class="btn btn-sm" type="button" data-set="del" title="Set löschen">Löschen</button>
        </div>
      </li>`).join('');
  }

  async function openSet(id) {
    await saveSetNow();
    const set = await api('/api/sets/' + encodeURIComponent(id));
    markInterrupted(set.tags || []);
    currentSet = { id: set.id, name: set.name, createdAt: set.createdAt, version: set.version || 0, deleted: set.deleted || {} };
    state.tags = set.tags || [];
    state.selectedId = state.tags[0] ? state.tags[0].id : null;
    selectedField = null;
    rememberSynced();
    resetHistory();
    renderAll();
    announceCurrent();
  }

  async function newSet() {
    await saveSetNow();
    currentSet = makeSet();
    state.tags = [];
    state.selectedId = null;
    selectedField = null;
    rememberSynced();
    resetHistory();
    renderAll();
    announceCurrent();
    toast('Neues Set begonnen: ' + currentSet.name, 'ok');
  }

  $('#btnNewSet').addEventListener('click', newSet);
  $('#btnSets').addEventListener('click', async () => {
    await saveSetNow();
    $('#setsDialog').showModal();
    renderSetList();
  });
  $('#setList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const id = b.closest('.set-row').dataset.id;
    const act = b.dataset.set;
    try {
      if (act === 'open') {
        await openSet(id);
        $('#setsDialog').close();
      } else if (act === 'print') {
        if (id === currentSet.id) { $('#setsDialog').close(); openPrint(null); return; }
        const set = await api('/api/sets/' + encodeURIComponent(id));
        $('#setsDialog').close();
        openPrint({ name: set.name, id: set.id, tags: set.tags || [] });
      } else if (act === 'del') {
        const name = b.closest('.set-row').querySelector('.set-row-name').firstChild.textContent.trim();
        if (!confirm(`Set „${name}“ endgültig löschen?`)) return;
        await api('/api/sets/' + encodeURIComponent(id), { method: 'DELETE' });
        if (id === currentSet.id) { currentSet = makeSet(); state.tags = []; state.selectedId = null; rememberSynced(); resetHistory(); renderAll(); announceCurrent(); }
        renderSetList();
      }
    } catch (err) { toast(err.message, 'err'); }
  });

  // ---------------------------------------------------------------- Logo-Bibliothek
  async function renderLogoLib() {
    const list = await api('/api/logos').catch(() => []);
    $('#logoGrid').innerHTML = list.length ? list.map((l) => `
      <li><div class="lg-img"><img src="${esc(l.url)}" alt=""></div>
      <div class="lg-foot"><b>${esc(l.brand)}</b><button class="link danger" type="button" data-del="${esc(l.brand)}">Löschen</button></div></li>`).join('')
      : '<li class="muted" style="grid-column:1/-1;border:0">Noch keine Logos. Marke eintragen und PNG wählen.</li>';
  }
  $('#btnLogos').addEventListener('click', () => { renderLogoLib(); $('#logoDialog').showModal(); });
  $('#logoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'image/png') { toast('Bitte nur PNG-Dateien verwenden.', 'err'); return; }
    const brand = $('#logoBrand').value.trim();
    if (!brand) { toast('Bitte zuerst die Marke eintragen.', 'err'); return; }
    try {
      const r = await uploadLogo(brand, await readFile(f));
      state.tags.forEach((x) => { if (x.meta && x.meta.logoBrand === r.brand) { x.data.logoUrl = r.url; x.data.logoData = ''; } });
      save(); renderStage(); renderEditor(); renderLogoLib();
      $('#logoBrand').value = '';
      toast('Logo gespeichert.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#logoGrid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm(`Logo „${b.dataset.del}“ löschen?`)) return;
    await api('/api/logos/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
    state.tags.forEach((x) => { if (x.data.logoUrl && x.data.logoUrl.startsWith('/logos/' + b.dataset.del + '.png')) x.data.logoUrl = x.meta.expertLogoUrl || ''; });
    save(); renderStage(); renderEditor(); renderLogoLib();
  });

  // ---------------------------------------------------------------- Statusanzeige
  const CIRC = 2 * Math.PI * 15.5;
  // Binäre Einheiten wie in Proxmox (MiB, GiB)
  const fmtBytes = (b) => {
    if (!(b >= 0)) return '–';
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i === 0 ? 0 : 2).replace('.', ',') + ' ' + u[i];
  };
  function setGauge(k, percent, title) {
    const g = $(`#sysmon .gauge[data-k="${k}"]`);
    if (!g) return;
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    g.querySelector('.g-bar').style.strokeDasharray = `${(p / 100) * CIRC} ${CIRC}`;
    g.querySelector('b').textContent = percent == null ? '–' : p + '%';
    g.classList.toggle('warn', p >= 75 && p < 90);
    g.classList.toggle('crit', p >= 90);
    g.title = title;
  }
  async function pollSystem() {
    if (document.hidden) return;
    try {
      const s = await api('/api/system');
      setGauge('cpu', s.cpu.percent, `CPU: ${s.cpu.percent} % (${String(s.cpu.cores).replace('.', ',')} Kerne)`);
      setGauge('ram', s.ram.percent, `Arbeitsspeicher: ${fmtBytes(s.ram.used)} von ${fmtBytes(s.ram.total)} belegt (${(s.ram.used / s.ram.total * 100).toFixed(2).replace('.', ',')} %)`);
      if (s.disk) setGauge('disk', s.disk.percent, `Speicherplatz: ${fmtBytes(s.disk.used)} von ${fmtBytes(s.disk.total)} belegt (${(s.disk.used / s.disk.total * 100).toFixed(2).replace('.', ',')} %)`);
    } catch (_) { /* Server kurz nicht erreichbar */ }
  }
  pollSystem();
  setInterval(pollSystem, 3000);
  document.addEventListener('visibilitychange', pollSystem);

  // ---------------------------------------------------------------- Dunkelmodus

  // ---------------------------------------------------------------- Konto & Benutzer
  let me = null;
  async function loadMe() {
    try { me = await api('/api/me', { cache: 'no-store' }); } catch (_) { return; }
    $('#userName').textContent = me.name;
  }
  const jsonPost = (url, body, method = 'POST') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  async function renderUsers() {
    if (!me || !me.admin) return;
    const users = await api('/api/users', { cache: 'no-store' });
    $('#userList').innerHTML = users.map((u) => `
      <li class="user-row" data-user="${esc(u.name)}">
        <div class="user-row-name"><b>${esc(u.name)}</b>${u.admin ? ' <span class="pill pill-orange">Administrator</span>' : ''}${u.name.toLowerCase() === me.name.toLowerCase() ? ' <span class="muted">(du)</span>' : ''}</div>
        <div class="user-row-actions">
          <button type="button" class="link" data-act="pw">Passwort setzen</button>
          ${u.name.toLowerCase() === me.name.toLowerCase() ? '' : `<button type="button" class="link" data-act="admin">${u.admin ? 'Admin-Recht entziehen' : 'Zum Admin machen'}</button>
          <button type="button" class="link danger" data-act="del">Löschen</button>`}
        </div>
      </li>`).join('');
  }

  $('#btnUser').addEventListener('click', async () => {
    await loadMe();
    if (!me) return;
    $('#userMe').textContent = me.name;
    $('#userMeAdmin').hidden = !me.admin;
    $('#userAdmin').hidden = !me.admin;
    ['#pwCurrent', '#pwNew', '#pwNew2', '#nuName', '#nuPw'].forEach((id) => { $(id).value = ''; });
    $('#nuAdmin').checked = false;
    $('#userDialog').showModal();
    try { await renderUsers(); } catch (e) { toast(e.message, 'err'); }
  });

  $('#btnLogout').addEventListener('click', async () => {
    try { await jsonPost('/api/logout'); } catch (_) { /* egal */ }
    location.href = '/login';
  });

  $('#btnPwChange').addEventListener('click', async () => {
    if ($('#pwNew').value !== $('#pwNew2').value) return toast('Die beiden neuen Passwörter sind nicht gleich.', 'err');
    try {
      await jsonPost('/api/password', { current: $('#pwCurrent').value, password: $('#pwNew').value });
      ['#pwCurrent', '#pwNew', '#pwNew2'].forEach((id) => { $(id).value = ''; });
      toast('Passwort geändert.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#btnUserAdd').addEventListener('click', async () => {
    try {
      await jsonPost('/api/users', { name: $('#nuName').value, password: $('#nuPw').value, admin: $('#nuAdmin').checked });
      toast(`Benutzer „${$('#nuName').value.trim()}“ angelegt.`, 'ok');
      $('#nuName').value = ''; $('#nuPw').value = ''; $('#nuAdmin').checked = false;
      await renderUsers();
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#userList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const name = btn.closest('[data-user]').dataset.user;
    const url = '/api/users/' + encodeURIComponent(name);
    try {
      if (btn.dataset.act === 'pw') {
        const pw = prompt(`Neues Passwort für „${name}“ (mind. 8 Zeichen):`);
        if (!pw) return;
        await jsonPost(url + '/password', { password: pw });
        toast(`Passwort von „${name}“ gesetzt. ${name.toLowerCase() === me.name.toLowerCase() ? '' : 'Der Benutzer ist auf allen Geräten abgemeldet.'}`, 'ok');
        if (name.toLowerCase() === me.name.toLowerCase()) location.href = '/login';
      } else if (btn.dataset.act === 'admin') {
        const isAdmin = !!btn.closest('[data-user]').querySelector('.pill');
        await jsonPost(url + '/admin', { admin: !isAdmin });
      } else if (btn.dataset.act === 'del') {
        if (!confirm(`Benutzer „${name}“ wirklich löschen?`)) return;
        await api(url, { method: 'DELETE' });
        toast(`Benutzer „${name}“ gelöscht.`, 'ok');
      }
      await renderUsers();
    } catch (err) { toast(err.message, 'err'); }
  });
  loadMe();

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('schildgenerator.theme', t); } catch (_) { /* egal */ }
    $('#btnTheme').title = t === 'dark' ? 'Hellen Modus einschalten' : 'Dunkelmodus einschalten';
  }
  $('#btnTheme').addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  $('#btnTheme').title = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Hellen Modus einschalten' : 'Dunkelmodus einschalten';

  // ---------------------------------------------------------------- Start
  function renderAll() { renderList(); renderStage(); renderEditor(); renderSetBar(); }

  if (!PT.Templates[state.template]) state.template = DEFAULT_TEMPLATE;
  renderTplChip();


  if (legacyTags.length) {
    markInterrupted(legacyTags);
    const old = makeSet();
    old.name = old.name.replace(' Uhr', ' Uhr (übernommen)');
    fetch('/api/sets/' + old.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: old.id, name: old.name, createdAt: old.createdAt, baseVersion: 0, deleted: {}, tags: legacyTags }) })
      .then((r) => { if (r.ok) toast('Deine bisherigen Schilder liegen jetzt im Set „' + old.name + '“ (unter „Alle Sets“).', 'ok'); })
      .catch(() => {});
    legacyTags = [];
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ print: state.print, template: state.template })); } catch (_) { /* egal */ }
  }
  if (!state.selectedId && state.tags[0]) state.selectedId = state.tags[0].id;
  resetHistory();
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  document.fonts.ready.then(renderAll);
  renderAll();

  // Aktuelles Set des Kontos holen – gibt es keins, beginnt hier ein neues
  (async () => {
    try {
      const cur = await api('/api/sets/current', { cache: 'no-store' });
      if (cur && !state.tags.length) await followCurrent(cur);
      else announceCurrent();
    } catch (_) {
      announceCurrent();
    }
    setReady = true;
  })();
})();
