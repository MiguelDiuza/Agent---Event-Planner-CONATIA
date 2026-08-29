-- El video de los vestidos, para 15 años y solo para 15 años.
--
-- Es la PRIMERA pieza del catálogo que cuelga de un tipo de evento y no de una
-- sede. Vale la pena decir por qué eso importa, porque el montaje ya estaba y
-- no hubo que tocar nada:
--
--   - La tanda de la cotización (`fn_medios_sedes_cotizacion`) exige
--     `sede_id is not null`, así que esta pieza NO se pega a los quince videos
--     de salones del turno 3. Sale por su cuenta, que es como se pidió.
--   - El acompañante promocional se saltea si el cliente ya recibió algo
--     institucional, y ese chequeo pide las tres FK nulas. Esta fila tiene
--     `tipo_evento_id`, así que no cuenta: el video de la promo sigue viajando
--     con la primera tanda como siempre.
--   - `enviar_medios` ya declara 'tipo_evento' entre las categorías válidas.
--
-- Lo que NO estaba bien y se descubrió al catalogar esto: la rama `tipo_evento`
-- de `fn_medios_para_enviar` resolvía el nombre con un `ilike`, así que pedirle
-- "15 Anos" sin tilde -- la forma que escribe el modelo la mitad de las veces --
-- devolvía cero piezas. Estaba arreglado desde el 2026-08-26 y una migración
-- posterior lo revirtió sin querer. Se arregla en 20260829000002, y hasta que
-- esa esté aplicada este video sale solo si el modelo acierta la tilde.
--
-- Lo único que decide CUÁNDO se manda es `cuando_usar`: el agente lee esa frase
-- en su catálogo y no hay más lógica detrás. Por eso dice explícitamente que no
-- va pegada a la cotización -- el turno 3 ya le manda al cliente veintidós
-- mensajes seguidos, y una pieza más ahí se pierde entre las otras dieciséis.
--
-- El archivo venía de cámara en 1080x1908 HEVC, 191 MB. Recomprimido a
-- 608x1074 H.264 (dos pasadas, 780 kbps, mismos 2:22 y 30 fps) = 15.084.817
-- bytes. Se probaron 720x1272 y 608x1074 al mismo tamaño y el pequeño puntúa
-- mejor contra el original (SSIM 0,900 contra 0,895): a este bitrate, los
-- artefactos de estirar la resolución pesan más que el detalle que se gana.
insert into medios (tipo, url, caption, descripcion, cuando_usar, tipo_evento_id, peso_bytes)
select 'video',
       'https://vzxcqoqljnndoxmzgfda.supabase.co/storage/v1/object/public/medios/vestidos/vestidos.mp4',
       'En este video puedes ver nuestros vestidos 👗✨',
       'Video de los vestidos de 15 años',
       'cuando la clienta de 15 años pregunta por los vestidos, o después de que ya eligió salón y sigue interesada. Va SUELTO, en su propio turno: nunca pegado a la tanda de la cotización',
       id_evento,
       15084817
from tipos_evento
where nombre_paquete = '15 Años';

-- Un nombre que no casa mete cero filas en silencio y el video queda en
-- Storage sin que nadie lo mande nunca. Ya pasó con dos archivos de sedes.
do $$
begin
    if not exists (
        select 1 from medios m
          join tipos_evento te on te.id_evento = m.tipo_evento_id
         where te.nombre_paquete = '15 Años' and m.activo
           and m.url like '%/vestidos/vestidos.mp4'
    ) then
        raise exception 'El video de vestidos no quedó catalogado bajo 15 Años';
    end if;
end;
$$;
