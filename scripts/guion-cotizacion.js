const fs = require('fs');
const GLOBOS = 3;   // tres partes por cotizacion: es lo que pidio el negocio
const NOMBRE_DB = {
  'Paquete 15 años': '15 Años',
  'Paquete matrimonial': 'Matrimonio',
  'Paquete Grado': 'Grado',
  'Paquete cumpleaños': 'Cumpleaños',
  'Paquete Empresa': 'Empresa',
  'Paquete primera comunión': 'Primera Comunión',
  'Paquete Baby Shower': 'Baby Shower',
};
// Cabecera, cierre y remate del globo de obsequios (2026-08-26). Los tres son
// literales del negocio y viven en docs/paquetes.txt: aqui estan para
// reconocerlos al parsear y para volver a armarlos al emitir.
const CABECERA = 'Te OBSEQUIAMOS ✨';
const CIERRE = '(Con nosotros lo vas a tener TODO INCLUIDO, excepto el licor!)';
const REMATE = 'Por obtener este paquete✨️';

const crudo = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const bloques = crudo.split(/\n-{4,}\n/)
  .map(b => b.replace(/^\s*Paquetes\.\s*/, '').trim())
  .filter(b => /^\*Paquete/.test(b));

const paquetes = bloques.map(b => {
  const lineas = b.split('\n');
  const titulo = lineas[0].replace(/^\*/, '').replace(/\*.*$/, '').trim();
  const nombre = NOMBRE_DB[titulo];
  if (!nombre) throw new Error('titulo sin mapeo: ' + JSON.stringify(titulo));

  const iPrimera = lineas.findIndex(l => /^- /.test(l));
  const iObsequios = lineas.findIndex(l => l.trim() === CABECERA);
  if (iPrimera < 0 || iObsequios < 0) throw new Error('estructura inesperada en ' + titulo);

  // Un item = la linea "- ..." mas sus continuaciones (sub-vinetas y renglones
  // sueltos). Agrupar asi es lo que impide que "* Dulces:" quede huerfano en
  // otro globo, separado de su "- Pasabocas".
  const agrupar = ls => ls.reduce((acc, l) => {
    if (/^- /.test(l)) acc.push(l);
    else if (l.trim() !== '' && acc.length) acc[acc.length - 1] += '\n' + l;
    return acc;
  }, []);

  return {
    nombre,
    encabezado: lineas.slice(0, iPrimera).join('\n').trim(),
    items: agrupar(lineas.slice(iPrimera, iObsequios)),
    // Fuera el cierre y el remate: agrupar() pega toda linea no vacia al item
    // anterior, asi que sin filtrarlos colgarian de la ultima viñeta.
    obsequios: agrupar(lineas.slice(iObsequios + 1)
      .filter(l => l.trim() !== CIERRE && l.trim() !== REMATE)),
  };
});

// Empaqueta en globos sin partir un item, con el encabezado ya dentro del
// primero y el cierre como un item mas al final. Devuelve null si algun item
// suelto no cabe en el limite pedido.
function empaquetar(encabezado, items, limite) {
  const partes = [encabezado];
  for (const it of items) {
    const candidato = partes[partes.length - 1] + '\n' + it;
    if (candidato.length <= limite) partes[partes.length - 1] = candidato;
    else if (it.length <= limite) partes.push(it);
    else return null;
  }
  return partes;
}

const salida = paquetes.map(p => {
  // El cierre NO va aqui: es la ultima linea del globo de obsequios, igual que
  // en docs/paquetes.txt. Tenerlo en los dos lados lo mandaba repetido.
  const items = p.items;
  const encabezado = p.encabezado + '\n';
  const total = encabezado.length + items.reduce((a, i) => a + i.length + 1, 0);

  // Se busca el limite mas bajo que todavia deja el guion en GLOBOS globos. No
  // es lo mismo que repartir a ojo: asi los dos quedan parejos, en vez de un
  // primero lleno y un ultimo con dos renglones sueltos.
  let lo = Math.max(encabezado.length, ...items.map(i => i.length));
  let hi = total, mejor = null;
  while (lo <= hi) {
    const medio = Math.floor((lo + hi) / 2);
    const intento = empaquetar(encabezado, items, medio);
    if (intento && intento.length <= GLOBOS) { mejor = intento; hi = medio - 1; }
    else lo = medio + 1;
  }
  if (!mejor) throw new Error('no se pudo repartir ' + p.nombre + ' en ' + GLOBOS + ' globos');

  return {
    nombre: p.nombre,
    partes: mejor.map(x => x.trim()),
    // Literal del negocio: cabecera, viñetas, cierre y remate, tal cual.
    obsequio: CABECERA + '\n' + p.obsequios.join('\n') + '\n\n' + CIERRE + '\n\n' + REMATE,
  };
});

if (process.argv[3] === '--sql') {
  const esc = s => { let t = 'm'; while (s.includes('$' + t + '$')) t += 'm'; return '$' + t + '$' + s + '$' + t + '$'; };
  salida.forEach(p => {
    console.log('update tipos_evento set');
    console.log('    mensajes_cotizacion = array[');
    console.log(p.partes.map(x => '        ' + esc(x)).join(',\n'));
    console.log('    ],');
    console.log('    mensaje_obsequio = ' + esc(p.obsequio));
    console.log('where nombre_paquete = ' + esc(p.nombre) + ';');
    console.log();
  });
} else if (process.argv[3] === '--sql-obsequios') {
  // Solo el globo de obsequios, sin tocar mensajes_cotizacion. Sirve cuando el
  // negocio reescribe el cierre pero el detalle del paquete sigue igual.
  const esc = s => { let t = 'm'; while (s.includes('$' + t + '$')) t += 'm'; return '$' + t + '$' + s + '$' + t + '$'; };
  salida.forEach(p => {
    console.log('update tipos_evento set mensaje_obsequio = ' + esc(p.obsequio));
    console.log('where nombre_paquete = ' + esc(p.nombre) + ';');
    console.log();
  });
} else if (process.argv[3] === '--ver') {
  salida.filter(p => !process.argv[4] || p.nombre === process.argv[4]).forEach(p => {
    p.partes.forEach((x, i) => console.log('----- globo ' + (i + 1) + ' (' + x.length + ' chars) -----\n' + x + '\n'));
    console.log('----- obsequio (' + p.obsequio.length + ' chars) -----\n' + p.obsequio + '\n');
  });
} else {
  salida.forEach(p => {
        console.log(p.nombre.padEnd(18) + p.partes.length + ' globos + obsequio  ->  ' +
      p.partes.map(x => x.length).join(' / ') + '  | obsequio ' + p.obsequio.length);
  });
}
