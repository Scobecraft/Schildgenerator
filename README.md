# Schildgenerator

Webseite zum Erstellen von Preisschildern für **expert Asbach**.
EAN oder Artikelnummer eingeben → Preis, Warengruppe, Artikelname, Eigenschaften, Herstellerlogo und QR-Code kommen automatisch von expert.de → anpassen → als PDF drucken.

## Installation auf dem Server (Docker, ein Befehl)

Auf einem Debian/Ubuntu-Server oder -Container als **root**:

```bash
curl -fsSL https://raw.githubusercontent.com/Scobecraft/schildgenerator/main/install.sh | bash
```

Das Skript installiert bei Bedarf Docker, lädt den Schildgenerator nach `~/schildgenerator` und startet ihn. Danach läuft die Seite unter `http://SERVER-IP:3000` und startet nach einem Neustart automatisch.

- **Aktualisieren:** denselben Befehl nochmal ausführen (oder `cd ~/schildgenerator && git pull && docker compose up -d --build`)
- **Logs:** `cd ~/schildgenerator && docker compose logs --tail 50`
- **Proxmox-LXC:** Für Docker muss beim Container „Nesting“ aktiviert sein.
- Die Seite hat **keinen eigenen Passwortschutz**. Öffentlich nur über Cloudflare Tunnel + Cloudflare Access (oder einen anderen Schutz) freigeben.

## Lokal auf dem PC starten (ohne Docker)

Voraussetzung: **Node.js** (LTS-Version von https://nodejs.org) ist installiert.

- **Windows:** Doppelklick auf `Start-Windows.bat`
- **Mac:** Rechtsklick auf `Start-Mac.command` → Öffnen

Beim ersten Start werden die nötigen Programme installiert. Danach öffnet sich http://localhost:3000.

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
| UVP | Automatisch, wenn auf der expert-Produktseite eine Hersteller-UVP hinterlegt ist (wie dort angezeigt). Sonst von Hand eintragen; der Knopf „UVP bei Google suchen“ hilft dabei. |
| Ersparnis | (UVP − Preis) / UVP, abgerundet |
| QR-Code | expert.de-Produktseite mit Markt Asbach |

## Vorlagen

Vorlagen liegen in `public/js/templates.js` (Aufbau) und `public/css/tag.css` (Aussehen). Aktuell: **expert A5 – Klassisch**. Weitere Formate und Designs werden dort ergänzt und sind dann in der Auswahl verfügbar.

Schriften (frei, dem Original am nächsten): Roboto Condensed für Texte, Archivo Black Italic schmal für Preis und UVP-Box.

## Technik

- `server/expert.js` – Abruf von expert.de über einen unsichtbaren Browser (Playwright/Chromium)
- `server/logo.js` – Logos zuschneiden und hochskalieren
- `server/server.js` – Webserver, PDF-Erstellung, Logos, QR-Codes
- `Dockerfile`, `docker-compose.yml`, `install.sh` – Installation auf dem Server
- `public/` – die Webseite
- `dev/` – Hilfsdateien zum Abgleich mit der Original-Vorlage
