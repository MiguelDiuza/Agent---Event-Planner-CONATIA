# Evolution API — conexión de WhatsApp

> 🗄️ **ARCHIVADO el 2026-08-23. Esto ya no es la ruta viva.**
> El VPS volvió a **YCloud**, ahora con la WABA `1102665725775760`
> ("chrisian sierra eventos") en modo coexistencia. Ver la sección *WhatsApp* de
> `docs/ESTADO-Y-CONTINUACION.md`.
>
> Lo de abajo describe el despliegue de Evolution y la ruta que estuvo viva
> entre el 20 y el 23 de agosto de 2026. **Léelo como historia**: cada vez que
> dice "activo", "ya está migrado" o "los workflows apuntan a Evolution", hoy
> es falso — esos nodos siguen en los 3 workflows con sufijo `(Evolution)`,
> `disabled` y desconectados. El contenedor y la sesión de WhatsApp del VPS no
> se tocaron; para volver hay que reconectar los nodos y reapuntar el webhook.

Pasarela de WhatsApp para el agente **Brian Otero**. Sustituye a *WhatsApp
Business Cloud* de Meta: Evolution mantiene una sesión de WhatsApp Web
(Baileys) y la expone como API REST, así que se vincula **escaneando un QR**
en vez de pasar por aprobación de Meta, verificación de empresa y plantillas.

> ⚠️ **Esto corre en el VPS, no en local.** El VPS es
> `conatia-bot.duckdns.org`, donde ya vive n8n. Los pasos 1–3 hay que
> ejecutarlos con una sesión SSH abierta contra esa máquina.

---

## Qué cambia respecto a lo que ya está construido

Antes de migrar había **dos proveedores distintos** conviviendo en el VPS, no
uno solo:

- El flujo conversacional (`Brian Otero`) mandaba por **YCloud**, un BSP de
  terceros, con nodos HTTP Request contra `api.ycloud.com` y el número
  `+573137548492`.
- El envío de medios y el seguimiento mandaban por **Meta WhatsApp Business
  Cloud**, con nodos nativos `whatsApp` y `phoneNumberId 1265360156662321`.

**Ya está migrado y verificado en el VPS.** Los 7 nodos afectados se
reemplazaron por su equivalente en Evolution:

| Workflow | Nodo | Antes | Ahora |
|---|---|---|---|
| `NsJQxBhrNyrKFVJu` Brian Otero | `WhatsApp In` | webhook YCloud | webhook Evolution |
| | `¿Mensaje entrante?` | — | **nuevo**, filtro anti-eco |
| | `Extraer Mensaje` | payload YCloud | payload Evolution |
| | `Enviar WhatsApp` | YCloud | `POST /message/sendText` |
| | `Aviso Fallo Agente` | YCloud | `POST /message/sendText` |
| `Tkh6deuiy663KNkl` enviar_medios | `Enviar Video` | Meta | `POST /message/sendMedia` |
| | `Enviar Foto` | Meta | `POST /message/sendMedia` |
| `fWtN6n18kbcYyAga` seguimiento | `Enviar Recordatorio` | Meta | `POST /message/sendText` |

### Cómo quedó archivado lo anterior

**No se borró nada.** Cada nodo viejo sigue en su workflow, renombrado con
sufijo `(YCloud)` o `(Meta)`, con `disabled: true` y desconectado del flujo.
Sus credenciales siguen asignadas, así que reactivarlo es: quitarle el
`disabled`, reconectarlo y desconectar el de Evolution. Nada que reconstruir.

El truco para que esto no rompiera nada: el nodo nuevo **hereda el nombre
original** y el viejo se queda con el sufijo. Así las expresiones que
referencian `$('Extraer Mensaje')` — hay 2 en el workflow principal — y todas
las conexiones por nombre siguieron resolviendo sin tocarlas.

### Tres detalles que salieron de leer el código fuente, no la doc

1. **El body de `sendText` es plano en v2.** La documentación publicada y el
   OpenAPI todavía muestran el formato v1 (`{"textMessage":{"text":"..."}}`).
   En el DTO de v2 `text` es top-level: `{"number":"...","text":"..."}`.
   Con el formato viejo el mensaje no sale.
2. **`media` acepta una URL pública.** El OpenAPI la declara `binary`, pero en
   el DTO de v2 es `string`. Por eso el catálogo de Supabase Storage sirve tal
   cual, sin descargar y resubir el archivo en cada envío.
3. **Números ocultos (`@lid`).** Si el cliente tiene el número oculto, el JID
   llega como `123456@lid` y hay que responder con **el JID completo**, no con
   los dígitos. Es el mismo caso que YCloud resolvía con `fromUserId`, así que
   la lógica se conservó.

### Continuidad de los leads

El `telefono` se sigue guardando en **E.164 con `+`** (`+573137548492`) aunque
Evolution entregue el JID sin él. No es cosmético: la tabla `leads` viene de
YCloud, que entregaba `+57...`. Guardarlo sin el `+` haría que cada cliente ya
existente abriera una fila nueva y perdiera su historial y su etapa de
seguimiento. La conversión a lo que Evolution espera se hace al enviar.

### El filtro anti-eco es obligatorio

`¿Mensaje entrante?` es un nodo nuevo, sin equivalente en la versión YCloud, y
no es opcional. El webhook de Evolution recibe **todos** los eventos de la
instancia, incluidos los mensajes que manda el propio bot (`fromMe: true`).
Sin ese filtro el agente se lee a sí mismo y entra en un bucle infinito de
respuestas contra el cliente.

### Lo que cambia en el modelo de negocio

- **Se acaba la ventana de 24 h y las plantillas pre-aprobadas.** El
  seguimiento puede escribir cuando quiera.
- **El riesgo se invierte.** Baileys no es oficial: WhatsApp puede banear el
  número si detecta patrón de spam. Usar un número dedicado, nunca el
  personal, y no disparar envíos masivos.

---

## Paso 1 — Levantar Evolution en el VPS

Con SSH abierto contra `conatia-bot.duckdns.org`:

```bash
# Copiar esta carpeta al VPS (desde tu máquina, o clonar el repo allá)
mkdir -p ~/evolution-api && cd ~/evolution-api
# ... subir docker-compose.yml, .env.example y crear-instancia.sh ...

cp .env.example .env
openssl rand -hex 32   # -> AUTHENTICATION_API_KEY
openssl rand -hex 16   # -> POSTGRES_PASSWORD
nano .env              # pegar ambas y revisar SERVER_URL

docker compose up -d
docker compose logs -f evolution-api    # esperar "Server running on port 8080"
```

Comprobar que responde:

```bash
curl -s http://localhost:8080 | head
```

## Paso 2 — Crear la instancia y sacar el QR

```bash
chmod +x crear-instancia.sh
./crear-instancia.sh
```

Deja el QR en `qr.png`. Para verlo hay tres caminos, en orden de comodidad:

1. **Manager web** — `http://<IP-del-VPS>:8080/manager`, entrar con la
   `AUTHENTICATION_API_KEY`. Muestra el QR en pantalla y lo **refresca solo**
   cuando expira. Es la opción recomendada.
2. **Bajarlo** — `scp usuario@vps:~/evolution-api/qr.png .` y abrirlo.
3. **En la terminal** — `qrencode -t ANSIUTF8 "$(...)"` a partir del campo
   `code` de la respuesta, si se prefiere no salir de la consola.

Escanear desde **WhatsApp → Dispositivos vinculados → Vincular dispositivo**.
El QR caduca en unos 40 segundos; si expira:

```bash
curl -s http://localhost:8080/instance/connect/brian-otero \
  -H "apikey: <AUTHENTICATION_API_KEY>"
```

Confirmar que quedó vinculado (`state` debe decir `open`):

```bash
curl -s http://localhost:8080/instance/connectionState/brian-otero \
  -H "apikey: <AUTHENTICATION_API_KEY>"
```

## Paso 3 — Exponerlo por HTTPS

Mientras se prueba, el puerto `8080` directo alcanza. Para producción hay que
ponerlo detrás del mismo reverse proxy que ya sirve n8n, en
`evolution.conatia-bot.duckdns.org`, por dos razones:

- `SERVER_URL` se usa para construir los links de fotos y videos que se envían
  al cliente. Si apunta a `http://<ip>:8080`, los medios llegan rotos.
- La `apikey` viaja en cada request; sobre HTTP plano va en claro.

> 🔒 El puerto `8080` no debería quedar abierto al mundo. Quien tenga la
> `apikey` puede escribir por WhatsApp haciéndose pasar por la empresa.
> Limitarlo al proxy con el firewall del VPS.

---

## Referencia rápida de endpoints

Todos requieren el header `apikey: <AUTHENTICATION_API_KEY>`.

| Acción | Método y ruta |
|---|---|
| Crear instancia | `POST /instance/create` |
| Pedir QR / reconectar | `GET /instance/connect/{instancia}` |
| Estado de conexión | `GET /instance/connectionState/{instancia}` |
| Enviar texto | `POST /message/sendText/{instancia}` |
| Enviar imagen o video | `POST /message/sendMedia/{instancia}` |
| Configurar webhook | `POST /webhook/instance/{instancia}` |

Eventos de webhook que interesan: `MESSAGES_UPSERT` (mensaje entrante) y
`CONNECTION_UPDATE` (avisa si el teléfono se desvincula).

Documentación oficial: <https://docs.evolutionfoundation.com.br/en/evolution-api>

---

## Estado: fue FUNCIONANDO (2026-08-20 → 2026-08-23, hoy archivado)

Desplegado, vinculado y probado de extremo a extremo en el VPS.

| Pieza | Estado |
|---|---|
| Evolution API v2.3.7 | corriendo (`evolution_api` + Postgres + Redis) |
| Sesión de WhatsApp | `open` — `573137548492`, perfil "Christian Sierra" |
| HTTPS | `evolution.conatia-bot.duckdns.org` vía Caddy, cert automático |
| Credencial n8n `CLXfTgs2zcfOhckz` | apikey real cargada |
| Webhook Evolution → n8n | `/webhook/evolution-whatsapp`, eventos `MESSAGES_UPSERT` + `CONNECTION_UPDATE` |
| Workflow `Brian Otero` | **activo** |

### Pruebas ejecutadas

| # | Qué | Resultado |
|---|---|---|
| T1 | Envío de texto por API | OK — id de mensaje real |
| T2 | End-to-end: entrante → agente → respuesta | OK — el agente contestó en personaje y la respuesta salió por WhatsApp |
| T3 | Filtro anti-eco (`fromMe: true`) | OK — se detiene en `¿Mensaje entrante?`, no llama al agente |
| T4 | Envío de imagen por URL pública | OK — llega como `imageMessage` |

En T2 el teléfono se guardó como `+573137548492`, con el `+`, que era el objetivo
del diseño: los leads que venían de YCloud no se parten en dos.

### Dos hallazgos que costaron tiempo

1. **La v2.1.1 que recomienda la documentación oficial está rota.** Entra en
   bucle de reconexión infinito con `disconnectionReasonCode: 401` y nunca
   emite el QR ([issue #2430](https://github.com/evolution-foundation/evolution-api/issues/2430)).
   Corregido en v2.3.7. **No bajar de esa versión.**
2. **El fingerprint por defecto impide vincular.** Evolution se anuncia como
   cliente `Evolution API`, que WhatsApp no reconoce, y rechaza el registro del
   dispositivo con 401 — tanto por QR como por código. Con
   `CONFIG_SESSION_PHONE_CLIENT=Ubuntu` y `CONFIG_SESSION_PHONE_NAME=Chrome`
   vincula a la primera. Cuatro intentos fallidos se explican por esto.

   Corolario: **no fijar `CONFIG_SESSION_PHONE_VERSION` en la v2.3.7.** Era un
   parche para la v2.1.1 y aquí reintroduce el 401.

### Caddy

Antes corría en modo ad-hoc (`caddy reverse-proxy --from … --to n8n:5678`), que
solo admite un sitio y tiene la admin API deshabilitada. Ahora usa un Caddyfile
en `/root/caddy/Caddyfile` con las dos rutas. `evolution_api` está conectado a
`caddy-net` además de a su red propia.

> ⚠️ Si se recrea el contenedor de `evolution_api` (`docker compose up -d
> --force-recreate`), **se suelta de `caddy-net`** y el subdominio deja de
> responder. Volver a engancharlo con
> `docker network connect caddy-net evolution_api`.

---

## Lo que queda pendiente para que funcione

Los workflows ya están cableados a Evolution. Falta que Evolution exista y
enchufar tres valores.

### 1. La `apikey` real

Se creó en n8n la credencial **`Evolution API - Christian Sierra`**
(`httpHeaderAuth`, id `CLXfTgs2zcfOhckz`), ya asignada a los 5 nodos HTTP.
Su valor está en `PENDIENTE__APIKEY_EVOLUTION`: hay que abrirla en la UI de
n8n y pegar la `AUTHENTICATION_API_KEY` del `.env` del VPS. **Un solo sitio**,
no cinco.

### 2. El webhook, en los dos sentidos

Evolution tiene que apuntar al webhook de n8n:

```
https://conatia-bot.duckdns.org/webhook/evolution-whatsapp
```

Se configura al crear la instancia (variable `WEBHOOK_N8N` de
`crear-instancia.sh`) o después:

```bash
curl -X POST http://localhost:8080/webhook/instance/brian-otero \
  -H "apikey: <clave>" -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,
       "url":"https://conatia-bot.duckdns.org/webhook/evolution-whatsapp",
       "byEvents":false,
       "events":["MESSAGES_UPSERT","CONNECTION_UPDATE"]}}'
```

> ⚠️ Esa URL de producción **solo responde con el workflow activo**. Hoy
> `Brian Otero` está inactivo. Mientras se prueba, n8n expone
> `/webhook-test/evolution-whatsapp`, que solo vive un disparo tras pulsar
> *Test workflow*.

### 3. El dominio

Los 5 nodos apuntan a `https://evolution.conatia-bot.duckdns.org`, que todavía
no existe. Si al final se expone en otro host o por el puerto `8080` directo,
hay que corregir la URL en esos 5 nodos: `Enviar WhatsApp`,
`Aviso Fallo Agente`, `Enviar Video`, `Enviar Foto` y `Enviar Recordatorio`.

### 4. Probar, en este orden

1. **Recepción** — escribirle al número y ver que llega la ejecución en n8n.
2. **Eco** — confirmar que la respuesta del bot **no** vuelve a dispararlo.
   Si el flujo corre dos veces por mensaje, `¿Mensaje entrante?` no está
   filtrando.
3. **Lead** — que no se duplique la fila: el `telefono` debe quedar `+57…`.
4. **Medios** — pedirle material y ver que llegan foto y video con su pie.
5. **Seguimiento** — activar `fWtN6n18kbcYyAga` y esperar el ciclo.

### Envío de medios — verificado en los dos proveedores

**Con Evolution (activo).** Probado de punta a punta con el catálogo real, no
con URLs de relleno: el agente pidió la herramienta, `fn_medios_para_enviar`
eligió el video, salió por `sendMedia` y `fn_registrar_envio` lo asentó.

```
pedido   : "la Mansión Vallano cómo se ve? mandame video"
elegido  : video "Recorrido de Mansión Vallano"
url      : https://jehhlnfygiaavmxgaxpz.supabase.co/storage/v1/object/public/medios/…
enviado  : videoMessage, id 3EB095929A12F4567586AF, sin error
```

Dos pruebas seguidas devolvieron **sedes distintas** (Casa 74, luego Mansión
Vallano), lo que confirma que el filtro anti-repetición funciona: no reenvía lo
que el cliente ya recibió.

**Con Meta (no ejecutable hoy, sí verificado estructuralmente).** No hay
credencial activa contra la que correrlo, así que en vez de suponer, se
comprobó que las expresiones de `Enviar Video (Meta)` y `Enviar Foto (Meta)`
resuelvan contra los datos reales que produjo la ejecución:

| Campo del nodo Meta | Resuelve a |
|---|---|
| `recipientPhoneNumber` | `+573137548492` |
| `mediaLink` | URL pública real de Supabase Storage |
| `mediaCaption` | `Así se ve Mansión Vallano ✨` |

La clave de que ambos convivan es **el formato del teléfono**: se guarda en
E.164 con `+`. Meta lo consume tal cual; el nodo de Evolution le quita el `+`
al enviar. Un solo dato en la base sirve a los dos, y por eso cambiar de
proveedor no obliga a migrar la tabla `leads`.

El resto del sub-workflow es neutral por diseño: `¿Envío exitoso?` mira
`$json.error`, que n8n rellena igual para cualquier nodo, y `Registrar Envío`
no toca la respuesta del proveedor. El motivo de fallo dice "el proveedor
rechazó el archivo", sin nombrar a ninguno.

### Volver a Meta cuando valide

**Enviar: listo.** Reactivar `Enviar Video (Meta)` / `Enviar Foto (Meta)` /
`Enviar Recordatorio (Meta)`, reconectarlos y desactivar los de Evolution.
Conservan credencial (`Meta WhatsApp - Christian Sierra`) y `phoneNumberId`
(`1265360156662321`), y ya se verificó que sus expresiones resuelven. El
filtro `¿Mensaje entrante?` es específico de Evolution — Meta no reenvía los
mensajes propios, así que ahí sobra.

> ⚠️ **Recibir: falta construirlo.** Esto es un hueco real, no un olvido.
> Lo archivado en la entrada es `WhatsApp In (YCloud)` + `Extraer Mensaje
> (YCloud)`, que parsean el payload de YCloud. **No existe un parser del
> webhook de Meta** en ninguna parte del VPS: el `whatsAppTrigger` nativo que
> figuraba en el repo fue reemplazado por la ruta de YCloud antes de esta
> migración. Cuando Meta valide habrá que escribir ese nodo de entrada.
> El contrato de salida está fijado y es fácil de cumplir: debe producir
> `{ telefono (E.164 con +), es_telefono, nombre, texto, tipo, es_texto,
> wa_message_id }`, igual que `Extraer Mensaje` y `Normalizar Chat`.
