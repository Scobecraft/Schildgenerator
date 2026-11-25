#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren und danach erneut starten."
  read -n 1; exit 1
fi
if [ ! -d node_modules/express ]; then
  echo "Erster Start: Programme werden installiert, das dauert ein paar Minuten..."
  npm install && npx playwright install chromium || { echo "Installation fehlgeschlagen."; read -n 1; exit 1; }
fi
(sleep 2; open http://localhost:3000) &
node server/server.js
