@echo off
cd /d "%~dp0"
title Schildgenerator
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist node_modules\express goto install
goto run
:install
echo Erster Start: Programme werden installiert, das dauert ein paar Minuten...
call npm install
if errorlevel 1 goto fail
call npx playwright install chromium
if errorlevel 1 goto fail
:run
start "" http://localhost:3000
node server\server.js
pause
exit /b
:nonode
echo Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren und danach erneut starten.
pause
exit /b
:fail
echo Installation fehlgeschlagen. Bitte Internetverbindung pruefen und erneut starten.
pause
