#!/usr/bin/env node
//
// Tres conversaciones completas, con tres clientes que se comportan distinto,
// contra la base REAL. Prueban lo que se agregó el 2026-08-28:
//
//   1. La FICHA de la reserva: que se llene sola con lo que el cliente va
//      diciendo, y que nunca se quede sin saber algo que el cliente ya dijo.
//   2. El FILTRO DE AFORO: que solo salgan los salones donde de verdad cabe
//      esa cantidad de gente.
//   3. El comando /NEW: que deje el chat como si el cliente escribiera por
//      primera vez.
//
// Igual que el resto de las pruebas del repo, el SQL se LEE de los .json de
// los workflows -- no se copia -- para que no pueda quedar desincronizado del
// nodo que corre en producción. Lo único que no se ejecuta es Gemini: los
// turnos del agente son los que el prompt manda escribir, y lo que se
// comprueba es el estado que queda en la base después de cada uno.
//
// Uso:  node scripts/probar-reserva.js

const https = require('https');
const fs = require('fs');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

const c = { gris: s => `\x1b[90m${s}\x1b[0m`, verde: s => `\x1b[32m${s}\x1b[0m`,
            rojo: s => `\x1b[31m${s}\x1b[0m`, ama: s => `\x1b[33m${s}\x1b[0m`,
            cyan: s => `\x1b[36m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
function chequeo(ok, texto) {
  console.log(`  ${ok ? c.verde('✓') : c.rojo('✗')} ${texto}`);
  if (!ok) fallos++;
}
const titulo = t => console.log('\n' + c.neg(t));
const dice = (quien, t) => console.log(`  ${c.cyan(quien.padEnd(9))} ${String(t).slice(0, 110)}`);

// --------------------------------------------------------------------------
// Base
// --------------------------------------------------------------------------

function consulta(sql) {
  const cuerpo = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      // Buffers y no strings: un emoji partido entre dos chunks se convierte
      // en dos mitades inválidas y parece dato corrupto. Ya pasó dos veces.
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

// El endpoint de gestión no acepta parámetros: $1..$n se sustituyen aquí. Solo
// para las pruebas; los nodos sí van parametrizados.
function ligar(sql, params) {
  let out = sql;
  params.forEach((v, i) => {
    const lit = v === null || v === undefined ? 'null'
      : typeof v === 'number' ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
    out = out.split('$' + (i + 1)).join(lit);
  });
  return out;
}

const wf = (a) => JSON.parse(fs.readFileSync('n8n/workflow-' + a + '.json', 'utf8'));
const agente = wf('angie-otero'), medios = wf('enviar-medios'), separar = wf('separar-fecha');
const nodo = (w, n) => {
  const x = w.nodes.find(y => y.name === n);
  if (!x) throw new Error('no existe el nodo ' + n);
  return x.parameters.query;
};

// --------------------------------------------------------------------------
// Las herramientas, con el SQL del nodo de verdad
// --------------------------------------------------------------------------

// La tanda de cotización: los tres nodos de enviar_medios, en el mismo orden
// en que los conecta el workflow.
async function cotizar(tel, a) {
  const invitados = a.invitados == null ? '' : String(a.invitados);
  await consulta(ligar(nodo(medios, 'Anotar Reserva'),
    [tel, a.tipo_evento || '', invitados, a.nombre_cliente || '']));
  const guion = await consulta(ligar(nodo(medios, 'Guion Cotización'),
    ['sede', 'todas', tel, a.tipo_evento || '', a.nombre_cliente || '', invitados, 'false']));
  const piezas = await consulta(ligar(nodo(medios, 'Seleccionar Medios'),
    ['sede', 'todas', tel, 'ambos', invitados, 'false']));
  for (const m of piezas) {
    if (m.id) await consulta(ligar('select fn_registrar_envio($1::uuid, $2::text)', [m.id, tel]));
  }
  return { guion, piezas };
}

const disponibilidad = (tel, sede, fecha) =>
  consulta(ligar(nodo(agente, 'verificar_disponibilidad_evento'), [sede, fecha, tel]));

const anotar = (tel, d) => consulta(ligar(nodo(agente, 'anotar_datos'),
  [tel, d.tipo_evento || '', d.invitados == null ? '' : String(d.invitados),
   d.fecha_evento || '', d.salon || '', d.nombre || '', d.telefono_contacto || '']));

const ficha = async (tel) => (await consulta(ligar('select fn_reserva_ficha($1) as f', [tel])))[0].f;

const reiniciar = (tel) => consulta(ligar(nodo(agente, 'Reiniciar Chat'), [tel]));

// El detector de /new: se saca el regex del propio nodo IF, para que la prueba
// use el que corre y no una copia.
function detectorNew() {
  const n = agente.nodes.find(x => x.name === '¿Comando /new?');
  const expr = n.parameters.conditions.conditions[0].leftValue;
  const m = expr.match(/(\/\^[^;]*?\/i)\.test/);
  if (!m) throw new Error('no encontré el regex dentro de ¿Comando /new?');
  const re = eval(m[1]);
  return (texto) => re.test(String(texto ?? ''));
}

const limpiar = (tel) => consulta(ligar(
  `delete from citas where telefono = $1;
   delete from agenda_reservas where lead_id in (select id from leads where telefono = $1);
   delete from n8n_chat_histories where session_id = $1;
   delete from mensajes_fragmentos where telefono = $1;
   delete from leads where telefono = $1;`, [tel]));

const nace = (tel, nombre) => consulta(ligar(nodo(agente, 'Upsert Lead'), [tel, nombre]));

// --------------------------------------------------------------------------

async function personalidad1() {
  const TEL = 'test-reserva-1-directa';
  titulo('PERSONALIDAD 1 — Ana: lo suelta todo en el primer mensaje y odia que le repregunten');
  await limpiar(TEL);
  await nace(TEL, 'Ana');
  try {
    dice('CLIENTE', 'Hola, soy Ana. Quiero cotizar los 15 de mi hija para 180 personas, el 20 de marzo de 2027.');

    // Turno 2: el agente anota TODO lo que vino en ese mensaje, incluida la
    // fecha, que ninguna otra herramienta va a ver hasta el turno 4.
    await anotar(TEL, { tipo_evento: '15 Años', invitados: 180, fecha_evento: '2027-03-20', nombre: 'Ana' });
    const f1 = await ficha(TEL);
    console.log(c.gris('    ' + f1.replace(/\n/g, ' · ')));
    chequeo(/PERSONAS: 180/.test(f1), 'la ficha ya sabe que son 180 personas: el agente no tiene por qué volver a preguntarlo');
    chequeo(/FECHA DEL EVENTO: sábado 20 de marzo de 2027/.test(f1),
      'y la fecha, que es la que antes se perdía entre el turno 2 y el turno 4');
    chequeo(!/TODAVÍA NO LO SABES/.test(f1.split('SALÓN')[0]),
      'no queda ningún hueco de los que el agente rellenaría preguntando');

    // Turno 3: la cotización. Con 180 personas son 8 salones, no 15.
    const { guion, piezas } = await cotizar(TEL, { tipo_evento: '15 Años', invitados: 180, nombre_cliente: 'Ana' });
    dice('ANGIE', '(la herramienta manda ' + guion.length + ' globos y ' + piezas.length + ' piezas)');
    chequeo(piezas.length === 9, `${piezas.length} piezas: 8 salones que llegan a 180 + el promocional`);
    const chicos = piezas.filter(p => /Casa 5|Casa 74|Mansión Vallano|Marquez|Granada Gold|Sede Norte|Sede Sur 66/.test(p.caption || ''));
    chequeo(chicos.length === 0,
      'y ninguno de los siete salones que llegan hasta 150' + (chicos.length ? ': ' + chicos.map(x => x.caption).join(', ') : ''));
    chequeo(piezas.every(p => !/hasta \d+ personas|desde \d+ personas/.test(p.caption || '')),
      'ningún rótulo tiene que disimular el aforo con un "(hasta N personas)"');

    // Turno 4: elige salón. La fecha sale de la ficha, no de la nada.
    dice('CLIENTE', 'Me gustó Casa 4');
    await anotar(TEL, { salon: 'Casa 4' });
    const d = await disponibilidad(TEL, 'Casa 4', '2027-03-20');
    dice('HERRAMIENTA', d[0].resultado);
    chequeo(/^DISPONIBLE/.test(d[0].resultado), 'la disponibilidad se consulta con LA fecha de la ficha');
    const f2 = await ficha(TEL);
    chequeo(/SALÓN ELEGIDO: Casa 4/.test(f2), 'y el salón queda anotado en la ficha');
    chequeo(/PERSONAS: 180/.test(f2) && /20 de marzo de 2027/.test(f2),
      'sin que se haya perdido nada de lo anterior');
  } finally { await limpiar(TEL); }
}

async function personalidad2() {
  const TEL = 'test-reserva-2-indecisa';
  titulo('PERSONALIDAD 2 — Don Jorge: cambia de cantidad, y después de evento');
  await limpiar(TEL);
  await nace(TEL, 'Jorge');
  try {
    dice('CLIENTE', 'Buenas, Jorge. Un matrimonio para 60 personas.');
    const a = await cotizar(TEL, { tipo_evento: 'Matrimonio', invitados: 60, nombre_cliente: 'Jorge' });
    chequeo(a.piezas.length === 14, `${a.piezas.length} piezas: 13 salones que aceptan 60 + el promocional`);
    const grandes = a.piezas.filter(p => /Gran Salón|Valdemoro/.test(p.caption || ''));
    chequeo(grandes.length === 0, 'Gran Salón y Valdemoro no salen: arrancan en 100 personas');
    chequeo(a.guion.length === 5, `el guion completo del paquete (${a.guion.length} globos): es la primera cotización`);

    dice('CLIENTE', 'Uy no, va a ser más grande. ¿Y para 200?');
    const b = await cotizar(TEL, { tipo_evento: 'Matrimonio', invitados: 200, nombre_cliente: 'Jorge' });
    chequeo(b.piezas.length === 2,
      `${b.piezas.length} piezas: solo Gran Salón y Valdemoro, los dos que aún no había visto y que sí aceptan 200`);
    chequeo(b.guion.length >= 1 && b.guion.every(g => !/Te OBSEQUIAMOS/.test(g.mensaje)),
      'sale la tabla de precios de 200, y NO se repite la descripción del paquete: ya la tiene arriba');
    chequeo(b.guion.some(g => /para 200 personas/.test(g.mensaje)),
      'y la tabla dice claramente que es la de 200 personas');

    const f1 = await ficha(TEL);
    console.log(c.gris('    ' + f1.replace(/\n/g, ' · ')));
    chequeo(/PERSONAS: 200/.test(f1), 'la ficha se actualizó a 200: es la misma cotización, con otro número');
    chequeo(/YA LE COTIZASTE: 60, 200/.test(f1), 'y recuerda los dos aforos que ya le mandó, para no repetirlos');
    const reservas1 = await consulta(ligar(
      `select count(*)::int as n from reservas r join leads l on l.id = r.lead_id where l.telefono = $1`, [TEL]));
    chequeo(reservas1[0].n === 1, `cambiar de aforo NO abre una reserva nueva (hay ${reservas1[0].n})`);

    // Ya dio nombre y número: al pasar a otro evento no se los vuelven a pedir.
    dice('CLIENTE', 'Sí, a este número me pueden llamar. Jorge Elías Ramírez, 3105551234.');
    await anotar(TEL, { nombre: 'Jorge Elías Ramírez', telefono_contacto: '+573105551234' });

    dice('CLIENTE', 'Oye, aparte, mi hermano se gradúa. ¿Cuánto sale un grado?');
    await anotar(TEL, { tipo_evento: 'Grado' });
    const f2 = await ficha(TEL);
    console.log(c.gris('    ' + f2.replace(/\n/g, ' · ')));
    chequeo(/EVENTO: Grado/.test(f2), 'un evento distinto sí abre una reserva nueva');
    chequeo(/PERSONAS: TODAVÍA NO LO SABES/.test(f2),
      'y arranca sin cantidad de personas: la del matrimonio no se hereda, casi nunca coinciden');
    chequeo(/NOMBRE: Jorge Elías Ramírez/.test(f2) && /CONFIRMADO: \+573105551234/.test(f2),
      'pero el nombre y el número SÍ se heredan: son de la persona, no del evento');
    chequeo(/A MEDIAS: Matrimonio para 200 personas/.test(f2),
      'y el matrimonio queda a medias, por si lo retoma');

    dice('CLIENTE', 'Volvamos a lo del matrimonio mejor.');
    await anotar(TEL, { tipo_evento: 'Matrimonio' });
    const f3 = await ficha(TEL);
    chequeo(/EVENTO: Matrimonio/.test(f3) && /PERSONAS: 200/.test(f3),
      'y al retomarlo vuelve entero, con sus 200 personas');
  } finally { await limpiar(TEL); }
}

async function personalidad3() {
  const TEL = '+573001234567';   // un número de verdad: el caso de confirmarlo
  titulo('PERSONALIDAD 3 — Katherine: confirma el número de WhatsApp y después manda /new');
  await limpiar(TEL);
  await nace(TEL, 'Katherine');
  try {
    dice('CLIENTE', 'Hola! Katherine. Un baby shower para 100 personas el 5 de junio.');
    await anotar(TEL, { tipo_evento: 'Baby Shower', invitados: 100, fecha_evento: '2027-06-05', nombre: 'Katherine' });
    const t = await cotizar(TEL, { tipo_evento: 'Baby Shower', invitados: 100, nombre_cliente: 'Katherine' });
    chequeo(t.piezas.length === 16, `${t.piezas.length} piezas: con 100 personas sí entran los quince salones`);

    dice('ANGIE', `Este número, ${TEL}, ¿es al que quieres que te contactemos? ☎️`);
    dice('CLIENTE', 'Sí, a ese mismo');
    // Un "sí" ya es la confirmación: se anota y no se vuelve a pedir.
    await anotar(TEL, { telefono_contacto: TEL });
    const f1 = await ficha(TEL);
    chequeo(new RegExp('CONFIRMADO: \\' + TEL).test(f1),
      'con un "sí" basta: el número queda confirmado sin pedirle que lo escriba');

    // Y no se pierde al apartar la fecha, que es donde se vuelve a usar.
    const sep = await consulta(ligar(nodo(separar, 'Separar Fecha'),
      ['Casa 74', '2027-06-05', 'Katherine Rojas', TEL, TEL]));
    chequeo(sep[0].estado_resultado === 'separada', 'la fecha se aparta con ese mismo número');
    const f2 = await ficha(TEL);
    chequeo(/SALÓN ELEGIDO: Casa 74/.test(f2) && /NOMBRE: Katherine Rojas/.test(f2),
      'y apartar la fecha completa la ficha con el salón y el nombre completo');

    // ---- /new ----
    const esNew = detectorNew();
    chequeo(['/new', '/NEW', ' /new ', '/nuevo', '/reset'].every(x => esNew(x)),
      'el detector reconoce /new y sus variantes');
    chequeo(!['new', 'quiero algo nuevo', 'me gusta el nuevo salón', 'sí', '150'].some(x => esNew(x)),
      'y NO se dispara con un mensaje normal que lleve la palabra "nuevo"');

    dice('CLIENTE', '/new');
    const r = await reiniciar(TEL);
    dice('SISTEMA', r[0].resultado + '  (citas vivas: ' + r[0].citas_vivas + ')');
    const despues = await consulta(ligar(
      `select (select count(*)::int from n8n_chat_histories where session_id = $1) as memoria,
              (select count(*)::int from envios_medios e join leads l on l.id = e.lead_id where l.telefono = $1) as medios,
              (select count(*)::int from cotizaciones_aforos ca join leads l on l.id = ca.lead_id where l.telefono = $1) as cotizaciones,
              (select count(*)::int from reservas rr join leads l on l.id = rr.lead_id where l.telefono = $1) as reservas,
              (select nombre from leads where telefono = $1) as nombre,
              (select estado from leads where telefono = $1) as estado,
              (select count(*)::int from agenda_reservas ar join leads l on l.id = ar.lead_id where l.telefono = $1) as apartadas`,
      [TEL]));
    const d = despues[0];
    chequeo(d.memoria === 0, 'la memoria queda vacía: vuelve a hablar desde el saludo');
    chequeo(d.medios === 0, 'y el material enviado también, así que los videos se vuelven a mandar');
    chequeo(d.cotizaciones === 0 && d.reservas === 0, 'las cotizaciones y las reservas se borran');
    chequeo(d.nombre === null && d.estado === 'nuevo', 'y el lead queda como recién llegado');
    chequeo(d.apartadas === 1,
      'PERO la fecha apartada NO se borra: su evento de Google Calendar seguiría vivo y bloquearía una fecha real');
    chequeo(r[0].citas_vivas === 1, 'y el comando avisa de esa reserva viva en vez de dejarla callada');

    chequeo(await ficha(TEL) === 'Todavía no sabes nada de este cliente: ni el evento, ni para cuántas personas, ni la fecha. Pregúntaselo.',
      'la ficha vuelve a cero: el agente arranca preguntando, como con cualquiera');

    // Y la tanda vuelve a salir entera.
    const t2 = await cotizar(TEL, { tipo_evento: 'Baby Shower', invitados: 100, nombre_cliente: 'Katherine' });
    chequeo(t2.piezas.length === 16 && t2.guion.length === 5,
      `después de /new la cotización sale completa otra vez (${t2.piezas.length} piezas, ${t2.guion.length} globos)`);
  } finally { await limpiar(TEL); }
}

(async () => {
  await personalidad1();
  await personalidad2();
  await personalidad3();
  console.log('\n' + (fallos ? c.rojo(fallos + ' fallos') : c.verde('sin fallos')));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('\n' + c.rojo('FALLO: ') + e.message); process.exit(1); });
