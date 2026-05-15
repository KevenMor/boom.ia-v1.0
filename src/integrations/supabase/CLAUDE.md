# supabase (integrations)

## Propósito
Configuração do cliente Supabase para o frontend — conexão via proxy para evitar CORS.

## Arquitetura
- `nexus-client.ts` é o cliente principal usado em toda a app. Conecta via `/api/supabase-proxy/*` (proxy no backend Fastify).
- `client.ts` — cliente alternativo (uso legado/específico).
- `types.ts` — tipos auto-gerados do banco Supabase.
- Dependências externas: @supabase/supabase-js.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| nexus-client.ts | Cliente principal — resolve proxy URL (dev vs prod), cria Supabase client |
| client.ts | Cliente alternativo (legado) |
| types.ts | Tipos TypeScript auto-gerados do schema Supabase |

## Decisões técnicas
- Proxy obrigatório: Supabase direto causa CORS em produção. Backend faz proxy transparente.
- `isTrulyLocalHost()` — distingue dev real de build que embute localhost no VITE_API_URL.
- Em produção, usa `window.location.origin` como base — evita mismatch de URLs entre upload e leitura.
- `resolveNexusProxyBase()` tem fallback chain: VITE_SUPABASE_PROXY_URL → VITE_API_URL → window.location.origin.

## Convenções
- Importar sempre `nexusDb` de `nexus-client.ts` (não `client.ts`).
- Tipos do banco em `types.ts` — regenerar com `supabase gen types`.

## Fluxos críticos
1. `Hook → nexusDb.from("table").select() → /api/supabase-proxy/rest/v1/table → Supabase Postgres`
2. `Auth → nexusDb.auth.signInWithPassword() → /api/supabase-proxy/auth/v1/token → Supabase Auth`
3. `Upload → nexusDb.storage.from("bucket").upload() → /api/supabase-proxy/storage/v1/object/bucket/path`

## Cuidados ao modificar
- Alterar resolução de URL afeta TODA a app (auth, data, storage).
- Testar em dev (localhost) E produção (domínio real).
- Não remover lógica de `isTrulyLocalHost()` — quebra builds Docker com VITE_API_URL localhost.
- `types.ts` é auto-gerado — não editar manualmente.
