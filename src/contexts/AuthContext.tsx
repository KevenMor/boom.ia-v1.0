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

const OWNER_SUPERADMIN_EMAILS = new Set(
  ["contato@agboom.com.br", ...(import.meta.env.VITE_SUPERADMIN_EMAILS || "").split(",")]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OWNER_SUPERADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [scopeIsSuperAdmin, setScopeIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const scopeLoadingInFlight = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadScope = async (nextSession: Session | null) => {
      if (scopeLoadingInFlight.current) return;
      scopeLoadingInFlight.current = true;

      if (!initialLoadDone.current) setScopeLoading(true);

      if (!nextSession?.user) {
        if (!mounted) return;
        setProfile(null);
        setMemberships([]);
        setScopeIsSuperAdmin(false);
        setScopeLoading(false);
        initialLoadDone.current = true;
        scopeLoadingInFlight.current = false;
        return;
      }

      try {
        const res = await fetch(`${getApiBase()}/me/scope`, {
          method: "GET",
          headers: nextSession.access_token
            ? { "x-nexus-auth": `Bearer ${nextSession.access_token}` }
            : {},
        });

        if (res.ok) {
          const body = (await res.json()) as {
            profile: Profile | null;
            memberships: TenantMembership[];
            isSuperAdmin?: boolean;
          };
          if (!mounted) return;
          setProfile(body.profile ?? null);
          setMemberships(body.memberships ?? []);
          setScopeIsSuperAdmin(Boolean(body.isSuperAdmin) || isOwnerEmail(nextSession.user.email));
        } else if (res.status === 503 || res.status === 504) {
          // Pool saturado — dono ainda entra como superadmin; demais aguardam retry
          if (!mounted) return;
          const owner = isOwnerEmail(nextSession.user.email);
          setProfile(
            owner
              ? ({
                  id: nextSession.user.id,
                  full_name: null,
                  role: "superadmin",
                  avatar_url: null,
                  created_at: "",
                  updated_at: "",
                } as Profile)
              : null
          );
          setMemberships([]);
          setScopeIsSuperAdmin(owner);
          setScopeLoading(false);
          initialLoadDone.current = true;
          scopeLoadingInFlight.current = false;
          setTimeout(() => {
            if (!mounted) return;
            scopeLoadingInFlight.current = false;
            void loadScope(nextSession);
          }, 15_000);
          return;
        } else {
          const userId = nextSession.user.id;
          const [{ data: profileData }, { data: membershipsData }] = await Promise.all([
            supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
            supabase
              .from("tenant_memberships")
              .select("id, tenant_id, user_id, role, created_at, updated_at, tenants(name)")
              .eq("user_id", userId),
          ]);
          if (!mounted) return;
          setProfile((profileData as Profile | null) ?? null);
          setMemberships((membershipsData as TenantMembership[]) ?? []);
          setScopeIsSuperAdmin(false);
        }
      } catch {
        if (!mounted) return;
        setProfile(null);
        setMemberships([]);
        setScopeIsSuperAdmin(false);
      }

      if (!mounted) return;
      setScopeLoading(false);
      initialLoadDone.current = true;
      scopeLoadingInFlight.current = false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (event === "TOKEN_REFRESHED") {
          setLoading(false);
          return;
        }
        void loadScope(session);
        setLoading(false);
      }
    );

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
      if (!error) {
        try {
          localStorage.removeItem("boomia-selected-tenant");
        } catch {
          /* ignore */
        }
      }
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
    try {
      localStorage.removeItem("boomia-selected-tenant");
    } catch {
      /* ignore */
    }
    // Limpa UI na hora — não fica preso se o Auth/proxy demorar
    setSession(null);
    setProfile(null);
    setMemberships([]);
    setScopeIsSuperAdmin(false);
    setScopeLoading(false);
    setLoading(false);
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch {
      /* ignore — sessão local já limpa */
    }
  };

  const isSuperAdmin = isSuperAdminRole(
    profile?.role
    ?? (session?.user?.app_metadata as { role?: string } | undefined)?.role
    ?? (session?.user?.user_metadata as { role?: string } | undefined)?.role
  ) || scopeIsSuperAdmin || isOwnerEmail(session?.user?.email);
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
