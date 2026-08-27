#!/usr/bin/env node
//
// La lógica de horarios de `agendar_cita`, probada sin n8n y sin Google.
//
// Ejecuta el jsCode REAL de los nodos `Calcular Ventana` y `Calcular Libres`
// leyéndolo de `n8n/workflow-agendar-cita.json` -- no se copia aquí, igual que
// en `banco-pruebas.js`, para que la prueba no pueda quedar desincronizada del
// nodo. Lo único simulado es la agenda: en vez de consultar Google se le pasa
// una lista de eventos, y el reloj se congela con Settings.now para que los
// casos no dependan del día en que se corran.
//
// LO QUE DE VERDAD IMPORTA AQUÍ es el caso 5: cada hora que la herramienta le
// ofrece al agente se le vuelve a meter a la herramienta, y tiene que agendar.
// Esa es la invariante que se rompió en producción el 2026-08-27 -- el agente
// ofrecía horas ocupadas y se disculpaba tres veces seguidas delante del
// cliente -- y es la única forma de comprobar que no vuelve a pasar.
//
// Uso:  node scripts/probar-agenda.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Luxon no es dependencia del repo (no hay package.json): se toma del n8n
// instalado globalmente, que es exactamente la versión con la que corren los
// nodos en producción.
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
// Jueves 27 de agosto de 2026, 9:00 a.m. Congelado para que los casos no
// dependan del día en que se corra la prueba.
const AHORA = DateTime.fromISO('2026-08-27T09:00:00', { zone: ZONA });
Settings.now = () => AHORA.toMillis();

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

const wf = JSON.parse(fs.readFileSync('n8n/workflow-agendar-cita.json', 'utf8'));
const codigo = (nombre) => {
  const n = wf.nodes.find(x => x.name === nombre);
  if (!n) throw new Error('no existe el nodo ' + nombre);
  return n.parameters.jsCode;
};

// El entorno de un nodo Code de n8n, con lo justo que usan estos dos.
function correrNodo(js, entrada, previos = {}) {
  const item = (j) => ({ json: j });
  const $input = { first: () => item(entrada), all: () => [item(entrada)] };
  const $ = (nombre) => {
    if (!(nombre in previos)) throw new Error(`el nodo pide $('${nombre}') y la prueba no se lo dio`);
    return { first: () => item(previos[nombre]), item: item(previos[nombre]) };
  };
  return new Function('DateTime', '$input', '$', js)(DateTime, $input, $);
}

// Un evento de Google, tal como llega en items[].
const evento = (fecha, desde, minutos, titulo = 'ocupado') => {
  const ini = DateTime.fromFormat(`${fecha} ${desde}`, 'yyyy-MM-dd HH:mm', { zone: ZONA });
  return { summary: titulo,
           start: { dateTime: ini.toISO() },
           end: { dateTime: ini.plus({ minutes: minutos }).toISO() } };
};

// Corre el par de nodos como los corre el workflow.
function agendar({ tipo_cita = 'visita_sede', fecha, hora, agenda = [] }) {
  const ventana = correrNodo(codigo('Calcular Ventana'), {
    tipo_cita, fecha, hora, detalle: 'prueba',
    telefono: 'test-agenda', nombre: 'Cliente Prueba', telefono_contacto: '3001234567',
  })[0].json;
  if (!ventana.valido) return { ...ventana, ocupado: true, libres: [] };
  const libres = correrNodo(codigo('Calcular Libres'), { items: agenda },
                            { 'Calcular Ventana': ventana })[0].json;
  return { ...libres, ventana };
}

let fallos = 0;
const ok = (b, t) => { console.log(b ? '  ' + c.verde('✓') + ' ' + t : '  ' + c.rojo('✗') + ' ' + t); if (!b) fallos++; };
const titulo = (t) => console.log('\n' + c.neg(t));

// ---------------------------------------------------------------------------

titulo('1. Horario nuevo: lunes a sábado de 10 a 19, domingos cerrado');
{
  // Domingo 30 de agosto de 2026.
  const r = agendar({ fecha: '2026-08-30', hora: '11:00' });
  ok(r.ocupado, 'un domingo no se agenda');
  ok(/domingos no hay atencion/i.test(r.mensaje), 'y le dice al agente por qué');
  ok(r.libres.length > 0 && r.libres.every(l => DateTime.fromISO(l.fecha).weekday !== 7),
     `ofrece ${r.libres.length} alternativas y ninguna cae en domingo`);

  const sabado = agendar({ fecha: '2026-08-29', hora: '18:30' });
  ok(!sabado.ocupado, 'el sábado a las 18:30 SÍ se agenda (antes cerraba 18:30 y esto se rechazaba)');

  const tarde = agendar({ fecha: '2026-08-28', hora: '18:45' });
  ok(tarde.ocupado, 'las 18:45 no: una cita de 30 min terminaría 19:15, con el local cerrado');
  ok(/de 10:00 a 19:00/.test(tarde.mensaje) && /18:30/.test(tarde.mensaje),
     'el mensaje dice la franja y la última hora posible');

  const temprano = agendar({ fecha: '2026-08-28', hora: '09:00' });
  ok(temprano.ocupado, 'las 9:00 tampoco: abre a las 10');

  const mediodia = agendar({ fecha: '2026-08-28', hora: '13:00' });
  ok(!mediodia.ocupado, 'la 1:00 p.m. sí: la jornada es continua, no hay pausa de almuerzo');
}

titulo('2. Ninguna hora ofrecida cae fuera del horario');
{
  const r = agendar({ fecha: '2026-08-30', hora: '11:00' });
  const fuera = r.libres.filter(l => l.hora < '10:00' || l.hora > '18:30');
  ok(fuera.length === 0, fuera.length ? 'ofrece horas fuera de franja: ' + JSON.stringify(fuera)
                                      : 'todas entre 10:00 y 18:30');
}

titulo('3. La hora pedida está libre');
{
  const r = agendar({ fecha: '2026-08-28', hora: '15:00' });
  ok(!r.ocupado && !r.choque, 'se agenda sin más');
  ok(r.mensaje === null, 'y no se le manda al agente ningún texto de alternativas');
}

titulo('4. La hora pedida choca');
{
  const agenda = [evento('2026-08-28', '15:00', 30)];
  const r = agendar({ fecha: '2026-08-28', hora: '15:00', agenda });
  ok(r.ocupado && r.choque, 'no se agenda');
  ok(r.libres.length > 0, `devuelve ${r.libres.length} horas concretas`);
  ok(/ESTOS HORARIOS SI ESTAN LIBRES/.test(r.mensaje), 'el mensaje se las entrega al agente');
  ok(/NO ofrezcas NINGUNA hora que no este en esa lista/.test(r.mensaje),
     'y le prohíbe ofrecer cualquier otra');
  ok(r.libres.every(l => l.fecha && l.hora && l.legible),
     'cada opción trae fecha y hora exactas para volver a llamar la herramienta');
}

titulo('5. LA REGRESIÓN: toda hora ofrecida tiene que agendar de verdad');
{
  // La agenda del jueves como quedó en la prueba que falló en producción: una
  // cita ya creada, y el agente intentando la segunda en el mismo chat.
  const agenda = [
    evento('2026-08-27', '11:00', 30, 'visita'),
    evento('2026-08-27', '15:00', 20, 'llamada que acaba de agendar el agente'),
    evento('2026-08-27', '16:30', 30, 'otra visita'),
  ];
  const r = agendar({ fecha: '2026-08-27', hora: '15:30', agenda });
  ok(r.ocupado, 'las 15:30 chocan con el colchón de la llamada de las 15:00');
  ok(r.libres.length > 0, `ofrece ${r.libres.length} alternativas`);

  // Aquí está el corazón de la prueba: cada alternativa se le vuelve a pedir a
  // la herramienta, igual que haría el agente cuando el cliente elija.
  const malas = [];
  for (const l of r.libres) {
    const vuelta = agendar({ fecha: l.fecha, hora: l.hora, agenda });
    if (vuelta.ocupado) malas.push(`${l.fecha} ${l.hora}`);
  }
  ok(malas.length === 0, malas.length
    ? 'la herramienta ofreció horas que ella misma rechaza: ' + malas.join(', ')
    : `las ${r.libres.length} alternativas agendan al primer intento`);

  console.log('    ' + c.gris(r.libres.map(l => l.hora).join('  ')));

  // Y ninguna cae encima de lo que ya hay.
  const encima = r.libres.filter(l => ['11:00', '15:00', '16:30'].includes(l.hora));
  ok(encima.length === 0, 'ninguna alternativa pisa una cita existente');
}

titulo('6. Las alternativas salen cerca de la hora que pidió el cliente');
{
  const agenda = [evento('2026-08-28', '15:00', 30)];
  const r = agendar({ fecha: '2026-08-28', hora: '15:00', agenda });
  const pedida = 15 * 60;
  const enMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  const distancias = r.libres.map(l => Math.abs(enMin(l.hora) - pedida));
  ok(distancias[0] <= 90, `la primera opción (${r.libres[0].hora}) está a ${distancias[0]} min de las 15:00, no a las 10 de la mañana`);
  ok(distancias.every((d, i) => i === 0 || d >= distancias[i - 1]),
     'y van de más cerca a más lejos: ' + r.libres.map(l => l.hora).join(', '));
}

titulo('7. Día lleno: pasa a los días siguientes en vez de inventar');
{
  // Todo el jueves ocupado, de 10 a 19.
  const agenda = [];
  for (let h = 10; h < 19; h++) { agenda.push(evento('2026-08-27', `${h}:00`, 60)); }
  const r = agendar({ fecha: '2026-08-27', hora: '14:00', agenda });
  ok(r.ocupado, 'no se agenda');
  ok(r.libres.length > 0 && r.libres.every(l => l.fecha > '2026-08-27'),
     `las ${r.libres.length} alternativas son de días posteriores`);
}

titulo('8. Los rechazos que no son de tiempo siguen cortando sin consultar la agenda');
{
  const sinNombre = correrNodo(codigo('Calcular Ventana'), {
    tipo_cita: 'llamada', fecha: '2026-08-28', hora: '15:00',
    detalle: '', telefono: 't', nombre: '', telefono_contacto: '3001234567',
  })[0].json;
  ok(sinNombre.valido === false && /nombre/i.test(sinNombre.mensaje), 'sin nombre: rechazo directo');

  const sinTel = correrNodo(codigo('Calcular Ventana'), {
    tipo_cita: 'llamada', fecha: '2026-08-28', hora: '15:00',
    detalle: '', telefono: 't', nombre: 'Ana', telefono_contacto: '',
  })[0].json;
  ok(sinTel.valido === false && /numero/i.test(sinTel.mensaje), 'sin número de contacto: rechazo directo');

  const tipoMalo = correrNodo(codigo('Calcular Ventana'), {
    tipo_cita: 'cafecito', fecha: '2026-08-28', hora: '15:00',
    detalle: '', telefono: 't', nombre: 'Ana', telefono_contacto: '3001234567',
  })[0].json;
  ok(tipoMalo.valido === false && /tipo_cita invalido/.test(tipoMalo.mensaje), 'tipo inválido: rechazo directo');
}

titulo('9. Una fecha que ya pasó ofrece horas de hoy en adelante, no del pasado');
{
  const r = agendar({ fecha: '2026-08-20', hora: '15:00' });
  ok(r.ocupado, 'no se agenda');
  ok(r.libres.length > 0 && r.libres.every(l => l.fecha >= '2026-08-27'),
     'y ninguna alternativa es anterior a hoy');
}

titulo('10. Las llamadas duran 20 minutos y usan colchón de 20');
{
  const agenda = [evento('2026-08-28', '15:00', 20)];
  const r = agendar({ tipo_cita: 'llamada', fecha: '2026-08-28', hora: '15:40', agenda });
  ok(!r.ocupado, 'una llamada a las 15:40 cabe detrás de otra que terminó a las 15:20');
  const pegada = agendar({ tipo_cita: 'llamada', fecha: '2026-08-28', hora: '15:20', agenda });
  ok(pegada.ocupado, 'a las 15:20, pegada, no: falta el colchón de 20 minutos');
}

// ---------------------------------------------------------------------------

console.log('\n' + (fallos ? c.rojo(fallos + ' fallos') : c.verde('sin fallos')));
process.exit(fallos ? 1 : 0);
