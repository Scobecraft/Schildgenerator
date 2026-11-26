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

1. Artikel hinzufügen: EAN oder Artikelnummer eintippen (eine pro Zeile, Menge z. B. `5099206080263 x3`), eine **Liste aus Excel einfügen** (EAN und Menge in beliebigen Spalten, Überschriften werden übersprungen) oder **scannen**.
2. Schild in der Liste anklicken → Vorschau in der Mitte, Daten rechts ändern.
3. Felder in der Vorschau anklicken und mit der Maus verschieben (oder Pfeiltasten). Größe über den Regler. **Rückgängig/Wiederholen** mit Strg+Z / Strg+Y oder den Pfeil-Knöpfen.
4. **Ganzes Set drucken** → Papier und Rand wählen → **PDF herunterladen**. Die Schilder werden automatisch platzsparend angeordnet (z. B. 2 × A5 auf A4 quer).

### Scannen

- **USB-/Bluetooth-Barcodescanner:** einfach scannen, der Artikel landet direkt im aktuellen Set. Gleicher Artikel nochmal = Menge +1.
- **Kamera** (Knopf „Scannen“): funktioniert am Handy und Laptop, **nur über HTTPS** (oder direkt auf dem Server über localhost).
- **Handy-Ansicht:** Auf dem Smartphone erscheint automatisch eine vereinfachte Ansicht zum Scannen und Mengen festlegen. Am PC das Set unter „Alle Sets“ öffnen – Änderungen werden ab dann alle paar Sekunden abgeglichen.

### Artikelname

Lange Namen werden automatisch gekürzt (Teil vor dem ersten Komma, ohne Klammern). Mit **„Vollständig · 2 Zeilen“** wird stattdessen der volle Name zweizeilig gedruckt; Art.Nr. und Eigenschaften rutschen dann eine Zeile nach unten.

### Preise aktuell halten

- **↻ Preise prüfen** holt Preis, UVP und Bestand aller Schilder im Set neu von expert.de. Eigene Änderungen (Name, Eigenschaften, Positionen) bleiben, jede Preisänderung wird am Schild markiert.
- **Preis-Wächter:** Jedes gedruckte Schild wird 180 Tage lang gemerkt und **täglich ab 6 Uhr** gegen expert.de geprüft. Die Glocke oben zeigt, wie viele Schilder im Laden einen veralteten Preis haben; „Nachdrucken“ legt ein neues Set mit genau diesen Artikeln an. Wer beim Drucken einen eigenen Preis eingetragen hat, wird nur gewarnt, wenn sich der expert-Preis ändert.

### Drucken

- **Rand:** Randlos, 3 mm, 5 mm oder eigener Wert. Die Druckeinstellungen gelten für alle Nutzer (auf dem Server gespeichert).
- **Leicht verkleinern:** Passt mit Rand nicht mehr alles aufs Blatt, werden die Schilder um bis zu 5 % verkleinert (abschaltbar).
- **Drucker-Testseite:** PDF mit 10-cm-Quadrat und Randlinien zum Nachmessen – zeigt, ob der Drucker in Originalgröße druckt und wie nah er an den Rand kommt.

### Gleichzeitig bearbeiten

Mehrere Geräte können dasselbe Set gleichzeitig bearbeiten. Änderungen werden pro Schild zusammengeführt (die neuere gewinnt), gelöschte Schilder bleiben gelöscht.

### Sets

- Alle Schilder landen im **aktuellen Set**. Name = Datum und Uhrzeit beim Anlegen.
- Bei jedem Neuladen der Seite beginnt ein neues Set, ein weiteres jederzeit über **+ Neues Set**.
- **Alle Sets** zeigt die gespeicherten Sets: öffnen, komplett drucken oder löschen.
- Sets liegen auf dem Server (`data/sets`) und gelten für alle Nutzer. Sie werden **48 Stunden nach der letzten Änderung automatisch gelöscht**. Leere Sets werden gar nicht gespeichert.

### Herstellerlogo

Pro Schild umschaltbar zwischen **Original** (Standard) und **Hochskaliert**. Hochskaliert vergrößert kleine Logos und schärft die Kanten. Sehr kleine Details (z. B. ®) können dabei verschwinden.

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

Vorlagen liegen in `public/js/templates.js` (Aufbau) und `public/css/tag.css` (Aussehen). Aktuell:

| Vorlage | Größe | Besonderheiten |
|---|---|---|
| **expert A5 – Klassisch** | 148 × 210 mm | Logo, Warengruppe, Name (auch 2-zeilig), Eigenschaften, UVP-Box, großer Preis, QR-Code |
| **Blister** | 52 × 40 mm | Marke als Schriftzug im orangen Kopf, Name, Preis, Artikelnummer |
| **Preisschiene** | 100 × 39 mm | Herstellerlogo, EAN-Barcode, „expert“ senkrecht, Warengruppe, Name, Preis |
| **Quer Groß** | 105 × 78 mm | Logo, Art.Nr. und Eigenschaften links; Warengruppe, Name, UVP-Box (nebeneinander) und Preis rechts |

`dev/calib-vorlagen.html` legt eine Vorlage zum Abgleich halbtransparent über das Original aus `dev/vorlagen/`.

- **Auswahl mit Vorschau:** „Vorlage für neue Schilder“ öffnet alle Vorlagen als Vorschaubild (live gezeichnet, also immer aktuell).
- **Vorlage wechseln:** im Editor beim ausgewählten Schild. Die Daten bleiben, verschobene Felder werden zurückgesetzt.
- **+ Weitere Vorlage:** legt denselben Artikel zusätzlich in einer anderen Vorlage/Größe an. Beim Drucken werden gemischte Größen automatisch zusammen angeordnet.

Eine neue Vorlage braucht: `id`, `name`, `short` (Kürzel für die Liste, z. B. „A6“), `format`, `width`/`height` in mm, `fields` (verschiebbare Felder) und `render(tag)`. Optional: `description` und `sample` (eigene Beispieldaten für die Vorschau).

Schriften (frei, dem Original am nächsten): Roboto Condensed für Texte, Archivo Black Italic schmal für Preis und UVP-Box.

## Technik

- `server/expert.js` – Abruf von expert.de über einen unsichtbaren Browser (Playwright/Chromium)
- `server/logo.js` – Logos zuschneiden und hochskalieren
- `server/watch.js` – Preis-Wächter (gedruckte Schilder, tägliche Prüfung)
- `server/system.js` – Statusanzeige CPU/RAM/Speicher
- `public/vendor/` – Barcode-Erkennung (barcode-detector + zxing-wasm, MIT)
- `server/server.js` – Webserver, PDF-Erstellung, Logos, QR-Codes
- `Dockerfile`, `docker-compose.yml`, `install.sh` – Installation auf dem Server
- `public/` – die Webseite
- `dev/` – Hilfsdateien zum Abgleich mit der Original-Vorlage
