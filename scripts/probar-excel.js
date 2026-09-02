#!/usr/bin/env node
//
// Corre las expresiones de los dos nodos de Excel SIN tocar Google.
//
// Existe por dos fallos que en producción no hacen ruido:
//
// 1. La columna corrida. El nodo arma un array de celdas y la hoja tiene una
//    fila de encabezados; nada en n8n comprueba que se correspondan. El día
//    que alguien meta una columna en medio, las filas nuevas siguen entrando
//    -- con el teléfono debajo de "sede" -- y no se nota hasta que un asesor
//    intenta llamar. Aquí se comparan contra `PESTANAS` de
//    `preparar-excel.js`, que es lo que de verdad se escribió en la hoja.
//
// 2. La celda que Sheets se come. Los nodos escriben con
//    valueInputOption=USER_ENTERED, que interpreta la celda igual que si la
//    tecleara una persona: lo que empieza por "+", "-", "=" o "@" entra como
//    FÓRMULA. El teléfono de contacto sale de `Validar Datos` normalizado a
//    E.164 (+573001234567), así que sin escapar se guardaba como el número
//    573001234567 -- sin el +57 y sin poder marcarse. Y `detalle` lo redacta
//    el modelo, así que puede empezar por cualquier cosa. Por eso los nodos
//    anteponen un apóstrofo a las columnas de texto: Sheets se lo come y deja
//    el valor tal cual. Esta prueba comprueba que ninguna celda se queda sin
//    ese escape.
//
// No pide red ni credenciales: lee los .json del repo. Ojo con eso -- si el
// repo va por detrás del VPS, esto aprueba lo que no corre. `verificar-
// despliegue.js` es lo que cubre esa parte.
//
//   node scripts/probar-excel.js

const fs = require('fs');
const path = require('path');
const { PESTANAS } = require('./preparar-excel.js');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

// Datos como los que producen de verdad los nodos de arriba. Los bordes están
// puestos a propósito: el teléfono en E.164 y un `detalle` que empieza por "+".
const AGUAS_ARRIBA = {
  Reservas: {
    'Separar Fecha': { fecha: '2026-11-21', sede: 'Sede Campestre', cliente: 'Maria Fernanda Ruiz' },
    'Validar Datos': { fecha_legible: 'sábado 21 de noviembre', telefono_contacto: '+573001234567' },
    'Bloquear en Calendar': { id: '6mn8kq3b1p9d4f0h2j5l7r9t1v' },
  },
  Citas: {
    'Calcular Ventana': {
      inicio_legible: 'martes 15 de septiembre a las 14:00',
      inicio: '2026-09-15T14:00:00-05:00', fin: '2026-09-15T14:30:00-05:00',
      tipo_cita: 'visita', nombre: 'Carlos Andrés Pérez',
      telefono_contacto: '+573109876543', telefono: '+573001112233',
      detalle: '+ 2 acompañantes | esperando confirmación',
    },
    'Crear Cita': { id: 'a1b2c3d4e5f6g7h8i9j0k1l2m3' },
  },
};

// Las columnas que llevan una fecha o una hora de verdad entran sin escapar, a
// propósito: así la hoja las ordena y las filtra como fechas. El resto son
// texto y tienen que llegar escapadas.
const COLUMNAS_DE_FECHA = new Set(['anotado_en', 'fecha_evento', 'inicio', 'fin']);

const $now = { setZone: () => ({ toFormat: () => '2026-09-02 14:05' }) };

// El mismo truco que hace n8n: la expresión es JavaScript, y aquí se le pasan
// unos `$` de mentira que devuelven los datos de arriba. Es código del repo,
// no entra nada de fuera.
function evaluar(expresion, nodos) {
  const $ = nombre => {
    if (!(nombre in nodos)) throw new Error(`la expresión llama al nodo "${nombre}", que no está aguas arriba`);
    return { item: { json: nodos[nombre] } };
  };
  const cuerpo = expresion.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(new Function('$', '$now', 'return (' + cuerpo + ')')($, $now));
}

let fallos = 0;
const mal = t => { console.log('    ' + c.rojo('✗') + ' ' + t); fallos++; };

console.log(c.neg('\nLas filas que arman los dos nodos de Excel'));

for (const [pestana, def] of Object.entries(PESTANAS)) {
  console.log('\n  ' + c.neg(`${pestana}  (${def.rango})`) + c.gris(`  ${def.workflow} → ${def.nodo}`));

  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', def.workflow), 'utf8'));
  const nodo = wf.nodes.find(n => n.name === def.nodo);
  if (!nodo) { mal(`no hay ningún nodo "${def.nodo}" en ${def.workflow}`); continue; }

  // El nodo tiene que apuntar a la pestaña y al rango que dice PESTANAS.
  const url = nodo.parameters.url || '';
  if (!url.includes(encodeURIComponent(`${pestana}!${def.rango}`)) &&
      !url.includes(`${pestana}!${def.rango}`)) {
    mal(`la URL del nodo no apunta a ${pestana}!${def.rango}`);
    console.log(c.gris('      ' + url));
  }

  let fila;
  try {
    fila = evaluar(nodo.parameters.jsonBody, AGUAS_ARRIBA[pestana]).values[0];
  } catch (e) { mal(e.message); continue; }

  if (fila.length !== def.columnas.length) {
    mal(`la fila trae ${fila.length} celdas y la pestaña tiene ${def.columnas.length} columnas`);
  }

  fila.forEach((celda, i) => {
    const columna = def.columnas[i] || c.rojo('(sin encabezado)');
    const s = String(celda);
    const escapada = s.startsWith("'");
    const visible = escapada ? s.slice(1) : s;
    let nota = '';
    if (!escapada && /^[=+\-@]/.test(s)) {
      nota = c.rojo(' ← Sheets la guardaría como FÓRMULA');
      fallos++;
    } else if (!escapada && !COLUMNAS_DE_FECHA.has(def.columnas[i]) && def.columnas[i] !== 'origen') {
      nota = c.rojo(' ← columna de texto sin escapar');
      fallos++;
    }
    console.log(`    ${String(columna).padEnd(18)} ${JSON.stringify(visible)}${nota}`);
  });
}

// Una expresión que llame a un nodo que no existe tiene que reventar aquí.
console.log('');
try {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', PESTANAS.Reservas.workflow), 'utf8'));
  evaluar(wf.nodes.find(n => n.name === PESTANAS.Reservas.nodo).parameters.jsonBody, {});
  mal('una expresión con un nodo inexistente no se quejó');
} catch {
  console.log('  ' + c.verde('✓') + ' una referencia a un nodo que no existe revienta aquí, no en vivo');
}

console.log(fallos === 0
  ? c.verde('\nTodo bien: cada celda cae en su columna y ninguna entra como fórmula.\n')
  : c.rojo(`\n${fallos} problema(s).\n`));
process.exit(fallos === 0 ? 0 : 1);
