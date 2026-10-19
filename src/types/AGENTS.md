# types (frontend)

## Contexto rápido
Tipos compartilhados do painel (`calendar.ts`, `database.ts`). Schema Supabase: `src/integrations/supabase/types.ts`.

## Como modificar
1. Tipo de agenda → `calendar.ts`
2. Tipo gerado do banco → **não** editar aqui; regenerar `integrations/supabase/types.ts`
3. Tipo só de um componente → deixar no arquivo do componente

## Regras
- Nunca `any`
- Não duplicar Row types do Supabase
