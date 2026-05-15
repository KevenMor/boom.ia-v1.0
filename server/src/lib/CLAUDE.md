# lib

## Propósito
Utilitário de normalização de URLs do Supabase Storage para acesso público.

## Arquitetura
- Arquivo único que garante que URLs de Storage contenham o segmento `/object/public/` para buckets públicos.
- Consumido por `services/tool-executor.ts` e `routes/` ao retornar URLs de mídia.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| supabase-storage-public-url.ts | ensureSupabaseStoragePublicObjectPath(), normalizeStorageUrlForExternalUse() |

## Decisões técnicas
- Supabase Storage exige `/object/public/{bucket}/` para GET em buckets públicos — URLs sem `public` retornam 404.
- Função idempotente — pode ser chamada múltiplas vezes sem duplicar o segmento.

## Convenções
- Funções puras, sem side-effects.

## Fluxos críticos
1. `tool-executor (enviar_galeria) → normalizeStorageUrlForExternalUse() → URL correta para WhatsApp`

## Cuidados ao modificar
- Testar com URLs de upload (POST) que NÃO devem ter `/public/` inserido.
- Verificar regex para não quebrar URLs de signed/authenticated.
