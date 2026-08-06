# cron-tenant-ai

Agenda liga/desliga de IA via cron-job.org → `POST /api/tenant-ai/toggle`.

## Arquivos

| Arquivo | Uso |
|---------|-----|
| `tenants.json` | UUIDs + `schedule_enabled` + horário (America/Sao_Paulo) |
| `jobs-manifest.json` | 16 jobs prontos (8 tenants × 2) — gerado a partir do tenants.json |
| `print-cron-job-org-specs.sh` | Imprime campos para colar no site |
| `sync-cron-job-org.mjs` | Cria/atualiza jobs via API do cron-job.org |
| `smoke-test-toggle.sh` | Testa status + toggle e restaura o estado |

## Portainer

Confirme `TENANT_AI_TOGGLE_SECRET` no env do container **server** (já ativo em produção se `/api/tenant-ai/status` responde 401 sem header e 200 com secret).

## Criar jobs no cron-job.org

### Opção A — API (recomendado)

1. Em [cron-job.org](https://cron-job.org) → Settings → API → criar API key  
2. No terminal:

```bash
cd /Users/noname/Documents/boom.ia-v1.0
export TENANT_AI_TOGGLE_SECRET='(mesmo do Portainer)'
export CRONJOB_ORG_API_KEY='(api key)'
node scripts/cron-tenant-ai/sync-cron-job-org.mjs --dry-run   # confere
node scripts/cron-tenant-ai/sync-cron-job-org.mjs             # cria 16 jobs
```

### Opção B — manual no site

```bash
export TENANT_AI_TOGGLE_SECRET='...'
./scripts/cron-tenant-ai/print-cron-job-org-specs.sh
```

Para cada bloco: Create cronjob → POST → URL/headers/body + timezone `America/Sao_Paulo`.

## Horário padrão

- Ligar: `0 8 * * 1-5` (08:00 seg–sex)
- Desligar: `0 22 * * 1-5` (22:00 seg–sex)

Edite `tenants.json` (`schedule_enabled` / crons) e rode o sync de novo.

## Smoke test

```bash
export TENANT_AI_TOGGLE_SECRET='...'
./scripts/cron-tenant-ai/smoke-test-toggle.sh
```
