# Análise E2E – Bug "Desculpe, tive um problema ao processar sua mensagem"

## Resumo

Durante o teste E2E no fluxo do agente Ana Júlia (PPL Motors), ao enviar **"Carlos"** (nome do usuário após interesse no Fox), a resposta foi:

> "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?"

## Fluxo do erro

1. **Dispatcher** (gpt-4o) processa a mensagem "Carlos".
2. **Conversational** (Gemini) gera a resposta.
3. `debugSendTotalLen === 0` → nenhum conteúdo foi enviado ao cliente.
4. **Retry** é acionado (request não-streaming).
5. O retry falha em um destes cenários:
   - `sanitizeLLMOutput(retryContent)` retorna vazio
   - Retry retorna conteúdo vazio
   - Retry HTTP falha (status != 200)
   - Exceção no retry

## Localização no código

| Arquivo | Linhas | Descrição |
|---------|--------|-----------|
| `server/src/routes/chat-local.ts` | 1053-1095 | Bloco `if (debugSendTotalLen === 0)` – retry e mensagem de erro |
| `server/src/utils/sanitize.ts` | 1-48 | `sanitizeLLMOutput` – pode retornar `""` se o conteúdo for considerado JSON/comando |

## Hipóteses

1. **Modelo retornou vazio** – Gemini não gerou texto.
2. **Conteúdo filtrado** – `filterCommandLinesFromStream` removeu tudo (ex.: linhas de comando).
3. **Sanitize excessivo** – `sanitizeLLMOutput` removeu texto válido no retry.
4. **Erro de API** – timeout, rate limit ou erro HTTP no retry.

## Soluções implementadas

### 1. Logging de diagnóstico

Quando `debugSendTotalLen === 0`:

```ts
console.warn("[Chat-Local] Resposta vazia do conversacional", {
  debugDeltaCount,
  debugDeltaTotalLen,
  debugSendCount,
  hint: debugDeltaTotalLen > 0 && debugSendTotalLen === 0
    ? "conteúdo filtrado por filterCommandLines"
    : "modelo retornou vazio ou sem deltas",
});
```

Permite distinguir:
- modelo vazio vs. conteúdo filtrado
- quantidade de deltas recebidos vs. enviados

### 2. Fallback quando `sanitize` retorna vazio

Nova função `fallbackSanitizeForRetry` em `sanitize.ts`:

- Remove apenas linhas de comando explícitas (`isCommandLine`).
- Mantém texto conversacional.
- Retorna `""` se o conteúdo for JSON puro ou não for útil.

Se `sanitizeLLMOutput` retornar vazio mas o retry tiver conteúdo conversacional, usamos esse fallback em vez da mensagem genérica de erro.

### 3. Logging do retry HTTP

Quando o retry falha (status != 200):

```ts
const errText = await retryResp.text();
console.warn("[Chat-Local] Retry falhou:", retryResp.status, errText.slice(0, 150));
```

Facilita diagnóstico de 429, 500, etc.

### 4. Logging do conteúdo retornado pelo retry

Quando `sanitize` retorna vazio e o fallback também:

```ts
console.warn("[Chat-Local] sanitize retornou vazio, retryContent preview:", retryContent.slice(0, 200));
```

Permite ver o que o modelo retornou antes da sanitização.

## Próximos passos

1. **Deploy** – subir as alterações e fazer novo deploy.
2. **Reproduzir** – repetir o fluxo (saudação → interesse Fox → "Carlos").
3. **Logs no Easypanel** – conferir:
   - `[Chat-Local] Resposta vazia do conversacional` + hint
   - `[Chat-Local] Retry OK` ou `[Chat-Local] sanitize retornou vazio, usando fallback`
   - `[Chat-Local] Retry falhou` (status e `errText`)
4. **Ajustes adicionais** – conforme os logs, considerar:
   - Relaxar regras em `sanitizeLLMOutput` se estiver removendo texto válido.
   - Ajustar `filterCommandLinesFromStream` se o filtro estiver removendo demais.
   - Tratar rate limit/erros de API com retry com backoff.

## Como verificar os logs no Easypanel

1. Acesse: https://easypanel.agboom.com.br/projects/conexoesapp/app/services_boomia
2. Clique em **Logs**.
3. Selecione o serviço **server** (se houver múltiplos).
4. Procure por `[Chat-Local]` no momento do erro.
