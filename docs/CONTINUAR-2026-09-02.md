# Continuación — 2026-09-02

Contexto para retomar en una sesión nueva. Rama: `sync-vps-y-fechas-reales`.

## Dónde quedó todo

**Excel del equipo (Google Sheets) — FUNCIONANDO.**
Hoja `1H1Sq3HGl0oWamnt7TLCg2X_Tvyj6blMF6TjJ7ihtDAA`, pestañas `Reservas` (8
columnas) y `Citas` (11). Los dos nodos (`Anotar en Excel` en
`separar_fecha_evento`, `Anotar Cita en Excel` en `agendar_cita`) están
**encendidos y publicados en el VPS**. Las 113 fechas ya vendidas están
volcadas. Sin deriva: repo, base y VPS coinciden.

La credencial es una cuenta de servicio **propia**, no la de Calendar:
`chris-164@rising-precinct-507407-c3.iam.gserviceaccount.com`, credencial de n8n
`ZzY1Zt2j9JaKlujB`. El proyecto está **sin organización**, creado con un Gmail
personal, porque Workspace bloquea la descarga de llaves JSON
(`constraints/iam.disableServiceAccountKeyCreation`). La llave vive en
`.gcp-sa-sheets.json` (ignorada por git). Ver el README para el porqué completo.

**Traspaso al asesor — CONSTRUIDO, APAGADO.**
Después de la cita, el bot le dice al cliente que el asesor retoma, le avisa al
asesor y se calla (`requiere_humano`). Migración `20260902000000` aplicada en
producción. Los 6 nodos están en el VPS pero `Caso del Asesor` está
**deshabilitado**, y es el interruptor de toda la rama.

**Datos en producción.** 113 reservas (todas `origen='humano'`, del Excel),
0 citas, 10 leads reales. Las pruebas se borraron, con sus 8 eventos de Calendar.

## Lo que falta

### 1. Sincronización Sheets → `agenda_reservas` (lo grande, y no está empezado)

**El agente consulta la disponibilidad en la BASE DE DATOS, no en Calendar.** La
línea exacta, dentro de `fn_verificar_disponibilidad_evento`:

```sql
select bool_or(r.estado in ('separado','bloqueado_temporal'))
from agenda_reservas r
where r.sede_id = v_sede_id and r.fecha_solicitada = p_fecha;
```

Calendar solo se **escribe** para fechas de evento; nunca se lee. (Sí se lee,
pero para los huecos de las *citas* con el asesor, que es otra cosa.)

Consecuencia: **si el equipo escribe una fecha a mano en el Sheets, el agente NO
se entera y puede vender esa fecha.** Hoy el flujo es de una sola dirección
(base → hoja). Falta el de vuelta: un workflow programado en n8n que lea la
pestaña `Reservas` y meta en `agenda_reservas` lo que no esté, con
`origen='humano'` y `estado='separado'`.

Decisiones sin tomar, que conviene resolver antes de escribir código:
- **Cada cuánto corre.** Cada 15 min es barato y suficiente.
- **Qué pasa si una fila del Sheets choca con una del bot.** La clave única es
  `(sede_id, fecha_solicitada)`. Recomendación: gana lo que ya está en la base y
  se reporta el choque, en vez de pisarlo callando.
- **Filas mal escritas a mano.** Una sede con un nombre que no existe, una fecha
  en otro formato. No pueden tumbar la corrida ni entrar en silencio: hay que
  decidir dónde se ven esos rechazos.
- **Borrados.** Si alguien borra una fila del Sheets, ¿se libera la fecha en la
  base? Recomendación: **no** automáticamente — un borrado accidental liberaría
  una fecha vendida. Mejor una columna de estado en la hoja.

### 2. Traspaso al asesor: dos cosas de fuera

- **El número de WhatsApp del asesor.** Hoy el nodo `Avisar al Asesor` lleva el
  marcador `+570000000000`.
- **La plantilla `aviso_caso_asesor`**, en revisión de Meta.
  `node --env-file=.env scripts/plantilla-asesor.js` dice cómo va.

Con las dos, se enciende `Caso del Asesor` y se sube.

### 3. Pregunta abierta: ¿las 113 fechas deberían estar en Google Calendar?

Hoy **no** están: viven solo en la base (y ahora en el Sheets). El agente no las
puede vender, que es lo que importa. Pero el asesor que abra el Calendar no ve
esos 113 eventos vendidos. Si se quieren allá, es un volcado parecido al del
Sheets. Sin decidir.

## Guiones útiles

```bash
node scripts/probar-excel.js                              # sin red
node --env-file=.env scripts/preparar-excel.js            # estado de la hoja
node --env-file=.env scripts/migrar-reservas-a-excel.js   # qué falta por volcar
node --env-file=.env scripts/probar-caso-asesor.js --local
node --env-file=.env scripts/verificar-despliegue.js      # repo == VPS?
node --env-file=.env scripts/desplegar-vps.js --publicar
```
