#!/bin/bash
# Schildgenerator – Installation mit einem Befehl (Debian/Ubuntu, als root):
#   curl -fsSL https://raw.githubusercontent.com/Scobecraft/schildgenerator/main/install.sh | bash
# Erneut ausführen = auf die neueste Version aktualisieren.
set -e
cd "$HOME" 2>/dev/null || cd /   # falls das aktuelle Verzeichnis gelöscht wurde

REPO="https://github.com/Scobecraft/schildgenerator.git"
DIR="${SCHILD_DIR:-$HOME/schildgenerator}"

say() { printf '\n\033[1;38;5;208m▶ %s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root ausführen."
  exit 1
fi

if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  say "Installiere git und curl …"
  apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
fi

if ! command -v docker >/dev/null 2>&1; then
  say "Installiere Docker …"
  curl -fsSL https://get.docker.com | sh
fi

if [ -d "$DIR/.git" ]; then
  say "Hole neueste Version …"
  git -C "$DIR" pull --ff-only
else
  say "Lade Schildgenerator nach $DIR …"
  git clone "$REPO" "$DIR"
fi

cd "$DIR"
[ -f .env ] || cp .env.example .env
mkdir -p data/logos

say "Baue und starte den Container (beim ersten Mal einige Minuten) …"
docker compose up -d --build

say "Warte auf den Start …"
for i in $(seq 1 60); do
  if curl -fs http://127.0.0.1:3000/api/status >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$OK" ]; then
  printf '\n\033[1;32m✅ Schildgenerator läuft!\033[0m\n'
  printf '   Im Browser öffnen:  \033[1mhttp://%s:3000\033[0m\n' "${IP:-SERVER-IP}"
  printf '   Aktualisieren:      dieselbe Installationszeile nochmal ausführen\n'
  printf '   UVP-Suche (optional): API-Key in %s/.env eintragen, dann: cd %s && docker compose up -d\n\n' "$DIR" "$DIR"
else
  printf '\n\033[1;31mDer Schildgenerator antwortet nicht.\033[0m Fehlermeldungen anzeigen mit:\n   cd %s && docker compose logs --tail 50\n\n' "$DIR"
  exit 1
fi
