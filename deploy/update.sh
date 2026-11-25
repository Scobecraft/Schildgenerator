#!/bin/bash
# Holt die neueste Version aus GitHub und startet den Schildgenerator neu.
# Aufruf auf dem Server:  sudo /opt/schildgenerator/deploy/update.sh
set -e
cd /opt/schildgenerator
sudo -u schild -H git pull --ff-only
sudo -u schild -H npm install --omit=dev
sudo -u schild -H npx playwright install chromium
systemctl restart schildgenerator
sleep 2
systemctl --no-pager --lines=5 status schildgenerator
