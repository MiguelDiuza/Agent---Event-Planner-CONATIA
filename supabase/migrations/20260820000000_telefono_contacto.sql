-- Numero de contacto marcable, separado de la identidad de WhatsApp.
--
-- Porque: `citas.telefono` guarda con lo que el cliente escribe por WhatsApp, y
-- eso NO siempre es un telefono. Si el cliente tiene el numero oculto llega un
-- JID (`914962284779@lid`) o un userId del proveedor (`CO.8639...`), con los que
-- es imposible llamar. Se detecto en produccion: de 7 citas agendadas, solo 1
-- tenia un numero marcable, y varias eran de tipo `llamada`.
--
-- `agenda_reservas` directamente no guardaba ningun telefono.
--
-- El valor lo pide el agente al cliente en la conversacion; nunca se deriva del
-- canal. La validacion (minimo 7 digitos) vive en el nodo `Calcular Ventana`
-- del sub-workflow agendar_cita, para que el modelo no pueda saltarsela.

alter table citas
    add column if not exists telefono_contacto text;

comment on column citas.telefono_contacto is
    'Numero marcable que dio el cliente. Distinto de telefono, que es la identidad de WhatsApp y puede ser un JID @lid no marcable.';

alter table agenda_reservas
    add column if not exists telefono_contacto text;

comment on column agenda_reservas.telefono_contacto is
    'Numero de contacto del cliente que aparto la fecha.';
