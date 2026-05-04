import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Nome em embeds PostgREST (`tenants(...)`) — pode vir como objeto ou array de uma linha. */
export function relationName(rel: unknown): string | undefined {
  if (rel == null) return undefined;
  if (Array.isArray(rel)) {
    const o = rel[0] as { name?: string } | undefined;
    return typeof o?.name === "string" ? o.name : undefined;
  }
  const o = rel as { name?: string };
  return typeof o.name === "string" ? o.name : undefined;
}
