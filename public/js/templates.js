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
    height: 40,
    description: 'Kleines Schild für Blisterware: Marke als Schriftzug, Artikelname, Preis, Artikelnummer.',
    sample: { brand: 'PETER JÄCKEL', group: 'Schutzglas', name: '21736 Glas HD iPh 16 PM', artnr: '15088045452', price: 19.99, uvp: null },
    fields: {
      brand: { label: 'Marke', x: 0.2, y: 0.63, w: 50, h: 8.8 },
      name: { label: 'Artikelname', x: 2.6, y: 12.25, w: 47.5, h: 4.7 },
      price: { label: 'Preis', x: 0, y: 14.5, w: 52, h: 22.5 },
      artnr: { label: 'Artikelnummer', x: 2.3, y: 37.3, w: 30, h: 2.7 },
    },
    render(tag) {
      const d = tag.data || {};
      const pos = makePos(this.fields, tag.layout);
      return `
<div class="pt pt-blister" data-template="blister" style="width:52mm;height:40mm">
  <div class="pt-bl-head"></div>
  <div class="pt-f pt-bl-brand pt-fit1" data-field="brand" style="${pos('brand')}"><span>${esc(d.brand || '')}</span></div>
  <div class="pt-f pt-bl-name pt-fit1" data-field="name" style="${pos('name')}"><span>${esc(d.name)}</span></div>
  <div class="pt-f pt-price" data-field="price" data-price="${d.price > 0 ? Number(d.price).toFixed(2) : ''}" data-pfont="15.1" data-pcx="25.2" data-pbase="19.2" style="${pos('price')}"></div>
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
      items.push({ d: GL.dot.d, x: cursor + DOT_X * cap, y: 0, s: S });
      const cs = S * 0.66;
      let cx = cursor + CENT_X * cap;
      for (const ch of String(cents).padStart(2, '0')) {
        const gl = GL.g[ch];
        items.push({ d: gl.d, x: cx, y: -cap + GL.cap * cs, s: cs });
        cx += gl.adv * cs * CENT_SPACE;
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
      const maxW = parseFloat(t.parentNode.getAttribute('data-maxw')) || UVPT.maxW;
      t.removeAttribute('textLength');
      t.removeAttribute('lengthAdjust');
      if (t.getComputedTextLength() > maxW) {
        t.setAttribute('textLength', maxW);
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
    try {
      await Promise.all([
        document.fonts.load('italic 900 100px "PT Price"', '0123456789'),
        document.fonts.load('400 10px "PT Text"'), document.fonts.load('700 10px "PT Text"'),
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

  window.PT = { Templates, fitTag, fitAll, savingsPercent, fmtUvp, esc, logoSrcFor, renderThumb };
  window.__fitAll = () => fitAll(document);
})();
