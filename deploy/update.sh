#!/bin/bash
# Holt die neueste Version aus GitHub und startet den Schildgenerator neu.
# Aufruf auf dem Server als root:  /opt/schildgenerator/deploy/update.sh
set -e
cd /opt/schildgenerator
as_schild() { su -s /bin/bash schild -c "cd /opt/schildgenerator && $1"; }
as_schild "git pull --ff-only"
as_schild "npm install --omit=dev"
as_schild "npx playwright install chromium"
systemctl restart schildgenerator
sleep 2
systemctl --no-pager --lines=5 status schildgenerator
