#!/usr/bin/env node
//
// Banco de pruebas del embudo de Angie Otero.
//
// Corre conversaciones completas contra la base REAL, ejecutando las mismas
// queries que tienen los nodos de n8n -- se leen de los .json del workflow, no
// se copian aqui, para que la prueba no pueda quedar desincronizada del nodo.
//
// Lo unico simulado es el transporte: en vez de hacer POST a YCloud, imprime el
// mensaje que habria salido, en el orden en que habria salido. Y agendar_cita
// va con doble por Google Calendar.
//
// Lo que SI prueba: que el guion salga completo y en orden, que los rotulos
// digan el precio correcto para esa cantidad de personas, que el
// anti-repeticion no mande dos veces lo mismo, que ningun globo pase de 600
// caracteres, y que el turno respete las reglas de formato del prompt.
//
// Lo que NO prueba: si Gemini obedece el prompt. Para eso hace falta la
// GOOGLE_GEMINI_API_KEY, que hoy esta vacia en .env. Los turnos del agente que
// hay mas abajo son los que el prompt manda escribir, redactados a mano.
//
// Uso:  node scripts/banco-pruebas.js [numero-de-caso]

const https = require('https');
const fs = require('fs');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cargalos del .env.');
  process.exit(1);
}

// 280 es el techo de lo que ESCRIBE el agente. El guion del paquete no pasa
// por este lint: es una lista, va en tres partes y llega hasta ~480.
const MAX_GLOBO = 280;
const c = { gris: s => `\x1b[90m${s}\x1b[0m`, verde: s => `\x1b[32m${s}\x1b[0m`,
            rojo: s => `\x1b[31m${s}\x1b[0m`, ama: s => `\x1b[33m${s}\x1b[0m`,
            cyan: s => `\x1b[36m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

// --------------------------------------------------------------------------
// Acceso a la base
// --------------------------------------------------------------------------

function consulta(sqlTexto) {
  const cuerpo = JSON.stringify({ query: sqlTexto });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      // Se acumulan BUFFERS y se concatenan al final, no strings.
      // Con `d += chunk` cada trozo se decodifica por separado, y un emoji que
      // caiga partido entre dos chunks se convierte en dos mitades invalidas:
      // el 🎈 de Primera Comunion salia como "???" y parecia dato corrupto en
      // la base cuando la base estaba bien. Verificado el 2026-08-26.
      const trozos = [];
      res.on('data', x => trozos.push(x));
      res.on('end', () => {
        const d = Buffer.concat(trozos).toString('utf8');
        let j; try { j = JSON.parse(d); } catch { return reject(new Error(d.slice(0, 400))); }
        if (!Array.isArray(j)) return reject(new Error(JSON.stringify(j).slice(0, 400)));
        resolve(j);
      });
    });
    req.on('error', reject);
    req.write(cuerpo); req.end();
  });
}

// El endpoint de la Management API no acepta parametros, asi que $1..$n se
// sustituyen aqui. Es solo para el banco: los nodos si van parametrizados.
function ligar(sqlTexto, params) {
  let out = sqlTexto;
  params.forEach((v, i) => {
    const lit = v === null || v === undefined ? 'null'
      : typeof v === 'number' ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
    out = out.split('$' + (i + 1)).join(lit);
  });
  return out;
}

// Las queries salen del workflow, no de aqui: si alguien toca el nodo y no toca
// la prueba, la prueba corre el nodo nuevo igual.
const principal = JSON.parse(fs.readFileSync('n8n/workflow-angie-otero.json', 'utf8'));
const subMedios = JSON.parse(fs.readFileSync('n8n/workflow-enviar-medios.json', 'utf8'));
const subSeparar = JSON.parse(fs.readFileSync('n8n/workflow-separar-fecha.json', 'utf8'));
const nodo = (wf, nombre) => {
  const n = wf.nodes.find(x => x.name === nombre);
  if (!n) throw new Error('no existe el nodo ' + nombre);
  return n.parameters.query;
};

// --------------------------------------------------------------------------
// Transcripcion
// --------------------------------------------------------------------------

const chat = [];
const hallazgos = [];
let casoActual = '';

function anota(nivel, texto) {
  hallazgos.push({ caso: casoActual, nivel, texto });
}

function mensaje(quien, texto, extra) {
  chat.push({ quien, texto, extra });
  const etiqueta = { cliente: c.cyan('CLIENTE  '), agente: c.verde('ANGIE    '),
                     herramienta: c.ama('SISTEMA  '), media: c.ama('MEDIA    ') }[quien];
  const largo = texto.length > 90 ? texto.slice(0, 88).replace(/\n/g, ' ⏎ ') + '…' : texto.replace(/\n/g, ' ⏎ ');
  console.log(`  ${etiqueta} ${largo} ${c.gris('(' + texto.length + ')')}${extra ? ' ' + c.gris(extra) : ''}`);
}

// El lint solo mira lo que escribe el AGENTE. Lo que manda la herramienta es
// texto del negocio y ya viene cortado por la migracion.
function revisarTurno(globos, n) {
  if (globos.length > 4)
    anota('warn', `turno ${n}: turno de ${globos.length} globos (el prompt permite 4)`);
  globos.forEach((g, i) => {
    if (g.length > MAX_GLOBO)
      anota('error', `turno ${n}: globo ${i + 1} de ${g.length} caracteres: WhatsApp le pone "Leer más"`);
    if (/\*\*|^#{1,6}\s|^\s*-\s/m.test(g))
      anota('error', `turno ${n}: globo ${i + 1} lleva Markdown que WhatsApp no interpreta: ${JSON.stringify(g.slice(0, 40))}`);
    if (/https?:\/\/\S+\s+\S/.test(g))
      anota('error', `turno ${n}: globo ${i + 1} tiene texto pegado despues de un link`);
  });
  // Sin los links: las URLs de TikTok e Instagram llevan un ? de query string
  // y contaban como preguntas del agente.
  const sinLinks = globos.map(g => g.replace(/https?:\/\/\S+/g, ''));
  const preguntas = sinLinks.join(' ').split('?').length - 1;
  if (preguntas > 1) anota('warn', `turno ${n}: ${preguntas} preguntas en un mismo turno`);
  // Y el turno de redes es la excepcion escrita en el prompt: la pregunta puede
  // quedar antes del final porque los links SIEMPRE cierran el turno.
  const soloLink = g => /^https?:\/\/\S+$/.test(g.trim());
  const ultimoNoLink = globos.reduce((acc, g, i) => (soloLink(g) ? acc : i), -1);
  const conPregunta = sinLinks.findIndex(g => g.includes('?'));
  if (conPregunta >= 0 && conPregunta !== ultimoNoLink)
    anota('warn', `turno ${n}: la pregunta no va en el ultimo globo`);
}

// --------------------------------------------------------------------------
// Herramientas
// --------------------------------------------------------------------------

async function enviarMedios(ctx, a) {
  const tel = ctx.telefono;
  let enviados = 0;

  const guion = await consulta(ligar(nodo(subMedios, 'Guion Cotización'),
    [a.categoria, a.referencia || '', tel, a.tipo_evento || '', a.nombre_cliente || '']));
  for (const g of guion) mensaje('herramienta', g.mensaje, '← guion');

  const medios = await consulta(ligar(nodo(subMedios, 'Seleccionar Medios'),
    [a.categoria, a.referencia || '', tel, a.tipo_medio || 'ambos',
     a.invitados == null ? null : Number(a.invitados)]));

  for (const m of medios) {
    if (!m.id) continue;
    mensaje('media', `[${m.tipo}] ${m.caption || '(sin caption)'}`, '← ' + m.descripcion);
    await consulta(ligar('select fn_registrar_envio($1::uuid, $2::text)', [m.id, tel]));
    enviados++;
  }

  if (enviados === 0) {
    const diag = await consulta(ligar(nodo(subMedios, 'Diagnóstico'),
      [a.categoria, a.referencia || '', a.tipo_medio || 'ambos', tel]));
    const r = diag[0] || {};
    return { resultado: r.resultado || r.mensaje || JSON.stringify(r) };
  }
  return { resultado: `Se enviaron ${enviados} piezas y ${guion.length} mensajes de cotizacion.`,
           piezas: enviados, globos_guion: guion.length };
}

const herramientas = {
  enviar_medios: enviarMedios,

  consultar_precios_sedes: (ctx, a) =>
    consulta(ligar(nodo(principal, 'consultar_precios_sedes'), [Number(a.invitados), ctx.telefono])),

  consultar_inclusiones_evento: (ctx, a) =>
    consulta(ligar(nodo(principal, 'consultar_inclusiones_evento'), [a.tipo_evento])),

  consultar_servicios_upselling: () =>
    consulta(nodo(principal, 'consultar_servicios_upselling')),

  verificar_disponibilidad_evento: (ctx, a) =>
    consulta(ligar(nodo(principal, 'verificar_disponibilidad_evento'), [a.nombre_sede, a.fecha])),

  separar_fecha_evento: (ctx, a) =>
    consulta(ligar(nodo(subSeparar, 'Separar Fecha'),
      [a.nombre_sede, a.fecha, a.nombre_cliente, ctx.telefono, a.telefono_contacto])),

  cerrar_seguimiento: (ctx) =>
    consulta(ligar(nodo(principal, 'cerrar_seguimiento'), [ctx.telefono])),

  // Doble: la cita real pasa por Google Calendar, que no se toca desde aqui.
  agendar_cita: (ctx, a) => {
    const dur = a.tipo_cita === 'llamada' ? 20 : 30;
    const d = new Date(a.fecha + 'T12:00:00');
    const dia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getUTCDay()];
    return Promise.resolve([{ resultado: `Cita agendada: ${dia} ${a.fecha} a las ${a.hora}, ${dur} minutos.`,
                              dia_semana: dia, duracion_min: dur, simulada: true }]);
  },
};

// --------------------------------------------------------------------------
// Motor
// --------------------------------------------------------------------------

// Antes de las conversaciones: LOS SIETE paquetes, no solo los cinco que salen
// en los casos. Se corre la query real del nodo `Guion Cotización` con el
// nombre canonico y con una variante sin tilde, y se exige el guion completo:
// antesala + 3 partes + obsequios. Un paquete que no resuelve manda los catorce
// videos sin cotizacion delante, sin error y sin rastro en el log.
async function revisarPaquetes() {
  console.log('\n' + c.neg('─'.repeat(100)));
  console.log(c.neg('  Chequeo previo: los 7 paquetes'));
  console.log(c.neg('─'.repeat(100)));

  const variante = {
    '15 Años': '15 Anos', 'Matrimonio': 'boda', 'Grado': 'graduacion',
    'Cumpleaños': 'Cumpleanos', 'Empresa': 'empresarial',
    'Primera Comunión': 'Primera Comunion', 'Baby Shower': 'BabyShower',
  };
  const tel = 'test-ref-preflight';
  const paquetes = await consulta('select nombre_paquete from tipos_evento order by nombre_paquete');

  for (const { nombre_paquete } of paquetes) {
    for (const entrada of [nombre_paquete, variante[nombre_paquete]]) {
      if (!entrada) continue;
      // El telefono no existe como lead, asi que no hay envios previos que
      // filtren: el guion sale entero siempre que el tipo resuelva.
      const g = await consulta(ligar(nodo(subMedios, 'Guion Cotización'),
        ['sede', 'todas', tel, entrada, 'Prueba']));
      const ok = g.length === 5;
      if (!ok) {
        casoActual = 'Chequeo previo de paquetes';
        anota('error', `"${entrada}" (${nombre_paquete}) devolvio ${g.length} globos y son 5`);
      }
      const cual = (g[1] || {}).mensaje ? g[1].mensaje.split('\n')[0] : '(sin cotizacion)';
      console.log(`  ${ok ? c.verde('✓') : c.rojo('✗')} ${entrada.padEnd(20)} → ${cual.slice(0, 46)}`);
    }
  }
}

async function correr(caso) {
  casoActual = caso.nombre;
  console.log('\n' + c.neg('═'.repeat(100)));
  console.log(c.neg('  ' + caso.nombre));
  console.log(c.neg('═'.repeat(100)));

  await consulta(ligar(nodo(principal, 'Upsert Lead'), [caso.telefono, caso.perfil || null]));
  if (caso.preparar) for (const s of caso.preparar) await consulta(s);

  let turno = 0;
  for (const t of caso.turnos) {
    turno++;
    console.log(c.gris(`\n  ── turno ${turno} ──`));
    mensaje('cliente', t.cliente);
    const antes = chat.length;

    for (const llamada of t.tools || []) {
      const fn = herramientas[llamada.t];
      if (!fn) throw new Error('herramienta desconocida: ' + llamada.t);
      const r = await fn(caso, llamada.args || {});
      const resumen = Array.isArray(r) ? (r[0] ? JSON.stringify(r[0]).slice(0, 150) : '(0 filas)')
                                       : JSON.stringify(r).slice(0, 150);
      console.log(`  ${c.gris('herramienta')} ${c.gris(llamada.t)} ${c.gris('→ ' + resumen)}`);
      if (llamada.revisar) llamada.revisar(r, anota);
    }

    (t.globos || []).forEach(g => mensaje('agente', g));
    revisarTurno(t.globos || [], turno);
    const recibidos = chat.length - antes;
    if (recibidos > 6)
      anota('info', `turno ${turno}: el cliente recibe ${recibidos} mensajes seguidos`);
  }
}

async function limpiar(casos) {
  for (const caso of casos) {
    for (const extra of caso.limpiarExtra || []) await consulta(extra);
    await consulta(ligar(
      `delete from agenda_reservas where lead_id in (select id from leads where telefono = $1);
       delete from citas where telefono = $1;
       delete from envios_medios where lead_id in (select id from leads where telefono = $1);
       delete from leads where telefono = $1;`, [caso.telefono]));
  }
}

async function main() {
  const casos = require('./casos-prueba.js');
  const filtro = process.argv[2] ? [casos[Number(process.argv[2]) - 1]] : casos;
  await limpiar(filtro);
  try {
    if (!process.argv[2]) await revisarPaquetes();
    for (const caso of filtro) await correr(caso);
  } finally {
    await limpiar(filtro);
  }

  console.log('\n' + c.neg('═'.repeat(100)));
  console.log(c.neg('  HALLAZGOS'));
  console.log(c.neg('═'.repeat(100)));
  if (!hallazgos.length) { console.log('  ' + c.verde('sin hallazgos')); return; }
  let caso = null;
  for (const h of hallazgos) {
    if (h.caso !== caso) { caso = h.caso; console.log('\n  ' + c.neg(caso)); }
    const marca = { error: c.rojo('ERROR'), warn: c.ama('AVISO'), info: c.gris('nota ') }[h.nivel];
    console.log(`    ${marca} ${h.texto}`);
  }
  const errores = hallazgos.filter(h => h.nivel === 'error').length;
  console.log('\n  ' + (errores ? c.rojo(errores + ' errores') : c.verde('0 errores')) +
    c.gris(`, ${hallazgos.filter(h => h.nivel === 'warn').length} avisos, ${hallazgos.filter(h => h.nivel === 'info').length} notas`));
}

main().catch(e => { console.error('\n' + c.rojo('FALLO: ') + e.message); process.exit(1); });
