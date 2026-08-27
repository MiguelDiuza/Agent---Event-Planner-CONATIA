#!/usr/bin/env node
//
// Lista o borra TODO lo que hay en el Google Calendar del bot.
//
// Distinto de `limpiar-calendario.sh`, que solo borra los ids de un .tsv de
// respaldo. Este mira el calendario entero, que es lo que hace falta cuando se
// quiere dejar la agenda en cero: hay eventos huérfanos de pruebas viejas que
// la base ya no conoce y que siguen bloqueando fechas reales.
//
// Usa el service account `.gcp-sa-n8n-calendar.json`, que es la misma
// credencial con la que n8n crea las citas.
//
//   node scripts/vaciar-calendario.js             # muestra qué hay, no borra
//   node scripts/vaciar-calendario.js --borrar    # borra de verdad

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const CALENDARIO = 'christianeventos.bot@gmail.com';
const SA = '.gcp-sa-n8n-calendar.json';
const BORRAR = process.argv.includes('--borrar');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

function peticion(opciones, cuerpo) {
  return new Promise((resolve, reject) => {
    const req = https.request(opciones, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => resolve({ codigo: res.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    req.on('error', reject);
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

// El JWT firmado con la llave del service account, canjeado por un token.
async function token() {
  const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const cabeza = b64({ alg: 'RS256', typ: 'JWT' });
  const cuerpo = b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  });
  const firma = crypto.sign('RSA-SHA256', Buffer.from(cabeza + '.' + cuerpo), sa.private_key).toString('base64url');
  const datos = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
                '&assertion=' + encodeURIComponent(`${cabeza}.${cuerpo}.${firma}`);
  const r = await peticion({
    host: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(datos) },
  }, datos);
  const j = JSON.parse(r.texto);
  if (!j.access_token) throw new Error('no dieron token: ' + r.texto.slice(0, 300));
  return j.access_token;
}

(async () => {
  const tok = await token();
  const cal = encodeURIComponent(CALENDARIO);
  const auth = { Authorization: 'Bearer ' + tok };

  // Todo el calendario, sin filtro de fechas: los huérfanos pueden estar en
  // cualquier parte, incluso en el pasado.
  const eventos = [];
  let pagina = '';
  do {
    const r = await peticion({
      host: 'www.googleapis.com', method: 'GET', headers: auth,
      path: `/calendar/v3/calendars/${cal}/events?singleEvents=true&showDeleted=false&maxResults=250` +
            (pagina ? `&pageToken=${pagina}` : ''),
    });
    if (r.codigo >= 300) throw new Error(`al listar: HTTP ${r.codigo} ${r.texto.slice(0, 300)}`);
    const j = JSON.parse(r.texto);
    eventos.push(...(j.items || []));
    pagina = j.nextPageToken || '';
  } while (pagina);

  console.log(c.neg(`\n${eventos.length} evento(s) en ${CALENDARIO}\n`));
  if (!eventos.length) { console.log(c.verde('  el calendario ya está vacío')); return; }

  for (const e of eventos) {
    const cuando = (e.start || {}).dateTime || (e.start || {}).date || '?';
    console.log(`  ${c.gris(cuando.padEnd(26))} ${e.summary || '(sin título)'} ${c.gris(e.id)}`);
  }

  if (!BORRAR) {
    console.log(c.ama('\n  Nada se borró. Corre con --borrar para vaciarlo.\n'));
    return;
  }

  console.log(c.neg('\nborrando...\n'));
  let ok = 0, ya = 0, fallo = 0;
  for (const e of eventos) {
    const r = await peticion({
      host: 'www.googleapis.com', method: 'DELETE', headers: auth,
      path: `/calendar/v3/calendars/${cal}/events/${encodeURIComponent(e.id)}`,
    });
    if (r.codigo === 200 || r.codigo === 204) { ok++; console.log('  ' + c.verde('✓') + ' ' + (e.summary || e.id)); }
    else if (r.codigo === 404 || r.codigo === 410) { ya++; console.log('  ' + c.gris('· ya no estaba: ' + (e.summary || e.id))); }
    else { fallo++; console.log('  ' + c.rojo('✗ HTTP ' + r.codigo) + ' ' + (e.summary || e.id) + ' ' + r.texto.slice(0, 160)); }
  }
  console.log(`\n  borrados: ${ok} · ya no estaban: ${ya} · ` +
    (fallo ? c.rojo(`fallaron: ${fallo}`) : c.verde('fallaron: 0')) + '\n');
  if (fallo) process.exit(1);
})().catch(e => { console.error(c.rojo('FALLO: ' + e.message)); process.exit(1); });
