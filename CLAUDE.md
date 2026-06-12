# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão Geral

**Boom IA / Nexus AI** é uma plataforma SaaS multi-tenant de **agentes de IA conversacionais** (WhatsApp/Chatwoot/WAHA) com painel administrativo web.

- **Tipo:** monorepo (frontend + backend Node) com Supabase como data plane
- **Linguagem:** TypeScript
- **Frontend:** Vite + React 18 + shadcn/ui + Tailwind + React Router + TanStack Query
- **Backend:** Fastify 5 + Supabase JS + BullMQ (Redis opcional) + undici
- **Origem:** projeto gerado pelo Lovable (`lovable-tagger`)

## Comandos Principais

```bash
# Desenvolvimento
npm run dev:all          # Frontend (:8080) + Backend (:3001)
npm run dev              # Frontend apenas
npm run server           # Backend apenas

# Build
npm run build            # Frontend
cd server && npm run build  # Backend

# Testes
npm run test             # Todos (Vitest)
npm run test:watch       # Watch mode

# Server
cd server && npm run test
cd server && npm run e2e # Validação E2E

# Docker
npm run build:docker:all      # Build server + frontend → GHCR
npm run build:docker:server   # Server apenas
npm run build:docker:frontend # Frontend apenas
```

## Arquitetura

### Fluxo Principal
```
WAHA/Chatwoot → webhook → debounce → POST /api/chat → fastify.inject() → POST /api/chat-local
→ LLM (OpenAI/Gemini) + tool loop (max 5) → sanitize → SSE → delivery → WAHA/Chatwoot
```

### Multi-tenant
- Control plane: `tenants`, `agents`, `tools`, `providers` com RLS por tenant
- Prompts por tenant em `server/src/services/prompts/` (11 clientes: ppl-motors, pet-home, vale-suico, sunset-thermas, etc.)
- Registry em `server/src/services/prompts/registry.ts`

### Backend (server/src/)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `routes/chat-local.ts` | Cérebro do agente: provider, prompt, tool loop, SSE |
| `services/tool-executor.ts` | Tools: estoque, FIPE, Omnibees, hospedagem, handoff |
| `services/delivery.ts` | Entrega mensagens (humanização com jitter) |
| `services/crypto.ts` | Criptografia AES de API keys |
| `services/prompts/registry.ts` | Mapa slug → prompt |
| `workers/` | BullMQ (follow-up, campanhas) com fallback cron |

### Frontend (src/)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `integrations/supabase/nexus-client.ts` | Cliente principal via proxy `/api/supabase-proxy/*` |
| `App.tsx` | Rotas com ProtectedRoute + ModuleRoute |
| `hooks/` | React Query hooks por recurso |

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

Ver: `AGENTS.md`, `docker/PORTAINER-*.md`, `docs/DEV-PROD-PARIDADE.md`

## Convenções

- Commits em **pt-BR**: `fix(prompt):`, `feat:`, `fix:`
- Datas em código: usar `utils/brasiliaTime.ts` (timezone São Paulo)
- Não citar números de telefone em respostas da Bia (regra compliance)
- Testes lado-a-lado: `arquivo.ts` → `arquivo.test.ts`
- Workers sem Redis: garantir fallback cron em `index.ts`
- Prompts em TS (não DB) — exige redeploy para alterar

## Design System

- **shadcn/ui** + Tailwind como padrão
- **Chatwoot-style**: escopo `.ds-chatwoot`, tokens `cw-*` (`bg-cw-elevated`, `text-cw-brand`)
- **typeui-dashboard**: para métricas futuras (IBM Plex Sans, 8pt grid, WCAG 2.2 AA)
- Ver: `.cursor/skills/boom-chatwoot-ds/SKILL.md`, `.cursor/skills/typeui-dashboard/SKILL.md`

## Pontos de Atenção

- **Encoding UTF-8 sem BOM** — histórico de corrupção em prompts (commits cb51a1a, 31b6e85)
- **`server/src/routes/auth.ts`** existe mas não está registrado em `index.ts` — verificar se é dead code
- **Catch-all content-type parser** (`*` → buffer) em `index.ts` — útil mas arriscado
- **Múltiplos `docker-compose.*`** (7 variantes) — consolidar quando possível

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
