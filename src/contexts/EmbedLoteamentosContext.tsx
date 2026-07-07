import { createContext, useContext, type ReactNode } from "react";
import type { EmbedLoteamentosCredentials } from "@/lib/embed-loteamentos-api";

export type EmbedLoteamentosContextValue = EmbedLoteamentosCredentials & {
  ready: boolean;
  tenantId: string;
  tenantName: string;
  basePath: string;
};

const EmbedLoteamentosContext = createContext<EmbedLoteamentosContextValue | null>(null);

export function EmbedLoteamentosProvider({
  value,
  children,
}: {
  value: EmbedLoteamentosContextValue;
  children: ReactNode;
}) {
  return <EmbedLoteamentosContext.Provider value={value}>{children}</EmbedLoteamentosContext.Provider>;
}

export function useEmbedLoteamentosOptional(): EmbedLoteamentosContextValue | null {
  return useContext(EmbedLoteamentosContext);
}

export function useEmbedLoteamentos(): EmbedLoteamentosContextValue {
  const ctx = useContext(EmbedLoteamentosContext);
  if (!ctx) throw new Error("useEmbedLoteamentos fora do EmbedLoteamentosProvider");
  return ctx;
}
