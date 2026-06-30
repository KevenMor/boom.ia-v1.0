import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { EmbedCrmCredentials } from "@/lib/embed-crm-api";

interface EmbedCrmContextValue extends EmbedCrmCredentials {
  isEmbed: true;
}

const EmbedCrmContext = createContext<EmbedCrmContextValue | null>(null);

export function EmbedCrmProvider({
  embedKey,
  accountId,
  children,
}: EmbedCrmCredentials & { children: ReactNode }) {
  const value = useMemo(
    () => ({ embedKey, accountId, isEmbed: true as const }),
    [embedKey, accountId],
  );
  return <EmbedCrmContext.Provider value={value}>{children}</EmbedCrmContext.Provider>;
}

export function useEmbedCrm(): EmbedCrmContextValue | null {
  return useContext(EmbedCrmContext);
}

export function useEmbedCrmRequired(): EmbedCrmContextValue {
  const ctx = useContext(EmbedCrmContext);
  if (!ctx) throw new Error("useEmbedCrmRequired fora de EmbedCrmProvider");
  return ctx;
}
