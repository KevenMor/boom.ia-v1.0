## ✅ COMPLETED: LLM como Decisor de Fotos (v3.0.0)

### O que foi feito

Eliminadas ~180 linhas de regex gatekeeping de fotos. Agora o LLM Phase 2 decide se inclui fotos na resposta baseado no contexto da conversa.

### Mudanças implementadas

1. **Removidas funções helper**: `isContextualPhotoAcceptance()`, `isVehicleSelectionForPhotos()` — eliminadas
2. **Inventory Handler simplificado**: Sempre inclui fotos para ≤3 veículos (max 8 por veículo). O `_hint` orienta o LLM sobre quando renderizar
3. **Post-processing eliminado**: Removidos `userExplicitlyAskedPhotos`, `explicitPhotoRequest`, e todo o bloco de photo recovery fallback (~100 linhas)
4. **shouldSkip simplificado**: Removido override `contextualPhotoAccept` — o Dispatcher decide via prompt
5. **Dispatcher prompt atualizado**: Adicionados exemplos de Vehicle Selection (Rule 13) e seção de Decision Examples com "Pode ser a Q5", "A Q5", "O primeiro", etc.

### Arquivos modificados
- `supabase/functions/chat-agent/index.ts` — ~180 linhas removidas
- `supabase/functions/_shared/prompts/ppl-motors.ts` — Rule 13 expandida + exemplos de decisão
