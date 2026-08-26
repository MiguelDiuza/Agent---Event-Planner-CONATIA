// Cinco conversaciones completas, con cinco clientes distintos.
//
// Los turnos del AGENTE son los que el prompt manda escribir, redactados a mano
// (la GOOGLE_GEMINI_API_KEY esta vacia en .env, asi que no se puede correr el
// modelo de verdad). Los turnos del CLIENTE son lo que se quiere probar: cada
// caso mete al menos un borde que en produccion se rompe solo.
//
// Hoy es miercoles 26 de agosto de 2026. Las fechas estan calculadas contra eso.

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
];
