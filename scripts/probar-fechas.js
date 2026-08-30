#!/usr/bin/env node
//
// Las fechas que no cuadran y la disponibilidad de sedes propias vs externas.
//
// `fn_verificar_disponibilidad_evento` distingue entre:
// 1. Sedes Propias de Christian Sierra (Casa Christian's, Sede Sur 66, Sede Norte,
//    Sede Granada Gold): se valida la agenda de reservas en tiempo real.
// 2. Sedes Aliadas / Externas (las 11 restantes): el agente no confirma disponibilidad
//    directa por chat, sino que deriva la confirmación de la fecha y detalles
//    a la llamada o cita con el asesor (Turno 6).
//
// Uso:  node scripts/probar-fechas.js

const https = require('https');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

const SEDE_PROPIA = "Casa Christian's Ciudad Jardín";
const SEDE_EXTERNA = "Casa 74";
const ANTICIPACION_MINIMA = 5; // días; el mismo piso que usa la rama "MUY PRÓXIMA"

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            gris: s => `\x1b[90m${s}\x1b[0m`, neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(detalle)); }
};
const titulo = (t) => console.log('\n' + c.neg(t));

async function consulta(sqlTexto) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await consultaUnaVez(sqlTexto);
    } catch (e) {
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

async function main() {
  const [{ hoy }] = await consulta(
    "select (now() at time zone 'America/Bogota')::date::text as hoy"
  );
  const dia = (n) => {
    const d = new Date(hoy + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const enLetras = {};
  for (let n = -1; n <= ANTICIPACION_MINIMA + 2; n++) {
    const [{ txt }] = await consulta(`select fn_fecha_en_letras(${lit(dia(n))}::date) as txt`);
    enLetras[n] = txt;
  }

  console.log(c.gris(`  hoy en Bogotá: ${enLetras[0]}`));

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
  titulo('1. La fecha que ya pasó (Sede Propia)');
  {
    const t = await verificar(SEDE_PROPIA, dia(-1));
    ok(/YA PAS[OÓ]/.test(t), 'la reconoce como pasada', t.slice(0, 120));
    ok(t.includes(enLetras[-1]), 'nombra la fecha que dijo el cliente, con su día de la semana');
    ok(/NO la apartes/.test(t), 'le prohíbe apartarla');
    ok(!/se equivoc/i.test(t), 'no la trata como un error del cliente');
    noOfreceFechaPegada(t, 'fecha pasada');
    ok(/pregunt/i.test(t), 'le dice al agente que pregunte por la fecha buena', t.slice(0, 160));
  }

  titulo('2. La fecha a la vuelta de la esquina (menos de 5 días)');
  {
    const t = await verificar(SEDE_PROPIA, dia(2));
    ok(/MUY PRÓXIMA/.test(t), 'la reconoce como demasiado próxima', t.slice(0, 120));
    ok(/NO le confirmes ni le niegues/.test(t), 'no confirma ni niega disponibilidad');
    ok(/llamada|visita|asesor/i.test(t), 'encamina hacia la llamada o la visita');
    noOfreceFechaPegada(t, 'fecha muy próxima');
  }

  titulo('3. La fecha con margen de sobra (Sede Propia)');
  {
    const t = await verificar(SEDE_PROPIA, dia(90));
    ok(/^DISPONIBLE\./.test(t), 'la confirma como disponible en sede propia', t.slice(0, 120));
  }

  titulo('4. El año tecleado mal');
  {
    const [{ lejos }] = await consulta(
      `select ((now() at time zone 'America/Bogota')::date + interval '4 years')::date::text as lejos`
    );
    const t = await verificar(SEDE_PROPIA, lejos);
    ok(/OJO CON EL AÑO/.test(t), 'lo señala como año probablemente mal tecleado', t.slice(0, 120));
    ok(/sin decirle que se equivocó/.test(t), 'y le pide preguntarlo sin culpar al cliente');
  }

  titulo('5. La fecha ocupada (Sede Propia)');
  {
    const fecha = dia(60);
    const tel = 'test-fechas-ocupada';
    await consulta(`
      insert into leads (telefono) values (${lit(tel)}) on conflict (telefono) do nothing;
      insert into agenda_reservas (lead_id, sede_id, fecha_solicitada, estado)
      select l.id, s.id_sede, ${lit(fecha)}::date, 'separado'
        from leads l, sedes s
       where l.telefono = ${lit(tel)} and s.nombre_sede = ${lit(SEDE_PROPIA)};`);
    try {
      const t = await verificar(SEDE_PROPIA, fecha);
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

    const amb = await verificar('Casa', dia(90));
    ok(/varias sedes/.test(amb), 'un nombre ambiguo se devuelve para desambiguar, no se adivina',
       amb.slice(0, 120));
  }

  titulo('7. Sede externa / aliada (confirmación con asesor)');
  {
    const t1 = await verificar(SEDE_EXTERNA, dia(90));
    ok(/SEDE EXTERNA \/ ALIADA/.test(t1), 'reconoce Casa 74 como sede aliada externa', t1.slice(0, 120));
    ok(/asesor/i.test(t1) && /llamada|cita/i.test(t1), 'deriva confirmación de fecha a la llamada/cita con el asesor');

    const t2 = await verificar('Pilas Premium', dia(90));
    ok(/SEDE EXTERNA \/ ALIADA/.test(t2), 'reconoce Pilas Premium como sede aliada externa', t2.slice(0, 120));
  }

  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
