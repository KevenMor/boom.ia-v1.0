# scripts

## Propósito
Scripts de automação — E2E visual (PowerShell) e utilitários de verificação/migração (TypeScript no server).

## Arquitetura
- `scripts/` (raiz): PowerShell scripts para testes E2E visuais.
- `server/scripts/`: TypeScript scripts para verificação, migração e testes de integração.
- Executados manualmente ou via npm scripts.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| scripts/e2e-gallery-visual.ps1 | Teste E2E visual de galerias |
| server/scripts/e2e-validation.ts | Runner de validação E2E |
| server/scripts/verify-agent-tools.ts | Verifica configuração de tools dos agentes |
| server/scripts/verify-token-tracking.ts | Verifica setup de tracking de tokens |
| server/scripts/run-token-migration.ts | Migração de token tracking |
| server/scripts/remove-unimplemented-tools.ts | Limpa tools não implementadas do banco |
| server/scripts/test-autoescola-nearest-unit.ts | Teste de unidade mais próxima |
| server/scripts/export-vale-suico-n8n-json.ts | Exporta dados para n8n |
| server/scripts/e2e-vale-suico-orcamento.ts | E2E de orçamento Vale Suíço |

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
