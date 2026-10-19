# sql

## Propósito
Migrations manuais do Postgres Supabase (001–054). Aplicar no SQL Editor / psql. **Não** editar migration já aplicada — criar a próxima.

Coexiste com `supabase/migrations/` (CLI). Ao criar uma, verificar paridade.

**Lacunas:** 023 não existe. 032 e 033 têm **dois** arquivos cada (tool types vs register/link).

## Inventário (agrupado)

| Faixa | Tema |
|-------|------|
| 001–005 | control plane, RLS, data plane, memória, tools |
| 006–016 | inventory, debounce, Chatwoot, FIPE, follow-up, calendar, reminders, RPC grants |
| 017–028 | storage galerias, lodging/park Sunset, seeds, tools hospedagem |
| 029–035 | revoke key, Referency, ArtaxNet, park consulta, Flores do Lázaro |
| 036–038 | docs/contratos contato, bucket contact-files, Asaas |
| 039–040 | loteamentos + seed Reservas do Brasil |
| 041–048 | tools galeria/handoff/notification Sunset e Delta |
| 049–054 | contract templates, tenants policy, prompts dinâmicos, MCP keys, KB RPCs, assign conversa |

Arquivos-chave: `001_control_plane.sql`, `006_inventory_table.sql`, `011_follow_up_queue.sql`, `018_lodging_park_calendar_and_reservations.sql`, `038_asaas_integration.sql`, `039_lot_developments_and_lots.sql`, `052_tenant_mcp_keys.sql`.

## Convenções
- `NNN_snake_case.sql`, preferir `IF NOT EXISTS`
- RLS com `tenant_id` em tabela nova
- Seeds (021, 024, 040) misturados com DDL — não alterar seed antigo em prod

## Cuidados
- Testar anon (RLS) e service_role
- Próximo número: **055**
