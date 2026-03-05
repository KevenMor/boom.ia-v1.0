# Prompt para Cursor: Agrupar todas as fotos em um único batch POST

## Contexto do Projeto

Este é um pipeline de entrega de mensagens para WhatsApp via Chatwoot. O fluxo é:

1. `chat-agent` (Edge Function) → gera resposta com texto + fotos em markdown
2. `process-queue` → orquestra e chama `deliver-message`
3. `deliver-message` → entrega mensagens ao Chatwoot, que repassa ao WhatsApp

O arquivo principal a modificar é: `supabase/functions/deliver-message/index.ts`

---

## Problema Atual

Quando o agente envia fotos de um veículo, o Gemini (LLM conversacional) gera a resposta fragmentada em múltiplas "parts" (ex: 7 parts). Cada part contendo imagens gera um POST separado ao Chatwoot com no máximo 3 fotos por batch.

**Resultado atual** (logs reais):
```
Part 1: texto introdutório → 1 POST texto
Part 2: 3 fotos → 1 POST batch (3 attachments)
Part 3: 3 fotos → 1 POST batch (3 attachments)
Part 4: 3 fotos → 1 POST batch (3 attachments)
Part 5: 3 fotos → 1 POST batch (3 attachments)
Part 6: 3 fotos → 1 POST batch (3 attachments)
Part 7: texto de fechamento → 1 POST texto
Total: 7 POSTs, 15 fotos em 5 batches separados
```

**Problema**: No WhatsApp, o cliente recebe 5 mensagens separadas de fotos com delays entre elas (~2s cada), totalizando ~10-12 segundos só para as fotos. Isso quebra a experiência.

---

## Solução Desejada

Antes de iterar sobre as `parts` e enviar cada uma individualmente, fazer um **pré-processamento** que:

1. **Consolida todas as imagens** de parts consecutivas de imagem em um único array
2. **Preserva textos** (introdução e fechamento) como parts separadas
3. **Envia todas as fotos em um único POST** (ou poucos batches se houver limite)

**Resultado esperado**:
```
POST 1: texto introdutório
POST 2: 15 fotos em um ÚNICO batch (ou 2 batches de 10+5 se houver limite)
POST 3: texto de fechamento
Total: 3 POSTs, experiência fluida
```

---

## Arquitetura do Código Atual

### Função `replyToChatwoot` (linha ~208-296)

Esta é a função principal de entrega. Ela:
- Recebe `messageParts: string[]` (array de parts geradas pelo LLM)
- Itera sobre cada part
- Para cada part: extrai imagens do markdown via `extractImagesFromMarkdown()`
- Se tem imagens → chama `sendChatwootImagesBatch()` com as imagens daquela part
- Se é texto puro → chama `sendChatwootTextMessage()`
- Aplica delays de humanização entre parts

### Função `sendChatwootImagesBatch` (linha ~95-163)

Já existe e funciona corretamente:
- Recebe array de URLs de imagem
- Faz download paralelo de todas
- Envia em um único POST com múltiplos `attachments[]`
- Tem fallback para envio individual por texto se download falhar

### Função `extractImagesFromMarkdown` (linha ~51-60)

Extrai URLs de imagem do formato markdown `![alt](url)` e retorna `{ textOnly, imageUrls }`.

---

## Implementação Proposta

### Passo 1: Criar função de pré-processamento

Adicionar uma nova função `consolidateImageParts` que recebe o array de parts e retorna um novo array consolidado:

```typescript
interface ConsolidatedPart {
  type: 'text' | 'images';
  content?: string;      // para type='text'
  imageUrls?: string[];   // para type='images'
}

function consolidateImageParts(parts: string[]): ConsolidatedPart[] {
  const result: ConsolidatedPart[] = [];
  let pendingImages: string[] = [];

  for (const part of parts) {
    if (!part?.trim()) continue;
    
    const { textOnly, imageUrls } = extractImagesFromMarkdown(part);
    
    if (imageUrls.length > 0) {
      // Acumula imagens
      pendingImages.push(...imageUrls);
      
      // Se tem texto significativo (>60 chars), adiciona como part separada ANTES das imagens
      if (textOnly.trim() && textOnly.trim().length > 60) {
        // Flush imagens acumuladas anteriormente se houver
        if (pendingImages.length > imageUrls.length) {
          const previousImages = pendingImages.slice(0, -imageUrls.length);
          result.push({ type: 'images', imageUrls: previousImages });
          pendingImages = [...imageUrls];
        }
        result.push({ type: 'text', content: textOnly.trim() });
      }
    } else if (textOnly.trim()) {
      // Part de texto puro — flush imagens acumuladas primeiro
      if (pendingImages.length > 0) {
        result.push({ type: 'images', imageUrls: [...pendingImages] });
        pendingImages = [];
      }
      result.push({ type: 'text', content: textOnly.trim() });
    }
  }

  // Flush imagens restantes
  if (pendingImages.length > 0) {
    result.push({ type: 'images', imageUrls: pendingImages });
  }

  return result;
}
```

### Passo 2: Modificar `replyToChatwoot`

Substituir a lógica de iteração atual (linhas ~242-295) para usar `consolidateImageParts`:

```typescript
// ANTES: iterava part por part
// DEPOIS: consolida imagens e itera sobre parts consolidadas

const consolidated = consolidateImageParts(parts);
console.log(`[Deliver] Consolidated ${parts.length} parts → ${consolidated.length} blocks (${consolidated.filter(c => c.type === 'images').reduce((sum, c) => sum + (c.imageUrls?.length || 0), 0)} total images)`);

for (let i = 0; i < consolidated.length; i++) {
  const block = consolidated[i];

  if (block.type === 'images' && block.imageUrls?.length) {
    // Enviar todas as imagens em um único batch
    const ok = await sendChatwootImagesBatch(msgUrl, apiToken, block.imageUrls, "");
    console.log(`[Deliver] Block ${i + 1} batch ${block.imageUrls.length} image(s): ${ok ? "OK" : "FAIL"}`);
  } else if (block.type === 'text' && block.content) {
    // Typing indicator + envio de texto
    if (humanization.typingDelayMs > 0 && hasTimeBudget()) {
      await setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "on");
      const typingDelay = applyJitter(humanization.typingDelayMs);
      console.log(`[Deliver] Typing delay (block ${i + 1}): ${typingDelay}ms`);
      await safeDelay(typingDelay);
    }
    const ok = await sendChatwootTextMessage(msgUrl, apiToken, block.content);
    console.log(`[Deliver] Block ${i + 1} text: ${ok ? "OK" : "FAIL"}`);
    if (humanization.typingDelayMs > 0) {
      setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "off").catch(() => {});
    }
  }

  // Inter-block delay
  const isLast = i === consolidated.length - 1;
  if (!isLast && hasTimeBudget()) {
    const gapMs = humanization.blockGapMs > 0 ? applyJitter(humanization.blockGapMs) : 2000;
    console.log(`[Deliver] Inter-block delay (after block ${i + 1}): ${gapMs}ms`);
    await safeDelay(gapMs);
  }
}
```

### Passo 3: Limite de segurança

Adicionar um `MAX_IMAGES_PER_BATCH` caso o Chatwoot/WhatsApp Business API tenha limites:

```typescript
const MAX_IMAGES_PER_BATCH = 20; // Ajustar conforme teste

// Na hora de enviar, dividir se necessário:
if (block.imageUrls.length > MAX_IMAGES_PER_BATCH) {
  for (let j = 0; j < block.imageUrls.length; j += MAX_IMAGES_PER_BATCH) {
    const chunk = block.imageUrls.slice(j, j + MAX_IMAGES_PER_BATCH);
    const ok = await sendChatwootImagesBatch(msgUrl, apiToken, chunk, "");
    console.log(`[Deliver] Block ${i + 1} chunk ${Math.floor(j/MAX_IMAGES_PER_BATCH) + 1}: ${chunk.length} image(s) ${ok ? "OK" : "FAIL"}`);
    if (j + MAX_IMAGES_PER_BATCH < block.imageUrls.length) {
      await safeDelay(1000); // pequeno delay entre chunks
    }
  }
}
```

---

## Restrições

1. **NÃO modificar** `sendChatwootImagesBatch` — já funciona perfeitamente
2. **NÃO modificar** `extractImagesFromMarkdown` — já funciona perfeitamente  
3. **NÃO modificar** o welcome flow (linhas 361-436) — fluxo separado
4. **Manter** toda a lógica de humanização (typing indicators, delays, jitter)
5. **Manter** o MAX_BUDGET_MS de 28s e a função `hasTimeBudget()`
6. **Manter** logging detalhado com prefixo `[Deliver]`
7. O arquivo é uma Edge Function Deno (TypeScript) — imports são via `https://esm.sh/`

---

## Teste de Validação

Após implementar, os logs devem mostrar:
```
[Deliver] Consolidated 7 parts → 3 blocks (15 total images)
[Deliver] Block 1 text: OK
[Deliver] Inter-block delay (after block 1): 1842ms
[Deliver] Sending 15 image(s) in single batch POST
[Deliver] Block 2 batch 15 image(s): OK
[Deliver] Inter-block delay (after block 2): 2100ms
[Deliver] Block 3 text: OK
```

Em vez do atual:
```
[Deliver] Part 1 text: OK
[Deliver] Part 2 batch 3 image(s): OK
[Deliver] Part 3 batch 3 image(s): OK
[Deliver] Part 4 batch 3 image(s): OK
[Deliver] Part 5 batch 3 image(s): OK
[Deliver] Part 6 batch 3 image(s): OK
[Deliver] Part 7 text: OK
```

---

## Arquivos

- **Modificar**: `supabase/functions/deliver-message/index.ts`
- **Não tocar**: todos os outros arquivos
