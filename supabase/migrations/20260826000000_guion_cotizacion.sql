-- El guion literal de la cotizacion (2026-08-26).
--
-- Hasta hoy `inclusiones_base` y `obsequios` eran prosa corrida y el agente
-- redactaba la cotizacion a partir de ellas. El negocio pidio lo contrario: que
-- lo que llega al cliente sea SU texto, el mismo de docs/paquetes.txt, palabra
-- por palabra y con sus emojis. Un modelo que parafrasea un paquete comercial
-- termina prometiendo cosas que no estan, u omitiendo las que venden.
--
-- Por eso el texto ya formateado y ya partido en globos baja a la base:
--
--   * `mensajes_cotizacion` es el arreglo de globos de WhatsApp, en orden. Cada
--     elemento se envia tal cual, como un mensaje.
--   * `mensaje_obsequio` es el globo de obsequios, que el negocio quiere
--     separado del cuerpo de la cotizacion y justo antes de los videos.
--
-- El corte en globos NO es estetico: WhatsApp le pone "Leer mas" a un mensaje
-- largo y esconde justo lo que vende. Cada globo queda por debajo de 600
-- caracteres, y el corte cae siempre entre viñetas -- nunca dentro de una, ni
-- separando "Pasabocas dulces o salados" de sus dos sub-viñetas. Salen dos
-- globos por paquete, que es lo que pidio el negocio, salvo 15 Años y Primera
-- Comunion: son los dos paquetes largos y necesitan tres para no truncarse.
--
-- Se generaron con scripts/guion-cotizacion.js sobre docs/paquetes.txt, que
-- sigue siendo la fuente. Para cambiar un paquete se edita ese .txt y se
-- regenera; no se escribe SQL a mano.
--
-- `inclusiones_base` y `obsequios` se quedan: son la prosa que el agente
-- consulta cuando el cliente pregunta algo puntual ("¿incluye DJ?"), donde
-- mandar el guion entero seria absurdo.

alter table tipos_evento
    add column mensajes_cotizacion text[],
    add column mensaje_obsequio    text;

comment on column tipos_evento.mensajes_cotizacion is
    'Globos de WhatsApp de la cotizacion, en orden y listos para enviar tal '
    'cual. Cada elemento es un mensaje. Generado desde docs/paquetes.txt: no '
    'editar a mano ni dejar que el agente lo reescriba.';

comment on column tipos_evento.mensaje_obsequio is
    'Globo de obsequios, separado del cuerpo de la cotizacion y enviado justo '
    'antes de la tanda de videos.';

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete 15 años* 👸🏻
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

TODO INCLUIDO DE LUJO

Los salones cuentan con  aire acondicionado, Gradas para bajada de quinceañera, piso en porcelanato, amplia zona de parqueo,  🚗🚗  cielo estrellado full 🎆, además te asesoramos en todo el protocolo del evento🎊

- Mesas redondas con mantelería de lujo 🌟
- Sillas Tiffany de lujo 🪑
- Centros de mesa (DE LUJO) con flores naturales 💐
- Decoración en velos 💫$m$,
        $m$- Arco en globos orgánicos 🎈
- Torta real 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Reina de la quinceañera 👸🏻(TRONO)
- Candelabro 15 velas🕯️
- Nombre de la quinceañera en letras luminosas LED 💡 
- #15 en luces LED 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada) 😋
Champiñón dorado restaurante. 👨🏻‍🍳
- Torta envinada o de naranja 🎂
- Champaña 🍾 (Brindis para todos los invitados) 🥂$m$,
        $m$- Pasabocas dulces o salados
  * Dulces: Postres personalizados 🍭
  * Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🫗🧊 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces, humo y sonido 🔊🤩

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Vestido de 15 años (americano) 👸🏻
- Vestido de cambio 💎
- Vestido para mamá💃🏽 y traje para papá🕺🏽
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$15 Años$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete matrimonial* 👰🏽‍♀️🤵🏽
_Para que el día de tu boda sea la fecha más especial_ ✨

El salón cuenta con aire acondicionado y baños, además te asesoramos en todo el protocolo del evento🎊

*Nuestro paquete TODO INCLUIDO tiene:*

- Sillas de cristal y mesas redondas con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐
- Mesa especial para los novios ✨💎
- Cielo estrellado ✨
- Decoración  en velos 💫
- Decoración principal (altar) en flores naturales 🌻🌹y/o globos orgánicos 🎈 
- Iniciales de los novios en letras luminosas ☀️$m$,
        $m$- Love gigante ❤️‍🔥
- Torta real 🎂
- Baúl de sobres (cristal) ✨
- Plakets (Plato base) 🪙
- Vajilla tipo hotel 🍽️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta envinada o de naranja 🎂
- Champaña 🍾 (Brindis para todos los invitados) 🥂
- Pasabocas dulces o salados
  * Dulces: Postres personalizados 🍭
  * Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Vestido de novia en alquiler y velo 👰 
- Vestido de gala para el novio 🤵🏻‍♂
- Vestido de gala Adicional 🕺🏻👗
- Cojín para las argollas 💍💍
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$Matrimonio$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete Grado* 🥳🎓
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas cristal y mesas vestidas  con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐 
- Temática grado 🎓 
- Decoración en velos 💫
- Arco decorado en globos orgánicos 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Nombre del graduado en letras luminosas 💡 
- Atril para cuadro de foto 🖼️$m$,
        $m$- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂
- Pasabocas dulces y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Alquiler de vestido o traje de cóctel para el o la graduad@ 👗👔
- Vestido para dos acompañante 💃🏽🕺🏽
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$Grado$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete cumpleaños* 🥳🥳
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨
*SÚPER PROMOCIÓN EN NUESTRO NUEVO SALON DE LA 66 y GRAN SALÓN SEDE NORTE* 🤩

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas de cristal y mesas redondas con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐
- Decoración en velos 💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Especial🪑$m$,
        $m$- Nombre del cumpleañero en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂
- Pasabocas dulces y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADO

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Alquiler de vestido o traje de cóctel para el o la cumpleañer@👗👔
- Vestido para dos acompañante 💃🏽🕺🏽
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$Cumpleaños$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete Empresa* 🥳🏢
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas cristal y mesas vestidas  con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐 
- Temática empresarial 🏢
- Decoración en velos 💫
- Arco decorado en globos orgánicos 🎈
- Rincón  de fotos 📸
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Nombre de la empresa en letras luminosas y número de años 💡$m$,
        $m$- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂
- Pasabocas dulces Y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Sillas cristal 🪑
- Alquiler de 3 vestidos o traje de cóctel 👗👔
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$Empresa$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete primera comunión* ⛪🙏🏻
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨
*SÚPER PROMOCIÓN EN NUESTRO SALÓN DE LA 66 Y GRAN SALÓN SEDE NORTE* 🤩

El salón cuenta con aires acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas y mesas vestidas  con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐 
- Temática de primera comunión 🕊️$m$,
        $m$- Decoración en velos 💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Especial (silla trono ) 👸🏻🤴🏻
- Nombre de la niña o niño en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Menú infantil 🍟
- Torta real 🎂
- Helado 🍨$m$,
        $m$- Pasabocas dulces y salados 
  * Dulces: Postres personalizados 🍭
  * Salados: Mesa valluna
(Empanadas, marranitas y aborrajados)
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Alquiler de vestido o traje de primera comunión 🕯️
- Vestido para mamá💃🏽 y traje para papá🕺🏽
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$Primera Comunión$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete Baby Shower* 👼🏻🍼
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Mesas vestidas  con mantelería de lujo 🌟
- Sillas Tiffany de lujo 🪑
- Centros de mesa en flores naturales 💐 
- Temática Baby Shower
- Decoración en velos de💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Reina (silla trono ) 🤰🏼$m$,
        $m$- Nombre de la niña o niño en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Menú infantil 
- Torta real 🎂
- Pasabocas dulces y salados 
  * Dulces: Postres personalizados 🍭
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
    ],
    mensaje_obsequio = $m$Te obsequiamos ✨
- Vestido para mamá💃🏽 y traje para papá 🕺🏻
- Vestido de gala para un acompañante 🤵🏻‍♂👗
- Volcanes en pólvora fría 🎇
por obtener este paquete 🤗$m$
where nombre_paquete = $m$Baby Shower$m$;

-- Ningun paquete puede quedar sin guion: si alguno quedo en null es que el
-- nombre no caso y la cotizacion saldria vacia frente a un cliente.
do $$
declare v_faltan text;
begin
    select string_agg(nombre_paquete, ', ' order by nombre_paquete)
      into v_faltan
      from tipos_evento
     where mensajes_cotizacion is null or mensaje_obsequio is null;

    if v_faltan is not null then
        raise exception 'Paquetes sin guion de cotizacion: %', v_faltan;
    end if;
end;
$$;

alter table tipos_evento
    alter column mensajes_cotizacion set not null,
    alter column mensaje_obsequio    set not null;
