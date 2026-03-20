# Laudo: Fallback "não foi processado" e reinício de conversa

## Resumo executivo

Com base no código, no debug da UI e na documentação existente, o diagnóstico indica:

1. **"Não foi processado":** o modelo conversacional (Gemini) retornou **0 tokens de saída** no stream, acionando o fallback.
2. **"Reinício" da conversa:** o retry usa **apenas 4 mensagens** de contexto; com isso, o modelo tende a gerar respostas genéricas (saudação, pergunta de nome), dando impressão de reinício.
3. **Histórico:** no fluxo normal são usadas até **60 mensagens** (queue) ou **todas** (sandbox); no retry, apenas **4**.

---

## Causa raiz do fallback

### Evidência do debug (08:01)

- **Dispatcher (gpt-4o-mini):** 12,238 in + 48 out = 12,286 total
- **Conversacional** (modelo configurado no agente, ex.: gemini-2.0-flash): 22,402 in + **0 out** = 22,402 total

O `0 output tokens` indica que o Gemini não gerou texto no stream. Isso faz `debugSendTotalLen === 0` e dispara o fallback.

### Hipóteses

| Hipótese | Probabilidade | Explicação |
|----------|---------------|------------|
| Modelo retornou vazio | **Alta** | 0 tokens de saída no stream |
| Conteúdo filtrado | Média | `filterCommandLinesFromStream` remove linhas de comando; se o modelo retornou só isso, o filtro zera o envio |
| Retry falhou | Baixa | Se retry falhasse, o log seria diferente; o fallback genérico seria enviado |

### Fluxo após o fallback

1. Backend detecta `debugSendTotalLen === 0`
2. Retry com `conversationalMessagesClean.slice(0,1).concat(...slice(-4))` → **1 system + 4 user/assistant**
3. Retry pode retornar vazio, sanitize pode zerar, ou HTTP pode falhar
4. Qualquer falha leva à mensagem: `"Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?"`

---

## Causa do aparente reinício

Após o fallback, o usuário enviou "Achei muito lindo" e recebeu:

> "Olá! Sou a Ana Júlia, da PPL Motors de Sorocaba. Que bom que você gostou, ele é realmente maravilhoso! Vou cuidar do seu atendimento por aqui..."

E na próxima mensagem (👍):

> "Fico feliz que tenha gostado! Pra eu te ajudar com as informações, como posso te chamar?"

Isso sugere:

1. **Contexto reduzido no retry:** com 4 mensagens, o modelo pode perder o contexto anterior.
2. **Resposta genérica:** o modelo retorna saudação e pergunta de nome.
3. **Sem perda de `conversation_id`:** a conversa continua a mesma; o que mudou foi o contexto e o comportamento do modelo.

---

## Histórico de mensagens

| Fluxo | Quantidade | Arquivo |
|-------|------------|---------|
| Sandbox | Todas (sem limite) | `AgentSandbox.tsx` envia `allMessages` |
| Queue (WhatsApp) | 60 | `queue.ts` `CHAT_HISTORY_MESSAGE_LIMIT` |
| Retry (fallback) | 12 user/assistant + 1 system | `chat-local.ts` `RETRY_CONTEXT_MESSAGE_LIMIT = 12` |

---

## Alterações implementadas

1. **Logging em `chat-local.ts`:**
   - `messagesToUseCount`, `conversationalUserAssistantCount`, `responseConvId` em `[Chat-Local] Resposta vazia do conversacional`
   - `retryMessagesCount`, `originalConversationalCount`, `responseConvId` em `[Chat-Local] Retry usando contexto reduzido`

2. **Documentação:**
   - `docs/DIAGNOSTICO-FALLBACK-REINICIO.md` — mapeamento SSE ↔ logs + ramos de fallback

---

## Recomendações

1. **Contexto do retry aumentado:** de 4 para 12 mensagens (`RETRY_CONTEXT_MESSAGE_LIMIT`) em `chat-local.ts` para reduzir respostas genéricas.
2. **Reproduzir e inspecionar logs:** ao reproduzir, verificar qual ramo (A–F) ocorreu.
3. **Tratar rate limit:** se o retry falhar com 429, implementar retry com backoff.
4. **Revisar `sanitizeLLMOutput`:** se o ramo C for frequente, relaxar regras que removem texto válido.

---

## Referências

- `server/src/routes/chat-local.ts` — fluxo dual-provider e fallback
- `server/src/utils/sanitize.ts` — `sanitizeLLMOutput`, `fallbackSanitizeForRetry`
- `docs/E2E-BUG-ANALYSIS.md` — análise anterior do mesmo bug
- `docs/DIAGNOSTICO-FALLBACK-REINICIO.md` — mapeamento SSE ↔ logs
