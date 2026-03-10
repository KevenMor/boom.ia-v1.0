# Chat ao Vivo – Onde analisar logs

Referência rápida para acompanhar conversas ao vivo e analisar logs do fluxo WhatsApp/Chatwoot → Agente.

---

## Fluxo do Chat ao Vivo

1. **Chatwoot** recebe mensagem (WhatsApp/Web) e envia webhook para o server.
2. **webhooks.ts** trata o evento, identifica agente/contato, enfileira ou processa.
3. **queue.ts** consome a fila: chama **chat-local** (LLM), salva mensagens, envia resposta ao Chatwoot.
4. **chat-local.ts** faz o ciclo dispatcher + conversacional (Gemini) e pode registrar na sessão de debug (`debug-9697c3.log` se a instrumentação estiver ativa e a requisição passar por esse fluxo).

---

## Onde ver os logs

### Produção (Easypanel / VPS)

- **Container do server (boom-ia-server):** logs padrão (stdout/stderr).
- Procurar por:
  - `[Webhook]` – entrada do webhook, agente, contato, cancelamento.
  - `[ProcessQueue]` – processamento da fila, transcrição de áudio, chamada ao agente, envio ao Chatwoot.
  - `[FollowUp]` – follow-ups e tentativas de reenvio.
  - `[Reminder]` – lembretes de agenda.
  - `[Chat-Local]` – dual-provider, notificações, erros do LLM.

### Local (npm run dev / Docker)

- Mesmos prefixos no terminal onde o server está rodando.
- Se a instrumentação de debug estiver ativa: `debug-9697c3.log` no workspace (apenas para requisições que passam por chat-local com sessão 9697c3).

---

## Prefixos úteis para “conversa com Keven”

| Prefixo            | Arquivo        | O que indica |
|--------------------|----------------|--------------|
| `[Webhook] Incoming` | webhooks.ts  | Mensagem recebida; agent_id, external_user_id, contact. |
| `[ProcessQueue]`     | queue.ts     | Conv criada/encontrada; histórico carregado; chamada ao agente; envio da resposta. |
| `[ProcessQueue] callChatAgent failed` | queue.ts | Erro na chamada ao chat-local (timeout, 5xx, etc.). |
| `[Chat-Local]`       | chat-local.ts | Requisição ao LLM, streaming, retry, notificação de agenda. |

Para filtrar no Easypanel (ou em `docker logs`):

- Por contato: o log não costuma incluir o nome “Keven”; use `external_user_id` ou o telefone (ex.: `99802` ou `3871`) se aparecer em algum log.
- Por agente: use o `agent_id` da Ana Júlia (PPL) nos logs.
- Por erro: busque `error`, `failed`, `Falha`, `failed to save`, `callChatAgent failed`.

---

## Como acompanhar a conversa “ao vivo”

1. **Interface:** Chat ao Vivo → Agente (ex.: Ana Júlia) → Buscar “keven” → abrir o contato “Keven Moreira JAGUAR”.
2. **Debug na UI:** Clicar em “Mostrar debug” para ver tools chamadas e metadados da última resposta.
3. **Logs no servidor:** Abrir os logs do container do server no Easypanel e acompanhar em tempo real; filtrar por `[Webhook]`, `[ProcessQueue]` e `[Chat-Local]` para o horário da mensagem.

Assim você consegue cruzar o que aparece na tela com o que o backend está fazendo e com erros, se houver.
