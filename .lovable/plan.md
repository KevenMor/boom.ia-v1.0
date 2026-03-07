

# Plano Definitivo: LLM como Decisor de Fotos (Eliminar Regex Gatekeeping)

## Diagnóstico

Existem **~200 linhas de regex** espalhadas em 3 camadas que decidem se fotos são enviadas — após o Dispatcher já ter decidido chamar `consultar_estoque`. Isso é fundamentalmente errado: o LLM tem contexto conversacional completo, o regex não.

### Código a eliminar

| Camada | Localização | Linhas aprox. | O que faz |
|--------|-------------|---------------|-----------|
| **Funções helper** | `isContextualPhotoAcceptance()` | 88-115 | Regex de aceitação contextual |
| **Funções helper** | `isVehicleSelectionForPhotos()` | 120-152 | Regex de seleção de veículo |
| **Inventory handler** | `isPhotoRequest` + `includePhotosInData` | 766-789 | Regex decide se fotos entram no payload |
| **Post-processing** | `userExplicitlyAskedPhotos` | 3209-3225 | Regex re-injeta fotos após LLM |
| **Recovery fallback** | `explicitPhotoRequest` + fallback | 3226-3299 | Regex recupera fotos quando Dispatcher falhou |

---

## Solução em 4 Mudanças

### Mudança 1 — Inventory Handler: Sempre incluir fotos (com limite)

**Arquivo:** `supabase/functions/chat-agent/index.ts` (~linhas 766-860)

- Eliminar `isPhotoRequest`, `isGenericAcceptance`, `isSpecificWithPhotos`, `includePhotosInData`
- Sempre retornar fotos no payload do veículo, **limitadas a 8 URLs por veículo**
- Manter a lógica de disambiguação: se >3 veículos, retornar dados compactos (sem fotos) para não estourar tokens. Se ≤3 veículos, incluir fotos
- O `_hint` continua orientando o LLM Fase 2, mas sem depender de regex para decidir

**Nova lógica simplificada:**
```
Se data.length > 3 → modo listagem (sem fotos, hint "apresente e pergunte qual quer ver")
Se data.length ≤ 3 → modo detalhado (COM fotos, hint "apresente com fotos se o contexto pedir")
```

### Mudança 2 — Enriquecer hints para o LLM Fase 2

O `_hint` que vai junto com o resultado da tool passa a instruir o LLM sobre quando incluir fotos:

- **≤3 veículos:** "Fotos estão disponíveis no campo 'photos'. Inclua-as com `![](url)` se o cliente pediu para ver, aceitou ver, ou selecionou um veículo. NÃO inclua fotos se o cliente apenas perguntou preço/disponibilidade."
- **>3 veículos:** "NÃO inclua fotos. Apresente os veículos e pergunte qual quer ver primeiro."

### Mudança 3 — Eliminar post-processing regex

**Arquivo:** `supabase/functions/chat-agent/index.ts` (~linhas 3209-3299)

- Remover o bloco `userExplicitlyAskedPhotos` que re-injeta fotos
- Remover o bloco `explicitPhotoRequest` + photo recovery fallback
- Se o LLM Fase 2 incluiu `![](url)` na resposta, as fotos passam naturalmente pelo `deliver-message`
- Se não incluiu, respeitar a decisão do LLM

### Mudança 4 — Atualizar prompt do Dispatcher

**Arquivo:** `supabase/functions/_shared/prompts/ppl-motors.ts`

Adicionar regra explícita:
```
Quando o cliente demonstrar interesse em ver/conhecer um veículo específico — 
incluindo respostas curtas como "Pode ser a Q5", "Quero", "Sim", "O primeiro", 
"Esse aí" — SEMPRE chame consultar_estoque com marca/modelo do contexto.
```

Isso resolve o Layer 1 (Dispatcher não chamando a tool) sem regex.

---

## O que NÃO muda

- `sendChatwootImagesBatch` no deliver-message — intocado
- `extractImagesFromMarkdown` no deliver-message — intocado
- `consolidateImageParts` no deliver-message — intocado
- Welcome flow — intocado
- Lógica de humanização — intocada
- Sanitização de output (JSON artifacts) — intocada
- Lógica de disambiguação (>3 veículos → perguntar qual) — mantida, mas via contagem, não regex

## Código eliminado

- `isContextualPhotoAcceptance()` — ~30 linhas
- `isVehicleSelectionForPhotos()` — ~35 linhas
- Bloco regex no inventory handler — ~25 linhas
- Bloco post-processing photo injection — ~20 linhas
- Bloco photo recovery fallback — ~70 linhas
- **Total: ~180 linhas de regex eliminadas**

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| LLM não inclui fotos quando deveria | Hint explícito no payload da tool + monitoramento |
| LLM inclui fotos quando não deveria | Baixo risco — Dispatcher já filtrou intent |
| Token overflow com muitas fotos | Limite de 8 URLs por veículo no payload |
| Dispatcher não chama tool para aceitações curtas | Regra explícita no prompt do Dispatcher (Mudança 4) |

## Arquivos modificados

1. **`supabase/functions/chat-agent/index.ts`** — Remover 3 funções helper + simplificar inventory handler + eliminar post-processing regex
2. **`supabase/functions/_shared/prompts/ppl-motors.ts`** — Regra de aceitação contextual no Dispatcher

