# server/scripts

## Propósito
Scripts TS operacionais do backend (tsx): E2E, auditoria de tools/tokens, migrations pontuais. Não são o server HTTP.

## Inventário
| Script | Papel |
|--------|--------|
| e2e-validation.ts | runner E2E genérico (`npm run e2e`) |
| e2e-sunset-orcamento.ts / e2e-vale-suico-orcamento.ts / e2e-flores-lazaro-orcamento.ts | E2E orçamento por tenant |
| verify-agent-tools.ts | tools vinculadas vs implementadas |
| verify-token-tracking.ts | tracking de tokens |
| verify-artaxnet-rooms.ts | ArtaxNet (Flores) |
| run-token-migration.ts / run-migration-054.ts | migrations pontuais |
| remove-unimplemented-tools.ts | **destrutivo** — confirma lista antes |
| export-vale-suico-n8n-json.ts | export n8n |
| test-sunset-*.ts / test-autoescola-nearest-unit.ts / simulate-cleide-e2e.ts | testes manuais |

## Convenções
- Prefixo: `e2e-` `verify-` `run-` `test-`
- Usar `server/.env`. Idempotentes quando possível.

## Cuidados
- Não rodar `remove-unimplemented-tools` nem `run-migration-*` em produção sem backup
- E2E assume server no ar
