-- Tres fechas vendidas que la carga del 2026-09-01 se dejó fuera.
--
-- Aparecieron el 2026-09-02, al traer al Excel nuevo las 21 pestañas del libro
-- viejo y cotejarlas una por una contra `agenda_reservas`. De las 49 filas
-- vendidas de los maestros, las 49 estaban. De los calendarios por sede
-- faltaban estas tres, y las tres por el mismo motivo.
--
-- POR QUÉ SE PERDIERON. El libro se llama `2025.xlsx` y se reutilizó para 2026,
-- así que muchas celdas de fecha conservan el año viejo. Lo que dice la verdad
-- es la columna del DÍA DE LA SEMANA que va al lado: `2025-09-05 SABADO` es el
-- 5 de septiembre de 2026, que es el que cae en sábado. La migración
-- 20260901000000 ya aplicó ese criterio -- por eso sus 113 fechas tienen el día
-- que les corresponde -- pero estas dos de Granada traían un año que las dejaba
-- en el PASADO (`2026-08-07`, `2025-08-14`), y el filtro de "solo de hoy en
-- adelante" las descartó antes de que nadie mirara el día. Corregido el año por
-- el día, son de agosto de 2027 y están muy por delante.
--
-- LA TERCERA ES UNA DEDUCCIÓN, y conviene que alguien del equipo la confirme.
-- DIEGO MONTOYA venía en la hoja `GRANADA 2026`, en la fila 99, con "CASA 4"
-- escrito en la columna donde va el día de la semana. La sede se resolvió por
-- el PRECIO, que es el único dato duro que había: 17.100.000 para 120 personas
-- es la tarifa de Casa 4 en la propia hoja `VALORES` del equipo; Granada
-- Premium para 120 son 11.300.000. Si resultara ser de Granada Premium, lo que
-- hay que hacer es liberar esta y apuntar la otra -- desde la columna
-- `cancelada` de la hoja, que es para lo que está.
--
-- SE APLICA COMO NO-OP EN PRODUCCIÓN. Allá las tres entraron el 2026-09-02 por
-- la pestaña `Reservas` y la sincronización de cada 15 minutos, con sus eventos
-- de Calendar. Esta migración existe para que la base LOCAL no se quede atrás:
-- sin ella, un `supabase db reset` daría 113 filas donde producción tiene 116,
-- y las pruebas volverían a aprobar sobre una agenda que no es la que corre.
-- Es el mismo motivo por el que existe 20260828000004.
with faltantes (sede, fecha, cliente) as (
  values
    ('Casa 4',               '2026-12-27'::date, 'DIEGO MONTOYA'),
    ('Sede Granada Premium', '2027-08-07'::date, 'MARTHA CAMPOS'),
    ('Sede Granada Premium', '2027-08-14'::date, 'YESENIA MORENO')
)
insert into agenda_reservas (sede_id, fecha_solicitada, nombre_cliente, estado, origen)
select s.id_sede, f.fecha, f.cliente, 'separado', 'humano'
from faltantes f
join sedes s on s.nombre_sede = f.sede
on conflict (sede_id, fecha_solicitada) do nothing;
