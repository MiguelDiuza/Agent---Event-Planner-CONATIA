#!/usr/bin/env node
//
// El embudo ENTERO, hasta cerrar, contra el sistema de verdad.
//
// Es la prueba que faltaba. Las otras cubren pedazos: `banco-pruebas.js` corre
// las queries de los nodos sin n8n, `probar-conversacion.js` mira el texto que
// lee el cliente, `probar-sincronizacion.js` corre el workflow de la hoja sin
// Google. Ninguna sigue una venta desde el "hola" hasta que la fecha queda
// apartada en los TRES sitios donde tiene que quedar.
//
// Aquí se hacen dos conversaciones completas, con dos personas distintas, y
// después se comprueba el rastro que dejaron:
//
//   1. `agenda_reservas` -- que la fecha quedó apartada, con su lead y su
//      evento de Google.
//   2. Google Calendar -- que el evento existe de verdad, es de día completo y
//      transparente (si no, taparía las citas de 30 minutos de ese día).
//   3. El Excel -- que la fila salió en la pestaña `Reservas` con origen `Bot`.
//   4. `fn_verificar_disponibilidad_evento` -- que a partir de ahora esa fecha
//      le sale OCUPADA al agente. Es lo único que de verdad importa: lo demás
//      son reflejos.
//   5. La ficha (`reservas`) -- que el agente se quedó con el nombre, el
//      teléfono, el aforo y la fecha.
//
// POR DÓNDE ENTRA. Por el `Chat de Prueba`, el mismo canal que usan las otras
// pruebas en vivo: `Canal de prueba?` hace que la respuesta salga por pantalla
// y no por WhatsApp, así que esto NO le manda un mensaje a nadie ni gasta
// saldo de YCloud. De `Upsert Lead` en adelante corre exactamente el mismo
// camino que un cliente real, con Gemini de verdad y las herramientas de
// verdad.
//
// LAS FECHAS SON SÁBADOS LIBRES DE MARZO DE 2027, y hay una razón para no
// irse más lejos aunque fuera más seguro. El prompt tiene una regla dura
// (linea 486): una fecha a MÁS DE TRES AÑOS se trata como un año tecleado mal
// -- 2036 por 2026 -- y el agente pregunta en vez de apartar. La primera
// version de esta prueba usaba 2029, caia justo en esa regla, y las dos
// reservas se quedaban sin cerrar: el agente hacia lo correcto y la prueba lo
// contaba como fallo. Una fecha de prueba tiene que estar donde estan las
// ventas de verdad, no en un borde del prompt.
//
// Se eligen contra la agenda antes de correr: las dos estan libres en su sede,
// y marzo de 2027 no tiene ni una venta en ninguna de las dos.
//
// LOS TURNOS VACÍOS. Gemini devuelve el turno vacío cada tantos mensajes (ver
// la cabecera de `probar-conversacion.js`). Aquí se reenvía el mismo mensaje
// hasta dos veces, que es lo que hace un cliente al que no le contestan; si
// aun así no hay respuesta, se dice y se sigue, porque el rastro se comprueba
// al final y no turno a turno.
//
//   node --env-file=.env scripts/probar-reserva-completa.js
//   node --env-file=.env scripts/probar-reserva-completa.js --conservar   # no limpia al terminar

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { URL } = require('url');

const BASE = process.env.N8N_VPS_URL;
const WEBHOOK = process.env.N8N_CHAT_TEST_WEBHOOK;
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const HOJA = process.env.EXCEL_AGENDA_SHEET_ID;
const CALENDARIO = 'christianeventos.bot@gmail.com';
const SA_CAL = '.gcp-sa-n8n-calendar.json';
const SA_SHEETS = fs.existsSync('.gcp-sa-sheets.json') ? '.gcp-sa-sheets.json' : SA_CAL;
const CONSERVAR = process.argv.includes('--conservar');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0, perdidos = 0;
const ok = (cond, texto, detalle) => {
  console.log('    ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('        ' + c.gris(String(detalle).slice(0, 300))); }
};

// --------------------------------------------------------------------------
// Los dos clientes
// --------------------------------------------------------------------------
// Distintos a propósito, no dos veces el mismo con otro nombre. Valentina
// escribe entero y va derecha; Jhon escribe corto, con errores y en pedazos,
// que es como escribe media clientela por WhatsApp. Si el embudo solo aguanta
// al primero, no aguanta.
const PERSONAS = [
  {
    id: 'a',
    nombre: 'Valentina Restrepo',
    telefono: '3115559090',
    sede: 'Sede Norte',
    fecha: '2027-03-06',
    aforo: 100,
    turnos: [
      'Buenas tardes',
      'Soy Valentina, estoy buscando salón para los quince de mi hija',
      'Seríamos unas 100 personas, y la fecha que tenemos pensada es el sábado 6 de marzo de 2027',
      'Me encantó la Sede Norte, ¿esa fecha está libre ahí?',
      'Sí, apártenmela por favor',
      'Valentina Restrepo, mi número es 3115559090',
    ],
  },
  {
    id: 'b',
    nombre: 'Jhon Ramirez',
    telefono: '3208887744',
    sede: "Casa Christian's Ciudad Jardín",
    fecha: '2027-03-13',
    aforo: 150,
    turnos: [
      'hola buenas',
      'jhon, es pa un matrimonio',
      'seriamos como 150',
      'la fecha seria el sabado 13 de marzo del 2027',
      'me gusto la casa christians ciudad jardin, esa esta libre?',
      'listo apartemela',
      'jhon ramirez, 3208887744',
    ],
  },
];

// --------------------------------------------------------------------------
// Hablar con el n8n de verdad
// --------------------------------------------------------------------------
function pedir(sesion, texto) {
  const u = new URL(`${BASE}/webhook/${WEBHOOK}/chat`);
  const cuerpo = JSON.stringify({ action: 'sendMessage', sessionId: sesion, chatInput: texto });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
      timeout: 180000,
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        const d = Buffer.concat(t).toString('utf8');
        let salida = null;
        try { salida = (JSON.parse(d) || {}).output ?? null; } catch { /* sin respuesta */ }
        resolve(salida);
      });
    });
    req.on('timeout', () => req.destroy(new Error('se pasó de 180 s')));
    req.on('error', reject);
    req.write(cuerpo); req.end();
  });
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// Un turno, con los reintentos que haría un cliente al que no le contestan.
async function turno(sesion, texto) {
  for (let intento = 1; intento <= 3; intento++) {
    let salida = null;
    try { salida = await pedir(sesion, texto); } catch (e) { salida = null; }
    if (salida && String(salida).trim()) return String(salida);
    if (intento === 1) perdidos++;
    await dormir(1500);
  }
  return '';
}

// --------------------------------------------------------------------------
// Base, Calendar y Excel
// --------------------------------------------------------------------------
const sql = async (texto) => {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: texto }),
      });
      const j = await r.json();
      if (Array.isArray(j)) return j;
      throw new Error(JSON.stringify(j).slice(0, 200));
    } catch (e) {
      if (i === 4) throw e;
      await dormir(2000 * (i + 1));
    }
  }
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

async function tokenGoogle(archivo, scope) {
  const sa = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const n = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT' });
  const cl = b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: n, exp: n + 3600 });
  const f = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + cl), sa.private_key).toString('base64url');
  const d = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
            '&assertion=' + encodeURIComponent(`${h}.${cl}.${f}`);
  for (let i = 0; i < 5; i++) {
    try {
      const r = await peticion({ host: 'oauth2.googleapis.com', path: '/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
      const j = JSON.parse(r.texto);
      if (j.access_token) return j.access_token;
    } catch (e) { /* reintenta */ }
    await dormir(2000 * (i + 1));
  }
  throw new Error('no se pudo pedir el token de ' + archivo);
}

async function eventoCalendar(tok, id) {
  const r = await peticion({ host: 'www.googleapis.com', method: 'GET',
    headers: { Authorization: 'Bearer ' + tok },
    path: `/calendar/v3/calendars/${encodeURIComponent(CALENDARIO)}/events/${encodeURIComponent(id)}` });
  if (r.codigo >= 400) return null;
  return JSON.parse(r.texto);
}

async function borrarEvento(tok, id) {
  const r = await peticion({ host: 'www.googleapis.com', method: 'DELETE',
    headers: { Authorization: 'Bearer ' + tok },
    path: `/calendar/v3/calendars/${encodeURIComponent(CALENDARIO)}/events/${encodeURIComponent(id)}` });
  return r.codigo < 300 || r.codigo === 410;
}

async function hojaReservas(tok) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await peticion({ host: 'sheets.googleapis.com', method: 'GET',
        headers: { Authorization: 'Bearer ' + tok },
        path: `/v4/spreadsheets/${HOJA}/values/` + encodeURIComponent('Reservas!A2:J') });
      if (r.codigo >= 400) throw new Error('HTTP ' + r.codigo);
      return (JSON.parse(r.texto).values) || [];
    } catch (e) { if (i === 4) throw e; await dormir(2000 * (i + 1)); }
  }
}

async function borrarFilasHoja(tok, filas) {
  if (!filas.length) return 0;
  const meta = await peticion({ host: 'sheets.googleapis.com', method: 'GET',
    headers: { Authorization: 'Bearer ' + tok },
    path: `/v4/spreadsheets/${HOJA}?fields=` + encodeURIComponent('sheets.properties(title,sheetId)') });
  const id = JSON.parse(meta.texto).sheets.find(s => s.properties.title === 'Reservas').properties.sheetId;
  // De abajo hacia arriba: borrar de arriba corre los índices de lo que falta.
  const requests = filas.slice().sort((a, b) => b - a).map(fila => ({
    deleteDimension: { range: { sheetId: id, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila } } }));
  const cuerpo = JSON.stringify({ requests });
  const r = await peticion({ host: 'sheets.googleapis.com', method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json',
               'Content-Length': Buffer.byteLength(cuerpo) },
    path: `/v4/spreadsheets/${HOJA}:batchUpdate` }, cuerpo);
  return r.codigo < 300 ? filas.length : 0;
}

// --------------------------------------------------------------------------
async function main() {
  for (const [k, v] of Object.entries({ N8N_VPS_URL: BASE, N8N_CHAT_TEST_WEBHOOK: WEBHOOK,
                                        SUPABASE_PROJECT_REF: REF, SUPABASE_ACCESS_TOKEN: TOKEN,
                                        EXCEL_AGENDA_SHEET_ID: HOJA })) {
    if (!v) { console.error(`Falta ${k}. Cárgalo del .env.`); process.exitCode = 1; return; }
  }

  const marca = Date.now();
  const tokCal = await tokenGoogle(SA_CAL, 'https://www.googleapis.com/auth/calendar');
  const tokHoja = await tokenGoogle(SA_SHEETS, 'https://www.googleapis.com/auth/spreadsheets');

  console.log(c.neg('\nDos clientes, dos reservas completas, contra el n8n de verdad'));
  console.log(c.gris('  entra por el Chat de Prueba: no sale ningún WhatsApp ni se gasta saldo'));

  // ------------------------------------------------------------------------
  // Las conversaciones
  // ------------------------------------------------------------------------
  for (const p of PERSONAS) {
    p.sesion = `reserva-${p.id}-${marca}`;
    p.telefonoLead = 'test-' + p.sesion;      // así lo arma `Normalizar Chat`
    console.log('\n' + c.neg(`  ${p.nombre} — ${p.aforo} personas, ${p.sede}, ${p.fecha}`));
    for (const t of p.turnos) {
      console.log('    ' + c.cyan('cliente ') + t);
      const salida = await turno(p.sesion, t);
      const linea = String(salida).replace(/\|\|\|/g, ' | ').replace(/\s+/g, ' ').trim();
      console.log('    ' + (linea ? c.gris('angie   ' + linea.slice(0, 150)) : c.ama('angie   (turno vacío)')));
      await dormir(700);
    }
  }

  // ------------------------------------------------------------------------
  // El rastro
  // ------------------------------------------------------------------------
  const telefonos = PERSONAS.map(p => `'${p.telefonoLead}'`).join(',');
  const agenda = await sql(`
    select l.telefono, s.nombre_sede sede, to_char(a.fecha_solicitada,'YYYY-MM-DD') fecha,
           a.nombre_cliente, a.estado, a.origen, a.google_event_id, a.telefono_contacto
      from agenda_reservas a
      join sedes s on s.id_sede = a.sede_id
      left join leads l on l.id = a.lead_id
     where l.telefono in (${telefonos})`);

  const filasHoja = await hojaReservas(tokHoja);

  for (const p of PERSONAS) {
    console.log('\n' + c.neg(`  El rastro de ${p.nombre}`));
    const fila = agenda.find(a => a.telefono === p.telefonoLead);

    ok(!!fila, 'la fecha quedó apartada en agenda_reservas',
      'sin esto no hay nada más que mirar: el agente no cerró la reserva');
    if (!fila) continue;

    ok(fila.sede === p.sede, `en la sede correcta: ${fila.sede}`, `se pidió ${p.sede}`);
    ok(fila.fecha === p.fecha, `en la fecha correcta: ${fila.fecha}`, `se pidió ${p.fecha}`);
    ok(fila.estado === 'bloqueado_temporal', `estado '${fila.estado}'`);
    ok(fila.origen === 'bot', `origen '${fila.origen}': la apartó el bot, no una persona`);
    ok(!!fila.google_event_id, 'guardó el id del evento de Calendar',
      'sin él no se puede borrar el bloqueo si la reserva se libera');

    // Lo único que de verdad importa.
    const disp = await sql(`select fn_verificar_disponibilidad_evento('${p.sede.replace(/'/g, "''")}', '${p.fecha}') r`);
    ok(/^OCUPADA/.test(disp[0].r), 'y el agente ya la ve OCUPADA — es para esto que existe todo lo demás',
      disp[0].r);

    // El evento de Google, de verdad.
    if (fila.google_event_id) {
      const ev = await eventoCalendar(tokCal, fila.google_event_id);
      ok(!!ev && ev.status !== 'cancelled', 'el evento existe en Google Calendar');
      if (ev) {
        ok(!!(ev.start && ev.start.date), 'es de día completo (no bloquea las citas de 30 min de ese día)',
          JSON.stringify(ev.start));
        ok(ev.transparency === 'transparent', "va como 'transparent'");
        ok(String(ev.summary || '').includes(p.sede), `el título nombra la sede: ${ev.summary}`);
      }
    }

    // La fila del Excel.
    const enHoja = filasHoja.filter(f => String(f[1] || '').trim() === p.fecha &&
                                         String(f[3] || '').trim() === p.sede);
    ok(enHoja.length === 1, `salió UNA fila en la pestaña Reservas del Excel (${enHoja.length})`);
    if (enHoja.length) {
      ok(String(enHoja[0][6] || '').trim() === 'Bot', `con origen '${enHoja[0][6]}'`);
      ok(String(enHoja[0][7] || '').trim() === fila.google_event_id,
        'y el mismo id de evento que la base', `hoja: ${enHoja[0][7]} / base: ${fila.google_event_id}`);
    }

    // La ficha: lo que el agente se quedó sabiendo.
    const ficha = await sql(`
      select r.num_invitados, to_char(r.fecha_evento,'YYYY-MM-DD') fecha, r.nombre_cliente,
             r.telefono_contacto, s.nombre_sede sede, te.nombre_paquete evento
        from reservas r
        join leads l on l.id = r.lead_id
        left join sedes s on s.id_sede = r.sede_id
        left join tipos_evento te on te.id_evento = r.tipo_evento_id
       where l.telefono = '${p.telefonoLead}' order by r.updated_at desc limit 1`);
    ok(ficha.length === 1, 'el agente se quedó con la ficha del cliente');
    if (ficha.length) {
      const f = ficha[0];
      ok(f.num_invitados === p.aforo, `el aforo: ${f.num_invitados}`, `se dijo ${p.aforo}`);
      ok(f.fecha === p.fecha, `la fecha del evento: ${f.fecha}`);
      ok(!!f.nombre_cliente, `el nombre: ${f.nombre_cliente}`);
      ok(!!f.telefono_contacto, `el teléfono de contacto: ${f.telefono_contacto}`);
    }
  }

  // ------------------------------------------------------------------------
  // Que no se pisen entre ellos
  // ------------------------------------------------------------------------
  console.log('\n' + c.neg('  Y una cosa más'));
  const cruzado = await sql(`
    select count(*)::int n from agenda_reservas a
    join sedes s on s.id_sede = a.sede_id
    where a.fecha_solicitada in (${PERSONAS.map(p => `'${p.fecha}'`).join(',')})`);
  ok(cruzado[0].n === PERSONAS.length,
    `las dos reservas son filas distintas, no se pisaron (${cruzado[0].n})`);

  if (perdidos) {
    console.log(c.ama(`\n  ${perdidos} turno(s) volvieron vacíos de Gemini y hubo que reenviarlos.`));
    console.log(c.gris('  Es un dato del modelo, no un fallo del embudo. Ver probar-conversacion.js.'));
  }

  // ------------------------------------------------------------------------
  // Limpieza
  // ------------------------------------------------------------------------
  if (CONSERVAR) {
    console.log(c.ama('\n  --conservar: los datos de prueba se quedan. Acuérdate de limpiarlos.'));
  } else {
    console.log('\n' + c.neg('  Limpieza'));
    // Calendar PRIMERO: si se borra la fila antes, se pierde el id del evento y
    // el bloqueo se queda en el calendario para siempre, sin nada que lo
    // respalde. Es el error que dejó ocho eventos huérfanos el 2026-08-29.
    let borrados = 0;
    for (const a of agenda) if (a.google_event_id && await borrarEvento(tokCal, a.google_event_id)) borrados++;
    console.log(`    ${c.verde('−')} ${borrados} evento(s) de Calendar`);

    const filas = [];
    filasHoja.forEach((f, i) => {
      const esPrueba = PERSONAS.some(p => String(f[1] || '').trim() === p.fecha &&
                                          String(f[3] || '').trim() === p.sede);
      if (esPrueba) filas.push(i + 2);
    });
    console.log(`    ${c.verde('−')} ${await borrarFilasHoja(tokHoja, filas)} fila(s) del Excel`);

    await sql(`
      delete from agenda_reservas where lead_id in (select id from leads where telefono in (${telefonos}));
      delete from citas where telefono in (${telefonos}) or lead_id in (select id from leads where telefono in (${telefonos}));
      delete from envios_medios where lead_id in (select id from leads where telefono in (${telefonos}));
      delete from cotizaciones_aforos where lead_id in (select id from leads where telefono in (${telefonos}));
      delete from reservas where lead_id in (select id from leads where telefono in (${telefonos}));
      delete from mensajes_fragmentos where telefono in (${telefonos});
      -- La memoria se guarda con el TELÉFONO como session_id, no con el
      -- sessionId que se manda al webhook: "Normalizar Chat" le antepone
      -- "test-" y de ahí en adelante el chat es ese teléfono. Borrar por
      -- p.sesion no encontraba nada y dejaba la memoria colgando -- pasó el
      -- 2026-09-02: 106 filas huérfanas de dos corridas de esta misma prueba,
      -- invisibles porque su lead ya no existía.
      delete from n8n_chat_histories where session_id in (${telefonos});
      delete from leads where telefono in (${telefonos});`);
    // Se cuenta lo que QUEDA en cada tabla, no lo que se creyó borrar. Un
    // `delete` que no encuentra nada devuelve 0 filas y ningún error, así que
    // sin releer esto la limpieza puede decir que fue bien mientras deja
    // rastro. Es exactamente lo que pasó con `n8n_chat_histories`.
    const quedan = await sql(`select
      (select count(*) from leads where telefono in (${telefonos}))::int leads,
      (select count(*) from agenda_reservas a left join leads l on l.id = a.lead_id
        where l.telefono in (${telefonos}))::int agenda,
      (select count(*) from n8n_chat_histories where session_id in (${telefonos}))::int memoria,
      (select count(*) from mensajes_fragmentos where telefono in (${telefonos}))::int fragmentos,
      (select count(*) from reservas r left join leads l on l.id = r.lead_id
        where l.telefono in (${telefonos}))::int fichas`);
    const q = quedan[0];
    const total = q.leads + q.agenda + q.memoria + q.fragmentos + q.fichas;
    console.log(`    ${total === 0 ? c.verde('−') : c.rojo('✗')} datos de la base: ` +
      `${q.leads} lead(s), ${q.agenda} en agenda, ${q.memoria} de memoria, ` +
      `${q.fragmentos} fragmento(s), ${q.fichas} ficha(s)`);
    if (total !== 0) { fallos++; console.log(c.gris('        la limpieza dejó rastro')); }
  }

  console.log(fallos === 0
    ? c.verde('\nLa reserva completa funciona de punta a punta.\n')
    : c.rojo(`\n${fallos} problema(s).\n`));
  process.exitCode = fallos === 0 ? 0 : 1;
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message + '\n')); process.exit(1); });
