# CLAUDE.md — Boom Agents Project

## Visão Geral

**Boom IA** é uma plataforma SaaS multi-tenant de agentes de IA conversacionais, voltada para o mercado brasileiro. Permite que empresas (tenants) configurem e implantem agentes inteligentes com prompts customizados, integração com ferramentas externas e automação de follow-ups.

---

## Stack Tecnológica

### Frontend
- **React 18.3** + **Vite** + **TypeScript 5.8**
- **TailwindCSS 3.4** + **shadcn/ui** (Radix UI)
- **React Router v6**, **TanStack React Query 5**
- **Supabase JS** (auth + dados), **Framer Motion**, **Recharts**, **FullCalendar**
- **Zod** + **React Hook Form**, **Sonner** (notificações)

### Backend
- **Node.js 20 (Alpine)** + **Fastify 5.2** + **TypeScript**
- **Supabase JS SDK** (Postgres + Auth + Storage)
- **BullMQ 5.34** (filas de jobs), **Cheerio** (web scraping), **Undici** (HTTP)
- **pg** (driver direto PostgreSQL)

### Banco de Dados / Serviços
- **Supabase** (PostgreSQL + Auth + Vector via pgvector)
- **Docker** + **Portainer** (deploy em VPS)
- **Nginx** (reverse proxy)
- **GitHub Container Registry (GHCR)** (imagens Docker)

---

## Estrutura de Pastas

```
boom-agents/
├── src/                          # Frontend (React)
│   ├── pages/                    # Páginas de rota
│   ├── components/               # Componentes por feature
│   │   ├── agents/               # Gerenciamento de agentes
│   │   ├── chat/                 # Interface de chat
│   │   ├── contacts/             # Contatos/CRM
│   │   ├── dashboard/            # Analytics
│   │   ├── inventory/            # Inventário
│   │   ├── tenants/              # Troca de tenant
│   │   ├── tools/                # Config de ferramentas
│   │   └── ui/                   # shadcn/ui components
│   ├── contexts/                 # Auth, Tenant (React Context)
│   ├── hooks/                    # Custom hooks
│   ├── lib/                      # Utilitários cliente
│   ├── types/                    # Tipos TypeScript (database.ts)
│   └── integrations/             # Integrações externas
│
├── server/                       # Backend (Fastify)
│   └── src/
│       ├── routes/               # Endpoints HTTP
│       │   ├── chat-local.ts     # Execução principal do agente
│       │   ├── admin.ts          # Tenants, usuários, providers
│       │   ├── tools.ts          # Definição/execução de ferramentas
│       │   ├── contacts.ts       # API de contatos
│       │   ├── webhooks.ts       # Webhooks externos
│       │   ├── rag.ts            # Busca semântica (RAG)
│       │   ├── queue.ts          # Gerenciamento de follow-ups
│       │   └── prompts-read.ts   # Leitura de prompts
│       ├── services/             # Lógica de negócio
│       │   ├── prompts/          # Prompts por tenant
│       │   │   ├── registry.ts   # Mapeamento tenant → prompt
│       │   │   ├── autoescola-ideal.ts
│       │   │   ├── durce-vita.ts
│       │   │   ├── ppl-motors.ts
│       │   │   ├── pet-home.ts
│       │   │   ├── dr-iuri.ts
│       │   │   └── instituto-vicentim-maekawa.ts
│       │   ├── tool-executor.ts  # Engine de execução de ferramentas
│       │   ├── authorization.ts  # RBAC + RLS
│       │   ├── followup-queue.ts # Agendamento de follow-ups
│       │   ├── chatwoot-labels.ts
│       │   ├── crm-contact-sync.ts
│       │   ├── crypto.ts         # AES-256 para API keys
│       │   └── fipe.ts           # Tabela FIPE
│       ├── workers/
│       │   └── followup-worker.ts # Jobs BullMQ
│       └── utils/
│           ├── flow-logger.ts
│           ├── agendaNotification.ts
│           └── sanitize.js
│
├── sql/                          # Migrações SQL manuais
├── supabase/                     # Migrações Supabase + Edge Functions
├── docs/                         # Documentação adicional
│
├── Dockerfile                    # Build frontend (Vite → Nginx)
├── Dockerfile.server             # Build backend (Node.js)
├── docker-compose.yml            # Dev local
├── docker-compose.portainer.yml  # Produção (build from source)
├── docker-compose.portainer-images.yml # Produção (imagens GHCR)
└── .env.example                  # Template de variáveis de ambiente
```

---

## Arquivos-Chave

| Arquivo | Função |
|---------|--------|
| `src/main.tsx` | Bootstrap do frontend |
| `src/App.tsx` | Rotas e layout principal |
| `server/src/index.ts` | Inicialização do servidor Fastify |
| `server/src/routes/chat-local.ts` | Lógica principal de execução do agente (raciocínio + ferramentas) |
| `server/src/services/prompts/registry.ts` | Mapeia tenant IDs para templates de prompt |
| `sql/001_control_plane.sql` | Schema base do banco de dados |

---

## Módulos e Features

### Gerenciamento de Agentes
- Criar/editar/deletar agentes por tenant
- Configurar provider LLM (OpenAI, Gemini, Anthropic), temperatura, limites de token
- Binding de ferramentas, avatares, tokens de webhook

### Chat & Conversações
- Interface de chat em tempo real (SSE / streaming)
- Persistência do histórico de mensagens
- Rastreamento de tokens por mensagem
- Transcrição de áudio, extração de PDF/imagem
- Execução de ferramentas em até 5 iterações por turno

### Ferramentas Disponíveis
- **SQL Query** — acesso direto ao banco
- **Web Scraper** — parsing HTML com Cheerio
- **REST API** — chamadas HTTP customizadas
- **RAG Search** — busca semântica (pgvector)
- **Inventory Query** — catálogo de produtos
- **Nearest Unit** — busca por localização (Haversine + Google Maps)
- **FIPE Query** — tabela de preços de veículos
- **Calendar** — agendamentos e consultas
- **Chatwoot Assign** — integração CRM
- **Send Notification** — envio de mensagens

### Multi-Tenancy & RBAC
- Isolamento por RLS (Row Level Security)
- Papéis: `superadmin`, `tenant_admin`, `tenant_user`
- Controle por módulos (agents, tools, conversations, etc.)
- Credenciais sensíveis criptografadas com AES-256

### CRM & Contatos
- Importação/gerenciamento de leads e clientes
- Sincronização com Chatwoot
- Metadados: telefone, email, CPF/CNPJ, endereço, notas

### Follow-ups & Agendamentos
- Geração automática de follow-ups via contexto da conversa
- Fila com BullMQ + regras de guarda (contextos negativos, restrições de data)
- Integração com calendário

### Analytics & Monitoramento
- Uso de tokens por agente/provider/modelo
- Estimativa de custos
- Feed de atividades, logs de auditoria, métricas de latência

---

## Banco de Dados (Supabase/PostgreSQL)

### Tabelas Principais
- `profiles` — Usuários e papéis
- `tenants` — Organizações clientes
- `agents` — Definições de agentes IA
- `providers` — Credenciais LLM (criptografadas)
- `tools` — Definições de ferramentas
- `conversations` / `messages` — Histórico de chat
- `contacts` — Registros CRM
- `inventory` — Catálogo de produtos
- `calendar_events` — Compromissos
- `follow_up_queue` — Follow-ups agendados
- `agent_token_usage` — Rastreamento de tokens
- `documents_rag` + `document_chunks` — RAG com embeddings (pgvector)
- `conversation_labels` — Labels do Chatwoot

---

## Variáveis de Ambiente

### Frontend (`.env`)
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
VITE_API_URL              # ex: /api ou https://api.boom.com
```

### Backend (`.env`)
```
PORT                      # default 3001
NODE_ENV                  # production | development
NEXUS_DB_URL              # Supabase project URL
NEXUS_SERVICE_ROLE_KEY
NEXUS_DB_ANON_KEY
ENCRYPTION_KEY            # mínimo 32 chars (AES-256)
OPENAI_API_KEY            # provider fallback
GEMINI_API_KEY            # provider alternativo
GOOGLE_MAPS_API_KEY       # busca por localização
CORS_ORIGINS              # origens permitidas (vírgula separado)
API_BASE_URL
INTERNAL_API_BASE
USE_CHAT_LOCAL            # true | false
USE_CHAT_LOCAL_INJECT     # true | false
```

---

## Deploy

### Imagens Docker (GHCR)
```
ghcr.io/kevenmor/boom-ia-server:latest     # API Node.js
ghcr.io/kevenmor/boom-ia-frontend:latest   # React + Nginx
ghcr.io/kevenmor/boom-ia-proxy:latest      # Nginx reverse proxy
```

### Fluxo de Deploy
1. `docker build` local ou CI
2. `docker push ghcr.io/kevenmor/boom-ia-*:tag`
3. Deploy via Portainer (usar `docker-compose.portainer-images.yml`)

### Migrações
- Arquivos SQL em `sql/` (manuais)
- Migrações gerenciadas pelo Supabase em `supabase/migrations/`

---

## Scripts NPM

### Frontend
```bash
npm run dev          # Dev server (localhost:5173)
npm run build        # Build produção
npm run lint         # ESLint
npm run test         # Vitest
npm run dev:all      # Frontend + backend simultâneo
```

### Backend
```bash
npm run dev          # tsx watch (hot reload)
npm run build        # Compilar TypeScript
npm run start        # Rodar JS compilado
npm run e2e          # Testes end-to-end
npm run e2e:ideal    # E2E tenant Autoescola Ideal
npm run verify:tools # Verificar config de ferramentas
```

---

## Integrações Externas

| Serviço | Uso |
|---------|-----|
| Supabase | Auth, DB, Storage, pgvector |
| OpenAI | Inferência LLM (fallback) |
| Google Gemini | Inferência LLM alternativa |
| Chatwoot | CRM, atribuição de conversas |
| Google Maps | Busca por unidade mais próxima |
| FIPE API | Tabela de preços de veículos (mercado BR) |
| GHCR | Registro de imagens Docker |

---

## Tenants Ativos (Prompts Customizados)

- **Autoescola Ideal** — escola de condução
- **Durce Vita** — (negócio de bem-estar/saúde)
- **PPL Motors** — concessionária de veículos
- **Pet Home** — clínica/loja pet
- **Dr. Iuri** — consultório médico
- **Instituto Vicentim Maekawa** — instituto educacional (com RAG)

---

## Contexto de Desenvolvimento

- Foco no mercado **brasileiro** (FIPE, CPF/CNPJ, idioma PT-BR)
- Arquitetura **multi-tenant first**: toda query filtrada por `tenant_id`
- **Segurança**: RLS no nível do banco + credenciais criptografadas
- **Extensibilidade**: ferramentas modulares com interface unificada
- **Streaming**: SSE para respostas de chat em tempo real
