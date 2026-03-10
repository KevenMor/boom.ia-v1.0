# Atualização do plano: WebSocket/SSE para Follow-ups

## Roadmap

- **Fase 1 (implementada):** Página de agendamento de follow-ups com GET da fila, filtros por status/agente e atualização automática por **polling** (30s).
- **Fase 2 (roadmap):** Atualização em **tempo real** via **SSE** ou **WebSocket** — rota de stream no backend e `EventSource` (ou WS) no frontend; fallback para polling se não disponível.

---

## Inserir WebSocket no plano?

**Sim, é possível.** Duas abordagens:

1. **WebSocket (bidirecional)** – conexão persistente; servidor pode enviar eventos (ex.: “nova linha na fila”) e o cliente pode pedir refresh.
2. **SSE (Server-Sent Events)** – apenas servidor → cliente, sobre HTTP; mais simples e suficiente para “atualizar a lista quando mudar”.

Para “atualizar a lista quando houver novo agendamento”, **SSE costuma ser a opção mais simples** e com menos pontos de falha (não exige upgrade de conexão em todo o proxy).

---

## Riscos de aplicar

| Risco | WebSocket | SSE | Mitigação |
|-------|-----------|-----|------------|
| **Proxy/reverse proxy** | Precisa configurar `Upgrade: websocket` e timeouts no Nginx/Traefik/Caddy. Se não configurado, WS não sobe. | Usa HTTP normal (GET long-polling); a maioria dos proxies já suporta. | Documentar e testar em staging; SSE reduz risco de config no proxy. |
| **Conexões simultâneas** | 1 conexão WS por aba aberta na página de follow-ups. | 1 conexão HTTP por aba (stream). | Número de usuários admin é baixo; risco baixo. |
| **Complexidade no servidor** | Exige `@fastify/websocket` (ou similar), rota de upgrade e gerenciar broadcast (quem notificar). | Uma rota GET que mantém a resposta aberta e envia eventos quando a fila mudar. | SSE: uma rota + um “registro de clientes” para broadcast; WS: idem com lib. |
| **Timeout de proxy** | Alguns proxies fecham conexões idle em 60s. | Mesmo risco para conexão longa. | Enviar heartbeat (ex.: comentário SSE a cada 30s) ou reconectar no cliente. |
| **Compatibilidade com o que já existe** | Não altera o fluxo atual de processamento (POST `/queue/followups`). Só adiciona um canal de “aviso” para a UI. | Idem. | **Não atrapalha** o processamento já em produção. |

---

## Atrapalha o que já está em produção?

**Não**, se for feito como **camada opcional**:

- O processamento de follow-ups continua igual: o cron (ou job) chama POST `/queue/followups`; a tabela `follow_up_queue` é lida/atualizada como hoje.
- A **página de acompanhamento** hoje só precisa de:
  - **GET** para listar follow-ups (novo).
  - **Atualização** da lista: primeiro com **polling** (refetch a cada 20–30s); em seguida, **opcionalmente**, WebSocket ou SSE para atualizar em tempo real quando a página estiver aberta.
- Se WebSocket/SSE **não estiver configurado** (ou falhar), a página continua funcionando só com polling. Ou seja: **fallback para o que já está no plano (GET + refetchInterval)**.

Resumo: **não muda nenhum contrato ou fluxo já em produção**; só adiciona um canal opcional para a UI atualizar mais rápido.

---

## Recomendação no plano

1. **Fase 1 (já no plano)**  
   - GET para listar follow-ups + polling (refetchInterval).  
   - Entrega valor e não mexe em produção.

2. **Fase 2 (inserir no plano)**  
   - **SSE** (preferível ao WS para este caso):  
     - Nova rota, ex.: `GET /api/queue/followups/stream?tenant_id=...`.  
     - Autenticação igual às outras rotas.  
     - Servidor mantém a resposta aberta e, quando houver insert/update/delete em `follow_up_queue` (para aquele tenant), envia um evento (ex.: `{ "event": "refresh" }`).  
   - No frontend: na página de follow-ups, abrir o EventSource; ao receber o evento, dar `refetch()` na query da lista. Se SSE falhar ou não existir, continuar só com polling.

3. **Opcional: WebSocket**  
   - Só considerar se no futuro precisar de mensagens bidirecionais (ex.: cliente pedir “cancelar este follow-up” e receber confirmação em tempo real). Para “só atualizar a lista”, SSE é suficiente e mais simples.

---

## O que colocar no plano principal

- **Incluir** no escopo: “Fase 2: SSE para atualização em tempo real da lista de follow-ups (opcional; fallback para polling).”
- **Backend:** rota `GET /api/queue/followups/stream?tenant_id=...` (auth), que registra o cliente e envia evento quando a fila do tenant mudar (ex.: após processamento do cron ou inserção).
- **Frontend:** na página de follow-ups, usar `EventSource` quando logado; no `onmessage`, invalidar/refetch da lista; se SSE falhar, manter apenas polling.
- **Riscos:** documentar necessidade de heartbeat (comentário SSE a cada 30s) para alguns proxies; e que, sem SSE, a página segue funcionando com polling.

Com isso, o plano já fica com WebSocket/SSE inserido, riscos descritos e garantia de que **não atrapalha o que já está em produção**.
