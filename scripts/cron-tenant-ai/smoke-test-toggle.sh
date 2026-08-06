# Smoke test: GET status + POST toggle (restaura o estado original).
# Uso:
#   export TENANT_AI_TOGGLE_SECRET='...'
#   ./scripts/cron-tenant-ai/smoke-test-toggle.sh
#   ./scripts/cron-tenant-ai/smoke-test-toggle.sh bc4a1dc9-a205-4b4b-9b6c-47bf677a2728
set -euo pipefail

API_BASE="${API_BASE_URL:-https://ia.agboom.com.br}"
API_BASE="${API_BASE%/}"
SECRET="${TENANT_AI_TOGGLE_SECRET:-}"
# Default: PPL Motors (atualmente usada no Mega script; preferencialmente inativa para teste)
TENANT_ID="${1:-bc4a1dc9-a205-4b4b-9b6c-47bf677a2728}"

if [[ -z "$SECRET" ]]; then
  echo "Defina TENANT_AI_TOGGLE_SECRET" >&2
  exit 1
fi

hdr=(-H "x-tenant-ai-toggle-secret: ${SECRET}" -H "Accept: application/json" -H "Content-Type: application/json")

echo "== GET status =="
STATUS=$(curl -sS "${API_BASE}/api/tenant-ai/status?tenant_id=${TENANT_ID}" "${hdr[@]}")
echo "$STATUS"
ORIG=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print("true" if d.get("agents_all_active") else "false")' <<<"$STATUS")
echo "original agents_all_active=${ORIG}"

FLIP=$(python3 -c 'import sys; print("false" if sys.argv[1]=="true" else "true")' "$ORIG")
echo "== POST toggle enabled=${FLIP} =="
TOGGLED=$(curl -sS -X POST "${API_BASE}/api/tenant-ai/toggle" "${hdr[@]}" \
  -d "{\"tenant_id\":\"${TENANT_ID}\",\"enabled\":${FLIP}}")
echo "$TOGGLED"
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("ok") is True, d; print("toggle ok")' <<<"$TOGGLED"

echo "== GET status após flip =="
MID=$(curl -sS "${API_BASE}/api/tenant-ai/status?tenant_id=${TENANT_ID}" "${hdr[@]}")
echo "$MID"
MID_ACTIVE=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print("true" if d.get("agents_all_active") else "false")' <<<"$MID")
if [[ "$MID_ACTIVE" != "$FLIP" ]]; then
  echo "ERRO: esperado agents_all_active=${FLIP}, got ${MID_ACTIVE}" >&2
  exit 1
fi

echo "== restaurar enabled=${ORIG} =="
REST=$(curl -sS -X POST "${API_BASE}/api/tenant-ai/toggle" "${hdr[@]}" \
  -d "{\"tenant_id\":\"${TENANT_ID}\",\"enabled\":${ORIG}}")
echo "$REST"
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("ok") is True, d' <<<"$REST"

FINAL=$(curl -sS "${API_BASE}/api/tenant-ai/status?tenant_id=${TENANT_ID}" "${hdr[@]}")
FINAL_ACTIVE=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print("true" if d.get("agents_all_active") else "false")' <<<"$FINAL")
if [[ "$FINAL_ACTIVE" != "$ORIG" ]]; then
  echo "ERRO ao restaurar: esperado ${ORIG}, got ${FINAL_ACTIVE}" >&2
  exit 1
fi

echo "OK smoke-test tenant=${TENANT_ID} restaurado=${ORIG}"
echo "Webhook: com agentes inactive, Chatwoot retorna saved_no_ai (ver webhooks.ts)."
