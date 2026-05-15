# AGENTS – Boom IA – Deploy e fluxo das imagens

Documentação para agentes e desenvolvedores sobre como o projeto sobe na VPS (Portainer) e de onde vêm as imagens.

---

## O que está rodando na VPS

1. **Compose (YAML)**  
   O conteúdo do `docker-compose.portainer.yml` é **colado no Portainer** (Web editor). Ou seja: a definição da stack é o arquivo que **você colou** no Portainer, **não** um clone do repositório na VPS.

2. **Imagens (server, frontend, proxy)**  
   São **buildadas no PC** (ou em CI) e enviadas para o **GitHub Container Registry (GHCR)** com `docker push`.  
   Na VPS o Docker **só faz pull** dessas imagens do GHCR (`ghcr.io/kevenmor/...`).  
   Na VPS **não** acontece:
   - clone do repositório no GitHub
   - `docker build`
   - uso direto do código do GitHub

---

## Resumo

| O quê              | Onde fica / de onde vem                            |
|--------------------|----------------------------------------------------|
| Código do projeto  | Repositório GitHub (no PC / CI; não é clonado na VPS) |
| Build das imagens  | Feito no PC → enviado para o GHCR                  |
| Na VPS             | Só o **compose** (colado no Portainer) + **pull** das imagens do GHCR |

Conclusão: na VPS sobe o **build do projeto** no sentido de **imagens já buildadas** (que estavam no GHCR). A stack usa o **arquivo (compose) que foi colado no Portainer**, e **não** um clone direto do repositório no GitHub. O repositório GitHub não é acessado pela VPS nesse fluxo; só o **GHCR** (registry de imagens) é.

---

## Paridade dev ↔ produção

**Regra:** Server e frontend devem ser deployados juntos. Se só o server for atualizado, a produção terá frontend antigo (e vice-versa). Ver `docs/DEV-PROD-PARIDADE.md`.

---

## Arquivos relevantes

- **Stack Portainer (Web editor):** `docker-compose.portainer.yml`
- **Deploy por Git (quando suportado):** `docker-compose.portainer-git.yml`
- **Compose local (Docker Desktop):** `docker-compose.yml`
- **Registry:** GHCR – `ghcr.io/kevenmor/boom-ia-server`, `boom-ia-frontend`, `boom-ia-proxy`
- **Token GHCR:** configurar em Portainer > Registries (ou `docker login ghcr.io` na VPS)

---

## Desenvolvimento local

### Pré-requisitos
- Node.js 18+
- npm

### Setup
```bash
npm install
cd server && npm install
```

### Variáveis de ambiente
- Copiar `.env.example` → `.env` (raiz)
- Copiar `server/.env.example` → `server/.env`
- Preencher: `NEXUS_DB_URL`, `NEXUS_SERVICE_ROLE_KEY`, `NEXUS_DB_ANON_KEY`, `ENCRYPTION_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

### Rodar
```bash
npm run dev:all
```
- Frontend: http://localhost:8080
- Backend: http://localhost:3001
- Vite proxy: `/api` → backend

### Testes
```bash
cd server && npm run test        # testes do server
npm run test                     # testes do frontend
```

---

## Estrutura de pastas

```
├── src/                    Frontend React (painel admin)
│   ├── pages/              Páginas/rotas
│   ├── components/         Componentes UI e de domínio
│   ├── hooks/              React Query hooks
│   ├── contexts/           Providers globais (Auth, Tenant, Sidebar)
│   ├── integrations/       Cliente Supabase
│   └── lib/                Utilitários puros
│
├── server/                 Backend Fastify
│   └── src/
│       ├── routes/         Endpoints REST
│       ├── services/       Lógica de negócio + tools
│       ├── utils/          Utilitários (sanitize, notificações)
│       ├── workers/        BullMQ workers
│       └── config/         Env vars
│
├── supabase/functions/     Edge Functions Deno
├── sql/                    Migrations SQL manuais
├── docker/                 Infra Docker + docs de deploy
├── docs/                   Documentação operacional
└── scripts/                Scripts E2E e utilitários
```

---

## Regras globais

### Commits
- Mensagens em **pt-BR**
- Formato: `fix(escopo): descrição`, `feat(escopo): descrição`

### Código
- TypeScript strict
- Frontend: shadcn/ui + Tailwind, hooks para dados, contexts para estado global
- Backend: Fastify, serviços como funções, tools retornam `{ success, result, error }`
- Datas: sempre timezone Brasília
- Nunca citar telefones em prompts/respostas da IA

### Testes
- Vitest (server e frontend)
- Testes lado-a-lado: `arquivo.ts` → `arquivo.test.ts`
- Obrigatório para: sanitização, tools, prompts, utilitários

---

## Ordem de leitura recomendada

1. `server/src/routes/chat-local.ts` — cérebro do agente
2. `server/src/services/tool-executor.ts` — engine de tools
3. `server/src/services/prompts/registry.ts` — sistema de prompts
4. `server/src/index.ts` — bootstrap do server
5. `src/App.tsx` — árvore de rotas do frontend
6. `src/contexts/AuthContext.tsx` — autenticação
7. `src/integrations/supabase/nexus-client.ts` — cliente Supabase

---

## Documentação por pasta

### Server
- [routes](server/src/routes/AGENTS.md)
- [services](server/src/services/AGENTS.md)
- [prompts](server/src/services/prompts/AGENTS.md)
- [utils](server/src/utils/AGENTS.md)
- [workers](server/src/workers/AGENTS.md)
- [config](server/src/config/AGENTS.md)
- [constants](server/src/constants/AGENTS.md)
- [types](server/src/types/AGENTS.md)
- [lib](server/src/lib/AGENTS.md)

### Frontend
- [pages](src/pages/AGENTS.md)
- [components](src/components/AGENTS.md)
- [hooks](src/hooks/AGENTS.md)
- [contexts](src/contexts/AGENTS.md)
- [lib](src/lib/AGENTS.md)
- [integrations/supabase](src/integrations/supabase/AGENTS.md)

### Infraestrutura
- [sql](sql/AGENTS.md)
- [supabase/functions](supabase/functions/AGENTS.md)
- [docker](docker/AGENTS.md)
- [docs](docs/AGENTS.md)
- [scripts](scripts/AGENTS.md)
