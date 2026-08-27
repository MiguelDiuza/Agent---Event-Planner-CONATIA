// Diez conversaciones completas, con diez clientes distintos.
//
// Los turnos del AGENTE son los que el prompt manda escribir, redactados a mano
// (la GOOGLE_GEMINI_API_KEY esta vacia en .env, asi que no se puede correr el
// modelo de verdad). Los turnos del CLIENTE son lo que se quiere probar: cada
// caso mete al menos un borde que en produccion se rompe solo.
//
// Un turno del cliente puede traer `fragmentos` en vez de un solo texto: son
// varios mensajes sueltos, y el banco los mete por el buffer REAL de la base
// para comprobar que al agente le llega UNO. Ver el caso 9.
//
// Hoy es jueves 27 de agosto de 2026. Las fechas estan calculadas contra eso.

const TIKTOK = 'https://www.tiktok.com/@christian.sierra.e?_r=1&_t=ZS-999l6N2zPM4';
const INSTAGRAM = 'https://www.instagram.com/christiansierra_planner?igsi=MWcyMmE1Z3lraHA2ZQ%3D%3D&utm_source=qr';

const SALUDO = [
  '¡Hola! Gracias por comunicarte con Christian Sierra Event Planner. Te habla Angie Otero ☺️ ¿Con quién tengo el gusto de hablar y en qué te puedo ayudar? 🤗',
];
const promo = (nombre, cierre) => [
  `¡Súper, ${nombre}! En estos momentos tenemos una súper promo de lujo TODO INCLUIDO ✨ Contamos con más de 10 salones, campestres y de cubierta cerrada, en la ciudad de Cali. ${cierre} 🤗`,
];
const REDES = ['Y si quieres ver más de nuestros eventos, síguenos en redes ✨', TIKTOK, INSTAGRAM];

// Comprobaciones que dependen de los datos y no del texto: son las que
// atrapan una migracion mal aplicada o un rotulo que cambio sin querer.
const revisarTanda = (esperaSalones, rotulos = []) => (r, anota) => {
  if (r.piezas == null) return anota('error', 'la tanda no envio nada: ' + JSON.stringify(r).slice(0, 200));
  if (r.piezas !== esperaSalones + 1)
    anota('error', `la tanda mando ${r.piezas} piezas y se esperaban ${esperaSalones + 1} (${esperaSalones} salones + promocional)`);
  if (r.globos_guion !== 5)
    anota('error', `el guion salio con ${r.globos_guion} globos y son 5: antesala + 3 partes + obsequios. ` +
      'Cero globos = el tipo_evento no resolvio y los videos salieron sin cotizacion.');
};

// La SEGUNDA cotizacion del mismo chat (2026-08-27). Tiene que salir completa y
// SIN videos: el cliente ya los tiene arriba y son los mismos catorce salones.
// Los globos son los 5 del guion mas los de la lista de valores, que reemplaza a
// los captions como unico portador del precio.
const revisarRecotizacion = (globosValores) => (r, anota) => {
  if (r.piezas !== 0)
    anota('error', `la recotizacion mando ${r.piezas} piezas y no debia mandar ninguna: los videos no se repiten`);
  if (r.globos_guion !== 5 + globosValores)
    anota('error', `la recotizacion salio con ${r.globos_guion} globos y se esperaban ${5 + globosValores}: ` +
      `antesala + 3 partes + obsequios + ${globosValores} de valores. Cero = el embudo volvio a callarse.`);
  if (!/YA salió en este turno/.test(r.resultado || ''))
    anota('error', 'el agente no recibio el aviso de que la cotizacion ya salio: ' + String(r.resultado).slice(0, 140));
};

// Un reenvio a pedido del cliente: material que ya recibio, sin guion detras.
const revisarReenvio = (piezas) => (r, anota) => {
  if (r.piezas !== piezas)
    anota('error', `el reenvio mando ${r.piezas} piezas y se esperaban ${piezas}`);
  if (r.globos_guion !== 0)
    anota('error', `el reenvio mando ${r.globos_guion} globos de cotizacion y no debia mandar ninguno: ` +
      'el cliente pidio los videos, no otra cotizacion');
};

module.exports = [

  // ------------------------------------------------------------------------
  // 1. El libreto tal cual lo escribio el negocio. Camino feliz de punta a
  //    punta: quince anios, 100 personas, escalon exacto, separa y agenda.
  // ------------------------------------------------------------------------
  {
    nombre: '1. Sofía — 15 años, 100 personas. El libreto exacto del negocio.',
    telefono: 'test-ref-1', perfil: 'Sofía',
    turnos: [
      { cliente: 'Hola estoy interesado', globos: SALUDO },

      { cliente: 'Te habla Sofía, estoy interesada en unos 15 años',
        globos: promo('Sofía', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: 'Para unas 100 personas el 10 de diciembre',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 100,
                  tipo_evento: '15 Años', nombre_cliente: 'Sofía', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'Me gustó Casa Christian',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: "Casa Christian's Ciudad Jardín", fecha: '2026-12-10' },
          revisar: (r, anota) => { if (!/^DISPONIBLE\./.test(r[0].resultado)) anota('error', 'se esperaba DISPONIBLE y llego: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          '¡Excelente elección, Sofía! Casa Christian\'s Ciudad Jardín es espectacular ✨ Te confirmo que el 10 de diciembre está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'Sí, sepárenmela por favor',
        globos: [
          'Manejamos sistema de separado para que puedas ir abonando con comodidad 🤗 ¿Me regalas tu nombre completo y un número de contacto?',
        ] },

      { cliente: 'Sofía Restrepo, 3105551234',
        tools: [{ t: 'separar_fecha_evento',
          args: { nombre_sede: "Casa Christian's Ciudad Jardín", fecha: '2026-12-10',
                  nombre_cliente: 'Sofía Restrepo', telefono_contacto: '3105551234' },
          revisar: (r, anota) => { if (!r[0] || !r[0].id_reserva) anota('error', 'el separado no dejo reserva: ' + JSON.stringify(r[0]).slice(0, 200)); } }],
        globos: [
          '¡Listo, Sofía! El 10 de diciembre queda apartado para ti en Casa Christian\'s ✨',
          '¿En qué horario tienes disponibilidad para que uno de nuestros asesores te llame? ☎️',
        ] },

      { cliente: 'Mañana en la tarde, tipo 3',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-27', hora: '15:00',
          nombre: 'Sofía Restrepo', telefono_contacto: '3105551234', detalle: 'Llamada para 15 años en Casa Christian\'s, 100 invitados' } }],
        globos: [
          'Quedó agendada tu llamada para mañana jueves 27 de agosto a las 3:00 p.m., al 3105551234 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 2. Escueto y con precio de entrada. 180 personas: siete sedes no llegan a
  //    esa capacidad y el rotulo tiene que decirlo. Objeta el precio.
  // ------------------------------------------------------------------------
  {
    nombre: '2. Édgar — matrimonio, 180 personas. Escueto, pregunta el precio de una y objeta.',
    telefono: 'test-ref-2', perfil: 'Edgar Ospina',
    turnos: [
      { cliente: 'buenas, cuanto vale un matrimonio', globos: SALUDO },

      { cliente: 'Edgar. para 180 personas',
        globos: promo('Édgar', 'Cuéntame, ¿para qué fecha estás pensando el matrimonio?') },

      { cliente: '15 de mayo del otro año',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 180,
                  tipo_evento: 'Matrimonio', nombre_cliente: 'Édgar', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'y eso por que tan caro? no hay algo mas economico',
        globos: [
          'Te entiendo, Édgar. Mira que ahí no estás pagando solo el salón: va la decoración completa, la comida tipo buffet, el DJ, los meseros y la vajilla ✨',
          'Y de obsequio van el vestido de novia con velo, el traje del novio y un vestido de gala adicional. Solo eso, alquilado aparte, se te va en varios millones 💐',
          '¿Cuál de los salones te gustó más para revisarte la disponibilidad?',
        ] },

      { cliente: 'la sede sur 66 entonces',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Sede Sur 66 Mundo Foto', fecha: '2027-05-15' } }],
        globos: [
          '¡Excelente elección, Édgar! La Sede Sur 66 es preciosa ✨ Te confirmo que el 15 de mayo de 2027 está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'no, todavia no quiero separar nada',
        globos: [
          '¡Sin problema, Édgar! Ahí queda la información 🤗',
          'Me regalas por fa un número de contacto y en qué horario tienes disponibilidad, para agendarte una cita y que uno de nuestros asesores te llame y conozcas todos nuestros servicios ☎️',
        ] },

      { cliente: '3157778899, en las mañanas',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-27', hora: '10:00',
          nombre: 'Edgar Ospina', telefono_contacto: '3157778899', detalle: 'Llamada matrimonio Sede Sur 66, 180 invitados' } }],
        globos: [
          'Quedó agendada tu llamada para mañana jueves 27 de agosto a las 10:00 a.m., al 3157778899 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 3. 55 personas: escalon intermedio, hay que redondear a 60. Y la fecha
  //    esta a tres dias, que es la rama que el agente suele cerrar mal.
  // ------------------------------------------------------------------------
  {
    nombre: '3. Katherine — grado, 55 personas (redondeo a 60) y fecha a 3 días.',
    telefono: 'test-ref-3', perfil: 'Kathe 💫',
    turnos: [
      { cliente: 'hola', globos: SALUDO },

      { cliente: 'soy Katherine, es para un grado',
        globos: promo('Katherine', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: 'somos como 55 personas, el 29 de agosto',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 60,
                  tipo_evento: 'graduacion', nombre_cliente: 'Katherine', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'me encanto Pilas Premium',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Pilas Premium', fecha: '2026-08-29' },
          revisar: (r, anota) => { if (!/FALTAN SOLO/.test(r[0].resultado)) anota('error', 'se esperaba la rama de menos de 7 dias y llego: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          '¡Excelente elección, Katherine! Pilas Premium es hermosa ✨ Te confirmo que el sábado 29 de agosto está libre en esa sede 😁',
          'Como está a la vuelta de la esquina, prefiero que cuadremos juntos el montaje y el personal para que te quede perfecto 🤗',
          '¿Prefieres que un asesor te llame hoy, o te queda mejor pasar por la sede?',
        ] },

      { cliente: 'que me llamen hoy mismo',
        globos: ['¡Perfecto, Katherine! ¿A qué número te llamo y a qué hora te sirve? ☎️'] },

      { cliente: '3201234567, a las 5 de la tarde',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-26', hora: '17:00',
          nombre: 'Katherine', telefono_contacto: '3201234567', detalle: 'Llamada grado Pilas Premium, 60 invitados, evento el 29 de agosto' } }],
        globos: [
          'Quedó agendada tu llamada para hoy miércoles 26 de agosto a las 5:00 p.m., al 3201234567 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 4. La que pregunta de todo. 200 personas (tope), duda puntual del paquete,
  //    pide redes a mitad, pregunta por un salon SIN material y llama a otro
  //    por su nombre comercial.
  // ------------------------------------------------------------------------
  {
    nombre: '4. Marcela — cumpleaños, 200 personas. Pregunta el DJ, pide redes a mitad, pregunta por Casa 5 y por "Salón Inti Raimi".',
    telefono: 'test-ref-4', perfil: 'Marce',
    turnos: [
      { cliente: 'buenas tardes', globos: SALUDO },

      { cliente: 'Marcela, quiero hacer un cumpleaños de 40',
        globos: promo('Marcela', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: 'seriamos 200 personas, el 20 de febrero',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 200,
                  tipo_evento: 'Cumpleanos', nombre_cliente: 'Marcela', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'oye y el DJ va incluido? y tienen instagram?',
        tools: [{ t: 'consultar_inclusiones_evento', args: { tipo_evento: 'cumpleanos 40' },
          revisar: (r, anota) => { if (!r[0] || !/Dj en vivo/i.test(r[0].guion_cotizacion)) anota('error', 'el guion no trae el DJ'); } }],
        globos: [
          '¡Claro que sí, Marcela! El DJ en vivo va incluido, con luces y sonido 🔊',
          ...REDES,
        ] },

      { cliente: 'vi la Casa 5 en su instagram, tienen video de esa?',
        tools: [{ t: 'consultar_precios_sedes', args: { invitados: 200 },
          revisar: (r, anota) => { if (r.some(x => x.nombre_sede === 'Casa 5')) anota('error', 'Casa 5 aparecio cotizando a 200 y solo llega a 150'); } }],
        globos: [
          'Casa 5 es divina, pero nos maneja hasta 150 invitados y ustedes son 200, así que se te quedaría corta 😕',
          '¿Alguno de los que te mandé te llamó la atención?',
        ] },

      { cliente: 'el Salon Inti Raimi, ese me gusto',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Sawa', fecha: '2027-02-20' } }],
        globos: [
          '¡Excelente elección, Marcela! Sawa es espectacular ✨ Te confirmo que el 20 de febrero de 2027 está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'si, sepamela. Marcela Ospina, 3009998877',
        tools: [{ t: 'separar_fecha_evento',
          args: { nombre_sede: 'Sawa', fecha: '2027-02-20', nombre_cliente: 'Marcela Ospina', telefono_contacto: '3009998877' } }],
        globos: [
          '¡Listo, Marcela! El 20 de febrero queda apartado para ti en Sawa ✨',
          '¿En qué horario tienes disponibilidad para que uno de nuestros asesores te llame? ☎️',
        ] },

      { cliente: 'el viernes a las 11',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-28', hora: '11:00',
          nombre: 'Marcela Ospina', telefono_contacto: '3009998877', detalle: 'Llamada cumpleaños Sawa, 200 invitados' } }],
        globos: ['Quedó agendada tu llamada para el viernes 28 de agosto a las 11:00 a.m., al 3009998877 ☎️'] },
    ],
  },

  // ------------------------------------------------------------------------
  // 5. Empresa, fecha ocupada y pide descuento. Es el caso donde el agente
  //    viejo derivaba a un asesor sin fecha ni hora.
  // ------------------------------------------------------------------------
  {
    nombre: '5. Andrés — evento de empresa, 130 personas, fecha OCUPADA y pide descuento.',
    telefono: 'test-ref-5', perfil: 'Inversiones del Pacífico S.A.S.',
    preparar: [
      `insert into agenda_reservas (sede_id, fecha_solicitada, nombre_cliente, estado)
       select id_sede, '2026-11-14'::date, 'RESERVA DE PRUEBA', 'separado'
       from sedes where nombre_sede = 'Sede Norte'
       on conflict (sede_id, fecha_solicitada) do nothing`,
    ],
    turnos: [
      { cliente: 'Hola, buenas', globos: SALUDO },

      { cliente: 'Andrés, de Inversiones del Pacífico. Es la fiesta de fin de año de la empresa',
        globos: promo('Andrés', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: '130 personas, el 14 de noviembre',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 130,
                  tipo_evento: 'Empresa', nombre_cliente: 'Andrés', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'nos gusto la Sede Norte',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Sede Norte', fecha: '2026-11-14' },
          revisar: (r, anota) => { if (!/^OCUPADA/.test(r[0].resultado)) anota('error', 'se esperaba OCUPADA y llego: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          'Uy, Andrés, esa fecha está súper solicitada y ya está tomada en la Sede Norte 😕',
          '¿Miramos el fin de semana siguiente, o la misma fecha en otra sede? No quiero que se queden sin su evento 🤗',
        ] },

      { cliente: 'listo, el 21 de noviembre entonces',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Sede Norte', fecha: '2026-11-21' },
          revisar: (r, anota) => { if (!/^DISPONIBLE\./.test(r[0].resultado)) anota('error', 'se esperaba DISPONIBLE y llego: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          '¡Buenísimo, Andrés! El sábado 21 de noviembre sí está libre en la Sede Norte ✨',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'esta muy caro, nos hacen un descuento?',
        globos: [
          'Te entiendo, Andrés. Ese valor ya lleva la decoración completa, el buffet, la torta, el DJ, los meseros y la vajilla: contratado por aparte se les iría bastante más 💼',
          'Y de obsequio van las sillas de cristal y el alquiler de tres trajes de cóctel ✨',
          'Me regalas por fa un número de contacto y en qué horario tienes disponibilidad, para agendarte una cita y que uno de nuestros asesores te llame y revisen juntos los detalles 🤗',
        ] },

      { cliente: 'llamenme el viernes a las 10, 3151112233',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-28', hora: '10:00',
          nombre: 'Andrés', telefono_contacto: '3151112233', detalle: 'Llamada evento empresa Sede Norte, 130 invitados, 21 de noviembre' } }],
        globos: [
          'Quedó agendada tu llamada para el viernes 28 de agosto a las 10:00 a.m., al 3151112233 ☎️',
          ...REDES,
        ] },
    ],
    limpiarExtra: [
      `delete from agenda_reservas where nombre_cliente = 'RESERVA DE PRUEBA'`,
    ],
  },

  // ------------------------------------------------------------------------
  // 6. DOS EVENTOS EN EL MISMO CHAT (2026-08-27). Es el pedido del negocio:
  //    el cliente cotiza los 15 de la hija y en el mismo hilo pregunta por el
  //    matrimonio del hermano. La segunda cotizacion sale COMPLETA y sin
  //    videos, con la lista de valores en texto porque los precios de 200
  //    personas no son los de 100. Antes de esto la segunda cotizacion no
  //    salia: cero filas, sin error, y el agente contestaba de memoria.
  // ------------------------------------------------------------------------
  {
    nombre: '6. Julieta — 15 años (100) y en el mismo chat un matrimonio (200). Dos cotizaciones.',
    telefono: 'test-ref-6', perfil: 'Julieta Arango',
    turnos: [
      { cliente: 'Hola buenas', globos: SALUDO },

      { cliente: 'Julieta, quiero cotizar los 15 de mi hija',
        globos: promo('Julieta', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: '100 personas, el 5 de diciembre',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 100,
                  tipo_evento: '15 Años', nombre_cliente: 'Julieta', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      // El giro. El agente NO puede reusar los 100 ni la fecha de los 15: es
      // otro evento. Vuelve a perfilar antes de cotizar.
      { cliente: 'ay espera, y de una vez me cotizas el matrimonio de mi hermano?',
        globos: [
          '¡Claro que sí, Julieta! Con gusto te armo también la del matrimonio ✨',
          'Cuéntame, ¿para cuántas personas sería y para qué fecha? 🤗',
        ] },

      { cliente: 'ellos son como 200 y seria el 14 de marzo',
        tools: [{ t: 'enviar_medios', revisar: revisarRecotizacion(2),
          args: { categoria: 'sede', referencia: 'todas', invitados: 200,
                  tipo_evento: 'Matrimonio', nombre_cliente: 'Julieta', tipo_medio: 'ambos' } }],
        globos: [
          'Los videos de cada salón te los envié un poquito más arriba en el chat ☝️ Son los mismos para los dos eventos, así que ahí los tienes.',
          'Cuéntame cuál te llamó más la atención para el matrimonio, o si prefieres te reenvío el de alguno en particular 🤗',
        ] },

      { cliente: 'para el matrimonio nos gusta Casa 74',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Casa 74', fecha: '2027-03-14' },
          revisar: (r, anota) => { if (!/^DISPONIBLE\./.test(r[0].resultado)) anota('error', 'se esperaba DISPONIBLE y llego: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          '¡Excelente elección, Julieta! Casa 74 es espectacular ✨ Te confirmo que el 14 de marzo de 2027 está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'lo hablo con ellos y te digo. Mi numero es el 3112223344, llamenme en la tarde',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-28', hora: '16:00',
          nombre: 'Julieta Arango', telefono_contacto: '3112223344', detalle: 'Llamada por dos eventos: 15 años 100 personas y matrimonio 200 personas' } }],
        globos: [
          'Quedó agendada tu llamada para el viernes 28 de agosto a las 4:00 p.m., al 3112223344 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 7. TRES COTIZACIONES Y UN VIDEO SUELTO. El mismo cliente cotiza dos
  //    eventos distintos y despues pide volver a ver UN salon. Ese reenvio va
  //    con reenviar = true y sin tipo_evento: es material, no otra cotizacion.
  // ------------------------------------------------------------------------
  {
    nombre: '7. Ricardo — 15 años (150), después un grado (80) y pide de nuevo UN video.',
    telefono: 'test-ref-7', perfil: 'Ricardo Peña',
    turnos: [
      { cliente: 'buenas noches', globos: SALUDO },

      { cliente: 'Ricardo. quiero los 15 de mi sobrina',
        globos: promo('Ricardo', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: '150 personas, 17 de abril',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 150,
                  tipo_evento: '15 Anos', nombre_cliente: 'Ricardo', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'ah y tambien el grado de mi hijo, que es aparte',
        globos: [
          '¡Con gusto, Ricardo! Te armo también la del grado ✨',
          'Cuéntame, ¿para cuántas personas y para qué fecha sería? 🤗',
        ] },

      { cliente: 'ese es mas pequeño, unas 80 personas, el 12 de junio',
        tools: [{ t: 'enviar_medios', revisar: revisarRecotizacion(1),
          args: { categoria: 'sede', referencia: 'todas', invitados: 80,
                  tipo_evento: 'graduacion', nombre_cliente: 'Ricardo', tipo_medio: 'ambos' } }],
        globos: [
          'Los salones son los mismos que te mandé arriba en el chat ☝️ Lo que cambia es el valor, porque son 80 personas.',
          'Cuéntame cuál te gustó para el grado, o dime si quieres que te reenvíe el video de alguno 🤗',
        ] },

      // El reenvio de UNA pieza. Sin reenviar = true la herramienta no devuelve
      // nada, porque ese video ya figura en envios_medios.
      { cliente: 'me reenvias el de Sawa? no lo encuentro',
        tools: [{ t: 'enviar_medios', revisar: revisarReenvio(1),
          args: { categoria: 'sede', referencia: 'Sawa', tipo_medio: 'video', reenviar: true } }],
        globos: ['Ahí te va de nuevo el de Sawa, Ricardo ✨ Es de los campestres más grandes que tenemos.'] },

      { cliente: 'ese, ese nos gusta para los 15',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Sawa', fecha: '2027-04-17' } }],
        globos: [
          '¡Excelente elección, Ricardo! Sawa es espectacular ✨ Te confirmo que el 17 de abril de 2027 está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'si porfa. Ricardo Peña, 3145556677',
        tools: [{ t: 'separar_fecha_evento',
          args: { nombre_sede: 'Sawa', fecha: '2027-04-17', nombre_cliente: 'Ricardo Peña', telefono_contacto: '3145556677' },
          revisar: (r, anota) => { if (!r[0] || !r[0].id_reserva) anota('error', 'el separado no dejo reserva: ' + JSON.stringify(r[0]).slice(0, 200)); } }],
        globos: [
          '¡Listo, Ricardo! El 17 de abril queda apartado para ti en Sawa ✨',
          '¿En qué horario tienes disponibilidad para que uno de nuestros asesores te llame? ☎️',
        ] },

      { cliente: 'el sabado por la mañana',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-29', hora: '10:30',
          nombre: 'Ricardo Peña', telefono_contacto: '3145556677', detalle: 'Llamada 15 años en Sawa el 17 de abril, 150 invitados, y grado de 80 el 12 de junio' } }],
        globos: [
          'Quedó agendada tu llamada para el sábado 29 de agosto a las 10:30 a.m., al 3145556677 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 8. LE REENVIAMOS LA TANDA ENTERA. El cliente perdio el chat de verdad.
  //    El agente primero lo manda a mirar mas arriba -- es lo barato y casi
  //    siempre alcanza -- y solo reenvia cuando el cliente insiste. Ese reenvio
  //    va SIN tipo_evento: pidio los videos, no otra cotizacion.
  // ------------------------------------------------------------------------
  {
    nombre: '8. Diana — matrimonio (150), se le borró el chat y pide TODOS los videos otra vez.',
    telefono: 'test-ref-8', perfil: 'Diana C.',
    turnos: [
      { cliente: 'hola, informacion de matrimonios porfa', globos: SALUDO },

      { cliente: 'Diana. si, es para mi matrimonio',
        globos: promo('Diana', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: '150 invitados, el 7 de noviembre',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 150,
                  tipo_evento: 'boda', nombre_cliente: 'Diana', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      // Turno SIN herramienta a proposito: primero se le aconseja subir en el
      // chat. Reenviar catorce videos es caro para el cliente -- datos, tiempo
      // y una notificacion por cada uno -- y casi siempre estaban ahi.
      { cliente: 'cambie de celular y se me borro todo el chat, me los mandas otra vez?',
        globos: [
          'Uy, Diana, qué pesar 😕 Antes de reenviártelos, sube un poquito en la conversación por fa: a veces el respaldo los trae y ahí siguen.',
          'Si no aparecen, me dices y te los reenvío todos de una 🤗',
        ] },

      { cliente: 'ya mire y no estan, mandamelos todos porfa',
        tools: [{ t: 'enviar_medios', revisar: revisarReenvio(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 150,
                  nombre_cliente: 'Diana', tipo_medio: 'ambos', reenviar: true } }],
        globos: ['Ahí van de nuevo todos, Diana ✨ Cuéntame cuál te llamó más la atención 🤗'] },

      { cliente: 'la Mansion Vallano',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Mansión Vallano', fecha: '2026-11-07' } }],
        globos: [
          '¡Excelente elección, Diana! Mansión Vallano es espectacular ✨ Te confirmo que el 7 de noviembre está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      { cliente: 'todavia no, primero quiero hablar con alguien. 3186667788, en la tarde',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-28', hora: '15:30',
          nombre: 'Diana', telefono_contacto: '3186667788', detalle: 'Llamada matrimonio Mansión Vallano, 150 invitados, 7 de noviembre' } }],
        globos: [
          'Quedó agendada tu llamada para el viernes 28 de agosto a las 3:30 p.m., al 3186667788 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 9. El que escribe por partes y da el número a medias (2026-08-27).
  //
  //    Los dos defectos que se reportaron desde producción, en la misma
  //    conversación:
  //
  //    - `fragmentos` mete los mensajes por el buffer REAL. El turno 3 son
  //      cuatro mensajes sueltos y tiene que salir UNO. Antes el agente
  //      contestaba los cuatro, uno por uno, y ninguna respuesta tenía
  //      sentido porque ninguno de los cuatro mensajes lo tenía.
  //
  //    - El número llega con ocho dígitos, que es exactamente lo que pasa
  //      cuando se le va el "enviar" antes de tiempo. Antes se aceptaba -- la
  //      regla eran siete dígitos -- y la cita quedaba agendada con un número
  //      al que nadie puede llamar. Ahora la herramienta lo devuelve y el
  //      agente lo pide otra vez.
  // ------------------------------------------------------------------------
  {
    nombre: '9. Camilo — escribe por partes y da el número a medias.',
    telefono: 'test-ref-9', perfil: 'Camilo',
    turnos: [
      { cliente: 'Hola buenas', globos: SALUDO },

      { cliente: 'Camilo, es para un matrimonio',
        globos: promo('Camilo', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      // Los cuatro pedazos del reporte, tal cual. Tienen que llegar como uno.
      { fragmentos: ['quiero', 'que sea', 'para 150', 'personas'],
        cliente: 'quiero que sea para 150 personas',
        globos: ['¿Y para qué fecha lo tienes pensado, Camilo? 🤗'] },

      { cliente: 'el 5 de diciembre',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 150,
                  tipo_evento: 'Matrimonio', nombre_cliente: 'Camilo', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      { cliente: 'me gusto la Sede Norte',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Sede Norte', fecha: '2026-12-05' },
          revisar: (r, anota) => { if (!/^DISPONIBLE\./.test(r[0].resultado)) anota('error', 'se esperaba DISPONIBLE y llegó: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          '¡Excelente elección, Camilo! La Sede Norte es espectacular ✨ Te confirmo que el 5 de diciembre está libre en esa sede 😁',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      // El número a medias. La herramienta lo rechaza y el agente lo vuelve a
      // pedir sin decirle al cliente que se equivocó.
      { cliente: 'si listo, Camilo Restrepo, 31502909',
        tools: [{ t: 'separar_fecha_evento',
          args: { nombre_sede: 'Sede Norte', fecha: '2026-12-05',
                  nombre_cliente: 'Camilo Restrepo', telefono_contacto: '31502909' },
          revisar: (r, anota) => {
            const m = r[0] || {};
            if (m.separada !== false) anota('error', 'apartó la fecha con un número de 8 dígitos: ' + JSON.stringify(m).slice(0, 160));
            if (!/8 digitos/.test(m.mensaje || '')) anota('error', 'no dijo cuántos dígitos tenía: ' + String(m.mensaje).slice(0, 140));
            if (/se equivoc|invalido|incorrecto/i.test(m.mensaje || '')) anota('error', 'el texto para el agente lo trata como un error del cliente');
          } }],
        globos: ['Creo que se me cortó el número, Camilo 🙈 ¿Me lo confirmas completo por fa?'] },

      { cliente: 'ah si perdon, 3150290928',
        tools: [{ t: 'separar_fecha_evento',
          args: { nombre_sede: 'Sede Norte', fecha: '2026-12-05',
                  nombre_cliente: 'Camilo Restrepo', telefono_contacto: '3150290928' },
          revisar: (r, anota) => {
            if ((r[0] || {}).estado_resultado !== 'separada')
              anota('error', 'con el número completo tampoco apartó: ' + JSON.stringify(r[0]).slice(0, 160));
          } }],
        globos: [
          '¡Listo, Camilo! El 5 de diciembre queda apartado a tu nombre en la Sede Norte ✨',
          'Manejamos sistema de separado para que puedas ir abonando con comodidad 🤗',
        ] },

      { cliente: 'en la tarde me queda bien',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-28', hora: '15:00',
          nombre: 'Camilo Restrepo', telefono_contacto: '3150290928', detalle: 'Llamada matrimonio Sede Norte, 150 invitados, 5 de diciembre' },
          revisar: (r, anota) => {
            if ((r[0] || {}).telefono_contacto !== '+573150290928')
              anota('error', 'el número no llegó normalizado a la cita: ' + JSON.stringify(r[0]).slice(0, 120));
          } }],
        globos: [
          'Quedó agendada tu llamada para el viernes 28 de agosto a las 3:00 p.m., al 3150290928 ☎️',
          ...REDES,
        ] },
    ],
  },

  // ------------------------------------------------------------------------
  // 10. La que da una fecha que ya pasó (2026-08-27).
  //
  //     Hoy es 27 de agosto de 2026 y la clienta dice "el 15 de marzo". No se
  //     equivocó: está pensando en el año que viene y no lo dijo. Antes el
  //     agente la tomaba tal cual -- consultaba disponibilidad de una fecha
  //     que ya pasó, que no significa nada -- o le cambiaba el año por su
  //     cuenta y la dejaba con una fecha apartada que nunca pidió.
  //
  //     Lo que se comprueba es que la herramienta devuelva las dos fechas
  //     escritas y con su día de la semana, y que no deje apartar la vieja.
  // ------------------------------------------------------------------------
  {
    nombre: '10. Ana — da una fecha que ya pasó y hay que preguntarle.',
    telefono: 'test-ref-10', perfil: 'Ana',
    turnos: [
      { cliente: 'Buenas tardes', globos: SALUDO },

      { cliente: 'Ana, quiero cotizar los 15 de mi hija',
        globos: promo('Ana', 'Cuéntame, ¿para cuántas personas tienes pensado tu evento y para qué fecha?') },

      { cliente: 'para 100 personas, el 15 de marzo',
        tools: [{ t: 'enviar_medios', revisar: revisarTanda(14),
          args: { categoria: 'sede', referencia: 'todas', invitados: 100,
                  tipo_evento: '15 Años', nombre_cliente: 'Ana', tipo_medio: 'ambos' } }],
        globos: ['Cuéntame cuál de estos salones te llamó más la atención 🤗'] },

      // Aquí es donde antes se rompía: consulta con 2026-03-15, que ya pasó.
      { cliente: 'Casa 74',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Casa 74', fecha: '2026-03-15' },
          revisar: (r, anota) => {
            const t = (r[0] || {}).resultado || '';
            if (!/YA PASO/.test(t)) anota('error', 'no detectó que la fecha ya pasó: ' + t.slice(0, 80));
            if (!/domingo 15 de marzo de 2026/.test(t)) anota('error', 'no nombra la fecha que dijo la clienta, con su día');
            if (!/lunes 15 de marzo de 2027/.test(t)) anota('error', 'no propone la misma fecha del año siguiente, con su día');
            if (!/NO la apartes/.test(t)) anota('error', 'no le prohíbe apartar esa fecha');
            if (/se equivoc|error/i.test(t)) anota('error', 'trata la fecha como un error de la clienta');
          } }],
        globos: [
          'Ay, cuéntame una cosita para no equivocarme: el domingo 15 de marzo de 2026 ya pasó ☺️ ¿Me estás hablando del lunes 15 de marzo de 2027? Confírmame y te valido de una la disponibilidad para esa fecha 🤗',
        ] },

      { cliente: 'si si, del otro año',
        tools: [{ t: 'verificar_disponibilidad_evento',
          args: { nombre_sede: 'Casa 74', fecha: '2027-03-15' },
          revisar: (r, anota) => { if (!/^DISPONIBLE\./.test(r[0].resultado)) anota('error', 'se esperaba DISPONIBLE y llegó: ' + r[0].resultado.slice(0, 60)); } }],
        globos: [
          '¡Perfecto, Ana! Te confirmo que el lunes 15 de marzo de 2027 está libre en Casa 74 ✨',
          'Recuerda que nuestra promoción está sujeta a disponibilidad de cada salón. Los salones con cubierta cerrada se separan desde $1.000.000 y los campestres desde $2.000.000.',
          '¿Te la separamos para que quede asegurada? 🤗',
        ] },

      // Y si el agente insistiera con la fecha vieja, tampoco se aparta.
      { cliente: 'si, sepáramela. Ana Lucía Gómez, 3012223344',
        tools: [
          { t: 'separar_fecha_evento',
            args: { nombre_sede: 'Casa 74', fecha: '2026-03-15',
                    nombre_cliente: 'Ana Lucía Gómez', telefono_contacto: '3012223344' },
            revisar: (r, anota) => {
              const m = r[0] || {};
              if (m.separada !== false) anota('error', 'apartó una fecha que ya pasó: ' + JSON.stringify(m).slice(0, 160));
              if (!/lunes 15 de marzo de 2027/.test(m.mensaje || '')) anota('error', 'el rechazo no propone la fecha del año siguiente');
            } },
          { t: 'separar_fecha_evento',
            args: { nombre_sede: 'Casa 74', fecha: '2027-03-15',
                    nombre_cliente: 'Ana Lucía Gómez', telefono_contacto: '3012223344' },
            revisar: (r, anota) => {
              if ((r[0] || {}).estado_resultado !== 'separada')
                anota('error', 'con la fecha buena no apartó: ' + JSON.stringify(r[0]).slice(0, 160));
            } },
        ],
        globos: [
          '¡Listo, Ana! El lunes 15 de marzo de 2027 queda apartado a tu nombre en Casa 74 ✨',
          'Manejamos sistema de separado para que puedas ir abonando con comodidad 🤗',
        ] },

      { cliente: 'mañana en la mañana',
        tools: [{ t: 'agendar_cita', args: { tipo_cita: 'llamada', fecha: '2026-08-28', hora: '10:00',
          nombre: 'Ana Lucía Gómez', telefono_contacto: '3012223344', detalle: 'Llamada 15 años Casa 74, 100 invitados, 15 de marzo de 2027' } }],
        globos: [
          'Quedó agendada tu llamada para el viernes 28 de agosto a las 10:00 a.m., al 3012223344 ☎️',
          ...REDES,
        ] },
    ],
  },
];
