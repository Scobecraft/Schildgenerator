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
    return { id: d.toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 8), name: setName(d), createdAt: d.toISOString(), saved: false };
  }
  // Bei jedem Laden der Seite beginnt ein neues Set
  let currentSet = makeSet();

  function markInterrupted(tags) {
    tags.forEach((t) => {
      if (t.status === 'loading') { t.status = 'error'; t.error = 'Abruf unterbrochen – bitte neu laden.'; }
    });
  }

  function setPayload() {
    return { id: currentSet.id, name: currentSet.name, createdAt: currentSet.createdAt, tags: state.tags };
  }

  let saveTimer = null;
  let savePromise = Promise.resolve();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ print: state.print, template: state.template })); } catch (_) { /* egal */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSetNow, 400);
    renderSetBar();
  }
  function saveSetNow() {
    clearTimeout(saveTimer);
    const set = currentSet;
    const body = JSON.stringify(setPayload());
    const empty = state.tags.length === 0;
    savePromise = savePromise.then(async () => {
      try {
        if (empty) {
          if (set.saved) { await fetch('/api/sets/' + set.id, { method: 'DELETE' }); set.saved = false; }
          return;
        }
        const r = await fetch('/api/sets/' + set.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        if (!r.ok) throw new Error('Status ' + r.status);
        set.saved = true;
      } catch (e) {
        toast('Set konnte nicht auf dem Server gespeichert werden: ' + e.message, 'err');
      }
    });
    return savePromise;
  }
  // Beim Verlassen/Neuladen noch schnell speichern
  window.addEventListener('pagehide', () => {
    if (!state.tags.length) return;
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

  async function api(url, opts) {
    const r = await fetch(url, opts);
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error((body && body.error) || (typeof body === 'string' ? body : 'Fehler ' + r.status));
    return body;
  }

  function parseCodes(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (!l) continue;
      let m = l.match(/^(\d+)\s*[x×*]\s*(\S+)$/i); // "3x 5099…"
      if (m && m[1].length <= 3) { out.push({ code: m[2], qty: +m[1] }); continue; }
      m = l.match(/^(\S+?)(?:[\s;,\t]+[x×*]?\s*(\d{1,3}))?\s*[x×*]?\s*$/i);
      if (m) out.push({ code: m[1], qty: m[2] ? +m[2] : 1 });
      else out.push({ code: l.split(/\s+/)[0], qty: 1 });
    }
    return out;
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
        name: r.name || '',
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
      save();
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
        save(); refreshTag(id);
      }
    } catch (e) {
      const t = getTag(id);
      if (!t) return;
      t.status = 'error';
      t.error = e.message;
      save();
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
    if (t.warnings && t.warnings.length) return '<span class="dot dot-warn" title="Bitte prüfen"></span>';
    if (t.status === 'manual') return '<span class="dot" title="Manuell"></span>';
    return '<span class="dot dot-ok" title="OK"></span>';
  }

  function renderList() {
    const ul = $('#tagList');
    ul.innerHTML = state.tags.map((t) => `
      <li class="tag-item ${t.id === state.selectedId ? 'active' : ''}" data-id="${t.id}">
        <div class="tag-title">${statusDot(t)}<span>${esc(t.data.name || t.query || 'Neues Schild')}</span></div>
        <div class="tag-price">${t.status === 'loading' ? '<span class="spinner"></span>' : euro(t.data.price)}</div>
        <div class="tag-sub">${esc([t.data.group, t.data.artnr && 'Art.Nr. ' + t.data.artnr].filter(Boolean).join(' · ') || (t.status === 'loading' ? 'Wird von expert.de abgerufen…' : tpl(t).name))}</div>
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
  function googleUvpUrl(t) {
    const m = t.meta || {};
    const brand = m.brand || m.manufacturer || '';
    const q = [brand, t.data.name || m.fullName || t.query, 'UVP Preis'].filter(Boolean).join(' ');
    // udm=50 öffnet direkt den KI-Modus der Google-Suche
    return 'https://www.google.com/search?udm=50&q=' + encodeURIComponent(q);
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
          <a class="btn btn-sm" href="${esc(googleUvpUrl(t))}" target="_blank" rel="noopener" title="Öffnet die Google-Suche im KI-Modus in einem neuen Tab">UVP bei Google suchen ↗</a>
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
    const tplOpts = Object.values(PT.Templates).map((x) => `<option value="${x.id}" ${x.id === t.template ? 'selected' : ''}>${esc(x.name)} (${esc(x.format)})</option>`).join('');
    ed.innerHTML = `
      ${t.status === 'error' ? `<div class="err-box"><b>Abruf fehlgeschlagen:</b> ${esc(t.error)}</div>` : ''}
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
        <label class="ed-field"><span>Vorlage</span><select data-k="template">${tplOpts}</select></label>
        <label class="ed-field"><span>Warengruppe</span><input type="text" data-k="group" value="${esc(d.group)}"></label>
        <label class="ed-field"><span>Artikelname</span><input type="text" data-k="name" value="${esc(d.name)}"></label>
        <label class="ed-field"><span>Artikelnummer</span><input type="text" data-k="artnr" value="${esc(d.artnr)}"></label>
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
  }

  // Eingaben im Editor
  $('#editor').addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const t = selected();
    if (!k || !t) return;
    const v = e.target.value;
    if (k === 'query') { t.query = v.trim(); save(); return; }
    if (k === 'template') { t.template = v; state.template = v; }
    else if (k === 'bullets') t.data.bullets = v.split('\n');
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
    if (k === 'template') renderStage();
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
    const items = parseCodes($('#inputCodes').value);
    if (!items.length) { toast('Bitte mindestens eine EAN oder Artikelnummer eingeben.', 'err'); return; }
    state.template = $('#inputTemplate').value;
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
      const rot = it.rot ? `transform:translateX(${it.th}mm) rotate(90deg);transform-origin:0 0;` : '';
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
<script src="/js/templates.js"></script>
</body></html>`;
  }

  function currentLayout() {
    const opt = state.print;
    return SheetLayout.arrange(printableItems(printTags()), { paper: opt.paper, margin: +opt.margin || 0, gap: +opt.gap || 0, rotate: opt.rotate });
  }

  function renderPrintPreview() {
    const opt = state.print;
    $('#optPaper').value = opt.paper; $('#optMargin').value = opt.margin; $('#optGap').value = opt.gap;
    $('#optRotate').checked = opt.rotate; $('#optCut').checked = opt.cut;
    const res = currentLayout();
    const tags = printTags();
    const n = printableItems(tags).length;
    const pages = res.pages;
    $('#printSetName').textContent = '· Set ' + (printSource ? printSource.name : currentSet.name);
    $('#printSummary').innerHTML = n
      ? `<b>${n}</b> Schild${n === 1 ? '' : 'er'} auf <b>${pages.length}</b> Blatt ${esc(res.paper.label)}`
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
  ['optPaper', 'optMargin', 'optGap', 'optRotate', 'optCut'].forEach((id) => $('#' + id).addEventListener('change', () => {
    state.print = {
      paper: $('#optPaper').value,
      margin: Math.max(0, parseFloat($('#optMargin').value) || 0),
      gap: Math.max(0, parseFloat($('#optGap').value) || 0),
      rotate: $('#optRotate').checked,
      cut: $('#optCut').checked,
    };
    save(); renderPrintPreview();
  }));

  $('#btnPdf').addEventListener('click', async () => {
    const btn = $('#btnPdf');
    const res = currentLayout();
    if (!res.pages.length) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> PDF wird erstellt…';
    try {
      const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: buildPrintDocument(res.pages, state.print) }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || 'PDF-Erstellung fehlgeschlagen');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `preisschilder-${(printSource ? printSource.name : currentSet.name).replace(/ Uhr$/, '').replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast('PDF heruntergeladen.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'PDF herunterladen';
    }
  });

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
    currentSet = { id: set.id, name: set.name, createdAt: set.createdAt, saved: true };
    state.tags = set.tags || [];
    state.selectedId = state.tags[0] ? state.tags[0].id : null;
    selectedField = null;
    renderAll();
  }

  async function newSet() {
    await saveSetNow();
    currentSet = makeSet();
    state.tags = [];
    state.selectedId = null;
    selectedField = null;
    renderAll();
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
        openPrint({ name: set.name, tags: set.tags || [] });
      } else if (act === 'del') {
        const name = b.closest('.set-row').querySelector('.set-row-name').firstChild.textContent.trim();
        if (!confirm(`Set „${name}“ endgültig löschen?`)) return;
        await api('/api/sets/' + encodeURIComponent(id), { method: 'DELETE' });
        if (id === currentSet.id) { currentSet = makeSet(); state.tags = []; state.selectedId = null; renderAll(); }
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
  const fmtBytes = (b) => {
    if (!(b >= 0)) return '–';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (b >= 10 || i === 0 ? Math.round(b) : b.toFixed(1)).toString().replace('.', ',') + ' ' + u[i];
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
      setGauge('ram', s.ram.percent, `Arbeitsspeicher: ${fmtBytes(s.ram.used)} von ${fmtBytes(s.ram.total)} belegt`);
      if (s.disk) setGauge('disk', s.disk.percent, `Speicherplatz: ${fmtBytes(s.disk.used)} von ${fmtBytes(s.disk.total)} belegt`);
    } catch (_) { /* Server kurz nicht erreichbar */ }
  }
  pollSystem();
  setInterval(pollSystem, 3000);
  document.addEventListener('visibilitychange', pollSystem);

  // ---------------------------------------------------------------- Dunkelmodus
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

  $('#inputTemplate').innerHTML = Object.values(PT.Templates).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('#inputTemplate').value = state.template || DEFAULT_TEMPLATE;


  if (legacyTags.length) {
    markInterrupted(legacyTags);
    const old = makeSet();
    old.name = old.name.replace(' Uhr', ' Uhr (übernommen)');
    fetch('/api/sets/' + old.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: old.id, name: old.name, createdAt: old.createdAt, tags: legacyTags }) })
      .then((r) => { if (r.ok) toast('Deine bisherigen Schilder liegen jetzt im Set „' + old.name + '“ (unter „Alle Sets“).', 'ok'); })
      .catch(() => {});
    legacyTags = [];
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ print: state.print, template: state.template })); } catch (_) { /* egal */ }
  }
  if (!state.selectedId && state.tags[0]) state.selectedId = state.tags[0].id;
  document.fonts.ready.then(renderAll);
  renderAll();
})();
