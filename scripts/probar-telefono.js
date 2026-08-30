#!/usr/bin/env node
//
// El número de contacto y la fecha del evento, probados sin n8n y sin red.
//
// Ejecuta el jsCode REAL de los nodos `Calcular Ventana` (agendar_cita) y
// `Validar Datos` (separar_fecha_evento), leyéndolo de los .json -- no se copia
// aquí, igual que en `probar-agenda.js`, para que la prueba no pueda quedar
// desincronizada del nodo.
//
// LO QUE DE VERDAD IMPORTA AQUÍ es el bloque 3: el validador de teléfono está
// DUPLICADO en los dos workflows porque n8n no deja compartir código entre
// ellos, y las dos copias se corren contra la misma tabla de casos. El día que
// alguien arregle una y se olvide de la otra, este bloque lo dice.
//
// Uso:  node scripts/probar-telefono.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Luxon sale del n8n global, que es la versión con la que corren los nodos.
function cargarLuxon() {
  try { return require('luxon'); } catch { /* sigue */ }
  try {
    const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(raiz, 'n8n', 'node_modules', 'luxon'));
  } catch (e) {
    console.error('No se encontró luxon. Está dentro del n8n global; instálalo con `npm i -g n8n`\n' + e.message);
    process.exit(1);
  }
}
const { DateTime, Settings } = cargarLuxon();

const ZONA = 'America/Bogota';
// Jueves 27 de agosto de 2026. Congelado para que los casos de fecha no
// dependan del día en que se corra la prueba.
const AHORA = DateTime.fromISO('2026-08-27T09:00:00', { zone: ZONA });
Settings.now = () => AHORA.toMillis();

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};
const titulo = (t) => console.log('\n' + c.neg(t));

// ---------------------------------------------------------------------------
// Sacar las funciones del jsCode de un nodo.
//
// Todo lo que hay ANTES de `const entrada = $input.first().json;` son
// constantes y declaraciones de función: se puede evaluar sin nada alrededor.
// De ahí para abajo empieza el trabajo del nodo, que necesita $input y no se
// toca aquí. Si algún día ese ancla desaparece, esto revienta -- que es
// justamente lo que queremos que pase.
const ANCLA = 'const entrada = $input.first().json;';

function funcionesDe(rutaWorkflow, nombreNodo, queSacar) {
  const wf = JSON.parse(fs.readFileSync(rutaWorkflow, 'utf8'));
  const nodo = wf.nodes.find(n => n.name === nombreNodo);
  if (!nodo) throw new Error(`no existe el nodo "${nombreNodo}" en ${rutaWorkflow}`);
  const js = nodo.parameters.jsCode;
  const corte = js.indexOf(ANCLA);
  if (corte < 0) throw new Error(`"${nombreNodo}" ya no tiene el ancla: ${ANCLA}`);
  const cabecera = js.slice(0, corte);
  return new Function('DateTime', cabecera + '\nreturn {' + queSacar.join(', ') + '};')(DateTime);
}

const cita = funcionesDe('n8n/workflow-agendar-cita.json', 'Calcular Ventana',
  ['revisarTelefonoCo', 'pedirTelefonoOtraVez', 'revisarDiaSemana', 'preguntarPorElDia']);
const reserva = funcionesDe('n8n/workflow-separar-fecha.json', 'Validar Datos',
  ['revisarTelefonoCo', 'pedirTelefonoOtraVez', 'revisarFechaEvento', 'preguntarPorLaFecha',
   'revisarDiaSemana', 'preguntarPorElDia']);

// ---------------------------------------------------------------------------
// Los casos. `e164` en null significa "tiene que rechazarlo".
// ---------------------------------------------------------------------------
const TELEFONOS = [
  // Lo que sí se puede marcar
  ['3001234567',        '+573001234567', 'celular pelado'],
  ['300 123 4567',      '+573001234567', 'celular con espacios'],
  ['300-123-4567',      '+573001234567', 'celular con guiones'],
  ['(300) 123 45 67',   '+573001234567', 'celular con paréntesis'],
  ['+57 300 123 4567',  '+573001234567', 'con el +57 delante'],
  ['573001234567',      '+573001234567', 'con el 57 pegado'],
  ['00573001234567',    '+573001234567', 'con el 0057 de marcación internacional'],
  ['3150290928',        '+573150290928', 'el número real del negocio'],
  ['6023456789',        '+576023456789', 'fijo de Cali (602)'],
  ['6013456789',        '+576013456789', 'fijo de Bogotá (601)'],
  ['03001234567',       '+573001234567', 'con el 0 de larga distancia'],

  // Lo que hay que rechazar. Este es el motivo de todo el cambio.
  ['',            null, 'no dio ninguno'],
  ['3001234',     null, 'siete dígitos: ANTES PASABA'],
  ['31502909',    null, 'ocho dígitos, se le fue el enviar'],
  ['300123456',   null, 'nueve dígitos, le falta uno'],
  ['30012345678', null, 'once dígitos, le sobra uno'],
  ['0000000000',  null, 'ceros'],
  ['3333333333',  null, 'la misma cifra repetida'],
  ['1234567890',  null, 'diez dígitos que no son de Colombia'],
  ['6091234567',  null, 'indicativo fijo que no existe (609)'],
];

titulo('1. Los números que se pueden marcar entran, normalizados a E.164');
for (const [entrada, esperado, nota] of TELEFONOS.filter(x => x[1])) {
  const r = cita.revisarTelefonoCo(entrada);
  ok(r.ok && r.e164 === esperado,
     `${JSON.stringify(entrada).padEnd(20)} -> ${esperado}  ${c.gris(nota)}`,
     `dio: ${JSON.stringify(r)}`);
}

titulo('2. Los números a medias se rechazan, y el agente sabe qué pedir');
for (const [entrada, , nota] of TELEFONOS.filter(x => x[1] === null)) {
  const r = cita.revisarTelefonoCo(entrada);
  const mensaje = r.ok ? '' : cita.pedirTelefonoOtraVez(r, entrada, false);
  const dice = /numero|telefono/i.test(mensaje);
  const noRegana = !/mal escrito|invalido|incorrecto|error/i.test(mensaje);
  ok(!r.ok && dice && noRegana,
     `${JSON.stringify(entrada).padEnd(20)} -> rechazado (${r.motivo})  ${c.gris(nota)}`,
     r.ok ? 'lo ACEPTÓ' : mensaje);
}

titulo('3. Las DOS copias del validador dicen exactamente lo mismo');
{
  const distintos = [];
  for (const [entrada] of TELEFONOS) {
    const a = JSON.stringify(cita.revisarTelefonoCo(entrada));
    const b = JSON.stringify(reserva.revisarTelefonoCo(entrada));
    if (a !== b) distintos.push(`${JSON.stringify(entrada)}\n      agendar_cita:  ${a}\n      separar_fecha: ${b}`);
  }
  ok(distintos.length === 0,
     `las ${TELEFONOS.length} entradas dan el mismo veredicto en agendar_cita y en separar_fecha_evento`,
     distintos.join('\n    '));

  // Y los textos que se le devuelven al agente también, que es lo que ve el
  // cliente al final.
  const textos = TELEFONOS.filter(x => x[1] === null).map(([e]) => {
    const ra = cita.revisarTelefonoCo(e), rb = reserva.revisarTelefonoCo(e);
    return cita.pedirTelefonoOtraVez(ra, e, false) === reserva.pedirTelefonoOtraVez(rb, e, false);
  });
  ok(textos.every(Boolean), 'y el mensaje que le devuelven al agente es idéntico en las dos');
}

titulo('4. Una llamada pide el número con otras palabras que una visita');
{
  const r = cita.revisarTelefonoCo('');
  const llamada = cita.pedirTelefonoOtraVez(r, '', true);
  const visita = cita.pedirTelefonoOtraVez(r, '', false);
  ok(/a que numero te llamo/i.test(llamada), 'para una llamada: "a qué número te llamo"', llamada);
  ok(llamada !== visita, 'y no es el mismo texto que para una visita', visita);
}

titulo('5. El número normalizado es el que sale del nodo, no el que escribió el cliente');
{
  const salida = correrCalcularVentana({ telefono_contacto: '+57 300 123 4567' });
  ok(salida.valido === true, 'la entrada es válida');
  ok(salida.telefono_contacto === '+573001234567',
     'a Google Calendar y a la tabla `citas` va +573001234567', String(salida.telefono_contacto));
  ok(salida.telefono_contacto_crudo === '+57 300 123 4567',
     'y queda guardado lo que el cliente escribió, por si hay que revisarlo');
}

// ---------------------------------------------------------------------------
// Fechas del evento
// ---------------------------------------------------------------------------
titulo('6. Una fecha que ya pasó se pregunta, no se corrige');
{
  const r = reserva.revisarFechaEvento('2026-03-15', AHORA);
  ok(r.ok === false && r.motivo === 'pasada', 'el 15 de marzo, estando en agosto, se rechaza');
  ok(r.sugerida === '2027-03-15', 'y propone la misma fecha del año siguiente', String(r.sugerida));
  ok(r.legible === 'domingo 15 de marzo de 2026' && r.sugerida_legible === 'lunes 15 de marzo de 2027',
     'las dos con su día de la semana, que es lo que deja verificarlo',
     `${r.legible} / ${r.sugerida_legible}`);

  const m = reserva.preguntarPorLaFecha(r);
  ok(/domingo 15 de marzo de 2026/.test(m) && /lunes 15 de marzo de 2027/.test(m),
     'el texto para el agente lleva las dos fechas escritas');
  ok(/NO la apartes/.test(m), 'y le prohíbe apartar esa fecha');
  ok(!/se equivoc|error|mal escrit/i.test(m), 'sin decirle en ningún momento que el cliente se equivocó', m);
}

titulo('7. Las fechas que sí sirven pasan, y el año tecleado mal se pregunta');
{
  const casos = [
    ['2026-08-27', true,  'hoy mismo'],
    ['2026-08-28', true,  'mañana'],
    ['2026-12-20', true,  'diciembre de este año'],
    ['2029-08-01', true,  'dentro de tres años justos'],
    ['2026-08-26', false, 'ayer'],
    ['2036-12-20', false, 'diez años adelante: año tecleado mal'],
    ['manana',     false, 'no es una fecha'],
    ['',           false, 'no dio ninguna'],
    ['2026-02-29', false, '29 de febrero de un año que no es bisiesto'],
  ];
  for (const [f, valida, nota] of casos) {
    const r = reserva.revisarFechaEvento(f, AHORA);
    ok(r.ok === valida, `${JSON.stringify(f).padEnd(14)} -> ${valida ? 'pasa' : 'se pregunta'}  ${c.gris(nota)}`,
       JSON.stringify(r));
  }
  ok(reserva.revisarFechaEvento('2036-12-20', AHORA).motivo === 'lejana', 'el año lejano tiene su propio motivo');
}

titulo('8. separar_fecha_evento no aparta nada con una fecha pasada ni un número a medias');
{
  const pasada = correrValidarDatos({ fecha: '2026-03-15', telefono_contacto: '3001234567' });
  ok(pasada.valido === false && /YA PASO/.test(pasada.mensaje), 'fecha del pasado: no llega al insert');

  const cojo = correrValidarDatos({ fecha: '2026-12-20', telefono_contacto: '31502909' });
  ok(cojo.valido === false && /8 digitos/.test(cojo.mensaje), 'número de 8 dígitos: no llega al insert', cojo.mensaje);

  const sinNombre = correrValidarDatos({ nombre_cliente: '' });
  ok(sinNombre.valido === false && /nombre/i.test(sinNombre.mensaje), 'sin nombre del cliente: tampoco');

  const bien = correrValidarDatos({ fecha: '2026-12-20', telefono_contacto: '300 123 4567' });
  ok(bien.valido === true, 'y lo que está bien sí pasa');
  ok(bien.telefono_contacto === '+573001234567', 'con el teléfono normalizado', String(bien.telefono_contacto));
  ok(bien.fecha === '2026-12-20', 'y la fecha en YYYY-MM-DD para el insert');
}

// ---------------------------------------------------------------------------
// Correr los nodos enteros, no solo sus funciones.
// ---------------------------------------------------------------------------
function correrNodoEntero(ruta, nombre, entrada) {
  const wf = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const nodo = wf.nodes.find(n => n.name === nombre);
  const $input = { first: () => ({ json: entrada }), all: () => [{ json: entrada }] };
  return new Function('DateTime', '$input', nodo.parameters.jsCode)(DateTime, $input)[0].json;
}

function correrCalcularVentana(cambios) {
  return correrNodoEntero('n8n/workflow-agendar-cita.json', 'Calcular Ventana', {
    tipo_cita: 'visita_sede', fecha: '2026-08-28', hora: '15:00', dia_semana: 'viernes', detalle: 'prueba',
    telefono: 'test-telefono', nombre: 'Cliente Prueba', telefono_contacto: '3001234567',
    ...cambios,
  });
}

function correrValidarDatos(cambios) {
  return correrNodoEntero('n8n/workflow-separar-fecha.json', 'Validar Datos', {
    nombre_sede: "Casa Christian's Ciudad Jardín", fecha: '2026-12-20', dia_semana: 'domingo',
    nombre_cliente: 'Cliente Prueba', telefono: 'test-telefono',
    telefono_contacto: '3001234567',
    ...cambios,
  });
}

// --------------------------------------------------------------------------
titulo('9. El número de WhatsApp: cuándo se CONFIRMA y cuándo se pide');
// La regla que el negocio pidió: si el cliente escribe desde un número real, no
// se le pregunta "me regalas tu número" -- se le muestra y se le pide que lo
// confirme. Quien decide eso es una sola expresión del system message, la de
// `NÚMERO DE WHATSAPP DE ESTE CLIENTE`, y de su rama cuelgan los globos
// literales de los turnos 5 y 6.
//
// Se prueba AQUÍ, sin red, por un motivo que no es comodidad: por el chat de
// prueba esta rama NO se puede ejercitar. `Normalizar Chat` arma el teléfono
// como 'test-' + sesión, así que nunca empieza por '+' y `probar-conversacion`
// siempre cae en la rama de pedirlo. La única forma de comprobar el camino que
// ve un cliente de WhatsApp real es evaluar la expresión con su número.
{
  const wf = JSON.parse(fs.readFileSync(path.join('n8n', 'workflow-angie-otero.json'), 'utf8'));
  const sm = wf.nodes.find(n => n.name === 'Angie Otero').parameters.options.systemMessage;

  const m = /\{\{ \$\('Upsert Lead'\)\.item\.json\.telefono[\s\S]*?\}\}/.exec(sm);
  ok(!!m, 'la expresión del número sigue en el prompt');
  if (m) {
    // Se evalúa como la evalúa n8n, sustituyendo la referencia al nodo.
    const render = (tel) => {
      const cuerpo = m[0].slice(2, -2)
        .split("$('Upsert Lead').item.json.telefono").join(JSON.stringify(tel));
      return String(eval(cuerpo));
    };
    // `NO es un número real` contiene `es un número real`, así que la rama se
    // reconoce por la negación, no por la afirmación. Comprobarlo al revés da
    // verde siempre -- me pasó al mirarlo a mano el 2026-08-29.
    const pideConfirmar = (t) => !/NO es un número real/.test(render(t));

    ok(pideConfirmar('+573145755349'),
       'un número real de WhatsApp: se le muestra para que lo confirme');
    ok(/muéstraselo/.test(render('+573145755349')) && render('+573145755349').includes('+573145755349'),
       'y la instrucción lleva el número dentro, para que pueda enseñárselo');
    ok(!pideConfirmar('CO.1748724682844706'),
       'un BSUID de Meta (CO.17...) no es marcable: ese sí se pide');
    ok(!pideConfirmar('test-conv-c1-1788045297757'),
       'y el teléfono del chat de prueba tampoco, que es justo por lo que esto se prueba aquí');
  }

  // Y el otro extremo del contrato: los globos literales del turno 5 tienen que
  // existir en el prompt. Sin ellos la rama decide bien y el agente improvisa.
  ok(/¿te contactamos a este mismo número, \[número\]\?/.test(sm),
     'el turno 5 trae el globo de confirmar el número');
  ok(/EL NÚMERO NO SE PIDE: SE CONFIRMA/.test(sm),
     'y le prohíbe pedirlo cuando la ficha aún no lo tiene, que era el fallo');
}

// ---------------------------------------------------------------------------
// El día de la semana
// ---------------------------------------------------------------------------
titulo('10. El día de la semana que dijo el agente tiene que ser el de la fecha');
{
  // EL CASO REAL, tal como salió en producción. Un domingo el cliente pidió
  // "mañana a las 4". El agente ofreció "el lunes 1 de septiembre", el cliente
  // dijo que sí, y le agendaron el MARTES 1 -- porque el 1 de septiembre de
  // 2026 es martes y el lunes era el 31 de agosto. Confirmó bien y agendó bien:
  // el que estaba mal era el día que le había prometido.
  const r = cita.revisarDiaSemana('lunes', DateTime.fromISO('2026-09-01', { zone: ZONA }));
  ok(r.ok === false && r.motivo === 'no_casa', 'lunes + 2026-09-01: no casa (el 1 es martes)', JSON.stringify(r));
  ok(r.alterna_iso === '2026-08-31',
     'y el lunes que estaba al lado es el 31 de agosto, que es el que pidió el cliente', String(r.alterna_iso));

  const m = cita.preguntarPorElDia(r);
  ok(/lunes 31 de agosto de 2026/.test(m) && /martes 1 de septiembre de 2026/.test(m),
     'el texto para el agente lleva las DOS fechas, sin elegir por él');
  ok(!/se equivoc|error|invalid/i.test(m), 'y en ningún momento culpa al cliente', m);

  // El nodo entero: no se agenda nada y no se llega a consultar la agenda.
  const salida = correrCalcularVentana({ fecha: '2026-09-01', hora: '16:00', dia_semana: 'lunes' });
  ok(salida.valido === false, 'el nodo corta: no llega a Leer Agenda ni a Crear Cita');
  ok(/NO HICE NADA CON ESA FECHA/.test(salida.mensaje), 'y se lo dice al agente con todas las letras', salida.mensaje);

  // Y el día correcto pasa sin ruido.
  const bien = correrCalcularVentana({ fecha: '2026-09-01', hora: '16:00', dia_semana: 'martes' });
  ok(bien.valido === true, 'con el día correcto sí pasa');
  ok(bien.fuera_horario === null, 'y sin marca de fuera de horario: martes 4 p.m. es horario de atención');
}

titulo('11. Cómo se escribe el día no es el error que se busca');
{
  const dia = (s, f) => cita.revisarDiaSemana(s, DateTime.fromISO(f, { zone: ZONA }));
  const casos = [
    ['miércoles', '2026-09-02', true,  'con tilde'],
    ['miercoles', '2026-09-02', true,  'sin tilde'],
    ['Miércoles', '2026-09-02', true,  'con mayúscula'],
    ['el sábado', '2026-09-05', true,  'con artículo'],
    [' martes, ', '2026-09-01', true,  'con espacios y coma'],
    ['domingo',   '2026-09-06', true,  'domingo: que no se atienda lo dice otro chequeo, no este'],
    ['jueves',    '2026-09-02', false, 'jueves cuando es miércoles'],
    ['mañana',    '2026-09-02', false, 'no es un día de la semana'],
    ['',          '2026-09-02', false, 'no lo mandó'],
  ];
  for (const [s, f, pasa, nota] of casos) {
    const r = dia(s, f);
    ok(r.ok === pasa,
       JSON.stringify(s).padEnd(13) + ' + ' + f + ' -> ' + (pasa ? 'casa' : 'se rechaza') + '  ' + c.gris(nota),
       JSON.stringify(r));
  }
  ok(dia('', '2026-09-02').motivo === 'no_dio', 'faltar y ser ilegible son motivos distintos');
  ok(dia('mañana', '2026-09-02').motivo === 'ilegible', 'y el ilegible dice qué palabras acepta');
  ok(/lunes, martes, miercoles/.test(cita.preguntarPorElDia(dia('mañana', '2026-09-02'))),
     'listándolas en el mensaje');
}

titulo('12. Se ofrece el día nombrado que está MÁS CERCA, no el de la semana siguiente');
{
  // 2026-09-02 es miércoles. Si el agente dijo "lunes" hablaba del 31, no del 7:
  // ofrecerle el de la semana siguiente sería mandar al cliente seis días lejos
  // de lo que pidió.
  const casos = [
    ['jueves',  '2026-09-03', 'un día adelante'],
    ['viernes', '2026-09-04', 'dos adelante'],
    ['sabado',  '2026-09-05', 'tres adelante: todavía gana el de adelante'],
    ['domingo', '2026-08-30', 'cuatro adelante son tres atrás: gana el de atrás'],
    ['lunes',   '2026-08-31', 'dos atrás'],
    ['martes',  '2026-09-01', 'un día atrás'],
  ];
  for (const [s, esperado, nota] of casos) {
    const r = cita.revisarDiaSemana(s, DateTime.fromISO('2026-09-02', { zone: ZONA }));
    ok(r.alterna_iso === esperado, s.padEnd(8) + ' del miércoles 2 -> ' + esperado + '  ' + c.gris(nota),
       String(r.alterna_iso));
  }
}

titulo('13. Las DOS copias del validador de día dicen exactamente lo mismo');
{
  const CASOS = [
    ['lunes', '2026-09-01'], ['martes', '2026-09-01'], ['miércoles', '2026-09-02'],
    ['jueves', '2026-09-02'], ['domingo', '2026-08-30'], ['sabado', '2026-09-05'],
    ['mañana', '2026-09-02'], ['', '2026-09-02'], ['el viernes', '2026-09-04'],
  ];
  const veredicto = (mod, s, d) => {
    const r = mod.revisarDiaSemana(s, d);
    return JSON.stringify(r) + ' || ' + (r.ok ? '' : mod.preguntarPorElDia(r));
  };
  const distintos = [];
  for (const [s, f] of CASOS) {
    const d = DateTime.fromISO(f, { zone: ZONA });
    const a = veredicto(cita, s, d), b = veredicto(reserva, s, d);
    if (a !== b) distintos.push(JSON.stringify(s) + ' + ' + f + '\n      agendar_cita:  ' + a + '\n      separar_fecha: ' + b);
  }
  ok(distintos.length === 0,
     'los ' + CASOS.length + ' casos dan el mismo veredicto y el mismo texto en agendar_cita y en separar_fecha_evento',
     distintos.join('\n    '));
}

titulo('14. separar_fecha_evento tampoco aparta un día que no es el que oyó el cliente');
{
  // 2026-12-20 es domingo. Si el agente le dijo "sábado 20 de diciembre", el
  // bloqueo caería en el día equivocado del calendario de la empresa y nadie lo
  // vería hasta el día del evento.
  const malo = correrValidarDatos({ fecha: '2026-12-20', dia_semana: 'sabado' });
  ok(malo.valido === false, 'sábado + 2026-12-20 (que es domingo): no se aparta nada');
  ok(/sábado 19 de diciembre de 2026/.test(malo.mensaje),
     'y le ofrece el sábado 19, que es el que estaba al lado', malo.mensaje);

  const bueno = correrValidarDatos({ fecha: '2026-12-20', dia_semana: 'domingo' });
  ok(bueno.valido === true, 'con el día correcto sí aparta');

  const falta = correrValidarDatos({ fecha: '2026-12-20', dia_semana: '' });
  ok(falta.valido === false && /Falta .dia_semana./.test(falta.mensaje),
     'y sin el dato tampoco: la comprobación no se puede saltar callando', falta.mensaje);
}

// ---------------------------------------------------------------------------

console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
process.exit(fallos ? 1 : 0);
