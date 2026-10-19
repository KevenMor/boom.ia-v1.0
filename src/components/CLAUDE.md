# components

## Propósito
Primitivos shadcn (`ui/`), shell (`layout/`) e componentes de domínio por feature. Sem lógica de negócio; dados via hooks.

## Design system
`docs/DESIGN-SYSTEM.md`. `ui/` = shadcn (não editar se o CLI cobre). Custom em `ui/`: `date-input-br.tsx`, `theme-toggle.tsx`, `material-symbol.tsx` (legado). `ui/sidebar.tsx` **não** é o shell — usar `layout/AppSidebar.tsx`.

## Árvore

| Pasta | Papel | DS |
|-------|-------|-----|
| `ui/` | ~51 primitivos Radix + Tailwind | shadcn |
| `layout/` | AppLayout, AppSidebar, AppHeader, TenantSwitcher, NotificationsPopover, LoadingScreen | sidebar tokens |
| `dashboard/` + `v2/` | KPIs, charts, SectionHeader, OpsKpiStrip, QuickActionsRow | TypeUI no painel; `.box` legado |
| `agents/` | CRUD, horários, follow-up, KB, Chatwoot | shadcn |
| `contacts/` | Perfil, docs, contratos, pacotes, import | perfil: wrapper Chatwoot |
| `kanban/` | Board, coluna, card | TypeUI na página |
| `loteamentos/` | Mapa, tabela, legend, dialogs, embed header | shadcn / embed híbrido |
| `hospedagem/` | SubNav + header embed | idem |
| `embed/` | AgentMirror, ContactProfileEmbed, editor | Chatwoot |
| `inventory/` `occurrences/` `providers/` `tools/` `tenants/` `suite-galleries/` `sandbox/` `calendar/` `chat/` `brand/` | domínio | shadcn |
| raiz | ProtectedRoute, ModuleRoute, NavLink | — |

## Arquivos-chave
| Arquivo | Papel |
|---------|--------|
| layout/AppLayout.tsx | sidebar + header + Outlet; modos default vs imersivo |
| layout/AppSidebar.tsx | nav ACL por `moduleKey` |
| layout/AppHeader.tsx | títulos por rota + ThemeToggle |
| ProtectedRoute.tsx / ModuleRoute.tsx | auth / ACL |

## Convenções
- `{domínio}/NomeDescritivo.tsx` (Dialog, Section, Tab, Card, Chart)
- Props com interface no arquivo
- `cn()`; dark mode; Lucide
- Não importar hooks de dados em `ui/`

## Fluxos
1. `App.tsx → AppLayout → Sidebar + Header + Outlet`
2. `ProtectedRoute → /login` se sem sessão
3. `ModuleRoute → 403` se módulo off

## Cuidados
- Mudança em AppLayout afeta todas as páginas autenticadas
- Dashboard legado (`PremiumKpiStrip`, `visual="cw"`) não é o painel atual — não copiar
