#!/usr/bin/env node
//
// Las fechas que no cuadran.
//
// `fn_verificar_disponibilidad_evento` tiene siete ramas y cada una le dicta al
// agente lo que va a decirle al cliente. No es una consulta: es el guion de ese
// turno. Hasta hoy no había nada que las mirara una por una -- el banco de
// conversaciones toca dos de las siete -- y por ahí se coló esto, en un chat
// real del 2026-08-29:
//
//     Cliente: "Para el 20 de agosto"   (hoy es 29 de agosto)
//     Angie:   "esa fecha del jueves 20 de agosto ya pasó ☺️ Pero no te
//               preocupes, para el Salón Marquez De Loyola tenemos
//               disponibilidad para HOY MISMO, sábado 29 de agosto de 2026"
//
// Ofrecerle a alguien celebrar los quince de su hija hoy no es una alternativa.
// Y la función se contradecía sola: si la clienta aceptaba esa fecha y el
// agente volvía a consultar, caía en la rama de "muy próxima", que dice que con
// menos de cinco días NO se puede confirmar nada por chat. Una rama ofrecía lo
// que la otra prohíbe.
//
// La regla que se comprueba aquí, y que antes no comprobaba nadie: NINGUNA rama
// ofrece una fecha a menos de cinco días. Ese es el piso de anticipación del
// negocio, y estaba escrito en una rama sola.
//
// Uso:  node scripts/probar-fechas.js

const https = require('https');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

const SEDE = 'Casa 74';
const ANTICIPACION_MINIMA = 5; // días; el mismo piso que usa la rama "MUY PRÓXIMA"

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};
const titulo = (t) => console.log('\n' + c.neg(t));

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

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const verificar = (sede, fecha) =>
  consulta(`select resultado from fn_verificar_disponibilidad_evento(${lit(sede)}, ${lit(fecha)}::date)`)
    .then(r => (r[0] || {}).resultado || '');

// --------------------------------------------------------------------------
async function main() {
  // Todo lo que sigue se mide contra el hoy de Bogotá, que es el que usa la
  // función. Escribir fechas fijas en una prueba de fechas la deja caducar sola.
  const [{ hoy }] = await consulta(
    "select (now() at time zone 'America/Bogota')::date::text as hoy"
  );
  const dia = (n) => {
    const d = new Date(hoy + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // Los mismos días escritos en letras, por la misma función que los escribe
  // dentro del mensaje. Sirven para buscarlos en el texto sin repetir aquí el
  // formateo -- que es justo lo que se separaría con el tiempo.
  const enLetras = {};
  for (let n = -1; n <= ANTICIPACION_MINIMA + 2; n++) {
    const [{ txt }] = await consulta(`select fn_fecha_en_letras(${lit(dia(n))}::date) as txt`);
    enLetras[n] = txt;
  }

  console.log(c.gris(`  hoy en Bogotá: ${enLetras[0]}`));

  // La comprobación que le da sentido a todo el archivo.
  //
  // Ojo con lo que se busca: el mensaje NOMBRA fechas cercanas de forma
  // legítima -- "el cliente pidió el lunes 31" y "hoy es sábado 29" -- y esas
  // no son ofertas. Se recortan esas tres formas antes de mirar, porque si no
  // la comprobación se dispara siempre y acaba desactivándose, que es peor que
  // no tenerla. Lo que queda del texto sí son fechas que el agente le va a
  // proponer al cliente.
  const noOfreceFechaPegada = (t, dondeDice) => {
    let resto = t;
    for (let n = -1; n <= ANTICIPACION_MINIMA + 2; n++) {
      for (const molde of ['hoy es ', 'dijo el ', 'pidió el ']) {
        resto = resto.split(molde + enLetras[n]).join(molde + '·');
      }
    }
    const pegadas = [];
    for (let n = 0; n < ANTICIPACION_MINIMA; n++) {
      if (resto.includes(enLetras[n])) pegadas.push(enLetras[n]);
    }
    ok(pegadas.length === 0,
       `${dondeDice}: no ofrece ninguna fecha a menos de ${ANTICIPACION_MINIMA} días`,
       'ofreció ' + JSON.stringify(pegadas) + ' — un evento no se monta en ese plazo. ' +
       'Texto: ' + t.slice(0, 260));
  };

  // ------------------------------------------------------------------------
  titulo('1. La fecha que ya pasó');
  {
    const t = await verificar(SEDE, dia(-1));
    ok(/YA PAS[OÓ]/.test(t), 'la reconoce como pasada', t.slice(0, 120));
    ok(t.includes(enLetras[-1]), 'nombra la fecha que dijo el cliente, con su día de la semana');
    ok(/NO la apartes/.test(t), 'le prohíbe apartarla');
    ok(!/se equivoc/i.test(t), 'no la trata como un error del cliente');

    // El fallo del 2026-08-29, exactamente.
    noOfreceFechaPegada(t, 'fecha pasada');

    // Y el otro lado del mismo diseño: no adivina el año que viene. El cliente
    // que dijo "20 de agosto" quería decir el 20 de SEPTIEMBRE, no agosto de
    // 2027. Adivinar es lo que hay que no hacer.
    ok(/pregunt/i.test(t), 'le dice al agente que pregunte por la fecha buena', t.slice(0, 160));
  }

  titulo('2. La fecha a la vuelta de la esquina (menos de 5 días)');
  {
    const t = await verificar(SEDE, dia(2));
    ok(/MUY PRÓXIMA/.test(t), 'la reconoce como demasiado próxima', t.slice(0, 120));
    ok(/NO le confirmes ni le niegues/.test(t), 'no confirma ni niega disponibilidad');
    ok(/llamada|visita|asesor/i.test(t), 'encamina hacia la llamada o la visita');
    noOfreceFechaPegada(t, 'fecha muy próxima');
  }

  titulo('3. La fecha con margen de sobra');
  {
    const t = await verificar(SEDE, dia(90));
    ok(/^DISPONIBLE\./.test(t), 'la confirma como disponible', t.slice(0, 120));
  }

  titulo('4. El año tecleado mal');
  {
    // "2036" por "2026": la tecla de al lado. No se corrige por cuenta propia.
    const [{ lejos }] = await consulta(
      `select ((now() at time zone 'America/Bogota')::date + interval '4 years')::date::text as lejos`
    );
    const t = await verificar(SEDE, lejos);
    ok(/OJO CON EL AÑO/.test(t), 'lo señala como año probablemente mal tecleado', t.slice(0, 120));
    ok(/sin decirle que se equivocó/.test(t), 'y le pide preguntarlo sin culpar al cliente');
  }

  titulo('5. La fecha ocupada');
  {
    // Se ocupa una fecha de verdad y se deshace al terminar. Sin esto, la rama
    // OCUPADA no la corre nadie: depende del estado de la agenda, así que en un
    // banco de conversaciones no sale nunca.
    const fecha = dia(60);
    const tel = 'test-fechas-ocupada';
    await consulta(`
      insert into leads (telefono) values (${lit(tel)}) on conflict (telefono) do nothing;
      insert into agenda_reservas (lead_id, sede_id, fecha_solicitada, estado)
      select l.id, s.id_sede, ${lit(fecha)}::date, 'separado'
        from leads l, sedes s
       where l.telefono = ${lit(tel)} and s.nombre_sede = ${lit(SEDE)};`);
    try {
      const t = await verificar(SEDE, fecha);
      ok(/OCUPADA/.test(t), 'la reconoce como tomada', t.slice(0, 120));
      ok(/fin de semana|otra sede/i.test(t), 'ofrece salida: otro fin de semana u otra sede');
    } finally {
      await consulta(`
        delete from agenda_reservas where lead_id in (select id from leads where telefono = ${lit(tel)});
        delete from leads where telefono = ${lit(tel)};`);
    }
  }

  titulo('6. El nombre de sede que no resuelve');
  {
    const t = await verificar('Salón Que No Existe', dia(90));
    ok(/No encontré ninguna sede/.test(t), 'lo dice y pide reintentar con el nombre exacto', t.slice(0, 120));

    // "Casa" solo casa con Casa 4, Casa 5, Casa 74 y Casa Christian's: la
    // función tiene que pedir que desambigüe, no elegir una por su cuenta.
    const amb = await verificar('Casa', dia(90));
    ok(/varias sedes/.test(amb), 'un nombre ambiguo se devuelve para desambiguar, no se adivina',
       amb.slice(0, 120));
  }

  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
