# Roadmap — Chat ao Vivo em tempo real

Mensagens do cliente aparecendo instantaneamente no Chat ao Vivo, sem depender de polling.

---

## Visão geral

| Fase | Descrição | Status |
|------|-----------|--------|
| **1** | Polling (atual) | ✅ Implementado |
| **2** | SSE ou WebSocket para tempo real | ⬜ Roadmap |

---

## Estado atual

- **Polling:** `useConversations` usa `refetchInterval: 2000` (2s) para mensagens
- Mensagens novas aparecem com atraso de 0–2 segundos
- Funciona bem para a maioria dos casos

---

## Fase 2 — Tempo real (SSE ou WebSocket)

### Objetivo

Quando o cliente envia mensagem via WhatsApp → Chatwoot → webhook, o operador vê a mensagem **na hora** na tela do Chat ao Vivo, sem esperar o próximo poll.

### Abordagem sugerida

**SSE (Server-Sent Events)** — preferível ao WebSocket para este caso:

- Fluxo é unidirecional: servidor → cliente (nova mensagem chegou)
- Mais simples que WebSocket (usa HTTP normal, sem upgrade)
- Menos pontos de falha em proxy/reverse proxy
- Fallback: se SSE falhar, manter polling atual

**WebSocket** — considerar só se no futuro precisar de bidirecional (ex.: digitação em tempo real, presença).

### Esboço técnico

| Componente | Alteração |
|------------|-----------|
| **Backend** | Nova rota `GET /api/conversations/stream?agent_id=...&conversation_id=...` (auth). Mantém resposta aberta; envia evento quando nova mensagem for salva na conversa. |
| **webhooks/queue** | Após salvar mensagem no banco, notificar clientes inscritos no stream daquela conversa. |
| **Frontend** | Na página Chat ao Vivo, abrir `EventSource` quando conversa selecionada; no `onmessage`, `queryClient.invalidateQueries(["multi-conversation-messages"])`. Se SSE falhar, continuar só com polling. |
| **Proxy** | Documentar heartbeat (comentário SSE a cada 30s) para evitar timeout em alguns proxies. |

### Riscos (ver PLAN-FOLLOWUPS-REALTIME.md)

- Timeout de proxy em conexões longas → heartbeat
- SSE não configurado → fallback para polling (não quebra o que existe)

---

## Ordem sugerida

1. Manter polling atual (já funciona)
2. Implementar SSE quando prioridade permitir
3. Opcional: reduzir `refetchInterval` para 1–1,5s como melhoria rápida sem SSE

---

## Referências

- `docs/PLAN-FOLLOWUPS-REALTIME.md` — mesma abordagem para follow-ups (SSE vs WebSocket, riscos, fallback)
- `src/hooks/useConversations.ts` — polling atual
