# contexts

## Propósito
Context providers React que gerenciam estado global da aplicação — autenticação, tenant selecionado e sidebar.

## Arquitetura
- Padrão: React Context + Provider com hooks customizados (`useAuth()`, `useTenant()`, `useSidebar()`).
- Hierarquia em App.tsx: `AuthProvider` → `TenantProvider` → rotas.
- Dependências internas: `../integrations/supabase/nexus-client.ts`, `../lib/api-client.ts`.
- Dependências externas: @supabase/supabase-js, React.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| AuthContext.tsx | Sessão Supabase, profile, memberships, superadmin detection, signIn/signOut, canAccessTenant(), isTenantAdmin() |
| TenantContext.tsx | Tenant selecionado, lista de tenants, switchTenant() |
| SidebarContext.tsx | Estado open/collapsed da sidebar |

## Decisões técnicas
- Auth via proxy (`/api/supabase-proxy`) para evitar CORS com Supabase direto.
- `isSuperAdmin` normaliza variações de role (superadmin, super_admin, SuperAdmin).
- Token refresh silencioso — não mostra spinner em refreshes, apenas na carga inicial.
- `scopeLoadingInFlight` ref evita dupla chamada (getSession + onAuthStateChange disparam juntos).

## Convenções
- Provider wraps children, hook consome context.
- Loading state granular: `loading` (session) + `scopeLoading` (profile/memberships).
- Nunca acessar Supabase Auth diretamente fora do AuthContext.

## Fluxos críticos
1. `App mount → AuthProvider → getSession() + onAuthStateChange → loadScope(session) → profile + memberships → render`
2. `Login → signIn(email, pass) → Supabase Auth → session → loadScope → redirect`
3. `TenantSwitcher → switchTenant(id) → TenantContext update → hooks refetch`

## Cuidados ao modificar
- Alterar AuthContext afeta TODA a aplicação — testar login/logout/refresh.
- Não remover `scopeLoadingInFlight` — causa race condition com duplo fetch.
- TenantContext depende de AuthContext estar resolvido — ordem dos providers importa.
