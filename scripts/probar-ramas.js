#!/usr/bin/env node
//
// Las ramas del turno 3 que las conversaciones del banco NO tocan.
//
// `banco-pruebas.js` corre chats completos y prueba el camino que el cliente
// recorre. Esto prueba lo otro: los bordes donde el turno 3 se decide mal y
// falla en silencio -- un tipo de evento que no resuelve, una tanda sin
// catalogo, una recotizacion, un reenvio. Casi todos terminan en el nodo
// `Diagnostico`, que es el unico texto que lee el agente cuando no sale ni una
// pieza, y por eso cada rama tiene que decir algo distinto.
//
// Las queries se leen de los .json de los workflows, igual que en el banco: si
// alguien toca un nodo y no toca esto, esto corre el nodo nuevo.
//
// Uso:  node scripts/probar-ramas.js     (con el .env cargado)

const https = require('https');
const fs = require('fs');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cargalos del .env.');
  process.exit(1);
}

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

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

// El endpoint no acepta parametros, asi que $1..$n se sustituyen aqui. Es solo
// para la prueba: los nodos si van parametrizados.
function ligar(sqlTexto, params) {
  // Antes de sustituir nada: ¿la query pide exactamente los parametros que le
  // estan pasando? Esta comprobacion existe por el 2026-08-29. El nodo
  // `verificar_disponibilidad_evento` habia pasado de dos parametros a tres y
  // la prueba seguia mandando dos; lo que salia era un `42P02: there is no
  // parameter $3` de Postgres, cincuenta lineas mas abajo, sin decir que nodo
  // ni que prueba. Lo mismo con los aforos, que pasaron de numero a texto y
  // reventaban con un `22P02` igual de mudo.
  //
  // Cuando un nodo cambia de firma, el que se queda atras es este archivo. Que
  // lo diga aqui y con nombre y apellido es la diferencia entre arreglarlo en
  // un minuto y no enterarse.
  const pedidos = new Set((sqlTexto.match(/\$\d+/g) || []).map((s) => Number(s.slice(1))));
  const faltan = [...pedidos].filter((n) => n > params.length).sort((a, b) => a - b);
  if (faltan.length) {
    throw new Error(
      `la query usa ${faltan.map((n) => '$' + n).join(', ')} y solo le pasaste ` +
      `${params.length} parametro(s): el nodo cambio de firma y esta llamada se quedo atras`
    );
  }

  let out = sqlTexto;
  params.forEach((v, i) => {
    const lit = v === null || v === undefined ? 'null'
      : typeof v === 'number' ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
    out = out.split('$' + (i + 1)).join(lit);
  });
  return out;
}

const wf = JSON.parse(fs.readFileSync('n8n/workflow-enviar-medios.json', 'utf8'));
const nodo = (n) => {
  const x = wf.nodes.find(y => y.name === n);
  if (!x) throw new Error('no existe el nodo ' + n);
  return x.parameters.query;
};

const guion = (a) => consulta(ligar(nodo('Guion Cotización'), [
  a.categoria, a.referencia || '', a.telefono, a.tipo_evento || '',
  // String y no Number: el nodo manda `String(...invitados || '')` desde que
  // el parametro admite varios aforos separados por coma.
  a.nombre_cliente || '', a.invitados == null ? '' : String(a.invitados),
  a.reenviar ? 'true' : 'false']));

const medios = (a) => consulta(ligar(nodo('Seleccionar Medios'), [
  a.categoria, a.referencia || '', a.telefono, a.tipo_medio || 'ambos',
  a.invitados == null ? '' : String(a.invitados), a.reenviar ? 'true' : 'false']));

const diagnostico = (a, guionSalio) => consulta(ligar(nodo('Diagnóstico'), [
  a.categoria, a.referencia || '', a.tipo_medio || 'ambos', a.telefono,
  guionSalio ? 'true' : 'false'])).then(r => r[0].resultado);

const TEL = 'test-ramas-' + Date.now();
// Un telefono que no es lead: es como se comporta el turno cuando el numero no
// se puede usar para filtrar lo ya enviado.
const SIN_LEAD = 'test-ramas-sin-lead';
let fallos = 0;
const chequeo = (ok, texto) => { console.log(ok ? '  ' + c.verde('✓') + ' ' + texto
                                              : '  ' + c.rojo('✗') + ' ' + texto); if (!ok) fallos++; };
const titulo = (t) => console.log('\n' + c.neg(t));

async function main() {
  await consulta(ligar(
    `insert into leads (telefono, nombre, estado) values ($1, 'Prueba Ramas', 'nuevo')`, [TEL]));

  try {
    titulo('1. Tanda con un tipo_evento que NO resuelve');
    const g1 = await guion({ categoria: 'sede', referencia: 'todas', telefono: TEL,
                             tipo_evento: 'bautizo de la mascota', invitados: 100 });
    chequeo(g1.length === 0,
      `el guion sale vacio (${g1.length} globos): preferimos no cotizar antes que cotizar el paquete equivocado`);
    const m1 = await medios({ categoria: 'sede', referencia: 'todas', telefono: TEL, invitados: 100 });
    chequeo(m1.length > 0, `los videos salen igual (${m1.length} piezas), y de eso avisa el Resumen`);

    titulo('2. Diagnostico — la cotizacion salio y NO hay material que mandar');
    const d2 = await diagnostico({ categoria: 'sede', referencia: 'todas', telefono: SIN_LEAD }, true);
    chequeo(/ya salió en este turno/i.test(d2) && !/más arriba/i.test(d2),
      'dice que la cotizacion salio, y NO manda a mirar mas arriba: no hay nada arriba');

    titulo('3. Diagnostico — el cliente ya vio los videos y la cotizacion NO salio');
    await consulta(ligar(
      `insert into envios_medios (lead_id, medio_id)
       -- Tres argumentos y el aforo como TEXTO: la firma cambio el 2026-08-28
       -- al admitir varios aforos ("50,100,130"). Con la vieja, esto reventaba
       -- con un 42883 a mitad de la prueba.
       select l.id, f.id from leads l, fn_medios_sedes_cotizacion($1, '100', false) f
       where l.telefono = $1`, [TEL]));
    const d3 = await diagnostico({ categoria: 'sede', referencia: 'todas', telefono: TEL }, false);
    chequeo(/ATENCIÓN: la cotización del paquete NO salió/.test(d3) && /reenviar = true/.test(d3),
      'avisa que la cotizacion no salio y ofrece el reenvio: sin esto el fallo es mudo');

    titulo('4. Diagnostico — LA RECOTIZACION: cotizacion nueva, videos ya vistos');
    const d4 = await diagnostico({ categoria: 'sede', referencia: 'todas', telefono: TEL }, true);
    chequeo(/YA salió en este turno/.test(d4) && /más arriba/.test(d4) && /reenviar = true/.test(d4),
      'prohibe repetir la cotizacion, manda a mirar arriba y ofrece las dos salidas');

    titulo('5. Diagnostico — ni material ni nada visto');
    const d5 = await diagnostico({ categoria: 'sede', referencia: 'todas', telefono: SIN_LEAD }, false);
    chequeo(/NO menciones el asunto/.test(d5), 'manda callar y seguir hacia la cita');

    titulo('6. Diagnostico — una referencia concreta que ese cliente ya recibio');
    const d6 = await diagnostico({ categoria: 'sede', referencia: 'Sawa', telefono: TEL }, false);
    chequeo(/reenviar = true/.test(d6), 'ofrece el reenvio de la pieza suelta');

    titulo('7. Un salon suelto no dispara el guion');
    const g7 = await guion({ categoria: 'sede', referencia: 'Sawa', telefono: TEL,
                             tipo_evento: '15 Años', invitados: 100 });
    chequeo(g7.length === 0, `cero globos (${g7.length}): la tanda es lo unico que cotiza`);

    // El 2026-08-28 esto cambio de sentido y la prueba se quedo con el viejo:
    // decia "el mismo paquete pedido dos veces sale las dos veces". Ya no, y a
    // proposito -- pedir Matrimonio para 50, luego 100 y luego 130 repetia tres
    // veces la misma descripcion del paquete. Nadie lo noto porque este archivo
    // llevaba desde entonces muriendose en el bloque 3, antes de llegar aqui.
    titulo('8. Recotizacion — la descripcion del paquete NO se repite; los precios del aforo nuevo, si');
    const args8 = { categoria: 'sede', referencia: 'todas', telefono: TEL,
                    tipo_evento: '15 Años', invitados: 100, nombre_cliente: 'Ana' };
    const g8a = await guion(args8);
    chequeo(g8a.length === 6,
      `la primera vez salen 6 globos (${g8a.length}): 5 del paquete + 1 de valores`);
    chequeo(/te comparto la cotización del paquete 15 Años/.test(g8a[0].mensaje),
      'la antesala nombra el paquete y no promete videos');
    console.log('    ' + c.gris(g8a[0].mensaje));

    const g8b = await guion(args8);
    chequeo(g8b.length === 0,
      `pedir EXACTAMENTE lo mismo otra vez no saca nada (${g8b.length}): el cliente ya lo tiene en el chat`);

    // Pero otro aforo del MISMO evento si tiene precios nuevos que dar, y esos
    // van solos: sin volver a describir el paquete.
    const g8c = await guion({ ...args8, invitados: 150 });
    chequeo(g8c.length === 1,
      `otro aforo del mismo evento saca 1 globo (${g8c.length}): la tabla de precios, sin repetir la descripcion`);
    chequeo(g8c.length === 1 && /150 personas/.test(g8c[0].mensaje),
      'y es la tabla del aforo nuevo', g8c.length === 1 ? g8c[0].mensaje.slice(0, 70) : '');

    titulo('9. Recotizacion sin cantidad de personas');
    const g9 = await guion({ categoria: 'sede', referencia: 'todas', telefono: TEL, tipo_evento: 'boda' });
    chequeo(g9.length === 5,
      `5 globos (${g9.length}): sale el paquete y no la lista de valores, que sin escalon no se puede armar`);

    titulo('10. Reenvio de la tanda entera con reenviar = true');
    const g10 = await guion({ ...args8, reenviar: true });
    chequeo(g10.length === 5 && /con los videos de cada salón/.test(g10[0].mensaje),
      'vuelve la antesala CON videos y sin lista de valores: los precios viajan en los captions');
    const m10 = await medios({ categoria: 'sede', referencia: 'todas', telefono: TEL,
                               invitados: 100, reenviar: true });
    chequeo(m10.length === m1.length, `vuelven las mismas ${m10.length} piezas`);
  } finally {
    await consulta(ligar(
      `delete from envios_medios where lead_id in (select id from leads where telefono = $1);
       delete from leads where telefono = $1;`, [TEL]));
  }

  console.log('\n' + (fallos ? c.rojo(fallos + ' fallos') : c.verde('sin fallos')));
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error('\n' + c.rojo('FALLO: ') + e.message); process.exit(1); });
