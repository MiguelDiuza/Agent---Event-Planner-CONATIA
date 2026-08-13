-- Datos semilla del catálogo comercial.
-- Fuentes: docs/paquetes.txt, docs/paquetes todo incluido.txt,
-- docs/pirotecnia.txt, docs/Paquete Focus Art & Christian Sierra.pdf

insert into sedes (nombre_sede, incluye_pista_cristal) values
    ('Sede Sur 66 Mundo Foto', false),
    ('Sede Norte', true),
    ('Sede Granada Gold', true),
    ('Pilas Premium', false),
    ('Casa Christian''s Ciudad Jardín', true),
    ('Gran Salón', false),
    ('Valdemoro', false),
    ('Casa 74', false),
    ('Casa 4', false),
    ('Mansión Vallano', false),
    ('Marquez De Loyola', false),
    ('Orquideorama', false),
    ('Sawa', false),
    ('Hacienda El Talismán', false),
    ('Casa 5', false);

insert into precios_sedes (sede_id, capacidad_invitados, precio_total)
select s.id_sede, p.capacidad, p.precio
from (values
    -- 50 personas
    ('Sede Sur 66 Mundo Foto', 50, 6500000),
    ('Sede Norte', 50, 7000000),
    ('Sede Granada Gold', 50, 7000000),
    ('Pilas Premium', 50, 8500000),
    ('Casa Christian''s Ciudad Jardín', 50, 9500000),
    ('Casa 74', 50, 11800000),
    ('Casa 4', 50, 11800000),
    ('Mansión Vallano', 50, 11800000),
    ('Marquez De Loyola', 50, 11800000),
    ('Orquideorama', 50, 11800000),
    ('Sawa', 50, 11800000),
    ('Hacienda El Talismán', 50, 11800000),
    ('Casa 5', 50, 12000000),
    -- 60 personas
    ('Sede Sur 66 Mundo Foto', 60, 6900000),
    ('Sede Norte', 60, 7400000),
    ('Sede Granada Gold', 60, 7500000),
    ('Pilas Premium', 60, 9000000),
    ('Casa Christian''s Ciudad Jardín', 60, 10000000),
    ('Casa 74', 60, 12600000),
    ('Casa 4', 60, 12600000),
    ('Mansión Vallano', 60, 12600000),
    ('Marquez De Loyola', 60, 12600000),
    ('Orquideorama', 60, 12600000),
    ('Sawa', 60, 12600000),
    ('Hacienda El Talismán', 60, 12600000),
    ('Casa 5', 60, 12700000),
    -- 70 personas
    ('Sede Sur 66 Mundo Foto', 70, 7300000),
    ('Sede Norte', 70, 7800000),
    ('Sede Granada Gold', 70, 8000000),
    ('Pilas Premium', 70, 9500000),
    ('Casa Christian''s Ciudad Jardín', 70, 10500000),
    ('Casa 74', 70, 13200000),
    ('Casa 4', 70, 13200000),
    ('Mansión Vallano', 70, 13200000),
    ('Marquez De Loyola', 70, 13200000),
    ('Orquideorama', 70, 13200000),
    ('Sawa', 70, 13200000),
    ('Hacienda El Talismán', 70, 13200000),
    ('Casa 5', 70, 13400000),
    -- 80 personas
    ('Sede Sur 66 Mundo Foto', 80, 7700000),
    ('Sede Norte', 80, 8200000),
    ('Sede Granada Gold', 80, 8500000),
    ('Pilas Premium', 80, 10000000),
    ('Casa Christian''s Ciudad Jardín', 80, 11000000),
    ('Casa 74', 80, 13800000),
    ('Casa 4', 80, 13800000),
    ('Mansión Vallano', 80, 13800000),
    ('Marquez De Loyola', 80, 13800000),
    ('Orquideorama', 80, 13800000),
    ('Sawa', 80, 13800000),
    ('Hacienda El Talismán', 80, 13800000),
    ('Casa 5', 80, 14100000),
    -- 90 personas
    ('Sede Sur 66 Mundo Foto', 90, 8100000),
    ('Sede Norte', 90, 8600000),
    ('Sede Granada Gold', 90, 9000000),
    ('Pilas Premium', 90, 10500000),
    ('Casa Christian''s Ciudad Jardín', 90, 11500000),
    ('Casa 74', 90, 14400000),
    ('Casa 4', 90, 14400000),
    ('Mansión Vallano', 90, 14400000),
    ('Marquez De Loyola', 90, 14400000),
    ('Orquideorama', 90, 14400000),
    ('Sawa', 90, 14400000),
    ('Hacienda El Talismán', 90, 14400000),
    ('Casa 5', 90, 14800000),
    -- 100 personas
    ('Sede Sur 66 Mundo Foto', 100, 8500000),
    ('Sede Norte', 100, 9000000),
    ('Sede Granada Gold', 100, 9500000),
    ('Pilas Premium', 100, 11000000),
    ('Casa Christian''s Ciudad Jardín', 100, 12000000),
    ('Gran Salón', 100, 13000000),
    ('Valdemoro', 100, 13000000),
    ('Casa 74', 100, 15000000),
    ('Casa 4', 100, 15000000),
    ('Mansión Vallano', 100, 15000000),
    ('Marquez De Loyola', 100, 15000000),
    ('Orquideorama', 100, 15000000),
    ('Sawa', 100, 15000000),
    ('Hacienda El Talismán', 100, 15000000),
    ('Casa 5', 100, 15500000),
    -- 110 personas
    ('Sede Sur 66 Mundo Foto', 110, 9300000),
    ('Sede Norte', 110, 9800000),
    ('Sede Granada Gold', 110, 10300000),
    ('Pilas Premium', 110, 11800000),
    ('Casa Christian''s Ciudad Jardín', 110, 13000000),
    ('Gran Salón', 110, 14000000),
    ('Valdemoro', 110, 14000000),
    ('Casa 74', 110, 16000000),
    ('Casa 4', 110, 16000000),
    ('Mansión Vallano', 110, 16000000),
    ('Marquez De Loyola', 110, 16000000),
    ('Orquideorama', 110, 16000000),
    ('Sawa', 110, 16000000),
    ('Hacienda El Talismán', 110, 16000000),
    ('Casa 5', 110, 16500000),
    -- 120 personas
    ('Sede Sur 66 Mundo Foto', 120, 10000000),
    ('Sede Norte', 120, 10600000),
    ('Sede Granada Gold', 120, 11100000),
    ('Pilas Premium', 120, 12400000),
    ('Casa Christian''s Ciudad Jardín', 120, 14000000),
    ('Gran Salón', 120, 15000000),
    ('Valdemoro', 120, 15000000),
    ('Casa 74', 120, 17000000),
    ('Casa 4', 120, 17000000),
    ('Mansión Vallano', 120, 17000000),
    ('Marquez De Loyola', 120, 17000000),
    ('Orquideorama', 120, 17000000),
    ('Sawa', 120, 17000000),
    ('Hacienda El Talismán', 120, 17000000),
    ('Casa 5', 120, 17500000),
    -- 130 personas
    ('Sede Sur 66 Mundo Foto', 130, 10800000),
    ('Sede Norte', 130, 11400000),
    ('Sede Granada Gold', 130, 11900000),
    ('Pilas Premium', 130, 13200000),
    ('Casa Christian''s Ciudad Jardín', 130, 15000000),
    ('Gran Salón', 130, 16000000),
    ('Valdemoro', 130, 16000000),
    ('Casa 74', 130, 18000000),
    ('Casa 4', 130, 18000000),
    ('Mansión Vallano', 130, 18000000),
    ('Marquez De Loyola', 130, 18000000),
    ('Orquideorama', 130, 18000000),
    ('Sawa', 130, 18000000),
    ('Hacienda El Talismán', 130, 18000000),
    ('Casa 5', 130, 18500000),
    -- 140 personas
    ('Sede Sur 66 Mundo Foto', 140, 11500000),
    ('Sede Norte', 140, 12200000),
    ('Sede Granada Gold', 140, 12400000),
    ('Pilas Premium', 140, 14000000),
    ('Casa Christian''s Ciudad Jardín', 140, 16000000),
    ('Gran Salón', 140, 17000000),
    ('Valdemoro', 140, 17000000),
    ('Casa 74', 140, 19000000),
    ('Casa 4', 140, 19000000),
    ('Mansión Vallano', 140, 19000000),
    ('Marquez De Loyola', 140, 19000000),
    ('Orquideorama', 140, 19000000),
    ('Sawa', 140, 19000000),
    ('Hacienda El Talismán', 140, 19000000),
    ('Casa 5', 140, 19500000),
    -- 150 personas
    ('Sede Sur 66 Mundo Foto', 150, 12000000),
    ('Sede Norte', 150, 13000000),
    ('Sede Granada Gold', 150, 13000000),
    ('Pilas Premium', 150, 14800000),
    ('Casa Christian''s Ciudad Jardín', 150, 17000000),
    ('Gran Salón', 150, 18000000),
    ('Valdemoro', 150, 18000000),
    ('Casa 74', 150, 20000000),
    ('Casa 4', 150, 20000000),
    ('Mansión Vallano', 150, 20000000),
    ('Marquez De Loyola', 150, 20000000),
    ('Orquideorama', 150, 20000000),
    ('Sawa', 150, 20000000),
    ('Hacienda El Talismán', 150, 20000000),
    ('Casa 5', 150, 20500000),
    -- 160 personas
    ('Pilas Premium', 160, 15600000),
    ('Casa Christian''s Ciudad Jardín', 160, 18000000),
    ('Gran Salón', 160, 19000000),
    ('Valdemoro', 160, 19000000),
    ('Casa 4', 160, 21000000),
    ('Orquideorama', 160, 21000000),
    ('Sawa', 160, 21000000),
    ('Hacienda El Talismán', 160, 21000000),
    -- 170 personas
    ('Pilas Premium', 170, 16400000),
    ('Casa Christian''s Ciudad Jardín', 170, 19000000),
    ('Gran Salón', 170, 20000000),
    ('Valdemoro', 170, 20000000),
    ('Casa 4', 170, 22000000),
    ('Orquideorama', 170, 22000000),
    ('Sawa', 170, 22000000),
    ('Hacienda El Talismán', 170, 22000000),
    -- 180 personas
    ('Pilas Premium', 180, 17200000),
    ('Casa Christian''s Ciudad Jardín', 180, 20000000),
    ('Gran Salón', 180, 21000000),
    ('Valdemoro', 180, 21000000),
    ('Casa 4', 180, 23000000),
    ('Orquideorama', 180, 23000000),
    ('Sawa', 180, 23000000),
    ('Hacienda El Talismán', 180, 23000000),
    -- 190 personas
    ('Pilas Premium', 190, 18000000),
    ('Casa Christian''s Ciudad Jardín', 190, 21000000),
    ('Gran Salón', 190, 22000000),
    ('Valdemoro', 190, 22000000),
    ('Casa 4', 190, 24000000),
    ('Orquideorama', 190, 24000000),
    ('Sawa', 190, 24000000),
    ('Hacienda El Talismán', 190, 24000000),
    -- 200 personas
    ('Pilas Premium', 200, 18800000),
    ('Casa Christian''s Ciudad Jardín', 200, 22000000),
    ('Gran Salón', 200, 23000000),
    ('Valdemoro', 200, 23000000),
    ('Casa 4', 200, 25000000),
    ('Orquideorama', 200, 25000000),
    ('Sawa', 200, 25000000),
    ('Hacienda El Talismán', 200, 25000000)
) as p(nombre_sede, capacidad, precio)
join sedes s on s.nombre_sede = p.nombre_sede;

insert into tipos_evento (nombre_paquete, inclusiones_base, obsequios, excepciones) values
(
    '15 Años',
    'Salones con aire acondicionado, gradas para bajada de quinceañera, piso en porcelanato, amplia zona de parqueo, cielo estrellado full y asesoría en todo el protocolo del evento. Mesas redondas con mantelería de lujo. Sillas Tiffany de lujo. Centros de mesa de lujo con flores naturales. Decoración en velos. Arco en globos orgánicos. Torta real. Mesas vintage. Baúl de sobres (cristal). Silla Reina de la quinceañera (trono). Candelabro 15 velas. Nombre de la quinceañera en letras luminosas LED. #15 en luces LED. Atril para cuadro de foto. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada) del restaurante Champiñón Dorado. Torta envinada o de naranja. Champaña para brindis de todos los invitados. Pasabocas dulces (postres personalizados) o salados (mesa valluna: empanadas, aborrajados, marranitas). Gaseosa, hielo y agua ilimitadas. Vajilla de cristal (copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito). Plakets (plato base). Servilleta en tela. Meseros. DJ en vivo, luces, humo y sonido.',
    'Vestido de 15 años (americano). Vestido de cambio. Vestido para mamá y traje para papá. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
),
(
    'Matrimonio',
    'Salón con aire acondicionado y baños, y asesoría en todo el protocolo del evento. Sillas de cristal y mesas redondas con mantelería de lujo. Centros de mesa en flores naturales. Mesa especial para los novios. Cielo estrellado. Decoración en velos. Decoración principal (altar) en flores naturales y/o globos orgánicos. Iniciales de los novios en letras luminosas. Love gigante. Torta real. Baúl de sobres (cristal). Plakets (plato base). Vajilla tipo hotel. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada). Torta envinada o de naranja. Champaña para brindis de todos los invitados. Pasabocas dulces (postres personalizados) o salados (mesa valluna: empanadas, aborrajados, marranitas). Gaseosa, hielo y agua ilimitadas. Meseros. DJ en vivo, luces y sonido.',
    'Vestido de novia en alquiler y velo. Vestido de gala para el novio. Vestido de gala adicional. Cojín para las argollas. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
),
(
    'Grado',
    'Salón con aire acondicionado y cielo estrellado full, y asesoría en todo el protocolo del evento. Sillas de cristal y mesas vestidas con mantelería de lujo. Centros de mesa en flores naturales. Temática de grado. Decoración en velos. Arco decorado en globos orgánicos. Mesa y maqueta de torta. Mesas vintage. Baúl de sobres (cristal). Nombre del graduado en letras luminosas. Atril para cuadro de foto. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada). Torta real. Pasabocas dulces (postres personalizados) y salados (mesa valluna: empanadas, aborrajados, marranitas). Gaseosa, hielo y agua ilimitadas. Vajilla de cristal (copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito). Plakets (plato base). Servilleta en tela. Meseros. DJ en vivo, luces y sonido.',
    'Alquiler de vestido o traje de cóctel para el o la graduad@. Vestido para dos acompañantes. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
),
(
    'Cumpleaños',
    'Súper promoción en el nuevo salón de la 66 y Gran Salón Sede Norte. Salón con aire acondicionado y cielo estrellado full, y asesoría en todo el protocolo del evento. Sillas de cristal y mesas redondas con mantelería de lujo. Centros de mesa en flores naturales. Decoración en velos. Arco decorado en globo orgánico. Mesa y maqueta de torta. Mesas vintage. Baúl de sobres (cristal). Silla especial. Nombre del cumpleañero en letras luminosas. Atril para cuadro de foto. Vajilla de cristal (copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito). Plakets (plato base). Servilleta en tela. Meseros. DJ en vivo, luces y sonido. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada). Torta real. Pasabocas dulces (postres personalizados) y salados (mesa valluna: empanadas, aborrajados, marranitas). Gaseosa, hielo y agua ilimitadas.',
    'Alquiler de vestido o traje de cóctel para el o la cumpleañer@. Vestido para dos acompañantes. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
),
(
    'Empresa',
    'Salón con aire acondicionado y cielo estrellado full, y asesoría en todo el protocolo del evento. Sillas de cristal y mesas vestidas con mantelería de lujo. Centros de mesa en flores naturales. Temática empresarial. Decoración en velos. Arco decorado en globos orgánicos. Rincón de fotos. Mesa y maqueta de torta. Mesas vintage. Nombre de la empresa en letras luminosas y número de años. Atril para cuadro de foto. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada). Torta real. Pasabocas dulces (postres personalizados) y salados (mesa valluna: empanadas, aborrajados, marranitas). Gaseosa, hielo y agua ilimitadas. Vajilla de cristal (copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito). Plakets (plato base). Servilleta en tela. Meseros. DJ en vivo, luces y sonido.',
    'Sillas de cristal. Alquiler de 3 vestidos o trajes de cóctel. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
),
(
    'Primera Comunión',
    'Súper promoción en el salón de la 66 y Gran Salón Sede Norte. Salón con aire acondicionado y cielo estrellado full, y asesoría en todo el protocolo del evento. Sillas y mesas vestidas con mantelería de lujo. Centros de mesa en flores naturales. Temática de primera comunión. Decoración en velos. Arco decorado en globo orgánico. Mesa y maqueta de torta. Mesas vintage. Baúl de sobres (cristal). Silla especial (silla trono). Nombre de la niña o niño en letras luminosas. Atril para cuadro de foto. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada). Menú infantil. Torta real. Helado. Pasabocas dulces (postres personalizados) y salados (mesa valluna: empanadas, marranitas y aborrajados). Gaseosa, hielo y agua ilimitadas. Vajilla de cristal (copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito). Plakets (plato base). Servilleta en tela. Meseros. DJ en vivo, luces y sonido.',
    'Alquiler de vestido o traje de primera comunión. Vestido para mamá y traje para papá. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
),
(
    'Baby Shower',
    'Salón con aire acondicionado y cielo estrellado full, y asesoría en todo el protocolo del evento. Mesas vestidas con mantelería de lujo. Sillas Tiffany de lujo. Centros de mesa en flores naturales. Temática de baby shower. Decoración en velos. Arco decorado en globo orgánico. Mesa y maqueta de torta. Mesas vintage. Baúl de sobres (cristal). Silla Reina (silla trono). Nombre de la niña o niño en letras luminosas. Atril para cuadro de foto. Comida tipo buffet (2 carnes de 100 gramos cada una, arroz y ensalada). Menú infantil. Torta real. Pasabocas dulces (postres personalizados). Gaseosa, hielo y agua ilimitadas. Vajilla de cristal (copa, vaso, plato buffet, plato tortero, tenedor, cuchillo, tenedorcito). Plakets (plato base). Servilleta en tela. Meseros. DJ en vivo, luces y sonido.',
    'Vestido para mamá y traje para papá. Vestido de gala para un acompañante. Volcanes en pólvora fría.',
    'TODO INCLUIDO, excepto el licor.'
);

insert into servicios_adicionales_upselling (servicio, precio, detalles, promociones) values
(
    'Paquete Full Fotografía (Focus Art)',
    2100000,
    'Fotografía y video profesional de 7:00 p.m. a 1:00 a.m., con entrega de todas las capturas exitosas editadas en formato digital. Photobook de 20x60 cm con 10 páginas (capacidad para 30 fotos aprox.). Video calidad Full HD editado con los momentos más importantes de la fiesta (30 a 60 min. según la dinámica del evento). Obsequios: sesión Pre-XV de aprox. 1,5 horas (incluye 15 fotos digitales con edición completa), retablo de bienvenida con base de madera de 50x70 cm para la recepción, y video pase fotográfico con fotos del nacimiento a la actualidad para proyectar durante la fiesta (no incluye proyector ni pantalla). El material digital se entrega mediante link de descarga en aprox. 20 días hábiles.',
    'Precio promocional de $2.100.000 (antes $2.200.000). Reserva con el 50% del total; el saldo debe estar cubierto máximo 10 días antes del evento. Si se cancela el 100% al momento de reservar con mínimo 60 días de anticipación, se obsequian tomas con drone para la sesión Pre-XV (sujeto a condiciones climáticas y restricciones legales de la zona). En caso de cancelación o aplazamiento por parte del cliente, el dinero abonado no es reembolsable.'
),
(
    'Paquete Deluxe Fotografía (Focus Art)',
    2500000,
    'Fotografía y video profesional de 7:00 p.m. a 2:00 a.m., con entrega en formato digital de todas las capturas exitosas del evento. Photobook de 30x60 cm con 14 páginas (capacidad para 60 fotos aprox.). Video calidad Full HD multi-cam editado con los momentos más importantes de la fiesta (30 a 60 min. según la dinámica del evento). Obsequios: sesión Pre-XV de hasta 2,5 horas (incluye 25 fotos digitales con edición completa), tráiler cinematográfico, tomas aéreas con drone (sujeto a condiciones climáticas y restricciones de seguridad o privacidad), retablo de bienvenida con base de madera de 50x70 cm, y video pase fotográfico con fotos desde el nacimiento hasta la actualidad (incluye proyector y pantalla de 2 mts.). El material digital se entrega mediante link de descarga en aprox. 30 días hábiles.',
    'Precio promocional de $2.500.000 (antes $2.700.000). Reserva con el 50% del total; el saldo debe estar cubierto máximo 10 días antes del evento. Si se cancela el 100% al momento de reservar con mínimo 60 días de anticipación, se obsequian tomas con drone para la sesión Pre-XV. En caso de cancelación o aplazamiento por parte del cliente, el dinero abonado no es reembolsable.'
),
(
    'Pirotecnia Show',
    1550000,
    'Acompañamiento completo, 5 bailarines, show sorpresa, hora loca con show de baile e implementos.',
    null
),
(
    'Tarjetas de Invitación Digital',
    200000,
    'Tarjetas de invitación digital para el evento. Precio a partir de $200.000.',
    null
),
(
    'Retablo extra',
    200000,
    'Retablo adicional con base de madera. Precio a partir de $200.000.',
    null
),
(
    'Photobook extra',
    250000,
    'Photobook adicional. Precio a partir de $250.000.',
    null
),
(
    'Tomas Aéreas con Drone',
    350000,
    'Tomas aéreas con drone, sujetas a condiciones climáticas y restricciones legales de la zona (aeropuertos o zonas privadas). Precio a partir de $350.000.',
    'Se obsequian gratis con el Paquete Deluxe, o con cualquier paquete de fotografía si se paga el 100% con mínimo 60 días de anticipación.'
),
(
    'Servicio de Proyector + Pantalla',
    200000,
    'Proyector y pantalla para el video pase de fotografías durante la fiesta.',
    null
),
(
    'Hora Extra (Sesión Pre-XV o cubrimiento en fiesta)',
    180000,
    'Hora adicional de cubrimiento fotográfico en la sesión Pre-XV o durante la fiesta.',
    null
),
(
    'Peinado y Maquillaje',
    350000,
    'Servicio de peinado y maquillaje por evento. Precio a partir de $350.000.',
    null
);
