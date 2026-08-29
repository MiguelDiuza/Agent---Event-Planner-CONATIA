#!/usr/bin/env node
//
// Vuelca el prompt del `.md` al `systemMessage` del nodo AI Agent.
//
// El texto del prompt vive DOS veces: en `n8n/system-prompt-angie-otero.md`,
// dentro del bloque ````text, y dentro de `n8n/workflow-angie-otero.json`. Es
// la duplicación más peligrosa del repo, porque las dos copias se leen igual
// de bien y solo una es la que ve el modelo.
//
// Así que no se editan las dos: se edita el `.md` y se corre esto. El `.md` es
// la fuente; el nodo, el reflejo.
//
// El `.md` va en CRLF y el nodo en LF: la conversión se hace aquí.
//
//   node scripts/sincronizar-prompt.js            # dice si están sincronizados
//   node scripts/sincronizar-prompt.js --escribir # vuelca el .md al nodo

const fs = require('fs');

const RUTA_MD = 'n8n/system-prompt-angie-otero.md';
const RUTA_WF = 'n8n/workflow-angie-otero.json';
const NODO = 'Angie Otero';
const ESCRIBIR = process.argv.includes('--escribir');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m` };

const md = fs.readFileSync(RUTA_MD, 'utf8');
const bloque = md.match(/^````text\r?\n([\s\S]*?)\r?\n````\s*$/m);
if (!bloque) {
  console.error(`${RUTA_MD}: no encontré el bloque \`\`\`\`text con el prompt.`);
  process.exit(1);
}
const delMd = bloque[1].split('\r\n').join('\n');

const w = JSON.parse(fs.readFileSync(RUTA_WF, 'utf8'));
const agente = w.nodes.find(n => n.name === NODO);
if (!agente) { console.error(`no existe el nodo "${NODO}"`); process.exit(1); }

// El systemMessage lleva `=` delante porque es una expresión de n8n: dentro
// tiene `{{ $now... }}` y `{{ $('Catálogo de Medios')... }}`. Sin el `=` esas
// dos llegan al modelo sin evaluar, con las llaves y todo.
const actual = agente.parameters.options.systemMessage;
if (!actual.startsWith('=')) {
  console.error(c.rojo('el systemMessage del nodo no empieza por "=": las expresiones no se evaluarían.'));
  process.exit(1);
}
const delNodo = actual.slice(1);

if (delMd === delNodo) {
  console.log(c.verde('sincronizados') + c.gris(` (${delMd.length} caracteres)`));
  process.exit(0);
}

// Qué cambió, para no volcar a ciegas.
const a = delMd.split('\n'), b = delNodo.split('\n');
console.log(c.ama('NO están sincronizados') + c.gris(`  .md: ${a.length} líneas · nodo: ${b.length} líneas`));
let mostradas = 0;
for (let i = 0; i < Math.max(a.length, b.length) && mostradas < 6; i++) {
  if (a[i] === b[i]) continue;
  mostradas++;
  console.log(c.gris(`  línea ${i + 1}`));
  console.log('    .md  ' + (a[i] === undefined ? c.gris('(no existe)') : JSON.stringify(a[i]).slice(0, 150)));
  console.log('    nodo ' + (b[i] === undefined ? c.gris('(no existe)') : JSON.stringify(b[i]).slice(0, 150)));
}

if (!ESCRIBIR) {
  console.log(c.ama('\nNada se escribió. Corre con --escribir para volcar el .md al nodo.'));
  process.exit(1);
}

agente.parameters.options.systemMessage = '=' + delMd;
// Algunos .json traen los nodos DOS veces (`nodes` y `activeVersion.nodes`) y
// lo que corre en el VPS es la segunda. Cuando está, se actualizan las dos o el
// repo miente. Y cuando NO está -- que es el caso desde que los .json se
// guardan limpios -- esto se salta: hasta el 2026-08-29 asumía que existía
// siempre y reventaba con un TypeError DESPUÉS de haber impreso el diff, así
// que parecía que el volcado había salido bien.
if (w.activeVersion) {
  w.activeVersion.nodes = w.nodes;
  w.activeVersion.connections = w.connections;
}
fs.writeFileSync(RUTA_WF, JSON.stringify(w, null, 2) + '\n');
console.log(c.verde(`\nvolcado: ${delMd.length} caracteres del .md al nodo "${NODO}"`));
