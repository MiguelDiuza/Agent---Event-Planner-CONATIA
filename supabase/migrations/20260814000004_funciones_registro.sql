-- Registro de envíos y resumen del catálogo.

-- Deja constancia de que un medio ya se le envió a un cliente. Resuelve el
-- lead por teléfono porque ese es el identificador que llega del webhook;
-- el modelo nunca lo provee.
create or replace function fn_registrar_envio(
    p_medio_id uuid,
    p_telefono text
)
returns uuid
language sql
volatile
as $$
    insert into envios_medios (lead_id, medio_id)
    select l.id, p_medio_id
    from leads l
    where l.telefono = p_telefono
    returning id;
$$;

-- Resumen que el nodo "Catálogo de Medios" inyecta al system message en
-- cada turno. Con 15 sedes, 7 tipos de evento y un puñado de servicios son
-- ~30 líneas: costo de tokens despreciable frente a que el agente sepa
-- exactamente qué tiene y cuándo usarlo.
create or replace function fn_catalogo_digest()
returns text
language sql
stable
as $$
    select coalesce(
        string_agg(
            format('- %s | %s | %s x%s → %s',
                   categoria, referencia, tipo, cantidad, cuando_usar),
            E'\n' order by categoria, referencia, tipo
        ),
        'Sin material cargado.'
    )
    from vista_catalogo_medios;
$$;
