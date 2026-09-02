#!/usr/bin/env node
//
// Vuelca a la pestaña `Reservas` del Excel las fechas que ya están en
// `agenda_reservas` y que la hoja todavía no tiene.
//
// Hace falta una vez, para arrancar: la hoja nueva nació vacía y los nodos solo
// escriben de aquí en adelante, así que sin esto el Excel mostraría un puñado
// de fechas nuevas y ninguna de las 113 que el equipo ya tenía vendidas. Un
// reflejo a medias es peor que ninguno: alguien lo mira, ve el sábado libre, y
// lo vende dos veces.
//
// Es idempotente y se puede volver a correr: mira lo que ya hay en la hoja por
// (sede, fecha) y solo añade lo que falta. Ese mismo par es la clave única de
// `agenda_reservas`, así que no puede haber dos filas para la misma fecha en la
// misma sede.
//
// Escribe con las mismas reglas que el nodo: apóstrofo delante de las columnas
// de texto para que Sheets no se las coma como fórmula, y las fechas sin
// escapar para que la hoja las pueda ordenar.
//
//   node --env-file=.env scripts/migrar-reservas-a-excel.js           # qué falta
//   node --env-file=.env scripts/migrar-reservas-a-excel.js --escribir

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const { SUPABASE_PROJECT_REF: REF, SUPABASE_ACCESS_TOKEN: TOK, EXCEL_AGENDA_SHEET_ID: HOJA } = process.env;
const SA = fs.existsSync('.gcp-sa-sheets.json') ? '.gcp-sa-sheets.json' : '.gcp-sa-n8n-calendar.json';
const ESCRIBIR = process.argv.includes('--escribir');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  return j;
};

function peticion(op, cuerpo) {
  return new Promise((res, rej) => {
    const rq = https.request(op, r => {
      const t = []; r.on('data', x => t.push(x));
      r.on('end', () => res({ codigo: r.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    rq.on('error', rej); if (cuerpo) rq.write(cuerpo); rq.end();
  });
}

async function token() {
  const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT' });
  const cl = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
                   aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const f = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + cl), sa.private_key).toString('base64url');
  const d = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
            '&assertion=' + `${h}.${cl}.${f}`;
  const r = await peticion({ host: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
  const j = JSON.parse(r.texto);
  if (!j.access_token) throw new Error('sin token: ' + r.texto.slice(0, 200));
  return j.access_token;
}

async function sheets(tok, ruta, metodo = 'GET', cuerpo = null) {
  const d = cuerpo ? JSON.stringify(cuerpo) : null;
  const r = await peticion({ host: 'sheets.googleapis.com', path: `/v4/spreadsheets/${HOJA}${ruta}`,
    method: metodo, headers: { Authorization: 'Bearer ' + tok,
      ...(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}) } }, d);
  if (r.codigo >= 400) throw new Error(`HTTP ${r.codigo}: ${r.texto.slice(0, 300)}`);
  return r.texto ? JSON.parse(r.texto) : null;
}

// Mismo escape que el nodo: sin él, un cliente que se llame "+Andrés" o una
// sede con guion delante entrarían como fórmula.
const t = (v) => (v === null || v === undefined || v === '') ? '' : "'" + v;

(async () => {
  if (!REF || !TOK || !HOJA) {
    console.error('Faltan SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN y EXCEL_AGENDA_SHEET_ID.');
    process.exitCode = 1;
    return;
  }

  const filas = await q(`
    select to_char(r.fecha_solicitada, 'YYYY-MM-DD')        as fecha,
           fn_fecha_en_letras(r.fecha_solicitada)           as legible,
           s.nombre_sede                                    as sede,
           coalesce(r.nombre_cliente, '')                   as cliente,
           coalesce(r.telefono_contacto, '')                as telefono,
           case when r.origen = 'bot' then 'Bot'
                else 'Confirmación humana' end              as origen,
           coalesce(r.google_event_id, '')                  as evento,
           to_char(r.created_at at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as anotado
      from agenda_reservas r
      join sedes s on s.id_sede = r.sede_id
     where r.estado in ('separado', 'bloqueado_temporal')
     order by r.fecha_solicitada`);

  const tok = await token();
  const hay = await sheets(tok, '/values/' + encodeURIComponent('Reservas!A:J'));
  const existentes = new Set(((hay.values || []).slice(1))
    .map(f => `${(f[3] || '').trim()}||${(f[1] || '').trim()}`));

  const faltan = filas.filter(f => !existentes.has(`${f.sede}||${f.fecha}`));

  console.log(c.neg(`\nagenda_reservas: ${filas.length} fecha(s) ocupadas`));
  console.log(`  ya en la hoja: ${filas.length - faltan.length}`);
  console.log(`  ${faltan.length ? c.ama('faltan: ' + faltan.length) : c.verde('no falta ninguna')}`);
  if (faltan.length) {
    faltan.slice(0, 5).forEach(f => console.log(c.gris(`    ${f.fecha}  ${f.sede}  ${f.cliente}`)));
    if (faltan.length > 5) console.log(c.gris(`    ... y ${faltan.length - 5} más`));
  }

  if (!faltan.length) { console.log(''); return; }
  if (!ESCRIBIR) { console.log(c.ama('\nEn seco. Con --escribir se vuelcan.\n')); return; }

  const values = faltan.map(f => [
    f.anotado, f.fecha, t(f.legible), t(f.sede), t(f.cliente), t(f.telefono), f.origen, t(f.evento),
    '', '',   // cancelada y sincronizado: las escriben una persona y el workflow de vuelta
  ]);
  const r = await sheets(tok, '/values/' + encodeURIComponent('Reservas!A:J') +
    ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', 'POST', { values });
  console.log(`\n  ${c.verde('+')} ${r.updates.updatedRows} fila(s) escritas en ${r.updates.updatedRange}`);

  // Se relee y se cuenta: si la hoja no tiene ahora tantas filas como fechas
  // ocupadas hay en la base, algo se quedó por el camino y hay que verlo ahora.
  const fin = await sheets(tok, '/values/' + encodeURIComponent('Reservas!A:J'));
  const total = (fin.values || []).length - 1;
  console.log(total === filas.length
    ? c.verde(`\n  la hoja y la base cuadran: ${total} fecha(s) en las dos.\n`)
    : c.rojo(`\n  ojo: la hoja tiene ${total} y la base ${filas.length}.\n`));
  if (total !== filas.length) process.exitCode = 1;
})().catch(e => { console.error(c.rojo('\n' + e.message + '\n')); process.exitCode = 1; });
