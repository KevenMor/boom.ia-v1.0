# scripts

## Propósito
Scripts de automação: embeds Chatwoot (HTML + geradores), cron toggle IA, E2E visual. Scripts TS de dados ficam em `server/scripts/` (doc própria).

## Arquitetura
- `scripts/` (raiz): PowerShell scripts para testes E2E visuais.
- `server/scripts/`: TypeScript scripts para verificação, migração e testes de integração.
- Executados manualmente ou via npm scripts.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| chatwoot-*.script.html / chatwoot-generate-*.mjs / chatwoot-install-*.mjs | apps dashboard Mega |
| tenants/*.script.html | embeds por tenant (Delta, PPL, Sunset, Dr Iuri, Autoescola Ideal) |
| cron-tenant-ai/ | sync cron-job.org do toggle IA |
| e2e-gallery-visual.ps1 | E2E visual galerias |
| server/scripts/* | E2E/verify TS — ver `server/scripts/CLAUDE.md` |

## Decisões técnicas
- Scripts TS usam tsx/ts-node para execução direta.
- E2E scripts são manuais (não CI) — resultados em `docs/E2E-*.md`.
- Scripts de verificação são idempotentes (safe to re-run).

## Convenções
- PowerShell para E2E visual (screenshots).
- TypeScript para scripts de dados/verificação.
- Prefixo descritivo: `e2e-*`, `verify-*`, `run-*`, `export-*`.

## Fluxos críticos
1. `Dev → npx tsx server/scripts/verify-agent-tools.ts → relatório de inconsistências`
2. `Dev → ./scripts/e2e-gallery-visual.ps1 → screenshots em e2e-screenshots/`

## Cuidados ao modificar
- Scripts de migração alteram dados em produção — testar em staging primeiro.
- `remove-unimplemented-tools.ts` deleta dados — confirmar antes de rodar.
- E2E scripts dependem de server rodando.
