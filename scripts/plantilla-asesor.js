#!/usr/bin/env node
//
// La plantilla de WhatsApp con la que el bot le avisa al asesor.
//
// Existe porque WhatsApp NO deja mandar texto libre a un número que no te haya
// escrito en las últimas 24 horas. Al cliente sí se le puede contestar de
// corrido -- acaba de escribir, la ventana está abierta -- pero el asesor casi
// nunca le habrá escrito al número del bot, así que ese aviso saldría
// rechazado. Un mensaje que inicia la empresa fuera de la ventana tiene que ir
// como plantilla aprobada por Meta.
//
// Se crea UNA vez y la revisa Meta (suele tardar minutos). Mientras esté en
// PENDING no se puede mandar; en cuanto pase a APPROVED, el nodo `Avisar al
// Asesor` empieza a funcionar solo.
//
//   node --env-file=.env scripts/plantilla-asesor.js          # cómo está
//   node --env-file=.env scripts/plantilla-asesor.js --crear  # la manda a revisión
//   node --env-file=.env scripts/plantilla-asesor.js --borrar # la retira

const { YCLOUD_API_KEY, YCLOUD_WABA_ID } = process.env;

const NOMBRE = 'aviso_caso_asesor';
const IDIOMA = 'es';

// El texto que verá el asesor. Las cuatro variables las rellena el nodo
// `Avisar al Asesor` en n8n, en este orden:
//   {{1}} nombre del cliente   {{3}} teléfono del cliente
//   {{2}} cuándo fue la cita   {{4}} lo que acaba de escribir
//
// Ojo con dos reglas de Meta que se comprueban al ENVIAR, no al crear, y que
// por eso se ven en producción y no aquí: una variable no puede traer saltos
// de línea ni cadenas de espacios. El nodo aplasta el mensaje del cliente a
// una sola línea antes de meterlo en {{4}}.
const CUERPO =
  'Hola. {{1}} escribió por WhatsApp después de la cita del {{2}} y está esperando respuesta.\n' +
  '\n' +
  'Teléfono: {{3}}\n' +
  'Dice: {{4}}\n' +
  '\n' +
  'Angie ya le dijo que tú lo vas a contactar, y el bot quedó en pausa en ese chat.';

const EJEMPLO = [
  'María Fernanda Ruiz',
  'martes 15 de septiembre',
  '+573001234567',
  'Quería confirmar si el abono quedó registrado',
];

const CREAR = process.argv.includes('--crear');
const BORRAR = process.argv.includes('--borrar');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

async function api(ruta, metodo = 'GET', cuerpo = null) {
  const r = await fetch('https://api.ycloud.com/v2' + ruta, {
    method: metodo,
    headers: { 'X-API-Key': YCLOUD_API_KEY, 'Content-Type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const texto = await r.text();
  let j = null;
  try { j = JSON.parse(texto); } catch { /* respuesta vacía */ }
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}: ${texto.slice(0, 500)}`);
  return j;
}

// Qué significa cada estado, dicho de forma que no haya que ir a buscarlo.
const ESTADOS = {
  APPROVED: [c.verde, 'aprobada: el aviso ya sale'],
  PENDING: [c.ama, 'en revisión de Meta: el aviso todavía NO sale'],
  REJECTED: [c.rojo, 'Meta la rechazó: hay que corregir el texto y volver a mandarla'],
  PAUSED: [c.rojo, 'pausada por mala calidad: el aviso no sale'],
  DISABLED: [c.rojo, 'deshabilitada: el aviso no sale'],
};

(async () => {
  if (!YCLOUD_API_KEY || !YCLOUD_WABA_ID) {
    console.error('Faltan YCLOUD_API_KEY y YCLOUD_WABA_ID. Cárgalos del .env (node --env-file=.env ...).');
    process.exit(1);
  }

  const lista = await api(`/whatsapp/templates?wabaId=${YCLOUD_WABA_ID}&limit=100`);
  const mia = (lista.items || []).find(t => t.name === NOMBRE && t.language === IDIOMA);

  console.log(c.neg(`\nPlantilla ${NOMBRE} (${IDIOMA})`) + c.gris(`   WABA ${YCLOUD_WABA_ID}`));

  if (BORRAR) {
    if (!mia) { console.log(c.gris('  no existe, no hay nada que retirar\n')); return; }
    await api(`/whatsapp/templates/${encodeURIComponent(NOMBRE)}?wabaId=${YCLOUD_WABA_ID}&language=${IDIOMA}`, 'DELETE');
    console.log(c.verde('  retirada\n'));
    return;
  }

  if (mia) {
    const [color, que] = ESTADOS[mia.status] || [c.gris, mia.status];
    console.log('  ' + color('● ' + mia.status) + ' — ' + que);
    console.log(c.gris('  categoría: ' + mia.category));
    const cuerpo = (mia.components || []).find(x => x.type === 'BODY');
    if (cuerpo && cuerpo.text !== CUERPO) {
      console.log(c.ama('\n  OJO: el texto de allá no es el de este archivo.'));
      console.log(c.gris('  allá:  ' + JSON.stringify(cuerpo.text)));
      console.log(c.gris('  aquí:  ' + JSON.stringify(CUERPO)));
      process.exitCode = 1;
    }
    if (CREAR) console.log(c.gris('\n  ya existe: --crear no hace nada. Para cambiarla, --borrar y volver a crearla.'));
    console.log('');
    return;
  }

  console.log('  ' + c.ama('● no existe todavía'));

  if (!CREAR) {
    console.log('\n  Así quedaría:\n');
    console.log(CUERPO.split('\n').map(l => '    ' + c.gris(l || '·')).join('\n'));
    console.log(c.ama('\n  Córrelo con --crear para mandarla a revisión de Meta.\n'));
    process.exitCode = 1;
    return;
  }

  const creada = await api('/whatsapp/templates', 'POST', {
    wabaId: YCLOUD_WABA_ID,
    name: NOMBRE,
    language: IDIOMA,
    category: 'UTILITY',
    components: [{ type: 'BODY', text: CUERPO, example: { body_text: [EJEMPLO] } }],
  });

  const [color, que] = ESTADOS[creada.status] || [c.gris, creada.status];
  console.log('  ' + c.verde('creada') + ' → ' + color(creada.status) + ' — ' + que);
  console.log(c.gris('\n  Vuelve a correr esto sin --crear para ver cuándo pasa a APPROVED.\n'));
// `process.exitCode` y no `process.exit()`: con una petición de fetch todavía
// abierta, salir a la fuerza revienta libuv en Windows ("Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)") y el proceso devuelve 127, con lo que
// el código de salida deja de servir para encadenar.
})().catch(e => { console.error(c.rojo('\n' + e.message + '\n')); process.exitCode = 1; });
