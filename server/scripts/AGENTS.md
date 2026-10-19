# server/scripts

## Contexto rápido
E2E e verify do backend. `cd server && npx tsx scripts/<arquivo>.ts`. npm: `verify:tools`, `verify:tokens`, `e2e`.

## Como modificar
1. Novo verify: `verify-*.ts` + documentar no cabeçalho
2. Novo E2E: `e2e-<tenant>-<fluxo>.ts` — resultado em `docs/E2E-*.md` se for relatório
3. Destrutivo: exigir confirmação explícita no próprio script

## Regras
- Nunca migration em prod sem backup
- Nunca commitar output com secrets
- Usar `createNexusClient()` / env do server, não inventar outro client
