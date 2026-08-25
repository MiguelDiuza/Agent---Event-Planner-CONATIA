-- Seguimiento automatico de leads que dejan de responder.
--
-- Dos etapas, decididas con el negocio (2026-08-19):
--   etapa 0 -> nadie le ha insistido. Si lleva N horas sin escribir, se le
--              manda un recordatorio de texto y pasa a etapa 1.
--   etapa 1 -> ya se le mando el recordatorio. Si pasan 24h mas sin que
--              conteste, se le manda el video promocional y pasa a etapa 2.
--   etapa 2 -> se acabo la insistencia. No se le vuelve a escribir solo.
--
-- `seguimiento_ultimo_envio` es lo que separa "no ha contestado" de "acaba de
-- contestar": si `updated_at` (que el Upsert Lead mueve en cada mensaje
-- entrante) es POSTERIOR al ultimo envio, el cliente respondio y el ciclo se
-- reinicia. Por eso el Upsert Lead tambien pone la etapa en 0.
alter table leads
    add column seguimiento_etapa int not null default 0
        check (seguimiento_etapa between 0 and 2),
    add column seguimiento_ultimo_envio timestamptz;

-- El barrido corre cada media hora y filtra por etapa + antiguedad; sin indice
-- seria un seq scan sobre toda la tabla en cada pasada.
create index idx_leads_seguimiento on leads (seguimiento_etapa, updated_at);

comment on column leads.seguimiento_etapa is
    '0=sin insistir, 1=recordatorio enviado, 2=video enviado (no insistir mas)';
