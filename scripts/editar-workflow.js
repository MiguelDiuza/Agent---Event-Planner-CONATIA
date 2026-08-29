#!/usr/bin/env node
//
// Helper para editar los .json de n8n desde un script, sin caer en la trampa.
//
// LA TRAMPA. Los .json traen los nodos y las conexiones DOS VECES: en `nodes` /
// `connections` (el borrador) y en `activeVersion.nodes` /
// `activeVersion.connections` (lo que de verdad corre). Editar uno solo deja el
// repo mintiendo, el grep pasando en verde y el VPS haciendo otra cosa. Ya
// costo una vez; esta anotado en docs/ESTADO-Y-CONTINUACION.md.
//
// Este modulo aplica cada cambio a las DOS copias, siempre, y no expone
// ninguna forma de tocar una sola. `scripts/revisar-workflows.js` vuelve a
// comprobarlo despues, que es el cinturon sobre los tirantes.
//
// No se ejecuta solo: lo cargan los scripts de migracion de workflows.

const fs = require('fs');

function cargar(ruta) {
  const w = JSON.parse(fs.readFileSync(ruta, 'utf8'));

  // Las dos copias, o una sola si el workflow todavia no tiene activeVersion
  // (le pasa a Seguimiento, que nunca se publico).
  const copias = [w];
  if (w.activeVersion && Array.isArray(w.activeVersion.nodes)) copias.push(w.activeVersion);

  const api = {
    ruta,
    json: w,
    copias,

    /** Cada version del nodo con ese nombre (una por copia). Falla si no esta. */
    nodo(nombre) {
      const encontrados = copias
        .map(c => c.nodes.find(n => n.name === nombre))
        .filter(Boolean);
      if (encontrados.length !== copias.length) {
        throw new Error(`${ruta}: el nodo "${nombre}" no esta en las ${copias.length} copias`);
      }
      return encontrados;
    },

    /** Aplica fn(nodo) a las dos copias del nodo. */
    editarNodo(nombre, fn) {
      api.nodo(nombre).forEach(fn);
      return api;
    },

    /** Reemplaza el SQL de un nodo Postgres, comprobando que el viejo estaba. */
    reemplazarEnQuery(nombre, viejo, nuevo) {
      api.editarNodo(nombre, n => {
        if (!n.parameters.query.includes(viejo)) {
          throw new Error(`${ruta} / ${nombre}: no encontre el fragmento a reemplazar`);
        }
        n.parameters.query = n.parameters.query.split(viejo).join(nuevo);
      });
      return api;
    },

    /** Agrega un nodo nuevo a las dos copias. Se clona: no comparten objeto. */
    agregarNodo(nodo) {
      if (copias[0].nodes.some(n => n.name === nodo.name)) {
        throw new Error(`${ruta}: ya existe un nodo llamado "${nodo.name}"`);
      }
      copias.forEach(c => c.nodes.push(JSON.parse(JSON.stringify(nodo))));
      return api;
    },

    /** Conecta origen[salida] -> destino, en las dos copias. */
    conectar(origen, salida, destino, tipo = 'main') {
      copias.forEach(c => {
        const con = (c.connections[origen] ||= {});
        const ramas = (con[tipo] ||= []);
        while (ramas.length <= salida) ramas.push([]);
        ramas[salida] = ramas[salida] || [];
        ramas[salida].push({ node: destino, type: tipo, index: 0 });
      });
      return api;
    },

    /** Quita la conexion origen[salida] -> destino de las dos copias. */
    desconectar(origen, salida, destino, tipo = 'main') {
      let quitadas = 0;
      copias.forEach(c => {
        const ramas = c.connections[origen] && c.connections[origen][tipo];
        if (!ramas || !ramas[salida]) return;
        const antes = ramas[salida].length;
        ramas[salida] = ramas[salida].filter(x => x.node !== destino);
        quitadas += antes - ramas[salida].length;
      });
      if (quitadas !== copias.length) {
        throw new Error(`${ruta}: no encontre la conexion ${origen}[${salida}] -> ${destino}`);
      }
      return api;
    },

    /** Mete `nuevo` entre `origen[salida]` y `destino`, en las dos copias. */
    intercalar(origen, salida, destino, nuevo) {
      api.desconectar(origen, salida, destino);
      api.conectar(origen, salida, nuevo);
      api.conectar(nuevo, 0, destino);
      return api;
    },

    guardar() {
      fs.writeFileSync(ruta, JSON.stringify(w, null, 2) + '\n', 'utf8');
      return api;
    },
  };

  return api;
}

module.exports = { cargar };
