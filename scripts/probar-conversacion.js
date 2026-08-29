#!/usr/bin/env node
//
// Diez conversaciones contra el n8n de verdad, para cazar lo que un banco de
// SQL no puede: que el agente se repita, se olvide de lo que le acaban de
// decir, o suene a máquina.
//
// La diferencia con `probar-en-vivo.js`: aquel es humo -- comprueba que el
// buffer de fragmentos existe y funciona. Este mira lo que el cliente LEE. Cada
// caso es una conversación entera en su propia sesión, con Gemini de verdad, y
// las comprobaciones son sobre el texto que sale.
//
// Nada de exigir frases exactas: lo escribe un modelo y cambiaría cada corrida.
// Lo que se exige son cosas que un vendedor humano nunca haría -- volver a
// preguntar el nombre que le acaban de dar, contestar dos veces lo mismo palabra
// por palabra, ofrecerle una fecha que ya pasó.
//
// LOS TURNOS VACÍOS. Gemini devuelve finishReason STOP con 0 tokens en
// alrededor de uno de cada cinco turnos de trabajo (el prompt son 11,4k
// tokens): el nodo `Angie Otero` sale con el output vacío -- verificado en la
// ejecución 4935 del VPS -- la herramienta no corre y el turno se pierde. En
// WhatsApp `Dividir Mensajes` lo tapa con "Dame un segundito..."; por el chat
// de prueba, que no pasa por ese nodo, el vacío llega tal cual.
//
// Aquí se hacen dos cosas con eso, y son distintas a propósito:
//
//   - Se CUENTA cada turno perdido, y el total se imprime aparte de los
//     fallos. No es un fallo de este banco: es el dato con el que se decide si
//     el workflow debe reintentar antes de caer al mensaje de espera.
//   - Y se REENVÍA el mensaje, hasta dos veces, que es exactamente lo que hace
//     un cliente al que no le contestan. Sin eso, un turno perdido tumbaba una
//     comprobación de comportamiento que no tenía nada que ver, y el banco
//     acababa midiendo la suerte que tuvo con Gemini.
//
// Uso:  node scripts/probar-conversacion.js
//       node scripts/probar-conversacion.js 3 7    (solo esos casos)
//
// Tarda: son ~45 turnos contra Gemini. Cuenta unos diez minutos.

const https = require('https');
const { URL } = require('url');

// El detector de fragmentos, sacado del nodo `Detectar Fragmento` del workflow.
// Se usa para comprobar la PREMISA del caso 6 -- ver allí por qué importa.
const { detector } = require('./simular-fragmentos.js');

const BASE = process.env.N8N_VPS_URL;
const WEBHOOK = process.env.N8N_CHAT_TEST_WEBHOOK;
if (!BASE || !WEBHOOK) {
  console.error('Faltan N8N_VPS_URL y N8N_CHAT_TEST_WEBHOOK. Cárgalos del .env.');
  process.exit(1);
}
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// El texto exacto con el que `Dividir Mensajes` tapa un turno perdido. Se copia
// de ahí; si alguien lo cambia en el nodo, este contador deja de contar y hay
// que traerlo otra vez.
const AVISO_TURNO_PERDIDO = 'Dame un segundito que confirmo eso y te cuento 🤗';

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
let turnos = 0, perdidos = 0;
const ok = (cond, texto, detalle) => {
  console.log('    ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('        ' + c.gris(String(detalle).slice(0, 300))); }
};

// --------------------------------------------------------------------------
// El canal
// --------------------------------------------------------------------------

function pedir(sesion, texto) {
  const u = new URL(`${BASE}/webhook/${WEBHOOK}/chat`);
  const cuerpo = JSON.stringify({ action: 'sendMessage', sessionId: sesion, chatInput: texto });
  const arranque = Date.now();
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
      timeout: 150000,
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        const d = Buffer.concat(t).toString('utf8');
        let salida = null;
        try { salida = (JSON.parse(d) || {}).output ?? null; } catch { /* sin JSON: sin respuesta */ }
        resolve({ texto, salida, ms: Date.now() - arranque });
      });
    });
    req.on('timeout', () => req.destroy(new Error('se pasó de 150 s')));
    req.on('error', reject);
    req.write(cuerpo); req.end();
  });
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

function sql(texto) {
  if (!REF || !TOKEN) return Promise.resolve([]);
  const cuerpo = JSON.stringify({ query: texto });
  return new Promise((resolve) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => {
        try { const j = JSON.parse(Buffer.concat(t).toString('utf8')); resolve(Array.isArray(j) ? j : []); }
        catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.write(cuerpo); req.end();
  });
}

// --------------------------------------------------------------------------
// Una conversación
// --------------------------------------------------------------------------

class Chat {
  constructor(nombre) {
    this.sesion = `conv-${nombre}-${Date.now()}`;
    this.telefono = 'test-' + this.sesion;   // como lo arma `Normalizar Chat`
    this.dicho = [];   // todo lo que contestó el agente, en orden
  }

  // Un mensaje y su respuesta. Si el turno se pierde lo cuenta y vuelve a
  // escribir, hasta dos veces más -- como haría el cliente. Devuelve '' solo si
  // ni con los reintentos hubo respuesta, y eso sí es un problema de verdad.
  async di(texto, reintentos = 2) {
    console.log(`      ${c.cyan('cliente')}  ${texto}`);
    for (let intento = 0; intento <= reintentos; intento++) {
      if (intento > 0) {
        await dormir(2500);
        console.log(`      ${c.cyan('cliente')}  ${c.gris('(lo vuelve a escribir)')} ${texto}`);
      }
      const r = await pedir(this.sesion, texto);
      turnos++;
      const salida = r.salida == null ? '' : String(r.salida);
      const vacio = salida.trim() === '' || salida.trim() === AVISO_TURNO_PERDIDO;
      if (vacio) {
        perdidos++;
        console.log(`      ${c.ama('PERDIDO')}  ${c.gris(`(${(r.ms / 1000).toFixed(1)} s)`)}`);
        continue;
      }
      console.log(`      ${c.verde('angie  ')}  ` +
                  c.gris(salida.replace(/\n/g, ' ⏎ ').slice(0, 150)) +
                  c.gris(`  (${(r.ms / 1000).toFixed(1)} s)`));
      this.dicho.push(salida);
      return salida;
    }
    return '';
  }

  // Un mensaje partido en pedazos, como lo manda alguien escribiendo rápido.
  // Devuelve las respuestas de TODOS los pedazos, para poder contar cuántas
  // hubo -- que es justo lo que se comprueba.
  async diEnPedazos(pedazos, pausaMs = 1300) {
    const vuelos = [];
    for (const p of pedazos) { vuelos.push(pedir(this.sesion, p)); await dormir(pausaMs); }
    const rs = await Promise.all(vuelos);
    for (const r of rs) {
      turnos++;
      const s = r.salida == null ? '' : String(r.salida);
      console.log(`      ${c.cyan('cliente')}  ${r.texto}`);
      if (s.trim() === '') { console.log(`      ${c.gris('(callado: espera al resto)')}`); continue; }
      const vacio = s.trim() === AVISO_TURNO_PERDIDO;
      if (vacio) perdidos++; else this.dicho.push(s);
      console.log(`      ${vacio ? c.ama('PERDIDO') : c.verde('angie  ')}  ` + c.gris(s.replace(/\n/g, ' ⏎ ').slice(0, 150)));
    }
    return rs;
  }

  async limpiar() {
    const t = `'${this.telefono}'`;
    await sql(`delete from mensajes_fragmentos where telefono = ${t};
               delete from n8n_chat_histories where session_id = ${t};
               delete from envios_medios where lead_id in (select id from leads where telefono = ${t});
               delete from cotizaciones_aforos where lead_id in (select id from leads where telefono = ${t});
               delete from reservas where lead_id in (select id from leads where telefono = ${t});
               delete from citas where telefono = ${t};
               delete from agenda_reservas where lead_id in (select id from leads where telefono = ${t});
               delete from leads where telefono = ${t};`);
  }

  piezasEnviadas() {
    return sql(`select count(*)::int as n from envios_medios e join leads l on l.id = e.lead_id
                where l.telefono = '${this.telefono}'`).then(r => (r[0] || {}).n ?? 0);
  }
}

// --------------------------------------------------------------------------
// Medidas sobre el texto
// --------------------------------------------------------------------------

// Sin emojis, sin tildes, sin puntuación y sin espacios de más: dos respuestas
// que solo se distinguen por un emoji son la misma respuesta.
const pelar = (s) => String(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N} ]/gu, ' ')
  .replace(/\s+/g, ' ').trim();

// Cuánto se parecen dos respuestas, por palabras. Jaccard y no una distancia de
// edición: lo que delata al agente repitiéndose es que dice LO MISMO, aunque
// mueva las frases de sitio.
function parecido(a, b) {
  const A = new Set(pelar(a).split(' ').filter(w => w.length > 3));
  const B = new Set(pelar(b).split(' ').filter(w => w.length > 3));
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / (A.size + B.size - comunes);
}

// Las cosas que ningún mensaje de WhatsApp de una vendedora debería tener.
// Se mira sobre TODO lo que dijo el agente en la conversación.
function revisarNaturalidad(chat, nombreCaso) {
  const globos = chat.dicho.flatMap(t => t.split(/\s*\|\|\|\s*/)).map(g => g.trim()).filter(Boolean);

  const largos = globos.filter(g => g.length > 600);
  ok(largos.length === 0, 'ningún globo pasa de 600 caracteres (WhatsApp le pone "Leer más")',
     largos.map(g => g.length + ': ' + g.slice(0, 80)).join(' | '));

  const markdown = globos.filter(g => /\*\*|^#{1,6}\s|^\s*[-*]\s/m.test(g));
  ok(markdown.length === 0, 'sin Markdown, que WhatsApp no interpreta',
     markdown.map(g => JSON.stringify(g.slice(0, 60))).join(' | '));

  const robot = globos.filter(g =>
    /(como (asistente|modelo|ia|inteligencia artificial))|(soy una? (ia|bot|inteligencia))|lo siento, no puedo|no tengo acceso a|error|undefined|null|\[object/i.test(g));
  ok(robot.length === 0, 'no habla como un bot ni deja escapar nada técnico',
     robot.map(g => JSON.stringify(g.slice(0, 90))).join(' | '));

  // Dos globos idénticos en la misma conversación: eso es repetirse, sin más.
  const vistos = new Map();
  const repes = [];
  for (const g of globos) {
    const k = pelar(g);
    if (k.length < 25) continue;      // "vale", "perfecto" se pueden repetir
    if (vistos.has(k)) repes.push(g); else vistos.set(k, true);
  }
  ok(repes.length === 0, 'no repite un globo palabra por palabra',
     repes.map(g => JSON.stringify(g.slice(0, 90))).join(' | '));
}

// --------------------------------------------------------------------------
// Los casos
// --------------------------------------------------------------------------

// La fecha de hoy en Bogotá, para armar la que "ya pasó" sin escribirla a mano
// -- una fecha fija en una prueba de fechas caduca sola.
async function hoyBogota() {
  const r = await sql("select (now() at time zone 'America/Bogota')::date::text as hoy, " +
                      "to_char((now() at time zone 'America/Bogota')::date - 12, 'FMDD \"de\" TMMonth') as pasada, " +
                      "to_char((now() at time zone 'America/Bogota')::date, 'FMDD \"de\" TMMonth') as hoy_letras");
  return r[0] || {};
}

const CASOS = [];
const caso = (n, titulo, fn) => CASOS.push({ n, titulo, fn });

// --------------------------------------------------------------------------
caso(1, 'Preguntar lo mismo dos veces seguidas', async () => {
  const ch = new Chat('c1');
  await ch.di('Hola');
  const a = await ch.di('¿Qué incluye el paquete de 15 años?');
  const b = await ch.di('¿Qué incluye el paquete de 15 años?');

  ok(b !== '', 'contestó la segunda vez');
  ok(pelar(a) !== pelar(b), 'no contesta idéntico a la segunda',
     'las dos respuestas son la misma: ' + b.slice(0, 140));
  ok(parecido(a, b) < 0.75, 'ni casi idéntico: la reformula o se refiere a lo de arriba',
     `parecido ${(parecido(a, b) * 100).toFixed(0)}% — ${b.slice(0, 160)}`);
  // Un humano acusa recibo de que se lo acaban de preguntar. No se exige una
  // frase concreta, solo que NO arranque como si fuera la primera vez.
  ok(!/^\s*(hola|buenas)/i.test(b), 'no vuelve a saludar como si fuera el primer mensaje', b.slice(0, 120));
  revisarNaturalidad(ch, 'caso 1');
  return ch;
});

caso(2, 'Da el nombre y más tarde se lo vuelven a pedir', async () => {
  const ch = new Chat('c2');
  await ch.di('Hola, soy Miguel');
  await ch.di('Quiero cotizar unos 15 años');
  await ch.di('Somos 120 personas');
  const r = await ch.di('¿Con quién estoy hablando?');

  const todo = ch.dicho.join('\n');
  ok(/miguel/i.test(todo), 'usa el nombre que le dieron', todo.slice(0, 200));
  const vuelveAPedir = ch.dicho.slice(1).filter(t =>
    /(c[oó]mo te llamas|cu[aá]l es tu nombre|me (regalas|das|compartes) tu nombre|con qui[eé]n tengo el gusto)/i.test(t));
  ok(vuelveAPedir.length === 0, 'no le vuelve a pedir el nombre',
     vuelveAPedir.map(t => t.slice(0, 120)).join(' | '));
  ok(r !== '', 'y contesta a quién tiene delante');
  revisarNaturalidad(ch, 'caso 2');
  return ch;
});

caso(3, 'Da el aforo y se lo vuelven a preguntar', async () => {
  const ch = new Chat('c3');
  await ch.di('Hola');
  await ch.di('Es un matrimonio para 120 personas');
  await ch.di('¿Qué fechas tienen libres para diciembre?');

  const despues = ch.dicho.slice(1).join('\n');
  const vuelveAPedir = /(cu[aá]nt[oa]s (personas|invitados)|n[uú]mero de (invitados|personas)|para cu[aá]nta gente)/i.test(despues);
  ok(!vuelveAPedir, 'no vuelve a preguntar para cuántas personas', despues.slice(0, 200));
  revisarNaturalidad(ch, 'caso 3');
  return ch;
});

caso(4, 'Cambia de opinión a mitad: 100 → 150', async () => {
  const ch = new Chat('c4');
  await ch.di('Hola');
  await ch.di('Quiero cotizar un cumpleaños para 100 personas');
  const r = await ch.di('Espera, mejor que sean 150');

  ok(/150/.test(r) || /150/.test(ch.dicho.slice(-2).join(' ')),
     'la respuesta habla de 150, no sigue en 100', r.slice(0, 200));
  ok(!/\b100 personas\b/.test(r), 'y no le sigue cotizando 100', r.slice(0, 200));
  const filas = await sql(`select num_invitados from reservas r join leads l on l.id = r.lead_id
                           where l.telefono = '${ch.telefono}' and r.estado = 'abierta'`);
  ok(filas.length === 0 || filas[0].num_invitados === 150,
     'y la ficha del cliente queda en 150', JSON.stringify(filas));
  revisarNaturalidad(ch, 'caso 4');
  return ch;
});

caso(5, 'Dos eventos en el mismo chat: 15 años y luego un matrimonio', async () => {
  const ch = new Chat('c5');
  await ch.di('Hola');
  await ch.di('Necesito cotizar los 15 años de mi hija, para 120 personas');
  const r = await ch.di('Y aparte, el matrimonio de mi hermano para 200 personas');

  ok(/matrimonio|boda/i.test(r), 'reconoce que ahora se habla del matrimonio', r.slice(0, 200));
  ok(!/15 a[ñn]os/i.test(r) || /matrimonio|boda/i.test(r),
     'no confunde el segundo evento con el primero', r.slice(0, 200));

  // Un turno más antes de mirar la ficha. Anunciar el segundo evento no obliga
  // al agente a anotarlo en ese mismo turno -- suele contestar y preguntar por
  // dónde empezar -- y exigírselo ahí sería medir con qué rapidez llama a la
  // herramienta, no si sabe llevar dos eventos. Con la respuesta del cliente ya
  // no hay excusa.
  await ch.di('Empecemos por el matrimonio de mi hermano');

  const filas = await sql(`select count(*)::int as n from reservas r join leads l on l.id = r.lead_id
                           where l.telefono = '${ch.telefono}'`);
  ok((filas[0] || {}).n >= 2, 'queda una reserva por cada evento, no una pisando a la otra',
     JSON.stringify(filas));

  // Y lo que de verdad le llega al agente en el turno siguiente: la ficha, que
  // es lo único que le impide olvidarse del evento que quedó a medias.
  const [f] = await sql(`select fn_reserva_ficha('${ch.telefono}') as ficha`);
  const ficha = (f || {}).ficha || '';
  ok(/matrimonio/i.test(ficha) && /200/.test(ficha),
     'la ficha abierta es la del matrimonio, para 200', ficha.slice(0, 300));
  ok(/15 a[ñn]os/i.test(ficha),
     'y los 15 años no se pierden: siguen en la ficha como cotización a medias', ficha.slice(0, 300));
  revisarNaturalidad(ch, 'caso 5');
  return ch;
});

caso(6, 'Mensaje partido en pedazos: una sola respuesta', async () => {
  const ch = new Chat('c6');
  await ch.di('Hola');

  // El primer pedazo TIENE que ser uno de los que el detector reconoce como
  // frase abierta ("Quiero" a secas), y no una que ya cierra ("Quiero
  // cotizar"). No es una comodidad de la prueba: la regla es asimétrica a
  // propósito -- el primer mensaje solo espera si es gramaticalmente imposible
  // que la frase termine ahí, porque en este embudo la mayoría de los turnos
  // son cortos y completos ("sí", "Miguel", "150") y hacerlos esperar mete
  // ocho segundos a casi toda la conversación.
  //
  // Por eso la premisa se comprueba con el MISMO detector del nodo, aquí
  // arriba: si un día deja de esperar, lo que hay que ver en rojo es esta
  // línea -- "esta ráfaga ya no es de las que el detector caza" -- y no la
  // respuesta del agente. Bajarle la vara al primer mensaje para que este caso
  // pase es exactamente lo que no se puede hacer.
  const PEDAZOS = ['Quiero', 'cotizar un matrimonio', 'para 150 personas'];
  const veredicto = detector.esFragmento(PEDAZOS[0], 1);
  ok(veredicto.esperar,
     `"${PEDAZOS[0]}" es una frase abierta: el detector la hace esperar (${veredicto.motivo})`,
     'si esto está en rojo, la ráfaga de abajo no prueba lo que dice probar');

  const rs = await ch.diEnPedazos(PEDAZOS);

  const contestaron = rs.filter(r => r.salida);
  ok(contestaron.length === 1, `de los 3 pedazos contestó UNO (contestaron ${contestaron.length})`,
     JSON.stringify(rs.map(r => ({ m: r.texto, out: String(r.salida || '').slice(0, 60) }))));
  ok(contestaron.length === 1 && contestaron[0].texto === PEDAZOS[PEDAZOS.length - 1],
     'y contestó el último, que es el que trae la frase entera');
  const salida = contestaron.length === 1 ? String(contestaron[0].salida) : '';
  ok(!/no entend|no comprend|puedes repetir|repite/i.test(salida),
     'y entendió la frase entera, no el último pedazo', salida.slice(0, 200));
  revisarNaturalidad(ch, 'caso 6');
  return ch;
});

caso(7, 'Una fecha que ya pasó', async () => {
  const ch = new Chat('c7');
  const { pasada, hoy_letras } = await hoyBogota();
  await ch.di('Hola');
  await ch.di('Es un grado para 80 personas');
  const r = await ch.di(`La fecha sería el ${pasada}`);

  ok(/pas[oó]|ya (fue|quedó atr)|otro (día|mes)|nueva fecha|qu[eé] fecha/i.test(r),
     'se da cuenta de que esa fecha ya pasó', r.slice(0, 220));
  ok(/\?/.test(r), 'y pregunta por la buena en vez de suponerla', r.slice(0, 220));
  // El fallo del 2026-08-29: ofrecerle celebrar HOY.
  ok(!new RegExp(hoy_letras.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(r),
     'no le ofrece hoy mismo como alternativa', `mencionó "${hoy_letras}": ` + r.slice(0, 220));
  revisarNaturalidad(ch, 'caso 7');
  return ch;
});

caso(8, 'Pedir material que ya recibió', async () => {
  const ch = new Chat('c8');
  await ch.di('Hola');
  await ch.di('Quiero cotizar 15 años para 100 personas');
  const antes = await ch.piezasEnviadas();
  const r = await ch.di('¿Me mandas los videos de los salones?');
  const despues = await ch.piezasEnviadas();

  ok(antes > 0, `la primera cotización sí mandó material (${antes} piezas)`);
  ok(despues === antes,
     'no se los reenvía a ciegas: los mismos videos no salen dos veces',
     `antes ${antes}, después ${despues}`);
  ok(/arriba|ya te (los|las) (envi|mand)|ya (los|las) tienes|te (los|las) reenv|quieres que (te )?(los|las) (vuelva|reenv)/i.test(r),
     'y le dice dónde están, u ofrece reenviárselos', r.slice(0, 240));
  revisarNaturalidad(ch, 'caso 8');
  return ch;
});

caso(9, 'Preguntar por un salón que no existe', async () => {
  const ch = new Chat('c9');
  await ch.di('Hola');
  const r = await ch.di('¿Tienen disponible el Salón Los Pinos del Norte?');

  ok(r !== '', 'contestó');
  ok(!/(el|los) (sal[oó]n|pinos)[^.!?]*\b(disponible|libre|s[ií] (lo )?tenemos)/i.test(r) ||
     /no (lo )?(tenemos|manejamos|contamos)|no (aparece|figura|existe)/i.test(r),
     'no se inventa que ese salón es suyo', r.slice(0, 240));
  const nombres = await sql('select nombre_sede from sedes');
  const nombra = nombres.some(s => r.toLowerCase().includes(String(s.nombre_sede).toLowerCase().slice(0, 8)));
  ok(nombra || /cu[aá]les|los que (tenemos|manejamos)|nuestras sedes|te (los|las) (paso|comparto)/i.test(r),
     'y reconduce hacia los salones que sí existen', r.slice(0, 240));
  revisarNaturalidad(ch, 'caso 9');
  return ch;
});

caso(10, 'Salirse del tema y volver', async () => {
  const ch = new Chat('c10');
  await ch.di('Hola');
  await ch.di('Quiero cotizar un grado para 80 personas');
  await ch.di('Oye, una curiosidad: ¿tú eres una persona o un robot?');
  const r = await ch.di('Bueno, volvamos a lo del grado');

  ok(r !== '', 'retoma la conversación');
  ok(!/(qu[eé] (tipo de )?evento|para cu[aá]nt[oa]s|cu[aá]ntas personas)/i.test(r),
     'y retoma sin volver a preguntar el evento ni el aforo: ya se los dijo', r.slice(0, 240));
  ok(/grado/i.test(ch.dicho.slice(-2).join(' ')), 'y sigue siendo el grado del que hablaban',
     ch.dicho.slice(-1)[0].slice(0, 200));
  revisarNaturalidad(ch, 'caso 10');
  return ch;
});

// --------------------------------------------------------------------------
async function main() {
  const pedidos = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
  const lista = pedidos.length ? CASOS.filter(c => pedidos.includes(c.n)) : CASOS;

  console.log(c.gris(`\n  ${BASE} · ${lista.length} conversación(es)\n`));

  for (const { n, titulo, fn } of lista) {
    console.log('\n' + c.neg(`${n}. ${titulo}`));
    let ch = null;
    try {
      ch = await fn();
    } catch (e) {
      ok(false, `el caso ${n} se cayó`, e.message);
    } finally {
      if (ch) await ch.limpiar();
    }
  }

  // Por si algún caso se cayó antes de poder limpiar lo suyo.
  await sql(`delete from mensajes_fragmentos where telefono like 'test-conv-%';
             delete from n8n_chat_histories where session_id like 'test-conv-%';
             delete from envios_medios where lead_id in (select id from leads where telefono like 'test-conv-%');
             delete from cotizaciones_aforos where lead_id in (select id from leads where telefono like 'test-conv-%');
             delete from reservas where lead_id in (select id from leads where telefono like 'test-conv-%');
             delete from citas where telefono like 'test-conv-%';
             delete from agenda_reservas where lead_id in (select id from leads where telefono like 'test-conv-%');
             delete from leads where telefono like 'test-conv-%';`);

  console.log('\n' + c.neg('Turnos perdidos'));
  const pct = turnos ? (perdidos / turnos * 100).toFixed(0) : '0';
  console.log(`  ${perdidos} de ${turnos} turnos (${pct} %) volvieron vacíos: Gemini contestó ` +
              'con 0 tokens, la herramienta no corrió y el turno se perdió.');
  console.log(c.gris('  Aquí los tapa un reenvío -- como haría el cliente. En WhatsApp los tapa\n' +
                     '  "Dame un segundito", que no reintenta nada. No es un fallo de este banco:\n' +
                     '  es el dato con el que se decide si el workflow debe reintentar solo.'));

  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
