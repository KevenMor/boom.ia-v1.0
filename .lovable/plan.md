

## Diagnóstico

Analisando os logs e o código, identifiquei **duas causas** do problema:

### Causa 1: Welcome Flow ignora `response_parts`

A interação capturada entrou no **welcome flow** (primeira mensagem do cliente). No `deliver-message`, o welcome flow envia `response_text` (texto completo concatenado) como **uma única mensagem** na linha 336:

```typescript
// Linha 336 — envia TUDO junto
await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, greetingText);
```

O `response_parts` (4 partes geradas pelo chat-agent) é completamente ignorado. Por isso no WhatsApp chegou um bloco único.

### Causa 2: Welcome flow não deveria ter ativado neste caso

O cliente já mencionou um veículo específico ("Audi A3") na primeira mensagem — logo a IA respondeu com detalhes do estoque + apresentação. O welcome flow foi acionado porque `conversationMessages.length === 0`, mas neste caso o conteúdo era muito extenso para ser enviado como "greeting" + vídeo. O prompt de sistema injetado pediu para ser "breve (2-3 frases)" mas a IA ignorou porque detectou intenção de estoque.

---

## Plano de Correção

### 1. Welcome flow usar `response_parts` em vez de `response_text`

No `deliver-message/index.ts`, alterar o welcome flow para enviar cada parte separada com delays humanizados, idêntico ao fluxo normal:

```
// Antes: sendChatwootTextMessage(msgUrl, token, greetingText)  ← tudo junto
// Depois: iterar response_parts com delay entre cada parte
```

Concretamente:
- Usar `response_parts` (se disponível) em vez de `response_text` para o greeting
- Iterar cada parte com `sendChatwootTextMessage` + delay de 2s entre partes
- Manter a sequência: **partes do greeting → vídeo → pergunta do nome**

### 2. Garantir split correto no fluxo normal também

Verificar que o `replyToChatwoot` do fluxo normal continua funcionando corretamente (já funciona conforme código — o problema era específico do welcome flow).

---

### Mudanças nos arquivos

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/deliver-message/index.ts` | Welcome flow: iterar `response_parts` com delays em vez de enviar `response_text` como bloco único |

### Resultado esperado

Cada bolha do Chat ao Vivo corresponderá a uma bolha separada no WhatsApp, tanto no welcome flow quanto no fluxo normal.

