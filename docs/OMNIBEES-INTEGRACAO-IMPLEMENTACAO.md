# Omnibees — integração Vale Suíço (Boom)

## Estado (implementado no repositório)

- **Serviço:** [`server/src/services/omnibees-availability.ts`](server/src/services/omnibees-availability.ts) — `fetch` + Cheerio, cache 10 min, datas `DDMMYYYY` ou `YYYY-MM-DD`, `execution_config` opcional (`chain_id`, `hotel_id`, etc.). O `bookingUrl` (e `hotelListingUrl`) é a listagem `https://book.omnibees.com/hotelresults?...` — abre de link externo (ex.: WhatsApp). URLs `/extras?...&roomuids=` sem `sid` de sessão costumam renderizar página em branco; não enviar ao cliente.
- **Execução:** [`server/src/services/tool-executor.ts`](server/src/services/tool-executor.ts) — `tool_type` `omnibees_availability`, função `consultar_disponibilidade_vale_suico`, validação `tenant_id` da tool vs agente.
- **Teste HTTP:** [`server/src/routes/tools.ts`](server/src/routes/tools.ts) — `POST /tools/test` com branch `omnibees_availability`.
- **Migration:** [`supabase/migrations/20260417120000_omnibees_availability_tool.sql`](supabase/migrations/20260417120000_omnibees_availability_tool.sql) — estende `CHECK` em `tools.tool_type` e faz seed da tool + `agent_tools` para tenant `vale-suico` ou `vale-suico-resort`.
- **UI / tipos:** `ToolType` em [`src/types/database.ts`](src/types/database.ts); meta e `z.enum` em Create/Edit tool dialogs.
- **Prompt:** [`server/src/services/prompts/vale-suico.ts`](server/src/services/prompts/vale-suico.ts) + versão [`registry`](server/src/services/prompts/registry.ts) `v1.1.0`.
- **Smoke test:** `cd server && npm run test:omnibees` (rede).

## O que falta no ambiente

1. Aplicar a migration no Supabase (`supabase db push` ou SQL Editor).
2. Confirmar que o slug do tenant no seed existe (`vale-suico` ou `vale-suico-resort`); se o slug for outro, ajustar o SQL ou criar a tool manualmente no painel e vincular ao agente da Vitória.
