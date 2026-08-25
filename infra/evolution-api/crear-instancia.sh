#!/usr/bin/env bash
# =============================================================================
# Crea la instancia de WhatsApp en Evolution API y guarda el QR como PNG.
# =============================================================================
# Uso, desde esta carpeta en el VPS:
#     ./crear-instancia.sh
#
# Lee la clave del `.env` de al lado, asi no hay que pegarla en la terminal
# (donde quedaria en el historial de bash).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

[ -f .env ] || { echo "ERROR: no existe .env. Copialo de .env.example."; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

API="${EVOLUTION_LOCAL_URL:-http://localhost:8080}"
INSTANCIA="${INSTANCIA:-brian-otero}"
# El Webhook Trigger de n8n que recibira los mensajes entrantes.
# Se rellena cuando exista ese nodo; vacio = instancia sin webhook.
WEBHOOK_N8N="${WEBHOOK_N8N:-}"

if [ -z "${AUTHENTICATION_API_KEY:-}" ]; then
  echo "ERROR: AUTHENTICATION_API_KEY vacia en .env"; exit 1
fi

echo "==> Verificando que Evolution responda en $API"
curl -fsS --max-time 10 "$API" >/dev/null || {
  echo "ERROR: Evolution no responde. Revisa: docker compose logs -f evolution-api"; exit 1; }

# El webhook solo se manda si hay URL; Evolution rechaza url vacia.
if [ -n "$WEBHOOK_N8N" ]; then
  WEBHOOK_JSON=$(cat <<JSON
,"webhook":{"enabled":true,"url":"$WEBHOOK_N8N","byEvents":false,
"events":["MESSAGES_UPSERT","CONNECTION_UPDATE"]}
JSON
)
else
  WEBHOOK_JSON=""
  echo "    (sin webhook: WEBHOOK_N8N no esta definida — se puede agregar despues)"
fi

echo "==> Creando instancia '$INSTANCIA'"
RESP=$(curl -fsS --max-time 30 -X POST "$API/instance/create" \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"$INSTANCIA\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"$WEBHOOK_JSON}")

# El QR llega como data-URL base64; hay que quitarle el prefijo antes de decodificar.
echo "$RESP" | python3 -c '
import sys, json, base64
d = json.load(sys.stdin)
b64 = (d.get("qrcode") or {}).get("base64")
if not b64:
    print("Sin QR en la respuesta. Puede que la instancia ya exista y este conectada.")
    print(json.dumps(d, indent=2, ensure_ascii=False)[:800]); sys.exit(1)
open("qr.png","wb").write(base64.b64decode(b64.split(",",1)[-1]))
print("QR guardado en qr.png")
'

echo
echo "Escanealo desde WhatsApp > Dispositivos vinculados > Vincular dispositivo."
echo "El QR caduca en ~40s; si expira, volver a pedirlo con:"
echo "  curl -s \"\$API/instance/connect/$INSTANCIA\" -H \"apikey: \$AUTHENTICATION_API_KEY\""
echo
echo "Verificar que quedo conectado:"
echo "  curl -s \"$API/instance/connectionState/$INSTANCIA\" -H \"apikey: <clave>\""
