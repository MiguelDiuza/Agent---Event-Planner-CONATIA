#!/usr/bin/env node
//
// Los mensajes que llegan por partes.
//
// Dos mitades, y las dos corren código real:
//
//   - El DETECTOR (`Detectar Fragmento`) se lee del .json y se corre sin base
//     ni red. Aquí vive la invariante que importa: **ningún primer mensaje de
//     una conversación normal espera**. Si alguien afloja el detector para
//     cazar un caso más, este bloque le dice enseguida a cuántos clientes les
//     acaba de meter ocho segundos de retraso.
//
//   - El REPARTO (`Registrar Fragmento` + `Reclamar Fragmentos`) se corre
//     contra la base REAL, con las queries sacadas de los nodos, simulando el
//     orden en que n8n dispara y despierta las ejecuciones. Lo que se comprueba
//     es que de una ráfaga de cuatro mensajes salga UNA sola respuesta, con los
//     cuatro pedazos dentro y en orden.
//
// Limpia sus propias filas al terminar.
//
// Uso:  node scripts/probar-fragmentos.js

const https = require('https');
const fs = require('fs');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

const TELEFONO = '+57000PRUEBA-FRAGMENTOS';
const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};
const titulo = (t) => console.log('\n' + c.neg(t));

// --------------------------------------------------------------------------
// Base
// --------------------------------------------------------------------------
// La Management API de Supabase corta conexiones de vez en cuando (ECONNRESET,
// ENOTFOUND, timeouts). El 2026-08-29 tumbó tres corridas de este banco a
// mitad, y un banco que falla al azar es un banco que se deja de mirar: el
// siguiente fallo de verdad se lee como "otra vez la red". Dos reintentos con
// un respiro corto hacen que un fallo signifique algo.
async function consulta(sqlTexto) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await consultaUnaVez(sqlTexto);
    } catch (e) {
      // Un error de SQL no se reintenta: la query está mal y va a estarlo
      // igual la segunda vez. Solo se reintenta lo que huele a red.
      if (!/ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout/i.test(e.message)) throw e;
      ultimo = e;
      await new Promise(r => setTimeout(r, 800 * intento));
    }
  }
  throw ultimo;
}

function consultaUnaVez(sqlTexto) {
  const cuerpo = JSON.stringify({ query: sqlTexto });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.supabase.com', path: `/v1/projects/${REF}/database/query`, method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(cuerpo) },
    }, res => {
      const trozos = [];
      res.on('data', x => trozos.push(x));
      res.on('end', () => {
        const d = Buffer.concat(trozos).toString('utf8');
        let j; try { j = JSON.parse(d); } catch { return reject(new Error(d.slice(0, 400))); }
        if (!Array.isArray(j)) return reject(new Error(JSON.stringify(j).slice(0, 400)));
        resolve(j);
      });
    });
    req.on('error', reject);
    req.write(cuerpo); req.end();
  });
}

// --------------------------------------------------------------------------
// El código real de los nodos
// --------------------------------------------------------------------------
// El reparto vive en `simular-fragmentos.js` porque `banco-pruebas.js` corre
// exactamente el mismo dentro de una conversación completa. Dos copias se
// separan, y el día que se separen una de las dos pruebas mentiría.
const sim = require('./simular-fragmentos.js');
const detector = sim.detector;

const registrar = (texto) => consulta(sim.ligar(sim.SQL_REGISTRAR, [TELEFONO, texto, null])).then(r => r[0]);
const reclamar = (id) => consulta(sim.ligar(sim.SQL_RECLAMAR, [TELEFONO, id]));
const correrConversacion = (mensajes) => sim.repartir(consulta, TELEFONO, mensajes);
const pendientes = () => sim.pendientes(consulta, TELEFONO);

// --------------------------------------------------------------------------
async function main() {
  await consulta(`delete from mensajes_fragmentos where telefono = '${TELEFONO}'`);

  // ------------------------------------------------------------------------
  titulo('0. `pendientes` cuenta bien, incluido el mensaje que acaba de entrar');
  // Esta prueba nace de un fallo que estuvo dos días en producción sin que nada
  // lo dijera, con todo este archivo en verde.
  //
  // `Registrar Fragmento` inserta la fila y en la MISMA sentencia cuenta los
  // pendientes con un sub-select. En Postgres eso no funciona: lo que inserta
  // una CTE no lo ve el resto del statement, que corre sobre el snapshot
  // anterior. Así que `pendientes` llegaba siempre uno corto.
  //
  // Y era invisible desde aquí porque el resto de los bloques le pasan el
  // número al detector A MANO (`esFragmento(t, 1)`, `esFragmento(t, 4)`), con
  // el valor que uno cree que la base va a mandar. La prueba comprobaba la
  // creencia, no la base. Por eso este bloque no llama al detector: compara la
  // salida real de la query real contra un `count(*)` aparte.
  {
    await consulta(`delete from mensajes_fragmentos where telefono = '${TELEFONO}'`);

    const uno = await registrar('primero');
    ok(Number(uno.pendientes) === 1,
       'el primer mensaje de una ráfaga llega al detector como pendientes = 1',
       `llegó ${uno.pendientes} — si es 0, el sub-select no está viendo su propia fila`);

    const dos = await registrar('segundo');
    ok(Number(dos.pendientes) === 2,
       'el segundo, con uno ya esperando, llega como pendientes = 2',
       `llegó ${dos.pendientes} — con 1, la rama "la ráfaga ya venía" no se activa`);

    // El número que ve el detector tiene que ser el que hay en la tabla, sin
    // interpretación de por medio.
    const real = await pendientes();
    ok(Number(dos.pendientes) === real,
       'y coincide con lo que de verdad hay sin consumir en la tabla',
       `la query dijo ${dos.pendientes}, la tabla tiene ${real}`);

    // La consecuencia concreta del fallo: con pendientes corto, el SEGUNDO
    // pedazo de una ráfaga se juzgaba con la vara del primero.
    ok(detector.esFragmento('personas', Number(dos.pendientes)).esperar === true,
       'con ese número, el segundo pedazo suelto sí se suma a la ráfaga');

    await consulta(`delete from mensajes_fragmentos where telefono = '${TELEFONO}'`);
  }

  titulo('1. Un primer mensaje normal NUNCA espera');
  // Esta es la regla que no se puede romper: el cliente que escribe completo no
  // puede pagar ni un segundo por el que escribe por pedazos.
  {
    const NORMALES = [
      'Hola', 'Buenas tardes', 'sí', 'si', 'no', 'ok', 'listo', 'Miguel',
      'Miguel Díaz', '150', '150 personas', 'Casa 4', 'el 20 de diciembre',
      '3001234567', 'me gustó Casa Christian\'s', 'y cuánto vale',
      'cuánto cuesta el de 100 personas', '¿tienen Instagram?',
      'Hola, quiero cotizar los 15 de mi hija para 150 personas en diciembre',
      'quiero saber precios', 'matrimonio', 'gracias', 'perfecto, muchas gracias',
      'a qué hora atienden', 'mañana a las 3', 'está muy caro',
    ];
    const esperan = NORMALES.filter(t => detector.esFragmento(t, 1).esperar);
    ok(esperan.length === 0,
       `los ${NORMALES.length} mensajes normales pasan de largo, sin esperar`,
       'estos SÍ esperarían: ' + JSON.stringify(esperan));
  }

  titulo('2. Un mensaje que no puede terminar ahí, sí espera');
  {
    const ABIERTOS = ['quiero', 'que sea', 'necesito', 'me gustaría', 'sería para',
                      'hola quiero cotizar un evento para', 'es para el', 'quiero saber si',
                      'para', 'y también', 'buenas, quería preguntar por...'];
    const pasan = ABIERTOS.filter(t => !detector.esFragmento(t, 1).esperar);
    ok(pasan.length === 0, `los ${ABIERTOS.length} mensajes abiertos esperan al resto`,
       'estos NO esperaron: ' + JSON.stringify(pasan));
  }

  titulo('3. Dentro de una ráfaga ya abierta, la vara baja');
  {
    // "personas" suelto es indistinguible de una respuesta completa: solo el
    // hecho de que ya haya pedazos esperando lo delata.
    ok(detector.esFragmento('personas', 1).esperar === false,
       '"personas" como primer mensaje: no espera');
    ok(detector.esFragmento('personas', 4).esperar === true,
       '"personas" con tres pedazos ya esperando: se les suma');
    ok(detector.esFragmento('y cuánto vale', 1).esperar === false,
       '"y cuánto vale" como primer mensaje: es una pregunta completa, no espera');
    ok(detector.esFragmento('y cuánto vale', 3).esperar === true,
       'el mismo texto dentro de una ráfaga: se les suma');
  }

  // ------------------------------------------------------------------------
  titulo('4. LA RÁFAGA: cuatro mensajes, una sola respuesta');
  // Se reproduce lo que hace n8n: cada mensaje abre su ejecución, registra,
  // decide, y reclama -- de una si va completo, u ocho segundos después si
  // parece un pedazo. Los reclamos se ordenan por el momento en que ocurren.
  {
    const RAFAGA = ['quiero', 'que sea', 'para 150', 'personas'];
    const respuestas = await correrConversacion(RAFAGA);

    ok(respuestas.length === 1, `de los 4 mensajes sale UNA respuesta, no cuatro`,
       JSON.stringify(respuestas));
    ok(respuestas[0] && respuestas[0].texto === 'quiero que sea para 150 personas',
       'y el agente ve el mensaje completo: "quiero que sea para 150 personas"',
       respuestas[0] && respuestas[0].texto);
    ok(respuestas[0] && respuestas[0].fragmentos === 4, 'con los cuatro pedazos dentro');
    ok(await pendientes() === 0, 'y no queda ninguno sin consumir');
  }

  titulo('5. Una conversación normal no se ve afectada');
  {
    const NORMAL = ['Hola', 'Miguel', '150 personas para el 20 de diciembre', 'sí', 'Casa 4'];
    const respuestas = await correrConversacion(NORMAL);
    ok(respuestas.length === 5, 'los 5 mensajes producen 5 respuestas, una por mensaje',
       JSON.stringify(respuestas.map(r => r.texto)));
    ok(respuestas.every((r, i) => r.texto === NORMAL[i]),
       'cada una con su texto tal cual, sin pegarse a la anterior');
    ok(respuestas.every(r => r.espero === false), 'y ninguna esperó nada');
    ok(await pendientes() === 0, 'sin pendientes al terminar');
  }

  titulo('6. Ráfaga y mensaje completo mezclados');
  {
    // El cliente abre con un pedazo y remata con una frase entera: la frase
    // entera NO espera, y se lleva el pedazo de arriba consigo.
    const respuestas = await correrConversacion(['quiero', 'cotizar unos 15 años para 100 personas']);
    ok(respuestas.length === 1, 'sale una sola respuesta', JSON.stringify(respuestas));
    ok(respuestas[0].texto === 'quiero cotizar unos 15 años para 100 personas',
       'con el pedazo suelto pegado adelante', respuestas[0].texto);
    ok(respuestas[0].espero === false,
       'y sin esperar: el segundo mensaje se lee completo, así que contesta de una');
  }

  titulo('7. Reclamar dos veces no repite el mensaje');
  {
    const r = await registrar('mensaje suelto');
    const primera = await reclamar(r.id);
    const segunda = await reclamar(r.id);
    ok(primera.length === 1 && primera[0].texto === 'mensaje suelto', 'el primer reclamo se lo lleva');
    ok(segunda.length === 0, 'el segundo no devuelve nada', JSON.stringify(segunda));
  }

  titulo('8. Un pedazo huérfano no se le pega a un mensaje de tres días después');
  {
    // Si n8n se reinicia mientras una ejecución espera, su fragmento queda
    // pendiente para siempre. La ventana de 5 minutos es lo que impide que
    // reaparezca pegado al siguiente mensaje del cliente.
    await consulta(`insert into mensajes_fragmentos (telefono, texto, recibido_en)
                    values ('${TELEFONO}', 'huerfano de anteayer', now() - interval '2 days')`);
    const r = await registrar('Hola, buenas tardes');
    const salida = await reclamar(r.id);
    ok(salida.length === 1, 'el mensaje nuevo sí se contesta');
    ok(salida[0].texto === 'Hola, buenas tardes', 'y el huérfano no viaja en el texto', salida[0].texto);
    ok(salida[0].descartados === 1, 'pero se marca como consumido, para que no se acumule');
    ok(await pendientes() === 0, 'no queda nada pendiente');
  }

  titulo('9. El chat real del 2026-08-29: "Me gustó" / "El Márquez"');
  {
    // Lo que pasó de verdad. El agente preguntó cuál de los salones le había
    // llamado más la atención y el cliente contestó en dos mensajes, con 1,6 s
    // entre uno y otro. Le llegaron DOS respuestas, cruzadas: la primera
    // contestaba "El Márquez" y la segunda "Me gustó" volviendo a preguntar
    // cuál le había gustado.
    //
    // "gustó" no abría ráfaga, así que el primer mensaje se contestó en 132 ms
    // y cuando entró el segundo ya no había con qué juntarlo.
    ok(detector.esFragmento('Me gustó', 1).esperar === true,
       '"Me gustó" solo no dice qué le gustó: espera al resto');

    const respuestas = await correrConversacion(['Me gustó', 'El Márquez']);
    ok(respuestas.length === 1, 'sale UNA respuesta, no dos',
       JSON.stringify(respuestas.map(r => r.texto)));
    ok(respuestas[0] && respuestas[0].texto === 'Me gustó El Márquez',
       'y el agente ve la frase entera: "Me gustó El Márquez"',
       respuestas[0] && respuestas[0].texto);
    ok(await pendientes() === 0, 'sin pendientes al terminar');
  }

  titulo('10. Lo que cuesta el arreglo de arriba, dicho en voz alta');
  {
    // Ampliar ABREN no es gratis: un cliente que mande uno de estos verbos como
    // turno completo se come los ocho segundos. Están aquí para que el costo se
    // vea y se pueda discutir, no escondido dentro de una lista de cien
    // palabras. Si algún día uno de estos resulta frecuente de verdad, se saca
    // de ABREN -- lo que NO se hace es bajarle la vara al primer mensaje.
    const PAGAN = ['me gustó', 'me encanta', 'prefiero', 'me interesa'];
    const esperan = PAGAN.filter(t => detector.esFragmento(t, 1).esperar);
    ok(esperan.length === PAGAN.length,
       `los ${PAGAN.length} verbos de gustar/elegir esperan 8 s aunque vengan solos`,
       'estos no esperaron: ' + JSON.stringify(PAGAN.filter(t => !esperan.includes(t))));

    // Y la frontera: con su complemento detrás, no esperan nada.
    const COMPLETOS = ['me gustó Casa Christian\'s', 'me gusta el de la 66',
                       'prefiero el Márquez', 'me interesa el paquete de 100'];
    const paganDeMas = COMPLETOS.filter(t => detector.esFragmento(t, 1).esperar);
    ok(paganDeMas.length === 0,
       'pero con el complemento detrás contestan de una, sin esperar',
       'estos sí esperaron: ' + JSON.stringify(paganDeMas));
  }

  await consulta(`delete from mensajes_fragmentos where telefono = '${TELEFONO}'`);
  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
