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

  // Bildquelle des Herstellerlogos – Original (Standard) oder hochskaliert (d.logoUpscale)
  function logoSrcFor(d, base = '') {
    const up = d.logoUpscale === true;
    if (d.logoData) return up && d.logoDataUp ? d.logoDataUp : d.logoData;
    if (!d.logoUrl) return '';
    if (d.logoUrl.startsWith('/logos/')) {
      if (!up) return base + d.logoUrl;
      const name = d.logoUrl.replace(/^\/logos\//, '').replace(/\.png.*$/, '');
      const v = (d.logoUrl.split('v=')[1] || '');
      return base + '/api/img?lib=' + encodeURIComponent(name) + '&up=1&v=' + encodeURIComponent(v);
    }
    return base + '/api/img?url=' + encodeURIComponent(d.logoUrl) + (up ? '&up=1' : '');
  }
  const UVPT = { size: 9.07, stretch: 74, cx: 16.65, maxW: 30.6 };

  /* ------------------------------------------------------------------ */
  /* expert A5 klassisch (Vorlage aus dem Beispiel-Schild)               */
  /* ------------------------------------------------------------------ */
  Templates['expert-a5'] = {
    id: 'expert-a5',
    name: 'expert A5 – Klassisch',
    short: 'A5',
    twoLineName: true,
    format: 'A5 Hochformat',
    description: 'Das Standard-Schild: Logo, Warengruppe, Name, Eigenschaften, UVP-Box und großer Preis.',
    width: 148,
    height: 210,
    // Verschiebbare Felder (Standardposition in mm)
    fields: {
      qr:      { label: 'QR-Code',        x: 120.6, y: 9.6,   w: 24,   h: 24 },
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
      // Zweizeiliger Artikelname: Name wird eine Zeile höher, Art.Nr. und Eigenschaften rutschen nach unten
      const LINE = 7.3;
      const two = d.nameTwoLines === true;
      const extra = { name: { dh: two ? LINE : 0 }, artnr: { dy: two ? LINE : 0 }, bullets: { dy: two ? LINE : 0, dh: two ? -LINE : 0 } };
      const pos = (id) => {
        const b = f[id];
        const o = L[id] || {};
        const e = extra[id] || {};
        const s = o.s || 1;
        return `left:${b.x + (o.dx || 0)}mm;top:${b.y + (o.dy || 0) + (e.dy || 0)}mm;width:${b.w}mm;height:${b.h + (e.dh || 0)}mm;` +
          (s !== 1 ? `transform:scale(${s});transform-origin:top left;` : '');
      };
      const pct = savingsPercent(d.price, d.uvp);
      const showUvp = d.showUvp !== false && pct !== null && pct >= 1;
      const bullets = (d.bullets || []).filter((b) => String(b).trim());
      const qrSrc = d.qrUrl ? (opts.qrBase || '') + '/api/qr?text=' + encodeURIComponent(d.qrUrl) : '';
      const logoSrc = logoSrcFor(d, opts.qrBase || '');

      return `
<div class="pt pt-expert-a5" data-template="expert-a5" style="width:148mm;height:210mm">
  <div class="pt-bar pt-bar-top"></div>
  <div class="pt-expert-word"><img src="${opts.qrBase || ''}/expert_logo.svg" alt=""></div>
  <div class="pt-expert-star"><img src="${opts.qrBase || ''}/expert_logo.svg" alt=""></div>

  <div class="pt-f pt-qr" data-field="qr" style="${pos('qr')}">${qrSrc ? `<img src="${qrSrc}" alt="">` : ''}</div>
  <div class="pt-f pt-logo" data-field="logo" style="${pos('logo')}">${logoSrc ? `<img src="${logoSrc}" alt="">` : `<span class="pt-ph">Logo</span>`}</div>
  <div class="pt-f pt-group pt-fit1" data-field="group" style="${pos('group')}"><span>${esc(d.group)}</span></div>
  <div class="pt-f pt-name ${two ? 'pt-name-2 pt-fitn' : 'pt-fit1'}" data-field="name" style="${pos('name')}">${two ? esc(d.name) : `<span>${esc(d.name)}</span>`}</div>
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
  /* Gemeinsame Bausteine für weitere Vorlagen                           */
  /* ------------------------------------------------------------------ */
  function makePos(fields, layout, extra = {}) {
    return (id) => {
      const b = fields[id];
      const o = (layout || {})[id] || {};
      const e = extra[id] || {};
      const s = o.s || 1;
      return `left:${b.x + (o.dx || 0) + (e.dx || 0)}mm;top:${b.y + (o.dy || 0) + (e.dy || 0)}mm;width:${b.w + (e.dw || 0)}mm;height:${b.h + (e.dh || 0)}mm;` +
        (s !== 1 ? `transform:scale(${s});transform-origin:top left;` : '');
    };
  }

  function fmtUvpComma(v) {
    if (!(v > 0)) return '';
    const cents = Math.round(v * 100) % 100;
    return cents === 0 ? `${Math.round(v)},-` : v.toFixed(2).replace('.', ',');
  }

  // expert-Logo (Schriftzug + Stern) in beliebiger Größe; k = Faktor gegenüber dem A5-Schild
  function expertLogoHtml(x, y, k, base) {
    const src = (base || '') + '/expert_logo.svg';
    const wx = x, wy = y + 5.45 * k, sx = x + 55.3 * k, sy = y;
    return `<div class="pt-xw" style="left:${wx}mm;top:${wy}mm;width:${51.07 * k}mm;height:${9.39 * k}mm"><img src="${src}" alt="" style="width:${75.075 * k}mm;margin-top:${-6.42 * k}mm"></div>
      <div class="pt-xs" style="left:${sx}mm;top:${sy}mm;width:${18.4 * k}mm;height:${18.4 * k}mm"><img src="${src}" alt="" style="width:${70.65 * k}mm;margin-left:${-51.68 * k}mm;margin-top:${-0.466 * k}mm"></div>`;
  }

  // nur der Schriftzug "expert", senkrecht (von unten nach oben zu lesen)
  function expertVerticalHtml(x, y, len, base) {
    const k = len / 51.07;
    const thick = 9.39 * k;
    return `<div class="pt-xw" style="left:${x}mm;top:${y + len}mm;width:${len}mm;height:${thick}mm;transform:rotate(-90deg);transform-origin:0 0"><img src="${base || ''}/expert_logo.svg" alt="" style="width:${75.075 * k}mm;margin-top:${-6.42 * k}mm"></div>`;
  }

  // EAN-13 / EAN-8 als SVG (Striche + Ziffern), Maße in mm
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function eanCheck(digits) {
    let sum = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w;
    return (10 - (sum % 10)) % 10;
  }
  function eanBits(code) {
    let c = String(code || '').replace(/\D/g, '');
    if (c.length === 12) c += eanCheck(c);
    if (c.length === 7) c += eanCheck(c);
    if (c.length === 13 && Number(c[12]) === eanCheck(c.slice(0, 12))) {
      const d = c.split('').map(Number);
      let bits = '101';
      for (let i = 1; i <= 6; i++) bits += (EAN_P[d[0]][i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
      bits += '01010';
      for (let i = 7; i <= 12; i++) bits += EAN_R[d[i]];
      return { bits: bits + '101', text: c };
    }
    if (c.length === 8 && Number(c[7]) === eanCheck(c.slice(0, 7))) {
      const d = c.split('').map(Number);
      let bits = '101';
      for (let i = 0; i < 4; i++) bits += EAN_L[d[i]];
      bits += '01010';
      for (let i = 4; i < 8; i++) bits += EAN_R[d[i]];
      return { bits: bits + '101', text: c };
    }
    return null;
  }
  function eanSvg(code, w, h) {
    const e = eanBits(code);
    if (!e) return '';
    const textH = h * 0.27;
    const barH = h - textH - 0.2;
    const m = w / e.bits.length;
    let rects = '';
    for (let i = 0; i < e.bits.length;) {
      if (e.bits[i] === '1') {
        let j = i;
        while (j < e.bits.length && e.bits[j] === '1') j++;
        rects += `<rect x="${(i * m).toFixed(3)}" y="0" width="${((j - i) * m).toFixed(3)}" height="${barH.toFixed(3)}"/>`;
        i = j;
      } else i++;
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block;overflow:visible">
      <g fill="#000">${rects}</g>
      <text x="0" y="${h}" font-family="PT Text" font-weight="700" font-size="${(textH * 1.12).toFixed(2)}" textLength="${w}" lengthAdjust="spacingAndGlyphs">${e.text}</text></svg>`;
  }

  /* ------------------------------------------------------------------ */
  /* Blister (52 × 40 mm)                                                */
  /* ------------------------------------------------------------------ */
  Templates['blister'] = {
    id: 'blister',
    name: 'Blister',
    short: 'Blister',
    format: 'Blister',
    width: 52,
    height: 39.5,
    description: 'Kleines Schild für Blisterware: Marke im orangen Kopf, Name (bis 2 Zeilen), Preis passt sich dem Platz an, Artikelnummer.',
    sample: { brand: 'POPSOCKETS', group: 'Zubehör', name: 'Magsafe MSC-Clear 840173727768', artnr: '15099022195', price: 29.99, uvp: null },
    // Maße aus dem Original-PDF (Schild 52 × 39,5 mm)
    fields: {
      brand: { label: 'Marke', x: 1, y: 1.18, w: 48, h: 7.06 },
      name: { label: 'Artikelname', x: 1, y: 11.31, w: 48, h: 10 },
      price: { label: 'Preis', x: 0, y: 11, w: 52, h: 26 },
      artnr: { label: 'Artikelnummer', x: 2, y: 35.98, w: 30, h: 2.82 },
    },
    render(tag) {
      const d = tag.data || {};
      const pos = makePos(this.fields, tag.layout);
      // Zeilenumbruch: automatisch, oder selbst gesetzt mit "|" bzw. Zeilenumbruch im Namen
      const name = esc(d.name || '').replace(/\s*\|\s*/g, '\n');
      return `
<div class="pt pt-blister" data-template="blister" style="width:52mm;height:39.5mm">
  <div class="pt-bl-head"></div>
  <div class="pt-f pt-bl-brand pt-fit1" data-field="brand" style="${pos('brand')}"><span>${esc(d.brand || '')}</span></div>
  <div class="pt-f pt-bl-name pt-fitn" data-field="name" style="${pos('name')}">${name}</div>
  <div class="pt-f pt-price" data-field="price" data-price="${d.price > 0 ? Number(d.price).toFixed(2) : ''}"
    data-pfill="1" data-ptop-from="name" data-pgap="2.87" data-pfont="15.3" data-pcx="25.19" data-pbase="22.85" data-pmaxw="48"
    data-pcs="0.70" data-pcy="-0.052" data-pcx0="0.04" data-pcsp="0.986" data-pdx="-0.007" data-pdy="-0.052" style="${pos('price')}"></div>
  <div class="pt-f pt-bl-artnr" data-field="artnr" style="${pos('artnr')}">${esc(d.artnr || '')}</div>
</div>`;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Preisschiene (100 × 39 mm)                                          */
  /* ------------------------------------------------------------------ */
  Templates['schiene'] = {
    id: 'schiene',
    name: 'Preisschiene',
    short: 'Schiene',
    format: 'Preisschiene',
    width: 100,
    height: 39,
    description: 'Für die Preisschiene am Regal: Herstellerlogo, EAN-Barcode, „expert“ senkrecht, Warengruppe, Name, Preis.',
    sample: { brand: 'PETER JÄCKEL', group: 'Schutzglas', name: '21736 Glas HD iPh 16 PM', artnr: '15088045452', ean: '4031574217361', price: 19.99, uvp: null },
    fields: {
      logo: { label: 'Herstellerlogo', x: 1.7, y: 2.4, w: 35, h: 6.9 },
      ean: { label: 'Barcode', x: 70, y: 1.8, w: 24, h: 8.8 },
      group: { label: 'Warengruppe', x: 12, y: 17.66, w: 50, h: 5.4 },
      name: { label: 'Artikelname', x: 12, y: 26.32, w: 54, h: 4.5 },
      artnr: { label: 'Artikelnummer', x: 42.7, y: 33.55, w: 22, h: 3 },
      price: { label: 'Preis', x: 60, y: 11, w: 39.5, h: 27 },
    },
    render(tag, opts = {}) {
      const d = tag.data || {};
      const base = opts.qrBase || '';
      const pos = makePos(this.fields, tag.layout);
      const logoSrc = logoSrcFor(d, base);
      return `
<div class="pt pt-schiene" data-template="schiene" style="width:100mm;height:39mm">
  ${expertVerticalHtml(4.26, 13.21, 23.24, base)}
  <div class="pt-f pt-logo" data-field="logo" style="${pos('logo')}">${logoSrc ? `<img src="${logoSrc}" alt="">` : '<span class="pt-ph">Logo</span>'}</div>
  <div class="pt-f pt-ean" data-field="ean" style="${pos('ean')}">${eanSvg(d.ean, this.fields.ean.w, this.fields.ean.h)}</div>
  <div class="pt-f pt-sc-group pt-fit1" data-field="group" style="${pos('group')}"><span>${esc(d.group)}</span></div>
  <div class="pt-f pt-sc-name pt-fit1" data-field="name" style="${pos('name')}"><span>${esc(d.name)}</span></div>
  <div class="pt-f pt-sc-artnr" data-field="artnr" style="${pos('artnr')}">${esc(d.artnr || '')}</div>
  <div class="pt-f pt-price" data-field="price" data-price="${d.price > 0 ? Number(d.price).toFixed(2) : ''}" data-pfont="17.76" data-pcx="21.05" data-pbase="20.25" style="${pos('price')}"></div>
</div>`;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Quer Groß (105 × 78 mm)                                             */
  /* ------------------------------------------------------------------ */
  Templates['quer'] = {
    id: 'quer',
    name: 'Quer Groß',
    short: 'Quer',
    format: 'Querformat',
    width: 105,
    height: 78,
    description: 'Querformat mit Logo, Artikelnummer und Eigenschaften links, Warengruppe, Name, UVP und Preis rechts.',
    sample: {
      brand: 'PETER JÄCKEL', group: 'Schutzglas', name: '21736 Glas HD iPh 16 PM', artnr: '15088045452', price: 19.99, uvp: 24.99,
      bullets: ['Kompatibilität: Apple iPhone 16 Pro Max', 'Glas', 'Transparent'],
    },
    fields: {
      qr: { label: 'QR-Code', x: 86, y: 0.6, w: 15.8, h: 15.8 },
      logo: { label: 'Herstellerlogo', x: 2.5, y: 17.3, w: 30, h: 8 },
      artnr: { label: 'Artikelnummer', x: 4, y: 25.65, w: 44, h: 3.2 },
      bullets: { label: 'Eigenschaften', x: 4.6, y: 29.8, w: 45, h: 38.5 },
      group: { label: 'Warengruppe', x: 54.2, y: 18.45, w: 48, h: 4.2 },
      name: { label: 'Artikelname', x: 54.2, y: 23.92, w: 48, h: 4.2 },
      uvp: { label: 'UVP / Ersparnis', x: 54, y: 31.3, w: 39.9, h: 11.9 },
      price: { label: 'Preis', x: 50, y: 44.3, w: 54, h: 24.5 },
    },
    render(tag, opts = {}) {
      const d = tag.data || {};
      const base = opts.qrBase || '';
      const pos = makePos(this.fields, tag.layout);
      const pct = savingsPercent(d.price, d.uvp);
      const showUvp = d.showUvp !== false && pct !== null && pct >= 1;
      const bullets = (d.bullets || []).filter((b) => String(b).trim());
      const qrSrc = d.qrUrl ? base + '/api/qr?text=' + encodeURIComponent(d.qrUrl) : '';
      const logoSrc = logoSrcFor(d, base);
      const T = (x, y, t) => `<text x="${x}" y="${y}">${esc(t)}</text>`;
      return `
<div class="pt pt-quer" data-template="quer" style="width:105mm;height:78mm">
  <div class="pt-qu-bar" style="top:0;height:4.5mm"></div>
  <div class="pt-qu-bar" style="top:69.1mm;height:8.9mm"></div>
  ${expertLogoHtml(3.1, 6.1, 0.463, base)}
  <div class="pt-f pt-qr pt-qu-qr" data-field="qr" style="${pos('qr')}">${qrSrc ? `<img src="${qrSrc}" alt="">` : ''}</div>
  <div class="pt-f pt-logo" data-field="logo" style="${pos('logo')}">${logoSrc ? `<img src="${logoSrc}" alt="">` : '<span class="pt-ph">Logo</span>'}</div>
  <div class="pt-f pt-qu-artnr" data-field="artnr" style="${pos('artnr')}">${d.artnr ? 'Art.Nr.: ' + esc(d.artnr) : ''}</div>
  <div class="pt-f pt-qu-bullets pt-fitn" data-field="bullets" style="${pos('bullets')}"><ul>${bullets.map((b) => `<li>${esc(b).replace(/(\S+-\S+)/g, '<span class="nb">$1</span>')}</li>`).join('')}</ul></div>
  <div class="pt-f pt-qu-group pt-fit1" data-field="group" style="${pos('group')}"><span>${esc(d.group)}</span></div>
  <div class="pt-f pt-qu-name pt-fit1" data-field="name" style="${pos('name')}"><span>${esc(d.name)}</span></div>
  <div class="pt-f pt-uvp" data-field="uvp" style="${pos('uvp')}${showUvp ? '' : 'visibility:hidden;'}">
    <svg viewBox="0 0 39.9 12.3" preserveAspectRatio="none" style="display:block;width:100%;height:100%;overflow:visible">
      <rect x="0" y="0" width="20.1" height="12.3" fill="#005bab"/>
      <rect x="20.1" y="0" width="19.8" height="12.3" fill="#ff7321"/>
      <g class="pt-uvp-t" fill="#fff" text-anchor="middle" font-family="PT Price" font-style="italic" font-weight="900" font-size="5.4" style="font-stretch:74%;font-variation-settings:'wdth' 74,'wght' 900" data-maxw="18.6">
        ${T(10.3, 4.9, 'UVP')}${T(10.3, 11.0, fmtUvpComma(d.uvp))}${T(30.2, 4.9, pct !== null ? pct + '%' : '')}${T(30.2, 11.0, 'SPAREN')}
      </g>
    </svg>
  </div>
  <div class="pt-f pt-price" data-field="price" data-price="${d.price > 0 ? Number(d.price).toFixed(2) : ''}" data-pfont="23" data-pcx="27.73" data-pbase="20.15" style="${pos('price')}"></div>
</div>`;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Vorlagen aus dem bisherigen Schild-System (PDF)                     */
  /* Maße/Schriftgrößen stammen aus dem PDF (public/js/tpl-specs.js,    */
  /* erzeugt mit dev/pdf-vorlagen/gen.py), Hintergrund = /tpl/<id>.svg   */
  /* ------------------------------------------------------------------ */
  const TXT_TOP = 0.8415; // Abstand Oberkante -> Grundlinie bei line-height 1 (Roboto), in Schriftgrößen
  const r2 = (v) => Math.round(v * 100) / 100;

  function pdfTemplate(S) {
    const F = S.fields;
    const W = S.width, H = S.height;
    // rechter Rand für Textzeilen: vor dem QR-Code, sonst 3 mm vor der Kante
    const rightAt = (x, y, h) => {
      let r = W - 3;
      for (const o of [F.qr, F.uvp, F.price]) {
        if (o && o.x > x + 10 && y < o.y + o.h && y + h > o.y) r = Math.min(r, o.x - 1.5);
      }
      return r;
    };
    const fields = {};
    const lineBox = (t, label, extraH = 0) => {
      const y = r2(t.base - TXT_TOP * t.size);
      return { label, x: t.x, y, w: r2(rightAt(t.x, y, t.size) - t.x), h: r2(t.size + extraH) };
    };
    if (F.qr) fields.qr = { label: 'QR-Code', ...F.qr };
    if (F.logo) fields.logo = { label: 'Herstellerlogo', ...F.logo };
    if (F.group) fields.group = lineBox(F.group, 'Warengruppe');
    const namePitch = F.name ? (F.group && F.name.base - F.group.base > F.name.size ? F.name.base - F.group.base : F.name.size * 1.15) : 0;
    if (F.name) fields.name = lineBox(F.name, 'Artikelname');
    if (F.artnr) {
      const y = r2(F.artnr.base - TXT_TOP * F.artnr.size);
      fields.artnr = { label: 'Artikelnummer', x: F.artnr.x, y, w: Math.min(70, r2(W - 3 - F.artnr.x)), h: r2(F.artnr.size) };
    }
    if (F.bullets) {
      const b = F.bullets;
      const y = r2(b.top - b.pitch / 2 - 0.3415 * b.size);
      fields.bullets = { label: 'Eigenschaften', x: b.x, y, w: b.w, h: r2(b.bottom - y) };
    }
    if (F.uvp) fields.uvp = { label: 'UVP / Ersparnis', x: F.uvp.x, y: F.uvp.y, w: F.uvp.w, h: F.uvp.h };
    if (F.price) fields.price = { label: 'Preis', x: F.price.x, y: F.price.y, w: F.price.w, h: F.price.h };

    // Was rutscht bei zweizeiligem Namen nach unten? Alles in derselben Spalte unter dem Namen.
    const below = (id) => F.name && F[id] && Math.abs(F[id].x - F.name.x) < 8 && fields[id].y > fields.name.y;

    const textStyle = (t) => `font-size:${t.size}mm;color:${t.color};`;
    return {
      id: S.id,
      name: S.name,
      short: S.short,
      group: S.group,
      variant: S.variant,
      format: S.format,
      width: W,
      height: H,
      description: S.description,
      twoLineName: !!F.name,
      fields,
      render(tag, opts = {}) {
        const d = tag.data || {};
        const base = opts.qrBase || '';
        const two = d.nameTwoLines === true && !!F.name;
        const extra = {};
        if (two) {
          extra.name = { dh: namePitch };
          for (const id of ['artnr', 'bullets']) if (below(id)) extra[id] = { dy: namePitch, dh: id === 'bullets' ? -namePitch : 0 };
        }
        const pos = makePos(fields, tag.layout, extra);
        const pct = savingsPercent(d.price, d.uvp);
        const showUvp = d.showUvp !== false && pct !== null && pct >= 1;
        const bullets = (d.bullets || []).filter((b) => String(b).trim());
        const qrSrc = d.qrUrl ? base + '/api/qr?text=' + encodeURIComponent(d.qrUrl) : '';
        const logoSrc = logoSrcFor(d, base);
        const out = [];
        out.push(`<div class="pt pt-pdf" data-template="${S.id}" style="width:${W}mm;height:${H}mm"><img class="pt-bg" src="${base}${S.bg}" alt="">`);
        if (F.qr) out.push(`<div class="pt-f pt-qr" data-field="qr" style="${pos('qr')}">${qrSrc ? `<img src="${qrSrc}" alt="">` : ''}</div>`);
        if (F.logo) out.push(`<div class="pt-f pt-logo" data-field="logo" style="${pos('logo')}">${logoSrc ? `<img src="${logoSrc}" alt="">` : '<span class="pt-ph">Logo</span>'}</div>`);
        if (F.group) out.push(`<div class="pt-f pt-t pt-fit1 s-${F.group.style}" data-field="group" style="${pos('group')}${textStyle(F.group)}"><span>${esc(d.group)}</span></div>`);
        if (F.name) {
          out.push(two
            ? `<div class="pt-f pt-t pt-t2 pt-fitn s-${F.name.style}" data-field="name" style="${pos('name')}${textStyle(F.name)}line-height:${r2(namePitch / F.name.size * 100) / 100}">${esc(d.name)}</div>`
            : `<div class="pt-f pt-t pt-fit1 s-${F.name.style}" data-field="name" style="${pos('name')}${textStyle(F.name)}"><span>${esc(d.name)}</span></div>`);
        }
        if (F.artnr) {
          const a = F.artnr;
          const inner = !d.artnr ? '' : a.numx != null
            ? `Art.Nr.:<span style="position:absolute;left:${a.numx}mm;top:0">${esc(d.artnr)}</span>`
            : `Art.Nr.: ${esc(d.artnr)}`;
          out.push(`<div class="pt-f pt-t s-${a.style}" data-field="artnr" style="${pos('artnr')}${textStyle(a)}">${inner}</div>`);
        }
        if (F.bullets) {
          const b = F.bullets;
          const lh = b.pitch / b.size, ind = b.indent / b.size;
          out.push(`<div class="pt-f pt-bul pt-fitb s-${b.style}" data-field="bullets" style="${pos('bullets')}${textStyle(b)}line-height:${lh.toFixed(3)}"><ul style="padding-left:${ind.toFixed(3)}em;--ind:${ind.toFixed(3)}em">${bullets.map((x) => `<li>${esc(x).replace(/(\S+-\S+)/g, '<span class="nb">$1</span>')}</li>`).join('')}</ul></div>`
);
        }
        if (F.uvp) {
          const u = F.uvp;
          const val = { label: 'UVP', value: fmtUvpComma(d.uvp), pct: pct !== null ? pct + '%' : '' };
          const texts = u.texts.map((t) => {
            const txt = t.role === 'static' ? t.text : val[t.role];
            const font = t.style === 'bco'
              ? `font-family="PT Price" font-style="italic" font-weight="900" style="font-stretch:74%;font-variation-settings:'wdth' 74,'wght' 900"`
              : `font-family="PT Text" font-weight="900"`;
            return `<g class="pt-uvp-t" data-maxw="${t.maxw}"><text x="${t.cx}" y="${t.base}" fill="${t.color}" text-anchor="middle" font-size="${t.size}" ${font}>${esc(txt)}</text></g>`;
          }).join('');
          out.push(`<div class="pt-f pt-uvp" data-field="uvp" style="${pos('uvp')}${showUvp ? '' : 'visibility:hidden;'}"><svg viewBox="0 0 ${u.w} ${u.h}" preserveAspectRatio="none">${u.cells.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.color}"/>`).join('')}${texts}</svg></div>`);
        }
        if (F.price) {
          const p = F.price;
          out.push(`<div class="pt-f pt-price" data-field="price" data-price="${d.price > 0 ? Number(d.price).toFixed(2) : ''}" data-pfont="${r2(p.cap / 0.694)}" data-pcx="${p.cx}" data-pbase="${p.base}" style="${pos('price')}"></div>`);
        }
        out.push('</div>');
        return out.join('\n');
      },
    };
  }
  (window.PT_PDF_SPECS || []).forEach((S) => { Templates[S.id] = pdfTemplate(S); });

  // Gruppen für die Vorlagen-Auswahl (nach Format, groß -> klein)
  Templates['expert-a5'].group = 'A5 hoch';
  for (const id of ['quer', 'blister', 'schiene']) Templates[id].group = 'Weitere';
  const GROUP_ORDER = ['A4 hoch', 'A4 quer', 'A5 hoch', 'A5 quer', 'Mittel hoch', 'A6 hoch', 'A7 quer', 'Weitere'];

  /* ------------------------------------------------------------------ */
  /* Preis mit weißer Umrandung + Schatten (wie Original)                */
  /* ------------------------------------------------------------------ */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CENT_X = 0.0;     // Beginn der Cents relativ zum Punkt, in Ziffernhöhen (am Original gemessen)
  const CENT_SPACE = 1.09; // Cents stehen etwas weiter auseinander als die großen Ziffern
  const DOT_X = -0.035;    // Punkt leicht nach links, in Ziffernhöhen
  const PRICE = {
    font: 51.3,          // Schriftgröße in mm
    stroke: 6.55,      // Breite der weißen Kontur (gesamt, mittig) in mm – je Seite ≈ 9 % der Ziffernhöhe wie im Original
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

  function buildPrice(box) {
    const raw = box.getAttribute('data-price');
    box.innerHTML = '';
    if (!raw) return;
    const value = parseFloat(raw);
    const euros = Math.floor(value + 1e-9);
    const cents = Math.round((value - euros) * 100);
    const bw = parseFloat(box.style.width);
    const bh = parseFloat(box.style.height);
    // Größe/Lage je Vorlage über data-Attribute; alles andere skaliert mit der Schriftgröße
    const font = parseFloat(box.dataset.pfont) || PRICE.font;
    const k = font / PRICE.font;
    const P = {
      font, blue: PRICE.blue,
      stroke: PRICE.stroke * k, track: PRICE.track * k, dotGap: PRICE.dotGap * k,
      centerX: box.dataset.pcx != null ? parseFloat(box.dataset.pcx) : PRICE.centerX,
      baseline: box.dataset.pbase != null ? parseFloat(box.dataset.pbase) : PRICE.baseline,
    };
    // Cent-Darstellung je Vorlage (Größe, Höhe, Abstände) – Standard wie am A5-Original gemessen
    const num = (k, def) => (box.dataset[k] != null && box.dataset[k] !== '' ? parseFloat(box.dataset[k]) : def);
    const C = { scale: num('pcs', 0.66), dy: num('pcy', 0), x: num('pcx0', CENT_X), space: num('pcsp', CENT_SPACE), dot: num('pdx', DOT_X), dotY: num('pdy', 0) };

    const svg = el('svg', { viewBox: `0 0 ${bw} ${bh}`, width: '100%', height: '100%', overflow: 'visible' });
    const defs = el('defs');
    const filt = el('filter', { id: 'ptShadow' + Math.random().toString(36).slice(2), x: '-20%', y: '-20%', width: '140%', height: '150%' });
    filt.appendChild(el('feDropShadow', { dx: (0.55 * k).toFixed(3), dy: (0.75 * k).toFixed(3), stdDeviation: (0.75 * k).toFixed(3), 'flood-color': '#000', 'flood-opacity': '0.38' }));
    defs.appendChild(filt);
    svg.appendChild(defs);
    const g = el('g', { filter: `url(#${filt.getAttribute('id')})` });
    svg.appendChild(g);
    box.appendChild(svg);

    // Ziffern aus der nachgezeichneten Vorlage (public/js/price-glyphs.js).
    // Schrittweiten wie im Vorlagenbild; Cents = 0,66 × Ziffernhöhe, oben bündig, Punkt darunter.
    const GL = window.PT_PRICE_GLYPHS;
    const items = [];
    const cap = P.font * 0.694;           // Ziffernhöhe in mm
    const S = cap / GL.cap;               // mm pro Glyphen-Einheit
    let cursor = 0;
    for (const ch of String(euros)) {
      const gl = GL.g[ch];
      items.push({ d: gl.d, x: cursor, y: 0, s: S });
      cursor += gl.adv * S;
    }
    const capH = cap;
    if (cents === 0) {
      // ".-" genau wie in der Vorlage: Punkt unten, Strich darüber
      items.push({ d: GL.dot.d, x: cursor, y: 0, s: S });
      items.push({ d: GL.dash.d, x: cursor + GL.dash.dx * S, y: 0, s: S });
    } else {
      // Punkt unten, Cents (0,66 × Ziffernhöhe) oben bündig darüber
      items.push({ d: GL.dot.d, x: cursor + C.dot * cap, y: C.dotY * cap, s: S });
      const cs = S * C.scale;
      let cx = cursor + C.x * cap;
      for (const ch of String(cents).padStart(2, '0')) {
        const gl = GL.g[ch];
        items.push({ d: gl.d, x: cx, y: -cap + GL.cap * cs + C.dy * cap, s: cs });
        cx += gl.adv * cs * C.space;
      }
    }

    const inner = el('g');
    g.appendChild(inner);
    const strokeU = P.stroke / S; // gleiche Konturstärke in Glyphen-Einheiten (Cents dadurch etwas dünner, wie im Original)
    for (const it of items) {
      const tr = `translate(${it.x.toFixed(3)} ${it.y.toFixed(3)}) scale(${it.s.toFixed(5)})`;
      inner.appendChild(el('path', { d: it.d, transform: tr, fill: '#fff', 'fill-rule': 'evenodd', stroke: '#fff', 'stroke-width': strokeU.toFixed(1), 'stroke-linejoin': 'round' }));
      inner.appendChild(el('path', { d: it.d, transform: tr, fill: P.blue, 'fill-rule': 'evenodd' }));
    }
    // Modus "füllen" (z. B. Blister): Preis so groß wie der freie Platz erlaubt – wie im Original.
    // ptop = Oberkante der großen Ziffern, pbase = Grundlinie, pmaxw = maximale Breite (alles mm im Feld)
    if (box.dataset.pfill === '1') {
      const bb0 = inner.getBBox();
      const top = num('ptop', 0), maxW = num('pmaxw', bw);
      const s = Math.max(0.2, Math.min((P.baseline - top) / capH, maxW / bb0.width));
      let left = P.centerX - (bb0.width * s) / 2;
      left = Math.max((bw - maxW) / 2, Math.min(left, bw - (bw - maxW) / 2 - bb0.width * s));
      inner.setAttribute('transform', `translate(${(left - bb0.x * s).toFixed(3)} ${P.baseline.toFixed(3)}) scale(${s.toFixed(4)})`);
      return;
    }
    // Position: Mitte wie im Original, bei Bedarf verkleinern, damit es ins Feld passt
    const bb = inner.getBBox();
    const pad = P.stroke / 2 + 0.8;
    const width = bb.width + pad * 2;
    const height = capH + pad * 2; // Ziffernhöhe zählt, nicht die Schrift-Metrik
    const scale = Math.min(1, (bw) / width, (bh) / height);
    let left = P.centerX - (bb.width * scale) / 2;
    left = Math.max(pad * scale, Math.min(left, bw - bb.width * scale - pad * scale));
    const baseY = P.baseline + (1 - scale) * capH * 0.5;
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
    // Ausgangsgröße merken (manche Vorlagen setzen sie inline), dann von dort aus verkleinern
    if (box.dataset.fs == null) box.dataset.fs = box.style.fontSize || '';
    box.style.fontSize = box.dataset.fs;
    const base = parseFloat(getComputedStyle(box).fontSize);
    let size = base;
    let guard = 0;
    while (box.scrollHeight > box.clientHeight + 0.5 && size > base * 0.45 && guard++ < 80) {
      size *= 0.97;
      box.style.fontSize = size + 'px';
    }
  }

  // Eigenschaften der PDF-Vorlagen: höchstens auf 75 % verkleinern, danach – wie im bisherigen System –
  // die hinteren Punkte weglassen, statt alles unlesbar klein zu machen
  function fitBullets(box) {
    if (box.dataset.fs == null) box.dataset.fs = box.style.fontSize || '';
    box.style.fontSize = box.dataset.fs;
    const lis = [...box.querySelectorAll('li')];
    lis.forEach((li) => { li.style.display = ''; });
    const base = parseFloat(getComputedStyle(box).fontSize);
    let size = base;
    let guard = 0;
    while (box.scrollHeight > box.clientHeight + 0.5 && size > base * 0.75 && guard++ < 40) {
      size *= 0.97;
      box.style.fontSize = size + 'px';
    }
    for (let n = lis.length - 1; n > 0 && box.scrollHeight > box.clientHeight + 0.5; n--) lis[n].style.display = 'none';
  }

  // Ziffernhöhe der UVP-Schrift im Verhältnis zur Schriftgröße (einmal im Browser gemessen)
  let uvpCapRatio = null;
  function measureUvpCap() {
    if (uvpCapRatio) return uvpCapRatio;
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.font = 'italic 900 100px "PT Price"';
      const m = c.measureText('0');
      if (m.actualBoundingBoxAscent > 30) uvpCapRatio = m.actualBoundingBoxAscent / 100;
    } catch (_) { /* Rückfall unten */ }
    return uvpCapRatio || 0.72;
  }

  // Zahlen in der UVP-Box mit denselben nachgezeichneten Ziffern wie der große Preis zeichnen
  // (die Schrift hat z. B. eine andere "4"). Buchstaben, Komma, Strich und % bleiben aus der Schrift.
  function glyphUvpText(t, maxW) {
    const GL = window.PT_PRICE_GLYPHS;
    const parent = t.parentNode;
    const old = parent.querySelector(`[data-glyph-for="${t.dataset.gid}"]`);
    if (old) old.remove();
    t.style.display = '';
    const txt = t.textContent;
    if (!GL || !/\d/.test(txt)) return false;
    if (!t.dataset.gid) t.dataset.gid = Math.random().toString(36).slice(2);
    const cs = getComputedStyle(t);
    const size = parseFloat(t.getAttribute('font-size')) || parseFloat(cs.fontSize);
    const S = (size * measureUvpCap()) / GL.cap;
    const g = el('g', { 'data-glyph-for': t.dataset.gid });
    parent.appendChild(g);
    const inner = el('g');
    g.appendChild(inner);
    const fill = t.getAttribute('fill') || cs.fill;
    let x = 0;
    for (const ch of txt) {
      const gl = /\d/.test(ch) && GL.g[ch];
      if (gl) {
        inner.appendChild(el('path', { d: gl.d, transform: `translate(${x.toFixed(3)} 0) scale(${S.toFixed(5)})`, fill, 'fill-rule': 'evenodd' }));
        x += gl.adv * S;
      } else {
        const c = t.cloneNode(false);
        ['x', 'y', 'text-anchor', 'textLength', 'lengthAdjust', 'data-gid'].forEach((a) => c.removeAttribute(a));
        c.style.display = '';
        c.setAttribute('x', x.toFixed(3));
        c.setAttribute('y', '0');
        c.setAttribute('text-anchor', 'start');
        c.textContent = ch;
        inner.appendChild(c);
        x += c.getComputedTextLength();
      }
    }
    const cx = parseFloat(t.getAttribute('x')) || 0;
    const base = parseFloat(t.getAttribute('y')) || 0;
    const sx = x > maxW ? maxW / x : 1;
    g.setAttribute('transform', `translate(${(cx - (x * sx) / 2).toFixed(3)} ${base}) scale(${sx.toFixed(4)} 1)`);
    t.style.display = 'none';
    return true;
  }

  function fitUvp(box) {
    box.querySelectorAll('.pt-uvp-t text').forEach((t) => {
      if (t.closest('[data-glyph-for]')) return;
      const maxW = parseFloat(t.parentNode.getAttribute('data-maxw')) || UVPT.maxW;
      t.removeAttribute('textLength');
      t.removeAttribute('lengthAdjust');
      if (glyphUvpText(t, maxW)) return;
      if (t.getComputedTextLength() > maxW) {
        t.setAttribute('textLength', maxW);
        t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  }

  // Preis im Modus "füllen": Oberkante = letzte Grundlinie des Namens + Abstand (wie im Original)
  function priceTopFromName(root) {
    root.querySelectorAll('.pt-price[data-ptop-from]').forEach((box) => {
      const pt = box.closest('.pt');
      const src = pt && pt.querySelector(`[data-field="${box.dataset.ptopFrom}"]`);
      if (!pt || !src) return;
      const W = parseFloat(pt.style.width);
      const pr = pt.getBoundingClientRect();
      const mmPerPx = W / pr.width;
      const cs = getComputedStyle(src);
      const zoom = pr.width / pt.offsetWidth || 1;
      const fs = (parseFloat(cs.fontSize) || 0) * zoom * mmPerPx; // mm
      const lh = (parseFloat(cs.lineHeight) || fs / zoom / mmPerPx) * zoom * mmPerPx; // mm
      let lastBase = null;
      if (src.textContent.trim()) {
        // Zeilen zählen, Grundlinie: Oberkante + halber Zeilenabstand + 0,34 × Schriftgröße (gemessen für die Schrift)
        const range = document.createRange();
        range.selectNodeContents(src);
        const tops = [...new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)))];
        const n = tops.length;
        if (n) lastBase = (src.getBoundingClientRect().top - pr.top) * mmPerPx + (lh - fs) / 2 + 0.84 * fs + (n - 1) * lh;
      }
      if (lastBase == null) lastBase = parseFloat(src.style.top); // kein Name: Preis darf bis unter den Kopf
      const boxTop = parseFloat(box.style.top);
      box.dataset.ptop = (lastBase + parseFloat(box.dataset.pgap || 0) - boxTop).toFixed(3);
    });
  }

  function fitTag(root) {
    root.querySelectorAll('.pt-uvp').forEach(fitUvp);
    root.querySelectorAll('.pt-fit1').forEach(fitOneLine);
    root.querySelectorAll('.pt-fitn').forEach(fitMulti);
    root.querySelectorAll('.pt-fitb').forEach(fitBullets);
    priceTopFromName(root);
    root.querySelectorAll('.pt-price').forEach(buildPrice);
  }

  async function fitAll(root = document) {
    try {
      await Promise.all([
        document.fonts.load('italic 900 100px "PT Price"', '0123456789'),
        document.fonts.load('400 10px "PT Text"'), document.fonts.load('700 10px "PT Text"'),
        document.fonts.load('500 10px "PT Text"'), document.fonts.load('900 10px "PT Text"'), document.fonts.load('400 10px "PT Sans"'),
      ]);
      await document.fonts.ready;
    } catch (_) { /* egal */ }
    await Promise.all([...root.querySelectorAll('.pt img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
    root.querySelectorAll('.pt').forEach(fitTag);
  }

  /* ------------------------------------------------------------------ */
  /* Vorschaubild einer Vorlage (live gerendert mit Beispieldaten)       */
  /* ------------------------------------------------------------------ */
  const SAMPLE = {
    group: 'Gaming Maus',
    name: 'LOG G502 HERO',
    artnr: '17620260134',
    bullets: [
      '11 programmierbare Tasten und ultraschnelles Scrollen',
      'Fünf 3,6-g-Gewichte zum Anpassen von Gewicht und Balance',
      'LIGHTSYNC Technologie für vollständig anpassbare RGB-Beleuchtung',
      'Promptes und klares Klickgefühl mit sofortiger Rückmeldung',
    ],
    price: 27,
    uvp: 69.99,
    showUvp: true,
    qrUrl: 'https://www.expert.de/',
    logoUrl: 'https://cdn.expert.de/33/42/c5/c4f9a549f890b324c462eb28307a9e6f03/Markenlogo_LOGITECH_G.png.png',
  };

  // Zeichnet die Vorlage verkleinert in "box" (maxW x maxH Pixel). Gibt ein Promise zurück.
  function renderThumb(box, templateId, maxW, maxH, data) {
    const T = Templates[templateId];
    if (!T) { box.innerHTML = ''; return Promise.resolve(); }
    const MMPX = 96 / 25.4;
    const s = Math.min(maxW / (T.width * MMPX), maxH / (T.height * MMPX));
    const tag = { template: T.id, data: { ...SAMPLE, ...(T.sample || {}), ...(data || {}) }, layout: {} };
    box.innerHTML = `<div class="pt-thumb" style="width:${(T.width * MMPX * s).toFixed(1)}px;height:${(T.height * MMPX * s).toFixed(1)}px">
      <div style="transform:scale(${s});transform-origin:0 0;width:${T.width}mm;height:${T.height}mm">${T.render(tag)}</div></div>`;
    return fitAll(box);
  }

  window.PT = { Templates, GROUP_ORDER, fitTag, fitAll, savingsPercent, fmtUvp, esc, logoSrcFor, renderThumb };
  window.__fitAll = () => fitAll(document);
})();
