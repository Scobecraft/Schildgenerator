#!/usr/bin/env node
// Benutzer auf der Kommandozeile verwalten – z. B. wenn das Passwort vergessen wurde.
//   docker compose exec schildgenerator node server/users.js list
//   docker compose exec schildgenerator node server/users.js passwd <name> <neues-passwort>
//   docker compose exec schildgenerator node server/users.js add <name> <passwort> [admin]
//   docker compose exec schildgenerator node server/users.js del <name>
//   docker compose exec schildgenerator node server/users.js admin <name> ja|nein
// Danach den Container nicht neu starten müssen: Änderungen gelten sofort.
const auth = require('./auth');

const [cmd, name, arg, extra] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'list':
      for (const u of auth.loadUsers()) console.log(`${u.name}${u.admin ? '  (Administrator)' : ''}`);
      if (!auth.hasUsers()) console.log('Noch kein Benutzer – das erste Konto wird auf der Anmeldeseite angelegt.');
      break;
    case 'add':
      if (!name || !arg) throw new Error('Aufruf: add <name> <passwort> [admin]');
      auth.addUser(name, arg, extra === 'admin' || !auth.hasUsers());
      console.log(`Benutzer „${name}“ angelegt.`);
      break;
    case 'passwd':
      if (!name || !arg) throw new Error('Aufruf: passwd <name> <neues-passwort>');
      auth.setPassword(name, arg);
      console.log(`Passwort von „${name}“ geändert. Alle Geräte dieses Benutzers sind abgemeldet.`);
      break;
    case 'del':
      if (!name) throw new Error('Aufruf: del <name>');
      auth.removeUser(name);
      console.log(`Benutzer „${name}“ gelöscht.`);
      break;
    case 'admin':
      if (!name || !arg) throw new Error('Aufruf: admin <name> ja|nein');
      auth.setAdmin(name, /^(ja|yes|1|true)$/i.test(arg));
      console.log('Gespeichert.');
      break;
    default:
      console.log('Befehle: list | add <name> <passwort> [admin] | passwd <name> <passwort> | del <name> | admin <name> ja|nein');
  }
  process.exit(0);
} catch (e) {
  console.error('Fehler:', e.message);
  process.exit(1);
}
