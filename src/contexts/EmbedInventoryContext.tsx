import { createContext, useContext, type ReactNode } from "react";
import type { EmbedInventoryCredentials } from "@/lib/embed-inventory-api";

export type EmbedInventoryContextValue = EmbedInventoryCredentials & {
  ready: boolean;
  tenantId: string;
  tenantName: string;
  basePath: string;
};

const EmbedInventoryContext = createContext<EmbedInventoryContextValue | null>(null);

export function EmbedInventoryProvider({
  value,
  children,
}: {
  value: EmbedInventoryContextValue;
  children: ReactNode;
}) {
  return <EmbedInventoryContext.Provider value={value}>{children}</EmbedInventoryContext.Provider>;
}

export function useEmbedInventoryOptional(): EmbedInventoryContextValue | null {
  return useContext(EmbedInventoryContext);
}

export function useEmbedInventory(): EmbedInventoryContextValue {
  const ctx = useContext(EmbedInventoryContext);
  if (!ctx) throw new Error("useEmbedInventory fora do EmbedInventoryProvider");
  return ctx;
}
