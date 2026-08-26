-- Material nuevo del 2026-08-26: Sawa, Orquideorama y Gran Salon.
--
-- Con estas tres filas la tanda pasa de once salones a catorce, y el unico que
-- queda sin material es Casa 5 -- el "Mansion Casa #5" del negocio.
--
-- Sobre el archivo de Sawa: el que se subio pesaba 29,2 MB y WhatsApp no acepta
-- videos de mas de 16 MB, asi que la constraint `medios_peso_whatsapp` lo habria
-- rechazado al catalogarlo, que es exactamente para lo que esta. Se recomprimio
-- a 14,75 MB (h264 dos pasadas, 600 kbps, misma resolucion 478x850 y los mismos
-- 2:54 de duracion) y se subio como `sedes/sawa-whatsapp.mp4`.
--
-- El nombre es distinto a proposito y no por gusto: sobrescribir
-- `sedes/sawa.mp4` deja el objeto correcto en Storage pero la CDN sigue
-- entregando el archivo viejo hasta que expire su cache, y quien descarga esa
-- URL es Meta. O sea: el catalogo diria 14,75 MB y Meta se bajaria 29,2 MB y
-- rechazaria el envio, sin nada en la base que explicara por que. Una clave
-- nueva no tiene cache que la contradiga.
--
-- Gran Salon entra con FOTO, no con video: es lo unico que hay de esa sede. La
-- tanda ya lo admite desde 20260826000001 (una pieza por sede, el video si lo
-- hay y la foto si no). Vale la pena decirlo porque es la primera sede que
-- entra a la cotizacion sin recorrido en video.

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://vzxcqoqljnndoxmzgfda.supabase.co/storage/v1/object/public/medios/sedes/sawa-whatsapp.mp4',
       'Así se ve Sawa ✨',
       'Recorrido de Sawa',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 15463876
from sedes where nombre_sede = 'Sawa';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://vzxcqoqljnndoxmzgfda.supabase.co/storage/v1/object/public/medios/sedes/orquideorama%20norte.mp4',
       'Así se ve Orquideorama ✨',
       'Recorrido de Orquideorama',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 7196126
from sedes where nombre_sede = 'Orquideorama';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'imagen',
       'https://vzxcqoqljnndoxmzgfda.supabase.co/storage/v1/object/public/medios/sedes/GranSalon.jpeg',
       'Así se ve Gran Salón ✨',
       'Foto de Gran Salón',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 155082
from sedes where nombre_sede = 'Gran Salón';

-- Las tres sedes existen en `sedes` y las tres tenian que quedar catalogadas.
-- Si un nombre no casa, el insert mete cero filas en silencio y el salon
-- simplemente no aparece en la tanda: el fallo se veria frente a un cliente,
-- semanas despues, y no aqui.
do $$
declare v_faltan text;
begin
    select string_agg(s.nombre_sede, ', ' order by s.nombre_sede)
      into v_faltan
      from sedes s
     where s.nombre_sede in ('Sawa', 'Orquideorama', 'Gran Salón')
       and not exists (
             select 1 from medios m where m.sede_id = s.id_sede and m.activo
       );

    if v_faltan is not null then
        raise exception 'Sedes que quedaron sin material: %', v_faltan;
    end if;
end;
$$;
