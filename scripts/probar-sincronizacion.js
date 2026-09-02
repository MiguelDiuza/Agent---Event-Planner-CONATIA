#!/usr/bin/env node
//
// La vuelta del Excel a la agenda: `workflow-sincronizar-hoja.json`.
//
// Corre el workflow entero SIN n8n y SIN Google. El código de los tres nodos
// `Code` se lee del .json del repo -- no se copia aquí -- y la query se lee del
// nodo `Sincronizar`, así que si alguien cambia un nodo y no toca esto, esto
// falla. Lo único de mentira son las filas de la hoja, que van escritas como
// las escribiría una persona: con la sede sin tildes, con el nombre de un
// salón que no existe, con la fecha en el formato que le salga.
//
// Lo que de verdad se comprueba, y por qué cada cosa:
//
//   * QUE LA FECHA QUEDE PROTEGIDA. No basta con que la fila entre en
//     `agenda_reservas`: lo que importa es que después
//     `fn_verificar_disponibilidad_evento` -- que es lo que consulta el agente
//     antes de prometer una fecha -- diga OCUPADA. Es el único aserto que
//     mide el motivo por el que esto existe.
//   * QUE NADA ENTRE NI SE PIERDA EN SILENCIO. Cada fila sale con una nota
//     para su celda de la hoja. Una fila mal escrita que no produce nota es
//     una fila que nadie va a arreglar nunca.
//   * QUE NO PISE AL BOT. Una fila del Excel no puede tocar una fecha que
//     apartó Angie: esa tiene lead y evento en Calendar.
//   * QUE BORRAR NO LIBERE. Solo libera la columna `cancelada`, y solo lo que
//     apartó una persona.
//   * QUE LA SEGUNDA CORRIDA NO ESCRIBA NADA. Corre cada quince minutos sobre
//     las mismas 113 filas: si cada pasada reescribiera la hoja, en un día
//     habría 96 versiones y la cuota de Sheets se acabaría sola.
//
//   node --env-file=.env scripts/probar-sincronizacion.js --local
//   node --env-file=.env scripts/probar-sincronizacion.js            # producción

const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOCAL = process.argv.includes('--local');
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const CONTENEDOR = 'supabase_db_Agent---Event-Planner-CONATIA';

// Todas las fechas de prueba viven en 2029, lejos de las 113 reales (la última
// es de diciembre de 2027) y lejos de cualquier cosa que el bot pueda apartar
// mientras esto corre. La limpieza del final borra ese año entero.
const ANO = 2029;

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const chequeo = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};

// --------------------------------------------------------------------------
// Los nodos, leídos del repo
// --------------------------------------------------------------------------
const wf = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'n8n', 'workflow-sincronizar-hoja.json'), 'utf8'));
const nodo = (n) => {
  const x = wf.nodes.find(y => y.name === n);
  if (!x) throw new Error('no existe el nodo ' + n);
  return x;
};

// Un nodo Code de n8n es el cuerpo de una función con `$input` y `$` dentro.
// Aquí se le pasan los dos a mano: es el mismo truco de `probar-excel.js`.
function correrCode(nombre, entrada, aguasArriba) {
  const $input = { first: () => ({ json: entrada }) };
  const $ = (n) => {
    if (!(n in aguasArriba)) {
      throw new Error(`"${nombre}" llama al nodo "${n}", que no está aguas arriba`);
    }
    const items = aguasArriba[n];
    return { first: () => items[0], all: () => items, item: items[0] };
  };
  return new Function('$input', '$', nodo(nombre).parameters.jsCode)($input, $);
}

// --------------------------------------------------------------------------
// Hablar con la base
// --------------------------------------------------------------------------
// Igual que `probar-caso-asesor.js`: en local por el contenedor, porque en
// esta máquina no hay psql ni driver de Postgres; contra producción, por la
// Management API.
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

async function consulta(sql) {
  if (!LOCAL) return remota(sql);
  const envuelta = `with t as (\n${sql}\n) select coalesce(json_agg(t), '[]'::json) from t`;
  return JSON.parse(psql(envuelta).trim());
}

async function ejecutar(sql) {
  if (LOCAL) { psql(sql); return; }
  await remota(sql);
}

// El endpoint no acepta parámetros: $1..$n se sustituyen aquí, con el mismo
// criterio que el resto del banco -- si la query del nodo cambia de firma, que
// se queje con nombre y apellido en vez de devolver cero filas.
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
// La hoja de mentira
// --------------------------------------------------------------------------
// Las filas llegan como las devuelve Sheets con UNFORMATTED_VALUE: una fecha
// de verdad es un NÚMERO (días desde el 30/12/1899), no un texto. 47285 es el
// 16 de junio de 2029, y va a pelo -- no calculado con la misma fórmula que
// usa el nodo -- para que un error de época no se cancele solo.
const SERIE_2029_06_16 = 47285;

// Fila de la hoja: [anotado_en, fecha, legible, sede, cliente, telefono,
//                   origen, google_event_id, cancelada, sincronizado]
const fila = (o = {}) => [
  o.anotado || '', o.fecha === undefined ? '' : o.fecha, o.legible || '',
  o.sede || '', o.cliente || '', o.telefono || '',
  o.origen || '', o.evento || '', o.cancelada || '', o.nota || '',
];

async function main() {
  console.log(c.gris(LOCAL
    ? `\ncontra la base LOCAL, por el contenedor ${CONTENEDOR}`
    : '\ncontra PRODUCCIÓN, por la Management API'));

  if (!LOCAL && (!REF || !TOKEN)) {
    console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env, o usa --local.');
    process.exitCode = 1;
    return;
  }

  const qSync = nodo('Sincronizar').parameters.query;
  const limpiar = () => ejecutar(
    `delete from agenda_reservas where fecha_solicitada >= date '${ANO}-01-01'`);

  // Una corrida entera: hoja -> Leer Filas -> Sincronizar -> Armar Nota.
  // Devuelve todo lo que produjo cada nodo, que es lo que se va a mirar.
  async function corrida(valores) {
    const leidas = correrCode('Leer Filas', { values: valores }, {});
    if (!leidas.length) return { filas: [], resultados: [], notas: [], nuevas: [] };

    const entrada = leidas[0].json;
    const res = await consulta(ligar(qSync, [JSON.stringify(entrada.filas)]));
    const items = res.map(r => ({ json: r }));

    const aguasArriba = { 'Leer Filas': [{ json: entrada }], 'Sincronizar': items };
    const notas = correrCode('Armar Nota', {}, aguasArriba);
    const nuevas = correrCode('Nuevas en Calendar', {}, aguasArriba);
    return {
      filas: entrada.filas, resultados: res,
      notas: notas.length ? notas[0].json.data : [],
      nuevas: nuevas.map(i => i.json),
    };
  }

  try {
    await limpiar();

    // ----------------------------------------------------------------------
    console.log(c.neg('\nLa primera corrida: la hoja como la escribe el equipo'));
    // ----------------------------------------------------------------------
    const hoja = [
      // 2  una fecha escrita a mano, con la sede tal cual está en el catálogo
      fila({ fecha: `${ANO}-06-02`, sede: 'Sede Norte', cliente: 'MARIA RUIZ', telefono: '+573001234567' }),
      // 3  la misma idea, pero la sede tecleada de prisa: sin tildes, en minúsculas
      fila({ fecha: `${ANO}-06-09`, sede: 'casa christians ciudad jardin', cliente: 'PEDRO GOMEZ' }),
      // 4  la fecha como fecha de verdad: llega como número de serie
      fila({ fecha: SERIE_2029_06_16, sede: 'Sede Norte', cliente: 'ANA LOPEZ' }),
      // 5  tecleada en formato colombiano, día primero
      fila({ fecha: '23/06/2029', sede: 'Sede Norte', cliente: 'LUIS TORO' }),
      // 6  una sede que no existe
      fila({ fecha: `${ANO}-06-30`, sede: 'Sede Nortte', cliente: 'DEDAZO' }),
      // 7  "Granada" son dos salones distintos, con precios distintos
      fila({ fecha: `${ANO}-07-07`, sede: 'Granada', cliente: 'AMBIGUA' }),
      // 8  la fecha ilegible
      fila({ fecha: 'el otro sabado', sede: 'Sede Norte', cliente: 'SIN FECHA' }),
      // 9  una fila que ya escribió el bot: no se vuelve a mirar
      fila({ fecha: `${ANO}-07-14`, sede: 'Sede Norte', cliente: 'DEL BOT', origen: 'Bot', evento: 'ev-1' }),
      // 10 una fila vacía, de las que quedan al borrar el contenido
      fila({}),
      // 11 una fecha que ya pasó
      fila({ fecha: '2020-01-01', sede: 'Sede Norte', cliente: 'VIEJA' }),
      // 12 algo raro en la columna `cancelada`
      fila({ fecha: `${ANO}-07-21`, sede: 'Sede Norte', cliente: 'OJO', cancelada: 'preguntar a Diana' }),
    ];

    const uno = await corrida(hoja);
    const por = (n) => uno.resultados.find(r => Number(r.fila) === n) || {};

    chequeo(uno.filas.length === 9,
      `de 11 filas se miran 9: la vacía y la del bot se saltan (${uno.filas.length})`);
    chequeo(por(2).resultado === 'nueva', 'la fecha escrita a mano entra en la agenda');
    chequeo(por(3).resultado === 'nueva' && por(3).sede === "Casa Christian's Ciudad Jardín",
      `"casa christians ciudad jardin" casa con el salón del catálogo (${por(3).sede})`,
      'sin esto, la tilde de Jardín y el apóstrofo de Christian\'s bastan para rechazar una fila bien escrita');
    chequeo(por(4).resultado === 'nueva' && por(4).fecha === `${ANO}-06-16`,
      `una fecha de verdad llega como número (${SERIE_2029_06_16}) y se lee ${por(4).fecha}`);
    chequeo(por(5).fecha === `${ANO}-06-23`,
      `23/06/2029 se lee día primero: ${por(5).fecha}`,
      'si se leyera mes primero, junio 23 sería el 6 de... nada, y la fila se perdería');
    chequeo(por(6).resultado === 'rechazada' && /no existe la sede/.test(por(6).detalle),
      `la sede inventada se rechaza: "${por(6).detalle}"`);
    chequeo(por(7).resultado === 'rechazada' && /2 sedes/.test(por(7).detalle),
      `"Granada" no se adivina: "${por(7).detalle}"`,
      'Gold y Premium son dos calendarios y dos listas de precios distintas');
    chequeo(por(8).resultado === 'rechazada' && /no entiendo la fecha/.test(por(8).detalle),
      `la fecha ilegible se rechaza: "${por(8).detalle}"`);
    chequeo(uno.resultados.every(r => Number(r.fila) !== 9),
      'la fila del bot ni se mira: ya la insertó él');
    chequeo(por(11).resultado === 'omitida' && /ya pasó/.test(por(11).detalle),
      'una fecha del pasado no se carga');
    chequeo(por(12).resultado === 'rechazada' && /cancelada/.test(por(12).detalle),
      `una nota suelta en la columna cancelada NO libera nada: "${por(12).detalle}"`,
      'interpretarla sería poner a la venta un sábado vendido');

    // Lo que de verdad importa: que el agente ya no pueda vender esa fecha.
    const disp = await consulta(
      `select fn_verificar_disponibilidad_evento('Sede Norte', date '${ANO}-06-02') as r`);
    chequeo(/^OCUPADA/.test(disp[0].r),
      'y el agente ya la ve OCUPADA: es para esto que existe todo lo demás',
      disp[0].r);

    const enBase = await consulta(
      `select estado, origen from agenda_reservas
        where fecha_solicitada = date '${ANO}-06-02'`);
    chequeo(enBase[0] && enBase[0].estado === 'separado' && enBase[0].origen === 'humano',
      "la fila queda con estado 'separado' y origen 'humano'",
      JSON.stringify(enBase[0]));

    // ----------------------------------------------------------------------
    console.log(c.neg('\nLo que se escribe de vuelta en la hoja'));
    // ----------------------------------------------------------------------
    const rango = (n) => uno.notas.filter(d => d.range === `Reservas!J${n}`)[0];
    chequeo(!!rango(2) && rango(2).values[0][0] === '✓ en la agenda',
      'la fila aceptada queda marcada en su propia celda');
    chequeo(!!rango(6) && /^✗ /.test(rango(6).values[0][0]),
      `el rechazo se ve al lado de la fila: "${rango(6) && rango(6).values[0][0]}"`,
      'nadie mira los logs de n8n: si el rechazo no está aquí, no está en ninguna parte');
    chequeo(uno.notas.filter(d => /^Reservas!J/.test(d.range)).length === 9,
      'las nueve filas miradas salen con nota, ninguna en silencio');
    chequeo(uno.notas.some(d => d.range === 'Reservas!G2' && d.values[0][0] === 'Confirmación humana'),
      'a la fila escrita a mano se le rellena `origen`');
    chequeo(!uno.notas.some(d => d.range === 'Reservas!G6'),
      'pero a una rechazada no: no está en la agenda de nadie');
    chequeo(uno.nuevas.length === 4 && uno.nuevas.every(n => n.resultado === 'nueva'),
      `a Calendar solo van las ${uno.nuevas.length} fechas nuevas`);
    chequeo(uno.nuevas.every(n => n.reserva && /^[0-9a-f-]{36}$/.test(n.reserva)),
      'y cada una lleva su id_reserva, para poder guardar el evento de vuelta');

    // ----------------------------------------------------------------------
    console.log(c.neg('\nLa segunda corrida, con la hoja ya anotada'));
    // ----------------------------------------------------------------------
    // La hoja tal como quedaría: cada fila con la nota que le escribieron.
    const anotada = hoja.map((f, i) => {
      const n = i + 2;
      const nota = uno.notas.find(d => d.range === `Reservas!J${n}`);
      const org = uno.notas.find(d => d.range === `Reservas!G${n}`);
      const copia = f.slice();
      if (nota) copia[9] = nota.values[0][0];
      if (org) copia[6] = org.values[0][0];
      return copia;
    });

    const dos = await corrida(anotada);
    chequeo(dos.notas.length === 0,
      'no reescribe ni una celda: en régimen esto corre 96 veces al día sobre las mismas filas',
      JSON.stringify(dos.notas).slice(0, 200));
    chequeo(dos.nuevas.length === 0, 'y no vuelve a crear los eventos de Calendar');
    chequeo(dos.resultados.filter(r => r.resultado === 'ya estaba').length === 4,
      'las cuatro que entraron salen ahora como "ya estaba"');
    const cuantas = await consulta(
      `select count(*)::int as n from agenda_reservas where fecha_solicitada >= date '${ANO}-01-01'`);
    chequeo(cuantas[0].n === 4, `y en la base siguen siendo 4 filas, no 8 (${cuantas[0].n})`);

    // ----------------------------------------------------------------------
    console.log(c.neg('\nBorrar no libera; la columna `cancelada`, sí'));
    // ----------------------------------------------------------------------
    // Se borran de la hoja las cuatro filas que habían entrado.
    const borrada = anotada.filter((f, i) => ![2, 3, 4, 5].includes(i + 2));
    await corrida(borrada);
    const trasBorrar = await consulta(
      `select fn_verificar_disponibilidad_evento('Sede Norte', date '${ANO}-06-02') as r`);
    chequeo(/^OCUPADA/.test(trasBorrar[0].r),
      'borrar la fila del Excel NO pone la fecha a la venta',
      'un borrado accidental vendería dos veces un sábado que ya tiene dueño');

    // Ahora sí, marcada.
    const conMarca = anotada.map((f, i) => {
      if (i + 2 !== 2) return f;
      const copia = f.slice(); copia[8] = 'sí'; return copia;
    });
    const tres = await corrida(conMarca);
    const cancelada = tres.resultados.find(r => Number(r.fila) === 2);
    chequeo(cancelada.resultado === 'liberada', 'marcada como cancelada, la fecha se libera');
    const libre = await consulta(
      `select fn_verificar_disponibilidad_evento('Sede Norte', date '${ANO}-06-02') as r`);
    chequeo(/^DISPONIBLE/.test(libre[0].r), 'y el agente vuelve a poder venderla', libre[0].r);
    chequeo(tres.notas.some(d => d.range === 'Reservas!J2' && d.values[0][0] === '✓ liberada'),
      'la hoja lo dice en la celda de al lado');

    const rastro = await consulta(
      `select estado from agenda_reservas where fecha_solicitada = date '${ANO}-06-02'`);
    chequeo(rastro.length === 1 && rastro[0].estado === 'disponible',
      "liberar no es borrar: la fila se queda en 'disponible' y con el nombre de quien la tenía");

    // Y una corrida más sin tocar nada: la nota de la liberada no debe bailar.
    const cuatro = await corrida(conMarca.map((f, i) => {
      if (i + 2 !== 2) return f;
      const copia = f.slice(); copia[9] = '✓ liberada'; return copia;
    }));
    chequeo(!cuatro.notas.some(d => d.range === 'Reservas!J2'),
      'y esa nota tampoco cambia en la corrida siguiente');

    // Volver a quitar la marca la vuelve a separar: es el "me equivoqué".
    const cinco = await corrida(anotada);
    chequeo(cinco.resultados.find(r => Number(r.fila) === 2).resultado === 'reactivada',
      'quitar la marca la vuelve a separar');

    // ----------------------------------------------------------------------
    console.log(c.neg('\nLo del bot no se toca'));
    // ----------------------------------------------------------------------
    await ejecutar(`insert into agenda_reservas
        (sede_id, fecha_solicitada, nombre_cliente, estado, origen, google_event_id)
      select id_sede, date '${ANO}-08-04', 'CLIENTE DE ANGIE', 'bloqueado_temporal', 'bot', 'ev-de-prueba'
        from sedes where nombre_sede = 'Sede Norte'`);

    const seis = await corrida([
      fila({ fecha: `${ANO}-08-04`, sede: 'Sede Norte', cliente: 'OTRO CLIENTE' }),
      fila({ fecha: `${ANO}-08-04`, sede: 'Sede Norte', cliente: 'OTRO CLIENTE', cancelada: 'sí' }),
    ]);
    chequeo(seis.resultados[0].resultado === 'choque' && /bot/.test(seis.resultados[0].detalle),
      `una fila del Excel no pisa lo que apartó el bot: "${seis.resultados[0].detalle}"`);
    chequeo(seis.resultados[1].resultado === 'choque',
      'y desde la hoja tampoco se libera: tiene lead y evento en Calendar');
    const delBot = await consulta(
      `select nombre_cliente, estado, google_event_id from agenda_reservas
        where fecha_solicitada = date '${ANO}-08-04'`);
    chequeo(delBot[0].nombre_cliente === 'CLIENTE DE ANGIE' &&
            delBot[0].estado === 'bloqueado_temporal' &&
            delBot[0].google_event_id === 'ev-de-prueba',
      'la fila del bot sigue intacta, con su evento',
      JSON.stringify(delBot[0]));
    chequeo(seis.notas.every(d => /^Reservas!J/.test(d.range)) &&
            seis.notas.some(d => /^⚠ /.test(d.values[0][0])),
      'el choque se reporta en la hoja con ⚠, para que lo mire una persona');
    chequeo(seis.nuevas.length === 0, 'y no se crea ningún evento de Calendar por un choque');

    // ----------------------------------------------------------------------
    console.log(c.neg('\nLa hoja vacía'));
    // ----------------------------------------------------------------------
    const nada = await corrida([]);
    chequeo(nada.resultados.length === 0 && nada.notas.length === 0,
      'sin filas no se consulta la base ni se escribe nada');
  } finally {
    await limpiar();
  }

  console.log(fallos === 0
    ? c.verde('\nLa vuelta del Excel a la agenda hace lo que dice.\n')
    : c.rojo(`\n${fallos} problema(s).\n`));
  process.exitCode = fallos === 0 ? 0 : 1;
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message + '\n')); process.exit(1); });
