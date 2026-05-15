# functions (Supabase Edge Functions)

## Propósito
Edge Functions Deno executadas no Supabase — endpoints serverless para operações que não passam pelo backend Fastify.

## Arquitetura
- Runtime: Deno (Supabase Edge Functions).
- Cada função em subpasta própria com `index.ts`.
- Usam `Deno.serve()` + CORS headers manuais.
- Conectam ao banco via `createClient(NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY)`.
- Dependências: @supabase/supabase-js via esm.sh.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| conversation-history/index.ts | Lista/gerencia conversas de um agente via RPC |
| e2e-inspector/index.ts | Endpoint de inspeção para testes E2E |
| new-contact/index.ts | Criação de novo contato |
| public-agent-info/index.ts | Info pública do agente (para demo/sandbox) |
| send-operator-message/index.ts | Envia mensagem como operador humano |

## Decisões técnicas
- Edge Functions para operações que precisam de baixa latência ou acesso direto ao banco sem passar pelo Fastify.
- CORS permissivo (`*`) — funções são chamadas de múltiplas origens.
- Service role key — bypass de RLS (operações administrativas).

## Convenções
- Uma pasta por função com `index.ts`.
- CORS headers em todas as respostas.
- Validação de `agent_id` ou `conversation_id` no body.
- Erros retornados como JSON com status HTTP apropriado.

## Fluxos críticos
1. `Frontend/externo → POST supabase.functions.invoke("conversation-history") → lista conversas`
2. `Operador → send-operator-message → insere mensagem como humano na conversa`

## Cuidados ao modificar
- Deploy separado: `npx supabase functions deploy nome-funcao`.
- Env vars configuradas no dashboard Supabase (não .env local).
- Testar CORS com origens diferentes.
- Não usar imports de Node.js — runtime é Deno.
