#!/usr/bin/env node
//
// Copia al Excel nuevo las pestañas del libro viejo del equipo, tal cual.
//
// POR QUÉ. El libro viejo (`2025.xlsx`, en WPS) es el documento con el que el
// equipo trabaja: un calendario por sede (`CIUDAD JARDIN`, `AV 3 NTE`,
// `MUNDO FOTO`, `GRANADA`, `GRANADA GOLD`), el maestro (`2026`, `2027`) y la
// tabla de precios (`VALORES`). De todo eso, la migración del 2026-09-01 se
// llevó UNA sola cosa a la base: sede + fecha + cliente, y solo de hoy en
// adelante. Es lo que el agente necesita para no vender dos veces un sábado, y
// nada más.
//
// Esto es lo otro: que el archivo nuevo no sea un recorte del viejo, sino que
// lo contenga. Las pestañas se copian COMO ESTÁN, sin reinterpretarlas.
//
// LO QUE ESTO NO ES. No alimenta al agente. El agente lee `agenda_reservas`, y
// a la base solo llega lo que está en la pestaña `Reservas` -- la única que
// mira `workflow-sincronizar-hoja.json`. Estas pestañas son para las personas:
// copiar aquí un calendario de sede no aparta ninguna fecha. Por eso `Reservas`
// y `Citas` están protegidas más abajo y esto no las puede tocar ni por error.
//
// DE DÓNDE SALEN LOS DATOS. De un directorio con un .json por pestaña, que es
// lo que deja `scripts/leer-excel-viejo.py`:
//
//   { "titulo": "CIUDAD JARDIN", "oculta": false,
//     "filas": [["FECHA", "DIA", "CLIENTE"], ["2026-09-05", "SABADO", "..."]] }
//
// `filas` es la rejilla como se ve en pantalla, fila por fila, sin rellenar los
// huecos: una fila más corta que las demás es una fila con celdas vacías al
// final, igual que en el original. `oculta` se respeta -- el libro viejo tiene
// tres pestañas escondidas, y traerlas a la vista sería cambiar el archivo, no
// copiarlo.
//
// Los archivos se leen ORDENADOS por nombre, y por eso el guion de Python les
// pone un número delante: es el orden que tienen las pestañas en el libro. Sin
// él quedarían alfabéticas, que no es como el equipo las tiene.
//
// SE ESCRIBE EN CRUDO (valueInputOption=RAW), y es a propósito: estas pestañas
// son un calendario que lee gente, no una tabla que ordene una máquina. Con
// USER_ENTERED, Sheets reinterpretaría cada celda como si la teclearan --
// "05/09/2026" podría acabar siendo el 9 de mayo, y un "OCUPADO -" entraría
// como fórmula. Fiel gana a listo. Con `--interpretar` se puede pedir lo otro.
//
//   node --env-file=.env scripts/replicar-hojas-excel-viejo.js <directorio>
//   node --env-file=.env scripts/replicar-hojas-excel-viejo.js <directorio> --escribir

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SA = fs.existsSync('.gcp-sa-sheets.json') ? '.gcp-sa-sheets.json' : '.gcp-sa-n8n-calendar.json';
const HOJA = process.env.EXCEL_AGENDA_SHEET_ID;
const ESCRIBIR = process.argv.includes('--escribir');
const INTERPRETAR = process.argv.includes('--interpretar');
const DIR = process.argv.slice(2).find(a => !a.startsWith('--'));

// Las dos pestañas de las que dependen el bot y la sincronización. Su orden de
// columnas es un contrato -- `scripts/probar-excel.js` lo comprueba celda por
// celda -- y un volcado del libro viejo encima las dejaría irreconocibles.
const INTOCABLES = new Set(['Reservas', 'Citas']);

const c = { verde: s => `\x1b[32m${s}\x1b[0m`, rojo: s => `\x1b[31m${s}\x1b[0m`,
            ama: s => `\x1b[33m${s}\x1b[0m`, gris: s => `\x1b[90m${s}\x1b[0m`,
            neg: s => `\x1b[1m${s}\x1b[0m` };

function peticion(op, cuerpo) {
  return new Promise((res, rej) => {
    const rq = https.request(op, r => {
      const t = []; r.on('data', x => t.push(x));
      r.on('end', () => res({ codigo: r.statusCode, texto: Buffer.concat(t).toString('utf8') }));
    });
    rq.on('error', rej); if (cuerpo) rq.write(cuerpo); rq.end();
  });
}

async function token() {
  const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const n = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT' });
  const cl = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
                   aud: 'https://oauth2.googleapis.com/token', iat: n, exp: n + 3600 });
  const f = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + cl), sa.private_key).toString('base64url');
  const d = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
            '&assertion=' + encodeURIComponent(`${h}.${cl}.${f}`);
  const r = await peticion({ host: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, d);
  const j = JSON.parse(r.texto);
  if (!j.access_token) throw new Error('no dieron token: ' + r.texto.slice(0, 300));
  return j.access_token;
}

let TOKEN = null;
async function sheets(ruta, metodo = 'GET', cuerpo = null, reintentos = 4) {
  for (let i = 0; i < reintentos; i++) {
    try {
      const d = cuerpo ? JSON.stringify(cuerpo) : null;
      const r = await peticion({ host: 'sheets.googleapis.com', path: `/v4/spreadsheets/${HOJA}${ruta}`,
        method: metodo, headers: { Authorization: 'Bearer ' + TOKEN,
          ...(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}) } }, d);
      if (r.codigo >= 400) throw new Error(`HTTP ${r.codigo} en ${ruta}: ${r.texto.slice(0, 300)}`);
      return r.texto ? JSON.parse(r.texto) : null;
    } catch (e) {
      if (i === reintentos - 1) throw e;
      await new Promise(res => setTimeout(res, 2000 * (i + 1)));
    }
  }
}

const columna = (n) => {           // 3 -> "C", 27 -> "AA"
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s || 'A';
};

(async () => {
  if (!HOJA) {
    console.error('Falta EXCEL_AGENDA_SHEET_ID. Cárgalo del .env (node --env-file=.env ...).');
    process.exitCode = 1;
    return;
  }
  if (!DIR || !fs.existsSync(DIR)) {
    console.error('Uso: node --env-file=.env scripts/replicar-hojas-excel-viejo.js <directorio-con-los-json>');
    process.exitCode = 1;
    return;
  }

  const archivos = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
  if (!archivos.length) {
    console.error(`No hay ningún .json en ${DIR}.`);
    process.exitCode = 1;
    return;
  }

  const pestanas = archivos.map(f => {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    if (!j.titulo || !Array.isArray(j.filas)) {
      throw new Error(`${f}: hace falta { "titulo": "...", "filas": [[...]] }`);
    }
    if (INTOCABLES.has(j.titulo)) {
      throw new Error(`${f}: "${j.titulo}" es una pestaña del bot y no se puede sobrescribir desde aquí`);
    }
    return { archivo: f, ...j };
  });

  TOKEN = await token();
  const meta = await sheets('?fields=' + encodeURIComponent('properties.title,sheets.properties(title,sheetId,gridProperties)'));
  const existentes = new Map(meta.sheets.map(s => [s.properties.title, s.properties]));

  console.log(c.neg(`\nExcel: ${meta.properties.title}`));
  console.log(c.gris('  https://docs.google.com/spreadsheets/d/' + HOJA + '/edit'));
  console.log(c.gris(`  origen: ${DIR}`));
  console.log(c.gris(`  las celdas van ${INTERPRETAR ? 'INTERPRETADAS (USER_ENTERED)' : 'en crudo (RAW), tal como se ven'}`));

  for (const p of pestanas) {
    const filas = p.filas.length;
    const cols = Math.max(1, ...p.filas.map(f => f.length));
    const yaEsta = existentes.has(p.titulo);
    console.log(`  ${yaEsta ? c.ama('·') : c.verde('+')} ${c.neg(p.titulo)}  ` +
                (filas ? `${filas} fila(s) × ${cols} columna(s)` : c.gris('vacía')) +
                (p.oculta ? c.gris('  [oculta]') : '') +
                c.gris(yaEsta ? '  (ya existe: se vacía y se reescribe)' : '  (se crea)'));
  }

  if (!ESCRIBIR) {
    console.log(c.ama('\nEn seco. Con --escribir se copian.\n'));
    return;
  }

  for (const p of pestanas) {
    const filas = Math.max(1, p.filas.length);
    const cols = Math.max(1, ...p.filas.map(f => f.length), 1);

    if (!existentes.has(p.titulo)) {
      const r = await sheets(':batchUpdate', 'POST', {
        requests: [{ addSheet: { properties: { title: p.titulo, hidden: !!p.oculta,
          gridProperties: { rowCount: Math.max(filas + 20, 100), columnCount: Math.max(cols + 5, 26) } } } }],
      });
      existentes.set(p.titulo, r.replies[0].addSheet.properties);
    } else {
      // Se vacía primero: si el libro viejo perdió filas, quedarían colgando.
      await sheets('/values/' + encodeURIComponent(p.titulo) + ':clear', 'POST', {});
      // Y se ensancha si hace falta, que es el error que no avisa: escribir
      // fuera de la rejilla devuelve "exceeds grid limits" y ahí se acaba.
      const g = existentes.get(p.titulo).gridProperties || {};
      const peticiones = [];
      if ((g.columnCount || 0) < cols) {
        peticiones.push({ appendDimension: { sheetId: existentes.get(p.titulo).sheetId,
          dimension: 'COLUMNS', length: cols - g.columnCount } });
      }
      if ((g.rowCount || 0) < filas) {
        peticiones.push({ appendDimension: { sheetId: existentes.get(p.titulo).sheetId,
          dimension: 'ROWS', length: filas - g.rowCount } });
      }
      if (peticiones.length) await sheets(':batchUpdate', 'POST', { requests: peticiones });
      // Y se esconde o se enseña, según venga del libro viejo.
      if (!!(existentes.get(p.titulo).hidden) !== !!p.oculta) {
        await sheets(':batchUpdate', 'POST', { requests: [{ updateSheetProperties: {
          properties: { sheetId: existentes.get(p.titulo).sheetId, hidden: !!p.oculta },
          fields: 'hidden' } }] });
      }
    }

    // Una pestaña vacía se crea y ya: un PUT sin filas devuelve un 400.
    if (!p.filas.length) {
      console.log(`  ${c.verde('✓')} ${c.neg(p.titulo)}: vacía en el original, vacía aquí`);
      continue;
    }

    const rango = `${p.titulo}!A1:${columna(cols)}${filas}`;
    await sheets('/values/' + encodeURIComponent(rango) +
      `?valueInputOption=${INTERPRETAR ? 'USER_ENTERED' : 'RAW'}`, 'PUT', { values: p.filas });

    // Y ahora lo único que de verdad prueba que quedó igual: se relee lo que
    // GUARDÓ Sheets y se compara CELDA POR CELDA contra el origen. Contar filas
    // no basta -- un PUT que se come una celda del medio devuelve 200 y el mismo
    // número de filas, y el desfase no se vería hasta que alguien buscara un
    // teléfono y encontrara un abono.
    const leido = await sheets('/values/' + encodeURIComponent(p.titulo) +
                               '?valueRenderOption=UNFORMATTED_VALUE');
    const vuelta = leido.values || [];
    const celda = (rejilla, i, j) => String((rejilla[i] || [])[j] ?? '').trim();

    let distintas = 0, primera = null;
    for (let i = 0; i < filas; i++) {
      for (let j = 0; j < cols; j++) {
        const a = celda(p.filas, i, j), b = celda(vuelta, i, j);
        if (a === b) continue;
        distintas++;
        if (!primera) primera = `${columna(j + 1)}${i + 1}: origen ${JSON.stringify(a)} → hoja ${JSON.stringify(b)}`;
      }
    }

    console.log(`  ${distintas ? c.rojo('✗') : c.verde('✓')} ${c.neg(p.titulo)}: ` +
                `${filas}×${cols} celdas comparadas` +
                (distintas ? c.rojo(`, ${distintas} distinta(s)`) : ', todas iguales'));
    if (distintas) {
      console.log(c.gris('      primera diferencia — ' + primera));
      process.exitCode = 1;
    }
  }

  console.log(process.exitCode
    ? c.rojo('\nAlguna pestaña no quedó completa. Mira arriba.\n')
    : c.verde('\nListo. El archivo nuevo ya contiene las pestañas del viejo.\n'));
})().catch(e => { console.error(c.rojo('\n' + e.message + '\n')); process.exit(1); });
