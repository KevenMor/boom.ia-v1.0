# sql

## Contexto rápido
Migrations SQL manuais do banco Postgres (Supabase) — schema, RLS, tabelas de domínio e seeds de dados.

## Stack e ferramentas
- PostgreSQL (Supabase)
- SQL puro
- Aplicação manual (SQL Editor do Supabase ou psql)

## Como modificar

### Adicionar uma feature (nova tabela/coluna)
1. Criar `sql/NNN_descricao.sql` (próximo número sequencial)
2. Usar `CREATE TABLE IF NOT EXISTS` ou `ALTER TABLE`
3. Adicionar RLS policy com filtro por `tenant_id`
4. Aplicar no Supabase SQL Editor
5. Regenerar tipos: `npx supabase gen types typescript`

### Corrigir um bug
1. Nunca alterar migration existente já aplicada
2. Criar nova migration com `ALTER TABLE` ou `DROP POLICY` + `CREATE POLICY`
3. Testar com anon key (RLS ativo) e service_role (RLS bypass)

### Refatorar
1. Não renumerar migrations existentes
2. Não mesclar DDL com seeds em produção
3. Manter backward compatibility (não dropar colunas em uso)

## Comandos úteis
```bash
# aplicar migration via psql
psql $DATABASE_URL -f sql/NNN_nova_migration.sql

# regenerar tipos TS
npx supabase gen types typescript --project-id=PROJECT_ID > src/integrations/supabase/types.ts

# verificar schema atual
psql $DATABASE_URL -c "\dt public.*"
```

## Regras invioláveis
- Nunca alterar migration já aplicada em produção
- Sempre adicionar RLS policy em tabelas novas
- Sempre filtrar por tenant_id nas policies
- Nunca dropar tabela/coluna sem verificar código dependente
- Sempre testar com anon key (simula frontend)

## Mapa de dependências
```
sql/
├── expõe para → server (via Supabase client queries)
├── expõe para → frontend (via hooks + Supabase client)
├── expõe para → supabase/functions/ (via Supabase client)
└── depende de → Supabase Postgres instance
```
