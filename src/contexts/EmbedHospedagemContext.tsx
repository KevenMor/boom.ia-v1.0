import { createContext, useContext, type ReactNode } from "react";
import type { EmbedHospedagemCredentials } from "@/lib/embed-hospedagem-api";

export type EmbedHospedagemContextValue = EmbedHospedagemCredentials & {
  ready: boolean;
  tenantId: string;
  tenantName: string;
  basePath: string;
};

const EmbedHospedagemContext = createContext<EmbedHospedagemContextValue | null>(null);

export function EmbedHospedagemProvider({
  value,
  children,
}: {
  value: EmbedHospedagemContextValue;
  children: ReactNode;
}) {
  return <EmbedHospedagemContext.Provider value={value}>{children}</EmbedHospedagemContext.Provider>;
}

export function useEmbedHospedagemOptional(): EmbedHospedagemContextValue | null {
  return useContext(EmbedHospedagemContext);
}

export function useEmbedHospedagem(): EmbedHospedagemContextValue {
  const ctx = useContext(EmbedHospedagemContext);
  if (!ctx) throw new Error("useEmbedHospedagem fora do EmbedHospedagemProvider");
  return ctx;
}
