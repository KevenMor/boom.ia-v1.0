# types (frontend)

## Propósito
Tipos TypeScript do painel que não vivem em `integrations/supabase/types.ts`.

## Arquivos
| Arquivo | Papel |
|---------|--------|
| calendar.ts | eventos/serviços de agenda no frontend |
| database.ts | tipos auxiliares de DB (não substituem `integrations/supabase/types.ts`) |

## Convenções
- Schema gerado do Supabase fica em `src/integrations/supabase/types.ts` — não duplicar aqui.
- Tipos de domínio pontuais podem ficar no próprio módulo; esta pasta é só o compartilhado.

## Cuidados
- Regenerar tipos Supabase com `npx supabase gen types typescript` no arquivo de integrations, não aqui.
