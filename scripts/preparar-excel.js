#!/usr/bin/env node
//
// Deja el Excel del equipo listo para que los dos nodos puedan escribir en él.
//
// Crea las pestañas `Reservas` y `Citas` con sus encabezados, congela la
// primera fila y la deja en negrita. Es idempotente: si ya están, no toca
// nada y solo dice cómo están.
//
// Los encabezados de aquí son la ÚNICA fuente de verdad del orden de las
// columnas: `scripts/probar-excel.js` los importa y comprueba, celda por
// celda, que la fila que arma cada nodo cae debajo del encabezado que le
// corresponde. Si alguien mueve una columna aquí y no toca el nodo, la prueba
// falla; sin eso, el desfase no se vería hasta que alguien leyera la hoja y
// encontrara un teléfono en la columna de la sede.
//
// Usa el service account `.gcp-sa-n8n-calendar.json`, la misma credencial con
// la que n8n escribe en Calendar. En n8n vive en una credencial APARTE
// (N8N_VPS_CREDENCIAL_SHEETS) que solo lleva el scope de spreadsheets, para
// que los nodos de calendario no puedan tocar hojas de cálculo.
//
//   node --env-file=.env scripts/preparar-excel.js           # mira, no toca
//   node --env-file=.env scripts/preparar-excel.js --crear   # crea lo que falte
//   node --env-file=.env scripts/preparar-excel.js --probar  # escribe una fila real y la borra

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// La cuenta de servicio de las HOJAS, que ya no es la de Calendar (2026-09-02).
//
// La Sheets API se habilita en el proyecto dueño de la CREDENCIAL, no donde
// vive la hoja; y el proyecto del cliente la tiene apagada sin forma de
// encenderla desde aquí (a su consola no se entra: pide verificación en dos
// pasos y la cuenta es suya). Así que las hojas las escribe una cuenta de
// servicio de un proyecto nuestro, y la hoja solo tiene que estar compartida
// con ella. Ver `scripts/credencial-sheets.js`.
//
// Se cae a la de Calendar si la otra no está, para que el diagnóstico siga
// diciendo algo útil en vez de reventar por un archivo que falta.
const SA = fs.existsSync('.gcp-sa-sheets.json')
  ? '.gcp-sa-sheets.json'
  : '.gcp-sa-n8n-calendar.json';
const HOJA = process.env.EXCEL_AGENDA_SHEET_ID;

// El orden de estas columnas es el orden del array `values` del nodo.
// Cambiar una cosa sin la otra es lo que `probar-excel.js` no deja pasar.
const PESTANAS = {
  Reservas: {
    workflow: 'workflow-separar-fecha.json',
    nodo: 'Anotar en Excel',
    rango: 'A:J',
    // Las dos últimas nacieron el 2026-09-02, con la sincronización de vuelta
    // (`workflow-sincronizar-hoja.json`). Son las columnas que hacen que la
    // hoja no sea solo un reflejo:
    //
    //   `cancelada`     la escribe una PERSONA. Es la única forma de liberar
    //                   una fecha desde aquí. Borrar la fila no libera nada:
    //                   un borrado accidental pondría a la venta un sábado ya
    //                   vendido y el bot lo vendería dos veces.
    //   `sincronizado`  la escribe el WORKFLOW. Es el único sitio donde se ven
    //                   los rechazos -- una sede mal escrita, una fecha que no
    //                   se entiende, un choque con una fila del bot. Sin ella
    //                   esas filas se perderían en silencio.
    columnas: ['anotado_en', 'fecha_evento', 'fecha_legible', 'sede', 'cliente',
               'telefono_contacto', 'origen', 'google_event_id',
               'cancelada', 'sincronizado'],
    // Una fila de mentira con la forma de una de verdad, para --probar.
    ejemplo: ['2026-01-01 00:00', '2026-01-01', "'PRUEBA - borrar", "'PRUEBA", "'PRUEBA",
              "'+573000000000", 'Prueba', "'prueba", "'no", "'prueba"],
  },
  Citas: {
    workflow: 'workflow-agendar-cita.json',
    nodo: 'Anotar Cita en Excel',
    rango: 'A:K',
    columnas: ['anotado_en', 'cita_legible', 'inicio', 'fin', 'tipo_cita', 'nombre',
               'telefono_contacto', 'whatsapp', 'detalle', 'origen', 'google_event_id'],
    ejemplo: ['2026-01-01 00:00', "'PRUEBA - borrar", '2026-01-01T00:00:00-05:00',
              '2026-01-01T00:30:00-05:00', "'prueba", "'PRUEBA", "'+573000000000",
              "'+573000000000", "'PRUEBA", 'Prueba', "'prueba"],
  },
};

// `probar-excel.js` importa PESTANAS. Se exporta ANTES de todo lo demás y el
// programa de abajo solo corre si a este archivo lo llamaron directamente:
// importarlo no puede disparar peticiones a Google.
module.exports = { PESTANAS };
if (require.main !== module) return;

const CREAR = process.argv.includes('--crear');
const PROBAR = process.argv.includes('--probar');

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

function peticion(opciones, cuerpo) {
  return new Promise((resolve, reject) => {
    const req = https.request(opciones, res => {
      const t = [];
      res.on('data', x => t.push(x));
      res.on('end', () => resolve({ codigo: res.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    req.on('error', reject);
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

// El JWT firmado con la llave del service account, canjeado por un token.
// Mismo procedimiento que `vaciar-calendario.js`, con otro scope.
async function token() {
  const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const cabeza = b64({ alg: 'RS256', typ: 'JWT' });
  const cuerpo = b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  });
  const firma = crypto.sign('RSA-SHA256', Buffer.from(cabeza + '.' + cuerpo), sa.private_key).toString('base64url');
  const datos = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
                '&assertion=' + encodeURIComponent(`${cabeza}.${cuerpo}.${firma}`);
  const r = await peticion({
    host: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(datos) },
  }, datos);
  const j = JSON.parse(r.texto);
  if (!j.access_token) throw new Error('no dieron token: ' + r.texto.slice(0, 300));
  return j.access_token;
}

let TOKEN = null;
async function sheets(ruta, metodo = 'GET', cuerpo = null) {
  const datos = cuerpo ? JSON.stringify(cuerpo) : null;
  const r = await peticion({
    host: 'sheets.googleapis.com', path: '/v4/spreadsheets/' + HOJA + ruta, method: metodo,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) } : {}),
    },
  }, datos);
  let j = null;
  try { j = JSON.parse(r.texto); } catch { /* respuesta vacía */ }

  // Los dos 403 que se ven aquí no significan lo mismo, y confundirlos cuesta
  // media hora: uno lo arregla una persona en la consola de Google Cloud, el
  // otro lo arregla el dueño de la hoja con el botón de compartir.
  if (r.codigo === 403) {
    const razon = j?.error?.details?.find(d => d.reason === 'SERVICE_DISABLED');
    if (razon) {
      console.error(c.rojo('\n✗ La Google Sheets API está APAGADA en el proyecto de Google Cloud.'));
      console.error('  Esto no lo puede encender la cuenta de servicio sola (le falta');
      console.error('  serviceusage.services.enable): es un clic de una persona con acceso a');
      console.error('  la consola. Enciéndela aquí y vuelve a correr esto:\n');
      console.error('  ' + c.neg(razon.metadata.activationUrl) + '\n');
    } else {
      const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
      console.error(c.rojo('\n✗ La API respondió, pero la cuenta de servicio no puede con esta hoja.'));
      console.error('  Comparte el Excel como EDITOR con:\n');
      console.error('  ' + c.neg(sa.client_email) + '\n');
      console.error(c.gris('  ' + (j?.error?.message || r.texto).slice(0, 300)));
    }
    process.exit(1);
  }
  if (r.codigo === 404) {
    console.error(c.rojo(`\n✗ No hay ninguna hoja con el id ${HOJA}.`));
    console.error('  El id sale de la URL, entre /d/ y /edit. Ojo: el link de "publicar en');
    console.error('  la web" (/d/e/2PACX-...) NO sirve, ese token no es el id del archivo.\n');
    process.exit(1);
  }
  if (r.codigo >= 400) throw new Error(`HTTP ${r.codigo} en ${ruta}: ${r.texto.slice(0, 400)}`);
  return j;
}

(async () => {
  if (!HOJA) {
    console.error('Falta EXCEL_AGENDA_SHEET_ID. Cárgalo del .env (node --env-file=.env ...).');
    process.exit(1);
  }
  TOKEN = await token();

  const meta = await sheets('?fields=' + encodeURIComponent(
    'properties.title,sheets.properties(title,sheetId,gridProperties)'));
  console.log(c.neg(`\nExcel: ${meta.properties.title}`));
  console.log(c.gris('  https://docs.google.com/spreadsheets/d/' + HOJA + '/edit'));

  const existentes = new Map(meta.sheets.map(s => [s.properties.title, s.properties]));
  const sobran = [...existentes.keys()].filter(t => !(t in PESTANAS));
  if (sobran.length) {
    console.log(c.gris(`  otras pestañas en el archivo, no se tocan: ${sobran.join(', ')}`));
  }

  // --- Qué falta ------------------------------------------------------------
  const porCrear = [];
  const porEncabezar = [];
  for (const [nombre, def] of Object.entries(PESTANAS)) {
    if (!existentes.has(nombre)) {
      console.log(`  ${c.ama('·')} pestaña ${c.neg(nombre)}: no existe`);
      porCrear.push(nombre);
      porEncabezar.push(nombre);
      continue;
    }
    const fila = await sheets('/values/' + encodeURIComponent(`${nombre}!1:1`));
    const actual = (fila.values && fila.values[0]) || [];
    const igual = actual.length === def.columnas.length &&
                  actual.every((v, i) => v === def.columnas[i]);
    if (igual) {
      console.log(`  ${c.verde('✓')} pestaña ${c.neg(nombre)}: ${def.columnas.length} columnas, encabezados al día`);
    } else {
      console.log(`  ${c.ama('·')} pestaña ${c.neg(nombre)}: encabezados distintos`);
      console.log(c.gris(`      hay:  ${actual.join(' | ') || '(fila 1 vacía)'}`));
      console.log(c.gris(`      toca: ${def.columnas.join(' | ')}`));
      porEncabezar.push(nombre);
    }
  }

  if (!CREAR && !PROBAR) {
    if (porCrear.length || porEncabezar.length) {
      console.log(c.ama('\nFalta preparar la hoja. Córrelo con --crear.\n'));
      process.exit(1);
    }
    console.log(c.verde('\nLa hoja está lista. Con --probar se escribe una fila de verdad y se borra.\n'));
    return;
  }

  // --- Crear lo que falte ---------------------------------------------------
  if (CREAR) {
    if (porCrear.length) {
      const nuevas = await sheets(':batchUpdate', 'POST', {
        requests: porCrear.map(nombre => ({
          addSheet: { properties: { title: nombre,
            gridProperties: { frozenRowCount: 1, columnCount: PESTANAS[nombre].columnas.length } } },
        })),
      });
      nuevas.replies.forEach(r => {
        const p = r.addSheet.properties;
        existentes.set(p.title, p);
        console.log(`  ${c.verde('+')} creada la pestaña ${c.neg(p.title)}`);
      });
    }

    for (const nombre of porEncabezar) {
      const def = PESTANAS[nombre];

      // Una pestaña que ya existe tiene su ancho fijo, el que se le dio al
      // crearla, y escribir fuera de él NO devuelve un error claro: la API
      // contesta "exceeds grid limits" y ahí se acaba. Pasó el 2026-09-02 al
      // añadirle a `Reservas` las columnas `cancelada` y `sincronizado`: la
      // pestaña tenía ocho columnas y el encabezado nuevo traía diez.
      const ancho = (existentes.get(nombre).gridProperties || {}).columnCount || 0;
      if (ancho && ancho < def.columnas.length) {
        await sheets(':batchUpdate', 'POST', {
          requests: [{ appendDimension: {
            sheetId: existentes.get(nombre).sheetId, dimension: 'COLUMNS',
            length: def.columnas.length - ancho } }],
        });
        console.log(`  ${c.verde('+')} ${c.neg(nombre)} pasa de ${ancho} a ${def.columnas.length} columnas`);
      }

      await sheets('/values/' + encodeURIComponent(`${nombre}!A1`) +
                   '?valueInputOption=RAW', 'PUT', { values: [def.columnas] });
      // Negrita y fila congelada: la hoja la lee gente, no solo el bot.
      await sheets(':batchUpdate', 'POST', {
        requests: [
          { repeatCell: {
              range: { sheetId: existentes.get(nombre).sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold' } },
          { updateSheetProperties: {
              properties: { sheetId: existentes.get(nombre).sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount' } },
        ],
      });
      console.log(`  ${c.verde('+')} encabezados escritos en ${c.neg(nombre)}`);
    }
  }

  // --- Una fila de verdad, por el mismo camino que el nodo ------------------
  if (PROBAR) {
    console.log(c.neg('\nEscribiendo una fila de prueba por el mismo camino que el nodo:'));
    for (const [nombre, def] of Object.entries(PESTANAS)) {
      const ruta = '/values/' + encodeURIComponent(`${nombre}!${def.rango}`) +
                   ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
      const r = await sheets(ruta, 'POST', { values: [def.ejemplo] });
      const rango = r.updates.updatedRange;          // p.ej. "Reservas!A5:H5"
      const fila = Number(rango.match(/(\d+):/)[1]);

      // Se relee para ver qué GUARDÓ Sheets, no qué se le mandó: es la única
      // forma de cazar la celda que entró como fórmula o como número.
      //
      // Dos veces, y no una, porque hay dos preguntas distintas. La lectura
      // FORMATEADA devuelve lo que ve una persona en la celda; la SIN FORMATO
      // devuelve el valor de dentro, y ahí una fecha de verdad sale como
      // número de serie. Sin la segunda no se puede distinguir "Sheets entendió
      // la fecha" de "Sheets se comió el dato".
      const leida = await sheets('/values/' + encodeURIComponent(`${nombre}!A${fila}:${fila}`));
      const cruda = await sheets('/values/' + encodeURIComponent(`${nombre}!A${fila}:${fila}`) +
                                 '?valueRenderOption=UNFORMATTED_VALUE');
      const celdas = (leida.values && leida.values[0]) || [];
      const crudas = (cruda.values && cruda.values[0]) || [];
      let mal = 0;
      celdas.forEach((v, i) => {
        const enviado = String(def.ejemplo[i]);
        const escapada = enviado.startsWith("'");
        const esperado = enviado.replace(/^'/, '');
        if (String(v) === esperado) return;

        // Las columnas de texto llevan el apóstrofo justo para que vuelvan
        // IGUALES. Si una de esas cambió, el dato se corrompió: es el caso del
        // teléfono que entra como número y pierde el +57.
        if (escapada) {
          console.log(`    ${c.rojo('✗')} ${def.columnas[i]}: se mandó ${JSON.stringify(esperado)} y quedó ${JSON.stringify(v)}`);
          mal++;
          return;
        }
        // Las de fecha van sin escapar a propósito, para que la hoja las pueda
        // ordenar y filtrar. Que Sheets las reescriba está BIEN mientras las
        // haya entendido como fecha -- y eso se sabe porque por dentro quedó un
        // número, no un texto.
        if (typeof crudas[i] === 'number') {
          console.log(`    ${c.gris('·')} ${def.columnas[i]}: ${JSON.stringify(esperado)} → ${JSON.stringify(v)} ` +
                      c.gris(`(fecha de verdad, serie ${crudas[i]})`));
          return;
        }
        console.log(`    ${c.rojo('✗')} ${def.columnas[i]}: se mandó ${JSON.stringify(esperado)} y quedó ${JSON.stringify(v)}` +
                    c.gris(` (por dentro: ${JSON.stringify(crudas[i])})`));
        mal++;
      });
      console.log(`  ${mal ? c.rojo('✗') : c.verde('✓')} ${nombre}: fila ${fila} escrita y releída, ` +
                  `${celdas.length}/${def.columnas.length} celdas${mal ? `, ${mal} distinta(s)` : ' iguales'}`);

      await sheets(':batchUpdate', 'POST', {
        requests: [{ deleteDimension: { range: {
          sheetId: existentes.get(nombre).sheetId, dimension: 'ROWS',
          startIndex: fila - 1, endIndex: fila } } }],
      });
      console.log(c.gris(`      fila de prueba borrada`));
      if (mal) process.exitCode = 1;
    }
  }

  console.log(process.exitCode
    ? c.rojo('\nLa hoja guardó algo distinto de lo que se le mandó. Mira arriba.\n')
    : c.verde('\nListo. Ya se pueden habilitar los dos nodos.\n'));
})().catch(e => { console.error(c.rojo('\n' + e.message + '\n')); process.exit(1); });

module.exports = { PESTANAS };
