#!/usr/bin/env node
const REF = process.env.SUPABASE_PROJECT_REF;
const TOK = process.env.SUPABASE_ACCESS_TOKEN;

async function run() {
  const tel = process.argv[2] || '573109998877';
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOK}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `select id, message from n8n_chat_histories where session_id = '${tel}' order by id asc`
    })
  });
  const rows = await r.json();
  console.log(`Mensajes encontrados para ${tel}: ${rows.length}`);
  for (const row of rows) {
    const m = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
    console.log(`\n[${m.type}] (id: ${row.id})`);
    console.log(m.content);
  }
}
run();
