# Demo não abre / "Agente não encontrado ou link inválido"

Quando o cliente acessa um link de demo (ex.: `ia.agboom.com.br/demo/d979e43a-3200-465a-9165-51bb4d09cc9d`) e vê **"Agente não encontrado ou link inválido"**, a página não conseguiu carregar os dados do agente. As causas mais comuns estão abaixo.

**Importante:** O demo usa **apenas o backend Node.js**. Não há mais Edge Functions; as rotas de demo são atendidas pelo servidor Node (rotas em `server/src/routes/demo.ts` e chat em `server/src/routes/chat-local.ts`).

---

## Fluxo resumido

1. O frontend chama **GET** `{origem}/api/demo/public-agent-info?agent_id=...` (sem auth).
2. O **backend Node** (mesma aplicação que serve a API) responde com os dados públicos do agente (nome, avatar, config sandbox, tenant).
3. Para enviar mensagens, o frontend chama **POST** `{origem}/api/chat`, que internamente usa `chat-local` (Node).
4. Se a resposta do passo 2 for **200** e vier JSON válido, o chat aparece; caso contrário a página mostra "Agente não encontrado ou link inválido".

Qualquer falha no passo 1–4 (rede, 404, 502, 500, CORS, etc.) faz a página tratar como "agente não encontrado".

---

## O que verificar

### 1. Link correto e agente existe no banco

- O ID na URL deve ser o **UUID do agente** (ex.: `d979e43a-3200-465a-9165-51bb4d09cc9d`).
- Esse agente precisa existir na tabela **agents** do projeto Supabase usado em produção (**NEXUS_DB_URL**).

**Como checar:** No painel do Supabase (ou SQL) usado em produção: `SELECT id FROM agents WHERE id = '...'`.

---

### 2. Backend Node rodando e rota registrada

- O servidor Node precisa estar **rodando** (porta configurada, ex. 3001) e o proxy/reverse proxy em produção deve encaminhar `/api/*` para esse servidor.
- A rota **GET /api/demo/public-agent-info** está em `server/src/routes/demo.ts` e registrada no `server/src/index.ts`.

**Como checar:** DevTools (F12) → Aba **Rede** → Recarregar a página do demo → Requisição para `public-agent-info`:
- **404** → agente não existe **ou** rota não registrada / URL errada.
- **502 / 503** → proxy não alcança o Node ou servidor caiu.
- **200** com corpo de erro → ver resposta (ex.: `{"error":"Agent not found"}`).

---

### 3. Proxy em produção

- O frontend usa `window.location.origin + '/api'` (ex.: `https://ia.agboom.com.br/api`).
- O servidor que responde por esse host precisa encaminhar **/api/** para o **backend Node** (não para Supabase Edge Functions).

---

### 4. Variáveis de ambiente no backend Node

- **NEXUS_DB_URL** e **NEXUS_SERVICE_ROLE_KEY** (ou **NEXUS_DB_ANON_KEY**) corretos para o Supabase onde estão os agentes.
- O backend usa o client Supabase (service role) para ler a tabela `agents`; não é necessário anon key no frontend para o demo.

---

## Resumo rápido

| Sintoma na rede / resposta | Provável causa |
|----------------------------|----------------|
| 404 em `public-agent-info` | Agente não existe nesse banco **ou** rota Node não registrada / path errado |
| 502 / 503 | Proxy não alcança o Node ou servidor não está rodando |
| Erro de CORS / rede | Backend não está acessível a partir da origem do frontend |
| 200 com `{"error":"Agent not found"}` | Agente não existe no banco para esse ID |

---

## Melhoria na página

A página do demo guarda o **status HTTP** e a **mensagem de erro** quando a carga do agente falha e exibe uma mensagem mais clara. No console (F12) aparecem status e corpo da resposta para facilitar o diagnóstico.
