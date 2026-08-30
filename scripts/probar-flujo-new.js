const https = require('https');
const { URL } = require('url');

const BASE = process.env.N8N_VPS_URL;
const WEBHOOK = process.env.N8N_CHAT_TEST_WEBHOOK;
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const SESION = 'test-new-' + Date.now();
const TELEFONO = 'test-' + SESION;

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return r.json();
}

function enviar(msg) {
  const u = new URL(`${BASE}/webhook/${WEBHOOK}/chat`);
  const cuerpo = JSON.stringify({ action: 'sendMessage', sessionId: SESION, chatInput: msg });
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
      timeout: 60000,
    }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        resolve({ msg, output: parsed?.output || parsed?.text || text, ms: Date.now() - t0, raw: text });
      });
    });
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });
}

async function main() {
  console.log(`\n--- Probando sesión: ${SESION} (teléfono: ${TELEFONO}) ---`);

  // Paso 1: Enviar /new
  console.log('\n1. Enviando "/new"...');
  const r1 = await enviar('/new');
  console.log(`  Respuesta (${r1.ms}ms):`, r1.output);

  // Ver memoria en base de datos
  const mem1 = await query(`select * from n8n_chat_histories where session_id = '${TELEFONO}' order by id`);
  console.log(`  Filas en memoria tras /new: ${mem1.length}`);
  mem1.forEach(m => console.log('   -', m.message));

  // Paso 2: Enviar saludo con nombre
  console.log('\n2. Enviando respuesta del cliente: "Hola soy Miguel Diuza, quiero cotizar unos 15 años"...');
  const r2 = await enviar('Hola soy Miguel Diuza, quiero cotizar unos 15 años');
  console.log(`  Respuesta (${r2.ms}ms):`, r2.output);

  // Ver memoria tras respuesta
  const mem2 = await query(`select * from n8n_chat_histories where session_id = '${TELEFONO}' order by id`);
  console.log(`  Filas en memoria tras turno 2: ${mem2.length}`);
  mem2.forEach(m => console.log('   -', m.message));

  // Paso 3: Limpiar prueba
  await query(`
    delete from n8n_chat_histories where session_id = '${TELEFONO}';
    delete from leads where telefono = '${TELEFONO}';
  `);
  console.log('\nLimpieza completada.');
}

main().catch(console.error);
