#!/usr/bin/env node
//
// Tres conversaciones hechas para que el agente se equivoque.
//
// Todo lo demás prueba que las piezas funcionan. Esto prueba lo único que le
// importa al cliente: que Angie NO le confirme ni le aparte un sábado que el
// equipo ya vendió. Y no se lo pregunta de buenas maneras -- le insiste, le
// ofrece pagar, le pide varias fechas seguidas y le tiende la trampa de los dos
// Granadas.
//
//   node --env-file=.env scripts/probar-fechas-ocupadas.js
//
// LAS FECHAS SALEN DE LA BASE, NO VAN ESCRITAS AQUÍ. Se leen las que están
// ocupadas de verdad y se comprueba, antes de preguntar, que siguen ocupadas.
// Una prueba con fechas a mano envejece: el día que el equipo libere una, esto
// daría rojo por un dato, no por un fallo -- ya pasó con `Sede Norte
// 2026-12-05` en el banco de pruebas.
//
// QUÉ SE MIRA, ADEMÁS DE LO QUE DICE:
//   - que no haya quedado NADA en `agenda_reservas` a nombre del que preguntó;
//   - que la fila del dueño de verdad siga intacta, con su nombre y su origen;
//   - que ninguna ejecución de n8n se haya caído mientras tanto.
// Lo que contesta se lee; lo que hizo se comprueba.

const https = require('https');
const { URL } = require('url');

const BASE = process.env.N8N_VPS_URL;
const WEBHOOK = process.env.N8N_CHAT_TEST_WEBHOOK;
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const CLAVE_N8N = process.env.N8N_VPS_API_KEY;

for (const [v, n] of [[BASE, 'N8N_VPS_URL'], [WEBHOOK, 'N8N_CHAT_TEST_WEBHOOK'],
                      [REF, 'SUPABASE_PROJECT_REF'], [TOKEN, 'SUPABASE_ACCESS_TOKEN']]) {
  if (!v) { console.error(`Falta ${n}. Corre con node --env-file=.env`); process.exit(1); }
}

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, cian: s => `\x1b[36m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('    ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('        ' + c.gris(String(detalle).slice(0, 400))); }
};

// --------------------------------------------------------------------------
// Hablar
// --------------------------------------------------------------------------
function pedir(op, cuerpo) {
  return new Promise((res, rej) => {
    const rq = https.request(op, r => {
      const t = []; r.on('data', x => t.push(x));
      r.on('end', () => res({ codigo: r.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    rq.on('error', rej); rq.on('timeout', () => rq.destroy(new Error('se pasó de 180 s')));
    if (cuerpo) rq.write(cuerpo); rq.end();
  });
}

async function sql(consulta) {
  const cuerpo = JSON.stringify({ query: consulta });
  const r = await pedir({ host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`,
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(cuerpo) } }, cuerpo);
  if (r.codigo >= 400) throw new Error(`Supabase HTTP ${r.codigo}: ${r.texto.slice(0, 300)}`);
  return JSON.parse(r.texto);
}

function decir(sesion, texto) {
  const u = new URL(`${BASE}/webhook/${WEBHOOK}/chat`);
  const cuerpo = JSON.stringify({ action: 'sendMessage', sessionId: sesion, chatInput: texto });
  const t0 = Date.now();
  return pedir({ host: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
    timeout: 180000 }, cuerpo).then(r => {
      let salida = null;
      try { salida = (JSON.parse(r.texto) || {}).output ?? null; } catch { /* sin respuesta */ }
      return { texto, salida: salida === null ? '' : String(salida), ms: Date.now() - t0 };
    });
}

// --------------------------------------------------------------------------
// Leer lo que contesta
// --------------------------------------------------------------------------
// El modelo no dice siempre lo mismo, así que no se busca una frase: se busca
// lo que significa. Y para "ocupada" no basta con que aparezca la palabra --
// tiene que NO estar diciendo que sí, que es el error que se persigue.
// Las formas de decir "no" que se han visto de verdad en las corridas, no las
// que uno se imagina. La primera versión de esto exigía "ya está tomada" y el
// agente contestó "ya TIENE tomada esa fecha": la prueba dio rojo con el agente
// haciendo lo correcto, que es la peor clase de falso positivo -- el que hace
// que alguien "arregle" lo que funcionaba.
const DICE_OCUPADA = new RegExp([
  'ocupad',
  'no (est[áa]|se encuentra) disponible',
  'ya (est[áa]|fue|la ten[eé]|tiene|tenemos) (tomad|apartad|reservad|vendid|ocupad|comprometid)',
  'no (la )?tenemos disponible',
  'ya no (est[áa]|la tenemos)',
  'no hay disponibilidad',
  'no me aparece disponible',
  'no puedo (dejarte|apartarte|darte) esa fecha',
  'esa fecha (ya )?(no )?(est[áa] )?(tomad|apartad|ocupad)',
].join('|'), 'i');
const DICE_LIBRE = /(s[íi][,\s]+(est[áa]|se encuentra)|(est[áa]|sigue|se encuentra) (libre|disponible)|tenemos disponible|s[íi] hay disponibilidad)/i;

const limpio = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const corto = (s, n = 150) => limpio(s).slice(0, n);

// La fecha como la escribiría el cliente, no como la guarda Postgres. Nadie
// teclea "2026-11-07" por WhatsApp, y el agente tiene que entender la de la
// gente -- que es justo donde se le puede caer.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const enLetras = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};

// --------------------------------------------------------------------------
async function main() {
  console.log(c.gris(`\n  ${BASE}`));
  console.log(c.neg('\nTres conversaciones para intentar que el agente venda dos veces el mismo sábado'));

  const arranque = new Date().toISOString();

  // Las fechas ocupadas de verdad, de la base. Solo sedes PROPIAS: en las
  // aliadas el agente no da disponibilidad por chat -- a propósito -- y
  // preguntar ahí no probaría nada.
  const ocupadas = await sql(`
    select s.nombre_sede, to_char(a.fecha_solicitada,'YYYY-MM-DD') as fecha,
           a.nombre_cliente, a.origen
      from agenda_reservas a join sedes s on s.id_sede = a.sede_id
     where s.es_propia and a.estado in ('separado','bloqueado_temporal')
       and a.fecha_solicitada > (now() at time zone 'America/Bogota')::date + 30
     order by a.fecha_solicitada`);

  const de = (sede, fecha) => ocupadas.find(o => o.nombre_sede === sede && o.fecha === fecha);
  const primeraDe = (sede) => ocupadas.find(o => o.nombre_sede === sede);

  const GOLD = 'Sede Granada Gold';
  const NORTE = 'Sede Norte';
  const goldOcupada = primeraDe(GOLD);
  const norteOcupadas = ocupadas.filter(o => o.nombre_sede === NORTE).slice(0, 3);

  if (!goldOcupada || norteOcupadas.length < 3) {
    console.error(c.rojo('\n  No hay suficientes fechas ocupadas a más de 30 días para montar la prueba.\n'));
    process.exit(1);
  }

  const sesiones = [];
  const nuevaSesion = (n) => { const s = `ocupadas-${n}-${Date.now()}`; sesiones.push('test-' + s); return s; };

  const conversar = async (sesion, turnos) => {
    const dichos = [];
    for (const t of turnos) {
      const r = await decir(sesion, t);
      dichos.push(r);
      console.log('    ' + c.cian('cliente ') + t);
      console.log('    ' + c.gris('angie   ' + (r.salida ? corto(r.salida, 190) : '(callado)')));
    }
    return dichos;
  };

  // ========================================================================
  console.log(c.neg(`\n1. El insistente — ${GOLD}, ${goldOcupada.fecha} (la tiene ${goldOcupada.nombre_cliente})`));
  console.log(c.gris('   Pide una fecha vendida, no acepta el no, y ofrece pagar en el acto.\n'));
  // ========================================================================
  {
    const s = nuevaSesion('insistente');
    const d = await conversar(s, [
      'hola, buenas tardes',
      'soy Camila, es para unos quince años',
      'seriamos 100 personas',
      `la queremos para el ${enLetras(goldOcupada.fecha)}`,
      'me gusto granada gold, esa esta libre para esa fecha?',
    ]);
    const respuesta = d[d.length - 1].salida;
    ok(DICE_OCUPADA.test(respuesta), 'le dice que esa fecha está ocupada', respuesta);
    ok(!DICE_LIBRE.test(respuesta), 'y no le dice a la vez que está libre', respuesta);

    const d2 = await conversar(s, [
      'no importa, apartemela igual que yo pago hoy mismo el separado',
      'Camila Restrepo, mi numero es 3115550001',
    ]);
    const ultima = d2[d2.length - 1].salida;
    ok(!/(qued[óo] apartad|ya (est[áa]|quedó) (apartad|separad|reservad)|apartamos la fecha)/i.test(ultima),
       'y por insistir NO le dice que se la apartó', ultima);
    ok(/(otra fecha|otro sal[óo]n|alternativ|te propongo|puedo ofrecerte|fin de semana)/i.test(ultima + respuesta),
       'le ofrece una salida en vez de dejarlo tirado', ultima);
  }

  // ========================================================================
  console.log(c.neg('\n2. El de los dos Granadas — el caso de la captura del 4 de diciembre'));
  console.log(c.gris('   El 4 de diciembre está vendido en la hoja GRANADA (la que NO manejamos)\n' +
                     '   y libre en GRANADA GOLD. Se comprueba que no se mezclen.\n'));
  // ========================================================================
  {
    const s = nuevaSesion('granadas');
    const d = await conversar(s, [
      'hola',
      'joseph, quiero cotizar una boda',
      '80 invitados',
      'para el 4 de diciembre',
      'esta libre el 4 de diciembre en granada gold?',
    ]);
    const sobreGold = d[d.length - 1].salida;
    const libreEnLaBase = !de(GOLD, '2026-12-04');
    ok(libreEnLaBase, 'el 4 de diciembre sigue libre en el Gold, según la base');
    ok(DICE_LIBRE.test(sobreGold) && !DICE_OCUPADA.test(sobreGold),
       'y el agente lo dice: disponible, sin contradecirse', sobreGold);

    const d2 = await conversar(s, ['y en granada normal? esa cuanto vale']);
    const sobreNormal = d2[0].salida;
    // Lo que NO puede pasar: cotizar, dar disponibilidad o apartar en un salón
    // que no es de la empresa. Que diga que solo maneja el Gold está bien.
    ok(!/\b(granada (normal|premium))\b.{0,60}(disponible|libre|apart)/i.test(sobreNormal),
       'no da disponibilidad de un salón que no es de la empresa', sobreNormal);
    ok(!/(granada (normal|premium)).{0,80}(\$|millones|\d\.\d{3}\.\d{3})/i.test(sobreNormal),
       'ni le pone precio', sobreNormal);
    console.log(c.gris('      (lo que contesta sobre "granada normal" se lee arriba: es criterio suyo)'));
  }

  // ========================================================================
  console.log(c.neg(`\n3. El que va probando fechas — ${NORTE}, tres sábados vendidos seguidos`));
  console.log(c.gris('   ' + norteOcupadas.map(o => `${o.fecha} (${o.nombre_cliente})`).join(' · ') + '\n'));
  // ========================================================================
  {
    const s = nuevaSesion('probador');
    const d = await conversar(s, [
      'buenas',
      'andres, es para un grado',
      'como 90 personas',
      `me sirve el ${enLetras(norteOcupadas[0].fecha)}, en la sede norte esta libre?`,
    ]);
    ok(DICE_OCUPADA.test(d[d.length - 1].salida),
       `${norteOcupadas[0].fecha}: ocupada`, d[d.length - 1].salida);

    const d2 = await conversar(s, [`y el ${enLetras(norteOcupadas[1].fecha)}?`]);
    ok(DICE_OCUPADA.test(d2[0].salida), `${norteOcupadas[1].fecha}: ocupada`, d2[0].salida);

    const d3 = await conversar(s, [`bueno, y el ${enLetras(norteOcupadas[2].fecha)}? esa si o no`]);
    ok(DICE_OCUPADA.test(d3[0].salida), `${norteOcupadas[2].fecha}: ocupada`, d3[0].salida);
    ok(!DICE_LIBRE.test(d3[0].salida), 'y en la tercera seguida no se le escapa un "sí"', d3[0].salida);
    ok(/sede norte|norte/i.test(d3[0].salida + d2[0].salida),
       'sigue hablando de la misma sede, no se le pierde el hilo');
  }

  // ========================================================================
  console.log(c.neg('\nY ahora lo que de verdad importa: qué quedó escrito'));
  // ========================================================================
  const enComillas = sesiones.map(t => `'${t}'`).join(',');
  const rastro = await sql(`
    select s.nombre_sede, to_char(a.fecha_solicitada,'YYYY-MM-DD') as fecha, a.nombre_cliente, a.origen
      from agenda_reservas a
      join sedes s on s.id_sede = a.sede_id
     where a.lead_id in (select id from leads where telefono in (${enComillas}))`);
  ok(rastro.length === 0, 'ninguno de los tres consiguió que le apartaran nada',
     JSON.stringify(rastro));

  const duenos = [goldOcupada, ...norteOcupadas];
  const siguen = await sql(`
    select s.nombre_sede, to_char(a.fecha_solicitada,'YYYY-MM-DD') as fecha, a.nombre_cliente, a.origen
      from agenda_reservas a join sedes s on s.id_sede = a.sede_id
     where (s.nombre_sede, a.fecha_solicitada) in (${duenos.map(o => `('${o.nombre_sede}', date '${o.fecha}')`).join(',')})`);
  for (const d of duenos) {
    const ahora = siguen.find(x => x.nombre_sede === d.nombre_sede && x.fecha === d.fecha);
    ok(!!ahora && ahora.nombre_cliente === d.nombre_cliente && ahora.origen === d.origen,
       `${d.fecha} en ${d.nombre_sede} sigue siendo de ${d.nombre_cliente}`,
       JSON.stringify(ahora));
  }

  // Ninguna ejecución caída mientras hablábamos.
  if (CLAVE_N8N) {
    const r = await fetch(`${BASE}/api/v1/executions?limit=100`, { headers: { 'X-N8N-API-KEY': CLAVE_N8N } });
    const j = await r.json();
    const durante = (j.data || []).filter(e => e.startedAt >= arranque);
    const rotas = durante.filter(e => e.status !== 'success');
    ok(rotas.length === 0, `ninguno de los ${durante.length} nodos/flujos que corrieron se cayó`,
       rotas.map(e => `${e.id} ${e.status}`).join(', '));
  } else {
    console.log(c.gris('    (sin N8N_VPS_API_KEY: no se miran las ejecuciones)'));
  }

  await limpiar(sesiones);
  console.log(fallos === 0
    ? c.verde('\nNo hubo forma de que vendiera dos veces la misma fecha.\n')
    : c.rojo(`\n${fallos} problema(s).\n`));
  process.exitCode = fallos === 0 ? 0 : 1;
}

async function limpiar(sesiones) {
  if (!sesiones.length) return;
  const enComillas = sesiones.map(t => `'${t}'`).join(',');
  await sql(`
    delete from mensajes_fragmentos where telefono in (${enComillas});
    delete from n8n_chat_histories where session_id in (${enComillas});
    delete from envios_medios where lead_id in (select id from leads where telefono in (${enComillas}));
    delete from cotizaciones_aforos where lead_id in (select id from leads where telefono in (${enComillas}));
    delete from reservas where lead_id in (select id from leads where telefono in (${enComillas}));
    delete from citas where telefono in (${enComillas});
    delete from agenda_reservas where lead_id in (select id from leads where telefono in (${enComillas}));
    delete from leads where telefono in (${enComillas});`);
  // Se cuenta lo que QUEDA, no lo que se creyó borrar.
  const resto = await sql(`select count(*)::int as n from leads where telefono in (${enComillas})`);
  console.log(c.gris(`\n  limpieza: quedan ${resto[0].n} lead(s) de prueba`));
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message + '\n')); process.exit(1); });
