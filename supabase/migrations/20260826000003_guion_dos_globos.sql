-- El guion vuelve a dos globos por paquete (2026-08-26, mismo dia).
--
-- La migracion 20260826000000 corto los paquetes con un tope de 600 caracteres
-- por globo, pensando en el "Leer mas" de WhatsApp. El tope estaba de mas y el
-- efecto fue el contrario del buscado: 15 Años y Primera Comunion salian en
-- TRES globos, y sumados a la antesala, los obsequios y los catorce videos, la
-- cotizacion llegaba como una ristra de mensajes cortos que se lee a tirones.
-- El negocio habia pedido dos, y dos es lo correcto.
--
-- Ahora el reparto no persigue un tope sino una cantidad: se busca el corte mas
-- parejo que deje el guion en exactamente dos globos. Siguen valiendo las dos
-- reglas que si importan -- el corte cae entre viñetas, nunca dentro de una ni
-- separando "Pasabocas dulces o salados" de sus sub-viñetas -- y el texto sigue
-- siendo el de docs/paquetes.txt palabra por palabra.
--
-- Los dos paquetes largos quedan en ~700 caracteres por globo. Es mas de lo que
-- toleraba el tope viejo y es deliberado: un globo de 700 se lee de corrido, y
-- si algun telefono le pone "Leer mas" es un toque, no una cotizacion partida
-- en pedazos.
--
-- Regenerado con scripts/guion-cotizacion.js sobre docs/paquetes.txt. El
-- mensaje de obsequios no cambia.

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete 15 años* 👸🏻
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

TODO INCLUIDO DE LUJO

Los salones cuentan con  aire acondicionado, Gradas para bajada de quinceañera, piso en porcelanato, amplia zona de parqueo,  🚗🚗  cielo estrellado full 🎆, además te asesoramos en todo el protocolo del evento🎊

- Mesas redondas con mantelería de lujo 🌟
- Sillas Tiffany de lujo 🪑
- Centros de mesa (DE LUJO) con flores naturales 💐
- Decoración en velos 💫
- Arco en globos orgánicos 🎈
- Torta real 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Reina de la quinceañera 👸🏻(TRONO)
- Candelabro 15 velas🕯️
- Nombre de la quinceañera en letras luminosas LED 💡$m$,
        $m$- #15 en luces LED 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada) 😋
Champiñón dorado restaurante. 👨🏻‍🍳
- Torta envinada o de naranja 🎂
- Champaña 🍾 (Brindis para todos los invitados) 🥂
- Pasabocas dulces o salados
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
- Temática de primera comunión 🕊️
- Decoración en velos 💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Especial (silla trono ) 👸🏻🤴🏻$m$,
        $m$- Nombre de la niña o niño en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Menú infantil 🍟
- Torta real 🎂
- Helado 🍨
- Pasabocas dulces y salados 
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

-- Ningun paquete puede quedar con un numero de globos distinto de dos: si algo
-- fallo, la cotizacion sale partida raro frente a un cliente y no aqui.
do $$
declare v_mal text;
begin
    select string_agg(nombre_paquete || ' (' || array_length(mensajes_cotizacion, 1) || ')', ', '
                      order by nombre_paquete)
      into v_mal
      from tipos_evento
     where array_length(mensajes_cotizacion, 1) is distinct from 2;

    if v_mal is not null then
        raise exception 'Paquetes que no quedaron en dos globos: %', v_mal;
    end if;
end;
$$;
