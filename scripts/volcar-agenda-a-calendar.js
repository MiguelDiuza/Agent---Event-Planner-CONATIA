#!/usr/bin/env node
//
// Crea en Google Calendar los eventos de las fechas ocupadas que todavía no lo
// tienen: las 113 que el equipo ya había vendido y que entraron por la
// migración 20260901000000.
//
// POR QUÉ, si el agente no lee el calendario. Porque el asesor sí. La
// disponibilidad la decide `agenda_reservas` -- eso no cambia, y el calendario
// no manda nada aquí -- pero quien abre el Calendar para ver qué hay el sábado
// que viene estaba viendo tres eventos del bot y ninguno de los 113 que la
// empresa tiene vendidos. Un calendario que miente por omisión es peor que uno
// vacío: se consulta igual, y se cree.
//
// Los eventos salen idénticos a los que crea `separar_fecha_evento`: de DÍA
// COMPLETO y con transparency=transparent, para que `Buscar Choques` de
// agendar_cita los ignore y una fecha vendida no bloquee las citas de 30
// minutos de ese día.
//
// Es idempotente por dos vías, y hacen falta las dos: se salta lo que ya tiene
// `google_event_id` en la base, y ADEMÁS lee el calendario y se salta lo que ya
// está allá. La segunda cubre el caso feo -- el evento se creó y el update de
// vuelta no llegó -- que sin ella dejaría el calendario con dos eventos por
// fecha en cada corrida.
//
// De aquí en adelante esto no hace falta: `sincronizar_hoja` crea el evento de
// cada fecha nueva en la misma pasada.
//
// Y mira también al revés: eventos de RESERVA en el calendario que ya no le
// corresponden a ninguna fecha ocupada de la base. Salen de una prueba que se
// limpió por SQL sin pasar por Google, o de una fecha que se liberó. Un evento
// huérfano bloquea un sábado a los ojos del asesor sin que nada lo respalde, y
// no hay forma de darse cuenta mirando el calendario.
//
//   node --env-file=.env scripts/volcar-agenda-a-calendar.js             # qué falta y qué sobra
//   node --env-file=.env scripts/volcar-agenda-a-calendar.js --escribir  # crea lo que falta
//   node --env-file=.env scripts/volcar-agenda-a-calendar.js --huerfanos --escribir  # y borra lo que sobra

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const CALENDARIO = 'christianeventos.bot@gmail.com';
const SA = '.gcp-sa-n8n-calendar.json';
const { SUPABASE_PROJECT_REF: REF, SUPABASE_ACCESS_TOKEN: TOK } = process.env;
const ESCRIBIR = process.argv.includes('--escribir');
const HUERFANOS = process.argv.includes('--huerfanos');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

function peticion(op, cuerpo) {
  return new Promise((res, rej) => {
    const rq = https.request(op, r => {
      const t = []; r.on('data', x => t.push(x));
      r.on('end', () => res({ codigo: r.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    rq.on('error', rej); if (cuerpo) rq.write(cuerpo); rq.end();
  });
}

// El JWT firmado con la llave del service account, canjeado por un token.
// Mismo procedimiento que `vaciar-calendario.js`: es la misma credencial con la
// que n8n crea los eventos, así que lo que se cree aquí es indistinguible de lo
// que crea el bot.
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

// Con reintentos: la Management API tira una petición de vez en cuando
// (ECONNRESET, ENOTFOUND), y aquí eso no puede matar una corrida a medias —
// entre crear el evento en Google y guardar su id en la base hay un hueco, y
// caerse justo ahí es lo que deja un evento huérfano.
const q = async (sql, reintentos = 4) => {
  for (let i = 0; i < reintentos; i++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
      return j;
    } catch (e) {
      if (i === reintentos - 1) throw e;
      await new Promise(res => setTimeout(res, 2000 * (i + 1)));
    }
  }
};

// El día siguiente, en texto. `end.date` es EXCLUSIVO en Google: un evento de
// un solo día va de la fecha a la fecha+1.
const manana = (f) => new Date(Date.parse(f + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

(async () => {
  if (!REF || !TOK) {
    console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(SA)) {
    console.error(`Falta ${SA}: es la llave con la que n8n escribe en el calendario.`);
    process.exitCode = 1;
    return;
  }

  // Solo las que ocupan de verdad, y solo de hoy en adelante: una fecha que ya
  // pasó no hay que enseñársela a nadie, y es el mismo criterio con el que se
  // cargaron las 113.
  const ocupadas = await q(`
    select r.id_reserva::text                        as id,
           to_char(r.fecha_solicitada, 'YYYY-MM-DD') as fecha,
           s.nombre_sede                             as sede,
           coalesce(nullif(btrim(r.nombre_cliente), ''), 'sin nombre') as cliente,
           r.estado                                  as estado,
           r.origen                                  as origen,
           r.google_event_id                         as evento
      from agenda_reservas r
      join sedes s on s.id_sede = r.sede_id
     where r.estado in ('separado', 'bloqueado_temporal')
       and r.fecha_solicitada >= (now() at time zone 'America/Bogota')::date
     order by r.fecha_solicitada, s.nombre_sede`);

  const filas = ocupadas.filter(f => !f.evento);

  const tok = await token();
  const cal = encodeURIComponent(CALENDARIO);
  const auth = { Authorization: 'Bearer ' + tok };

  // Lo que YA está en el calendario, de hoy en adelante. La clave es la misma
  // que identifica una reserva: fecha + sede. La sede se saca del título, que
  // es `RESERVA - <sede> - <cliente>`.
  const yaEstan = new Set();
  const enCalendar = [];       // {id, clave, resumen, fecha} de cada evento de RESERVA
  let pagina = null, vistos = 0;
  do {
    const r = await peticion({
      host: 'www.googleapis.com', method: 'GET', headers: auth,
      path: `/calendar/v3/calendars/${cal}/events?singleEvents=true&showDeleted=false` +
            `&maxResults=2500&timeMin=${encodeURIComponent(new Date().toISOString())}` +
            (pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''),
    });
    if (r.codigo >= 400) throw new Error(`no se pudo leer el calendario: HTTP ${r.codigo} ${r.texto.slice(0, 300)}`);
    const j = JSON.parse(r.texto);
    for (const e of j.items || []) {
      vistos++;
      const m = /^RESERVA - (.+?) - /.exec(e.summary || '');
      if (m && e.start && e.start.date) {
        yaEstan.add(`${e.start.date}||${m[1]}`);
        enCalendar.push({ id: e.id, clave: `${e.start.date}||${m[1]}`, resumen: e.summary });
      }
    }
    pagina = j.nextPageToken || null;
  } while (pagina);

  const faltan = filas.filter(f => !yaEstan.has(`${f.fecha}||${f.sede}`));
  const repetidas = filas.length - faltan.length;

  console.log(c.neg(`\nFechas ocupadas sin evento en Calendar: ${filas.length}`));
  console.log(c.gris(`  eventos en el calendario de hoy en adelante: ${vistos}`));
  if (repetidas) {
    console.log(c.ama(`  ${repetidas} ya tienen su evento allá y solo les falta el id en la base`));
  }
  console.log(`  ${faltan.length ? c.ama('por crear: ' + faltan.length) : c.verde('no falta ninguno')}`);
  faltan.slice(0, 5).forEach(f => console.log(c.gris(`    ${f.fecha}  ${f.sede}  ${f.cliente}`)));
  if (faltan.length > 5) console.log(c.gris(`    ... y ${faltan.length - 5} más`));

  // Y al revés: eventos de RESERVA que ya no respalda ninguna fila ocupada.
  const vivas = new Set(ocupadas.map(f => `${f.fecha}||${f.sede}`));
  const sobran = enCalendar.filter(e => !vivas.has(e.clave));
  if (sobran.length) {
    console.log(c.ama(`\n  ${sobran.length} evento(s) en Calendar sin fila viva en la agenda:`));
    sobran.slice(0, 8).forEach(e => console.log(c.gris(`    ${e.resumen}`)));
    if (sobran.length > 8) console.log(c.gris(`    ... y ${sobran.length - 8} más`));
    console.log(c.gris(HUERFANOS
      ? '    se borran abajo'
      : '    para borrarlos: --huerfanos --escribir'));
  }

  if (!ESCRIBIR) {
    console.log(c.ama('\nEn seco. Con --escribir se crean.\n'));
    return;
  }

  if (HUERFANOS && sobran.length) {
    let borrados = 0;
    for (const e of sobran) {
      const r = await peticion({
        host: 'www.googleapis.com', method: 'DELETE', headers: auth,
        path: `/calendar/v3/calendars/${cal}/events/${encodeURIComponent(e.id)}`,
      });
      // 410 = ya estaba borrado. Cuenta como éxito: el estado final es el que
      // se quería.
      if (r.codigo < 300 || r.codigo === 410) borrados++;
      else console.log(`  ${c.rojo('✗')} ${e.resumen}: HTTP ${r.codigo}`);
    }
    console.log(`  ${c.verde('−')} ${borrados} evento(s) huérfanos borrados`);
  }

  let creados = 0, fallidos = 0;
  const ids = [];
  for (const f of faltan) {
    const cuerpo = JSON.stringify({
      summary: `RESERVA - ${f.sede} - ${f.cliente}`,
      description: `Fecha de evento vendida por el equipo.\nSede: ${f.sede}\n` +
                   `Cliente: ${f.cliente}\nEstado: ${f.estado}\n` +
                   `Cargada desde el Excel del equipo (agenda_reservas, origen=${f.origen}).`,
      start: { date: f.fecha },
      end: { date: manana(f.fecha) },
      transparency: 'transparent',
    });
    const r = await peticion({
      host: 'www.googleapis.com', method: 'POST',
      path: `/calendar/v3/calendars/${cal}/events`,
      headers: { ...auth, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
    }, cuerpo);

    if (r.codigo >= 400) {
      fallidos++;
      console.log(`  ${c.rojo('✗')} ${f.fecha} ${f.sede}: HTTP ${r.codigo} ${r.texto.slice(0, 160)}`);
      continue;
    }
    creados++;
    ids.push([f.id, JSON.parse(r.texto).id]);
    process.stdout.write(`\r  creando... ${creados}/${faltan.length}`);
  }
  process.stdout.write('\n');

  // El id de vuelta a la base, de golpe: es lo que permite borrar el bloqueo
  // del calendario si la fecha se libera, y lo que evita que la próxima
  // corrida vuelva a crear el mismo evento.
  if (ids.length) {
    const valores = ids.map(([id, ev]) =>
      `('${id}'::uuid, '${String(ev).replace(/'/g, "''")}')`).join(',\n');
    await q(`update agenda_reservas r set google_event_id = v.ev
             from (values\n${valores}\n) as v(id, ev)
             where r.id_reserva = v.id`);
  }

  const sin = await q(`select count(*)::int as n from agenda_reservas
                        where estado in ('separado','bloqueado_temporal')
                          and google_event_id is null
                          and fecha_solicitada >= (now() at time zone 'America/Bogota')::date`);

  console.log(`\n  ${c.verde('+')} ${creados} evento(s) creados${fallidos ? c.rojo(`, ${fallidos} fallidos`) : ''}`);
  console.log(sin[0].n === 0
    ? c.verde('  no queda ninguna fecha ocupada sin evento en Calendar.\n')
    : c.ama(`  quedan ${sin[0].n} sin evento: vuelve a correrlo.\n`));
  if (fallidos || sin[0].n) process.exitCode = 1;
})().catch(e => { console.error(c.rojo('\n' + e.message + '\n')); process.exit(1); });
