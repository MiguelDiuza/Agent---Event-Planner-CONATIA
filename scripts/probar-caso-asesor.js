#!/usr/bin/env node
//
// El traspaso al asesor: después de la cita, el caso ya no es del bot.
//
// Prueba las dos mitades, que fallan de formas distintas y las dos calladas:
//
// 1. LA DETECCIÓN (contra la base). Corre las queries tal como están en los
//    nodos `Caso del Asesor`, `Cerrar Caso` y `Escalar Caso Sin Aviso` -- se
//    leen del .json, no se copian. Lo que se comprueba es que el traspaso
//    salte cuando tiene que saltar y NO salte cuando no: una cita que todavía
//    no ha pasado no es un caso del asesor, y una ya avisada tampoco. Un falso
//    positivo aquí calla al bot en un chat que iba bien.
//
// 2. EL AVISO (sin red). Arma el cuerpo del nodo `Avisar al Asesor` y revisa
//    las cuatro variables de la plantilla contra las reglas de Meta, que se
//    aplican al ENVIAR y no al crear: una variable no puede traer saltos de
//    línea ni cadenas de espacios, ni pasar de 1024 caracteres. Un cliente que
//    escribe en tres renglones -- o un audio transcrito largo -- haría que el
//    aviso saliera rechazado, y el nodo tiene `onError`, así que nadie se
//    entera: el asesor simplemente no recibe nada.
//
// Y de paso comprueba que la respuesta al cliente sobreviva a `Dividir
// Mensajes`, que es el filtro que decide qué sale por WhatsApp.
//
//   node --env-file=.env scripts/probar-caso-asesor.js
//   node --env-file=.env scripts/probar-caso-asesor.js --local   # contra supabase local

const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOCAL = process.argv.includes('--local');
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const CONTENEDOR = 'supabase_db_Agent---Event-Planner-CONATIA';
const TEL = '+573009998877';

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const chequeo = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};

// --------------------------------------------------------------------------
// Los nodos, leídos del repo
// --------------------------------------------------------------------------
const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflow-angie-otero.json'), 'utf8'));
const nodo = (n) => {
  const x = wf.nodes.find(y => y.name === n);
  if (!x) throw new Error('no existe el nodo ' + n);
  return x;
};

// --------------------------------------------------------------------------
// Hablar con la base
// --------------------------------------------------------------------------
// En local se entra por el contenedor de Supabase: en esta máquina no hay psql
// y el repo no tiene node_modules, así que tampoco hay driver de Postgres.
// Contra producción se usa la Management API, igual que el resto del banco.
const psql = (sql) => execFileSync('docker',
  ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
  { encoding: 'utf8' });

function remota(sql) {
  const cuerpo = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        const d = Buffer.concat(t).toString('utf8');
        let j; try { j = JSON.parse(d); } catch { return reject(new Error(d.slice(0, 400))); }
        if (!Array.isArray(j)) return reject(new Error(JSON.stringify(j).slice(0, 400)));
        resolve(j);
      });
    });
    req.on('error', reject);
    req.write(cuerpo); req.end();
  });
}

// Filas como objetos, venga de donde venga. En local se envuelve la query en un
// CTE que la devuelve como JSON: así no hay que adivinar los nombres ni los
// tipos de las columnas, y el mismo envoltorio sirve para un `select` y para un
// `update ... returning`.
async function consulta(sql) {
  if (!LOCAL) return remota(sql);
  const envuelta = `with t as (\n${sql}\n) select coalesce(json_agg(t), '[]'::json) from t`;
  return JSON.parse(psql(envuelta).trim());
}

// Para lo que no devuelve filas (sembrar y limpiar). Admite varias sentencias.
async function ejecutar(sql) {
  if (LOCAL) { psql(sql); return; }
  await remota(sql);
}

// El endpoint no acepta parámetros: $1..$n se sustituyen aquí. Mismo criterio
// que `probar-ramas.js` -- si el nodo cambia de firma, que lo diga con nombre.
function ligar(sql, params) {
  const pedidos = new Set((sql.match(/\$\d+/g) || []).map(s => Number(s.slice(1))));
  const faltan = [...pedidos].filter(n => n > params.length).sort((a, b) => a - b);
  if (faltan.length) {
    throw new Error(`la query usa ${faltan.map(n => '$' + n).join(', ')} y solo le pasas ` +
                    `${params.length} parámetro(s): el nodo cambió de firma`);
  }
  let out = sql;
  params.forEach((v, i) => {
    const lit = v === null || v === undefined ? 'null'
      : typeof v === 'number' ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
    out = out.split('$' + (i + 1)).join(lit);
  });
  return out;
}

// --------------------------------------------------------------------------
// Evaluar una expresión de n8n con datos de mentira aguas arriba
// --------------------------------------------------------------------------
function evaluar(expresion, nodos) {
  const $ = nombre => {
    if (!(nombre in nodos)) throw new Error(`la expresión llama al nodo "${nombre}", que no está aguas arriba`);
    return { item: { json: nodos[nombre] } };
  };
  return new Function('$', 'return (' + expresion.replace(/^=\{\{/, '').replace(/\}\}$/, '') + ')')($);
}

async function main() {
  if (LOCAL) {
    console.log(c.gris('\ncontra la base LOCAL, por el contenedor ' + CONTENEDOR));
  } else if (!REF || !TOKEN) {
    console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env, o usa --local.');
    process.exitCode = 1;
    return;
  }

  // ------------------------------------------------------------------------
  console.log(c.neg('\nEl aviso al asesor: las cuatro variables de la plantilla'));
  // ------------------------------------------------------------------------
  // El caso peor a propósito: el cliente escribió en varios renglones, con
  // espacios de sobra, y encima largo. Es lo que manda un audio transcrito.
  const mensajeFeo = 'Hola   buenas\n\nquería   saber   una cosa\nsobre lo que hablamos ayer. '
    + 'Me dijo que me hacía un descuento. '.repeat(40);

  const cuerpo = JSON.parse(evaluar(nodo('Avisar al Asesor').parameters.jsonBody, {
    'Caso del Asesor': { nombre_cliente: 'María Fernanda Ruiz', cuando_legible: 'martes 25 de agosto de 2026' },
    'Upsert Lead': { telefono: TEL },
    'Reclamar Fragmentos': { texto: mensajeFeo },
  }));

  chequeo(cuerpo.type === 'template',
    'va como plantilla y no como texto libre: fuera de la ventana de 24 h es lo único que sale');
  chequeo(cuerpo.template.name === 'aviso_caso_asesor',
    `manda la plantilla ${cuerpo.template.name}`,
    'tiene que ser la misma que crea scripts/plantilla-asesor.js');

  const params = cuerpo.template.components[0].parameters.map(p => p.text);
  chequeo(params.length === 4, `lleva las 4 variables de la plantilla (${params.length})`);
  params.forEach((v, i) => {
    const n = '{{' + (i + 1) + '}}';
    chequeo(!/[\n\r]/.test(v), `${n} sin saltos de línea`, JSON.stringify(v.slice(0, 60)));
    chequeo(!/ {5}/.test(v), `${n} sin cadenas de espacios`);
    chequeo(v.length > 0 && v.length <= 1024, `${n} con largo válido (${v.length})`);
  });
  chequeo(params[2] === TEL, '{{3}} lleva el teléfono del cliente, para que el asesor lo pueda marcar');

  // Un cliente sin nombre no puede dejar una variable vacía: Meta la rechaza.
  const sinNada = JSON.parse(evaluar(nodo('Avisar al Asesor').parameters.jsonBody, {
    'Caso del Asesor': { nombre_cliente: null, cuando_legible: null },
    'Upsert Lead': { telefono: TEL },
    'Reclamar Fragmentos': { texto: '   ' },
  }));
  chequeo(sinNada.template.components[0].parameters.every(p => p.text.length > 0),
    'con los datos vacíos ninguna variable queda en blanco (Meta rechaza el envío)');

  // ------------------------------------------------------------------------
  console.log(c.neg('\nLo que le llega al cliente'));
  // ------------------------------------------------------------------------
  const expr = nodo('Respuesta Traspaso').parameters.assignments.assignments[0].value;
  const texto = evaluar(expr, { 'Caso del Asesor': { nombre_cliente: 'María Fernanda Ruiz' } });
  // Se pasa por el filtro REAL de `Dividir Mensajes`: es el que decide qué sale
  // por WhatsApp, y descarta en silencio lo que huele a fuga de la herramienta.
  const partes = new Function('$json', nodo('Dividir Mensajes').parameters.jsCode)({ output: texto })
    .map(x => x.json);
  chequeo(partes.length === 2, `sale en ${partes.length} globos`);
  chequeo(!partes.some(p => p.fuga), 'el filtro de fugas no se lo come');
  chequeo(/María/.test(partes[0].output) && !/Fernanda/.test(partes[0].output),
    'saluda solo con el primer nombre');
  chequeo(!partes.some(p => /\|\|\|/.test(p.output)), 'el separador de globos no se le escapa al cliente');
  partes.forEach(p => console.log(c.gris('      ' + p.output)));

  const anon = evaluar(expr, { 'Caso del Asesor': { nombre_cliente: null } });
  chequeo(/^¡Hola! /.test(anon), 'sin nombre saluda igual, sin dejar el hueco a la vista',
    JSON.stringify(anon.slice(0, 40)));

  // ------------------------------------------------------------------------
  console.log(c.neg('\nLa detección: cuándo el caso pasa a ser del asesor'));
  // ------------------------------------------------------------------------
  const qCaso = nodo('Caso del Asesor').parameters.query;
  const qCerrar = nodo('Cerrar Caso').parameters.query;
  const qEscalar = nodo('Escalar Caso Sin Aviso').parameters.query;
  const caso = async () => (await consulta(ligar(qCaso, [TEL])))[0];
  const limpiar = () => ejecutar(ligar(
    `delete from citas where telefono = $1; delete from leads where telefono = $1;`, [TEL]));

  try {
    await limpiar();
    await ejecutar(ligar(`insert into leads (telefono, nombre) values ($1, 'Prueba Asesor');`, [TEL]));

    let r = await caso();
    chequeo(r.hay_caso === false, 'un cliente sin citas no es un caso del asesor');

    await ejecutar(ligar(
      `insert into citas (tipo_cita, nombre_cliente, telefono, inicio, fin, lead_id, google_event_id)
       select 'llamada', 'Prueba Asesor', $1, now() + interval '2 days',
              now() + interval '2 days' + interval '30 min',
              (select id from leads where telefono = $1), 'ev-prueba-futura';`, [TEL]));
    r = await caso();
    chequeo(r.hay_caso === false, 'con la cita todavía por delante, tampoco: el bot sigue atendiendo');

    await ejecutar(ligar(
      `insert into citas (tipo_cita, nombre_cliente, telefono, inicio, fin, lead_id, google_event_id)
       select 'llamada', 'Prueba Asesor', $1,
              timestamptz '2026-08-25 19:30:00-05', timestamptz '2026-08-25 20:00:00-05',
              (select id from leads where telefono = $1), 'ev-prueba-pasada';`, [TEL]));
    r = await caso();
    chequeo(r.hay_caso === true, 'con la cita ya pasada, el caso es del asesor');
    chequeo(r.cuando_legible === 'martes 25 de agosto de 2026',
      `la fecha va en español y no se corre de día: "${r.cuando_legible}"`,
      'una cita de 7:30 p. m. en Bogotá cae al día siguiente si se mira en UTC');

    const cerrado = await consulta(ligar(qCerrar, [r.id_cita, TEL]));
    chequeo(cerrado[0].resultado === 'avisado y bot en pausa', `cerrar el caso: "${cerrado[0].resultado}"`);

    r = await caso();
    chequeo(r.hay_caso === false, 'ya avisado, no se vuelve a avisar');
    const pausa = await consulta(ligar(`select requiere_humano from leads where telefono = $1`, [TEL]));
    chequeo(pausa[0].requiere_humano === true, 'y el bot queda en pausa en ese chat');

    // El camino del aviso que NO salió.
    await ejecutar(ligar(
      `update citas set notificado_asesor_en = null where telefono = $1;
       update leads set requiere_humano = false where telefono = $1;`, [TEL]));
    const esc = await consulta(ligar(qEscalar, [TEL]));
    chequeo(esc[0].requiere_humano === true, 'si el aviso falla, el bot se pausa igual');
    r = await caso();
    chequeo(r.hay_caso === true,
      'pero la cita queda SIN marcar: el asesor no se enteró, y el aviso se puede reintentar');
  } finally {
    await limpiar();
  }

  console.log(fallos ? c.rojo(`\n${fallos} fallo(s)\n`) : c.verde('\nsin fallos\n'));
  process.exitCode = fallos ? 1 : 0;
}

main().catch(e => { console.error('\n' + c.rojo('FALLO: ') + e.message); process.exitCode = 1; });
