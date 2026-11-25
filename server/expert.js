// Holt Produktdaten und den Marktpreis von expert.de – ausschließlich für den Markt Asbach.
//
// Ablauf (wie ein normaler Besucher im Browser):
//  1. https://www.expert.de/markt/asbach öffnen  -> expert setzt den Markt "Asbach" (Cookie fmarktcookie)
//  2. https://www.expert.de/suche?q=<EAN oder Artikelnummer> öffnen -> expert leitet direkt zum Produkt
//  3. Den Preis, den die Seite für den Markt lädt, mitlesen und prüfen, dass er wirklich zu Asbach gehört
//  4. Produktdaten (Warengruppe, Name, Web-Code, Eigenschaften, Herstellerlogo) aus den Seitendaten lesen

const { chromium } = require('playwright');

const STORE_URL = 'https://www.expert.de/markt/asbach';
const STORE_ID = 'e_14756046'; // expert klein Asbach (von expert.de beim Öffnen der Marktseite gesetzt)
const SEARCH_URL = 'https://www.expert.de/suche?q=';

let browserPromise = null;
let contextPromise = null;
let queue = Promise.resolve();

// Startet Chromium bei Bedarf. Stürzt der Browser ab oder wird er geschlossen,
// wird beim nächsten Aufruf automatisch ein neuer gestartet.
function launchBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch().then((browser) => {
      browser.on('disconnected', () => { browserPromise = null; contextPromise = null; });
      return browser;
    }).catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

async function getContext() {
  await launchBrowser();
  if (!contextPromise) {
    contextPromise = (async () => {
      const browser = await browserPromise;
      const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
      ctx.on('close', () => { contextPromise = null; });
      // Bilder/Fonts/Media brauchen wir für die Datenabfrage nicht -> schneller
      await ctx.route('**/*', (route) => {
        const t = route.request().resourceType();
        if (t === 'image' || t === 'media' || t === 'font') return route.abort();
        return route.continue();
      });
      const page = await ctx.newPage();
      await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.close();
      return ctx;
    })().catch((e) => { contextPromise = null; throw e; });
  }
  return contextPromise;
}

async function ensureStoreCookie(ctx) {
  const cookies = await ctx.cookies('https://www.expert.de');
  const c = cookies.find((x) => x.name === 'fmarktcookie');
  if (!c || c.value !== STORE_ID) {
    const page = await ctx.newPage();
    try { await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
    finally { await page.close(); }
    const again = (await ctx.cookies('https://www.expert.de')).find((x) => x.name === 'fmarktcookie');
    if (!again || again.value !== STORE_ID) {
      throw new Error('Markt Asbach konnte auf expert.de nicht ausgewählt werden.');
    }
  }
}

// Wird im Browser ausgeführt: liest die Nuxt-Seitendaten (devalue-Format) aus.
function extractInPage() {
  const el = document.getElementById('__NUXT_DATA__');
  if (!el) return null;
  const d = JSON.parse(el.textContent);
  const cache = new Map();
  const WRAP = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef']);
  function rev(i) {
    if (cache.has(i)) return cache.get(i);
    const v = d[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string' && WRAP.has(v[0])) { const r = v.length > 1 ? rev(v[1]) : null; cache.set(i, r); return r; }
      if (typeof v[0] === 'string' && ['Set', 'Map', 'Date', 'null', 'undefined', 'NaN', 'BigInt'].includes(v[0])) { cache.set(i, null); return null; }
      const out = []; cache.set(i, out);
      for (const x of v) out.push(typeof x === 'number' ? rev(x) : x);
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {}; cache.set(i, out);
      for (const [k, x] of Object.entries(v)) out[k] = (typeof x === 'number' && x >= 0) ? rev(x) : x;
      return out;
    }
    cache.set(i, v); return v;
  }
  const root = rev(0);
  const data = (root && root.data) || {};
  const key = Object.keys(data).find((k) => k.startsWith('articlepds:'));
  if (!key) return { notProduct: true };
  const pds = data[key];
  const a = pds.article || {};
  const brandKey = Object.keys(data).find((k) => k.startsWith('brand/id='));
  const brandFull = brandKey ? data[brandKey] : null;
  const logo = brandFull && brandFull.logo && typeof brandFull.logo === 'object' ? brandFull.logo : null;
  const domLogo = [...document.querySelectorAll('img')].map((i) => i.getAttribute('src') || '')
    .find((s) => /Markenlogo|brandlogo|marken/i.test(s)) || null;
  const domPrice = (document.querySelector('.price') || {}).innerText || '';
  const headline = (document.querySelector('h1') || {}).innerText || '';
  return {
    webcode: a.webcode,
    ean: a.internationalArticleNumber,
    mpn: a.manufacturerPartNumber,
    productType: a.productType,
    name: a.name,
    shortName: a.shortName,
    title: a.title,
    headline: a.headline || headline,
    descriptionList: a.descriptionList || [],
    formerPriceState: a.formerPriceState || null,
    formerBruttoPrice: a.formerBruttoPrice != null ? a.formerBruttoPrice : null,
    slug: a.slug,
    manufacturer: pds.manufacturer ? pds.manufacturer.name : null,
    brandName: (brandFull && brandFull.name) || (pds.brand && pds.brand.name) || null,
    brandLogo: logo ? (logo.originalUrl || logo.url || logo.cdnUrl || null) : null,
    brandLogoRaw: logo,
    domLogo,
    domPrice: domPrice.replace(/\s+/g, ' ').trim(),
  };
}

function findUrlsDeep(obj, out = [], depth = 0) {
  if (!obj || depth > 4) return out;
  if (typeof obj === 'string') { if (/^https?:\/\//.test(obj)) out.push(obj); return out; }
  if (typeof obj === 'object') for (const v of Object.values(obj)) findUrlsDeep(v, out, depth + 1);
  return out;
}

function originalCdnUrl(u) {
  // https://cdn.expert.de/cdn-cgi/image/h=100/33/42/.../Markenlogo_X.png.png -> Original in voller Auflösung
  if (!u) return u;
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('/')) u = 'https://cdn.expert.de' + u;
  return u.replace(/\/cdn-cgi\/image\/[^/]+\//, '/');
}

// "444.- inkl. MwSt." / "46.99 inkl. MwSt." / "1.299.- inkl. MwSt." -> Zahl
function parseShownPrice(text) {
  const m = String(text).match(/(\d[\d.]*?)\.(\d{2}|-)\s*inkl\.?\s*MwSt/i);
  if (!m) return null;
  const euros = m[1].replace(/\./g, '');
  return { value: parseFloat(euros + '.' + (m[2] === '-' ? '00' : m[2])), text: m[0].replace(/\s*inkl.*$/i, '') };
}
// "UVP 549€" / "UVP 579.99€" -> Zahl
function parseShownUvp(text) {
  const m = String(text).match(/UVP\s*(\d[\d.]*?)(?:[.,](\d{2}))?\s*€/i);
  if (!m) return null;
  return parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '00'));
}

async function lookupInternal(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Bitte EAN oder Artikelnummer eingeben.');
  const ctx = await getContext();
  await ensureStoreCookie(ctx);
  const page = await ctx.newPage();
  // Alle Preis-Antworten sammeln (die Seite lädt evtl. auch Preise für Zubehör/Bundles)
  const prices = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/pricepds')) {
      try { prices.push({ url: r.url(), json: await r.json() }); } catch (_) { /* ignorieren */ }
    }
  });
  const priceFor = (webcode) => prices.find((x) => {
    const u = new URL(x.url);
    return u.searchParams.get('webcode') === webcode && u.searchParams.get('storeId') === STORE_ID &&
      x.json && x.json.store === STORE_ID && String(x.json.webcode) === webcode;
  });
  try {
    await page.goto(SEARCH_URL + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 60000 });
    let url = page.url();

    // Kein direkter Treffer -> Suchergebnisliste. Nur bei genau einem Treffer weitermachen.
    if (!/\/shop\/unsere-produkte\//.test(url)) {
      await page.waitForTimeout(2500);
      const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/shop/unsere-produkte/"]')]
        .map((a) => a.href.split('?')[0]).filter((h) => /\/\d{8,}-[^/]+\.html$/.test(h)))]);
      if (links.length === 1) {
        await page.goto(links[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
        url = page.url();
      } else if (links.length === 0) {
        throw new Error(`Kein Produkt für „${q}“ auf expert.de gefunden.`);
      } else {
        throw new Error(`„${q}“ ist nicht eindeutig (${links.length} Treffer auf expert.de). Bitte EAN oder Web-Code verwenden.`);
      }
    }

    const info = await page.evaluate(extractInPage);
    if (!info || info.notProduct) throw new Error(`Kein Produkt für „${q}“ auf expert.de gefunden.`);

    // Auf den Marktpreis warten (wird von der Seite separat für den gewählten Markt geladen)
    const webcode = String(info.webcode);
    const deadline = Date.now() + 25000;
    while (!priceFor(webcode) && Date.now() < deadline) await page.waitForTimeout(250);
    const hit = priceFor(webcode);
    if (!hit) {
      const other = prices.find((x) => x.url.includes('webcode=' + webcode));
      throw new Error(other
        ? 'Der von expert.de geladene Preis gehört nicht zum Markt Asbach – abgebrochen.'
        : 'Preis für Markt Asbach konnte nicht geladen werden.');
    }
    const priceJson = hit.json;
    const p = priceJson.price || {};
    const promo = priceJson.promotionPrice || {};
    const price = typeof promo.currentPrice === 'number' ? promo.currentPrice : p.bruttoPrice;
    if (typeof price !== 'number' || !(price > 0)) throw new Error('Für dieses Produkt ist im Markt Asbach kein Preis hinterlegt.');

    // Gegenprobe mit dem sichtbaren Preis auf der Seite (die Zahl direkt vor "inkl. MwSt.")
    await page.waitForFunction(() => /inkl\.?\s*MwSt/i.test((document.querySelector('.price') || {}).innerText || ''), null, { timeout: 8000 }).catch(() => {});
    const domPrice = await page.evaluate(() => ((document.querySelector('.price') || {}).innerText || '').replace(/\s+/g, ' ').trim());
    const shown = parseShownPrice(domPrice);
    const warnings = [];
    if (shown === null) {
      warnings.push('Der Preis auf der expert-Seite konnte nicht gegengeprüft werden. Bitte Preis kontrollieren.');
    } else if (Math.abs(shown.value - price) > 0.005) {
      warnings.push(`Preis-Abweichung: Seite zeigt ${shown.text}, Marktdaten ${price.toFixed(2)} €. Bitte prüfen.`);
    }

    // UVP: nur wenn expert selbst eine Hersteller-UVP hinterlegt hat und sie auch anzeigt
    // (gleiche Regel wie expert.de: Kennzeichen "uvp" + UVP-Betrag höher als der Preis)
    let expertUvp = null;
    const fbp = Number(info.formerBruttoPrice);
    if (/^uvp$/i.test(String(info.formerPriceState || '').trim()) && fbp > price) {
      expertUvp = Math.round(fbp * 100) / 100;
      const shownUvp = parseShownUvp(domPrice);
      if (shownUvp !== null && Math.abs(shownUvp - expertUvp) > 0.005) {
        warnings.push(`UVP-Abweichung: Seite zeigt UVP ${shownUvp} €, Daten ${expertUvp} €. Bitte prüfen.`);
      }
    }

    const canonical = url.split('?')[0];
    let logo = originalCdnUrl(info.brandLogo || info.domLogo);
    if (!logo && info.brandLogoRaw) {
      logo = originalCdnUrl(findUrlsDeep(info.brandLogoRaw).find((u) => /\.(png|svg|jpe?g|webp)/i.test(u)) || null);
    }

    return {
      query: q,
      source: 'expert.de – Markt Asbach',
      fetchedAt: new Date().toISOString(),
      productUrl: canonical,
      qrUrl: canonical + '?branch_id=' + STORE_ID,
      webcode: info.webcode,
      ean: info.ean,
      mpn: info.mpn,
      group: info.productType || '',
      name: info.shortName || info.title || info.name || '',
      fullName: info.headline || info.name || '',
      bullets: (info.descriptionList || []).filter(Boolean),
      manufacturer: info.manufacturer,
      brand: info.brandName,
      logoUrl: logo || null,
      price,
      priceInfo: {
        storeId: priceJson.store,
        storeStock: p.storeStock,
        storeAvailability: p.storeAvailability,
        shownOnPage: shown ? shown.text : null,
      },
      expertUvp,
      warnings,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// Anfragen nacheinander abarbeiten (schont expert.de und hält den Markt-Cookie stabil)
async function lookupWithRetry(query) {
  try {
    return await lookupInternal(query);
  } catch (e) {
    if (/has been closed|Target closed|browser has disconnected/i.test(String(e && e.message))) {
      await closeBrowser();
      return lookupInternal(query);
    }
    throw e;
  }
}

function lookup(query) {
  const run = queue.then(() => lookupWithRetry(query));
  queue = run.catch(() => {});
  return run;
}

async function getBrowser() {
  return launchBrowser();
}

async function closeBrowser() {
  const p = browserPromise;
  browserPromise = null; contextPromise = null;
  if (p) { try { await (await p).close(); } catch (_) { /* egal */ } }
}

module.exports = { lookup, getBrowser, closeBrowser, STORE_ID };
