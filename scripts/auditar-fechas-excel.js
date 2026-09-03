#!/usr/bin/env node
//
// ¿Hay alguna fecha vendida en el libro del equipo que el agente vea LIBRE?
//
// Es la pregunta que importa, y hasta el 2026-09-02 no había forma de
// contestarla: el agente consulta `agenda_reservas`, el equipo vende en su
// libro, y nadie comparaba las dos cosas. Esto las compara.
//
//   node --env-file=.env scripts/auditar-fechas-excel.js
//   node --env-file=.env scripts/auditar-fechas-excel.js --json
//
// Sale con código 1 si encuentra algo. Sirve para correrlo a mano después de
// tocar la sincronización, y para mirarlo de vez en cuando aunque no se haya
// tocado nada: el libro lo escriben personas.
//
// NO REPITE LA LÓGICA DEL WORKFLOW: LA CORRE
// -----------------------------------------
// Los rangos salen del nodo `Leer Calendarios`, las filas las resuelve el
// código del nodo `Leer Calendarios en Filas` -- leído del .json, no copiado --
// y el salón lo resuelve `fn_resolver_sede`, la misma función de Postgres que
// usa la sincronización. Si esto dice que no hay agujeros, lo dice de lo que
// de verdad corre.
//
// Lo único que NO se ejecuta es `fn_sincronizar_agenda_desde_hoja`, porque
// escribe. Auditar no puede arreglar nada por su cuenta: entonces no sabrías
// nunca si el arreglo estaba puesto.
//
// OJO CON UNA COSA: esto lee el repo. Si el repo va por detrás del VPS, aprueba
// lo que no corre. `verificar-despliegue.js` es lo que cubre esa parte.

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SA = fs.existsSync('.gcp-sa-sheets.json') ? '.gcp-sa-sheets.json' : '.gcp-sa-n8n-calendar.json';
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN_SB = process.env.SUPABASE_ACCESS_TOKEN;
const JSON_SALIDA = process.argv.includes('--json');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

// Las pestañas del libro que NO son calendarios de salón, para poder decir
// cuáles se está dejando fuera la sincronización sin nombrar a las que no
// tocan. `GRANADA*` está aquí a propósito: es el salón de otra administración,
// el que el cliente mandó ignorar el 2026-09-02.
const NO_SON_CALENDARIOS = new Set([
  'Hoja 1', 'Hoja 12', 'VALORES', 'Reservas', 'Citas', 'Revisar',
  'GRANADA', 'GRANADA 2026', 'GRANADA 2027',
  'CASA', 'ORQUIDEORAMA', '7 DE AGOSTO',        // plantillas vacías, ocultas
]);

const wf = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'n8n', 'workflow-sincronizar-hoja.json'), 'utf8'));
const nodo = (n) => {
  const x = wf.nodes.find(y => y.name === n);
  if (!x) throw new Error(`no existe el nodo "${n}" en workflow-sincronizar-hoja.json`);
  return x;
};

// Los rangos que pide el workflow, tal cual. Si mañana alguien le quita uno,
// esta auditoría deja de mirarlo también -- y por eso más abajo se compara la
// lista contra las pestañas que de verdad tiene el libro.
//
// Van pegados a la URL y no en `queryParameters` por algo que costó una pasada
// entera: n8n COLAPSA los parámetros repetidos con el mismo nombre, así que de
// los catorce `ranges` mandaba uno. Aquí se leen de donde están.
const nodoLeer = nodo('Leer Calendarios');
const [BASE, QUERY] = nodoLeer.parameters.url.split('?');
const HOJA = (BASE.match(/spreadsheets\/([^/]+)\//) || [])[1];
const PARAMS = (QUERY || '').split('&').filter(Boolean).map(p => {
  const i = p.indexOf('=');
  return { name: decodeURIComponent(p.slice(0, i)), value: decodeURIComponent(p.slice(i + 1)) };
});
const RANGOS = PARAMS.filter(p => p.name === 'ranges').map(p => p.value);
const PESTANAS_QUE_LEE = RANGOS.map(r => r.split('!')[0].replace(/^'|'$/g, ''));

function peticion(op, cuerpo) {
  return new Promise((res, rej) => {
    const rq = https.request(op, r => {
      const t = []; r.on('data', x => t.push(x));
      r.on('end', () => res({ codigo: r.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    rq.on('error', rej); if (cuerpo) rq.write(cuerpo); rq.end();
  });
}

async function tokenGoogle() {
  const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const n = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT' });
  const cl = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
                   aud: 'https://oauth2.googleapis.com/token', iat: n, exp: n + 3600 });
  const f = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + cl), sa.private_key).toString('base64url');
  const d = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
            '&assertion=' + encodeURIComponent(`${h}.${cl}.${f}`);
  const r = await peticion({ host: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
  const j = JSON.parse(r.texto);
  if (!j.access_token) throw new Error('Google no dio token: ' + r.texto.slice(0, 300));
  return j.access_token;
}

async function consulta(sql) {
  const cuerpo = JSON.stringify({ query: sql });
  const r = await peticion({ host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`,
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN_SB, 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(cuerpo) } }, cuerpo);
  if (r.codigo >= 400) throw new Error(`Supabase HTTP ${r.codigo}: ${r.texto.slice(0, 400)}`);
  return JSON.parse(r.texto);
}

// El nodo Code de n8n es el cuerpo de una función con `$input` y `$` dentro.
// Es el mismo truco de `probar-sincronizacion.js` y de `probar-excel.js`.
function correrCode(nombre, entrada) {
  const $input = { first: () => ({ json: entrada }), all: () => [{ json: entrada }] };
  const $ = (n) => { throw new Error(`"${nombre}" llama al nodo "${n}", que aquí no existe`); };
  return new Function('$input', '$', nodo(nombre).parameters.jsCode)($input, $);
}

const comilla = (s) => "'" + String(s).replace(/'/g, "''") + "'";

(async () => {
  for (const [v, n] of [[HOJA, 'el id de la hoja, en el nodo Leer Calendarios'],
                        [REF, 'SUPABASE_PROJECT_REF'], [TOKEN_SB, 'SUPABASE_ACCESS_TOKEN']]) {
    if (!v) { console.error(`Falta ${n}. Corre con node --env-file=.env`); process.exit(1); }
  }

  const T = await tokenGoogle();
  const google = async (ruta) => {
    const r = await peticion({ host: 'sheets.googleapis.com', path: ruta, method: 'GET',
      headers: { Authorization: 'Bearer ' + T } });
    if (r.codigo >= 400) throw new Error(`Sheets HTTP ${r.codigo}: ${r.texto.slice(0, 300)}`);
    return JSON.parse(r.texto);
  };

  // 1. Las pestañas que tiene el libro, para ver si alguna se queda fuera.
  const meta = await google(`/v4/spreadsheets/${HOJA}?fields=sheets.properties`);
  const todas = meta.sheets.map(s => s.properties.title);
  const sinLeer = todas.filter(t => !PESTANAS_QUE_LEE.includes(t) && !NO_SON_CALENDARIOS.has(t));

  // 2. Los mismos rangos que pide el workflow, con las mismas opciones.
  const query = PARAMS.map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&');
  const respuesta = await google(`/v4/spreadsheets/${HOJA}/values:batchGet?${query}`);

  // 3. El propio nodo del workflow, leyéndolas.
  const salida = correrCode('Leer Calendarios en Filas', respuesta);
  const filas = salida.length ? salida[0].json.filas : [];
  const faltan = salida.length ? (salida[0].json.pestanas_que_faltan || []) : [];

  const hoy = new Date().toISOString().slice(0, 10);
  const ilegibles = filas.filter(f => f.motivo);
  const futuras = filas.filter(f => !f.motivo && f.fecha >= hoy);

  // 4. El salón, resuelto por la misma función que usa la sincronización.
  const nombres = [...new Set(futuras.map(f => f.sede))];
  const resueltas = new Map();
  if (nombres.length) {
    const filasSql = nombres.map(n => `(${comilla(n)})`).join(',');
    const r = await consulta(`
      select x.escrito, r.estado, r.nombre_sede, r.detalle
        from (values ${filasSql}) x(escrito), lateral fn_resolver_sede(x.escrito) r`);
    for (const x of r) resueltas.set(x.escrito, x);
  }

  // 5. Lo que el agente ve ocupado hoy.
  const enBase = await consulta(`
    select s.nombre_sede, to_char(a.fecha_solicitada,'YYYY-MM-DD') as fecha
      from agenda_reservas a join sedes s on s.id_sede = a.sede_id
     where a.estado in ('separado','bloqueado_temporal')`);
  const ocupadas = new Set(enBase.map(f => `${f.nombre_sede}|${f.fecha}`));

  const invisibles = [];
  const sinSalon = [];
  const ignoradas = [];
  for (const f of futuras) {
    const r = resueltas.get(f.sede) || { estado: 'no_existe', detalle: 'no se pudo resolver' };
    if (r.estado === 'ignorada') { ignoradas.push({ ...f, motivo: r.detalle }); continue; }
    if (r.estado !== 'ok') { sinSalon.push({ ...f, motivo: r.detalle }); continue; }
    if (!ocupadas.has(`${r.nombre_sede}|${f.fecha}`)) {
      invisibles.push({ ...f, sede_catalogo: r.nombre_sede });
    }
  }
  invisibles.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const problemas = invisibles.length + ilegibles.length + sinSalon.length + faltan.length + sinLeer.length;

  if (JSON_SALIDA) {
    console.log(JSON.stringify({ hoy, leidas: filas.length, futuras: futuras.length,
                                 invisibles, ilegibles, sinSalon, ignoradas, faltan, sinLeer }, null, 2));
    process.exitCode = problemas ? 1 : 0;
    return;
  }

  console.log(c.neg(`\nEl libro del equipo  vs  lo que ve el agente     (hoy ${hoy})\n`));
  console.log(c.gris(`  ${PESTANAS_QUE_LEE.length} pestañas, leídas con el código de "Leer Calendarios en Filas"`));
  console.log(`  Fechas vendidas de hoy en adelante: ${futuras.length}`);
  console.log(`  De esas, las que el agente ve LIBRES: ${invisibles.length ? c.rojo(invisibles.length) : c.verde('0')}\n`);

  const bloque = (titulo, explicacion, lista, linea) => {
    if (!lista.length) return;
    console.log(c.rojo(c.neg('  ' + titulo)));
    console.log(c.gris('  ' + explicacion + '\n'));
    for (const x of lista) console.log('  ' + linea(x));
    console.log('');
  };

  bloque('VENDIDAS EN EL LIBRO Y LIBRES PARA EL AGENTE',
    'Ahora mismo se las puede confirmar y apartar a otro cliente.',
    invisibles,
    x => `${c.rojo(x.fecha)}  ${x.sede_catalogo.padEnd(30)} ${String(x.cliente).slice(0, 26).padEnd(28)} ` +
         c.gris(`${x.pestana}!B${x.fila_hoja} = "${x.celda}"`));

  bloque('PESTAÑAS QUE NO LLEGARON',
    'Un salón entero sin sincronizar. ¿Se renombró la pestaña?',
    faltan.map(p => ({ p })), x => c.rojo(x.p));

  bloque('CALENDARIOS QUE NADIE LEE',
    'Están en el libro y el workflow no los pide: añádelos a "Leer Calendarios".',
    sinLeer.map(p => ({ p })), x => c.rojo(x.p));

  bloque('FILAS CON UN SALÓN QUE NO SE RESUELVE',
    'Son ventas, y no se sabe de qué salón: no entran a la agenda.',
    sinSalon,
    x => `${x.fecha}  ${String(x.cliente).slice(0, 24).padEnd(26)} ${c.gris(x.pestana + '!' + x.fila_hoja)}  ${x.motivo}`);

  if (ilegibles.length) {
    console.log(c.ama(c.neg('  FILAS QUE NO SE PUDIERON LEER')));
    console.log(c.gris('  Tienen nombre de cliente, así que son ventas; la fecha no se entiende.\n'));
    for (const f of ilegibles) {
      console.log(`  ${c.ama(f.pestana + '!' + f.fila_hoja)}  ${String(f.cliente).slice(0, 24).padEnd(26)} ${c.gris(f.motivo)}`);
    }
    console.log('');
  }

  if (ignoradas.length) {
    console.log(c.gris(`  ${ignoradas.length} fila(s) de un salón que se ignora a propósito (Granada, otra administración).\n`));
  }

  console.log(problemas === 0
    ? c.verde('  Ni una fecha vendida se le escapa al agente.\n')
    : c.rojo(`  ${problemas} cosa(s) que mirar.\n`));
  process.exitCode = problemas ? 1 : 0;
})().catch(e => { console.error(c.rojo('\n  ' + e.message + '\n')); process.exit(1); });
