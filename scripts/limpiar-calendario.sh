#!/bin/bash
# Borra del Google Calendar los eventos huerfanos listados en
# .respaldo-2026-08-26/google-event-ids.tsv (eventos cuyas filas ya no estan
# en la base). Usa el service account .gcp-sa-n8n-calendar.json.
#
#   bash scripts/limpiar-calendario.sh          # muestra que borraria
#   bash scripts/limpiar-calendario.sh --borrar # borra de verdad
set -euo pipefail
cd "$(dirname "$0")/.."
CAL=christianeventos.bot%40gmail.com
TSV=.respaldo-2026-08-26/google-event-ids.tsv

JWT=$(node -e '
const crypto=require("crypto"),fs=require("fs");
const sa=JSON.parse(fs.readFileSync(".gcp-sa-n8n-calendar.json","utf8"));
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const now=Math.floor(Date.now()/1000);
const head=b64({alg:"RS256",typ:"JWT"});
const body=b64({iss:sa.client_email,scope:"https://www.googleapis.com/auth/calendar",
  aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600});
console.log(head+"."+body+"."+crypto.sign("RSA-SHA256",Buffer.from(head+"."+body),sa.private_key).toString("base64url"));
')
TOK=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer \
  --data-urlencode "assertion=$JWT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')

[ "${1:-}" = "--borrar" ] && MODO=borrar || MODO=simular
echo "modo: $MODO"
OK=0; FALTA=0
while IFS=$'\t' read -r ID CLIENTE CUANDO QUE; do
  [ "$ID" = "google_event_id" ] && continue
  [ -z "$ID" ] && continue
  if [ "$MODO" = "borrar" ]; then
    CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOK" \
      "https://www.googleapis.com/calendar/v3/calendars/$CAL/events/$ID")
  else
    CODE=$(curl -s -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer $TOK" \
      "https://www.googleapis.com/calendar/v3/calendars/$CAL/events/$ID")
  fi
  case "$CODE" in
    200|204) OK=$((OK+1));  echo "  ok   $CODE  $CUANDO  $CLIENTE  ($QUE)" ;;
    404|410) FALTA=$((FALTA+1)); echo "  ya no existe  $CLIENTE  ($QUE)" ;;
    *)       echo "  FALLO $CODE  $ID  $CLIENTE" ;;
  esac
done < "$TSV"
echo "---"
echo "procesados: $OK | ya no estaban: $FALTA"
[ "$MODO" = simular ] && echo "Nada se borro. Corre con --borrar para hacerlo."
