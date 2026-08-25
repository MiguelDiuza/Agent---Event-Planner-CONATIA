-- Los testimonios salen de circulación (2026-08-25).
--
-- Decisión del negocio: al cliente se le manda la promoción y los videos de los
-- salones, nada más. Los dos testimonios quedan en el catálogo pero inactivos:
-- `activo = false` los saca de fn_medios_para_enviar, de
-- fn_medios_sedes_cotizacion y de fn_catalogo_digest de una sola vez, así que el
-- agente deja de verlos en MATERIAL VISUAL DISPONIBLE y no puede ofrecerlos.
--
-- Se desactivan en vez de borrarse: los archivos siguen en el bucket, las filas
-- conservan su uuid, y `envios_medios` sigue teniendo sentido para los clientes
-- que ya los recibieron. Volver a activarlos es un update.
update medios
set activo = false
where etiqueta = 'testimonio';
