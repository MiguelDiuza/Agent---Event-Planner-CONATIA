-- Catálogo de fotos y videos que el agente puede enviar por WhatsApp.
-- Ver docs/superpowers/specs/2026-08-14-envio-medios-whatsapp-design.md
--
-- Las tres FK son opcionales y NO son excluyentes: una foto del Salón
-- Cristal montado para 15 años cuelga de la sede y del tipo de evento a la
-- vez, y debe aparecer tanto si el cliente pide fotos del salón como si
-- pide ver montajes de quince. Un medio institucional tiene las tres nulas.
create table medios (
    id uuid primary key default gen_random_uuid(),
    tipo text not null check (tipo in ('imagen', 'video')),
    url text not null,
    caption text,
    descripcion text not null,

    -- En qué momento de la conversación conviene enviarlo, redactado en
    -- términos de la situación y no del archivo ("cuando el cliente duda
    -- entre dos sedes"). Es lo que el agente lee para decidir: hace las
    -- veces de descripción de herramienta, pero por fila y editable sin
    -- tocar n8n. Obligatorio, porque un medio sin momento de uso es
    -- material que el agente nunca enviaría.
    cuando_usar text not null,

    sede_id uuid references sedes(id_sede) on delete cascade,
    tipo_evento_id uuid references tipos_evento(id_evento) on delete cascade,
    servicio_id uuid references servicios_adicionales_upselling(id) on delete cascade,
    orden int not null default 100,
    activo boolean not null default true,
    peso_bytes bigint,

    -- Reservado para cachear el media ID de Meta y ahorrar egress si el
    -- volumen crece. Sin uso en v1.
    meta_media_id text,
    created_at timestamptz not null default now(),

    -- Límites duros de WhatsApp Cloud API. Se validan aquí para que un
    -- archivo demasiado pesado falle al cargar el catálogo y no frente a
    -- un cliente.
    constraint medios_peso_whatsapp check (
        peso_bytes is null
        or (tipo = 'imagen' and peso_bytes <= 5242880)
        or (tipo = 'video'  and peso_bytes <= 16777216)
    )
);

-- Qué se le envió a quién. Guarda historial, no estado: no lleva unique
-- (lead_id, medio_id) para que un reenvío deliberado quede registrado en
-- vez de reventar.
create table envios_medios (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    medio_id uuid not null references medios(id) on delete cascade,
    enviado_at timestamptz not null default now()
);

create index idx_medios_sede on medios (sede_id) where activo;
create index idx_medios_tipo_evento on medios (tipo_evento_id) where activo;
create index idx_medios_servicio on medios (servicio_id) where activo;
create index idx_envios_medios_lead on envios_medios (lead_id);

-- Bucket público de Storage. Público porque Meta descarga el archivo desde
-- sus servidores al enviarlo: no hay forma de autenticar esa descarga. Es
-- material de marketing destinado a difundirse; no subir aquí nada que no
-- sea publicable.
insert into storage.buckets (id, name, public)
values ('medios', 'medios', true)
on conflict (id) do nothing;
