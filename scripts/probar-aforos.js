#!/usr/bin/env node
//
// El filtro de aforo: cuántos salones salen, y con qué precio.
//
// `fn_medios_sedes_cotizacion` es la tanda de la cotización -- el video de cada
// salón con su precio en el caption. Dos cosas decide, y las dos se le habían
// escapado a las pruebas que había:
//
//   1. QUÉ SALONES entran, que depende del aforo: 13 hasta 90 personas, 15 de
//      100 a 150, 8 de 160 a 200. Un salón que no tiene precio para ese tamaño
//      no puede salir, y uno que sí lo tiene no puede faltar.
//   2. SI YA SE MANDÓ. Y aquí estaba el fallo del 2026-08-29 (ejecuciones 4635
//      y 4845 del VPS): el anti-repetición excluía un salón por haberlo visto
//      el cliente ALGUNA VEZ, sin mirar con qué aforo. Juan cotizó 60 personas,
//      recibió 13 salones; media hora después pidió 100 -- que son 15 -- y le
//      llegaron dos. Arreglado en 20260829000003_aforo_en_envios.sql.
//
// Por qué el fallo (2) sobrevivió a todo el banco: llamar a la función contra
// una base recién vaciada devuelve los 15 y parece que la tanda está bien. El
// filtro solo aparece en el SEGUNDO pedido del mismo cliente. Por eso el
// bloque 5 de aquí no consulta: simula la conversación entera -- pide, anota
// los envíos con la query REAL del nodo `Registrar Envío`, y vuelve a pedir.
//
// Nada de números escritos a mano: lo esperado se calcula contra `sedes`,
// `precios_sedes` y `medios` en cada corrida. Si mañana entra un salón nuevo al
// catálogo, la prueba sigue valiendo y no hay que tocarla.
//
// Uso:  node scripts/probar-aforos.js
//       node scripts/probar-aforos.js --mutar   (comprueba que sabe fallar)
//
// `--mutar` existe porque una prueba que no puede fallar no sirve. Saca la
// definición VIVA de la función, le rompe una línea a propósito, la instala con
// otro nombre -- nunca toca la de producción -- y exige que las comprobaciones
// se pongan en rojo. Si con el filtro roto siguen en verde, es que no miran
// nada.

const fs = require('fs');
const https = require('https');

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error('Faltan SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN. Cárgalos del .env.');
  process.exit(1);
}

const MUTAR = process.argv.includes('--mutar');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

let fallos = 0;
const ok = (cond, texto, detalle) => {
  console.log('  ' + (cond ? c.verde('✓') : c.rojo('✗')) + ' ' + texto);
  // El detalle se recorta: con el filtro roto un solo fallo listaba los 195
  // salones repetidos y tapaba el resto del banco.
  if (!cond) { fallos++; if (detalle) console.log('      ' + c.gris(String(detalle).slice(0, 220))); }
};
const titulo = (t) => console.log('\n' + c.neg(t));

// La Management API corta conexiones de vez en cuando. Sin reintento, un banco
// que falla al azar se deja de mirar y el siguiente fallo de verdad se lee como
// "otra vez la red". Un error de SQL no se reintenta: va a estar mal igual.
async function consulta(sqlTexto) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try { return await consultaUnaVez(sqlTexto); } catch (e) {
      if (!/ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|fetch failed/i.test(e.message)) throw e;
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
      // Buffers y no strings: un emoji partido entre dos chunks se decodifica
      // en dos mitades inválidas y parece dato corrupto en la base.
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

// Mismo ligado que el resto del banco: la Management API no acepta $1..$n.
function ligar(sqlTexto, params) {
  const pedidos = new Set((sqlTexto.match(/\$\d+/g) || []).map(s => Number(s.slice(1))));
  const faltan = [...pedidos].filter(n => n > params.length).sort((a, b) => a - b);
  if (faltan.length) {
    throw new Error(`la query usa ${faltan.map(n => '$' + n).join(', ')} y solo le pasaste ` +
                    `${params.length} parametro(s): el nodo cambió de firma y esta llamada se quedó atrás`);
  }
  let out = sqlTexto;
  params.forEach((v, i) => {
    const l = v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : lit(v);
    out = out.split('$' + (i + 1)).join(l);
  });
  return out;
}

// Las queries salen del workflow. Registrar los envíos a mano aquí sería
// exactamente la trampa que dejó pasar el fallo: la prueba anotaría los envíos
// de una forma y producción de otra.
const wf = JSON.parse(fs.readFileSync('n8n/workflow-enviar-medios.json', 'utf8'));
const nodo = (n) => {
  const x = wf.nodes.find(y => y.name === n);
  if (!x) throw new Error('no existe el nodo ' + n);
  return x.parameters.query;
};

// --------------------------------------------------------------------------
// Los escalones, sacados del catálogo
// --------------------------------------------------------------------------

// El escalón al que sube un número cualquiera. NO se calcula aquí: lo dice la
// misma función que usa la tanda, así que la prueba no puede tener su propia
// idea del redondeo.
const escalon = (n) => consulta(`select (fn_aforos_normalizar(${lit(String(n))}))[1] as e`)
  .then(r => r[0].e);

// Cuántos salones DEBERÍAN salir para un aforo: los que tienen precio para ese
// escalón y además tienen alguna pieza activa en el catálogo. Las dos
// condiciones importan -- un salón sin video no puede salir aunque tenga
// precio -- y las dos salen de la base.
const esperados = (aforo) => consulta(`
    select s.nombre_sede, p.precio_total
    from sedes s
    join precios_sedes p on p.sede_id = s.id_sede and p.capacidad_invitados = ${aforo}
    where exists (select 1 from medios m where m.sede_id = s.id_sede and m.activo)
    order by s.nombre_sede`);

// La tanda, y de qué sede es cada pieza que devolvió. El join a `medios` es lo
// que permite comparar por SEDE en vez de por el texto del caption, que es
// justo lo que la función construye y no debería usarse para juzgarla.
const tanda = (fn, tel, invitados, reenviar = false) => consulta(`
    select t.id, t.tipo, t.caption, s.nombre_sede
    from ${fn}(${lit(tel)}, ${lit(String(invitados))}, ${reenviar}) t
    join medios m on m.id = t.id
    join sedes  s on s.id_sede = m.sede_id
    order by s.nombre_sede`);

// --------------------------------------------------------------------------

async function comprobaciones(fn) {
  const antes = fallos;
  const TEL = 'test-aforos-' + Date.now();
  await consulta(ligar(
    `insert into leads (telefono, nombre, estado) values ($1, 'Prueba Aforos', 'nuevo')`, [TEL]));

  try {
    // ----------------------------------------------------------------------
    titulo('1. Los escalones reales, de 10 en 10');
    for (let a = 50; a <= 200; a += 10) {
      const esp = await esperados(a);
      const filas = await tanda(fn, TEL, a);
      ok(filas.length === esp.length,
         `${a} personas → ${esp.length} salones`,
         `devolvió ${filas.length}: ${filas.map(f => f.nombre_sede).join(', ')}`);
      // Un escalón que devuelve cero sería un catálogo roto, no un filtro fino.
      ok(esp.length > 0, `${a} personas: el catálogo tiene salones para ese aforo`);
    }

    titulo('2. Por debajo de 50 y por encima de 200');
    // La función redondea a los extremos en vez de devolver nada. Se fija aquí
    // porque es lo que decide qué recibe el que escribe "somos 30".
    for (const n of [10, 20, 30, 40]) {
      const e = await escalon(n);
      ok(e === 50, `${n} personas sube al escalón 50`, `subió a ${e}`);
      const filas = await tanda(fn, TEL, n);
      const esp = await esperados(50);
      ok(filas.length === esp.length, `${n} personas → los ${esp.length} salones de 50`,
         `devolvió ${filas.length}`);
      ok(filas.every(f => / - 50 personas$/.test(f.caption)),
         `${n} personas: el caption dice 50 personas, no ${n}`,
         filas.map(f => f.caption).slice(0, 2).join(' | '));
    }
    {
      const e = await escalon(210);
      ok(e === 200, '210 personas baja al escalón 200', `bajó a ${e}`);
      const filas = await tanda(fn, TEL, 210);
      const esp = await esperados(200);
      ok(filas.length === esp.length, `210 personas → los ${esp.length} salones de 200`,
         `devolvió ${filas.length}`);
      ok(filas.every(f => / - 200 personas$/.test(f.caption)),
         '210 personas: el caption dice 200 personas');
    }

    titulo('3. Los números intermedios suben al escalón de arriba');
    // Redondear hacia abajo sería cotizarle a alguien un salón donde no le
    // caben los invitados: 105 personas en un salón de 100.
    for (const n of [55, 105, 137]) {
      const e = await escalon(n);
      ok(e === Math.ceil(n / 10) * 10, `${n} sube a ${Math.ceil(n / 10) * 10}`, `subió a ${e}`);
      const filas = await tanda(fn, TEL, n);
      const esp = await esperados(e);
      ok(filas.length === esp.length, `${n} personas → los ${esp.length} salones de ${e}`,
         `devolvió ${filas.length}`);
      ok(filas.every(f => new RegExp(` - ${e} personas$`).test(f.caption)),
         `${n} personas: el caption dice ${e} personas`);
    }

    // ----------------------------------------------------------------------
    titulo('4. Cada salón que sale tiene precio para ESE aforo');
    // Los tres tramos del catálogo. No se comprueba solo el número: se compara
    // salón por salón contra `precios_sedes`, y se le saca el precio al caption
    // para exigir que sea el de ese escalón y no el del más cercano.
    for (const a of [50, 90, 100, 150, 160, 200]) {
      const esp = await esperados(a);
      const filas = await tanda(fn, TEL, a);

      const salieron = new Set(filas.map(f => f.nombre_sede));
      const debian = new Set(esp.map(e => e.nombre_sede));
      const sobran = [...salieron].filter(s => !debian.has(s));
      const faltan = [...debian].filter(s => !salieron.has(s));

      ok(sobran.length === 0, `${a}: no se cuela ningún salón sin precio para ese aforo`,
         'sobran: ' + sobran.join(', '));
      ok(faltan.length === 0, `${a}: no falta ninguno de los que sí lo tienen`,
         'faltan: ' + faltan.join(', '));

      const precio = new Map(esp.map(e => [e.nombre_sede, Number(e.precio_total)]));
      const malos = filas.filter(f => {
        const m = /\$([\d.]+)/.exec(f.caption);
        return !m || Number(m[1].replace(/\./g, '')) !== precio.get(f.nombre_sede);
      });
      ok(malos.length === 0, `${a}: el precio del caption es el de ese aforo`,
         malos.map(m => `${m.nombre_sede}: ${m.caption} (base: ${precio.get(m.nombre_sede)})`).join(' | '));
    }

    // ----------------------------------------------------------------------
    titulo('5. Recotización: el mismo cliente cambia de aforo');
    // El chat real del 2026-08-29, tal cual. Se anota cada envío con la query
    // REAL del nodo `Registrar Envío` -- con su categoría, su referencia y su
    // aforo -- porque es ahí donde se guarda la clave de la que depende todo lo
    // que se comprueba debajo.
    const TEL2 = 'test-aforos-recot-' + Date.now();
    await consulta(ligar(
      `insert into leads (telefono, nombre, estado) values ($1, 'Prueba Recotiza', 'nuevo')`, [TEL2]));

    const anotar = async (filas, invitados) => {
      for (const f of filas) {
        await consulta(ligar(nodo('Registrar Envío'), [f.id, TEL2, 'sede', 'todas', String(invitados)]));
      }
    };
    const hayMaterial = (aforos) =>
      consulta(`select fn_hay_material_sedes(${lit(TEL2)}, array[${aforos.join(',')}], false) as hay`)
        .then(r => r[0].hay);

    const esp60 = (await esperados(60)).length;
    const esp100 = (await esperados(100)).length;
    const esp150 = (await esperados(150)).length;

    const t60 = await tanda(fn, TEL2, 60);
    ok(t60.length === esp60, `pide 60 → ${esp60} salones`, `devolvió ${t60.length}`);
    await anotar(t60, 60);

    const t100 = await tanda(fn, TEL2, 100);
    ok(t100.length === esp100,
       `luego pide 100 → ${esp100} salones (el fallo del 2026-08-29: llegaban 2)`,
       `devolvió ${t100.length}: ${t100.map(f => f.nombre_sede).join(', ')}`);
    ok(t100.every(f => / - 100 personas$/.test(f.caption)),
       'y con el precio de 100, no con el de 60');
    await anotar(t100, 100);

    const t100bis = await tanda(fn, TEL2, 100);
    ok(t100bis.length === 0, 'pide 100 otra vez → nada: eso sí sería repetirse',
       `devolvió ${t100bis.length}`);

    const t150 = await tanda(fn, TEL2, 150);
    ok(t150.length === esp150, `cambia a 150 → ${esp150} salones`, `devolvió ${t150.length}`);

    const t60bis = await tanda(fn, TEL2, 60);
    ok(t60bis.length === 0, 'vuelve a 60 → nada: ese aforo ya lo tiene en el chat',
       `devolvió ${t60bis.length}`);

    const t60re = await tanda(fn, TEL2, 60, true);
    ok(t60re.length === esp60, `pide 60 con reenviar → los ${esp60} otra vez`,
       `devolvió ${t60re.length}`);

    // La antesala del guion y la tanda tienen que decir lo mismo. Si no, el
    // agente anuncia videos que no salen -- o calla los que sí.
    ok((await hayMaterial([100])) === false,
       'la antesala sabe que de 100 no queda material (igual que la tanda)');
    ok((await hayMaterial([150])) === (t150.length > 0),
       'la antesala sabe que de 150 sí queda material');

    // ----------------------------------------------------------------------
    titulo('6. Varios aforos de una sola vez');
    // "50, 100 y 130" en un mensaje. El caption cambia de forma -- sin precio,
    // solo la lista -- así que es otro mensaje distinto y no puede taparse con
    // el de un aforo suelto ni taparlo.
    const TEL3 = 'test-aforos-multi-' + Date.now();
    await consulta(ligar(
      `insert into leads (telefono, nombre, estado) values ($1, 'Prueba Multi', 'nuevo')`, [TEL3]));
    const anotar3 = async (filas, invitados) => {
      for (const f of filas) {
        await consulta(ligar(nodo('Registrar Envío'), [f.id, TEL3, 'sede', 'todas', String(invitados)]));
      }
    };

    const multi = await consulta(`
        select count(distinct s.id_sede)::int as n
        from sedes s
        join precios_sedes p on p.sede_id = s.id_sede and p.capacidad_invitados in (50, 100, 130)
        where exists (select 1 from medios m where m.sede_id = s.id_sede and m.activo)`);
    const tm = await tanda(fn, TEL3, '50,100,130');
    ok(tm.length === multi[0].n, `"50,100,130" → ${multi[0].n} salones (los que sirven para alguno)`,
       `devolvió ${tm.length}`);
    ok(tm.every(f => /Disponible para .* personas$/.test(f.caption) && !f.caption.includes('$')),
       'con varios aforos el caption lista los tamaños y no lleva precio',
       tm.map(f => f.caption).slice(0, 2).join(' | '));
    await anotar3(tm, '50,100,130');

    const tm100 = await tanda(fn, TEL3, 100);
    ok(tm100.length === esp100,
       `y después "100" a secas sigue saliendo entero (${esp100}): lleva precio, es otro mensaje`,
       `devolvió ${tm100.length}`);

    // ----------------------------------------------------------------------
    titulo('7. La condición de "esto es la tanda", una sola vez');
    // `fn_es_tanda` nació para que `Registrar Envío` supiera si el envío lleva
    // aforo. La misma condición está escrita a mano dentro de tres nodos, y si
    // una se separa de la otra los envíos se anotan con una regla y se filtran
    // con otra. Esto la saca del texto de cada nodo y las compara.
    const CASOS = [['sede', 'todas'], ['sede', ''], ['sede', 'TODAS LAS SEDES'], ['sede', ' Todos '],
                   ['sede', 'Casa 5'], ['institucional', 'promocion'], ['tipo_evento', '15 Años'],
                   [null, null], ['SEDE', 'todas']];
    const molde = /lower\(btrim\(coalesce\(\$1, ''\)\)\)\s*=\s*'sede'\s*and\s+lower\(btrim\(coalesce\(\$2, ''\)\)\)\s*in\s*\([^)]*\)/;
    for (const n of ['Seleccionar Medios', 'Diagnóstico', 'Guion Cotización']) {
      const m = molde.exec(nodo(n));
      if (!m) { ok(false, `${n}: se le encuentra la condición de tanda`); continue; }
      const partes = CASOS.map(([cat, ref]) =>
        `select ${lit(String(cat))} as cat, fn_es_tanda(${cat === null ? 'null' : lit(cat)}, ` +
        `${ref === null ? 'null' : lit(ref)}) as f, (${ligar(m[0], [cat, ref])}) as n`);
      const r = await consulta(partes.join(' union all '));
      const discrepan = r.filter(x => x.f !== x.n);
      ok(discrepan.length === 0, `${n}: su condición de tanda coincide con fn_es_tanda`,
         JSON.stringify(discrepan));
    }

    await consulta(`
      delete from envios_medios where lead_id in (select id from leads where telefono in (${lit(TEL2)}, ${lit(TEL3)}));
      delete from leads where telefono in (${lit(TEL2)}, ${lit(TEL3)});`);
  } finally {
    // La base es la de producción: lo que ensucia esta prueba lo limpia esta
    // prueba, pase lo que pase por el camino.
    await consulta(`
      delete from envios_medios where lead_id in (select id from leads where telefono like 'test-aforos-%');
      delete from cotizaciones_aforos where lead_id in (select id from leads where telefono like 'test-aforos-%');
      delete from reservas where lead_id in (select id from leads where telefono like 'test-aforos-%');
      delete from leads where telefono like 'test-aforos-%';`);
  }
  return fallos - antes;
}

// --------------------------------------------------------------------------
// ¿Sabe fallar?
// --------------------------------------------------------------------------
// Se saca la definición VIVA de la función, se le rompe una línea y se instala
// con otro nombre. La de producción no se toca en ningún momento.
async function mutante(nombre, romper) {
  const [{ def }] = await consulta(`
      select pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_medios_sedes_cotizacion'`);
  const roto = romper(def);
  if (roto === def) throw new Error(`la mutación "${nombre}" no encontró qué romper: la función cambió`);
  const renombrado = roto.replace('public.fn_medios_sedes_cotizacion(', `public.${nombre}(`);
  if (renombrado === roto) throw new Error('no pude renombrar la función mutada');
  await consulta(renombrado);
  return nombre;
}

const MUTACIONES = [
  ['fn_probar_aforos_sin_filtro', 'el filtro de aforo',
   (d) => d.replace('and p.capacidad_invitados = any(v_aforos)', 'and true')],
  ['fn_probar_aforos_sin_clave', 'el anti-repetición por aforo',
   (d) => d.replace('and e.aforo_clave is not distinct from v_clave', '')],
];

// --------------------------------------------------------------------------
async function main() {
  if (!MUTAR) {
    console.log(c.gris('  la función de verdad: fn_medios_sedes_cotizacion'));
    await comprobaciones('fn_medios_sedes_cotizacion');
    console.log('\n' + (fallos ? c.rojo(`${fallos} fallo(s)`) : c.verde('sin fallos')) + '\n');
    process.exit(fallos ? 1 : 0);
  }

  console.log(c.ama('\nMODO MUTACIÓN: cada bloque de abajo TIENE que ponerse en rojo.\n'));
  let sanas = 0;
  for (const [nombre, que, romper] of MUTACIONES) {
    console.log(c.neg(`\n===== rompiendo ${que} =====`));
    await mutante(nombre, romper);
    try {
      const rojos = await comprobaciones(nombre);
      if (rojos > 0) {
        console.log(c.verde(`\n  ✓ ${rojos} comprobación(es) en rojo: la prueba sabe cazar "${que}"`));
      } else {
        console.log(c.rojo(`\n  ✗ TODO EN VERDE con ${que} roto: esta prueba no mira nada`));
        sanas++;
      }
    } finally {
      await consulta(`drop function if exists ${nombre}(text, text, boolean)`);
    }
  }
  console.log('\n' + (sanas
    ? c.rojo(`${sanas} mutación(es) pasaron desapercibidas`)
    : c.verde('las dos mutaciones se cazan: la prueba puede fallar')) + '\n');
  process.exit(sanas ? 1 : 0);
}

main().catch(e => { console.error(c.rojo('\nse cayó: ' + e.message)); process.exit(1); });
