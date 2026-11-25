# Schildgenerator (Preisschild-Studio)

Webseite zum Erstellen von Preisschildern für **expert Asbach**.
EAN oder Artikelnummer eingeben → Preis, Warengruppe, Artikelname, Eigenschaften und Herstellerlogo werden automatisch von expert.de geholt → Schilder als PDF drucken.

> **Stand: in Arbeit.** Fertig sind der Datenabruf von expert.de, die UVP-Recherche und die A5-Vorlage.
> Noch nicht fertig sind die Bedienoberfläche (Eingabe, Liste, Editor mit Verschieben), die Logo-Bibliothek und die automatische Anordnung mehrerer Schilder auf einem Blatt.

## Was schon funktioniert

| Teil | Datei | Beschreibung |
|---|---|---|
| expert.de-Abruf | `server/expert.js` | Öffnet `expert.de/markt/asbach` (setzt den Markt), sucht die EAN/Artikelnummer und liest den Preis, den expert.de für den Markt Asbach lädt. Bricht ab, wenn der Preis nicht zur Markt-ID `e_14756046` (Asbach) gehört, und gleicht ihn mit dem auf der Seite angezeigten Preis ab. |
| UVP-Recherche | `server/uvp.js` | Sucht die ursprüngliche Hersteller-UVP per Claude mit Websuche (bevorzugt Herstellerseiten und Fachpresse) und liefert die Quellen mit. Braucht `ANTHROPIC_API_KEY`. Ohne Key wird die UVP von Hand eingetragen. |
| A5-Vorlage | `public/js/templates.js`, `public/css/tag.css` | Nachbau des Beispielschilds, Maße in mm aus der Vorlage übernommen. Ersparnis in % = (UVP − Preis) / UVP, abgerundet. Preis mit weißer Kontur und Schatten wie im Original. |
| Server | `server/server.js` | API: `/api/lookup?q=`, `/api/uvp`, `/api/qr?text=`, `/api/img?url=` (Logo immer als PNG, Ränder abgeschnitten), `/api/pdf` (HTML → PDF über Chromium). |

## Schriften

Freie Schriften, die dem Original am nächsten kommen. Sie liegen in `public/fonts/`, damit Vorschau und PDF gleich aussehen.

- Warengruppe, Artikelname, Eigenschaften: **Roboto Condensed** (statt Helvetica Condensed)
- Preis und UVP-Box: **Archivo**, Black Italic, schmal (Breitenachse 62–74 %)

## Starten

```bash
npm run setup
```

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Danach http://localhost:3000 öffnen. Ohne `ANTHROPIC_API_KEY` läuft alles außer der automatischen UVP-Suche.

## Entwicklung

`dev/calib.html` legt das gerenderte Schild halbtransparent über das Original (`dev/vorlage-original.png`), um Positionen abzugleichen. Zum Benutzen beide Dateien nach `public/` kopieren (dann `/calib.html` aufrufen).
