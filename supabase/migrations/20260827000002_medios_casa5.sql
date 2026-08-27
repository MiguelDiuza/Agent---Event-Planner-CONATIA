-- Casa 5, el ultimo salon que quedaba sin material.
--
-- Con esta fila las quince sedes tienen algo que mostrar y la tanda de la
-- cotizacion deja de tener un hueco: hasta hoy, un cliente que preguntaba por
-- Casa 5 recibia precio pero ninguna pieza, y no habia nada en la conversacion
-- que delatara la ausencia.
--
-- El archivo se subio como `sedes/casa5.mp4` (7.315.418 bytes, clave nueva, sin
-- cache de CDN que la contradiga) y pesa menos de la mitad del tope de 16 MB de
-- WhatsApp, asi que no necesito recomprimirlo como hubo que hacer con Sawa.

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://vzxcqoqljnndoxmzgfda.supabase.co/storage/v1/object/public/medios/sedes/casa5.mp4',
       'Así se ve Casa 5 ✨',
       'Recorrido de Casa 5',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 7315418
from sedes where nombre_sede = 'Casa 5';

-- Un nombre que no casa mete cero filas en silencio. Se comprueba aqui la
-- condicion que de verdad importa: que ninguna sede quede sin material.
do $$
declare v_faltan text;
begin
    select string_agg(s.nombre_sede, ', ' order by s.nombre_sede)
      into v_faltan
      from sedes s
     where not exists (
             select 1 from medios m where m.sede_id = s.id_sede and m.activo
     );

    if v_faltan is not null then
        raise exception 'Sedes que quedaron sin material: %', v_faltan;
    end if;
end;
$$;
