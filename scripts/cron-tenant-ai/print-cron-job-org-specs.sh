#!/usr/bin/env bash
# Gera as especificações prontas para colar no cron-job.org (2 jobs por tenant com schedule_enabled).
# Uso:
#   export TENANT_AI_TOGGLE_SECRET='...'   # mesmo valor do Portainer
#   ./scripts/cron-tenant-ai/print-cron-job-org-specs.sh
#   ./scripts/cron-tenant-ai/print-cron-job-org-specs.sh --slug sunset-thermas-park
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CFG="$ROOT/tenants.json"
SECRET="${TENANT_AI_TOGGLE_SECRET:-}"
FILTER_SLUG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) FILTER_SLUG="${2:-}"; shift 2 ;;
    *) echo "Uso: $0 [--slug SLUG]"; exit 1 ;;
  esac
done

if [[ -z "$SECRET" ]]; then
  echo "Defina TENANT_AI_TOGGLE_SECRET (mesmo do server / Portainer)." >&2
  exit 1
fi

python3 - "$CFG" "$SECRET" "$FILTER_SLUG" <<'PY'
import json, sys

cfg_path, secret, filter_slug = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(cfg_path))
base = cfg["api_base_url"].rstrip("/")
tz = cfg["timezone"]
sched = cfg["schedule"]
url = f"{base}/api/tenant-ai/toggle"

tenants = [t for t in cfg["tenants"] if t.get("schedule_enabled")]
if filter_slug:
    tenants = [t for t in cfg["tenants"] if t["slug"] == filter_slug]
    if not tenants:
        print(f"Slug não encontrado: {filter_slug}", file=sys.stderr)
        sys.exit(1)

print("=" * 72)
print("cron-job.org — Boom IA tenant toggle")
print(f"Timezone: {tz}")
print(f"URL:      {url}")
print(f"Header:   x-tenant-ai-toggle-secret: <TENANT_AI_TOGGLE_SECRET>")
print(f"Header:   Content-Type: application/json")
print(f"Method:   POST")
print("=" * 72)

for t in tenants:
    tid = t["tenant_id"]
    slug = t["slug"]
    name = t.get("name") or slug
    for enabled, cron, label in (
        (True, sched["enable_cron"], sched["enable_label"]),
        (False, sched["disable_cron"], sched["disable_label"]),
    ):
        action = "LIGAR" if enabled else "DESLIGAR"
        title = f"Boom IA — {action} — {slug}"
        body = json.dumps({"tenant_id": tid, "enabled": enabled}, separators=(",", ":"))
        print()
        print("-" * 72)
        print(f"Title:        {title}")
        print(f"Tenant:       {name} ({tid})")
        print(f"Schedule:     {cron}  ({label})")
        print(f"Timezone:     {tz}")
        print(f"Request URL:  {url}")
        print(f"HTTP Method:  POST")
        print("Request Headers:")
        print("  Content-Type: application/json")
        print(f"  x-tenant-ai-toggle-secret: {secret}")
        print("Request Body:")
        print(f"  {body}")
        print()
        print("# curl de teste manual:")
        print(
            "curl -sS -X POST "
            f"'{url}' "
            "-H 'Content-Type: application/json' "
            f"-H 'x-tenant-ai-toggle-secret: {secret}' "
            f"-d '{body}'"
        )

print()
print(f"Total de jobs a criar: {len(tenants) * 2} ({len(tenants)} tenant(s) × 2)")
PY
