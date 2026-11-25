# Schildgenerator

Webseite zum Erstellen von Preisschildern für **expert Asbach**.
EAN oder Artikelnummer eingeben → Preis, Warengruppe, Artikelname, Eigenschaften, Herstellerlogo und QR-Code kommen automatisch von expert.de → anpassen → als PDF drucken.

## Auf einem Server hosten

Schritt-für-Schritt-Anleitung für Ubuntu/Debian mit nginx, HTTPS und Passwortschutz: [deploy/ANLEITUNG-SERVER.md](deploy/ANLEITUNG-SERVER.md)

## Lokal starten (zum Ausprobieren)

Voraussetzung: **Node.js** (LTS-Version von https://nodejs.org) ist installiert.

- **Windows:** Doppelklick auf `Start-Windows.bat`
- **Mac:** Rechtsklick auf `Start-Mac.command` → Öffnen

Beim ersten Start werden die nötigen Programme installiert (einige Minuten, Internet nötig). Danach öffnet sich die Seite im Browser unter http://localhost:3000. Das Fenster mit dem Server offen lassen, solange die Seite benutzt wird.

### Automatische UVP-Suche (optional)

Die Datei `.env.example` als `.env` kopieren und einen Anthropic-API-Key eintragen (`ANTHROPIC_API_KEY=...`). Danach neu starten. Ohne Key wird die UVP von Hand eingetragen, alles andere funktioniert.

## Bedienung

1. Links EAN oder Artikelnummern eingeben (eine pro Zeile, Menge z. B. `5099206080263 x3`) → **Abrufen**.
2. Schild in der Liste anklicken → Vorschau in der Mitte, Daten rechts ändern.
3. Felder in der Vorschau anklicken und mit der Maus verschieben (oder Pfeiltasten). Größe über den Regler.
4. **Drucken** → Papier und Ränder wählen → **PDF herunterladen**. Die Schilder werden automatisch platzsparend angeordnet (z. B. 2 × A5 auf A4 quer).

Die Liste bleibt im Browser gespeichert.

## Woher die Daten kommen

| Angabe | Quelle |
|---|---|
| Preis | Nur expert.de, Markt Asbach. Das Tool wählt den Markt über `expert.de/markt/asbach`, prüft die Markt-ID (`e_14756046`) und vergleicht mit dem angezeigten Preis. Sonst Abbruch mit Fehlermeldung. |
| Warengruppe, Name, Art.Nr., Eigenschaften | expert.de-Produktseite |
| Herstellerlogo | Logo-Bibliothek (eigene hochauflösende PNGs) oder sonst das Logo von expert.de (klein, für Druck eher unscharf) |
| UVP | Websuche (Herstellerseiten, Fachpresse), mit Quellen. Immer als „bitte prüfen“ markiert, bis bestätigt. |
| Ersparnis | (UVP − Preis) / UVP, abgerundet |
| QR-Code | expert.de-Produktseite mit Markt Asbach |

## Vorlagen

Vorlagen liegen in `public/js/templates.js` (Aufbau) und `public/css/tag.css` (Aussehen). Aktuell: **expert A5 – Klassisch**. Weitere Formate und Designs werden dort ergänzt und sind dann in der Auswahl verfügbar.

Schriften (frei, dem Original am nächsten): Roboto Condensed für Texte, Archivo Black Italic schmal für Preis und UVP-Box.

## Technik

- `server/expert.js` – Abruf von expert.de über einen unsichtbaren Browser (Playwright/Chromium)
- `server/uvp.js` – UVP-Recherche über Claude mit Websuche
- `server/server.js` – Webserver, PDF-Erstellung, Logos, QR-Codes
- `public/` – die Webseite
- `dev/` – Hilfsdateien zum Abgleich mit der Original-Vorlage
