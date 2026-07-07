# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão Geral

**Boom IA / Nexus AI** é uma plataforma SaaS multi-tenant de **agentes de IA conversacionais** (WhatsApp/Chatwoot/WAHA) com painel administrativo web.

- **Tipo:** monorepo (frontend + backend Node) com Supabase como data plane
- **Linguagem:** TypeScript
- **Frontend:** Vite + React 18 + shadcn/ui + Tailwind + React Router + TanStack Query
- **Backend:** Fastify 5 + Supabase JS + BullMQ (Redis opcional) + undici
- **Edge Functions:** Supabase Deno (`supabase/functions/`) — `conversation-history`, `e2e-inspector`, `new-contact`, `public-agent-info`, `send-operator-message`
- **Origem:** projeto gerado pelo Lovable (`lovable-tagger`)

## Comandos Principais

```bash
# Desenvolvimento
npm run dev:all          # Frontend (:8080) + Backend (:3001) via concurrently
npm run dev              # Frontend apenas (Vite :8080)
npm run server           # Backend apenas (Fastify :3001)

# Build
npm run build            # Frontend (vite build)
cd server && npm run build  # Backend (tsc → dist/)

# Lint & typecheck
npm run lint             # ESLint em todo o repo
# Typecheck raiz: tsc -p tsconfig.app.json (sem script dedicado; usar IDE)

# Testes
npm run test             # Vitest frontend (vitest run)
npm run test:watch       # Vitest watch mode
npx vitest run src/lib/foo.test.ts   # rodar um único teste (caminho relativo)
cd server && npm run test            # Vitest server
cd server && npm run e2e             # Validação E2E (scripts/e2e-validation.ts)

# Server helpers
cd server && npm run verify:tools    # Audita tools registradas por agente
cd server && npm run verify:tokens   # Audita tracking de tokens

# Docker (build local → push GHCR)
npm run build:docker:all      # server + frontend
npm run build:docker:server   # server apenas
npm run build:docker:frontend # frontend apenas
```

## Arquitetura

### Fluxo Principal
```
WAHA/Chatwoot → webhook → debounce → POST /api/chat → fastify.inject() → POST /api/chat-local
→ LLM (OpenAI/Gemini) + tool loop (max 5) → sanitize → SSE → delivery → WAHA/Chatwoot
```

### Multi-tenant
- Control plane: `tenants`, `agents`, `tools`, `providers` com RLS por tenant
- Prompts por tenant em `server/src/services/prompts/` (registry em `registry.ts`)
  - Slugs ativos: `ppl-motors`, `pet-home`, `vale-suico`, `sunset-thermas`, `delta-empreendimentos`, `monte-verde-ranch`, `pousada-flores-do-lazaro`, `referency`, `instituto-vicentim-maekawa`, `clinica-odonto`, `dr-iuri`, `imperio-cfc`, `autoescola-ideal`, `contabilidade-ideal`, `durce-vita`, `biazini`
- Registry em `server/src/services/prompts/registry.ts`; cada prompt traz slug + versão (ex.: Sunset `v1.5.36`)
- **Migrations de data plane** em dois lugares: `sql/` (manuais, 001–042) e `supabase/migrations/` (Supabase CLI). Quando editar uma, verificar se a outra está em paridade.

### Backend (server/src/)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `routes/chat-local.ts` | Cérebro do agente: provider, prompt, tool loop, SSE, guards por tenant |
| `routes/loteamentos.ts` | CRUD empreendimentos/lotes (módulo `loteamentos`) |
| `services/tool-executor.ts` | Tools: estoque, FIPE, Omnibees, hospedagem, handoff, galeria |
| `services/delivery.ts` | Entrega mensagens (humanização com jitter) |
| `services/crypto.ts` | Criptografia AES de API keys |
| `services/prompts/registry.ts` | Mapa slug → prompt + versão (ex.: Sunset `v1.5.36`) |
| `utils/sunset-lodging-params.ts` | Detecção de intenção + allowlist de tool hospedagem Sunset |
| `utils/sunset-lodging-quote-format.ts` | Formatação de orçamento e rebuild pós-tool |
| `workers/` | BullMQ (follow-up, campanhas) com fallback cron |

### Sunset Thermas Park (Julia) — runtime v1.5.36

Prompt em `server/src/services/prompts/sunset-thermas.ts`; lógica de **quando** chamar tool fica no **runtime** (`chat-local.ts` + utils), não só no prompt.

**Qualificação em turnos (§00d):**
- Turno 1: saudação + nome — **sem** orçamento nem tool de hospedagem
- Turno 2: promo 25% OFF + confirmação — ainda **sem** tool
- Turno 3+ (`sim`/`certo`): orçamento com Loft (padrão `interest_keywords: loft, spa, hidromassagem` quando o formulário não traz `Acomodação:`)

**Tool sob demanda (economia de tokens):**
- `userNeedsSunsetLodgingToolCall()` — allowlist; padrão é **não** chamar tool
- `shouldDeferSunsetLodgingQuote()` — bloqueia hint/orçamento/auto-invoke nos turnos 1–2
- `messageDeclaresLodgingAmenityFaq()` — FAQ de amenidade (ex.: “spa é aquecido?”) → só texto, sem tool nem repetir R$
- `shouldRebuildSunsetQuoteFromTool()` — não reconstrói orçamento em FAQ

**Hospedagem Sunset — galeria de fotos:**
- Migrations `sql/041_register_suite_gallery_tool_sunset.sql` + `sql/042_link_suite_gallery_tool_to_sunset_agent.sql` registram a tool e linkam ao agente Sunset
- Versão `v1.5.36` introduziu qualificação + Loft + anti-repetição; commits recentes (`dd6a907`, `4049835`, `0ad64b0`, `1d9a3ec`, `da93eba`) só ajustaram prompt + runtime — não exigem nova migration

Testes: `sunset-lodging-params.test.ts`, `sunset-thermas.test.ts`, `sunset-thermas.prompt.test.ts`, `sunset-lodging-quote-format.test.ts`, `sunset-lodging-quote-layout.test.ts`, `sunset-lodging-quote-image-overlays.test.ts`.

### Módulo loteamentos (painel + embed Chatwoot)

- Rotas admin: `/loteamentos/empreendimentos` — mapa visual + status de lotes
- API: `/api/loteamentos/*` — exige módulo `loteamentos` no tenant
- SQL: `sql/039_lot_developments_and_lots.sql`, seed `040_lot_seed_reservas_do_brasil.sql`
- Embed Mega: `scripts/tenants/delta-empreendimentos-dashboard-loteamentos.script.html`
- Doc: `docs/LOTEAMENTOS.md`

### Frontend (src/)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `integrations/supabase/nexus-client.ts` | Cliente principal via proxy `/api/supabase-proxy/*` |
| `App.tsx` | Rotas com ProtectedRoute + ModuleRoute |
| `hooks/` | React Query hooks por recurso |
| `pages/loteamentos/` | Mapa e lista de empreendimentos (módulo `loteamentos`) |
| `lib/tenant-modules.ts` | Flags de módulos opcionais por tenant |

### Storage
- Bucket `suite-galleries` (auto-criado)
- Limites: fotos 20MB, vídeos 200MB
- Backend faz proxy de Storage com correção de path

## Variáveis de Ambiente

```bash
# Server (server/.env)
NEXUS_DB_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
NEXUS_SERVICE_ROLE_KEY=eyJ...  # service_role, não anon key
ENCRYPTION_KEY=...  # mín. 32 chars
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
GOOGLE_MAPS_API_KEY=...  # opcional (fallback Haversine)

# Frontend (.env)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_API_URL=http://127.0.0.1:3001
```

## Deploy

Imagens buildadas no PC → push para **GHCR** (`ghcr.io/kevenmor/boom-ia-server|frontend|proxy`).

Na VPS, Portainer faz **pull** das imagens (não clone). Stack definida via `docker-compose.portainer.yml` colado no Web editor.

**Paridade dev ↔ prod (regra crítica):** server e frontend devem ir juntos no mesmo deploy. Se só o server for atualizado, a produção terá frontend antigo (e vice-versa) → webhooks/embeds quebram. Ver `docs/DEV-PROD-PARIDADE.md`.

Há 7 variantes de `docker-compose.*` no repo — **não criar nova sem remover uma**. Em produção usa-se apenas `docker-compose.portainer.yml`. Outras variantes (git/traefik/images/local) cobrem cenários específicos.

Ver: `AGENTS.md` (fluxo de deploy detalhado), `docker/PORTAINER-*.md`, `DEPLOY-GUIDE.md`, `DEPLOY-PORTAINER-GIT.md`.

## Convenções

- Commits em **pt-BR**: `fix(prompt):`, `feat:`, `fix:`
- Datas em código: usar `utils/brasiliaTime.ts` (timezone São Paulo)
- Não citar números de telefone em respostas da Bia (regra compliance)
- Testes lado-a-lado: `arquivo.ts` → `arquivo.test.ts`
- Workers sem Redis: garantir fallback cron em `index.ts`
- Prompts em TS (não DB) — exige redeploy para alterar

## Design System

- **shadcn/ui** + Tailwind como padrão
- **Chatwoot-style**: escopo `.ds-chatwoot`, tokens `cw-*` (`bg-cw-elevated`, `text-cw-brand`) — pattern em `.cursor/skills/boom-chatwoot-ds/SKILL.md`
- **typeui-dashboard**: para métricas futuras (IBM Plex Sans, 8pt grid, WCAG 2.2 AA) — pattern em `.cursor/skills/typeui-dashboard/SKILL.md`
- Antes de criar componente novo, ler a skill correspondente — evitar cores/tipografia fora do padrão

## Pontos de Atenção

- **Sunset Julia** — alterar fluxo de qualificação/orçamento exige alinhar **prompt** (`sunset-thermas.ts`) **e** runtime (`chat-local.ts`, `sunset-lodging-params.ts`). Redeploy do server obrigatório. SQL `041`/`042` para tool galeria Sunset se ainda não aplicados.
- **Encoding UTF-8 sem BOM** — histórico de corrupção em prompts (commits cb51a1a, 31b6e85, dd954fe). Salvar TS de prompt com encoding UTF-8 (sem BOM) sempre. Adicionar `*.ts text eol=lf working-tree-encoding=UTF-8` em `.gitattributes` é a mitigação definitiva (ver `ROADMAP.md` §1.3).
- **Workers sem Redis** — BullMQ tem fallback cron em `server/src/index.ts`. Garantir que toda fila tenha um cron correspondente quando rodar sem Redis.
- **`server/src/routes/auth.ts`** existe mas não está registrado em `index.ts` — dead code. Não usar sem antes registrá-lo e remover o comentário.
- **Catch-all content-type parser** (`*` → buffer) em `index.ts` — útil para webhooks com payloads arbitrários, mas arriscado se o servidor for exposto a uploads não validados.
- **Múltiplos `docker-compose.*`** (7 variantes) — não criar nova variante sem remover uma. Em produção VPS usa-se o `docker-compose.portainer.yml` colado no Portainer.
- **Paridade dev ↔ prod** — server e frontend devem ir juntos. Ver `docs/DEV-PROD-PARIDADE.md`.
- **`ENCRYPTION_KEY`** mínimo 32 caracteres — usado em `server/src/services/crypto.ts` para AES de API keys. Nunca logar keys descriptografadas.
- **`.env` no git** — `ROADMAP.md` §1.2 sinaliza `.env` (placeholder) commitado na raiz; correto deixar só `.env.example` e garantir `.env` no `.gitignore`.
- **Telefones em respostas da Bia** — regra compliance: nunca citar números de telefone nas respostas da IA.
- **Tools retornam `{ success, result, error }`** — convenção de retorno de tools registrada em `tool-executor.ts`.

## Workers (BullMQ + Cron fallback)

Workers ficam em `server/src/workers/` (follow-up, campanhas financeiras). O bootstrap em `server/src/index.ts` tenta subir BullMQ com Redis; se indisponível, agenda os mesmos jobs via `node-cron`. Ao adicionar uma fila nova, **sempre** prover o equivalente em cron para o modo degradado.

## Ordem de Leitura Recomendada (novos agentes)

1. `server/src/routes/chat-local.ts` — cérebro do agente (provider + tool loop + SSE + guards)
2. `server/src/services/tool-executor.ts` — engine de tools
3. `server/src/services/prompts/registry.ts` — sistema de prompts
4. `server/src/index.ts` — bootstrap do server
5. `src/App.tsx` — árvore de rotas do frontend
6. `src/contexts/AuthContext.tsx` — autenticação
7. `src/integrations/supabase/nexus-client.ts` — cliente Supabase (via proxy)

## Subdocs CLAUDE.md

O repo tem CLAUDE.md granulares por pasta — ler antes de modificar:

| Pasta | Subdoc |
|-------|--------|
| `server/src/routes/` | `server/src/routes/CLAUDE.md` |
| `server/src/services/` | `server/src/services/CLAUDE.md` |
| `server/src/services/prompts/` | `server/src/services/prompts/CLAUDE.md` |
| `server/src/utils/` | `server/src/utils/CLAUDE.md` |
| `server/src/workers/` | `server/src/workers/CLAUDE.md` |
| `src/components/` | `src/components/CLAUDE.md` |
| `src/hooks/` | `src/hooks/CLAUDE.md` |
| `src/pages/` | `src/pages/CLAUDE.md` |
| `src/lib/` | `src/lib/CLAUDE.md` |
| `src/integrations/supabase/` | `src/integrations/supabase/CLAUDE.md` |
| `sql/` | `sql/CLAUDE.md` |
| `docker/` | `docker/CLAUDE.md` |

## Documentação Detalhada por Pasta

| Pasta | Arquivo |
|-------|---------|
| Server routes | `server/src/routes/CLAUDE.md` |
| Server services | `server/src/services/CLAUDE.md` |
| Server prompts | `server/src/services/prompts/CLAUDE.md` |
| Server utils | `server/src/utils/CLAUDE.md` |
| Server workers | `server/src/workers/CLAUDE.md` |
| Frontend components | `src/components/CLAUDE.md` |
| Frontend hooks | `src/hooks/CLAUDE.md` |
| Frontend pages | `src/pages/CLAUDE.md` |
| Frontend lib | `src/lib/CLAUDE.md` |
| Frontend supabase | `src/integrations/supabase/CLAUDE.md` |
| SQL migrations | `sql/CLAUDE.md` |
| Docker | `docker/CLAUDE.md` |
