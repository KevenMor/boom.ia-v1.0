# lib

## Propósito
Helpers de infraestrutura do server (URLs Storage, fotos, segmentos, HTML, superadmin). Funções puras.

## Arquitetura
- Sem side-effects. Consumido por `tool-executor`, rotas de proxy Storage e inventory.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| supabase-storage-public-url.ts | path público de Storage |
| inventory-photo-url.ts | URLs de foto de estoque |
| vehicle-segments.ts | segmentos de veículo |
| html-entities.ts | decode HTML |
| owner-superadmin.ts | detecção owner/superadmin |

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
