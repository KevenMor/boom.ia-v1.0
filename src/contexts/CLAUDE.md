# contexts

## Propósito
Estado global: auth, tenant, sidebar e sessão dos **embeds** Chatwoot.

## Hierarquia (painel)
`ThemeProvider` → `AuthProvider` → `TenantProvider` → rotas. Sidebar via `SidebarContext` dentro do layout.

## Arquivos

| Arquivo | Papel |
|---------|--------|
| AuthContext.tsx | sessão, profile, memberships, superadmin, signIn/Out, `canAccessTenant`, `isTenantAdmin` |
| TenantContext.tsx | tenant ativo, lista, `switchTenant` |
| SidebarContext.tsx | open/collapsed |
| EmbedClientsContext.tsx | embed CRM clientes |
| EmbedCrmContext.tsx | embed CRM |
| EmbedHospedagemContext.tsx | embed reservas |
| EmbedInventoryContext.tsx | embed estoque |
| EmbedLoteamentosContext.tsx | embed lotes |

## Decisões
- Auth via `/api/supabase-proxy` (CORS)
- `isSuperAdmin` normaliza `superadmin` / `super_admin` / `SuperAdmin`
- `scopeLoadingInFlight` evita race getSession + onAuthStateChange
- Embeds **não** usam TenantContext do painel — cada um tem token/credencial própria (`embed-credentials.ts`)

## Cuidados
- Ordem dos providers importa
- Nunca `nexusDb.auth` fora do AuthContext no painel
- Não misturar hooks de painel (tenantId) com hooks de embed sem o context certo
