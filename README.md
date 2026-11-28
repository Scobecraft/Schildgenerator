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
- **Angebot:** Im Editor unter „Preis“ den Haken **Angebot** setzen und den **Originalpreis** eintragen (vorgeschlagen wird der Statt-Preis von expert.de, falls vorhanden, sonst der bisherige Preis – dann oben den Angebotspreis eintragen). Auf dem Schild steht der Originalpreis kleiner, rot durchgestrichen links neben dem Angebotspreis – in allen Vorlagen. Angezeigt wird er nur, wenn er höher ist als der Angebotspreis.
- **Preis-Wächter:** Jedes gedruckte Schild wird 180 Tage lang gemerkt und **täglich ab 6 Uhr** gegen expert.de geprüft. Die Glocke oben zeigt, wie viele Schilder im Laden einen veralteten Preis haben; „Nachdrucken“ legt ein neues Set mit genau diesen Artikeln an. Wer beim Drucken einen eigenen Preis eingetragen hat, wird nur gewarnt, wenn sich der expert-Preis ändert.

### Drucken

- **Rand:** Randlos, 3 mm, 5 mm oder eigener Wert. Die Druckeinstellungen gelten für alle Nutzer (auf dem Server gespeichert).
- **Leicht verkleinern:** Passt mit Rand nicht mehr alles aufs Blatt, werden die Schilder um bis zu 5 % verkleinert (abschaltbar).
- **Drucker-Testseite:** PDF mit 10-cm-Quadrat und Randlinien zum Nachmessen – zeigt, ob der Drucker in Originalgröße druckt und wie nah er an den Rand kommt.

### Gleichzeitig bearbeiten

Mehrere Geräte können dasselbe Set gleichzeitig bearbeiten. Änderungen werden pro Schild zusammengeführt (die neuere gewinnt), gelöschte Schilder bleiben gelöscht.

### Sets

- Alle Schilder landen im **aktuellen Set**. Name = Datum und Uhrzeit beim Anlegen.
- Sets gehören zum **Konto**: Jedes Gerät, auf dem du angemeldet bist (Handy, PC …), zeigt dasselbe aktuelle Set – auf dem Handy gescannt, am PC sofort da. Öffnet oder beginnt ein Gerät ein anderes Set (**+ Neues Set**), folgen die anderen Geräte innerhalb weniger Sekunden. Andere Konten sehen deine Sets nicht.
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

## Anmeldung

Die Seite ist nur mit **Benutzername und Passwort** nutzbar.

- **Erster Aufruf:** Gibt es noch kein Konto, zeigt die Anmeldeseite „Erstes Konto anlegen“. Dieses Konto ist Administrator.
  Direkt aus dem eigenen Netz geht das ohne Weiteres. Kommt der Aufruf über einen Proxy/das Internet (z. B. Cloudflare),
  wird zusätzlich ein **Einrichtungscode** verlangt. Er steht im Server-Protokoll: `docker compose logs schildgenerator`.
- Ist `data/users.json` beschädigt, ist die Anmeldung komplett gesperrt (es kann dann auch kein neues Admin-Konto angelegt werden).
- **Konto-Knopf** oben rechts: abmelden, eigenes Passwort ändern. Administratoren legen dort weitere Benutzer an, setzen Passwörter, vergeben Admin-Rechte und löschen Benutzer.
- Angemeldet bleibt man 30 Tage (verlängert sich bei Nutzung). Nach einer Passwortänderung sind alle anderen Geräte dieses Kontos abgemeldet.
- Schutz gegen Durchprobieren: 15 Minuten Sperre nach 8 falschen Passwörtern für einen Benutzernamen (bzw. 30 von einer Adresse).
- Passwörter werden nur als scrypt-Hash gespeichert (`data/users.json`), Sitzungen in `data/sessions.json` (nur Hashes der Sitzungsschlüssel).
- Weitere Schutzmaßnahmen: Pfad-Tricks (`..`, kodierte Zeichen) werden abgewiesen, Änderungen nur von der eigenen Seite (Origin-Prüfung),
  kein Einbetten in fremde Seiten, keine internen Fehlerdetails nach außen, große Anfragen erst nach der Anmeldung.

**Passwort vergessen?** Auf dem Server im Ordner `~/schildgenerator`:

```bash
docker compose exec schildgenerator node server/users.js list
docker compose exec schildgenerator node server/users.js passwd <name> <neues-passwort>
```

Weitere Befehle: `add <name> <passwort> [admin]`, `del <name>`, `admin <name> ja|nein`.

## Vorlagen

Vorlagen liegen in `public/js/templates.js` (Aufbau) und `public/css/tag.css` (Aussehen). Aktuell:

| Vorlage | Größe | Besonderheiten |
|---|---|---|
| **expert A5 – Klassisch** | 148 × 210 mm | Logo, Warengruppe, Name (auch 2-zeilig), Eigenschaften, UVP-Box, großer Preis, QR-Code |
| **Blister** | 52 × 40 mm | Marke als Schriftzug im orangen Kopf, Name, Preis, Artikelnummer |
| **Preisschiene** | 100 × 39 mm | Herstellerlogo, EAN-Barcode, „expert“ senkrecht, Warengruppe, Name, Preis |
| **Quer Groß** | 105 × 78 mm | Logo, Art.Nr. und Eigenschaften links; Warengruppe, Name, UVP-Box (nebeneinander) und Preis rechts |

### Vorlagen aus dem bisherigen Schild-System

20 weitere Vorlagen stammen aus dem PDF des bisherigen Systems. Name = **Format · Kopf**, Kürzel = Format + Kopf-Buchstabe:

| Format | Größe (mm) | Köpfe |
|---|---|---|
| A4 hoch (`A4h`) | 199 × 286,8 | expert, Werbung |
| A4 quer (`A4q`) | 287 × 199 | expert, Werbung |
| A5 hoch (`A5h`) | 148,5 × 210,7 | expert, Werbung |
| A5 quer (`A5q`) | 210 × 148 | expert, Werbung, Preishammer, B-Ware |
| Mittel hoch (`Mh`) | 115 × 152 | expert, Werbung, Preishammer, Preishammer Bild |
| A6 hoch (`A6h`) | 105 × 148 | expert, Werbung |
| A7 quer (`A7q`) | 105 × 77 | expert, Werbung, Preishammer, Preishammer Bild |

Kopf-Kürzel: **E** = expert, **W** = „Aus unserer Werbung“, **PH** = Preishammer, **PB** = Preishammer mit Bild, **B** = B-Ware – z. B. „A5q-W“. IDs: `a5q-werbung`, `m-preishammer-bild` …
In der Vorlagen-Auswahl sind alle Vorlagen nach Format gruppiert.

Erzeugt werden sie mit `dev/pdf-vorlagen/gen.py` (siehe README dort): Positionen, Grundlinien, Schriftgrößen und Farben werden aus dem PDF gelesen (`public/js/tpl-specs.js`), der feste Teil (Kopf, Balken, Farbverläufe, Grafiken) wird als Hintergrund gespeichert (`public/tpl/`). Die Originalschriften des PDFs werden **nicht** übernommen (lizenzpflichtig) – Text im Hintergrund ist in Pfade umgewandelt, veränderliche Texte nutzen freie Ersatzschriften (Roboto / Roboto Condensed).

`dev/calib-vorlagen.html` legt eine Vorlage zum Abgleich halbtransparent über das Original aus `dev/vorlagen/`.

- **Auswahl mit Vorschau:** „Vorlage für neue Schilder“ öffnet alle Vorlagen als Vorschaubild (live gezeichnet, also immer aktuell).
- **Vorlage wechseln:** im Editor beim ausgewählten Schild. Die Daten bleiben, verschobene Felder werden zurückgesetzt.
- **+ Weitere Vorlage:** legt denselben Artikel zusätzlich in einer anderen Vorlage/Größe an. Beim Drucken werden gemischte Größen automatisch zusammen angeordnet.

Eine neue Vorlage braucht: `id`, `name`, `short` (Kürzel für die Liste, z. B. „A6“), `format`, `width`/`height` in mm, `fields` (verschiebbare Felder) und `render(tag)`. Optional: `description` und `sample` (eigene Beispieldaten für die Vorschau).

Schriften: Roboto Condensed für Texte (frei, dem Original am nächsten), Archivo Black Italic schmal für die UVP-Box.
**Preis-Ziffern** sind aus der Vorlage `dev/ziffern-vorlage.png` nachgezeichnet (`public/js/price-glyphs.js`, Werkzeuge in `dev/ziffern/`) und sehen dadurch genau wie auf den Original-Schildern aus.

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
