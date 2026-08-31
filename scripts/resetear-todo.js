const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

async function query(sql, reintentos = 4) {
  for (let i = 0; i < reintentos; i++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const cuerpo = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${cuerpo.slice(0, 800)}`);
      return JSON.parse(cuerpo);
    } catch (e) {
      if (i === reintentos - 1) throw e;
      console.log(`  reintentando consulta (${i + 1}/${reintentos})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

async function main() {
  console.log('=== ESTADO ACTUAL DE DATOS ===');
  const conteos = await query(`
    select 
      (select count(*) from n8n_chat_histories) as chats,
      (select count(*) from mensajes_fragmentos) as fragmentos,
      (select count(*) from envios_medios) as envios_medios,
      (select count(*) from cotizaciones_aforos) as cotizaciones,
      (select count(*) from reservas) as reservas,
      (select count(*) from citas) as citas,
      (select count(*) from agenda_reservas) as agenda_reservas,
      (select count(*) from leads) as leads;
  `);
  console.table(conteos);

  console.log('Borrando datos de prueba...');
  await query(`
    truncate table n8n_chat_histories restart identity cascade;
    truncate table mensajes_fragmentos restart identity cascade;
    truncate table envios_medios restart identity cascade;
    truncate table cotizaciones_aforos restart identity cascade;
    truncate table reservas restart identity cascade;
    truncate table citas restart identity cascade;
    truncate table agenda_reservas restart identity cascade;
    truncate table leads restart identity cascade;
  `);

  console.log('=== ESTADO DESPUÉS DEL RESETEO ===');
  const nuevoConteos = await query(`
    select 
      (select count(*) from n8n_chat_histories) as chats,
      (select count(*) from mensajes_fragmentos) as fragmentos,
      (select count(*) from envios_medios) as envios_medios,
      (select count(*) from cotizaciones_aforos) as cotizaciones,
      (select count(*) from reservas) as reservas,
      (select count(*) from citas) as citas,
      (select count(*) from agenda_reservas) as agenda_reservas,
      (select count(*) from leads) as leads;
  `);
  console.table(nuevoConteos);
}

main().catch(console.error);
