/* Preisschild-Vorlagen.
 * Jede Vorlage beschreibt Größe (mm), die verschiebbaren Felder und wie das Schild gerendert wird.
 * Wird im Editor UND im PDF-Druck genutzt -> Vorschau = Druck.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function savingsPercent(price, uvp) {
    if (!(uvp > 0) || !(price > 0) || uvp <= price) return null;
    return Math.floor(((uvp - price) / uvp) * 100); // abrunden -> nie zu viel Ersparnis versprechen
  }

  function fmtUvp(v) {
    if (!(v > 0)) return '';
    const cents = Math.round(v * 100) % 100;
    return cents === 0 ? `${Math.round(v)}.-` : v.toFixed(2);
  }

  const Templates = {};
  const UVPT = { size: 9.07, stretch: 74, cx: 16.65, maxW: 30.6 };

  /* ------------------------------------------------------------------ */
  /* expert A5 klassisch (Vorlage aus dem Beispiel-Schild)               */
  /* ------------------------------------------------------------------ */
  Templates['expert-a5'] = {
    id: 'expert-a5',
    name: 'expert A5 – Klassisch',
    format: 'A5 Hochformat',
    width: 148,
    height: 210,
    // Verschiebbare Felder (Standardposition in mm)
    fields: {
      qr:      { label: 'QR-Code',        x: 127.8, y: 8.2,   w: 13.9, h: 13.9 },
      logo:    { label: 'Herstellerlogo', x: 3.5,   y: 38.6,  w: 64,   h: 19.6 },
      group:   { label: 'Warengruppe',    x: 3.3,   y: 62.9,  w: 140,  h: 7.6 },
      name:    { label: 'Artikelname',    x: 3.3,   y: 70.2,  w: 140,  h: 7.6 },
      artnr:   { label: 'Artikelnummer',  x: 3.4,   y: 79.0,  w: 80,   h: 2.8 },
      bullets: { label: 'Eigenschaften',  x: 3.2,   y: 84.6,  w: 128,  h: 52 },
      uvp:     { label: 'UVP / Ersparnis',x: 3.8,   y: 145.8, w: 32.9, h: 39.1 },
      price:   { label: 'Preis',          x: 42,    y: 136,   w: 104,  h: 58 },
    },
    render(tag, opts = {}) {
      const d = tag.data || {};
      const L = tag.layout || {};
      const f = this.fields;
      const pos = (id) => {
        const b = f[id];
        const o = L[id] || {};
        const s = o.s || 1;
        return `left:${b.x + (o.dx || 0)}mm;top:${b.y + (o.dy || 0)}mm;width:${b.w}mm;height:${b.h}mm;` +
          (s !== 1 ? `transform:scale(${s});transform-origin:top left;` : '');
      };
      const pct = savingsPercent(d.price, d.uvp);
      const showUvp = d.showUvp !== false && pct !== null && pct >= 1;
      const bullets = (d.bullets || []).filter((b) => String(b).trim());
      const qrSrc = d.qrUrl ? (opts.qrBase || '') + '/api/qr?text=' + encodeURIComponent(d.qrUrl) : '';
      const logoSrc = d.logoData || (d.logoUrl ? (opts.qrBase || '') + '/api/img?url=' + encodeURIComponent(d.logoUrl) : '');

      return `
<div class="pt pt-expert-a5" data-template="expert-a5" style="width:148mm;height:210mm">
  <div class="pt-bar pt-bar-top"></div>
  <div class="pt-expert-word"><img src="${opts.qrBase || ''}/expert_logo.svg" alt=""></div>
  <div class="pt-expert-star"><img src="${opts.qrBase || ''}/expert_logo.svg" alt=""></div>

  <div class="pt-f pt-qr" data-field="qr" style="${pos('qr')}">${qrSrc ? `<img src="${qrSrc}" alt="">` : ''}</div>
  <div class="pt-f pt-logo" data-field="logo" style="${pos('logo')}">${logoSrc ? `<img src="${logoSrc}" alt="">` : `<span class="pt-ph">Logo</span>`}</div>
  <div class="pt-f pt-group pt-fit1" data-field="group" style="${pos('group')}"><span>${esc(d.group)}</span></div>
  <div class="pt-f pt-name pt-fit1" data-field="name" style="${pos('name')}"><span>${esc(d.name)}</span></div>
  <div class="pt-f pt-artnr" data-field="artnr" style="${pos('artnr')}">${d.artnr ? 'Art.Nr.: ' + esc(d.artnr) : ''}</div>
  <div class="pt-f pt-bullets pt-fitn" data-field="bullets" style="${pos('bullets')}"><ul>${bullets.map((b) => `<li>${esc(b).replace(/(\S+-\S+)/g, '<span class="nb">$1</span>')}</li>`).join('')}</ul></div>
  <div class="pt-f pt-uvp" data-field="uvp" style="${pos('uvp')}${showUvp ? '' : 'visibility:hidden;'}">
    <svg viewBox="0 0 32.9 39.1" preserveAspectRatio="none">
      <rect x="0" y="0" width="32.9" height="19.25" fill="#035dab"/>
      <rect x="0" y="19.25" width="32.9" height="19.85" fill="#ff7524"/>
      <g class="pt-uvp-t" fill="#fff" text-anchor="middle" font-family="PT Price" font-style="italic" font-weight="900" font-size="${UVPT.size}" style="font-stretch:${UVPT.stretch}%;font-variation-settings:'wdth' ${UVPT.stretch},'wght' 900">
        <text x="${UVPT.cx}" y="8.2">UVP</text>
        <text x="${UVPT.cx}" y="17.6">${esc(fmtUvp(d.uvp))}</text>
        <text x="${UVPT.cx}" y="27.8">${pct !== null ? pct + '%' : ''}</text>
        <text x="${UVPT.cx}" y="37.0">SPAREN</text>
      </g>
    </svg>
  </div>
  <div class="pt-f pt-price" data-field="price" data-price="${d.price > 0 ? Number(d.price).toFixed(2) : ''}" style="${pos('price')}"></div>

  <div class="pt-bar pt-bar-bottom"></div>
</div>`;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Preis mit weißer Umrandung + Schatten (wie Original)                */
  /* ------------------------------------------------------------------ */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const PRICE = {
    font: 51.3,          // Schriftgröße in mm
    stroke: 3.4,       // Breite der weißen Kontur (gesamt, mittig) in mm
    track: -0.6,       // Ziffernabstand in mm (negativ = überlappend wie im Original)
    dotGap: 1.2,       // Abstand letzte Ziffer -> ".-"
    centerX: 48.8,     // horizontale Mitte der Preisgruppe innerhalb des Preisfelds (mm)
    baseline: 45.4,    // Grundlinie innerhalb des Preisfelds (mm)
    blue: '#0562af',
  };

  function el(name, attrs) {
    const e = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  }

  function skewPoly(x, y, w, h, skewDeg) {
    // Parallelogramm (kursiv) mit Grundlinie y+h
    const t = Math.tan((skewDeg * Math.PI) / 180);
    const p = [[x + h * t, y], [x + w + h * t, y], [x + w, y + h], [x, y + h]];
    return p.map((q) => q.map((v) => v.toFixed(3)).join(',')).join(' ');
  }

  function buildPrice(box) {
    const raw = box.getAttribute('data-price');
    box.innerHTML = '';
    if (!raw) return;
    const value = parseFloat(raw);
    const euros = Math.floor(value + 1e-9);
    const cents = Math.round((value - euros) * 100);
    const bw = parseFloat(box.style.width);
    const bh = parseFloat(box.style.height);

    const svg = el('svg', { viewBox: `0 0 ${bw} ${bh}`, width: '100%', height: '100%', overflow: 'visible' });
    const defs = el('defs');
    const filt = el('filter', { id: 'ptShadow' + Math.random().toString(36).slice(2), x: '-20%', y: '-20%', width: '140%', height: '150%' });
    filt.appendChild(el('feDropShadow', { dx: '0.55', dy: '0.75', stdDeviation: '0.75', 'flood-color': '#000', 'flood-opacity': '0.38' }));
    defs.appendChild(filt);
    svg.appendChild(defs);
    const g = el('g', { filter: `url(#${filt.getAttribute('id')})` });
    svg.appendChild(g);
    box.appendChild(svg);

    const textAttrs = (size) => ({
      'font-family': 'PT Price', 'font-style': 'italic', 'font-weight': '900', 'font-size': size,
      style: 'font-stretch:62%;font-variation-settings:"wdth" 62,"wght" 900',
    });

    // Glyphen einzeln setzen: erst weiße Kontur, dann Blau -> jede Ziffer überdeckt die vorherige leicht
    const items = [];
    let x = 0;
    const digits = String(euros);
    for (const ch of digits) {
      const t = el('text', { ...textAttrs(PRICE.font), x: 0, y: 0 });
      t.textContent = ch;
      g.appendChild(t);
      const adv = t.getComputedTextLength();
      g.removeChild(t);
      items.push({ type: 'glyph', ch, x, size: PRICE.font });
      x += adv + PRICE.track;
    }
    const capH = PRICE.font * 0.72;
    const skew = 12;
    if (cents === 0) {
      // ".-" als Balken (oben) und Quadrat (unten) wie im Original
      const t12 = Math.tan((skew * Math.PI) / 180);
      const dotX = x + PRICE.dotGap;
      // Quadrat unten (Punkt)
      items.push({ type: 'poly', pts: skewPoly(dotX, -capH * 0.25, capH * 0.25, capH * 0.25, skew) });
      // Balken darüber (Strich), bündig zur kursiven Kante des Quadrats
      const barBottom = -capH * 0.30;
      const barH = capH * 0.24;
      items.push({ type: 'poly', pts: skewPoly(dotX - barBottom * t12 + capH * 0.03, barBottom - barH, capH * 0.37, barH, skew) });
      x = dotX + capH * 0.45;
    } else {
      // Punkt + kleinere, hochgestellte Cents
      const dotX = x - PRICE.font * 0.02;
      items.push({ type: 'poly', pts: skewPoly(dotX, -capH * 0.2, PRICE.font * 0.15, capH * 0.2, skew) });
      let cx = dotX + PRICE.font * 0.17;
      const cs = PRICE.font * 0.5;
      for (const ch of String(cents).padStart(2, '0')) {
        const t = el('text', { ...textAttrs(cs), x: 0, y: 0 });
        t.textContent = ch;
        g.appendChild(t);
        const adv = t.getComputedTextLength();
        g.removeChild(t);
        items.push({ type: 'glyph', ch, x: cx, size: cs, y: -capH + cs * 0.72 });
        cx += adv + PRICE.track * 0.5;
      }
      x = cx;
    }

    const inner = el('g');
    g.appendChild(inner);
    for (const it of items) {
      if (it.type === 'glyph') {
        const common = { ...textAttrs(it.size), x: it.x, y: it.y || 0 };
        inner.appendChild(Object.assign(el('text', { ...common, fill: '#fff', stroke: '#fff', 'stroke-width': PRICE.stroke * (it.size / PRICE.font), 'stroke-linejoin': 'round' }), { textContent: it.ch }));
        inner.appendChild(Object.assign(el('text', { ...common, fill: PRICE.blue }), { textContent: it.ch }));
      } else {
        inner.appendChild(el('polygon', { points: it.pts, fill: '#fff', stroke: '#fff', 'stroke-width': PRICE.stroke, 'stroke-linejoin': 'round' }));
        inner.appendChild(el('polygon', { points: it.pts, fill: PRICE.blue }));
      }
    }
    // Position: Mitte wie im Original, bei Bedarf verkleinern, damit es ins Feld passt
    const bb = inner.getBBox();
    const pad = PRICE.stroke / 2 + 0.8;
    const width = bb.width + pad * 2;
    const height = capH + pad * 2; // Ziffernhöhe zählt, nicht die Schrift-Metrik
    const scale = Math.min(1, (bw) / width, (bh) / height);
    let left = PRICE.centerX - (bb.width * scale) / 2;
    left = Math.max(pad * scale, Math.min(left, bw - bb.width * scale - pad * scale));
    const baseY = PRICE.baseline + (1 - scale) * capH * 0.5;
    inner.setAttribute('transform', `translate(${(left - bb.x * scale).toFixed(3)} ${baseY.toFixed(3)}) scale(${scale.toFixed(4)})`);
  }

  /* ------------------------------------------------------------------ */
  /* Text automatisch einpassen                                          */
  /* ------------------------------------------------------------------ */
  function fitOneLine(box) {
    const span = box.firstElementChild;
    if (!span) return;
    span.style.fontSize = '';
    const base = parseFloat(getComputedStyle(span).fontSize);
    let size = base;
    let guard = 0;
    while (span.scrollWidth > box.clientWidth + 0.5 && size > base * 0.45 && guard++ < 80) {
      size *= 0.97;
      span.style.fontSize = size + 'px';
    }
  }
  function fitMulti(box) {
    box.style.fontSize = '';
    const base = parseFloat(getComputedStyle(box).fontSize);
    let size = base;
    let guard = 0;
    while (box.scrollHeight > box.clientHeight + 0.5 && size > base * 0.45 && guard++ < 80) {
      size *= 0.97;
      box.style.fontSize = size + 'px';
    }
  }

  function fitUvp(box) {
    box.querySelectorAll('.pt-uvp-t text').forEach((t) => {
      t.removeAttribute('textLength');
      t.removeAttribute('lengthAdjust');
      if (t.getComputedTextLength() > UVPT.maxW) {
        t.setAttribute('textLength', UVPT.maxW);
        t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  }

  function fitTag(root) {
    root.querySelectorAll('.pt-uvp').forEach(fitUvp);
    root.querySelectorAll('.pt-fit1').forEach(fitOneLine);
    root.querySelectorAll('.pt-fitn').forEach(fitMulti);
    root.querySelectorAll('.pt-price').forEach(buildPrice);
  }

  async function fitAll(root = document) {
    try { await document.fonts.ready; } catch (_) { /* egal */ }
    await Promise.all([...root.querySelectorAll('.pt img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
    root.querySelectorAll('.pt').forEach(fitTag);
  }

  window.PT = { Templates, fitTag, fitAll, savingsPercent, fmtUvp, esc };
  window.__fitAll = () => fitAll(document);
})();
