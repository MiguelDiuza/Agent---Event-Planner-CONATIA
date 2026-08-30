#!/usr/bin/env node
//
// Revisa los cinco .json de n8n, nodo por nodo, sin base y sin red.
//
// No prueba lo que hacen los nodos -- para eso están las otras pruebas -- sino
// que estén bien armados: que nadie referencie un nodo que no existe, que nadie
// quede colgando sin entrada, que las credenciales estén puestas y que
// `nodes` y `activeVersion.nodes` no se hayan separado.
//
// Esa última es la trampa que ya costó una vez: los .json traen los nodos DOS
// veces y lo que corre en el VPS es `activeVersion.nodes`. Editar uno solo deja
// el repo mintiendo y el grep pasando en verde.
//
// La revisión de referencias es la que más vale: en n8n una expresión
// `$('Nodo X')` contra un nodo renombrado no falla al guardar, falla en
// producción, delante del cliente y sin dejar rastro claro.
//
// Uso:  node scripts/revisar-workflows.js

const fs = require('fs');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

const ARCHIVOS = [
  'n8n/workflow-angie-otero.json',
  'n8n/workflow-agendar-cita.json',
  'n8n/workflow-enviar-medios.json',
  'n8n/workflow-separar-fecha.json',
  'n8n/workflow-seguimiento.json',
];

// Nodos que arrancan un flujo: no necesitan que nadie les entre.
const ARRANCAN = new Set([
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.executeWorkflowTrigger',
  '@n8n/n8n-nodes-langchain.chatTrigger',
]);

// Nodos que se enganchan al agente por un puerto que no es `main`.
const DEL_AGENTE = new Set([
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.memoryPostgresChat',
  '@n8n/n8n-nodes-langchain.toolWorkflow',
  'n8n-nodes-base.postgresTool',
]);

const NECESITAN_CREDENCIAL = new Set([
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.postgresTool',
]);

let errores = 0, avisos = 0;
const mal = (t, d) => { errores++; console.log('  ' + c.rojo('✗') + ' ' + t + (d ? '\n      ' + c.gris(d) : '')); };
const ojo = (t, d) => { avisos++; console.log('  ' + c.ama('!') + ' ' + t + (d ? '\n      ' + c.gris(d) : '')); };
const bien = (t) => console.log('  ' + c.verde('✓') + ' ' + t);

// Todo el texto de un nodo, para buscarle las expresiones dentro.
function textoDe(valor, salida = []) {
  if (typeof valor === 'string') salida.push(valor);
  else if (Array.isArray(valor)) valor.forEach(v => textoDe(v, salida));
  else if (valor && typeof valor === 'object') Object.values(valor).forEach(v => textoDe(v, salida));
  return salida;
}

for (const archivo of ARCHIVOS) {
  const w = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  console.log('\n' + c.neg(w.name) + c.gris('   ' + archivo));

  const nodos = w.nodes || [];
  const nombres = new Set(nodos.map(n => n.name));
  const conex = w.connections || {};

  // --- el espejo -----------------------------------------------------------
  // Los .json del repo ya no llevan `activeVersion` (desde el 2026-08-29): eran
  // una copia entera de `nodes` dentro del mismo archivo, duplicaban su tamaño
  // y no aportaban nada que se pudiera comprobar aquí.
  //
  // Y comprobarlo aquí era, además, engañoso. Este archivo mira el REPO; si el
  // repo se quedó atrás, `activeVersion` era el espejo de un despliegue viejo y
  // salía en verde igual. Lo único que responde de verdad "¿esto es lo que
  // corre?" es preguntárselo al VPS: eso lo hace `verificar-despliegue.js`, y
  // es el que hay que correr antes de dar nada por bueno.
  if (w.activeVersion) {
    const av = w.activeVersion;
    const espejoNodos = JSON.stringify(nodos) === JSON.stringify(av.nodes || []);
    const espejoConex = JSON.stringify(conex) === JSON.stringify(av.connections || {});
    if (espejoNodos && espejoConex) bien(`${nodos.length} nodos, y activeVersion es un espejo exacto`);
    else mal('`nodes` y `activeVersion.nodes` NO coinciden: en el VPS corre activeVersion',
             `nodos iguales: ${espejoNodos} · conexiones iguales: ${espejoConex}`);
  } else {
    bien(`${nodos.length} nodos (si corren o no en el VPS lo dice verificar-despliegue.js)`);
  }

  // --- nombres repetidos ---------------------------------------------------
  const repes = nodos.map(n => n.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (repes.length) mal('nombres de nodo repetidos', [...new Set(repes)].join(', '));

  // --- conexiones que apuntan a nodos que no existen ------------------------
  const rotas = [];
  for (const [origen, puertos] of Object.entries(conex)) {
    if (!nombres.has(origen)) rotas.push(`sale de "${origen}", que no existe`);
    for (const ramas of Object.values(puertos)) {
      for (const rama of ramas || []) {
        for (const destino of rama || []) {
          if (!nombres.has(destino.node)) rotas.push(`"${origen}" apunta a "${destino.node}", que no existe`);
        }
      }
    }
  }
  if (rotas.length) mal('conexiones rotas', rotas.join('\n      '));
  else bien('todas las conexiones apuntan a nodos que existen');

  // --- nodos sin entrada ---------------------------------------------------
  const conEntrada = new Set();
  for (const puertos of Object.values(conex)) {
    for (const ramas of Object.values(puertos)) {
      for (const rama of ramas || []) for (const d of rama || []) conEntrada.add(d.node);
    }
  }
  const huerfanos = nodos.filter(n =>
    !n.disabled && !ARRANCAN.has(n.type) && !DEL_AGENTE.has(n.type) &&
    !conEntrada.has(n.name) && !conex[n.name]);
  const sueltos = nodos.filter(n =>
    !n.disabled && !ARRANCAN.has(n.type) && !DEL_AGENTE.has(n.type) && !conEntrada.has(n.name) && conex[n.name]);
  if (huerfanos.length) ojo('nodos sin entrada ni salida (sobran)', huerfanos.map(n => n.name).join(', '));
  if (sueltos.length) mal('nodos que salen pero a los que nadie entra', sueltos.map(n => n.name).join(', '));
  if (!huerfanos.length && !sueltos.length) bien('ningún nodo activo se quedó sin entrada');

  // --- referencias $('Nodo') ------------------------------------------------
  const malRef = [];
  for (const n of nodos) {
    for (const t of textoDe(n.parameters)) {
      for (const m of t.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (!nombres.has(m[1])) malRef.push(`"${n.name}" busca $('${m[1]}'), que no existe`);
      }
    }
  }
  if (malRef.length) mal('referencias a nodos inexistentes', [...new Set(malRef)].join('\n      '));
  else bien("todas las referencias $('Nodo') apuntan a nodos que existen");

  // --- credenciales --------------------------------------------------------
  const sinCred = nodos.filter(n => !n.disabled && NECESITAN_CREDENCIAL.has(n.type) &&
    !(n.credentials && Object.keys(n.credentials).length));
  if (sinCred.length) mal('nodos de base sin credencial', sinCred.map(n => n.name).join(', '));
  else bien('todos los nodos de Postgres llevan credencial');

  // --- que el jsCode compile ----------------------------------------------
  // n8n envuelve el jsCode en una función async, así que `await` en el nivel de
  // arriba es legal ahí y hay nodos que lo usan (`Audio a Base64`). Se compila
  // igual, dentro de una async, o esto daría un falso positivo.
  const noCompilan = [];
  for (const n of nodos.filter(x => x.type === 'n8n-nodes-base.code')) {
    try { new Function('DateTime', '$input', '$', '$json', '$now',
                       'return (async () => {' + n.parameters.jsCode + '})'); }
    catch (e) { noCompilan.push(`${n.name}: ${e.message}`); }
  }
  if (noCompilan.length) mal('nodos Code que no compilan', noCompilan.join('\n      '));
  else bien(`los ${nodos.filter(x => x.type === 'n8n-nodes-base.code').length} nodos Code compilan`);

  // --- SQL con parámetros pero sin queryReplacement -------------------------
  const sinParams = [];
  for (const n of nodos.filter(x => x.type.startsWith('n8n-nodes-base.postgres'))) {
    const q = n.parameters.query || '';
    const usa = [...q.matchAll(/\$(\d+)/g)].map(m => +m[1]);
    const rep = (n.parameters.options || {}).queryReplacement;
    if (usa.length && !rep) sinParams.push(`${n.name}: usa $${Math.max(...usa)} y no tiene queryReplacement`);
    if (usa.length && rep) {
      // Cuántos elementos tiene el array literal del queryReplacement.
      const cuenta = (rep.match(/,/g) || []).length + 1;
      if (Math.max(...usa) > cuenta) {
        sinParams.push(`${n.name}: la query pide $${Math.max(...usa)} y el reemplazo parece traer ${cuenta}`);
      }
    }
  }
  if (sinParams.length) ojo('parámetros de SQL', sinParams.join('\n      '));
  else bien('los parámetros de las queries cuadran con sus reemplazos');
}

console.log('\n' + (errores ? c.rojo(`${errores} error(es)`) : c.verde('sin errores'))
  + c.gris(`, ${avisos} aviso(s)`) + '\n');
process.exit(errores ? 1 : 0);
