# Schildgenerator auf einem eigenen Server hosten

Diese Anleitung gilt für **Ubuntu 22.04/24.04 oder Debian 12**. Alle Befehle werden als **root** ausgeführt (ohne `sudo`).
Am Ende läuft die Seite unter `https://deine-domain` mit Passwortschutz und startet nach einem Neustart des Servers automatisch.

**Voraussetzungen**
- Server mit mindestens 2 GB RAM (für den unsichtbaren Browser, der expert.de abruft)
- Eine Domain oder Subdomain (z. B. `schilder.deinedomain.de`), deren DNS-A-Eintrag auf die IP des Servers zeigt
- Ports 80 und 443 sind offen

In allen Befehlen `schilder.deinedomain.de` durch deine Domain ersetzen.

---

## 1. Programme installieren

```bash
apt update && apt install -y git curl nginx apache2-utils
```

Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
```

```bash
apt install -y nodejs
```

Prüfen (sollte `v22…` zeigen):

```bash
node -v
```

## 2. Prüfen, ob der Server expert.de erreicht

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.expert.de/markt/asbach
```

Erwartet: `200`. Kommt `403`, blockiert expert.de die IP des Servers. Dann funktioniert der automatische Abruf dort nicht.

## 3. Eigenen Benutzer anlegen und Code holen

```bash
useradd --system --create-home --home-dir /home/schild --shell /usr/sbin/nologin schild
```

```bash
git clone https://github.com/Scobecraft/schildgenerator.git /opt/schildgenerator
```

```bash
chown -R schild:schild /opt/schildgenerator
```

## 4. Abhängigkeiten und Browser installieren

```bash
cd /opt/schildgenerator
```

```bash
su -s /bin/bash schild -c "cd /opt/schildgenerator && npm install --omit=dev"
```

Systembibliotheken für Chromium:

```bash
npx playwright install-deps chromium
```

Chromium selbst für den Benutzer `schild`:

```bash
su -s /bin/bash schild -c "cd /opt/schildgenerator && npx playwright install chromium"
```

## 5. Einstellungen (optional: UVP-Suche)

```bash
cp /opt/schildgenerator/.env.example /opt/schildgenerator/.env && chown schild:schild /opt/schildgenerator/.env
```

```bash
nano /opt/schildgenerator/.env
```

Bei `ANTHROPIC_API_KEY=` den Schlüssel eintragen, wenn die UVP automatisch gesucht werden soll. Speichern mit `Strg+O`, Enter, `Strg+X`.
`PORT` und `HOST` nicht ändern, die setzt der Dienst im nächsten Schritt.

## 6. Als Dienst starten (läuft dauerhaft, startet nach Neustart automatisch)

```bash
cp /opt/schildgenerator/deploy/schildgenerator.service /etc/systemd/system/
```

```bash
systemctl daemon-reload && systemctl enable --now schildgenerator
```

Prüfen:

```bash
curl -s http://127.0.0.1:3000/api/status
```

Erwartet: `{"store":"expert Asbach",…}`. Wenn nicht, die Fehlermeldung so ansehen:

```bash
journalctl -u schildgenerator -n 50 --no-pager
```

## 7. nginx mit Passwortschutz

```bash
cp /opt/schildgenerator/deploy/nginx-schildgenerator.conf /etc/nginx/sites-available/schildgenerator
```

```bash
sed -i 's/schilder.example.de/schilder.deinedomain.de/' /etc/nginx/sites-available/schildgenerator
```

```bash
ln -s /etc/nginx/sites-available/schildgenerator /etc/nginx/sites-enabled/schildgenerator
```

Benutzer und Passwort für die Seite anlegen (fragt nach dem Passwort):

```bash
htpasswd -c /etc/nginx/schildgenerator.htpasswd mitarbeiter
```

Weitere Benutzer später ohne `-c` hinzufügen:

```bash
htpasswd /etc/nginx/schildgenerator.htpasswd zweiter-name
```

Konfiguration prüfen und laden:

```bash
nginx -t && systemctl reload nginx
```

## 8. HTTPS einrichten

```bash
apt install -y certbot python3-certbot-nginx
```

```bash
certbot --nginx -d schilder.deinedomain.de
```

certbot fragt nach einer E-Mail und richtet die automatische Verlängerung selbst ein.

Falls die Firewall `ufw` aktiv ist:

```bash
ufw allow 'Nginx Full'
```

Fertig: `https://schilder.deinedomain.de` öffnen und mit Benutzer und Passwort anmelden.

---

## Updates einspielen

Wenn es eine neue Version im GitHub-Repo gibt:

```bash
/opt/schildgenerator/deploy/update.sh
```

## Gut zu wissen

- **Die Liste der Schilder** wird im Browser des jeweiligen Nutzers gespeichert, nicht auf dem Server. Zwei Kollegen sehen also nicht dieselbe Liste.
- **Hochgeladene Logos** liegen auf dem Server in `/opt/schildgenerator/data/logos` und gelten für alle Nutzer. Diesen Ordner ins Backup aufnehmen.
- **Ohne Domain** kann man Schritt 8 weglassen und die Seite über `http://SERVER-IP` aufrufen. Dafür in der nginx-Datei `server_name _;` eintragen. Passwort und Daten gehen dann aber unverschlüsselt durchs Netz, das nur im internen Netz machen.
- **Logs ansehen:**

```bash
journalctl -u schildgenerator -f
```
