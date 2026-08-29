#!/usr/bin/env node
//
// Prueba de humo contra el n8n que está corriendo de verdad.
//
// Las otras pruebas corren el código de los nodos leyéndolo del .json, pero
// nunca a n8n. Hay cosas que solo se pueden comprobar con n8n de por medio, y
// la que importa es el nodo `Esperar Continuación`: que exista en esa versión
// de n8n, que acepte los segundos como expresión, y que al despertar la
// ejecución siga teniendo a mano lo que dejó `Detectar Fragmento`. Nada de eso
// se ve en un .json -- se ve cuando el cliente escribe.
//
// Entra por el `Chat de Prueba`, el mismo canal local que ya existía: el
// payload se normaliza a la misma forma que WhatsApp, así que de `Upsert Lead`
// en adelante corre exactamente el mismo camino. Sí llama a Gemini de verdad,
// así que gasta cuota y tarda unos segundos.
//
// Deja un lead `test-humo-...` y su historial; el script los borra al terminar
// si tiene las credenciales de Supabase.
//
//   node scripts/probar-en-vivo.js

const https = require('https');
const { URL } = require('url');

const BASE = process.env.N8N_VPS_URL;
const WEBHOOK = process.env.N8N_CHAT_TEST_WEBHOOK;
if (!BASE || !WEBHOOK) {
  console.error('Faltan N8N_VPS_URL y N8N_CHAT_TEST_WEBHOOK. Cárgalos del .env.');
  process.exit(1);
}
const SESION = 'humo-' + Date.now();
const TELEFONO = 'test-' + SESION;   // así lo arma `Normalizar Chat`

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};
const titulo = (t) => console.log('\n' + c.neg(t));

function escribir(texto) {
  const u = new URL(`${BASE}/webhook/${WEBHOOK}/chat`);
  const cuerpo = JSON.stringify({ action: 'sendMessage', sessionId: SESION, chatInput: texto });
  const arranque = Date.now();
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
      timeout: 120000,
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        const d = Buffer.concat(t).toString('utf8');
        let salida = null;
        try { salida = (JSON.parse(d) || {}).output ?? null; } catch { /* sin JSON: sin respuesta */ }
        resolve({ texto, salida, ms: Date.now() - arranque, crudo: d });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('se pasó de 120 s')); });
    req.on('error', reject);
    req.write(cuerpo); req.end();
  });
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(c.gris(`\n  ${BASE} · sesión ${SESION}`));

  // ------------------------------------------------------------------------
  titulo('1. Un mensaje normal se contesta de una');
  {
    const r = await escribir('Hola');
    console.log(c.gris(`      → ${String(r.salida).slice(0, 110)}  (${r.ms} ms)`));
    ok(!!r.salida, 'el agente contestó');
    ok(/Angie Otero/.test(r.salida || ''), 'y contestó con el saludo del libreto');
    ok(r.ms < 30000, `sin espera de por medio (${r.ms} ms)`,
       'si se pasa de 30 s, el detector está haciendo esperar a un mensaje que no debía');
  }

  // ------------------------------------------------------------------------
  titulo('2. LA RÁFAGA: cuatro mensajes sueltos, una sola respuesta');
  // Los cuatro salen casi a la vez, como los manda una persona escribiendo.
  // Cada uno abre su propia ejecución en n8n; las tres primeras tienen que
  // apagarse solas y solo la última debe contestar, con todo el texto junto.
  {
    const RAFAGA = ['quiero', 'que sea', 'para 150', 'personas'];
    const vuelos = [];
    for (const m of RAFAGA) {
      vuelos.push(escribir(m));
      await esperar(1200);          // lo que tarda alguien en escribir el siguiente
    }
    const rs = await Promise.all(vuelos);

    for (const r of rs) {
      console.log(c.gris(`      "${r.texto}" → ${r.salida ? String(r.salida).slice(0, 90) : '(callado)'}  (${r.ms} ms)`));
    }

    const contestaron = rs.filter(r => r.salida);
    ok(contestaron.length === 1,
       `de los 4 mensajes contestó UNO, no cuatro (contestaron ${contestaron.length})`,
       JSON.stringify(rs.map(r => ({ m: r.texto, out: r.salida }))));
    ok(contestaron.length === 1 && contestaron[0].texto === 'personas',
       'y el que contestó fue el último de la ráfaga');
    // Si el Wait no corriera, el último habría contestado igual de rápido que
    // el primero. Los ocho segundos de espera son la prueba de que corrió.
    const ultimo = rs[rs.length - 1];
    ok(ultimo.ms > 7000, `el último esperó al resto antes de hablar (${ultimo.ms} ms)`,
       'menos de 7 s significa que el nodo Esperar Continuación no se ejecutó');
  }

  // ------------------------------------------------------------------------
  titulo('3. Y el agente entendió el mensaje completo, no el último pedazo');
  {
    const r = await escribir('para el 20 de diciembre');
    console.log(c.gris(`      → ${String(r.salida).slice(0, 160)}`));
    ok(!!r.salida, 'contestó');
    // No se le exige un texto exacto -- lo escribe un modelo -- pero si hubiera
    // entendido solo "personas" no estaría hablando de una cotización.
    ok(!/no entend|no comprend|puedes repetir/i.test(r.salida || ''),
       'y no pidió que le repitieran nada');
  }

  // ------------------------------------------------------------------------
  titulo('4. La ficha: no vuelve a preguntar lo que el cliente ya dijo');
  // Contra n8n de verdad se prueban dos cosas que el .json no muestra: que el
  // nodo `Ficha del Cliente` corra antes del agente sin romper la cadena, y
  // que el modelo de verdad use lo que la ficha le pone delante. Lo segundo es
  // lo único que no se puede comprobar sin llamar a Gemini.
  {
    const r = await escribir('es un matrimonio');
    console.log(c.gris(`      → ${String(r.salida).slice(0, 200)}`));
    ok(!!r.salida, 'contestó');
    // Ya dijo 150 personas y el 20 de diciembre, dos turnos antes. Si vuelve a
    // preguntar cualquiera de las dos, la ficha no le está llegando al modelo.
    ok(!/cu[áa]ntas personas|cu[áa]ntos invitados/i.test(r.salida || ''),
       'no vuelve a preguntar para cuántas personas: ya está en la ficha', r.salida);
    ok(!/para qu[ée] fecha|qu[ée] fecha tienes/i.test(r.salida || ''),
       'ni la fecha, que es la que antes se inventaba cuando no la tenía', r.salida);
  }

  // ------------------------------------------------------------------------
  titulo('5. El comando /new deja el chat en cero');
  // El único camino del workflow que se salta al agente por completo:
  // ¿Comando /new? → Reiniciar Chat → Saludo Reinicio → Sembrar Saludo.
  // Si cualquiera de los cuatro falla, aquí no llega el saludo.
  {
    const r = await escribir('/new');
    console.log(c.gris(`      → ${String(r.salida).slice(0, 120)}  (${r.ms} ms)`));
    ok(/Angie Otero/.test(r.salida || '') && /tengo el gusto/.test(r.salida || ''),
       'el saludo de apertura vuelve, palabra por palabra', r.salida);
    // Sin Gemini de por medio esto son dos consultas y un insert: si tarda lo
    // que tarda un turno del agente, se fue por la rama equivocada.
    ok(r.ms < 8000, `y llega sin pasar por el modelo (${r.ms} ms)`);

    const estado = await mirar(
      `select (select count(*)::int from n8n_chat_histories where session_id = $T) as memoria,
              (select count(*)::int from reservas rr
                 join leads l on l.id = rr.lead_id where l.telefono = $T) as reservas`);
    // Dos filas y no cero: el saludo que acaba de salir queda sembrado en la
    // memoria —el "Hola" del cliente y la respuesta de Angie— para que en el
    // mensaje siguiente el agente pase al turno 2 en vez de volver a saludar.
    ok(estado === null || estado.memoria === 2,
       `la memoria queda solo con el saludo sembrado (${estado ? estado.memoria : 'sin credenciales'} filas)`);
    ok(estado === null || estado.reservas === 0,
       'y sin ninguna reserva: el embudo arranca de cero');
  }

  // ------------------------------------------------------------------------
  titulo('6. Y después de /new sigue en el turno 2, no vuelve a saludar');
  {
    const r = await escribir('Miguel, unos 15 años');
    console.log(c.gris(`      → ${String(r.salida).slice(0, 160)}`));
    ok(!!r.salida, 'contestó');
    ok(!/Gracias por comunicarte con Christian Sierra/.test(r.salida || ''),
       'no repite el saludo: la siembra en memoria hizo su trabajo', r.salida);
    ok(/Miguel/.test(r.salida || ''), 'y usa el nombre que acaba de dar');
  }

  await limpiar();
  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
}

// Una consulta de solo lectura contra la base, para mirar lo que dejó el
// workflow. Devuelve null si no hay credenciales de Supabase, y las pruebas de
// arriba lo tratan como "no se pudo comprobar" en vez de como un fallo.
async function mirar(sql) {
  const REF = process.env.SUPABASE_PROJECT_REF, TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  if (!REF || !TOKEN) return null;
  const cuerpo = JSON.stringify({ query: sql.split('$T').join(`'${TELEFONO}'`) });
  return new Promise((resolve) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(t).toString('utf8'))[0] ?? null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(cuerpo); req.end();
  });
}

// Borra el lead de humo y lo que dejó colgando.
async function limpiar() {
  const REF = process.env.SUPABASE_PROJECT_REF, TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  if (!REF || !TOKEN) { console.log(c.gris(`\n  (sin credenciales de Supabase: borra a mano el lead ${TELEFONO})`)); return; }
  const sql = `delete from mensajes_fragmentos where telefono = '${TELEFONO}';
               delete from n8n_chat_histories where session_id = '${TELEFONO}';
               delete from envios_medios where lead_id in (select id from leads where telefono = '${TELEFONO}');
               delete from citas where telefono = '${TELEFONO}';
               delete from agenda_reservas where lead_id in (select id from leads where telefono = '${TELEFONO}');
               delete from leads where telefono = '${TELEFONO}';`;
  const cuerpo = JSON.stringify({ query: sql });
  await new Promise((resolve) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(cuerpo); req.end();
  });
  console.log(c.gris(`\n  lead de humo borrado (${TELEFONO})`));
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); limpiar().then(() => process.exit(1)); });
