# ROADMAP — Boom IA / boom-agents

Roadmap de melhorias incrementais. **Nenhum item exige refatoração arquitetural** — tudo é polimento de tooling, documentação e operação. Itens podem ser executados em qualquer ordem dentro de cada fase.

**Princípio guia:** não mexer no que funciona. Cada item aqui tem ROI claro e risco baixo.

**Legenda de impacto:**
- 🔥 Alto — destrava ou previne dor real
- ⚡ Médio — melhora qualidade de vida do time
- 💡 Baixo — polimento

**Legenda de esforço:** S (≤ 1 dia) · M (1–3 dias) · L (1+ semana)

---

## Fase 1 — Quick wins (1–2 semanas)

Itens de alto impacto e baixo esforço. Recomendado começar por aqui.

### 1.1 README real 🔥 · S
- **Problema:** `README.md` é template Lovable, não reflete o projeto.
- **Ação:** reescrever com: descrição do produto, stack, setup local em 5 passos, link para `CLAUDE.md`, link para `docs/`, comando `npm run dev:all`.
- **Critério de pronto:** dev novo clona o repo e sobe ambiente local em < 15 min só seguindo o README.

### 1.2 Consolidar lockfiles ⚡ · S
- **Problema:** `bun.lock`, `bun.lockb`, `package-lock.json`, `deno.lock` convivem; risco de instalar deps diferentes dependendo do dev.
- **Ação:** decidir gerenciador por superfície:
  - **Raiz + `server/`:** npm (já é o usado nos `npm run` scripts). Apagar `bun.lock` e `bun.lockb`.
  - **`supabase/functions/`:** deno (manter `deno.lock`).
- **Critério de pronto:** apenas `package-lock.json` na raiz e em `server/`; `deno.lock` só em supabase functions.

### 1.3 Remover `.env` do git ⚡ · S
- **Problema:** `.env` (395B) está commitado na raiz. Mesmo sendo placeholder, é mau hábito e cria risco se alguém colocar segredo real e commitar.
- **Ação:** `git rm --cached .env`, garantir `.env` no `.gitignore`, manter só `.env.example`.
- **Critério de pronto:** `git ls-files | grep '^\.env$'` retorna vazio.

### 1.4 `.gitattributes` forçando UTF-8 🔥 · S
- **Problema:** prompts pt-BR já tiveram corrupção em 3+ commits (cb51a1a, 31b6e85, dd954fe). `registry.ts` ainda mostra `���` em comentário.
- **Ação:** criar/expandir `.gitattributes`:
  ```
  *.ts text eol=lf working-tree-encoding=UTF-8
  *.tsx text eol=lf working-tree-encoding=UTF-8
  *.md text eol=lf working-tree-encoding=UTF-8
  *.sql text eol=lf working-tree-encoding=UTF-8
  ```
- Renormalizar com `git add --renormalize .`.
- **Critério de pronto:** novo commit com caractere especial pt-BR não corrompe em outra máquina.

### 1.5 Limpar comentário corrompido em `registry.ts` 💡 · S
- **Problema:** `server/src/services/prompts/registry.ts` linha 2 tem `���` (resíduo de corrupção UTF-8 antiga).
- **Ação:** substituir por `—` ou texto correto.
- **Critério de pronto:** `grep -r '���' server/src` retorna vazio.

---

## Fase 2 — DevOps e operação (3–4 semanas)

Reduzir trabalho manual de deploy e ganhar visibilidade de produção.

### 2.1 GitHub Actions: lint + test em PR 🔥 · M
- **Problema:** sem CI; bugs de lint/teste só são vistos em ambiente local.
- **Ação:** workflow `.github/workflows/ci.yml` que em cada push/PR roda:
  - `npm ci` (raiz e `server/`)
  - `npm run lint`
  - `npm run test` (raiz e `server/`)
  - Type check (`tsc --noEmit`) em frontend e server.
- **Critério de pronto:** PR não pode ser merged se CI vermelho.

### 2.2 GitHub Actions: build + push GHCR em tag 🔥 · M
- **Problema:** `npm run build:docker:all` é manual; risco de esquecer e quebrar paridade dev↔prod (já documentado como risco em `docs/DEV-PROD-PARIDADE.md`).
- **Ação:** workflow `.github/workflows/release.yml` disparado em tag `v*.*.*` que:
  - Builda `boom-ia-server`, `boom-ia-frontend`, `boom-ia-proxy`
  - Faz push para GHCR com tags `latest` + versão semântica
  - Opcional: notifica Portainer via webhook para fazer pull
- **Critério de pronto:** `git tag v1.x.x && git push --tags` substitui o build manual.

### 2.3 Consolidar docker-compose ⚡ · M
- **Problema:** 8+ variantes de `docker-compose.*.yml` na raiz + outros em `docker/`. Risco de aplicar arquivo errado em produção.
- **Ação:** reduzir para 3 arquivos canônicos:
  - `docker-compose.yml` — desenvolvimento local
  - `docker-compose.portainer.yml` — produção (já é o em uso na VPS)
  - `docker-compose.staging.yml` — opcional, se houver staging
  - Mover legados para `docker/legacy/` com README explicando que estão depreciados.
- **Critério de pronto:** raiz tem no máximo 3 `docker-compose.*.yml`.

### 2.4 Consolidar `.env.*` ⚡ · S
- **Problema:** 5 arquivos `.env.*` (`.env.example`, `.env.frontend.easypanel`, `.env.portainer-git-traefik`, `.env.portainer.example`, `.env.stack`).
- **Ação:** manter apenas `.env.example` (dev) e `.env.production.example` (prod/Portainer). Mover resto para `docker/legacy/`.
- **Critério de pronto:** raiz tem no máximo 2 `.env.*example`.

### 2.5 Healthcheck unificado ⚡ · S
- **Problema:** já existem `/health`, `/api/health/nexus`, `/api/storage-health` mas espalhados.
- **Ação:** criar `/api/health/full` que agrega os 3 + status do Redis (BullMQ) + status dos workers. Usar em uptime monitor (UptimeRobot, BetterStack).
- **Critério de pronto:** uma única chamada retorna estado completo do sistema.

### 2.6 Observabilidade — Sentry ou OpenTelemetry 🔥 · M
- **Problema:** `flow-logger.ts` loga localmente mas não há telemetria centralizada. Erros em produção dependem de SSH na VPS para ler logs do container.
- **Ação:** integrar Sentry (mais simples) ou OpenTelemetry + Grafana Cloud (mais flexível) no Fastify e no frontend. Priorizar erros não-tratados e latência de tools.
- **Critério de pronto:** alerta automático quando taxa de erro > limite ou tool fica > 10s.

---

## Fase 3 — Qualidade e dívida técnica (1–2 meses)

Polimento que reduz superfície de bug e melhora vida do desenvolvedor.

### 3.1 Restringir catch-all content-type parser ⚡ · M
- **Problema:** `index.ts` linha 78 aceita qualquer Content-Type como buffer. Útil hoje, mas é vetor de confusão.
- **Ação:** mapear Content-Types realmente usados, listar explicitamente, deixar `*` com warning de log.
- **Critério de pronto:** logs mostram quais tipos não-listados chegam, e o `*` vira lista finita.

### 3.2 Cobertura de testes em rotas críticas ⚡ · M
- **Problema:** `chat-local.ts` tem cobertura indireta via tests de utils, mas não tem teste de integração end-to-end do loop de tools.
- **Ação:** adicionar `chat-local.integration.test.ts` com `fastify.inject()` mockando provider LLM e validando comportamento de:
  - Loop de até 5 iterações de tool
  - Sanitização de resposta
  - Fallback de modelo em 503
  - Erro amigável em 401/429
- **Critério de pronto:** ≥ 4 testes de integração cobrindo os fluxos principais.

### 3.3 Few-shot examples nos prompts de tenant 💡 · M (por tenant)
- **Problema:** prompts atuais são instruções abstratas. Few-shot reduz alucinação mais que regra explícita.
- **Ação:** adicionar 2–3 conversas-exemplo (cliente → resposta ideal) em cada tenant ativo. Começar pelos com maior volume.
- **Critério de pronto:** taxa de fallback/handoff inadequado cai mensurável em E2E.

### 3.4 Validação de saída pós-LLM ⚡ · M
- **Problema:** `sanitize.ts` remove vazamentos de stream, mas não valida fatos. Ex: LLM cita telefone que não veio de tool.
- **Ação:** adicionar validador que verifica se números/datas/preços citados na resposta aparecem nos resultados de tool da mesma turn. Se não, log de warning + (opcional) reescrever.
- **Critério de pronto:** dashboard mostra quantos % das respostas têm "claim sem grounding".

### 3.5 Migrar prompts de TS → DB 💡 · L
- **Problema:** adicionar tenant exige commit + deploy. Já existe tabela `prompts` no schema, mas `registry.ts` ignora.
- **Ação (só se atingir 15+ tenants):** mover `SYSTEM_PROMPT/COMMUNICATION_RULES/DISPATCHER_PROMPT/FOLLOWUP_PROMPT` para colunas em `prompts`, com fallback para arquivo TS se DB não tiver entrada. Cache em memória com TTL curto.
- **Critério de pronto:** painel admin permite editar prompt de tenant sem redeploy.
- **Quando fazer:** só quando o atrito de redeploy começar a doer.

---

## Fase 4 — Crescimento (a definir)

Itens que dependem de demanda real do produto. Não fazer preventivamente.

### 4.1 Sistema de skills compartilhadas (capacidade-based, não tenant-based)
Ver discussão na conversa: extrair `agendamento`, `consulta_estoque`, `consulta_fipe`, `hospedagem`, `handoff` como módulos reutilizáveis ativados por tool habilitada. **Gatilho:** ≥ 3 tenants novos com capacidades sobrepostas em 60 dias.

### 4.2 RAG por tenant
Ingestão de FAQ/catálogo/políticas de cada cliente em embeddings, alimentando contexto da conversa. **Gatilho:** ≥ 2 tenants pedindo "agente que sabe X específico do meu negócio sem precisar de tool".

### 4.3 Painel de analytics de qualidade
Dashboard que mostra por tenant: taxa de handoff, latência média, alucinações detectadas, custo de tokens. **Gatilho:** time comercial ou suporte pedindo dados para conversar com cliente.

### 4.4 Modo schema-validated (Gemini JSON mode)
Para fluxos críticos (agendamento, cobrança), forçar resposta estruturada via `response_schema` do Gemini. **Gatilho:** alucinação reincidente em fluxo específico.

---

## Itens fora do roadmap (decisões conscientes de **não fazer**)

Mantidos aqui para registrar que **foram considerados e rejeitados**:

- ❌ **Reescrever prompt-system como skills por agente** — over-engineering. Arquitetura atual funciona.
- ❌ **Migrar de Fastify para outro framework** — Fastify performa bem, time conhece. Sem motivo.
- ❌ **Trocar Supabase por Postgres puro** — Supabase entrega Auth + Storage + RLS sem custo de manutenção.
- ❌ **Cobertura de testes 90%** — vale o esforço só onde bug dói. Atual é cobertura cirúrgica e está correta.

---

## Como manter este roadmap vivo

1. **Revisar a cada release/sprint:** marcar itens concluídos como `✅` e mover para seção `## Concluído` no fim.
2. **Mover de fase quando ficar óbvio:** se um item da Fase 3 virar urgente (ex: outage), pode subir para Fase 1.
3. **Adicionar gatilhos da Fase 4 para Fase 3** quando os critérios baterem.
4. **Não adicionar item sem ROI claro.** Se não for óbvio o porquê, provavelmente é over-engineering.

---

## Concluído

_(mover itens para cá conforme forem entregando, com data e link de PR/commit)_

- _ainda nada_
