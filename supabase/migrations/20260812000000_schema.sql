-- Esquema para el agente de ventas AI (Brian Otero) de Christian Sierra Event Planner
-- Ver docs/superpowers/specs/2026-08-12-n8n-event-planner-agent-design.md

create extension if not exists pgcrypto;

-- Sedes/salones. Cada una tiene su propio Google Calendar porque son
-- lugares físicamente independientes (dos eventos pueden coexistir el mismo
-- día en sedes distintas).
create table sedes (
    id_sede uuid primary key default gen_random_uuid(),
    nombre_sede text not null unique,
    google_calendar_id text,
    incluye_pista_cristal boolean not null default false,
    created_at timestamptz not null default now()
);

-- Qué incluye y qué obsequios trae cada tipo de evento (15 años, matrimonio,
-- grado, cumpleaños, empresa, primera comunión, baby shower). No depende de
-- la sede ni de la capacidad.
create table tipos_evento (
    id_evento uuid primary key default gen_random_uuid(),
    nombre_paquete text not null unique,
    inclusiones_base text not null,
    obsequios text not null,
    excepciones text not null,
    created_at timestamptz not null default now()
);

-- Cotizador: precio según sede y cantidad de invitados (de 50 a 200, de a
-- 10). No todas las sedes ofrecen todos los escalones de capacidad.
create table precios_sedes (
    id uuid primary key default gen_random_uuid(),
    sede_id uuid not null references sedes(id_sede) on delete cascade,
    capacidad_invitados int not null check (capacidad_invitados between 50 and 200),
    precio_total numeric(12, 0) not null,
    created_at timestamptz not null default now(),
    unique (sede_id, capacidad_invitados)
);

-- Servicios de upselling: fotografía (Focus Art) y pirotecnia.
create table servicios_adicionales_upselling (
    id uuid primary key default gen_random_uuid(),
    servicio text not null unique,
    precio numeric(12, 0) not null,
    detalles text not null,
    promociones text,
    created_at timestamptz not null default now()
);

-- Clientes que escriben por WhatsApp. El teléfono es la clave de sesión
-- para la memoria de conversación del AI Agent en n8n.
create table leads (
    id uuid primary key default gen_random_uuid(),
    telefono text not null unique,
    nombre text,
    email text,
    tipo_evento_interes uuid references tipos_evento(id_evento),
    sede_interes uuid references sedes(id_sede),
    fecha_evento_deseada date,
    num_invitados int,
    estado text not null default 'nuevo'
        check (estado in ('nuevo', 'perfilado', 'cotizado', 'separado', 'perdido')),
    requiere_humano boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Puente con Google Calendar: control de disponibilidad por sede para que
-- el agente no sobre-venda una fecha.
create table agenda_reservas (
    id_reserva uuid primary key default gen_random_uuid(),
    sede_id uuid not null references sedes(id_sede),
    lead_id uuid references leads(id),
    fecha_solicitada date not null,
    nombre_cliente text,
    estado text not null default 'disponible'
        check (estado in ('disponible', 'bloqueado_temporal', 'separado')),
    google_event_id text,
    created_at timestamptz not null default now(),
    unique (sede_id, fecha_solicitada)
);

create index idx_precios_sedes_capacidad on precios_sedes (capacidad_invitados);
create index idx_leads_telefono on leads (telefono);
create index idx_agenda_reservas_sede_fecha on agenda_reservas (sede_id, fecha_solicitada);
