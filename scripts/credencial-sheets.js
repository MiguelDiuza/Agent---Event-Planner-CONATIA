#!/usr/bin/env node
//
// Crea en n8n la credencial con la que se escribe en el Excel del equipo, a
// partir de un JSON de cuenta de servicio, y repunta los dos nodos.
//
// POR QUÉ ES UNA CUENTA DE SERVICIO APARTE (2026-09-02)
//
// La Google Sheets API hay que habilitarla en el proyecto dueño de la
// CREDENCIAL que hace la llamada, no donde vive la hoja. Son dos cosas
// distintas y ahí está el truco: la hoja puede seguir en el Google del
// cliente mientras la llamada la haga una cuenta de servicio de un proyecto
// nuestro.
//
// Hizo falta porque el proyecto del cliente (omega-dahlia-500617-g6) tiene la
// Sheets API apagada y no hay forma de encenderla desde aquí: la cuenta de
// servicio no tiene `serviceusage.services.enable` -- comprobado contra la API,
// y tampoco puede ni consultar el estado del servicio -- y a la consola de ese
// Google no se puede entrar porque pide verificación en dos pasos y la cuenta
// es del cliente.
//
// La de Calendar NO se toca: sigue siendo la del proyecto del cliente y sigue
// sin poder tocar hojas de cálculo. Esta credencial nueva solo lleva el scope
// de spreadsheets y solo puede hablar con sheets.googleapis.com, así que si un
// día se filtra, no abre nada más.
//
//   node --env-file=.env scripts/credencial-sheets.js .gcp-sa-sheets.json
//   node --env-file=.env scripts/credencial-sheets.js .gcp-sa-sheets.json --crear
//   node --env-file=.env scripts/credencial-sheets.js .gcp-sa-sheets.json --crear --repuntar

const fs = require('fs');
const path = require('path');

const { N8N_VPS_URL, N8N_VPS_API_KEY } = process.env;
const NOMBRE = 'Google Service Account - Sheets';
const DOMINIO = 'sheets.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const WORKFLOWS = [
  ['workflow-separar-fecha.json', 'Anotar en Excel'],
  ['workflow-agendar-cita.json', 'Anotar Cita en Excel'],
];

const CREAR = process.argv.includes('--crear');
const REPUNTAR = process.argv.includes('--repuntar');
const LLAVE = process.argv.slice(2).find(a => !a.startsWith('--'));

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

async function api(ruta, metodo = 'GET', cuerpo = null) {
  const r = await fetch(`${N8N_VPS_URL}/api/v1${ruta}`, {
    method: metodo,
    headers: { 'X-N8N-API-KEY': N8N_VPS_API_KEY, 'Content-Type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : null;
}

async function main() {
  if (!N8N_VPS_URL || !N8N_VPS_API_KEY) {
    console.error('Faltan N8N_VPS_URL y N8N_VPS_API_KEY. Cárgalos del .env (node --env-file=.env ...).');
    process.exitCode = 1;
    return;
  }
  if (!LLAVE) {
    console.error('Dime qué archivo de cuenta de servicio usar. Ej: scripts/credencial-sheets.js .gcp-sa-sheets.json');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(LLAVE)) {
    console.error(`No encuentro ${LLAVE}.`);
    process.exitCode = 1;
    return;
  }

  const sa = JSON.parse(fs.readFileSync(LLAVE, 'utf8'));
  for (const campo of ['client_email', 'private_key', 'project_id']) {
    if (!sa[campo]) {
      console.error(`A ${LLAVE} le falta "${campo}": eso no es una llave de cuenta de servicio.`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(c.neg('\nLa cuenta de servicio que va a escribir en el Excel'));
  console.log('  correo:   ' + c.neg(sa.client_email));
  console.log('  proyecto: ' + sa.project_id);
  console.log(c.gris('\n  El Excel tiene que estar compartido como EDITOR con ese correo,'));
  console.log(c.gris('  y la Google Sheets API habilitada en ESE proyecto (no donde vive la hoja).'));

  if (!CREAR) {
    console.log(c.ama('\n  Córrelo con --crear para dar de alta la credencial en n8n.\n'));
    return;
  }

  // n8n no deja listar credenciales por la API pública, así que no se puede
  // comprobar si ya existe una igual: se crea y se repunta a la nueva. La vieja
  // queda huérfana en la UI, y ahí se borra a mano si estorba.
  const cred = await api('/credentials', 'POST', {
    name: NOMBRE,
    type: 'googleApi',
    data: {
      email: sa.client_email,
      privateKey: sa.private_key,
      // El cinturón: esta credencial solo sirve para hojas de cálculo y solo
      // puede hablar con sheets.googleapis.com. Un nodo HTTP que la use para
      // otra cosa se queda fuera.
      httpNode: true,
      scopes: SCOPE,
      allowedHttpRequestDomains: 'domains',
      allowedDomains: DOMINIO,
    },
  });

  console.log('\n  ' + c.verde('creada') + ' la credencial ' + c.neg(cred.id) + ` (${NOMBRE})`);
  console.log(c.gris(`  restringida a ${DOMINIO}, scope ${SCOPE}`));

  if (!REPUNTAR) {
    console.log(c.ama('\n  Falta apuntar los nodos a ella: vuelve a correr con --repuntar.'));
    console.log(c.gris('  Y anota el id nuevo en N8N_VPS_CREDENCIAL_SHEETS del .env.\n'));
    return;
  }

  for (const [archivo, nodo] of WORKFLOWS) {
    const ruta = path.join(__dirname, '..', 'n8n', archivo);
    const wf = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    const n = wf.nodes.find(x => x.name === nodo);
    if (!n) { console.log('  ' + c.rojo('✗') + ` no existe el nodo ${nodo} en ${archivo}`); process.exitCode = 1; continue; }
    const antes = n.credentials.googleApi.id;
    n.credentials.googleApi = { id: cred.id, name: NOMBRE };
    // Serializar ENTERO antes de abrir: abrir en "w" trunca al instante, y un
    // fallo al codificar dejaría el workflow vacío.
    const salida = JSON.stringify(wf, null, 2) + '\n';
    fs.writeFileSync(ruta, salida, 'utf8');
    console.log('  ' + c.verde('↻') + ` ${archivo} → ${nodo}: ${antes} → ${cred.id}`);
  }

  console.log(c.gris('\n  Ahora: anota el id en N8N_VPS_CREDENCIAL_SHEETS del .env, corre'));
  console.log(c.gris('  `preparar-excel.js --crear --probar`, y si sale verde, sube con desplegar-vps.js.\n'));
}

main().catch(e => { console.error(c.rojo('\n' + e.message + '\n')); process.exitCode = 1; });
