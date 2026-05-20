import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { getApiBase } from "@/lib/api-client";
import type { Profile, TenantMembership } from "@/types/database";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: TenantMembership[];
  loading: boolean;
  isSuperAdmin: boolean;
  canAccessTenant: (tenantId: string | null | undefined) => boolean;
  isTenantAdmin: (tenantId: string | null | undefined) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isSuperAdminRole(role: Profile["role"] | "admin" | string | null | undefined): boolean {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return normalized === "superadmin" || normalized === "super_admin";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [adminApiAccess, setAdminApiAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(true);
  // Controla se o carregamento inicial já foi concluído — evita flash de loading em token refreshes
  const initialLoadDone = useRef(false);
  // Evita dupla chamada de loadScope (getSession + onAuthStateChange disparam juntos)
  const scopeLoadingInFlight = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadScope = async (nextSession: Session | null) => {
      if (scopeLoadingInFlight.current) return;
      scopeLoadingInFlight.current = true;

      // Só mostra spinner na carga inicial; refreshes silenciosos não travam a tela
      if (!initialLoadDone.current) setScopeLoading(true);

      if (!nextSession?.user) {
        if (!mounted) return;
        setProfile(null);
        setMemberships([]);
        setAdminApiAccess(false);
        setScopeLoading(false);
        initialLoadDone.current = true;
        scopeLoadingInFlight.current = false;
        return;
      }

      const userId = nextSession.user.id;
      const [{ data: profileData }, { data: membershipsData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("tenant_memberships")
          .select("id, tenant_id, user_id, role, created_at, updated_at, tenants(name)")
          .eq("user_id", userId),
      ]);

      let hasAdminAccess = false;
      try {
        const res = await fetch(`${getApiBase()}/admin/tenants`, {
          method: "GET",
          headers: nextSession.access_token ? { "x-nexus-auth": `Bearer ${nextSession.access_token}` } : {},
        });
        hasAdminAccess = res.ok;
      } catch {
        hasAdminAccess = false;
      }

      if (!mounted) return;
      setProfile((profileData as Profile | null) ?? null);
      setMemberships((membershipsData as TenantMembership[]) ?? []);
      setAdminApiAccess(hasAdminAccess);
      setScopeLoading(false);
      initialLoadDone.current = true;
      scopeLoadingInFlight.current = false;
    };

    // Listen first, then get session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        // TOKEN_REFRESHED: só atualiza a sessão, não recarrega perfil/memberships (evita flash de loading)
        if (event === "TOKEN_REFRESHED") {
          setLoading(false);
          return;
        }
        void loadScope(session);
        setLoading(false);
      }
    );

    // getSession dispara junto com o INITIAL_SESSION do onAuthStateChange —
    // o flag scopeLoadingInFlight garante que loadScope só roda uma vez
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      void loadScope(session);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (/JSON|Unexpected end of input/i.test(raw)) {
        return {
          error: new Error(
            "O servidor de autenticação devolveu uma resposta inválida ou vazia. Confirme: (1) o backend está rodando na porta 3001 (ex.: npm run dev:all); (2) NEXUS_DB_URL está definido em server/.env; (3) o proxy /api/supabase-proxy responde — veja docker/LOGIN-CORS-SUPABASE.md."
          ),
        };
      }
      return { error: e instanceof Error ? e : new Error(raw) };
    }
  };

  const signOut = async () => {
    localStorage.removeItem("boomia-selected-tenant");
    await supabase.auth.signOut();
  };

  const isSuperAdmin = isSuperAdminRole(
    profile?.role
    ?? (session?.user?.app_metadata as { role?: string } | undefined)?.role
    ?? (session?.user?.user_metadata as { role?: string } | undefined)?.role
  ) || adminApiAccess;
  const canAccessTenant = (tenantId: string | null | undefined): boolean => {
    if (!tenantId) return isSuperAdmin;
    if (isSuperAdmin) return true;
    return memberships.some((membership) => membership.tenant_id === tenantId);
  };
  const isTenantAdmin = (tenantId: string | null | undefined): boolean => {
    if (!tenantId) return isSuperAdmin;
    if (isSuperAdmin) return true;
    return memberships.some(
      (membership) => membership.tenant_id === tenantId && membership.role === "tenant_admin"
    );
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        memberships,
        loading: loading || scopeLoading,
        isSuperAdmin,
        canAccessTenant,
        isTenantAdmin,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
