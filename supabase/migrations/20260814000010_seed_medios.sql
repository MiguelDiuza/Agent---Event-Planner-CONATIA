-- Carga inicial del catálogo de medios: material real del negocio,
-- comprimido a los límites de WhatsApp y subido al bucket `medios` de
-- Supabase Storage (proyecto jehhlnfygiaavmxgaxpz).
--
-- cuando_usar describe el MOMENTO de la conversación, no el contenido del
-- archivo: es lo que el agente lee para decidir cuándo enviarlo.
--
-- Los FK se resuelven por nombre (select ... from sedes where nombre_sede =
-- ...) en vez de un uuid pegado a mano, para que el seed siga siendo válido
-- después de un reset local, que regenera los uuid. Los pesos son los reales
-- medidos con ffprobe/ls, no aproximados: son lo que valida la constraint.

-- ---------------------------------------------------------------------------
-- Sedes: un video o foto por salón, para cuando el cliente compara sedes.
-- ---------------------------------------------------------------------------

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/casa%204.mp4',
       'Así se ve Casa 4 ✨',
       'Recorrido de Casa 4',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 13402351
from sedes where nombre_sede = 'Casa 4';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/casa%20vallado.mp4',
       'Así se ve Mansión Vallano ✨',
       'Recorrido de Mansión Vallano',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 6197186
from sedes where nombre_sede = 'Mansión Vallano';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/casa_cristian_ciudad_jardin.mp4',
       'Así se ve Casa Christian''s Ciudad Jardín ✨',
       'Recorrido de Casa Christian''s Ciudad Jardín',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 15502804
from sedes where nombre_sede = 'Casa Christian''s Ciudad Jardín';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/casa74.mp4',
       'Así se ve Casa 74 ✨',
       'Recorrido de Casa 74',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 9272643
from sedes where nombre_sede = 'Casa 74';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/hacienda%20de%20talismania.mp4',
       'Así se ve Hacienda El Talismán ✨',
       'Recorrido de Hacienda El Talismán',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 6573142
from sedes where nombre_sede = 'Hacienda El Talismán';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/Marquez%20de%20loyola.mp4',
       'Así se ve Marquez De Loyola ✨',
       'Recorrido de Marquez De Loyola',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 5973681
from sedes where nombre_sede = 'Marquez De Loyola';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/pilas%20premium.mp4',
       'Así se ve Pilas Premium ✨',
       'Recorrido de Pilas Premium',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 13391319
from sedes where nombre_sede = 'Pilas Premium';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'imagen',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/salos%20de%20las%20pilas.jpeg',
       'Una vista de Pilas Premium 📸',
       'Foto de Pilas Premium',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 155082
from sedes where nombre_sede = 'Pilas Premium';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/sede%20granada%20Gold.mp4',
       'Así se ve Sede Granada Gold ✨',
       'Recorrido de Sede Granada Gold',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 9627270
from sedes where nombre_sede = 'Sede Granada Gold';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/sede%20norte.mp4',
       'Así se ve Sede Norte ✨',
       'Recorrido de Sede Norte',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 9786037
from sedes where nombre_sede = 'Sede Norte';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/sede%20sur%2066.mp4',
       'Así se ve Sede Sur 66 Mundo Foto ✨',
       'Recorrido de Sede Sur 66 Mundo Foto',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 14357003
from sedes where nombre_sede = 'Sede Sur 66 Mundo Foto';

insert into medios (tipo, url, caption, descripcion, cuando_usar, sede_id, peso_bytes)
select 'video',
       'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/sedes/valdemoro.mp4',
       'Así se ve Valdemoro ✨',
       'Recorrido de Valdemoro',
       'cuando el cliente pregunta cómo se ve el salón o está comparando entre sedes',
       id_sede, 4883961
from sedes where nombre_sede = 'Valdemoro';

-- ---------------------------------------------------------------------------
-- Institucional: promoción y testimonios, distinguidos por etiqueta.
-- ---------------------------------------------------------------------------

insert into medios (tipo, url, caption, descripcion, cuando_usar, etiqueta, peso_bytes)
values (
    'video',
    'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/promos/promocion.mp4',
    'Conoce nuestra Súper Promoción 🎉',
    'Video promocional: evento todo incluido',
    'cuando el cliente pregunta por promociones o el paquete todo incluido',
    'promocion', 14068152
);

insert into medios (tipo, url, caption, descripcion, cuando_usar, etiqueta, peso_bytes)
values (
    'video',
    'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/testimonios/testimonio.mp4',
    'Mira lo que dicen nuestros clientes ☺️',
    'Testimonio de cliente',
    'cuando el cliente duda o pide referencias de otros clientes antes de decidirse',
    'testimonio', 10469213
);

insert into medios (tipo, url, caption, descripcion, cuando_usar, etiqueta, peso_bytes)
values (
    'video',
    'https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/testimonios/testimonio2.mp4',
    'Otro testimonio de un cliente feliz ☺️',
    'Testimonio de cliente',
    'cuando el cliente duda o pide referencias de otros clientes antes de decidirse',
    'testimonio', 7196126
);
