#!/usr/bin/env bash
# =============================================================================
# Instalador de un solo paso — SE EJECUTA DENTRO DEL VPS, no en Windows.
# =============================================================================
# Levanta Evolution API, crea la instancia de WhatsApp y pinta el QR como
# texto en la terminal, para poder escanearlo desde la misma sesion SSH sin
# tener que bajar ningun archivo.
#
# Es idempotente: si ya hay .env no regenera las claves, y si la instancia ya
# existe pide un QR nuevo en vez de fallar.
# =============================================================================
set -euo pipefail

DIR=~/evolution-api
INSTANCIA=brian-otero
WEBHOOK_N8N=https://conatia-bot.duckdns.org/webhook/evolution-whatsapp

echo "==> 1/6 Dependencias"
if ! command -v docker >/dev/null 2>&1; then
  echo "    instalando docker..."
  curl -fsSL https://get.docker.com | sh
fi
# qrencode es lo que permite ver el QR sin interfaz grafica.
if ! command -v qrencode >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq qrencode jq >/dev/null
fi

echo "==> 2/6 Archivos en $DIR"
mkdir -p "$DIR" && cd "$DIR"

cat > docker-compose.yml <<'COMPOSE'
services:
  evolution-api:
    container_name: evolution_api
    image: evoapicloud/evolution-api:v2.3.7
    restart: always
    ports:
      - "8080:8080"
    env_file: [.env]
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      postgres: {condition: service_healthy}
      redis:    {condition: service_started}
  postgres:
    container_name: evolution_postgres
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution
    volumes: [evolution_pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution -d evolution"]
      interval: 5s
      timeout: 5s
      retries: 10
  redis:
    container_name: evolution_redis
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes: [evolution_redis:/data]
volumes:
  evolution_instances:
  evolution_pgdata:
  evolution_redis:
COMPOSE

# Las claves se generan una sola vez. Regenerarlas desvincularia el telefono
# y dejaria la credencial de n8n apuntando a una clave que ya no vale.
if [ ! -f .env ]; then
  echo "    generando claves nuevas"
  APIKEY=$(openssl rand -hex 32)
  PGPASS=$(openssl rand -hex 16)
  cat > .env <<ENVFILE
AUTHENTICATION_API_KEY=$APIKEY
POSTGRES_PASSWORD=$PGPASS
SERVER_URL=https://evolution.conatia-bot.duckdns.org
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:$PGPASS@postgres:5432/evolution?schema=public
DATABASE_CONNECTION_CLIENT_NAME=evolution
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=false
DATABASE_SAVE_DATA_CONTACTS=false
DATABASE_SAVE_DATA_CHATS=false
DATABASE_SAVE_DATA_LABELS=false
DATABASE_SAVE_DATA_HISTORIC=false
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false
WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_BY_EVENTS=false
QRCODE_LIMIT=30
DEL_INSTANCE=false
REJECT_CALL=false
READ_MESSAGES=false
ALWAYS_ONLINE=false
CONFIG_SESSION_PHONE_CLIENT=Ubuntu
CONFIG_SESSION_PHONE_NAME=Chrome
LOG_LEVEL=ERROR,WARN,INFO
LOG_BAILEYS=error
ENVFILE
  chmod 600 .env
else
  echo "    .env ya existe, se conserva"
fi

APIKEY=$(grep '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2-)

echo "==> 3/6 Levantando contenedores"
docker compose up -d

echo "==> 4/6 Esperando a que la API responda"
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 http://localhost:8080 >/dev/null 2>&1; then
    echo "    lista (${i}s)"; break
  fi
  [ "$i" = 60 ] && { echo "ERROR: no arranco. docker compose logs evolution-api"; exit 1; }
  sleep 1
done

echo "==> 5/6 Creando instancia '$INSTANCIA'"
RESP=$(curl -sS --max-time 30 -X POST http://localhost:8080/instance/create \
  -H "apikey: $APIKEY" -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"$INSTANCIA\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\",
       \"webhook\":{\"enabled\":true,\"url\":\"$WEBHOOK_N8N\",\"byEvents\":false,
       \"events\":[\"MESSAGES_UPSERT\",\"CONNECTION_UPDATE\"]}}" || true)

CODE=$(echo "$RESP" | jq -r '.qrcode.code // empty')
# Si ya existia, /instance/create falla pero /instance/connect entrega un QR nuevo.
if [ -z "$CODE" ]; then
  echo "    la instancia ya existia, pidiendo QR nuevo"
  CODE=$(curl -sS --max-time 30 "http://localhost:8080/instance/connect/$INSTANCIA" \
    -H "apikey: $APIKEY" | jq -r '.code // empty')
fi

echo "==> 6/6 QR"
if [ -z "$CODE" ]; then
  ESTADO=$(curl -sS "http://localhost:8080/instance/connectionState/$INSTANCIA" -H "apikey: $APIKEY" | jq -r '.instance.state // "?"')
  if [ "$ESTADO" = "open" ]; then
    echo "    Ya esta CONECTADO, no hace falta escanear nada."
  else
    echo "    No llego QR. Estado: $ESTADO"; echo "$RESP" | head -c 600
  fi
else
  echo
  qrencode -t ANSIUTF8 "$CODE"
  echo
  echo "    Escanealo YA: WhatsApp > Dispositivos vinculados > Vincular dispositivo."
  echo "    Caduca en ~40s. Si expira, volve a correr este script."
fi

echo
echo "============================================================"
echo " APIKEY (pegala en la credencial de n8n):"
echo "   $APIKEY"
echo "============================================================"
echo " Reverse proxy detectado:"
for c in caddy traefik nginx; do
  docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i "$c" && true
done
ss -tlnp 2>/dev/null | grep -E ':(80|443)\s' | head -3 || true
echo "============================================================"
