// El reparto de mensajes que llegan por partes, simulado como lo hace n8n.
//
// Lo usan dos pruebas: `probar-fragmentos.js`, que lo mira de cerca, y
// `banco-pruebas.js`, que lo mete dentro de una conversación completa. Vive
// aparte para que las dos corran EXACTAMENTE el mismo reparto -- y el mismo
// código de los nodos, que se lee del .json y no se copia.
//
// La `consulta` se inyecta porque cada script trae la suya.

const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('n8n/workflow-angie-otero.json', 'utf8'));
const nodo = (nombre) => {
  const n = wf.nodes.find(x => x.name === nombre);
  if (!n) throw new Error('no existe el nodo ' + nombre);
  return n;
};

const SQL_REGISTRAR = nodo('Registrar Fragmento').parameters.query;
const SQL_RECLAMAR = nodo('Reclamar Fragmentos').parameters.query;

// El detector: todo lo que hay antes de que el nodo lea su entrada son
// constantes y funciones, y se puede evaluar suelto. Si el ancla desaparece
// esto revienta, que es justo lo que queremos.
const detector = (() => {
  const js = nodo('Detectar Fragmento').parameters.jsCode;
  const corte = js.indexOf('const entrada = $input.first().json;');
  if (corte < 0) throw new Error('`Detectar Fragmento` ya no tiene el ancla de la entrada');
  return new Function(js.slice(0, corte) + '\nreturn { esFragmento, SEGUNDOS_DE_ESPERA };')();
})();

// La Management API no acepta parámetros: $1..$n se sustituyen aquí.
function ligar(sqlTexto, params) {
  let out = sqlTexto;
  params.forEach((v, i) => {
    const lit = v === null || v === undefined ? 'null'
      : typeof v === 'number' ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
    out = out.split('$' + (i + 1)).join(lit);
  });
  return out;
}

// --------------------------------------------------------------------------
// Corre una lista de mensajes como los correría n8n y devuelve lo que le
// habría llegado al agente.
//
// Cada mensaje abre su ejecución. La que no espera reclama en el acto, antes
// de que entre el siguiente. La que espera reclama ocho segundos después,
// cuando quizá ya entraron otros. El orden de los reclamos es lo único que
// decide quién contesta, así que es lo que se simula -- sin dormir de verdad,
// que en una prueba solo sería tiempo perdido.
// --------------------------------------------------------------------------
async function repartir(consulta, telefono, mensajes, { separacionSeg = 2 } = {}) {
  const registrar = (texto) => consulta(ligar(SQL_REGISTRAR, [telefono, texto, null])).then(r => r[0]);
  const reclamar = (id) => consulta(ligar(SQL_RECLAMAR, [telefono, id]));

  const cola = [];
  const respuestas = [];

  const vencer = async (hasta) => {
    cola.sort((a, b) => a.cuando - b.cuando);
    while (cola.length && cola[0].cuando <= hasta) {
      const { id, espero } = cola.shift();
      const salida = await reclamar(id);
      if (salida.length && salida[0].fragmentos > 0) respuestas.push({ ...salida[0], espero });
    }
  };

  for (let i = 0; i < mensajes.length; i++) {
    const ahora = i * separacionSeg;
    await vencer(ahora);

    const fila = await registrar(mensajes[i]);
    const veredicto = detector.esFragmento(fila.texto, fila.pendientes);

    if (veredicto.esperar) {
      cola.push({ id: fila.id, cuando: ahora + detector.SEGUNDOS_DE_ESPERA, espero: true, motivo: veredicto.motivo });
    } else {
      const salida = await reclamar(fila.id);
      if (salida.length && salida[0].fragmentos > 0) {
        respuestas.push({ ...salida[0], espero: false, motivo: veredicto.motivo });
      }
    }
  }

  await vencer(Infinity);
  return respuestas;
}

const limpiar = (consulta, telefono) =>
  consulta(`delete from mensajes_fragmentos where telefono = '${String(telefono).replace(/'/g, "''")}'`);

const pendientes = (consulta, telefono) =>
  consulta(`select count(*)::int as n from mensajes_fragmentos
             where telefono = '${String(telefono).replace(/'/g, "''")}' and consumido_en is null`)
    .then(r => r[0].n);

module.exports = { repartir, limpiar, pendientes, detector, ligar, SQL_REGISTRAR, SQL_RECLAMAR };
