# routes

## Contexto rápido
Endpoints REST Fastify sob `/api` — recebem webhooks, processam chat com LLM, entregam mensagens e expõem CRUD do painel admin.

## Stack e ferramentas
- TypeScript, Fastify 5
- Supabase JS (via `createNexusClient()`)
- SSE manual para streaming de respostas
- Vitest para testes

## Como modificar

### Adicionar uma feature
1. Criar arquivo em `server/src/routes/novo-recurso.ts`
2. Exportar `async function novoRecursoRoutes(fastify: FastifyInstance)`
3. Registrar em `server/src/index.ts`: `fastify.register(novoRecursoRoutes, { prefix: "/api" })`
4. Seguir padrão: validar env no início, usar `createNexusClient()`, retornar JSON

### Corrigir um bug
1. Verificar logs do Fastify (pino-pretty em dev)
2. Para bugs no chat: olhar `chat-local.ts` (loop de tools, sanitização)
3. Para bugs de webhook: olhar `webhooks.ts` (formato do payload WAHA vs Chatwoot)
4. Rodar `npm run test` no server/

### Refatorar
1. Não mover lógica de negócio para as rotas — manter em `../services/`
2. Não alterar a interface SSE sem atualizar o frontend (ConversationMessagesView)
3. Não remover content-type parsers de `index.ts` sem testar webhooks

## Comandos úteis
```bash
# rodar testes
cd server && npm run test

# rodar servidor em dev
cd server && npm run dev

# testar endpoint manualmente
curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"agent_id":"...","message":"oi"}'
```

## Regras invioláveis
- Nunca expor API keys descriptografadas em responses
- Nunca remover o limite de 5 iterações do tool loop sem aprovação
- Nunca alterar o formato SSE sem atualizar o frontend
- Sempre validar NEXUS_DB_URL/key antes de criar o client Supabase

## Mapa de dependências
```
routes/
├── consome → ../services/ (tool-executor, delivery, supabase, crypto, prompts)
├── consome → ../utils/ (sanitize, extract-media-commands, agendaNotification)
├── consome → ../config/env.ts
├── expõe para → frontend (via /api/*)
├── expõe para → WAHA/Chatwoot (webhooks)
└── depende de env → NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY, ENCRYPTION_KEY, OPENAI_API_KEY, GEMINI_API_KEY
```
