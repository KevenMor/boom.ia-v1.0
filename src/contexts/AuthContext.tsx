import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";

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

  const signIn = async (email: string, password: string) => {
    try {
      console.log("[Auth] signIn attempt for:", email);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) console.error("[Auth] signIn error:", error.message);
      return { error: error as Error | null };
    } catch (err) {
      console.error("[Auth] signIn exception:", err);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Auth] signOut error:", err);
    }
  };

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
