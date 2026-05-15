# hooks

## Propósito
React Query hooks para data fetching — cada hook encapsula queries/mutations para um recurso específico do sistema.

## Arquitetura
- Padrão: TanStack Query (useQuery/useMutation) com `nexusDb` Supabase client.
- Query keys seguem `[entity, ...filters]` (ex: `["agents", tenantId]`).
- Mutations invalidam cache automaticamente via `queryClient.invalidateQueries()`.
- Dependências internas: `../integrations/supabase/nexus-client.ts`, `../contexts/TenantContext.tsx`.
- Dependências externas: @tanstack/react-query, @supabase/supabase-js.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| useAgents.ts | CRUD de agentes |
| useTenants.ts | CRUD de tenants |
| useProviders.ts | CRUD de providers LLM |
| useTools.ts | CRUD de tools |
| useConversations.ts | Lista/detalhe de conversas |
| useContacts.ts | Gestão de contatos |
| useCalendars.ts | Calendários |
| useCalendarEvents.ts | Eventos de calendário |
| useCalendarServices.ts | Serviços de calendário |
| useInventory.ts | Inventário de veículos |
| useHospedagem.ts | Gestão de hospedagem |
| useSuiteGalleries.ts | Galerias de suítes |
| useFollowUpQueue.ts | Fila de follow-ups |
| useOccurrences.ts | Ocorrências |
| useTokensByAgent.ts | Tokens por agente |
| useTokensByProvider.ts | Tokens por provider |
| useAgentTokenUsage.ts | Uso de tokens detalhado |
| useUsageMetrics.ts | Métricas de uso |
| useAdminUsers.ts | Gestão de usuários |
| useAuditLogs.ts | Logs de auditoria |
| useNotifications.ts | Notificações |
| usePendingReminders.ts | Lembretes pendentes |
| useFirstEnabledRoute.ts | Primeira rota habilitada (redirect) |
| useModuleActions.ts | Permissões de ações por módulo |
| useUserModuleAcl.ts | ACL de módulos por usuário |
| use-toast.ts | Toast notifications (shadcn) |

## Decisões técnicas
- `staleTime: 10min`, `gcTime: 30min` — dados ficam em cache para evitar refetches desnecessários.
- `refetchOnWindowFocus: false` — evita refetch ao alternar abas.
- Hooks filtram por `tenantId` do TenantContext — multi-tenant transparente.

## Convenções
- Nome: `use{Recurso}.ts` (PascalCase do recurso).
- Cada hook exporta funções nomeadas (não default export).
- Queries retornam `{ data, isLoading, error }`.
- Mutations retornam `{ mutate, mutateAsync, isPending }`.

## Fluxos críticos
1. `Página monta → hook useX() → useQuery(key, fetchFn) → Supabase query → dados em cache → render`
2. `Formulário submit → useMutation → Supabase insert/update → invalidateQueries → refetch automático`
3. `TenantSwitcher → tenantId muda → hooks com tenantId na key refazem fetch`

## Cuidados ao modificar
- Alterar query key invalida cache existente — pode causar flash de loading.
- Não fazer fetch sem tenantId (retorna dados de todos os tenants — violação de isolamento).
- Mutations devem sempre invalidar queries relacionadas.
- Não usar `refetchOnMount: true` sem necessidade — degrada performance.
