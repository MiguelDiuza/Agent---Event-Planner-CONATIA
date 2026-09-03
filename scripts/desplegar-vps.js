#!/usr/bin/env node
//
// Publica los workflows del repo en el VPS.
//
// Antes de subir nada corre `verificar-despliegue.js` a la inversa: se guarda
// una copia de lo que hay AHORA en el VPS, por si hay que volver. n8n 2.x
// versiona, pero el respaldo local no depende de que la UI lo haga bien.
//
// Solo sube lo que de verdad cambió (tipo, parámetros, credenciales o si el
// nodo está deshabilitado). Un PUT que no cambia nada gasta un versionId y
// ensucia el historial.
//
// Uso:  node scripts/desplegar-vps.js            (muestra qué cambiaría)
//       node scripts/desplegar-vps.js --publicar (lo sube)

const fs = require('fs');
const path = require('path');

const { N8N_VPS_URL, N8N_VPS_API_KEY } = process.env;
if (!N8N_VPS_URL || !N8N_VPS_API_KEY) {
  console.error('Faltan N8N_VPS_URL y N8N_VPS_API_KEY. Cárgalos del .env.');
  process.exit(1);
}

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

const WORKFLOWS = [
  ['workflow-angie-otero.json', process.env.N8N_VPS_WORKFLOW_BRIAN_OTERO],
  ['workflow-agendar-cita.json', process.env.N8N_VPS_WORKFLOW_AGENDAR_CITA],
  ['workflow-enviar-medios.json', process.env.N8N_VPS_WORKFLOW_ENVIAR_MEDIOS],
  ['workflow-seguimiento.json', process.env.N8N_VPS_WORKFLOW_SEGUIMIENTO],
  ['workflow-separar-fecha.json', process.env.N8N_VPS_WORKFLOW_SEPARAR_FECHA],
  ['workflow-sincronizar-hoja.json', process.env.N8N_VPS_WORKFLOW_SINCRONIZAR_HOJA],
];

const publicar = process.argv.includes('--publicar');
const RESPALDO = path.join('.respaldo-vps-' + new Date().toISOString().slice(0, 10));

const api = async (ruta, opciones = {}, reintentos = 4) => {
  for (let i = 0; i < reintentos; i++) {
    try {
      const r = await fetch(`${N8N_VPS_URL}/api/v1${ruta}`, {
        ...opciones,
        headers: { 'X-N8N-API-KEY': N8N_VPS_API_KEY, 'Content-Type': 'application/json',
                   ...(opciones.headers || {}) },
      });
      const cuerpo = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}: ${cuerpo.slice(0, 400)}`);
      return JSON.parse(cuerpo);
    } catch (e) {
      if (i === reintentos - 1) throw e;
      console.log(`  reintentando conexión al VPS (${i + 1}/${reintentos})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
};

// Lo que decide el comportamiento. La posicion en el lienzo no entra: mover un
// nodo no es un cambio que merezca una version nueva.
//
// `onError` y `alwaysOutputData` entraron el 2026-09-03, y no por gusto: los
// dos cambian lo que hace el flujo y ninguno estaba aqui. Un nodo al que se le
// pone `alwaysOutputData` --lo que evita que una rama entera se corte en
// silencio-- se subia como 'sin cambios', y `verificar-despliegue.js` decia
// despues que no habia deriva. Las dos cosas mintiendo a la vez, y en la
// direccion que menos se nota.
const huella = (n) => JSON.stringify({
  type: n.type,
  disabled: !!n.disabled,
  parameters: n.parameters,
  credentials: n.credentials ?? null,
  onError: n.onError ?? null,
  alwaysOutputData: !!n.alwaysOutputData,
});

(async () => {
  if (publicar && !fs.existsSync(RESPALDO)) fs.mkdirSync(RESPALDO);
  let subidos = 0, iguales = 0;

  for (const [archivo, id] of WORKFLOWS) {
    if (!id) { console.log(c.rojo(`✗ ${archivo}: sin id en el .env`)); continue; }
    const local = JSON.parse(fs.readFileSync(path.join('n8n', archivo), 'utf8'));
    const vivo = await api(`/workflows/${id}`);

    const mLocal = new Map(local.nodes.map(n => [n.name, huella(n)]));
    const mVivo = new Map(vivo.nodes.map(n => [n.name, huella(n)]));
    const cambios = [
      ...[...mLocal.keys()].filter(k => !mVivo.has(k)).map(k => '+ ' + k),
      ...[...mVivo.keys()].filter(k => !mLocal.has(k)).map(k => '- ' + k),
      ...[...mLocal.keys()].filter(k => mVivo.has(k) && mLocal.get(k) !== mVivo.get(k)).map(k => '~ ' + k),
    ];

    if (!cambios.length) {
      console.log(c.gris(`= ${archivo}: sin cambios`));
      iguales++;
      continue;
    }

    console.log(`${publicar ? c.verde('↑') : c.ama('·')} ${c.neg(archivo)}  ${cambios.join('  ')}`);
    if (!publicar) continue;

    fs.writeFileSync(path.join(RESPALDO, `${id}.json`), JSON.stringify(vivo, null, 2) + '\n');
    // El PUT solo acepta estos cuatro campos; mandarle `active` o `id` lo
    // rechaza con un 400 que no dice cuál sobra.
    await api(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: local.name, nodes: local.nodes,
        connections: local.connections, settings: local.settings ?? {},
      }),
    });
    subidos++;
  }

  console.log('\n' + (publicar
    ? c.verde(`${subidos} workflow(s) publicados, ${iguales} sin cambios. Respaldo en ${RESPALDO}/`)
    : c.ama('nada subido: corre con --publicar cuando el banco esté en verde')));
})().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
