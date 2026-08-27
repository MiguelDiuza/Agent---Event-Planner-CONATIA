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

  await limpiar();
  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
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
