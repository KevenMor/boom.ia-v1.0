# components

## Propósito
Componentes React do painel admin — primitivos UI (shadcn), layout e componentes de domínio organizados por feature.

## Arquitetura
- Padrão: Feature-based. Subpastas por domínio (`agents/`, `calendar/`, `contacts/`, etc.).
- `ui/` contém primitivos shadcn/ui (Radix + Tailwind) — não modificar diretamente.
- `layout/` contém o shell da aplicação (sidebar, header, tenant switcher).
- Componentes de domínio consomem hooks de `../hooks/` e contexts de `../contexts/`.
- Dependências externas: Radix UI, Tailwind CSS, Lucide icons, shadcn/ui.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| layout/AppLayout.tsx | Shell principal: sidebar + header + Outlet |
| layout/TenantSwitcher.tsx | Dropdown de troca de tenant |
| layout/NotificationsPopover.tsx | Popover de notificações |
| ProtectedRoute.tsx | Guard de autenticação |
| ModuleRoute.tsx | Guard de ACL por módulo |
| NavLink.tsx | Link de navegação com estado ativo |
| ui/*.tsx | 50+ primitivos shadcn/ui |
| agents/EditAgentDialog.tsx | Formulário de edição de agente |
| agents/BusinessHoursSection.tsx | Config de horário comercial |
| agents/FollowUpConfigSection.tsx | Config de follow-up |
| chat/ConversationMessagesView.tsx | Visualizador de mensagens |
| contacts/CreateContactDialog.tsx | Criação de contato |
| sandbox/AudioRecorder.tsx | Gravação de áudio no sandbox |
| dashboard/TokenUsageChart.tsx | Gráfico de uso de tokens |

## Decisões técnicas
- shadcn/ui: componentes copiados (não instalados como pacote) — permite customização total.
- `date-input-br.tsx` e `material-symbol.tsx` são extensões custom do ui/.
- AppLayout usa CSS transition para sidebar collapse — não JS animation.
- Guards (ProtectedRoute, ModuleRoute) são wrappers de rota, não HOCs.

## Convenções
- `ui/` — primitivos genéricos, não alterar sem necessidade.
- `{domínio}/` — componentes específicos de feature.
- Nomes: PascalCase, sufixo descritivo (Dialog, Section, Tab, Card, Chart).
- Props tipadas com interface no mesmo arquivo.
- Sem lógica de negócio — apenas apresentação e interação.

## Fluxos críticos
1. `App.tsx → AppLayout → AppSidebar + AppHeader + <Outlet> (página ativa)`
2. `ProtectedRoute → verifica session → redireciona /login se não autenticado`
3. `ModuleRoute → verifica ACL → renderiza children ou 403`

## Cuidados ao modificar
- `ui/` — atualizar via CLI shadcn (`npx shadcn-ui@latest add component`) quando possível.
- `AppLayout` — alterações afetam TODAS as páginas.
- Guards — testar com diferentes roles e módulos.
- Não importar hooks de dados em `ui/` — manter primitivos puros.
