#!/usr/bin/env node
//
// El material que cuelga de un TIPO DE EVENTO, no de una sede.
//
// Esta rama estuvo dormida desde que existe el catálogo -- todo el material era
// de sedes o institucional -- y el 2026-08-29 se despertó con el video de los
// vestidos de 15 años. Al despertarla salieron dos cosas:
//
//   1. `fn_medios_para_enviar` resolvía el tipo de evento con un `ilike`, así
//      que "15 Anos" sin tilde devolvía CERO piezas. El modelo escribe esa
//      forma constantemente. Estaba arreglado desde el 2026-08-26 y
//      20260826000010 lo revirtió al reconstruir la función desde un cuerpo
//      viejo para añadirle `p_reenviar`.
//   2. Nadie lo notó en tres días, y no lo habría notado nadie: sin material de
//      tipo_evento catalogado, la rama no se ejecutaba nunca.
//
// De ahí este archivo. Vigila las dos mitades del contrato:
//   - que el material del evento SALGA con las formas que escribe el modelo;
//   - que NO salga para los otros eventos, ni se cuele en la tanda de salones.
//
// Lo segundo importa tanto como lo primero: un cliente de boda que reciba
// vestidos de quinceañera es peor que uno que no reciba nada.
//
// Uso:  node scripts/probar-medios-evento.js

const https = require('https');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

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
    try { return await consultaUnaVez(sqlTexto); } catch (e) {
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
// Teléfono distinto en cada llamada: la función no repite material ya enviado,
// así que reusar uno haría que la segunda consulta devolviera cero y la prueba
// se leería como un fallo del resolver.
let n = 0;
const nuevoTel = () => `test-medios-evento-${process.pid}-${++n}`;
const pedir = (referencia) =>
  consulta(`select caption from fn_medios_para_enviar('tipo_evento', ${lit(referencia)}, ${lit(nuevoTel())}, 'ambos')`);

async function main() {
  const [{ hay }] = await consulta(
    `select count(*)::int as hay from medios where activo and tipo_evento_id is not null`);
  if (!hay) {
    console.log(c.gris('\n  No hay material colgado de ningún tipo de evento: nada que probar.'));
    console.log(c.gris('  (Si acabas de catalogar uno y sale esto, la migración no se aplicó.)\n'));
    process.exit(0);
  }

  // ------------------------------------------------------------------------
  titulo('1. Las formas que escribe el modelo resuelven al mismo paquete');
  {
    // Sin tilde y en minúscula es lo que más manda el modelo; el banco de
    // conversaciones tiene un mapa de variantes justo por esto.
    const FORMAS = ['15 Años', '15 años', '15 Anos', '15 anos', 'quince', 'quinceañera'];
    const salidas = [];
    for (const f of FORMAS) salidas.push([f, (await pedir(f)).length]);

    const mudas = salidas.filter(([, cuantas]) => cuantas === 0).map(([f]) => f);
    ok(mudas.length === 0,
       `las ${FORMAS.length} formas de "15 años" devuelven material`,
       'estas devolvieron cero: ' + JSON.stringify(mudas) +
       ' — el ilike volvió a reemplazar a fn_resolver_tipo_evento');
  }

  titulo('2. No se le manda a los eventos que no son');
  {
    // El fallo caro no es que falte: es que a un matrimonio le lleguen vestidos
    // de quinceañera.
    const otros = await consulta(
      `select nombre_paquete from tipos_evento where nombre_paquete <> '15 Años' order by 1`);
    const colados = [];
    for (const { nombre_paquete } of otros) {
      const r = await pedir(nombre_paquete);
      if (r.length) colados.push(`${nombre_paquete}: ${r[0].caption}`);
    }
    ok(colados.length === 0,
       `los ${otros.length} eventos que no son 15 años no reciben nada`,
       'se coló material en: ' + JSON.stringify(colados));
  }

  titulo('3. No se cuela en la tanda de la cotización');
  {
    // La tanda del turno 3 son los salones más el video de promoción. Una pieza
    // de tipo_evento ahí se perdería entre las otras dieciséis, y además
    // rompería el "va suelto, en su propio turno" que pidió el negocio.
    const tel = nuevoTel();
    await consulta(`insert into leads (telefono) values (${lit(tel)}) on conflict (telefono) do nothing`);
    try {
      const [{ intrusas }] = await consulta(
        `select count(*)::int as intrusas
           from fn_medios_sedes_cotizacion(${lit(tel)}, '100', false) f
           join medios m on m.id = f.id
          where m.tipo_evento_id is not null`);
      ok(intrusas === 0, 'la tanda de salones no arrastra material de tipo de evento',
         `${intrusas} pieza(s) de tipo_evento dentro de la tanda`);
    } finally {
      await consulta(`delete from leads where telefono = ${lit(tel)}`);
    }
  }

  titulo('4. No apaga el video de promoción');
  {
    // El acompañante promocional se salta si el cliente ya recibió algo
    // institucional, y ese chequeo pide las tres FK nulas. Si alguien cataloga
    // una pieza de evento con las tres nulas por error, el video de la promo
    // deja de viajar con la primera tanda -- y eso no se ve en ningún log.
    const [{ mal }] = await consulta(
      `select count(*)::int as mal from medios
        where activo and sede_id is null and tipo_evento_id is null and servicio_id is null
          and descripcion not ilike '%promoc%'`);
    ok(mal === 0,
       'ninguna pieza no promocional quedó con las tres FK nulas',
       `${mal} pieza(s) cuentan como institucionales sin serlo: apagarían el video de la promo`);
  }

  titulo('5. Lo catalogado cabe en WhatsApp y está publicado');
  {
    const filas = await consulta(
      `select m.caption, m.url, m.peso_bytes, m.tipo from medios m
        where m.activo and m.tipo_evento_id is not null`);
    const pesadas = filas.filter(f => f.tipo === 'video' && Number(f.peso_bytes) > 16777216);
    ok(pesadas.length === 0, `las ${filas.length} pieza(s) están por debajo del tope de 16 MB`,
       JSON.stringify(pesadas.map(f => f.caption)));

    // Con reintento, como el resto: un corte de red aquí diría "el video no
    // está publicado", que es una alarma grave y falsa.
    const cabeza = async (url) => {
      for (let i = 1; i <= 3; i++) {
        try { return await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30000) }); }
        catch { if (i < 3) await new Promise(r => setTimeout(r, 800 * i)); }
      }
      return null;
    };

    for (const f of filas) {
      const r = await cabeza(f.url);
      const largo = r && Number(r.headers.get('content-length'));
      ok(!!r && r.ok, `"${f.caption}" se descarga desde Storage`, r ? `HTTP ${r.status}` : 'sin respuesta');
      ok(largo === Number(f.peso_bytes),
         'y pesa lo que dice el catálogo',
         `Storage sirve ${largo} y el catálogo dice ${f.peso_bytes} — Meta descargaría otro archivo`);
    }
  }

  // ------------------------------------------------------------------------
  titulo('6. La tanda lo manda SOLA (2026-08-30)');
  {
    // El bloque 3 comprueba que `fn_medios_sedes_cotizacion` NO lo arrastra, y
    // eso sigue siendo cierto y querido: la tanda es la lista de salones, y una
    // pieza que no es de ninguna sede no pertenece a esa lista -- metida ahi se
    // ordenaria por precio entre los salones y se perderia.
    //
    // Quien lo cuelga es el NODO `Seleccionar Medios`, al final y en su propio
    // mensaje. Esta es la mitad que faltaba: hasta hoy la pieza estaba
    // catalogada y no la mandaba NADIE. Dependia de que el agente llamara la
    // herramienta una segunda vez con categoria = tipo_evento, y en toda la
    // vida de la base salio una sola vez, en una prueba.
    const fs = require('fs');
    const wf = JSON.parse(fs.readFileSync('n8n/workflow-enviar-medios.json', 'utf8'));
    const q = wf.nodes.find(x => x.name === 'Seleccionar Medios').parameters.query;
    // El nodo va parametrizado; la Management API no acepta $n.
    const ligar = (sql, ps) => ps.reduce((a, v, i) => a.split('$' + (i + 1)).join(lit(String(v))), sql);
    const sel = (tel, evento, ref) =>
      consulta(ligar(q, ['sede', ref || 'todas', tel, 'ambos', '100', 'false', evento]));
    const vestidos = (filas) => filas.filter(f => /vestidos/i.test(f.descripcion || ''));
    const conLead = async () => {
      const t = nuevoTel();
      await consulta(`insert into leads (telefono) values (${lit(t)}) on conflict (telefono) do nothing`);
      return t;
    };

    try {
      const t = await sel(await conLead(), '15 Años');
      ok(vestidos(t).length === 1,
         `la tanda de 15 años arrastra el video de vestidos (${t.length} piezas)`,
         t.map(f => f.descripcion).join(' | '));
      ok(t.length > 0 && /vestidos/i.test(t[t.length - 1].descripcion || ''),
         'y va el ÚLTIMO, detrás de los salones y del promocional',
         'último: ' + ((t[t.length - 1] || {}).descripcion || '(vacío)'));

      // Sin tilde, que es como lo escribe el modelo la mitad de las veces.
      const sinTilde = await sel(await conLead(), '15 Anos');
      ok(vestidos(sinTilde).length === 1, 'también con "15 Anos" sin tilde');

      // Un salon suelto no es la tanda: pedir Casa 5 no arrastra los vestidos.
      const suelto = await sel(await conLead(), '15 Años', 'Casa 5');
      ok(vestidos(suelto).length === 0,
         `pedir un salón suelto NO lo arrastra (${suelto.length} piezas)`);

      // Y lo que protege el bloque 2, ahora desde el nodo: a un matrimonio no
      // le llegan vestidos de quinceañera.
      const boda = await sel(await conLead(), 'Matrimonio');
      ok(vestidos(boda).length === 0,
         `un matrimonio no recibe vestidos de quinceañera (${boda.length} piezas)`);
    } finally {
      await consulta(
        `delete from envios_medios where lead_id in (select id from leads where telefono like 'test-medios-evento-%');` +
        ` delete from leads where telefono like 'test-medios-evento-%';`);
    }
  }

  console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
  // `process.exitCode` y no `process.exit()`: matar el proceso con los sockets
  // keep-alive de fetch todavía abiertos hace que libuv aborte en Windows con
  // un "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" y el proceso
  // salga con código 127. La prueba imprimía "sin fallos" y devolvía error
  // igual, que es la peor combinación posible: quien la encadene la lee como
  // rota y quien la mira la lee como buena.
  process.exitCode = fallos ? 1 : 0;
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exitCode = 1; });
