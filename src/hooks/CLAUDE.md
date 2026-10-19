# hooks

## Propósito
TanStack Query: um hook por recurso. Query key `[entity, tenantId, ...filtros]`. Mutations invalidam cache.

## Arquitetura
`nexusDb` (`../integrations/supabase/nexus-client.ts`) + `tenantId` do TenantContext. Endpoints custom: `../lib/api-client.ts`. `staleTime` 10 min, `gcTime` 30 min, `refetchOnWindowFocus: false`.

## Inventário

| Hook | Domínio |
|------|---------|
| useAgents / useTenants / useProviders / useTools | CRUD core |
| useConversations / useConversationGrowth | Chat ao vivo |
| useContacts | Leads / clientes |
| useCalendars / useCalendarEvents / useCalendarServices | Agenda |
| useInventory | Estoque |
| useHospedagem / useHospedagemTenantScope | Reservas |
| useLoteamentos / useLoteamentosTenantScope | Lotes |
| useSuiteGalleries | Galerias |
| useFollowUpQueue | Follow-ups |
| useOccurrences | Ocorrências |
| useServiceCatalog | Catálogo |
| useTokensByAgent / useTokensByProvider / useAgentTokenUsage / useUsageMetrics | Analytics |
| useAdminUsers / useTenantMembers / useUserModuleAcl / useModuleActions | ACL / users |
| useAuditLogs / useNotifications / usePendingReminders / useAppointmentRemindersList | Ops |
| useAsaasConfig / useTenantIntegration / useMcpKeys | Integrações |
| useFirstEnabledRoute | Redirect inicial |
| use-toast / use-mobile | UI |

## Convenções
- `use{Recurso}.ts`, named exports
- `enabled: !!tenantId` (isolamento)
- Sempre invalidar queries relacionadas no `onSuccess`

## Cuidados
- Sem tenantId = vazamento cross-tenant
- Embeds usam contexts `Embed*` — não misturar com TenantContext do painel sem checar o hook
