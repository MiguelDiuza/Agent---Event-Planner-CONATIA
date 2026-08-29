#!/usr/bin/env node
//
// Aplica un archivo de supabase/migrations contra la base de producción por la
// Management API y lo registra en schema_migrations.
//
// Existe porque en esta máquina no hay psql y `supabase db push` apunta a la
// local: sin esto, cada migración se aplicaba pegando SQL a mano en un curl, y
// el registro en schema_migrations se olvidaba. Ya pasó: 20260827000000,
// 20260827000001, 20260828000003 y 20260828000004 llegaron a la base sin
// quedar registradas o sin quedar en el repo, y desde fuera no había forma de
// saber qué versión estaba corriendo.
//
// Uso: node scripts/aplicar-migracion.js supabase/migrations/2026...sql
//      node scripts/aplicar-migracion.js --estado

const fs = require('fs');
const path = require('path');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

async function consulta(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${cuerpo.slice(0, 800)}`);
  return JSON.parse(cuerpo);
}

// La versión es el prefijo numérico del nombre del archivo, que es como las
// registra el CLI de Supabase.
const versionDe = (nombre) => nombre.slice(0, 14);

async function estado() {
  const filas = await consulta(
    'select version from supabase_migrations.schema_migrations order by version'
  );
  // Las primeras migraciones se registraron con el nombre entero como version;
  // se compara solo por el prefijo numérico para que no cuenten como huecos.
  const enBase = new Set(filas.map((f) => versionDe(f.version)));
  const enRepo = fs
    .readdirSync(path.join('supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map(versionDe);

  const sinAplicar = enRepo.filter((v) => !enBase.has(v));
  const sinArchivo = [...enBase].filter((v) => !enRepo.includes(v));

  console.log(`en el repo: ${enRepo.length}   en la base: ${enBase.size}`);
  console.log('sin aplicar (están en el repo y no en la base):', sinAplicar.join(', ') || 'ninguna');
  console.log('sin archivo (están en la base y no en el repo):', sinArchivo.join(', ') || 'ninguna');
  return sinAplicar.length === 0 && sinArchivo.length === 0;
}

async function aplicar(archivo) {
  const nombre = path.basename(archivo);
  const version = versionDe(nombre);
  const sql = fs.readFileSync(archivo, 'utf8');

  console.log(`aplicando ${nombre} (version ${version})`);
  const salida = await consulta(sql);
  console.log('  ejecutada:', JSON.stringify(salida).slice(0, 200));

  await consulta(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ('${version}', '${nombre.replace(/'/g, "''")}')
     on conflict (version) do nothing`
  );
  console.log('  registrada en schema_migrations');
}

(async () => {
  const arg = process.argv[2];
  if (!arg || arg === '--estado') {
    const limpio = await estado();
    process.exit(limpio ? 0 : 1);
  }
  await aplicar(arg);
})().catch((e) => {
  console.error('FALLÓ: ' + e.message);
  process.exit(1);
});
