-- El globo de obsequios, literal del negocio (2026-08-26).
--
-- Venia redactado: "Te obsequiamos ✨ / <viñetas> / por obtener este paquete".
-- Era una parafrasis mia de la instruccion del negocio, y el negocio pidio el
-- bloque tal como esta en docs/paquetes.txt:
--
--     Adicional: *OBSEQUIOS*✨
--     - ...
--     - ...
--
--     Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!
--
-- El detalle que importa: la linea del licor CIERRA este globo, no la tercera
-- parte de la cotizacion. Asi es como esta en el documento original -- los
-- obsequios y el cierre son un solo bloque contiguo al final del paquete -- y
-- asi deja de salir dos veces. Las tres partes de la cotizacion terminan ahora
-- en la ultima viñeta de inclusiones, sin cierre propio.
--
-- Efecto de rebote: al sacar esa linea de las inclusiones, el reparto en tres
-- partes se recalculo y quedo mas parejo (entre 282 y 458 caracteres).
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
- Centros de mesa (DE LUJO) con flores naturales 💐$m$,
        $m$- Decoración en velos 💫
- Arco en globos orgánicos 🎈
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
- Torta envinada o de naranja 🎂$m$,
        $m$- Champaña 🍾 (Brindis para todos los invitados) 🥂
- Pasabocas dulces o salados
  * Dulces: Postres personalizados 🍭
  * Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🫗🧊 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces, humo y sonido 🔊🤩$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Vestido de 15 años (americano) 👸🏻
- Vestido de cambio 💎
- Vestido para mamá💃🏽 y traje para papá🕺🏽
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
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
- Dj en vivo, luces y sonido 🔊🤩$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Vestido de novia en alquiler y velo 👰 
- Vestido de gala para el novio 🤵🏻‍♂
- Vestido de gala Adicional 🕺🏻👗
- Cojín para las argollas 💍💍
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
where nombre_paquete = $m$Matrimonio$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete Grado* 🥳🎓
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas cristal y mesas vestidas  con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐 
- Temática grado 🎓 
- Decoración en velos 💫$m$,
        $m$- Arco decorado en globos orgánicos 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Nombre del graduado en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂$m$,
        $m$- Pasabocas dulces y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Alquiler de vestido o traje de cóctel para el o la graduad@ 👗👔
- Vestido para dos acompañante 💃🏽🕺🏽
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
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
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴$m$,
        $m$- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂
- Pasabocas dulces y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADO$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Alquiler de vestido o traje de cóctel para el o la cumpleañer@👗👔
- Vestido para dos acompañante 💃🏽🕺🏽
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
where nombre_paquete = $m$Cumpleaños$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete Empresa* 🥳🏢
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas cristal y mesas vestidas  con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐 
- Temática empresarial 🏢
- Decoración en velos 💫$m$,
        $m$- Arco decorado en globos orgánicos 🎈
- Rincón  de fotos 📸
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Nombre de la empresa en letras luminosas y número de años 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Torta real 🎂$m$,
        $m$- Pasabocas dulces Y salados
  * Dulces: Postres personalizados 🍭
* Salados: Mesa valluna (Empanadas, aborrajados, marranitas) 🐽
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Sillas cristal 🪑
- Alquiler de 3 vestidos o traje de cóctel 👗👔
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
where nombre_paquete = $m$Empresa$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete primera comunión* ⛪🙏🏻
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨
*SÚPER PROMOCIÓN EN NUESTRO SALÓN DE LA 66 Y GRAN SALÓN SEDE NORTE* 🤩

El salón cuenta con aires acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Sillas y mesas vestidas  con mantelería de lujo 🌟
- Centros de mesa en flores naturales 💐$m$,
        $m$- Temática de primera comunión 🕊️
- Decoración en velos 💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Especial (silla trono ) 👸🏻🤴🏻
- Nombre de la niña o niño en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)
- Menú infantil 🍟$m$,
        $m$- Torta real 🎂
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
- Dj en vivo, luces y sonido 🔊🤩$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Alquiler de vestido o traje de primera comunión 🕯️
- Vestido para mamá💃🏽 y traje para papá🕺🏽
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
where nombre_paquete = $m$Primera Comunión$m$;

update tipos_evento set
    mensajes_cotizacion = array[
        $m$*Paquete Baby Shower* 👼🏻🍼
_Somos el lugar ideal para hacer de ese día tan esperado el más feliz_ ♥️✨

El salón cuenta con aire acondicionado y cielo estrellado full, además te asesoramos en todo el protocolo del evento🎊

- Mesas vestidas  con mantelería de lujo 🌟
- Sillas Tiffany de lujo 🪑
- Centros de mesa en flores naturales 💐$m$,
        $m$- Temática Baby Shower
- Decoración en velos de💫
- Arco decorado en globo orgánico 🎈
- Mesa y maqueta de torta 🎂
- Mesas vintage ⭐
- Baúl de sobres (cristal) ✨
- Silla Reina (silla trono ) 🤰🏼
- Nombre de la niña o niño en letras luminosas 💡 
- Atril para cuadro de foto 🖼️
- Comida tipo buffet🍴(2 carnes cada una de 100 gramos, arroz y ensalada)$m$,
        $m$- Menú infantil 
- Torta real 🎂
- Pasabocas dulces y salados 
  * Dulces: Postres personalizados 🍭
- Gaseosa, hielo y agua ILIMITADAS 🤑 
- Vajilla de cristal (Copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito)🍴
- Plakets (Plato base) 🪙
- Servilleta en tela 😊
- Meseros🤵🏻‍♀️🤵🏻‍♂️
- Dj en vivo, luces y sonido 🔊🤩$m$
    ],
    mensaje_obsequio = $m$Adicional: *OBSEQUIOS*✨
- Vestido para mamá💃🏽 y traje para papá 🕺🏻
- Vestido de gala para un acompañante 🤵🏻‍♂👗
- Volcanes en pólvora fría 🎇

Con nosotros lo vas a tener *TODO INCLUIDO*, excepto el licor!$m$
where nombre_paquete = $m$Baby Shower$m$;

-- Dos invariantes de este cambio: siguen siendo tres partes, y la linea del
-- licor aparece UNA sola vez por paquete, en el globo de obsequios.
do $$
declare v_mal text;
begin
    select string_agg(nombre_paquete, ', ' order by nombre_paquete)
      into v_mal
      from tipos_evento
     where array_length(mensajes_cotizacion, 1) is distinct from 3
        or mensaje_obsequio not like '%excepto el licor!'
        or array_to_string(mensajes_cotizacion, ' ') like '%excepto el licor%';

    if v_mal is not null then
        raise exception 'Paquetes con el cierre mal ubicado o sin tres partes: %', v_mal;
    end if;
end;
$$;
