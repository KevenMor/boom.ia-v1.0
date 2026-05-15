# sql

## Propósito
Migrations SQL manuais para o banco Supabase (Postgres) — definem schema, RLS, tabelas de domínio e seeds.

## Arquitetura
- Migrations numeradas sequencialmente (001-028).
- Aplicadas manualmente ou via scripts — NÃO usam Supabase CLI migrations.
- Cobrem: control plane (tenants, agents, tools, providers), inventário, follow-ups, calendário, hospedagem, storage.
- Dependências: Supabase Postgres com extensões padrão.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| 001_control_plane.sql | Tabelas core: tenants, agents, tools, providers, conversations, messages + RLS |
| 002_fix_rls_recursion.sql | Fix de recursão infinita em RLS policies |
| 004_conversation_memory.sql | Memória/contexto de conversas |
| 006_inventory_table.sql | Tabela de inventário de veículos |
| 007_message_debounce_buffer.sql | Buffer de debounce para webhooks |
| 011_follow_up_queue.sql | Tabela de fila de follow-ups |
| 015_appointment_reminders.sql | Lembretes de agendamento |
| 018_lodging_park_calendar_and_reservations.sql | Calendário e reservas de hospedagem |

## Decisões técnicas
- Numeração manual (não timestamp) — mais legível mas exige coordenação.
- RLS por tenant_id em todas as tabelas de dados.
- Separação entre `sql/` (manual) e `supabase/migrations/` (CLI) — coexistem.
- Seeds de dados (021, 024) misturados com DDL — idealmente separar.

## Convenções
- Prefixo numérico de 3 dígitos: `001_`, `002_`, etc.
- Nome descritivo em snake_case após o número.
- Cada arquivo é idempotente quando possível (IF NOT EXISTS).

## Fluxos críticos
1. `Nova feature → criar migration NNN_nome.sql → aplicar no Supabase (SQL Editor ou psql)`
2. `Deploy → verificar se migrations pendentes foram aplicadas`

## Cuidados ao modificar
- Nunca alterar migrations já aplicadas em produção — criar nova migration.
- RLS policies devem sempre filtrar por tenant_id.
- Testar com service_role E anon key (RLS se aplica diferente).
- Verificar se `supabase/migrations/` não tem conflito com `sql/`.
