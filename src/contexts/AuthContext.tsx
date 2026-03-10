import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { getApiBase } from "@/lib/api-client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
        console.log("[Auth] state change:", _event, !!sess);
        setSession(sess);
        setLoading(false);
      });
      subscription = data.subscription;
    } catch (err) {
      console.error("[Auth] onAuthStateChange failed:", err);
      setLoading(false);
    }

    supabase.auth.getSession()
      .then(({ data: { session: sess } }) => {
        console.log("[Auth] getSession result:", !!sess);
        setSession(sess);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[Auth] getSession failed:", err);
        setLoading(false);
      });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: Error | null }> => {
    console.log("[Auth] signIn attempt for:", email);

    // Strategy 1: Call server-side /api/auth/login (bypasses browser CORS on supabase proxy)
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token && data.refresh_token) {
          // Set session in the supabase client using the tokens from server
          const { error: setErr } = await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
          if (!setErr) {
            console.log("[Auth] signIn success via server endpoint");
            return { error: null };
          }
          console.warn("[Auth] setSession failed, trying direct:", setErr.message);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn("[Auth] server login failed:", res.status, errData.error);
        // If it's an auth error (wrong password), return immediately
        if (res.status === 401) {
          return { error: new Error(errData.error || "Credenciais inválidas") };
        }
      }
    } catch (err) {
      console.warn("[Auth] server endpoint unreachable, trying direct:", err);
    }

    // Strategy 2: Fallback to direct supabase client (works in preview/localhost)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("[Auth] direct signIn error:", error.message);
        return { error: error as Error };
      }
      console.log("[Auth] signIn success via direct supabase");
      return { error: null };
    } catch (err) {
      console.error("[Auth] signIn exception:", err);
      return { error: err as Error };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Auth] signOut error:", err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
