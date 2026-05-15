# pages

## Propósito
Componentes de página do painel admin — cada arquivo corresponde a uma rota no React Router.

## Arquitetura
- Padrão: Feature-based. Cada página é um componente React que consome hooks e renderiza componentes de domínio.
- Roteamento: `App.tsx` → `ProtectedRoute` (auth) → `ModuleRoute` (ACL) → página.
- Dependências internas: `../hooks/*`, `../components/*`, `../contexts/*`.
- Dependências externas: React Router, TanStack Query (via hooks), shadcn/ui (via components).

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| Login.tsx | Autenticação |
| Dashboard.tsx | Dashboard com métricas e widgets |
| Tenants.tsx / EditTenant.tsx | CRUD de tenants |
| Agents.tsx / EditAgent.tsx | CRUD de agentes |
| AgentSandbox.tsx / PublicSandbox.tsx | Chat de teste (privado/público) |
| Tools.tsx / EditTool.tsx | Configuração de tools |
| Providers.tsx / EditProvider.tsx | Gestão de providers LLM |
| Conversations.tsx | Visualizador de conversas |
| CalendarPage.tsx | Calendário/agendamento |
| InventoryPage.tsx | Inventário de veículos |
| ContactsPage.tsx / ClientsPage.tsx / ContactProfilePage.tsx | CRM/contatos |
| FollowUpsPage.tsx | Fila de follow-ups |
| OccurrencesPage.tsx | Ocorrências |
| ServiceCatalogPage.tsx / CatalogProfessionalsPage.tsx / EditCatalogItemPage.tsx | Catálogo de serviços |
| SuiteGalleriesPage.tsx | Galerias de suítes |
| FinanceiroPage.tsx | Campanhas financeiras |
| TokenAnalytics.tsx | Analytics de tokens |
| Monitoring.tsx | Monitoramento do sistema |
| Audit.tsx | Logs de auditoria |
| PromptsPage.tsx | Visualizador de prompts |
| hospedagem/ParkCalendarManagementPage.tsx | Calendário de hospedagem |
| hospedagem/LodgingRegistryPage.tsx | Registro de unidades |
| hospedagem/LodgingPricingPage.tsx | Precificação |

## Decisões técnicas
- `RootRedirect` usa `useFirstEnabledRoute()` — redireciona para primeira rota que o usuário tem acesso.
- `ModuleRoute` verifica ACL por módulo — páginas não autorizadas retornam 403.
- QueryClient com `staleTime: 10min` — páginas não refazem fetch ao navegar de volta.
- Lazy loading via `Suspense` no AppLayout.

## Convenções
- Nome: `{Recurso}Page.tsx` ou `{Recurso}.tsx` (inconsistência histórica).
- Subpastas para módulos complexos: `hospedagem/`.
- Páginas não contêm lógica de negócio — delegam para hooks e componentes.

## Fluxos críticos
1. `URL → React Router → ProtectedRoute (auth?) → ModuleRoute (ACL?) → Page → hooks (data) → render`
2. `Dashboard → múltiplos hooks em paralelo → widgets renderizam métricas`
3. `EditAgent → useAgents().update mutation → invalidate → redirect`

## Cuidados ao modificar
- Adicionar página exige: criar componente + adicionar rota em `App.tsx` + configurar módulo no ACL.
- Não colocar lógica de negócio nas páginas — usar hooks.
- Testar com diferentes roles (superadmin vs tenant admin vs user).
- Páginas de hospedagem são subpasta — manter padrão para novos módulos complexos.
