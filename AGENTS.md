# AGENTS – Boom IA

Como produzir neste repo: deploy, design system, pastas e receitas. Mapa conceitual: `CLAUDE.md`. Spec visual: `docs/DESIGN-SYSTEM.md`.

Antes de editar uma pasta, ler o `AGENTS.md` **daquela pasta**.

---

## O que está rodando na VPS

1. **Compose (YAML)** — o conteúdo de `docker-compose.portainer.yml` é **colado no Portainer**. A stack é o YAML colado, não um clone na VPS.
2. **Imagens** — build no PC → `docker push` GHCR (`ghcr.io/kevenmor/boom-ia-server|frontend|proxy`). Na VPS só **pull**. Sem clone, sem `docker build`.

| O quê | Onde |
|-------|------|
| Código | GitHub (PC / CI) |
| Build | PC → GHCR |
| VPS | compose colado + pull GHCR |

**Paridade:** server e frontend no mesmo deploy. `docs/DEV-PROD-PARIDADE.md`.

Arquivos: `docker-compose.portainer.yml` (prod) · `docker-compose.portainer-git.yml` · `docker-compose.yml` (local). **Não criar 8ª variante** sem remover uma.

---

## Desenvolvimento local

```bash
npm install && (cd server && npm install)
cp .env.example .env
cp server/.env.example server/.env
# NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY, NEXUS_DB_ANON_KEY, ENCRYPTION_KEY,
# VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev:all    # :8080 frontend + :3001 API (Vite proxy /api)
```

Testes: `npm run test` (frontend) · `cd server && npm run test`.

---

## Design system — como produzir UI

Ler `docs/DESIGN-SYSTEM.md` **antes** de criar tela. Skills: `.cursor/skills/typeui-dashboard/` e `.cursor/skills/boom-chatwoot-ds/`.

| Tela | Wrapper | Primitivos |
|------|---------|------------|
| Quase todo o painel | nenhum (`AppLayout`) | shadcn `Card` `Button` `space-y-6` |
| `/dashboard` `/kanban` | `ds-typeui font-plex` | `.tu-panel` `.tu-kpi` `SectionHeader` |
| Embed Chatwoot / perfil contato | `ds-chatwoot font-cw` | shadcn por baixo; **não** usar `bg-cw-*` como classe Tailwind (tokens ainda não estão em `tailwind.config.ts`) |

- `cn()` em `src/lib/utils.ts`. Tokens semânticos, nunca hex solto.
- Dark: `next-themes`, classe `.dark`, default dark, key `boomia-theme`. Testar os dois temas.
- Ícones Lucide. Não copiar `glass-card`, `font-jakarta`, `primary-tint*`.
- Não alterar `--primary` global para “ficar Chatwoot”.
- Página nova: rota em `App.tsx` + `ProtectedRoute` + `ModuleRoute` + item na `AppSidebar` (`moduleKey`) + módulo em `tenant-modules.ts` se for recurso novo.
- Dados: hooks. `ui/` sem fetch.

---

## Estrutura de pastas (produção)

```
src/
  App.tsx                 rotas — sempre atualizar junto com página nova
  index.css               tokens shadcn + TypeUI
  pages/                  uma rota; subpastas hospedagem/ loteamentos/
  components/
    ui/                   shadcn (CLI). Custom: date-input-br, theme-toggle
    layout/               AppLayout, AppSidebar, AppHeader, TenantSwitcher
    dashboard/ + v2/      métricas (TypeUI no painel)
    {domínio}/            agents, contacts, kanban, loteamentos, embed, …
  hooks/                  use{Recurso}.ts — query key inclui tenantId
  contexts/               Auth, Tenant, Sidebar, Embed*
  lib/                    api-client, tenant-modules, cn(), embeds
  integrations/supabase/  nexusDb (proxy /api/supabase-proxy)
  types/                  calendar.ts, database.ts

server/src/
  index.ts                CORS, parsers, registro de rotas, workers/cron
  routes/                 um arquivo = domínio; registrar em index.ts
  services/               tool-executor, delivery, crypto, Asaas, Chatwoot embed
  services/prompts/       um TS por tenant + registry.ts
  utils/                  sanitize, sunset-lodging-*, mídia, brasiliaTime
  workers/                followup + financeiro (BullMQ; cron se sem Redis)
  config/env.ts           validateEnv
  lib/                    URLs Storage, segmentos veículo, superadmin

sql/                      001–054 (023 falta; 032/033 duplicados)
supabase/functions/       5 Edge Functions Deno
supabase/migrations/      CLI — manter paridade com sql/
docker/                   proxy nginx + docs Portainer
docs/                     DESIGN-SYSTEM.md + operacional
scripts/                  HTML embed Chatwoot + cron-tenant-ai
server/scripts/           e2e / verify / migrate
.cursor/skills/           DS Chatwoot + TypeUI
```

Cada pasta acima (exceto `server/scripts` recém documentada) tem `CLAUDE.md` + `AGENTS.md`.

---

## Receitas

### Nova página admin
1. `src/pages/X.tsx` — composição, sem fetch
2. `src/hooks/useX.ts` se precisar de dados (`enabled: !!tenantId`)
3. Rota em `App.tsx`
4. Nav em `AppSidebar` + título em `AppHeader`
5. Módulo em `tenant-modules.ts` se ACL nova

### Nova rota API
1. `server/src/routes/x.ts` exportando `async function xRoutes(fastify)`
2. `fastify.register(xRoutes, { prefix: "/api" })` em `index.ts`
3. Lógica em `services/`, não na rota
4. Validar env / `createNexusClient()`

### Novo tenant / prompt
1. `server/src/services/prompts/slug.ts` (`SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`)
2. Registrar em `registry.ts` + aliases
3. `slug.prompt.test.ts`
4. Redeploy **server**. UTF-8 sem BOM. Sem telefones.

### Nova tool
1. Serviço + case em `tool-executor.ts` → `{ success, result, error }`
2. Migration `sql/NNN_*.sql` (não editar migration já aplicada)
3. Teste lado-a-lado
4. Prompt do tenant se a IA precisar chamar

### Novo worker
`startXWorker(): Worker | null` + **cron equivalente** em `index.ts`.

---

## Regras globais

- Commits pt-BR: `fix(escopo):`, `feat(escopo):`
- TypeScript strict. Datas: `brasiliaTime.ts`. Tools: `{ success, result, error }`
- Testes lado-a-lado. Obrigatório: sanitize, tools, prompts, utils
- Nunca logar API keys. Nunca `process.env` de service_role no frontend
- Dead code: `routes/auth.ts`, `payments-asaas.ts`, `webhooks-asaas.ts` — não usar sem registrar
- Catch-all content-type em `index.ts` — não expor upload sem validação

---

## Ordem de leitura (código)

1. `server/src/routes/chat-local.ts`
2. `server/src/services/tool-executor.ts`
3. `server/src/services/prompts/registry.ts`
4. `server/src/index.ts`
5. `src/App.tsx`
6. `src/contexts/AuthContext.tsx`
7. `src/integrations/supabase/nexus-client.ts`
8. `docs/DESIGN-SYSTEM.md` (UI)

---

## Sunset Thermas Park (Julia) — v1.5.58

Slug `sunset-thermas-park`. Registry: **v1.5.58**. Qualificação §00d vive no **prompt e no runtime**.

| Área | Arquivo |
|------|---------|
| Prompt | `server/src/services/prompts/sunset-thermas.ts` |
| Allowlist / FAQ | `server/src/utils/sunset-lodging-params.ts` |
| Orçamento | `server/src/utils/sunset-lodging-quote-format.ts` |
| Guards | `server/src/routes/chat-local.ts` |

1. Turnos 1–2: `shouldDeferSunsetLodgingQuote()` — sem tool / hint de orçamento
2. Tool só com `userNeedsSunsetLodgingToolCall()`
3. Sem `Acomodação:` → Loft (`SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS`)
4. FAQ amenidade: não reconstruir R$

```bash
cd server && npx vitest run src/utils/sunset-lodging-params.test.ts
cd server && npx vitest run src/services/prompts/sunset-thermas.test.ts
cd server && npx vitest run src/utils/sunset-lodging-quote-format.test.ts
```

Redeploy server. Galeria: SQL `041`/`042`.

---

## Loteamentos

Módulo `loteamentos`. `docs/LOTEAMENTOS.md`. API `loteamentos.ts` + `loteamentos-embed-auth.ts`. Painel `src/pages/loteamentos/`. SQL `039` + seed `040`. Embed Delta em `scripts/tenants/`.

---

## Documentação por pasta

### Server
[routes](server/src/routes/AGENTS.md) · [services](server/src/services/AGENTS.md) · [prompts](server/src/services/prompts/AGENTS.md) · [utils](server/src/utils/AGENTS.md) · [workers](server/src/workers/AGENTS.md) · [config](server/src/config/AGENTS.md) · [constants](server/src/constants/AGENTS.md) · [types](server/src/types/AGENTS.md) · [lib](server/src/lib/AGENTS.md) · [scripts](server/scripts/AGENTS.md)

### Frontend
[pages](src/pages/AGENTS.md) · [components](src/components/AGENTS.md) · [hooks](src/hooks/AGENTS.md) · [contexts](src/contexts/AGENTS.md) · [lib](src/lib/AGENTS.md) · [supabase](src/integrations/supabase/AGENTS.md) · [types](src/types/AGENTS.md)

### Infra
[sql](sql/AGENTS.md) · [functions](supabase/functions/AGENTS.md) · [docker](docker/AGENTS.md) · [docs](docs/AGENTS.md) · [scripts](scripts/AGENTS.md)
