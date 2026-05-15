# routes

## Propósito
Camada HTTP do backend — todos os endpoints REST registrados sob o prefixo `/api` no Fastify.

## Arquitetura
- Padrão: cada arquivo exporta uma função `async (fastify: FastifyInstance)` registrada via `fastify.register()` em `index.ts`.
- Fluxo principal: Webhook → debounce → `POST /api/chat` → `fastify.inject()` → `POST /api/chat-local` (cérebro) → LLM + tool loop → SSE → `POST /api/delivery/send`.
- Dependências internas: `../services/*`, `../utils/*`, `../config/env.ts`.
- Dependências externas: Fastify 5, undici (fetch), @supabase/supabase-js.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| chat.ts | Entry point público — delega para chat-local via fastify.inject() |
| chat-local.ts | Cérebro do agente: resolve provider, descriptografa key, monta prompt, loop de tool-calling (max 5), sanitiza stream, emite SSE |
| webhooks.ts | Recebe WAHA/Chatwoot, normaliza attachments, debounce, CRM sync, verifica AI toggle |
| delivery.ts | Entrega respostas ao Chatwoot/WAHA com retry e humanização (jitter) |
| queue.ts | Processamento de follow-ups e endpoint de cron para reminders |
| tools.ts | CRUD de configuração de tools |
| admin.ts | Endpoints admin (tenants, agents, users) |
| inventory.ts | CRUD e sync de inventário de veículos |
| hospedagem.ts | Gestão de hospedagem/lodging |
| suite-galleries.ts | Gestão de galerias de suítes |
| calendar-services.ts | Serviços de calendário/agendamento |
| contacts.ts | Gestão de contatos |
| crm-contacts.ts | Endpoints CRM |
| financeiro.ts | Campanhas financeiras |
| tenant-ai-toggle.ts | Liga/desliga IA por tenant (API externa) |
| prompts-read.ts | Leitura de configs de prompt (consumo frontend) |
| auth.ts | Proxy de autenticação |

## Decisões técnicas
- `chat-local` usa `fastify.inject()` internamente para isolar o processamento do chat — permite reutilizar sem HTTP externo.
- Fallback de modelo Gemini: quando 503 (alta demanda), tenta `gemini-2.0-flash` automaticamente.
- SSE é emitido manualmente (não usa plugin) — permite intercalar texto e comandos de mídia.
- Webhook aceita body vazio (content-type parsers customizados em index.ts).

## Convenções
- Nomes de arquivo = domínio do recurso (kebab-case).
- Cada rota valida `NEXUS_DB_URL` + key no início.
- Erros de provider retornam mensagens amigáveis em pt-BR via `providerErrorMessage()`.
- Testes ficam lado-a-lado: `chat-local.test.ts`.

## Fluxos críticos
1. `Webhook WAHA/Chatwoot → webhooks.ts (debounce + upsert contact) → chat.ts → chat-local.ts (LLM loop) → delivery.ts → Chatwoot/WAHA`
2. `Frontend sandbox → POST /api/chat → chat-local.ts → SSE response`
3. `Cron 60s → POST /api/queue/reminders → busca lembretes pendentes → envia via WAHA`

## Cuidados ao modificar
- Alterações em `chat-local.ts` exigem rodar `npm run test` no server (testes de sanitize, extract-media-commands).
- O loop de tools tem limite de 5 iterações — alterar pode causar loops infinitos com custo de tokens.
- `webhooks.ts` lida com formatos diferentes de WAHA e Chatwoot — testar ambos ao modificar.
- CORS é configurado em `index.ts`, não nas rotas individuais.
