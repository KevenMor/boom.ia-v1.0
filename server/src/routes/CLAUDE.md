# routes

## Propósito
HTTP Fastify sob `/api` (MCP sem prefixo). Cada arquivo exporta `async (fastify)` e é `fastify.register()` em `index.ts`.

## Fluxo principal
Webhook → debounce → `POST /api/chat` → `inject()` → `POST /api/chat-local` → LLM + tools (max 5) → sanitize → SSE → `POST /api/delivery/send`.

## Inventário (registradas em `index.ts`)

| Arquivo | Papel |
|---------|--------|
| chat.ts / chat-local.ts | entry + cérebro (provider, prompt, tool loop, SSE, guards Sunset) |
| webhooks.ts | WAHA/Chatwoot, attachments, debounce, CRM, AI toggle |
| delivery.ts | entrega + jitter |
| queue.ts | follow-ups + cron reminders |
| tools.ts / providers.ts | CRUD tools / LLM |
| admin.ts / me.ts | admin tenants/agents/users + perfil |
| inventory.ts / inventory-sync-referency.ts | estoque + sync Referency |
| rag.ts | ingestão/consulta RAG |
| contacts.ts / crm-contacts.ts / occurrences.ts | CRM |
| calendar-services.ts | agenda |
| financeiro.ts | campanhas |
| suite-galleries.ts / hospedagem.ts / loteamentos.ts | galeria / reservas / lotes |
| audit.ts | logs |
| tenant-ai-toggle.ts | liga/desliga IA |
| mcp.ts / mcp-keys.ts | MCP (mcp **sem** prefix `/api`) |
| prompts-read.ts | configs de prompt para o painel |
| demo.ts | sandbox público |
| embed-chatwoot.ts | mirror agente |
| embed-chatwoot-crm.ts / embed-chatwoot-crm-resources.ts | CRM embed |
| embed-chatwoot-hospedagem.ts / inventory / clients / loteamentos | embeds Mega |

**Helpers (não plugins):** `embed-auth.ts`, `hospedagem-embed-auth.ts`, `inventory-embed-auth.ts`, `loteamentos-embed-auth.ts`.

**Dead code — NÃO usar:** `auth.ts`, `payments-asaas.ts`, `webhooks-asaas.ts` (não registrados).

## Decisões
- `inject()` isola chat-local
- Gemini 503 → fallback `gemini-2.0-flash`
- SSE manual (texto + mídia intercalados)
- CORS só em `index.ts`

## Cuidados
- Tool loop max 5
- Sunset: guards em chat-local **e** prompt; testes `sunset-lodging-params.test.ts`
- Webhooks WAHA ≠ Chatwoot — testar os dois
- Não expor API keys descriptografadas
