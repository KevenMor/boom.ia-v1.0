# CLAUDE.md — Boom IA / boom-agents

Contexto permanente do projeto para sessões do Claude Code. Mantenha este arquivo curto e atualizado: ele é carregado em toda conversa.

## 1. Visão geral

**Boom IA / Nexus AI** é uma plataforma SaaS multi-tenant de **agentes de IA conversacionais** (WhatsApp/Chatwoot/WAHA) com painel administrativo web. Cada tenant tem um agente com prompt próprio, ferramentas (tools) e integrações (estoque, calendário, hospedagem, FIPE, Omnibees, etc.).

- **Tipo:** monorepo (frontend + backend Node) com Supabase como data plane.
- **Linguagem principal:** TypeScript.
- **Stack frontend:** Vite + React 18 + shadcn/ui + Tailwind + React Router + TanStack Query.
- **Stack backend:** Fastify 5 + Supabase JS + BullMQ (Redis opcional) + undici.
- **Banco:** Supabase (Postgres + Auth + Storage + Edge Functions).
- **Origem:** projeto inicial gerado pelo Lovable (`lovable-tagger`, `.lovable/`); README é o template padrão (ignorar como documentação real).

## 2. Layout do repositório

```
/                       Raiz: configs, Dockerfiles, docker-compose.* (vários alvos: local, Portainer, Traefik, GHCR)
├── src/                Frontend Vite/React (painel admin)
│   ├── pages/          Telas (Dashboard, Agents, Tenants, Conversations, Calendar, Hospedagem, etc.)
│   ├── components/     UI shadcn + componentes de domínio (agents, chat, calendar, hospedagem, ...)
│   ├── contexts/       AuthContext, TenantContext, SidebarContext
│   ├── hooks/          React Query hooks por recurso (useAgents, useTenants, useConversations, ...)
│   ├── integrations/supabase/  Cliente Supabase (`client.ts`, `nexus-client.ts`, `types.ts`)
│   ├── lib/            Utilitários puros (datetime BR, csv, viacep, image guards, RAG preview)
│   └── test/           Testes Vitest (alguns *.test.ts no próprio lib/)
│
├── server/             Backend Fastify (API + workers)
│   └── src/
│       ├── index.ts        Bootstrap Fastify, CORS, proxy /api/supabase-proxy/*, ensureStorageBuckets, crons (followup, reminder)
│       ├── routes/         Endpoints REST (chat, chat-local, webhooks, tools, admin, inventory, hospedagem, ...)
│       ├── services/       Lógica de negócio (tool-executor, prompts/, supabase, fipe, omnibees, lodging, crypto)
│       │   └── prompts/    Prompts por tenant (ppl-motors, pet-home, vale-suico, sunset-thermas, ...) + registry
│       ├── workers/        BullMQ workers (followup, financeiro-campaign)
│       ├── utils/          Sanitização stream LLM, extração de comandos de mídia, agendaNotification, brasiliaTime
│       └── config/env.ts
│
├── supabase/
│   ├── migrations/     Migrations versionadas (timestamp_*.sql)
│   └── functions/      Edge Functions Deno (conversation-history, e2e-inspector, new-contact, public-agent-info, send-operator-message)
│
├── sql/                Migrations manuais numeradas (001..026) — control plane, tools, hospedagem, FIPE, calendar
├── docker/             Configs proxy/Traefik/Caddy + docs de deploy Portainer
├── docs/               Documentação operacional (E2E reports, hospedagem, deploy, paridade dev/prod)
├── scripts/            Scripts E2E PowerShell
├── server/scripts/     Scripts TS para verificação/migração
└── public/, dist/      Estáticos / build do frontend
```

## 3. Configuração e deploy

- **Variáveis de ambiente:** `.env.example` (raiz) + `server/.env`. Chaves principais:
  - `NEXUS_DB_URL`, `NEXUS_SERVICE_ROLE_KEY`, `NEXUS_DB_ANON_KEY` (Supabase próprio do tenant)
  - `ENCRYPTION_KEY` (mín. 32 chars, criptografa API keys de providers)
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (frontend)
  - `OPENAI_API_KEY` / `GEMINI_API_KEY` (fallback se provider em DB falhar)
  - `GOOGLE_MAPS_API_KEY` (consultar_unidade — sem ela usa Haversine)
  - `CORS_ORIGINS`, `USE_CHAT_LOCAL`, `USE_CHAT_LOCAL_INJECT`, `INTERNAL_API_INSECURE_TLS`
  - Redis opcional (BullMQ): se ausente, fallback para cron `setInterval` (60s) para followups/reminders.
- **Build local:** `npm run dev:all` (concurrently roda Vite em :8080 + Fastify em :3001 via `cd server && npm run dev`).
- **Vite proxy:** `/api` → `http://127.0.0.1:3001` em dev e preview.
- **Deploy produção:** imagens são buildadas localmente/CI e enviadas para **GHCR** (`ghcr.io/kevenmor/boom-ia-server|frontend|proxy`). Na VPS, **Portainer** faz pull e roda a stack via `docker-compose.portainer.yml` (colado no Web editor — não é git clone). Detalhes em `AGENTS.md` e `docker/PORTAINER-*.md`.
- **Paridade dev↔prod:** server e frontend devem ser deployados **juntos** — ver `docs/DEV-PROD-PARIDADE.md`.

## 4. Arquitetura

- **Multi-tenant** com control plane no Supabase: `tenants`, `agents`, `tools`, `providers`, RLS por tenant.
- **Frontend (SPA)** consome a API via `nexus-client.ts` (chama `/api/supabase-proxy/*` para evitar CORS no Supabase auth/rest/storage) e endpoints `/api/*` próprios. Roteamento é orquestrado em `src/App.tsx` com `ProtectedRoute` (auth) + `ModuleRoute` (ACL por módulo).
- **Backend Fastify** registra ~22 grupos de rota em `/api`. O endpoint mais crítico é **`POST /api/chat`** que via `fastify.inject()` delega para `POST /api/chat-local`.
- **`chat-local.ts`** é o "cérebro": resolve provider (OpenAI/Gemini), descriptografa API key, monta system prompt do tenant via `prompts/registry.ts`, faz loop de **tool-calling** (até 5 iterações) com `tool-executor.ts`, sanitiza stream LLM e emite SSE.
- **Prompts por tenant** em `server/src/services/prompts/`: cada cliente (`ppl-motors`, `pet-home`, `vale-suico`, `sunset-thermas`, `instituto-vicentim-maekawa`, `clinica-odonto`, `dr-iuri`, `imperio-cfc`, `contabilidade-ideal`, `durce-vita`, `autoescola-ideal`) tem seu próprio `SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`.
- **Tools** dinâmicas executadas em `tool-executor.ts`: `consultar_estoque`, `consultar_unidade`, `consultar_fipe`, `consultar_disponibilidade` (Omnibees), `consultar_hospedagem`, `notificar_agendamento`, `handoff`, `enviar_galeria`, etc.
- **Workers BullMQ** (com fallback cron):
  - `followup-worker` — fila de follow-ups agendados (tabela `follow_up_queue`).
  - `financeiro-campaign-worker` — disparos em massa.
  - Lembretes de agendamento: cron interno bate `/api/queue/reminders` a cada 60s.
- **Webhooks** em `routes/webhooks.ts` recebem WAHA/Chatwoot; debounce de mensagens é feito por SQL/buffer (ver `sql/007_message_debounce_buffer.sql`).
- **Storage:** bucket `suite-galleries` (auto-criado por `ensureStorageBuckets`) — fotos até 20 MB / vídeos até 200 MB; o backend faz proxy de Storage com correção de path (`object/public/`).

## 5. Fluxos principais

1. **Mensagem do cliente** → WAHA/Chatwoot → webhook → debounce → `chat-local` → LLM (com tools) → resposta sanitizada → SSE → entrega via `delivery.ts`.
2. **Agendamento** → tool `notificar_agendamento` → `agendaNotification` constrói payload → `sendNotification` para grupo + `addLeadLabelToConversation` (Chatwoot label).
3. **Follow-up** → tool dispara → linha em `follow_up_queue` → BullMQ delay → worker envia via WAHA.
4. **Galeria/mídia** → tool `enviar_galeria` retorna marcadores → `extract-media-commands` separa do texto e emite SSE de mídia.
5. **Painel admin** → AuthContext (Supabase Auth via proxy) → TenantContext seleciona tenant → hooks React Query lêem `tenants`, `agents`, `conversations` etc.

## 6. Qualidade e testes

- **Testes:** Vitest (root `vitest.config.ts` + `*.test.ts` lado-a-lado em `server/src/**` e `src/lib/`). Cobrem sanitização de stream LLM, extração de comandos, tool-executor, prompts, omnibees, agendaNotification.
- **Lint:** ESLint 9 (flat config) + typescript-eslint + react-hooks/refresh.
- **TS:** projeto separado `tsconfig.app.json` (frontend) e `server/tsconfig.json`.
- **E2E:** scripts em `scripts/` (PowerShell) e `server/scripts/e2e-*.ts`. Relatórios em `docs/E2E-*.md` e screenshots em `e2e-screenshots/`.
- **CI/CD:** não há GitHub Actions visível — build/push é manual via npm scripts (`build:docker:all`).

## 7. Síntese executiva

Boom IA é uma plataforma multi-tenant de **agentes WhatsApp** com painel React e backend Fastify que orquestra LLM (OpenAI/Gemini) + ferramentas customizadas por cliente, persistindo tudo em Supabase auto-hospedado e entregando mensagens via WAHA/Chatwoot. O servidor faz proxy do Supabase para evitar CORS, criptografa API keys de providers, e roda workers BullMQ (com fallback cron) para follow-ups, lembretes e campanhas financeiras. O design favorece prompts por tenant em arquivos TS (não DB) e tools como funções que consultam estoque, FIPE, Omnibees e calendário de hospedagem.

## 8. Top 5 arquivos para entender o projeto

1. `server/src/index.ts` — bootstrap, CORS, proxy Supabase, registro de rotas, crons.
2. `server/src/routes/chat-local.ts` — núcleo do agente (provider + prompt + tool loop + SSE).
3. `server/src/services/tool-executor.ts` — implementação das tools (estoque, FIPE, Omnibees, hospedagem, handoff).
4. `server/src/services/prompts/registry.ts` — mapa slug→prompt; ponto de entrada para customização por tenant.
5. `src/App.tsx` — árvore de rotas do painel + providers (Auth, Tenant, Theme, Query).

## 9. Pontos de atenção / dívida técnica

- **Múltiplos `docker-compose.*`** (7 variantes) e vários `.env.*` — fácil confundir alvo de deploy. Consolidar quando possível.
- **Prompts em código TS** (não em DB) — adicionar tenant exige redeploy do server. Há tabela `prompts` mas o registry hardcoda imports.
- **Fallback cron quando Redis ausente** funciona, mas duplica lógica de agendamento; preferir BullMQ em produção.
- **Catch-all content-type parser** (`*` → buffer) em `index.ts` aceita qualquer body — útil mas perigoso; revisar.
- **Encoding:** commits recentes (cb51a1a, 31b6e85, dd954fe) corrigiram corrupção UTF-8 em prompts; arquivos com pt-BR podem reaparecer corrompidos — sempre salvar UTF-8 sem BOM (registry.ts ainda mostra `���` em comentário).
- **`server/src/routes/auth.ts`** existe mas não é registrado em `index.ts` — verificar se é dead code ou falta registro.

## 10. Convenções para o Claude Code nesta base

- Mensagens de commit em **pt-BR** seguindo padrão observado: `fix(prompt): ...`, `fix(hint): ...`, `fix: ...`.
- Datas em código devem usar `utils/brasiliaTime.ts` (timezone São Paulo).
- Não citar números de telefone em respostas da Bia (regra recente — commit cb51a1a).
- Antes de editar prompt de tenant, conferir teste correspondente (`*.prompt.test.ts`).
- Quando Redis não está disponível, alterações em workers devem ter fallback no cron de `index.ts`.
- Mexer em `chat-local.ts` exige rodar `npm run test` em `server/` (testes de sanitize, extract-media-commands, agendaNotification).

---

## 11. Documentação detalhada por pasta

### Server
- [server/src/routes/CLAUDE.md](server/src/routes/CLAUDE.md)
- [server/src/services/CLAUDE.md](server/src/services/CLAUDE.md)
- [server/src/services/prompts/CLAUDE.md](server/src/services/prompts/CLAUDE.md)
- [server/src/utils/CLAUDE.md](server/src/utils/CLAUDE.md)
- [server/src/workers/CLAUDE.md](server/src/workers/CLAUDE.md)
- [server/src/config/CLAUDE.md](server/src/config/CLAUDE.md)
- [server/src/constants/CLAUDE.md](server/src/constants/CLAUDE.md)
- [server/src/types/CLAUDE.md](server/src/types/CLAUDE.md)
- [server/src/lib/CLAUDE.md](server/src/lib/CLAUDE.md)

### Frontend
- [src/pages/CLAUDE.md](src/pages/CLAUDE.md)
- [src/components/CLAUDE.md](src/components/CLAUDE.md)
- [src/hooks/CLAUDE.md](src/hooks/CLAUDE.md)
- [src/contexts/CLAUDE.md](src/contexts/CLAUDE.md)
- [src/lib/CLAUDE.md](src/lib/CLAUDE.md)
- [src/integrations/supabase/CLAUDE.md](src/integrations/supabase/CLAUDE.md)

### Infraestrutura
- [sql/CLAUDE.md](sql/CLAUDE.md)
- [supabase/functions/CLAUDE.md](supabase/functions/CLAUDE.md)
- [docker/CLAUDE.md](docker/CLAUDE.md)
- [docs/CLAUDE.md](docs/CLAUDE.md)
- [scripts/CLAUDE.md](scripts/CLAUDE.md)

---

Estou com compreensão sólida do projeto e pronto para receber tarefas de desenvolvimento.
