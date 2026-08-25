-- Tabla de citas con el asesor.
--
-- Hasta ahora `agendar_cita` solo escribía en Google Calendar. El calendario
-- es la agenda operativa del asesor, pero no sirve como fuente de datos del
-- negocio: no se puede cruzar con `leads`, no sobrevive a que alguien borre
-- un evento a mano, y consultarlo exige salir a la API de Google.
--
-- Esta tabla es el registro en Supabase de lo mismo. `google_event_id` es la
-- llave que une ambos mundos, y es `unique` a propósito: si el sub-workflow
-- se reintenta, la segunda inserción falla en vez de duplicar la cita.
--
-- Ojo con el orden: la fila se escribe DESPUÉS de que Google confirma el
-- evento. Si Google falla, no queda una cita fantasma en la base; si falla
-- esta inserción, queda el evento en el calendario sin fila, que es el error
-- menos malo de los dos (el asesor ve la cita y la atiende igual).
create table citas (
    id_cita uuid primary key default gen_random_uuid(),
    tipo_cita text not null
        check (tipo_cita in ('visita_sede', 'prueba_traje', 'llamada', 'asesoria')),
    nombre_cliente text not null,
    telefono text,
    detalle text,
    inicio timestamptz not null,
    fin timestamptz not null,
    google_event_id text unique,
    lead_id uuid references leads(id),
    created_at timestamptz not null default now()
);

create index idx_citas_inicio on citas (inicio);
create index idx_citas_telefono on citas (telefono);

-- Mismo criterio que `medios` y `envios_medios`: RLS sin políticas. Los grants
-- por defecto de Supabase le darían a `anon` escritura sobre esta tabla, y la
-- clave anon es pública. Una cita falsa insertada por un desconocido mandaría
-- al asesor a una reunión inventada. n8n entra como `postgres`, que tiene
-- BYPASSRLS, así que la ruta legítima no se rompe.
alter table citas enable row level security;
