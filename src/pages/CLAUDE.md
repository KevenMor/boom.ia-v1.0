# pages

## Propósito
Uma página = uma rota em `src/App.tsx`. Consome hooks e componentes; sem fetch direto.

## Design system
Ver `docs/DESIGN-SYSTEM.md`. Padrão: shadcn + `space-y-6`. TypeUI em `Dashboard.tsx` e `KanbanPage.tsx`. Chatwoot wrapper nas páginas `ChatwootEmbed*` e `ContactProfilePage`.

## Arquitetura
`URL → ProtectedRoute → ModuleRoute → Page → hooks → render`. `RootRedirect` usa `useFirstEnabledRoute()`. QueryClient `staleTime` 10 min. ACL em `src/lib/tenant-modules.ts`.

## Inventário de páginas

### Públicas
| Arquivo | Path |
|---------|------|
| Login.tsx | `/login` |
| PublicSandbox.tsx | `/demo/:agentId` |
| ChatwootEmbedMirror.tsx | `/embed/chatwoot` |
| ChatwootEmbedClient.tsx | `/embed/chatwoot/client` |
| ChatwootEmbedClients.tsx | `/embed/chatwoot/clients/*` |
| ChatwootEmbedHospedagem.tsx | `/embed/chatwoot/hospedagem/*` |
| ChatwootEmbedInventory.tsx | `/embed/chatwoot/inventory` |
| ChatwootEmbedLoteamentos.tsx | `/embed/chatwoot/loteamentos/*` |
| EmbedChatwoot*ViewRedirect.tsx | `/embed/chatwoot/.../view` (5 redirects Mega) |

### Painel (ProtectedRoute + AppLayout)
| Arquivo | Path | Módulo |
|---------|------|--------|
| Dashboard.tsx | `/dashboard` (v2 → redirect) | dashboard |
| Agents.tsx / EditAgent.tsx | `/agents` `/agents/:id/edit` | agents |
| AgentSandbox.tsx | `/agents/:id/sandbox` | agents |
| Conversations.tsx | `/conversations` | conversations |
| KanbanPage.tsx | `/kanban` | conversations |
| CalendarPage.tsx | `/calendar` | calendar |
| FollowUpsPage.tsx | `/followups` | followups |
| InventoryPage.tsx | `/inventory` | inventory |
| OccurrencesPage.tsx | `/occurrences` | occurrences |
| SuiteGalleriesPage.tsx | `/galeria` | suite_galleries |
| ServiceCatalogPage.tsx / CatalogProfessionalsPage.tsx / EditCatalogItemPage.tsx | `/catalog` … | service_catalog |
| ContactsPage.tsx / ClientsPage.tsx / ContactProfilePage.tsx | `/contacts` `/clients` | contacts / clients |
| hospedagem/* | `/hospedagem/calendario-parque` `/cadastro` `/valores` | hospedagem |
| loteamentos/* | `/loteamentos/empreendimentos` `/:id` | loteamentos |
| FinanceiroPage.tsx / ContractTemplatesPage.tsx | `/financeiro` `/financeiro/modelos-contrato` | financeiro |
| Tools.tsx / EditTool.tsx | `/tools` | tools |
| Providers.tsx / EditProvider.tsx | `/providers` | providers |
| TokenAnalytics.tsx | `/analytics/tokens` | analytics_tokens |
| Monitoring.tsx | `/monitoring` | monitoring |
| Audit.tsx | `/audit` | audit |
| SettingsPage.tsx | `/settings` | settings |
| PromptsPage.tsx | `/prompts` | prompts |
| ProfilePage.tsx | `/profile` | (sem ModuleRoute) |
| Tenants.tsx / EditTenant.tsx | `/tenants` | tenants (superadmin) |
| UsersManagementPage.tsx | `/users` | tenants |
| TenantPermissionsPage.tsx | `/permissions` | tenants |
| NotFound.tsx | `*` | — |

**Órfã (sem rota):** `TenantPaymentsPage.tsx`.

**Hospedagem:** `ParkCalendarManagementPage`, `LodgingRegistryPage`, `LodgingPricingPage`. **Loteamentos:** `DevelopmentsListPage`, `DevelopmentMapPage`.

## Convenções
- Nome histórico misto: `{Recurso}Page.tsx` ou `{Recurso}.tsx`. Subpasta só para módulos complexos.
- Nova página: componente + `App.tsx` + sidebar + módulo ACL.
- Roles: superadmin vs tenant admin vs user.

## Cuidados
- Embeds ficam **fora** do AppLayout.
- Não hardcodar tenantId — TenantContext / embed context.
