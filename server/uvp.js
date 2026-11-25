// UVP-Recherche im Netz über Claude mit Websuche.
// Benötigt die Umgebungsvariable ANTHROPIC_API_KEY (oder ein per `ant auth login` angemeldetes Profil).
// Ergebnis wird im Tool IMMER als "bitte prüfen" markiert, inkl. Quellen-Links.

const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

const SYSTEM = `Du recherchierst für einen deutschen Elektronikfachmarkt die ursprüngliche UVP (unverbindliche Preisempfehlung des Herstellers in Deutschland, in Euro, inkl. MwSt.) eines Produkts.

Regeln:
- Gesucht ist die UVP, die der Hersteller ursprünglich (zur Markteinführung in Deutschland) genannt hat. Nicht der aktuelle Straßenpreis, nicht der günstigste Händlerpreis.
- Bevorzuge in dieser Reihenfolge: Website/Shop/Pressemitteilung des Herstellers; seriöse Fachmedien mit Launch-Meldungen (z. B. heise, computerbase, golem, chip, pcgameshardware, notebookcheck); große Händler, die ausdrücklich "UVP" des Herstellers ausweisen.
- Achte darauf, dass es exakt dasselbe Modell/dieselbe Variante ist (Modellnummer, Speichergröße, Farbe, Version wie z. B. "HERO").
- Erfinde nichts. Wenn du keine belastbare Quelle findest, gib null zurück.
- Antworte am Ende ausschließlich mit einem JSON-Objekt in einem \`\`\`json Codeblock mit genau diesen Feldern:
  {"uvp": Zahl oder null, "confidence": "hoch" | "mittel" | "niedrig", "sources": [{"url": "...", "title": "...", "quote": "kurzes wörtliches Zitat mit dem Preis"}], "note": "ein Satz auf Deutsch, worauf sich die Angabe stützt"}`;

function extractJson(text) {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = blocks.length ? blocks : [text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (let i = candidates.length - 1; i >= 0; i--) {
    try { return JSON.parse(candidates[i]); } catch (_) { /* nächster */ }
  }
  return null;
}

async function findUvp(product) {
  if (!isConfigured()) {
    return { uvp: null, confidence: null, sources: [], note: 'UVP-Recherche ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt). Bitte UVP manuell eintragen.', unavailable: true };
  }
  const desc = [
    `Hersteller/Marke: ${product.brand || product.manufacturer || '-'}`,
    `Produkt: ${product.fullName || product.name || '-'}`,
    `Kurzname: ${product.name || '-'}`,
    `Warengruppe: ${product.group || '-'}`,
    `EAN: ${product.ean || '-'}`,
    `Hersteller-Artikelnummer (falls bekannt): ${product.mpn || '-'}`,
  ].join('\n');

  const messages = [{ role: 'user', content: `Finde die ursprüngliche Hersteller-UVP in Deutschland für dieses Produkt:\n\n${desc}` }];
  const params = {
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'DE' } }],
    messages,
  };

  let response = null;
  for (let i = 0; i < 5; i++) {
    response = await getClient().beta.messages.create(params);
    if (response.stop_reason !== 'pause_turn') break;
    params.messages = [messages[0], { role: 'assistant', content: response.content }];
  }
  if (response.stop_reason === 'refusal') {
    return { uvp: null, confidence: null, sources: [], note: 'Die Recherche wurde abgelehnt. Bitte UVP manuell eintragen.' };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const json = extractJson(text);
  if (!json) return { uvp: null, confidence: null, sources: [], note: 'Keine auswertbare Antwort erhalten. Bitte UVP manuell eintragen.' };
  const uvp = typeof json.uvp === 'number' && json.uvp > 0 ? Math.round(json.uvp * 100) / 100 : null;
  return {
    uvp,
    confidence: json.confidence || null,
    sources: Array.isArray(json.sources) ? json.sources.slice(0, 5) : [],
    note: json.note || '',
  };
}

module.exports = { findUvp, isConfigured };
