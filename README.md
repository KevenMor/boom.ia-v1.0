# Boom IA / Nexus AI

**Plataforma SaaS multi-tenant de agentes de IA conversacionais** para WhatsApp, Chatwoot e WAHA, com painel administrativo web completo.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-000000.svg)](https://www.fastify.io/)
[![Supabase](https://img.shields.io/badge/Supabase-Latest-3ECF8E.svg)](https://supabase.com/)

---

## 📋 Visão Geral

Boom IA é uma plataforma completa para criação e gerenciamento de agentes conversacionais inteligentes. Cada tenant possui seu próprio agente com:

- 🤖 **Prompt customizado** por cliente
- 🛠️ **Ferramentas (tools) dinâmicas** — estoque, FIPE, calendário, Omnibees, hospedagem, etc.
- 🔌 **Integrações** — WhatsApp (WAHA), Chatwoot, Google Maps, APIs externas
- 📊 **Painel administrativo** — gerenciamento completo de tenants, agentes, conversas, follow-ups
- 🔐 **Multi-tenant** com isolamento de dados e RLS (Row Level Security)

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                     │
│  Dashboard · Agents · Conversations · Calendar · Inventory  │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + SSE
┌────────────────────────▼────────────────────────────────────┐
│                  Backend (Fastify/Node.js)                   │
│  • Chat Engine (OpenAI/Gemini + Tool Calling)               │
│  • Webhooks (WAHA/Chatwoot)                                 │
│  • Workers (BullMQ) — Follow-ups, Reminders, Campaigns     │
│  • Tools — Estoque, FIPE, Omnibees, Hospedagem, etc.       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Supabase (Postgres + Auth + Storage)            │
│  Control Plane: tenants, agents, tools, providers, RLS     │
└─────────────────────────────────────────────────────────────┘
```

**Tipo:** Monorepo (frontend + backend + migrations SQL + Edge Functions)

---

## 🚀 Stack Tecnológica

### Frontend
- **Framework:** React 18 + Vite
- **UI:** shadcn/ui + Tailwind CSS + Radix UI
- **Roteamento:** React Router v6
- **State:** TanStack Query (React Query)
- **Formulários:** React Hook Form + Zod
- **Calendário:** FullCalendar

### Backend
- **Framework:** Fastify 5
- **Runtime:** Node.js + TypeScript
- **Database:** Supabase (Postgres)
- **Filas:** BullMQ (Redis) com fallback cron
- **HTTP Client:** undici
- **LLM:** OpenAI / Google Gemini (via API)

### Infraestrutura
- **Database:** Supabase (Postgres + Auth + Storage + Edge Functions)
- **Deploy:** Docker + Portainer + GHCR
- **Proxy:** Nginx / Traefik
- **Monitoramento:** Logs + Healthchecks

---

## 📦 Instalação e Setup Local

### Pré-requisitos

- **Node.js** 18+ e npm (recomendado: [nvm](https://github.com/nvm-sh/nvm))
- **Supabase** (projeto próprio ou local via Docker)
- **Redis** (opcional — se ausente, usa fallback cron)

### 1. Clone o repositório

```bash
git clone <YOUR_GIT_URL>
cd boom-agents
```

### 2. Instale as dependências

```bash
# Raiz (frontend)
npm install

# Backend
cd server
npm install
cd ..
```

### 3. Configure as variáveis de ambiente

#### Frontend (raiz)

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Variáveis principais:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
VITE_API_URL=http://127.0.0.1:3001
```

#### Backend (server/)

Copie `server/.env.example` para `server/.env` e preencha:

```bash
cp server/.env.example server/.env
```

Variáveis principais:
```env
# Supabase (control plane)
NEXUS_DB_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
NEXUS_SERVICE_ROLE_KEY=eyJhbGc...  # Service role key (Settings → API)
NEXUS_DB_ANON_KEY=eyJhbGc...       # Anon key

# Criptografia (mínimo 32 caracteres)
ENCRYPTION_KEY=sua-chave-secreta-minimo-32-chars

# Providers LLM (fallback se não configurado no DB)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Opcional
GOOGLE_MAPS_API_KEY=AIza...  # Para consultar_unidade com distância real
CORS_ORIGINS=https://seu-dominio.com
```

⚠️ **Importante:** `NEXUS_SERVICE_ROLE_KEY` deve ser a **service_role** do Supabase (não a anon key). Sem ela, o painel admin retorna 401.

### 4. Execute as migrations SQL

Aplique as migrations em ordem no SQL Editor do Supabase:

```bash
sql/001_control_plane.sql
sql/002_fix_rls_recursion.sql
sql/003_data_plane_provisioning.sql
# ... até sql/026_lodging_consulta_tool_type.sql
```

Ou use a CLI do Supabase:
```bash
supabase db push
```

### 5. Inicie o ambiente de desenvolvimento

```bash
# Roda frontend (Vite :8080) + backend (Fastify :3001) simultaneamente
npm run dev:all
```

Ou separadamente:
```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend
npm run server
```

Acesse: **http://localhost:8080**

---

## 🧪 Testes

```bash
# Frontend + Backend
npm run test

# Backend apenas
cd server && npm run test

# Watch mode
npm run test:watch
```

**Cobertura atual:** 17 arquivos de teste cobrindo sanitização de stream LLM, tool-executor, prompts, Omnibees, agendamento, delivery.

---

## 🐳 Deploy com Docker

### Build das imagens

```bash
# Build server + frontend
npm run build:docker:all

# Ou individualmente
npm run build:docker:server
npm run build:docker:frontend
```

### Deploy via Portainer

1. Faça push das imagens para GHCR:
   ```bash
   docker push ghcr.io/kevenmor/boom-ia-server:latest
   docker push ghcr.io/kevenmor/boom-ia-frontend:latest
   ```

2. No Portainer, cole o conteúdo de `docker-compose.portainer.yml` no Web Editor

3. Configure as variáveis de ambiente (`.env.stack`)

4. Deploy!

Veja documentação completa em:
- `DEPLOY-GUIDE.md`
- `AGENTS.md`
- `DEPLOY-PORTAINER-GIT.md`

---

## 📚 Estrutura do Projeto

```
/
├── src/                    # Frontend React
│   ├── pages/              # Telas (Dashboard, Agents, Conversations, etc.)
│   ├── components/         # Componentes UI (shadcn + domínio)
│   ├── hooks/              # React Query hooks
│   ├── contexts/           # AuthContext, TenantContext
│   └── integrations/       # Cliente Supabase
│
├── server/                 # Backend Fastify
│   └── src/
│       ├── routes/         # Endpoints REST (~22 grupos)
│       ├── services/       # Lógica de negócio
│       │   ├── prompts/    # Prompts por tenant (11 clientes)
│       │   └── tool-executor.ts  # Execução de tools
│       ├── workers/        # BullMQ workers (followup, financeiro)
│       └── utils/          # Sanitização, agendamento, delivery
│
├── supabase/
│   ├── migrations/         # Migrations versionadas
│   └── functions/          # Edge Functions Deno
│
├── sql/                    # Migrations manuais (001-026)
├── docs/                   # Documentação operacional
├── docker/                 # Configs proxy/Traefik
└── scripts/                # Scripts E2E e utilitários
```

---

## 🔑 Principais Endpoints

### Backend (Fastify :3001)

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/chat` | Chat principal (delega para `/api/chat-local`) |
| `POST /api/chat-local` | Engine LLM + tool-calling (núcleo do agente) |
| `POST /api/webhooks/waha` | Webhook WAHA (mensagens WhatsApp) |
| `POST /api/webhooks/chatwoot` | Webhook Chatwoot |
| `GET /api/admin/tenants` | Lista tenants (requer superadmin) |
| `GET /api/conversations` | Histórico de conversas |
| `POST /api/queue/followups` | Dispara follow-ups agendados |
| `GET /api/inventory` | Consulta estoque (módulo inventory) |
| `POST /api/tools/execute` | Executa tool manualmente |

### Frontend (Vite :8080)

Proxy `/api` → `http://127.0.0.1:3001` em dev/preview.

---

## 🛠️ Ferramentas (Tools) Disponíveis

O sistema possui **tools dinâmicas** executadas pelo LLM via function calling:

- **`consultar_estoque`** — Busca veículos no inventário (marca, modelo, ano, cor, preço)
- **`consultar_fipe`** — Consulta tabela FIPE (valor de mercado)
- **`consultar_unidade`** — Encontra unidade mais próxima via CEP (Google Maps ou Haversine)
- **`consultar_disponibilidade`** — Omnibees (hotéis/pousadas)
- **`consultar_hospedagem`** — Calendário de hospedagem (parques/resorts)
- **`notificar_agendamento`** — Envia notificação de agendamento para grupo WhatsApp
- **`handoff`** — Transfere conversa para operador humano
- **`enviar_galeria`** — Envia galeria de fotos/vídeos

Cada tool é registrada em `server/src/services/tool-executor.ts`.

---

## 🧩 Prompts por Tenant

Cada cliente tem seu próprio prompt customizado em `server/src/services/prompts/`:

- `ppl-motors.ts` — Concessionária (Juliana)
- `pet-home.ts` — Pet shop (Tia Ana)
- `vale-suico.ts` — Hotel/pousada (Vitória)
- `sunset-thermas.ts` — Resort (Bia)
- `instituto-vicentim-maekawa.ts` — Clínica médica
- `clinica-odonto.ts` — Odontologia
- `dr-iuri.ts` — Médico
- `imperio-cfc.ts` — Auto escola
- `autoescola-ideal.ts` — Auto escola
- `contabilidade-ideal.ts` — Contabilidade
- `durce-vita.ts` — Estética

Registro em `server/src/services/prompts/registry.ts`.

---

## 📖 Documentação Adicional

- **`CLAUDE.md`** — Contexto permanente do projeto (leia primeiro!)
- **`ROADMAP.md`** — Roadmap de melhorias priorizadas
- **`docs/DEV-PROD-PARIDADE.md`** — Paridade dev ↔ prod
- **`docs/HOSPEDAGEM_*.md`** — Sistema de hospedagem (8 arquivos)
- **`docs/E2E-*.md`** — Relatórios de testes E2E
- **`DEPLOY-GUIDE.md`** — Guia de deploy completo

---

## 🤝 Contribuindo

1. Clone o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit suas mudanças: `git commit -m "feat: adiciona nova feature"`
4. Push: `git push origin feature/minha-feature`
5. Abra um Pull Request

**Convenções:**
- Commits em **pt-BR** (padrão: `feat:`, `fix:`, `docs:`, etc.)
- Datas em código usam timezone **America/Sao_Paulo** (`utils/brasiliaTime.ts`)
- Testes obrigatórios para áreas críticas (chat-local, tool-executor, prompts)

---

## 📝 Scripts Úteis

```bash
# Desenvolvimento
npm run dev:all              # Frontend + Backend simultâneos
npm run dev                  # Frontend apenas (Vite)
npm run server               # Backend apenas (Fastify)

# Build
npm run build                # Build frontend
cd server && npm run build   # Build backend

# Testes
npm run test                 # Roda todos os testes
npm run test:watch           # Watch mode

# Docker
npm run build:docker:all     # Build server + frontend
npm run build:docker:server  # Build server apenas
npm run build:docker:frontend # Build frontend apenas

# Backend (server/)
npm run migrate:tokens       # Migração de tokens
npm run verify:tools         # Verifica tools dos agentes
npm run e2e                  # Validação E2E
```

---

## 🐛 Troubleshooting

### Erro 401 no painel admin (lista de tenants vazia)

**Causa:** `NEXUS_SERVICE_ROLE_KEY` inválida ou ausente em `server/.env`.

**Solução:** Copie a **service_role key** do Supabase (Settings → API → service_role) para `server/.env`.

### Erro "module_disabled: inventory"

**Causa:** Módulo inventory não habilitado para o tenant.

**Solução:** No painel admin, vá em Tenants → Editar → Módulos → Habilite "Inventory".

### Erro "GOOGLE_MAPS_API_KEY não configurada"

**Causa:** Tool `consultar_unidade` sem API key do Google Maps.

**Solução:** Adicione `GOOGLE_MAPS_API_KEY` em `server/.env` ou aceite distância em linha reta (Haversine).

### Redis não conecta (BullMQ)

**Causa:** Redis ausente ou inacessível.

**Solução:** O sistema tem **fallback automático** para cron (`setInterval` a cada 60s). Follow-ups e reminders continuam funcionando.

---

## 📄 Licença

Proprietary — Boom IA / Nexus AI

---

## 👥 Suporte

Para dúvidas ou suporte, consulte a documentação em `docs/` ou entre em contato com a equipe de desenvolvimento.

---

**Desenvolvido com ❤️ pela equipe Boom IA**
