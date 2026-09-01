-- Las fechas que YA ESTAN VENDIDAS, sacadas del Excel que lleva el equipo a
-- mano (`2025.xlsx`, compartido por WPS) el 2026-09-01.
--
-- Existe por lo que faltaba: `agenda_reservas` solo tenia lo que habia apartado
-- el bot -- tres filas -- mientras el calendario real de la empresa iba por 113
-- eventos vendidos. `fn_verificar_disponibilidad_evento` lee esa tabla, asi que
-- para el agente todos esos sabados estaban LIBRES: le habria confirmado a un
-- cliente una fecha que ya tiene dueno, y eso no se descubre hasta que el
-- asesor llama.
--
-- Se cargan con estado 'separado', no 'bloqueado_temporal': son ventas
-- cerradas con abono, no reservas a la espera de que alguien confirme.
--
-- DE DONDE SALIERON. El maestro (hojas `2026` y `2027`) NO alcanza: los
-- calendarios por sede -- `CIUDAD JARDIN`, `AV 3 NTE`, `MUNDO FOTO`,
-- `GRANADA 2026`, `GRANADA GOLD 2026` -- tienen filas que el maestro no
-- registra: los "OCUPADO" sin nombre de cliente, y Granada entera, que no
-- aparece ni una sola vez en el maestro. Se cargo la union de los dos.
--
-- SOLO DE HOY EN ADELANTE. Agosto de 2026 y todo lo anterior quedo fuera a
-- proposito: una fecha que ya paso no hay que protegerla, y
-- `fn_verificar_disponibilidad_evento` la rechaza por su cuenta antes de
-- mirar siquiera la agenda.

-- ---------------------------------------------------------------------------
-- 1. De donde salio cada fila
-- ---------------------------------------------------------------------------
-- 'bot'    -> la aparto Angie por chat, con separar_fecha_evento.
-- 'humano' -> la vendio una persona del equipo y estaba en el Excel.
--
-- Es lo que hace falta para que la hoja de calculo pueda decir quien agendo
-- cada evento sin adivinarlo, y para que volver a cargar el Excel manana no
-- pise lo que el bot aparto esta manana.
alter table agenda_reservas
    add column if not exists origen text not null default 'bot'
        check (origen in ('bot', 'humano'));

comment on column agenda_reservas.origen is
  'Quien aparto la fecha: bot (Angie, por chat) o humano (venta del equipo, cargada del Excel). Ver 20260901000000.';

-- Las tres filas que ya existian son del bot, asi que se quedan con el default.

-- ---------------------------------------------------------------------------
-- 2. Sede Granada Premium
-- ---------------------------------------------------------------------------
-- El Excel lleva DOS calendarios de Granada -- las hojas `GRANADA` y
-- `GRANADA GOLD` -- y la hoja VALORES los cotiza por separado, como GRANADA
-- PREMIUM y GRANADA GOLD, con precios distintos. En la base solo existia una.
--
-- Cual era cual se resolvio por los PRECIOS, no por el nombre: los de
-- `Sede Granada Gold` en la base (7.0, 7.5, 8.0, 8.5, 9.0 y 9.5 millones para
-- 50 a 100 invitados) son exactamente la columna GRANADA GOLD. Luego la hoja
-- `GRANADA` es Premium, y sus 30 eventos vendidos no estaban en ningun lado.
--
-- SIN PRECIOS, A PROPOSITO. `consultar_precios_sedes` hace inner join contra
-- `precios_sedes`, asi que una sede sin precios no se cotiza ni se le ofrece a
-- nadie -- que es justo lo que se quiere hoy: la sede existe para poder
-- bloquearle las fechas, y nada mas. Darle precios sin cargarle antes sus
-- videos la meteria en la cotizacion como un salon del que el cliente no puede
-- ver ni una foto: las otras catorce sedes tienen entre 11 y 32 medios, esta
-- tendria cero. Los precios estan listos aqui abajo, comentados.
insert into sedes (nombre_sede, es_propia, incluye_pista_cristal)
values ('Sede Granada Premium', true, false)
on conflict (nombre_sede) do nothing;

-- Precios de la columna GRANADA PREMIUM de la hoja VALORES (en millones):
--   50:7.5  60:8  70:8.5  80:9  90:9.5  100:10  110:10.5  120:11.3
--   130:12.5  140:13.3  150:13.5
-- Igual que Granada Gold, no pasa de 150 invitados.
-- Descomentar SOLO cuando la sede tenga sus medios cargados en `medios`.
--
-- insert into precios_sedes (sede_id, capacidad_invitados, precio_total)
-- select s.id_sede, v.cap, v.precio
-- from sedes s,
--      (values (50, 7500000), (60, 8000000), (70, 8500000), (80, 9000000),
--              (90, 9500000), (100, 10000000), (110, 10500000), (120, 11300000),
--              (130, 12500000), (140, 13300000), (150, 13500000)) as v(cap, precio)
-- where s.nombre_sede = 'Sede Granada Premium'
-- on conflict (sede_id, capacidad_invitados) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Las 113 fechas vendidas
-- ---------------------------------------------------------------------------
-- `on conflict do nothing` sobre (sede_id, fecha_solicitada): si el bot ya
-- aparto esa fecha, la suya manda -- tiene lead_id y google_event_id, y esta
-- fila no tendria ninguno de los dos.
--
-- OJO, DOS FILAS DUDOSAS del maestro de 2027. Se cargan igual: bloquear de mas
-- cuesta una consulta al asesor, bloquear de menos cuesta un evento doble.
--   * Sede Sur 66 Mundo Foto, 2027-09-08 (ANGIE MOLINA). La hoja la llama
--     "SABADO 8", pero el 8 de septiembre de 2027 es MIERCOLES -- y el nombre y
--     el telefono son los mismos de su evento del 2027-05-08.
--   * Pilas Premium, 2027-12-27 (VIVAN ANDREA RODRIGUEZ). La hoja la llama
--     "SABADO 27", pero el 27 de diciembre de 2027 es LUNES.
-- Las otras 111 tienen el dia de la semana que les corresponde.
with reales (sede, fecha, cliente) as (
  values
    ('Casa Christian''s Ciudad Jardín', '2026-09-05'::date, 'DARIANNY ZULUETA'),
    ('Casa Christian''s Ciudad Jardín', '2026-09-12'::date, 'MARTHA VILLAMIZAR'),
    ('Casa Christian''s Ciudad Jardín', '2026-09-19'::date, 'SONIA PATRICIA LOPEZ'),
    ('Casa Christian''s Ciudad Jardín', '2026-09-26'::date, 'OCUPADO'),
    ('Casa Christian''s Ciudad Jardín', '2026-10-10'::date, 'MALLERLYN ZAMORA'),
    ('Casa Christian''s Ciudad Jardín', '2026-11-07'::date, 'SANDRA PATRICIA FERNANDEZ'),
    ('Casa Christian''s Ciudad Jardín', '2026-11-15'::date, 'JOHNN CESAR RENDON'),
    ('Casa Christian''s Ciudad Jardín', '2026-11-27'::date, 'GABRIEL ANTONIO HERNANDEZ'),
    ('Casa Christian''s Ciudad Jardín', '2026-11-28'::date, 'JENNY CRISTINA DOMINGUEZ'),
    ('Casa Christian''s Ciudad Jardín', '2026-12-05'::date, 'RUBEN PELAEZ'),
    ('Casa Christian''s Ciudad Jardín', '2026-12-12'::date, 'MIREYA GONZALEZ'),
    ('Casa Christian''s Ciudad Jardín', '2026-12-19'::date, 'LORENA SOTO PRECIADO'),
    ('Sede Norte', '2026-09-05'::date, 'POR CONFIRMAR'),
    ('Sede Norte', '2026-09-12'::date, 'SORVOY MARIN'),
    ('Sede Norte', '2026-09-19'::date, 'MARISOL MONTOYA CASTRO'),
    ('Sede Norte', '2026-10-03'::date, 'YOLANDA ALVAREZ'),
    ('Sede Norte', '2026-10-10'::date, 'OCUPADO'),
    ('Sede Norte', '2026-10-24'::date, 'JENNIFER MARCELA GOMEZ'),
    ('Sede Norte', '2026-10-31'::date, 'LORENA HERNANDEZ CAPOTE'),
    ('Sede Norte', '2026-11-01'::date, 'YULIANA VASQUEZ'),
    ('Sede Norte', '2026-11-07'::date, 'VERONICA HURTADO'),
    ('Sede Norte', '2026-11-14'::date, 'LUZ MARIANA VIERA'),
    ('Sede Norte', '2026-11-21'::date, 'LINA FERNANDA ORDOÑEZ'),
    ('Sede Norte', '2026-11-28'::date, 'OCUPADO'),
    ('Sede Norte', '2026-12-05'::date, 'LUZ YURANI MONDRAGON'),
    ('Sede Norte', '2026-12-12'::date, 'DORIAN EUNICE RENDON CORREA'),
    ('Sede Norte', '2026-12-19'::date, 'FABIAN ANDRES BARINAS'),
    ('Sede Norte', '2026-12-26'::date, 'Ocupado Andrea Castillo'),
    ('Sede Sur 66 Mundo Foto', '2026-09-04'::date, 'KEMBERLING CONTRERAS'),
    ('Sede Sur 66 Mundo Foto', '2026-09-05'::date, 'YULIANA OCAMPO'),
    ('Sede Sur 66 Mundo Foto', '2026-09-12'::date, 'YOHANA IDARRAGA'),
    ('Sede Sur 66 Mundo Foto', '2026-09-19'::date, 'QUELIOS ESTERILLA'),
    ('Sede Sur 66 Mundo Foto', '2026-09-26'::date, 'VANESSA SANCHEZ'),
    ('Sede Sur 66 Mundo Foto', '2026-10-03'::date, 'CLAUDIA LORENA POLANIA'),
    ('Sede Sur 66 Mundo Foto', '2026-10-10'::date, 'ROBERTO VERGARA'),
    ('Sede Sur 66 Mundo Foto', '2026-10-17'::date, 'LEIDY OCAMPO'),
    ('Sede Sur 66 Mundo Foto', '2026-10-24'::date, 'GLEHYSLEY HILIC'),
    ('Sede Sur 66 Mundo Foto', '2026-11-07'::date, 'William Cadavid'),
    ('Sede Sur 66 Mundo Foto', '2026-11-14'::date, 'MARLIN GODOY'),
    ('Sede Sur 66 Mundo Foto', '2026-11-21'::date, 'PAULA A. HERNANDEZ'),
    ('Sede Sur 66 Mundo Foto', '2026-11-28'::date, 'ANDRES FELIPE MUNEVA'),
    ('Sede Sur 66 Mundo Foto', '2026-12-12'::date, 'MAGALIS GOMEZ'),
    ('Sede Sur 66 Mundo Foto', '2026-12-19'::date, 'LESLY ALEJANDRA AGUDELO'),
    ('Sede Sur 66 Mundo Foto', '2026-12-26'::date, 'LINA PUERTO'),
    ('Sede Granada Gold', '2026-09-19'::date, 'ANGELICA MENDEZ'),
    ('Sede Granada Gold', '2026-09-26'::date, 'JINA LOZANO'),
    ('Sede Granada Gold', '2026-10-10'::date, 'LAURA MARIN'),
    ('Sede Granada Gold', '2026-10-11'::date, 'juan david'),
    ('Sede Granada Gold', '2026-11-07'::date, 'MICHEL VIDAL'),
    ('Sede Granada Gold', '2026-11-14'::date, 'LINDA PUIN'),
    ('Sede Granada Gold', '2026-11-28'::date, 'WBEIMAR'),
    ('Sede Granada Gold', '2026-12-12'::date, 'NATALIA PLAZA'),
    ('Sede Granada Gold', '2026-12-19'::date, 'ISABELLA CASTRO'),
    ('Sede Granada Gold', '2026-12-26'::date, 'LILIANA ZUÑIGA'),
    ('Sede Granada Premium', '2026-09-05'::date, 'JULIAN TORRES'),
    ('Sede Granada Premium', '2026-09-12'::date, 'MONICA MONTEALEGRE'),
    ('Sede Granada Premium', '2026-09-19'::date, 'YURANI RODRIGUEZ'),
    ('Sede Granada Premium', '2026-09-26'::date, 'MARIA FERNANDA'),
    ('Sede Granada Premium', '2026-09-27'::date, 'JOHN JAIRO VELASQUEZ'),
    ('Sede Granada Premium', '2026-10-03'::date, 'KAREN VARGAS'),
    ('Sede Granada Premium', '2026-10-10'::date, 'ELIZABETH ERAZO'),
    ('Sede Granada Premium', '2026-10-11'::date, 'ROSSY GOMEZ'),
    ('Sede Granada Premium', '2026-10-17'::date, 'CLAUDIA ZUÑIGA'),
    ('Sede Granada Premium', '2026-10-23'::date, 'MAFE ORTEGA'),
    ('Sede Granada Premium', '2026-10-24'::date, 'ESMERALDA NUÑEZ'),
    ('Sede Granada Premium', '2026-10-31'::date, 'JUAN DAVID PEREA'),
    ('Sede Granada Premium', '2026-11-01'::date, 'DAYANA CORTES'),
    ('Sede Granada Premium', '2026-11-07'::date, 'LEISON SANCHEZ'),
    ('Sede Granada Premium', '2026-11-14'::date, 'FLOR DELGADO'),
    ('Sede Granada Premium', '2026-11-15'::date, 'MAICOL VILLALOBOS'),
    ('Sede Granada Premium', '2026-11-20'::date, 'MONICA DUCON'),
    ('Sede Granada Premium', '2026-11-21'::date, 'LEIDY VARGAS'),
    ('Sede Granada Premium', '2026-12-04'::date, 'MONICA BEDOYA'),
    ('Sede Granada Premium', '2026-12-05'::date, 'EDNA HERRERA'),
    ('Sede Granada Premium', '2026-12-07'::date, 'IVAN MOSQUERA'),
    ('Sede Granada Premium', '2026-12-12'::date, 'ADRIANA'),
    ('Sede Granada Premium', '2026-12-18'::date, 'KIMBERLYN RIVERA'),
    ('Sede Granada Premium', '2026-12-19'::date, 'MONICA VALDES'),
    ('Sede Granada Premium', '2026-12-26'::date, 'MAIYURI GIRALDO'),
    ('Sede Norte', '2027-01-02'::date, 'ROSA HELENA VELOSA'),
    ('Sede Norte', '2027-01-09'::date, 'OCUPADO'),
    ('Sede Norte', '2027-01-16'::date, 'MAIRA ALEJANDRA SOTO'),
    ('Sede Norte', '2027-01-17'::date, 'ocupado'),
    ('Sede Norte', '2027-02-06'::date, 'BREINER BUSTOS'),
    ('Sede Norte', '2027-05-01'::date, 'ALEJANDRA QUINTERO'),
    ('Sede Norte', '2027-06-19'::date, 'VICTORIA EUGENIA BECERRA'),
    ('Sede Norte', '2027-06-26'::date, 'ANGIE MARCELA VILLA'),
    ('Sede Sur 66 Mundo Foto', '2027-01-10'::date, 'DANYELY JOAQUI'),
    ('Sede Sur 66 Mundo Foto', '2027-01-30'::date, 'GIOVANNA CORTES'),
    ('Sede Sur 66 Mundo Foto', '2027-05-08'::date, 'ANGIE MOLINA'),
    ('Sede Sur 66 Mundo Foto', '2027-05-22'::date, 'MICHELLE DELGADO'),
    ('Sede Sur 66 Mundo Foto', '2027-09-08'::date, 'ANGIE MOLINA'),
    ('Sede Granada Gold', '2027-02-20'::date, 'LIZETH CASTILLO'),
    ('Sede Granada Gold', '2027-05-29'::date, 'MARCELA VARGAS'),
    ('Sede Granada Premium', '2027-01-16'::date, 'LEIDY VIVIANA ORTEGA'),
    ('Sede Granada Premium', '2027-02-07'::date, 'MABEL MENDOZA'),
    ('Sede Granada Premium', '2027-03-06'::date, 'LUZ ADIELA LOPEZ'),
    ('Sede Granada Premium', '2027-03-20'::date, 'YAZMIN AVILA'),
    ('Sede Granada Premium', '2027-05-08'::date, 'GLORIA VALENCIA'),
    ('Casa 4', '2026-09-04'::date, 'JOSE FERNANDEZ ESPINA'),
    ('Casa 4', '2026-11-01'::date, 'DIANA JARAMILLO'),
    ('Pilas Premium', '2026-09-26'::date, 'ALIRIO MOSQUERAS'),
    ('Orquideorama', '2026-12-05'::date, 'NICOLLE ANDREA MARQUEZ'),
    ('Casa 5', '2026-12-20'::date, 'KEITLYN VALENCIA'),
    ('Casa 5', '2026-12-27'::date, 'ROSA ELENA HOYOS'),
    ('Casa 4', '2027-01-16'::date, 'DIANA BETTY VALENCIA'),
    ('Casa 5', '2027-01-23'::date, 'ALEJANDRO MONDRAGON'),
    ('Casa 4', '2027-01-23'::date, 'YERALDIN HENAO'),
    ('Casa 74', '2027-02-20'::date, 'LADY JOHANA BAQUERO'),
    ('Casa 4', '2027-03-20'::date, 'Nora Silva Ruiz'),
    ('Casa 5', '2027-04-17'::date, 'NATALIA CARDONA'),
    ('Pilas Premium', '2027-07-03'::date, 'MAYRA ANGULO'),
    ('Pilas Premium', '2027-12-27'::date, 'VIVAN ANDREA RODRIGUEZ')
)
insert into agenda_reservas (sede_id, fecha_solicitada, nombre_cliente, estado, origen)
select s.id_sede, r.fecha, r.cliente, 'separado', 'humano'
from reales r
join sedes s on s.nombre_sede = r.sede
on conflict (sede_id, fecha_solicitada) do nothing;
