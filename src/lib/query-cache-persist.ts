import { dehydrate, hydrate, type DehydratedState, type QueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "boomia-rq-cache-v1";
const MAX_BYTES = 2_500_000;

/** Resultados agregados do painel — não inclui usage-events-recent (muito grande). */
const PERSIST_QUERY_ROOTS = new Set([
  "agents",
  "tenants",
  "providers",
  "tools",
  "tokens-by-agent",
  "tokens-by-provider",
  "conversation-growth",
  "usage-daily-summary",
]);

function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return typeof head === "string" && PERSIST_QUERY_ROOTS.has(head);
}

export function hydrateQueryCache(client: QueryClient): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as DehydratedState;
    hydrate(client, state);
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function persistQueryCache(client: QueryClient): void {
  try {
    const dehydrated = dehydrate(client, {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && shouldPersistQuery(query.queryKey),
    });
    const json = JSON.stringify(dehydrated);
    if (json.length > MAX_BYTES) return;
    sessionStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* quota */
  }
}
