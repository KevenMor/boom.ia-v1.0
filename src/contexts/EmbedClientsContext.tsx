import { createContext, useContext, type ReactNode } from "react";
import type { EmbedClientsCredentials } from "@/lib/embed-clients-api";

export type EmbedClientsContextValue = EmbedClientsCredentials & {
  ready: boolean;
  tenantId: string;
  tenantName: string;
  basePath: string;
};

const EmbedClientsContext = createContext<EmbedClientsContextValue | null>(null);

export function EmbedClientsProvider({
  value,
  children,
}: {
  value: EmbedClientsContextValue;
  children: ReactNode;
}) {
  return <EmbedClientsContext.Provider value={value}>{children}</EmbedClientsContext.Provider>;
}

export function useEmbedClientsOptional(): EmbedClientsContextValue | null {
  return useContext(EmbedClientsContext);
}

export function useEmbedClients(): EmbedClientsContextValue {
  const ctx = useContext(EmbedClientsContext);
  if (!ctx) throw new Error("useEmbedClients fora do EmbedClientsProvider");
  return ctx;
}
