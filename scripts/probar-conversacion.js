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
// Tres contadores y no uno, porque la pregunta que hay encima de la mesa -- ¿le
// ponemos un reintento al workflow? -- se contesta con el tercero, no con el
// segundo. `mensajes` son los que escribió el cliente; `perdidos`, los que
// volvieron vacíos a la primera; `irrecuperables`, los que seguían vacíos
// después de reenviarlos dos veces. Un reintento en el workflow solo salvaría
// la diferencia entre los dos últimos.
let mensajes = 0, intentos = 0, perdidos = 0, irrecuperables = 0;
let sinPremisa = 0;
const ok = (cond, texto, detalle) => {
  console.log('    ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('        ' + c.gris(String(detalle).slice(0, 300))); }
};

// Lo que el caso necesita para poder medir algo -- que la cotización saliera,
// que el cliente llegara a decir el aforo. Si falla, el caso no se ha probado:
// no es un fallo del agente y no se cuenta como tal, pero tampoco puede pasar
// por verde. Existe porque los turnos vacíos de Gemini caen justo encima de
// esos turnos de montaje, y sin esto el banco reparte culpas al azar.
const premisa = (cond, texto, detalle) => {
  if (cond) { console.log('    ' + c.verde('✓') + ' ' + texto); return true; }
  sinPremisa++;
  console.log('    ' + c.ama('—') + ' ' + texto + c.ama('  → el caso no se pudo montar, no se juzga'));
  if (detalle) console.log('        ' + c.gris(String(detalle).slice(0, 300)));
  return false;
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
    mensajes++;
    for (let intento = 0; intento <= reintentos; intento++) {
      if (intento > 0) {
        // Más de los 8 segundos que espera `Esperar Continuación`, y no por
        // impaciencia: reenviando a los 2,5 s el detector veía dos mensajes
        // seguidos del mismo cliente, los tomaba por una ráfaga y se callaba
        // esperando el resto. Esa respuesta vacía NO era un turno perdido de
        // Gemini —el buffer estaba haciendo su trabajo— pero llegaba aquí igual
        // de vacía y se contaba como tal. Esperando a que la ventana cierre,
        // cada reintento es un turno limpio y lo que se cuenta es lo que es.
        await dormir(9500);
        console.log(`      ${c.cyan('cliente')}  ${c.gris('(lo vuelve a escribir)')} ${texto}`);
      }
      const r = await pedir(this.sesion, texto);
      intentos++;
      const salida = r.salida == null ? '' : String(r.salida);
      const vacio = salida.trim() === '' || salida.trim() === AVISO_TURNO_PERDIDO;
      if (vacio) {
        if (intento === 0) perdidos++;
        console.log(`      ${c.ama('PERDIDO')}  ${c.gris(`(${(r.ms / 1000).toFixed(1)} s)`)}`);
        continue;
      }
      console.log(`      ${c.verde('angie  ')}  ` +
                  c.gris(salida.replace(/\n/g, ' ⏎ ').slice(0, 150)) +
                  c.gris(`  (${(r.ms / 1000).toFixed(1)} s)`));
      this.dicho.push(salida);
      return salida;
    }
    irrecuperables++;
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
      mensajes++; intentos++;
      const s = r.salida == null ? '' : String(r.salida);
      console.log(`      ${c.cyan('cliente')}  ${r.texto}`);
      if (s.trim() === '') { console.log(`      ${c.gris('(callado: espera al resto)')}`); continue; }
      const vacio = s.trim() === AVISO_TURNO_PERDIDO;
      if (vacio) { perdidos++; irrecuperables++; } else this.dicho.push(s);
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

  // Los guiones literales del prompt llevan huecos entre corchetes — [Nombre],
  // [Salón], [número] — que el agente tiene que RELLENAR. El 2026-08-29 se le
  // escapó uno tal cual a un cliente ("...el paquete de 15 años, [Nombre] 🤗"),
  // y es de las cosas que delatan un guion detrás en un solo golpe de vista.
  const huecos = globos.filter(g => /\[[A-Za-zÁÉÍÓÚÑáéíóúñ][^\]]{0,20}\]/.test(g));
  ok(huecos.length === 0, 'no se le escapa ningún hueco del guion sin rellenar',
     huecos.map(g => JSON.stringify(g.slice(0, 110))).join(' | '));

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
// Las dos en LETRAS y en español las escribe `fn_fecha_en_letras`, que es la
// misma que usa la función de disponibilidad para nombrárselas al agente. Con
// un `to_char(..., 'TMMonth')` salía "17 de August" -- el lc_time de la base es
// inglés -- y el caso acababa midiendo si el agente entiende un mes en inglés.
async function hoyBogota() {
  const r = await sql(`select fn_fecha_en_letras((now() at time zone 'America/Bogota')::date - 12) as pasada,
                              fn_fecha_en_letras((now() at time zone 'America/Bogota')::date) as hoy_letras`);
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

  // Lo que decide si le hizo caso NO es que el número aparezca en el texto: los
  // precios viajan en el caption de cada video, y el globo de cierre suele ser
  // "cuéntame cuál te gustó". Lo que hay que mirar es con qué aforo salió la
  // tanda, que es lo que el cliente tiene delante.
  const claves = await sql(`select distinct e.aforo_clave from envios_medios e
                            join leads l on l.id = e.lead_id where l.telefono = '${ch.telefono}'`);
  const lista = claves.map(x => x.aforo_clave).filter(Boolean);
  // Que la tanda no haya salido no siempre es un turno perdido: el agente puede
  // estar pidiendo la fecha antes de cotizar, que es lo que manda el turno 2.
  // En cualquiera de los dos casos no hay tanda que mirar, y lo que sí se puede
  // juzgar -- que se quedó con 150 y no con 100 -- se comprueba igual debajo,
  // contra la ficha.
  if (premisa(lista.length > 0, 'la cotización llegó a salir',
              'no salió ninguna tanda en este chat: o el agente sigue perfilando, o el turno se perdió')) {
    ok(lista.includes('150'), 'y la que salió es la de 150 personas, no la de 100',
       'aforos enviados: ' + lista.join(', '));
  }
  ok(!/\b100 personas\b/.test(r), 'no le sigue cotizando 100 en el texto', r.slice(0, 200));
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

  // ¿Llegaron los tres en el orden en que se enviaron?
  //
  // Cada pedazo es una petición HTTP suelta, y el VPS no garantiza atenderlas
  // en orden: el 2026-08-29 se vio una ráfaga en la que el segundo pedazo tardó
  // DIEZ segundos en registrarse — más que la espera de ocho — y para cuando
  // llegó, los otros dos ya se habían reclamado juntos. Eso no es el detector
  // fallando: es el canal desordenando lo que en WhatsApp llega en orden. Se
  // mira contra `mensajes_fragmentos`, que es donde queda el orden real, y si
  // se desordenó el caso no se juzga en vez de acusar al agente.
  const llegaron = await sql(`select texto from mensajes_fragmentos
                              where telefono = '${ch.telefono}' order by id`);
  const orden = llegaron.map(f => f.texto).filter(t => PEDAZOS.includes(t));
  if (!premisa(JSON.stringify(orden) === JSON.stringify(PEDAZOS),
               'los tres pedazos llegaron al VPS en el orden en que se enviaron',
               'llegaron: ' + JSON.stringify(orden))) {
    revisarNaturalidad(ch, 'caso 6');
    return ch;
  }

  // Lo que NUNCA puede pasar: dos respuestas cruzadas. Ese es el fallo que el
  // buffer existe para evitar y el que vio un cliente real el 2026-08-29.
  const contestaron = rs.filter(r => r.salida);
  ok(contestaron.length <= 1,
     `los 3 pedazos no produjeron más de una respuesta (fueron ${contestaron.length})`,
     JSON.stringify(rs.map(r => ({ m: r.texto, out: String(r.salida || '').slice(0, 60) }))));
  const salida = contestaron.length ? String(contestaron[0].salida) : '';
  if (salida) {
    ok(contestaron[0].texto === PEDAZOS[PEDAZOS.length - 1],
       'y la respuesta salió por el último pedazo, el que trae la frase entera');
    ok(!/no entend|no comprend|puedes repetir|repite/i.test(salida),
       'y entendió la frase entera, no el último pedazo', salida.slice(0, 200));
  }

  // Que CERO respuestas viajen por HTTP no es un fallo del agente: cuando el
  // último pedazo también espera, quien contesta es la ejecución que despierta
  // ocho segundos después, y para entonces la petición del cliente ya se cerró.
  // En WhatsApp eso da igual —la respuesta sale por `Enviar WhatsApp`, no por
  // la respuesta HTTP— pero por el chat de prueba se pierde. Así que lo que se
  // comprueba de verdad es en la base: que los tres pedazos se consumieron
  // JUNTOS, en un solo reclamo. Eso es el reparto, y ahí no hay carrera.
  const frags = await sql(`select texto, consumido_en from mensajes_fragmentos
                           where telefono = '${ch.telefono}' order by id`);
  const mios = frags.filter(f => PEDAZOS.includes(f.texto));
  const momentos = new Set(mios.map(f => f.consumido_en));
  ok(mios.length === PEDAZOS.length && !mios.some(f => f.consumido_en == null) && momentos.size === 1,
     'y en la base los tres se consumieron en UN solo turno, no en tres',
     JSON.stringify(mios));
  revisarNaturalidad(ch, 'caso 6');
  return ch;
});

caso(7, 'Una fecha que ya pasó', async () => {
  const ch = new Chat('c7');
  const { pasada, hoy_letras } = await hoyBogota();
  // "lunes 17 de agosto de 2026" -> "17 de agosto", que es como lo escribe un
  // cliente. El día de la semana y el año los pone la función para el agente,
  // no para esto.
  const corto = (s) => (/\d+ de [a-záéíóúñ]+/i.exec(s) || [s])[0];
  await ch.di('Hola');
  await ch.di('Es un grado para 80 personas');
  await ch.di(`La fecha sería el ${corto(pasada)}`);

  // La fecha se PIDE en el turno 2 pero no se COMPRUEBA hasta el turno 4, que
  // es cuando el cliente elige salón y el agente llama a
  // verificar_disponibilidad_evento. Dándole la fecha y mirando ahí mismo, lo
  // que se veía era la cotización saliendo con normalidad -- correcto, y no lo
  // que este caso quiere medir. Hay que llegar a la elección del salón.
  const r = await ch.di('Me gustó Casa 74');

  // La premisa es que la fecha llegara a anotarse: sin ella el agente no tiene
  // qué comprobar y pedirla es lo correcto, no un fallo.
  const [f] = await sql(`select fn_reserva_ficha('${ch.telefono}') as ficha`);
  const fecha = /FECHA DEL EVENTO: (?!TODAVÍA)/.test((f || {}).ficha || '');
  if (premisa(fecha, 'la fecha del cliente quedó anotada en la ficha',
              ((f || {}).ficha || '').slice(0, 200))) {
    ok(/pas[oó]|ya (fue|quedó atr)|otro (día|mes)|nueva fecha|qu[eé] fecha|de este año|del año que viene/i.test(r),
       'se da cuenta de que esa fecha ya pasó', r.slice(0, 220));
    ok(/\?/.test(r), 'y pregunta por la buena en vez de suponerla', r.slice(0, 220));
  }
  // El fallo del 2026-08-29 -- ofrecerle celebrar HOY -- no depende de la
  // premisa: da igual cómo llegara la conversación, hoy nunca es una fecha que
  // se pueda ofrecer.
  ok(!new RegExp(corto(hoy_letras).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(r),
     'no le ofrece hoy mismo como alternativa', `mencionó "${corto(hoy_letras)}": ` + r.slice(0, 220));
  revisarNaturalidad(ch, 'caso 7');
  return ch;
});

caso(8, 'El envío de material falla: qué le dice al cliente', async () => {
  // ESTE CASO NO MIDE LO QUE PARECÍA. Se escribió como "pedir material que ya
  // recibió", y por este canal eso es imposible de montar: el teléfono del chat
  // de prueba (`test-conv-c8-...`) no es un BSUID válido, así que YCloud
  // rechaza cada video con un 400 y `envios_medios` queda vacío. Nunca hay un
  // "ya recibido" que pedir. Esa parte la cubre `probar-ramas.js`, bloque 6,
  // contra la base y sin canal de por medio.
  //
  // Lo que sí se puede medir aquí, y no se puede medir en ningún otro sitio, es
  // más valioso: qué le dice el agente al cliente CUANDO EL ENVÍO FALLA. Eso
  // pasa en producción de verdad — un video que pesa de más, un corte del
  // proveedor — y el nodo `Resumen` le da una instrucción explícita:
  //
  //     "NO menciones el fallo, ni hables de problemas tecnicos, ni te
  //      disculpes por el material"
  //
  // El 2026-08-29 el agente contestó "Hubo un pequeño error al enviarte los
  // medios. Discúlpame, por favor." — leyó la instrucción y la desobedeció.
  // Para el cliente eso es la empresa avisándole de que algo se rompió.
  const ch = new Chat('c8');
  await ch.di('Hola');
  await ch.di('Quiero cotizar 15 años para 100 personas');
  let piezas = await ch.piezasEnviadas();
  if (piezas === 0) { await ch.di('¿Me pasas la cotización?'); piezas = await ch.piezasEnviadas(); }

  // La premisa al revés que en los demás: aquí el caso vale cuando el envío
  // FALLÓ, que por este canal es siempre. Si algún día entregara de verdad,
  // este caso deja de tener sentido y hay que enterarse.
  if (premisa(piezas === 0, 'el envío de material falló, que es lo que este caso necesita',
              `salieron ${piezas} piezas: el canal ahora sí entrega y este caso ya no mide nada`)) {
    const dicho = ch.dicho.join(' ');
    ok(!/(error|falla|fall[oó]|problema|inconveniente|t[eé]cnico|disc[uú]lpame|disculpa|lo siento|no pude enviar|no se pudieron? enviar)/i.test(dicho),
       'y el agente NO le cuenta el fallo al cliente ni se disculpa por el material',
       dicho.slice(0, 300));
  }
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
  // Nombrar un salón concreto vale, y ofrecer los que hay también: "tenemos 15
  // salones en Cali, ¿para qué evento?" y "pero tenemos otros salones que te
  // podrían interesar" son las dos respuestas buenas -- reconducen sin soltarle
  // el catálogo entero a alguien que todavía no ha dicho qué necesita. Lo que
  // se busca es que después de negar apunte a lo que SÍ hay; exigir una
  // fórmula concreta convierte esto en una prueba del vocabulario del modelo.
  ok(nombra || /(tenemos|manejamos|contamos con|hay)[^.!?]{0,40}(salones|sedes|opciones|espacios)|nuestras sedes|te (los|las) (paso|comparto|muestro)|cu[aá]les/i.test(r),
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
  // Que siga siendo el grado NO se comprueba buscando la palabra en el texto:
  // "¿para qué fecha lo tienes pensado?" es lo que diría una persona, y repetir
  // "el grado" en cada frase es justo lo que suena a máquina. Lo que se mira es
  // la ficha, que es lo que el agente lleva al turno siguiente.
  const [f] = await sql(`select fn_reserva_ficha('${ch.telefono}') as ficha`);
  const ficha = (f || {}).ficha || '';
  if (premisa(/EVENTO: (?!TODAVÍA)/.test(ficha), 'el evento llegó a anotarse en la ficha',
              ficha.slice(0, 200))) {
    ok(/grado/i.test(ficha), 'y sigue siendo el grado: no lo perdió por el desvío',
       ficha.slice(0, 200));
  }
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
  const pct = mensajes ? (perdidos / mensajes * 100).toFixed(0) : '0';
  const salvados = perdidos - irrecuperables;
  console.log(`  ${perdidos} de ${mensajes} mensajes (${pct} %) volvieron vacíos a la primera: ` +
              'Gemini contestó con 0 tokens,\n  la herramienta no corrió y el turno se perdió. ' +
              `${intentos} peticiones en total.`);
  console.log(`  De esos ${perdidos}, el reenvío salvó ${salvados} y ${irrecuperables} siguieron ` +
              'vacíos después de escribir lo mismo tres veces.');
  console.log(c.gris('\n  Ese último número es el que responde a si conviene reintentar dentro del\n' +
                     '  workflow: si el reenvío del cliente no los salva, un reintento automático\n' +
                     '  con el MISMO texto tampoco los va a salvar -- verificado en las ejecuciones\n' +
                     '  4965-4967 y 4977-4979 del VPS, tres intentos idénticos con llm.tokens.out = 0\n' +
                     '  y tool_calls.requested = 0 en los tres. Lo que se pierde es siempre el turno\n' +
                     '  en el que el cliente dice de una vez el evento y el aforo.'));

  if (sinPremisa) {
    console.log('\n' + c.ama(`${sinPremisa} comprobación(es) no se pudieron montar`) +
                c.gris(' — el turno que las preparaba se perdió.\n' +
                       '  No cuentan como fallo del agente, pero tampoco están probadas.'));
  }

  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
