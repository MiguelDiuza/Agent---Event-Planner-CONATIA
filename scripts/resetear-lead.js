#!/usr/bin/env node
//
// Resetea un numero de telefono a cero: borra el lead y todo lo que cuelga de
// el, para poder probar la conversacion desde el saludo inicial otra vez.
//
// Mismo mecanismo que `limpiar()` en probar-en-vivo.js -- la API de gestion de
// Supabase (api.supabase.com), con SUPABASE_PROJECT_REF y
// SUPABASE_ACCESS_TOKEN del .env -- para no necesitar el paquete `pg`, que no
// es dependencia de este repo.
//
// Toca: leads, envios_medios, cotizaciones_aforos, agenda_reservas, citas,
// n8n_chat_histories (la memoria del agente) y mensajes_fragmentos.
//
// OJO CON GOOGLE CALENDAR: si el lead tenia una fecha separada o una cita
// agendada, sus filas en agenda_reservas / citas guardan un google_event_id.
// Este script borra la fila de la base pero NO el evento en Google Calendar
// -- esa credencial no vive en este entorno. El script avisa si encuentra
// alguno; hay que borrarlo a mano o con scripts/vaciar-calendario.js.
//
//   node scripts/resetear-lead.js +573001234567             # muestra qué hay, no borra
//   node scripts/resetear-lead.js +573001234567 --borrar    # borra de verdad

const https = require('https');

const BORRAR = process.argv.includes('--borrar');
const telefono = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

if (!telefono) {
  console.error('Uso: node scripts/resetear-lead.js <telefono> [--borrar]');
  console.error('Ejemplo: node scripts/resetear-lead.js +573001234567');
  process.exit(1);
}

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env:');
  console.error("  export \$(grep -v '^#' .env | xargs) && node scripts/resetear-lead.js ...");
  process.exit(1);
}

function consultar(sql) {
  const cuerpo = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        const texto = Buffer.concat(t).toString('utf8');
        if (res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}: ${texto.slice(0, 300)}`));
        try { resolve(JSON.parse(texto)); } catch { resolve(texto); }
      });
    });
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });
}

(async () => {
  const lead = await consultar(
    `select id, nombre, estado from leads where telefono = '${telefono}'`
  );
  const leadId = lead[0]?.id ?? null;

  if (!leadId) {
    console.log(c.ama(`No hay ningún lead con el teléfono ${telefono}.`));
  } else {
    console.log(c.neg(`Lead: ${lead[0].nombre || '(sin nombre)'} · estado ${lead[0].estado} · id ${leadId}`));
  }

  // leadId puede ser null (lead ya borrado o inexistente): las columnas uuid
  // no aceptan la cadena "null", así que esa mitad se apaga con `and false`
  // en vez de comparar contra un uuid inventado.
  const filtroLead = leadId ? `lead_id = '${leadId}'` : 'false';
  const conteos = await consultar(`
    select
      (select count(*) from envios_medios where ${filtroLead}) as envios_medios,
      (select count(*) from cotizaciones_aforos where ${filtroLead}) as cotizaciones_aforos,
      (select count(*) from agenda_reservas where ${filtroLead}) as agenda_reservas,
      (select count(*) from citas where telefono = '${telefono}' or ${filtroLead}) as citas,
      (select count(*) from n8n_chat_histories where session_id = '${telefono}') as n8n_chat_histories,
      (select count(*) from mensajes_fragmentos where telefono = '${telefono}') as mensajes_fragmentos
  `);
  const n = conteos[0] || {};
  console.log(`  envios_medios:        ${n.envios_medios ?? 0}`);
  console.log(`  cotizaciones_aforos:  ${n.cotizaciones_aforos ?? 0}`);
  console.log(`  agenda_reservas:      ${n.agenda_reservas ?? 0}`);
  console.log(`  citas:                ${n.citas ?? 0}`);
  console.log(`  n8n_chat_histories:   ${n.n8n_chat_histories ?? 0}`);
  console.log(`  mensajes_fragmentos:  ${n.mensajes_fragmentos ?? 0}`);

  const eventos = await consultar(`
    select google_event_id from agenda_reservas where ${filtroLead} and google_event_id is not null
    union all
    select google_event_id from citas where (telefono = '${telefono}' or ${filtroLead}) and google_event_id is not null
  `);
  if (eventos.length > 0) {
    console.log(c.rojo(`\n  ⚠ Hay ${eventos.length} evento(s) en Google Calendar que este script NO puede borrar:`));
    eventos.forEach(e => console.log(c.rojo(`    - ${e.google_event_id}`)));
    console.log(c.rojo('    Bórralos a mano, o con scripts/vaciar-calendario.js desde donde sí esté la credencial.'));
  }

  if (!BORRAR) {
    console.log(c.ama('\nNada se borró. Corre con --borrar para resetear de verdad.'));
    return;
  }

  await consultar(`
    delete from agenda_reservas where ${filtroLead};
    delete from citas where telefono = '${telefono}' or ${filtroLead};
    delete from n8n_chat_histories where session_id = '${telefono}';
    delete from mensajes_fragmentos where telefono = '${telefono}';
    delete from leads where telefono = '${telefono}';
  `);

  console.log(c.verde(`\n✓ ${telefono} quedó reseteado. La próxima vez que escriba, el bot lo trata como lead nuevo.`));
})().catch(e => { console.error(c.rojo('FALLO: ' + e.message)); process.exit(1); });
