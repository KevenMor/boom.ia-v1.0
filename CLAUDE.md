# CLAUDE.md

Guia para agentes IA neste repositório. **Ler este arquivo primeiro**, depois o CLAUDE.md da pasta que for alterar. Produzir UI: ler também `docs/DESIGN-SYSTEM.md`.

## Como um agente deve ler este repo

1. Este arquivo (mapa + regras)
2. Pasta-alvo: `*/CLAUDE.md` (o quê existe) + `*/AGENTS.md` (como modificar)
3. UI: `docs/DESIGN-SYSTEM.md` + skill `.cursor/skills/boom-chatwoot-ds/` ou `typeui-dashboard/`
4. Código: `server/src/routes/chat-local.ts` (cérebro) · `App.tsx` (rotas) · `src/lib/tenant-modules.ts` (ACL)

Não inventar pastas, rotas ou tokens CSS. Se o inventário da pasta e o código divergirem, o **código vence** — atualizar o CLAUDE.md da pasta.

---

## Visão Geral

**Boom IA / Nexus AI** — SaaS multi-tenant de agentes de IA conversacionais (WhatsApp / Chatwoot / WAHA) + painel admin.

| Camada | Stack |
|--------|--------|
| Frontend | Vite + React 18 + shadcn/ui + Tailwind + React Router + TanStack Query (`src/`) |
| Backend | Fastify 5 + Supabase JS + BullMQ (Redis opcional) + undici (`server/`) |
| Data | Supabase Postgres + RLS por tenant |
| Edge | Deno `supabase/functions/` |
| Origem | Lovable (`lovable-tagger`) |

---

## Design System (resumo)

Três camadas. Spec completa: **`docs/DESIGN-SYSTEM.md`**.

| Contexto | Wrapper | Tokens |
|----------|---------|--------|
| Painel admin (maioria) | nenhum (`AppLayout`) | shadcn `bg-background` `text-primary` |
| `/dashboard`, `/kanban` | `ds-typeui font-plex` | `--tu-*`, `.tu-panel` `.tu-kpi` |
| Embeds Chatwoot + perfil contato | `ds-chatwoot font-cw` | wrapper existe; tokens `cw-*` **ainda não** estão no Tailwind — usar shadcn + fallbacks |

- Fontes: Inter (app), IBM Plex Sans (TypeUI), JetBrains Mono.
- Dark: `next-themes`, classe `.dark`, default **dark**, key `boomia-theme`.
- Primitivos: `src/components/ui/` (shadcn). Custom: `date-input-br`, `theme-toggle`.
- **Não** alterar `--primary` global para imitar Chatwoot. **Não** usar `bg-cw-*` como se fosse classe Tailwind estável.

---

## Mapa do monorepo

Cada pasta listada tem `CLAUDE.md` + `AGENTS.md` (exceto as marcadas).

```
boom.ia-v1.0/
├── src/                          # Frontend React
│   ├── App.tsx                   # Rotas
│   ├── index.css                 # Tokens globais + TypeUI
│   ├── pages/                    # Uma página = uma rota
│   ├── components/               # ui/ + layout/ + domínio
│   ├── hooks/                    # TanStack Query
│   ├── contexts/                 # Auth, Tenant, Sidebar, Embed*
│   ├── lib/                      # Utils + API client + módulos
│   ├── integrations/supabase/    # nexusDb (proxy)
│   └── types/                    # calendar.ts, database.ts
├── server/src/
│   ├── index.ts                  # Bootstrap Fastify :3001
│   ├── routes/                   # HTTP /api/*
│   ├── services/                 # Tools, delivery, crypto, Asaas
│   ├── services/prompts/         # Prompts TS por tenant
│   ├── utils/                    # Sanitize, Sunset lodging, mídia
│   ├── workers/                  # BullMQ + fallback cron
│   ├── config/ env.ts
│   ├── constants/ lib/ types/
│   └── ../scripts/               # E2E e verify (server/scripts/)
├── sql/                          # Migrations manuais 001–054
├── supabase/functions/           # Edge Deno
├── supabase/migrations/          # CLI (paridade parcial com sql/)
├── docker/                       # Proxy nginx + docs Portainer
├── docs/                         # Operacional + DESIGN-SYSTEM.md
├── scripts/                      # Embeds Chatwoot + cron tenant AI
└── .cursor/skills/               # boom-chatwoot-ds, typeui-dashboard
```

---

## Comandos principais

```bash
npm run dev:all              # Frontend :8080 + Backend :3001
npm run dev                  # Só Vite
npm run server               # Só Fastify
npm run build                # Frontend
cd server && npm run build   # tsc → dist/
npm run lint
npm run test                 # Vitest frontend
cd server && npm run test    # Vitest server
cd server && npm run e2e
cd server && npm run verify:tools
cd server && npm run verify:tokens
npm run build:docker:all     # GHCR server + frontend
```

---

## Arquitetura

```
WAHA/Chatwoot → webhook → debounce → POST /api/chat
  → fastify.inject() → POST /api/chat-local
  → LLM (OpenAI/Gemini) + tool loop (max 5)
  → sanitize → SSE → delivery → WAHA/Chatwoot
```

Painel: `AuthProvider` → `TenantProvider` → `ProtectedRoute` → `ModuleRoute` → página → hooks (`nexusDb` via `/api/supabase-proxy`).

---

## Multi-tenant e prompts

Control plane: `tenants`, `agents`, `tools`, `providers` + RLS. Prompts em **TypeScript** (`server/src/services/prompts/`), não no DB — **redeploy do server** para alterar. Registry: `registry.ts` (aliases + typos). Encoding UTF-8 **sem BOM**.

| Slug principal | Versão | Agente |
|----------------|--------|--------|
| `ppl-motors` | v2.3.1 | Ana Júlia |
| `referency` | v1.6.4 | Amanda |
| `pousada-flores-do-lazaro` | v1.0.0 | Marina |
| `instituto-vicentim-maekawa` | v1.2.0 | Mariana |
| `pet-home` | v1.2.1 | Tia Ana |
| `vale-suico` | v1.2.46 | Vitória |
| `sunset-thermas-park` | **v1.5.58** | Julia |
| `durce-vita` | v1.2.1 | Juliana |
| `contabilidade-ideal` | v1.0 | Vitória |
| `clinica-odonto-generica` | v1.0.0 | template |
| `imperio-cfc` | v2.0 | Roberta |
| `autoescola-ideal` | v8.16 | Bia |
| `dr-iuri` | v1.1.1 | Camila |
| `biazini` | v1.0.1 | Bia |
| `monte-verde-ranch` | v1.2.1 | Cleide |
| `delta-empreendimentos` | v1.5.18 | Paula |

Migrations data plane: `sql/` (001–054, **023 ausente**, 032/033 duplicados) **e** `supabase/migrations/`. Editar um → checar o outro.

---

## Backend (`server/src/`)

Rotas registradas em `index.ts` (prefixo `/api`, exceto MCP). Inventário: `server/src/routes/CLAUDE.md`.

| Arquivo | Papel |
|---------|--------|
| `chat.ts` / `chat-local.ts` | Entry + cérebro (provider, prompt, tool loop, SSE) |
| `webhooks.ts` | WAHA/Chatwoot, debounce, CRM sync, AI toggle |
| `delivery.ts` | Entrega com jitter |
| `queue.ts` | Follow-ups + cron reminders |
| `tools.ts` `providers.ts` `admin.ts` `me.ts` | CRUD + perfil |
| `inventory.ts` `inventory-sync-referency.ts` | Estoque |
| `hospedagem.ts` `suite-galleries.ts` `loteamentos.ts` | Reservas / galeria / lotes |
| `contacts.ts` `crm-contacts.ts` `occurrences.ts` | CRM |
| `calendar-services.ts` `financeiro.ts` `audit.ts` | Agenda / campanhas / logs |
| `rag.ts` `prompts-read.ts` `demo.ts` | RAG, leitura de prompts, demo |
| `tenant-ai-toggle.ts` `mcp.ts` `mcp-keys.ts` | Toggle IA, MCP |
| `embed-chatwoot*.ts` | Embeds Mega (mirror, CRM, hospedagem, inventory, clients, loteamentos) |

**Dead code (existem, NÃO registrados em `index.ts`):** `auth.ts`, `payments-asaas.ts`, `webhooks-asaas.ts`. Não usar sem registrar e remover o aviso.

Helpers de auth embed: `embed-auth.ts`, `*-embed-auth.ts` (não são plugins Fastify).

Services-chave: `tool-executor.ts` (retorno `{ success, result, error }`), `crypto.ts` (AES, `ENCRYPTION_KEY` ≥ 32), `delivery.ts`, `provider-api.ts`. Ver `server/src/services/CLAUDE.md`.

---

## Frontend (`src/`)

Rotas: `src/App.tsx`. ACL: `src/lib/tenant-modules.ts` (22 `ModuleKey`).

**Módulos:** `dashboard` `conversations` `agents` `calendar` `financeiro` `followups` `inventory` `occurrences` `service_catalog` `suite_galleries` `hospedagem` `loteamentos` `contacts` `clients` `tenants` `tools` `providers` `analytics_tokens` `prompts` `monitoring` `audit` `settings`.

**Páginas protegidas (amostra):** `/dashboard` `/agents` `/conversations` `/kanban` `/calendar` `/followups` `/inventory` `/occurrences` `/galeria` `/catalog` `/contacts` `/clients` `/hospedagem/*` `/loteamentos/*` `/financeiro` `/tools` `/providers` `/analytics/tokens` `/monitoring` `/audit` `/settings` `/prompts` `/profile` `/tenants` `/users` `/permissions`. Superadmin: tenants/users/permissions.

**Públicas:** `/login` `/demo/:agentId` `/embed/chatwoot/*`.

**Órfã:** `TenantPaymentsPage.tsx` — sem rota.

QueryClient: `staleTime` 10 min. Cliente dados: **sempre** `nexusDb` (`nexus-client.ts`), nunca Supabase direto no browser.

---

## Sunset Thermas Park (Julia) — runtime v1.5.58

Prompt: `sunset-thermas.ts`. **Quando** chamar tool = runtime (`chat-local.ts` + `utils/sunset-lodging-params.ts`), não só o prompt.

- Turnos 1–2: `shouldDeferSunsetLodgingQuote()` — sem orçamento / tool hospedagem
- Tool sob demanda: `userNeedsSunsetLodgingToolCall()` (allowlist)
- Loft padrão se o form não traz `Acomodação:`
- FAQ amenidade: texto só, sem reconstruir R$

Galeria: SQL `041`/`042`. Testes: `sunset-lodging-params`, `sunset-thermas`, `sunset-lodging-quote-format` (+ layout/overlays).

---

## Módulo loteamentos

Painel `/loteamentos/empreendimentos`. API `/api/loteamentos/*` (módulo `loteamentos`). SQL `039` + seed `040`. Embed: `scripts/tenants/delta-empreendimentos-dashboard-loteamentos.script.html`. Doc: `docs/LOTEAMENTOS.md`.

---

## Storage

Bucket `suite-galleries` (auto-criado). Fotos 20MB, vídeos 200MB. Proxy de Storage no backend com correção de path (`server/src/lib/supabase-storage-public-url.ts`). Contatos: bucket `contact-files` (SQL 037).

---

## Variáveis de ambiente

```bash
# server/.env
NEXUS_DB_URL=postgresql://...
NEXUS_SERVICE_ROLE_KEY=eyJ...   # service_role, não anon
ENCRYPTION_KEY=...              # mín. 32 chars
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
GOOGLE_MAPS_API_KEY=...         # opcional (fallback Haversine)

# raiz .env (frontend)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_API_URL=http://127.0.0.1:3001
```

---

## Deploy

Imagens no PC → GHCR (`ghcr.io/kevenmor/boom-ia-server|frontend|proxy`). VPS: Portainer **pull** (não clone). Stack: `docker-compose.portainer.yml` colado no editor.

**Paridade:** server e frontend no mesmo deploy. `docs/DEV-PROD-PARIDADE.md`. Sete `docker-compose.*` — **não criar oitava** sem remover uma. Produção = só `docker-compose.portainer.yml`.

---

## Convenções

- Commits **pt-BR**: `fix(prompt):`, `feat:`, `fix:`
- Datas: `utils/brasiliaTime.ts` (America/Sao_Paulo)
- Sem telefones nas respostas da Bia / prompts
- Testes lado-a-lado: `arquivo.ts` → `arquivo.test.ts`
- Workers: toda fila nova precisa de cron em `index.ts` se Redis faltar
- Tools: `{ success, result, error }`
- Frontend: dados nos hooks; UI nos components; páginas só composição

---

## Pontos de atenção

- **Sunset Julia** — prompt + runtime juntos; bump `version` no registry; redeploy server
- **UTF-8 sem BOM** em prompts (histórico de corrupção)
- **`auth.ts` / `payments-asaas.ts` / `webhooks-asaas.ts`** — dead code
- Catch-all content-type `*` → buffer em `index.ts` (webhooks; risco se upload não validado)
- `ENCRYPTION_KEY` ≥ 32; nunca logar keys descriptografadas
- Tokens Chatwoot `cw-*` documentados na skill mas **ausentes** de `index.css` / Tailwind
- `sql/CLAUDE.md` histórico citava 001–028; o repo tem **até 054**

---

## Workers

`server/src/workers/`: `followup-worker.ts`, `financeiro-campaign-worker.ts`. Sem Redis: cron em `index.ts`. Nova fila → equivalente cron.

---

## Subdocs CLAUDE.md / AGENTS.md

| Pasta | Docs |
|-------|------|
| `server/src/routes/` | rotas HTTP |
| `server/src/services/` | tools e integrações |
| `server/src/services/prompts/` | prompts por tenant |
| `server/src/utils/` | sanitize + Sunset lodging |
| `server/src/workers/` | BullMQ |
| `server/src/config/` `constants/` `lib/` `types/` | env, soft-replies, storage URLs |
| `src/pages/` `components/` `hooks/` `lib/` `contexts/` | frontend |
| `src/integrations/supabase/` | nexus-client |
| `src/types/` | tipos frontend |
| `sql/` `supabase/functions/` `docker/` `docs/` `scripts/` | infra |
| `server/scripts/` | E2E / verify |

Docs operacionais extras: `docs/HOSPEDAGEM*.md`, `docs/LOTEAMENTOS.md`, `docs/DEV-PROD-PARIDADE.md`, `AGENTS.md` (deploy).
