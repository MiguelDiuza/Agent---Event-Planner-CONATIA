-- La cotizacion queda en TRES partes (2026-08-26, definicion final del negocio).
--
-- Este archivo cierra un ida y vuelta que vale la pena dejar escrito, porque el
-- proximo que lea las migraciones de hoy va a ver tres cortes distintos del
-- mismo texto y va a querer entender por que.
--
--   20260826000000 -- corto por un tope de 600 caracteres por globo. Salieron
--                     dos globos en cinco paquetes y tres en los dos largos.
--   20260826000003 -- se quito el tope y se forzo a dos globos parejos. Los dos
--                     paquetes largos quedaron en ~700 caracteres.
--   este archivo   -- tres partes, en todos los paquetes.
--
-- La regla del negocio no era un numero de caracteres: es que la cotizacion se
-- manda en tres partes, y que un globo normal del agente no pasa de 280. Son
-- dos cosas distintas y antes estaban mezcladas en una sola.
--
-- Con tres partes los paquetes quedan entre 307 y 483 caracteres por globo. Pasa
-- de 280 y esta bien: 280 es el techo de lo que ESCRIBE el agente, no de un
-- bloque de inclusiones que es una lista y se lee de un vistazo.
--
-- Lo que no cambia en ninguna de las tres versiones: el texto es el de
-- docs/paquetes.txt palabra por palabra, el corte cae entre viñetas y nunca
-- parte "Pasabocas dulces o salados" de sus sub-viñetas, y los obsequios van en
-- su propio globo al final.
--
-- Regenerado con scripts/guion-cotizacion.js sobre docs/paquetes.txt.

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
- Mesa especial para los novios ✨💎$m$,
        $m$- Cielo estrellado ✨
- Decoración  en velos 💫
- Decoración principal (altar) en flores naturales 🌻🌹y/o globos orgánicos 🎈 
- Iniciales de los novios en letras luminosas ☀️
- Love gigante ❤️‍🔥
- Torta real 🎂
- Baúl de sobres (cristal) ✨
- Plakets (Plato base) 🪙
- Vajilla tipo hotel 🍽️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)$m$,
        $m$- Torta envinada o de naranja 🎂
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
- Arco decorado en globos orgánicos 🎈$m$,
        $m$- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Nombre del graduado en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂
- Pasabocas dulces y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽$m$,
        $m$- Gaseosa, hielo y agua ILIMITADAS 🤑 
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

- Sillas de cristal y mesas redondas con mantelería de lujo 🌟$m$,
        $m$- Centros de mesa en flores naturales 💐
- Decoración en velos 💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Especial🪑
- Nombre del cumpleañero en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙$m$,
        $m$- Servilleta en tela 😊
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
- Arco decorado en globos orgánicos 🎈$m$,
        $m$- Rincón  de fotos 📸
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Nombre de la empresa en letras luminosas y número de años 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂
- Pasabocas dulces Y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽$m$,
        $m$- Gaseosa, hielo y agua ILIMITADAS 🤑 
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
- Temática Baby Shower$m$,
        $m$- Decoración en velos de💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Reina (silla trono ) 🤰🏼
- Nombre de la niña o niño en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Menú infantil 
- Torta real 🎂$m$,
        $m$- Pasabocas dulces y salados 
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

-- Tres partes en todos, sin excepcion: si alguno quedo distinto, la cotizacion
-- sale partida raro frente a un cliente y no aqui.
do $$
declare v_mal text;
begin
    select string_agg(nombre_paquete || ' (' || array_length(mensajes_cotizacion, 1) || ')', ', '
                      order by nombre_paquete)
      into v_mal
      from tipos_evento
     where array_length(mensajes_cotizacion, 1) is distinct from 3;

    if v_mal is not null then
        raise exception 'Paquetes que no quedaron en tres partes: %', v_mal;
    end if;
end;
$$;
