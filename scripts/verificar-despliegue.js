#!/usr/bin/env node
//
// ¿Lo que está en el repo es lo que está corriendo?
//
// Existe por lo que pasó el 2026-08-29. El VPS iba SEIS NODOS por delante del
// repo (anotar_datos, Ficha del Cliente, ¿Comando /new?, Reiniciar Chat,
// Sembrar Saludo, Saludo Reinicio) y la base tenía dos migraciones que en el
// repo no estaban. Nadie lo notó porque nada lo miraba -- y lo peor es que
// `probar-fragmentos.js` y `banco-pruebas.js` leen los nodos del .json del
// REPO: mientras hubo deriva, las pruebas estuvieron dando en verde sobre un
// workflow que no era el que atendía a los clientes.
//
// O sea que esto no es una comodidad de despliegue. Es lo que le da sentido a
// todo lo demás que hay en scripts/.
//
// Uso:  node scripts/verificar-despliegue.js
// Sale 1 si hay deriva, para poder encadenarlo antes de dar algo por bueno.

const fs = require('fs');
const path = require('path');

const { N8N_VPS_URL, N8N_VPS_API_KEY, SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN } = process.env;
if (!N8N_VPS_URL || !N8N_VPS_API_KEY) {
  console.error('Faltan N8N_VPS_URL y N8N_VPS_API_KEY. Cárgalos del .env.');
  process.exit(1);
}

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };
let problemas = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { problemas++; if (detalle) console.log('      ' + c.gris(detalle)); }
};

// El id del VPS de cada archivo del repo. Se lee del .env para no repetirlos.
const WORKFLOWS = [
  ['workflow-angie-otero.json', process.env.N8N_VPS_WORKFLOW_BRIAN_OTERO],
  ['workflow-agendar-cita.json', process.env.N8N_VPS_WORKFLOW_AGENDAR_CITA],
  ['workflow-enviar-medios.json', process.env.N8N_VPS_WORKFLOW_ENVIAR_MEDIOS],
  ['workflow-seguimiento.json', process.env.N8N_VPS_WORKFLOW_SEGUIMIENTO],
  ['workflow-separar-fecha.json', process.env.N8N_VPS_WORKFLOW_SEPARAR_FECHA],
];

// `Seguimiento automático` está desactivado a propósito desde el 2026-08-24, así
// que su "INACTIVO" no es deriva. Los demás sí tienen que estar activos.
const PUEDE_ESTAR_INACTIVO = new Set(['workflow-seguimiento.json']);

// Ni el VPS ni la Management API de Supabase son fiables al 100 % desde aquí:
// el 2026-08-29 tiraron media docena de peticiones (ECONNRESET, ENOTFOUND).
// Sin reintento, este archivo dice "deriva" cuando lo que hubo fue un corte de
// red -- y una alarma que miente se acaba ignorando, que es justo lo contrario
// de para lo que existe.
async function conReintento(hacer, que) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try { return await hacer(); } catch (e) {
      ultimo = e;
      if (intento < 3) await new Promise(r => setTimeout(r, 800 * intento));
    }
  }
  throw new Error(`${que}: ${ultimo.message}`);
}

const traer = (id) => conReintento(async () => {
  const r = await fetch(`${N8N_VPS_URL}/api/v1/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': N8N_VPS_API_KEY },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}, `no se pudo leer el workflow ${id} del VPS`);

// Lo que de verdad decide el comportamiento: el tipo del nodo, sus parámetros y
// si está deshabilitado. Posición y color no se comparan -- mover un nodo en el
// lienzo no es un cambio de comportamiento y no debería teñir esto de rojo.
const huella = (n) => JSON.stringify({
  type: n.type,
  disabled: !!n.disabled,
  parameters: n.parameters,
  credentials: n.credentials ?? null,
});

async function compararWorkflows() {
  console.log(c.neg('\nn8n: el repo contra lo que corre en el VPS'));
  for (const [archivo, id] of WORKFLOWS) {
    if (!id) { ok(false, `${archivo}: no hay id en el .env`); continue; }
    const local = JSON.parse(fs.readFileSync(path.join('n8n', archivo), 'utf8'));
    const vivo = await traer(id);

    // n8n 2.x versiona: `versionId` es el borrador que se ve en el editor y
    // `activeVersionId` es lo que de verdad atiende a los clientes. Un PUT
    // sube el borrador; si no queda publicado, el editor muestra los cambios,
    // este archivo los daría por buenos comparando contra `nodes` -- que es el
    // borrador -- y en producción seguiría corriendo la versión vieja. Sería
    // exactamente el fallo mudo que este archivo existe para evitar.
    const publicado = !vivo.activeVersionId || vivo.versionId === vivo.activeVersionId;
    ok(publicado, `${archivo}: el borrador está publicado`,
       `versionId ${vivo.versionId} · activeVersionId ${vivo.activeVersionId} — ` +
       'el editor muestra una cosa y los clientes reciben otra');

    // Y se compara contra la versión ACTIVA cuando el VPS la devuelve, no
    // contra el borrador.
    const nodosVivos = (vivo.activeVersion && vivo.activeVersion.nodes) || vivo.nodes;

    const mLocal = new Map(local.nodes.map((n) => [n.name, huella(n)]));
    const mVivo = new Map(nodosVivos.map((n) => [n.name, huella(n)]));

    const soloVivo = [...mVivo.keys()].filter((k) => !mLocal.has(k));
    const soloLocal = [...mLocal.keys()].filter((k) => !mVivo.has(k));
    const distintos = [...mVivo.keys()].filter((k) => mLocal.has(k) && mLocal.get(k) !== mVivo.get(k));

    const igual = !soloVivo.length && !soloLocal.length && !distintos.length;
    const detalle = [
      soloVivo.length ? 'solo en el VPS: ' + soloVivo.join(', ') : null,
      soloLocal.length ? 'solo en el repo: ' + soloLocal.join(', ') : null,
      distintos.length ? 'difieren: ' + distintos.join(', ') : null,
    ].filter(Boolean).join(' | ');

    ok(igual, `${archivo} (${nodosVivos.length} nodos)`, detalle);

    if (!PUEDE_ESTAR_INACTIVO.has(archivo)) {
      ok(vivo.active, `${archivo}: está activo en el VPS`,
         'desactivado: los clientes no lo están tocando');
    }
  }
}

async function compararMigraciones() {
  if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
    console.log(c.neg('\nSupabase: sin credenciales, no se compara'));
    return;
  }
  console.log(c.neg('\nSupabase: el repo contra schema_migrations'));
  let filas;
  try {
    filas = await conReintento(async () => {
      const r = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'select version from supabase_migrations.schema_migrations order by version' }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }, 'no se pudo consultar schema_migrations');
  } catch (e) { ok(false, 'no se pudo consultar schema_migrations', e.message); return; }

  // Las primeras migraciones quedaron registradas con el nombre entero como
  // version; se compara por el prefijo numérico, que es lo único común.
  const prefijo = (s) => s.slice(0, 14);
  const enBase = new Set(filas.map((f) => prefijo(f.version)));
  const enRepo = fs.readdirSync(path.join('supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql')).map(prefijo);

  const sinAplicar = enRepo.filter((v) => !enBase.has(v));
  const sinArchivo = [...enBase].filter((v) => !enRepo.includes(v));

  ok(sinAplicar.length === 0, 'todas las migraciones del repo están aplicadas',
     'sin aplicar: ' + sinAplicar.join(', '));
  ok(sinArchivo.length === 0, 'toda migración aplicada tiene su archivo en el repo',
     'aplicadas sin archivo: ' + sinArchivo.join(', '));
}

(async () => {
  await compararWorkflows();
  await compararMigraciones();
  console.log('\n' + (problemas
    ? c.rojo(`${problemas} deriva(s): lo que se probó no es lo que corre`)
    : c.verde('sin deriva: el repo es lo que corre')) + '\n');
  process.exit(problemas ? 1 : 0);
})().catch((e) => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
