const fs = require('fs');
const path = require('path');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  const sedes = await query(`
    select id_sede, nombre_sede, tipo_espacio, incluye_pista_cristal
    from sedes
    order by nombre_sede;
  `);

  const precios = await query(`
    select s.nombre_sede, ps.capacidad_invitados, ps.precio_total, s.tipo_espacio, s.incluye_pista_cristal
    from precios_sedes ps
    join sedes s on s.id_sede = ps.sede_id
    order by ps.capacidad_invitados, ps.precio_total::numeric, s.nombre_sede;
  `);

  console.log(`Sedes encontradas: ${sedes.length}`);
  console.log(`Precios encontrados: ${precios.length}`);

  const aforos = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
  const porAforo = {};
  for (const a of aforos) {
    porAforo[a] = precios.filter(p => p.capacidad_invitados === a);
  }

  if (!fs.existsSync('docs')) fs.mkdirSync('docs');
  fs.writeFileSync('docs/datos_tarifario.json', JSON.stringify({ sedes, porAforo, precios }, null, 2));
  console.log('Guardado en docs/datos_tarifario.json');
}

main().catch(console.error);
