import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { parseEmbedCredentialsFromLocation, parseEmbedInitMessage, persistEmbedCredentials } from "@/lib/embed-credentials";
import { bootstrapEmbedInventory } from "@/lib/embed-inventory-api";
import { setActiveEmbedInventory } from "@/lib/api-client";
import {
  applyEmbedTheme,
  parseEmbedThemeFromMessage,
  readEmbedThemeFromLocation,
  type EmbedTheme,
} from "@/lib/embed-theme";
import { EmbedInventoryProvider } from "@/contexts/EmbedInventoryContext";
import InventoryPage from "@/pages/InventoryPage";

const BASE_PATH = "/embed/chatwoot/inventory";

const isEmbedInventoryPath =
  typeof window !== "undefined" && window.location.pathname.startsWith("/embed/chatwoot/inventory");

if (isEmbedInventoryPath) {
  applyEmbedTheme(readEmbedThemeFromLocation());
}

function ChatwootEmbedInventoryBody() {
  const initial = parseEmbedCredentialsFromLocation();
  const [embedKey, setEmbedKey] = useState(initial.key);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [tenantId, setTenantId] = useState<string>("");
  const [tenantName, setTenantName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (!initial.key) {
      return "Key ausente. Abra via Mega (Dashboard Script de Inventário) ou use ?key=...&account_id=...";
    }
    if (!initial.accountId) return "account_id ausente na URL.";
    return null;
  });

  const applyCredentials = useCallback((key?: string, acct?: string) => {
    if (key) setEmbedKey(key);
    if (acct) setAccountId(acct);
    if (key || acct) persistEmbedCredentials({ key, accountId: acct });
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const creds = parseEmbedCredentialsFromLocation();
      if (creds.key || creds.accountId) applyCredentials(creds.key, creds.accountId);
    };
    syncFromUrl();
    window.addEventListener("hashchange", syncFromUrl);

    const onMessage = (event: MessageEvent) => {
      const init = parseEmbedInitMessage(event.data);
      if (init) applyCredentials(init.key, init.accountId);

      const themePayload = parseEmbedThemeFromMessage(event.data);
      if (themePayload) {
        applyEmbedTheme(themePayload.theme, themePayload.colors);
        window.dispatchEvent(
          new CustomEvent("boom-ia-embed-theme", { detail: themePayload }),
        );
      }
    };
    window.addEventListener("message", onMessage);

    if (window.parent !== window) {
      window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    }

    return () => {
      window.removeEventListener("hashchange", syncFromUrl);
      window.removeEventListener("message", onMessage);
    };
  }, [applyCredentials]);

  useEffect(() => {
    if (!embedKey || !accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void bootstrapEmbedInventory({ embedKey, accountId })
      .then((res) => {
        if (cancelled) return;
        setTenantId(res.tenant_id);
        setTenantName(res.tenant_name);
        setActiveEmbedInventory({ embedKey, accountId });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Falha ao carregar inventário";
        setError(
          msg.includes("Chave") || msg.includes("inválida")
            ? `${msg} — confira CHATWOOT_MIRROR_EMBED_KEY no server e EMBED_KEY no script Mega.`
            : msg.includes("chatwoot_account_id")
              ? `${msg} — configure config.chatwoot_account_id no agente Ana Júlia (PPL Motors).`
              : msg,
        );
        setActiveEmbedInventory(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      setActiveEmbedInventory(null);
    };
  }, [embedKey, accountId]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando inventário…
      </div>
    );
  }

  if (error || !embedKey || !accountId || !tenantId) {
    return (
      <div className="min-h-[100dvh] bg-background p-4 font-sans">
        <div className="mx-auto flex max-w-lg items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || "Não foi possível iniciar o painel de inventário."}</span>
        </div>
      </div>
    );
  }

  const embedValue = {
    embedKey,
    accountId,
    ready: true,
    tenantId,
    tenantName,
    basePath: BASE_PATH,
  };

  return (
    <EmbedInventoryProvider value={embedValue}>
      <div className="ds-chatwoot font-cw min-h-[100dvh] bg-background p-4 text-foreground sm:p-6">
        <InventoryPage />
      </div>
    </EmbedInventoryProvider>
  );
}

export default function ChatwootEmbedInventory() {
  const [embedTheme, setEmbedTheme] = useState<EmbedTheme>(() => readEmbedThemeFromLocation());

  useEffect(() => {
    const syncFromUrl = () => {
      const theme = readEmbedThemeFromLocation();
      setEmbedTheme(theme);
      applyEmbedTheme(theme);
    };
    syncFromUrl();
    window.addEventListener("hashchange", syncFromUrl);

    const onThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ theme: EmbedTheme }>).detail;
      if (!detail?.theme) return;
      setEmbedTheme(detail.theme);
    };
    window.addEventListener("boom-ia-embed-theme", onThemeEvent);

    return () => {
      window.removeEventListener("hashchange", syncFromUrl);
      window.removeEventListener("boom-ia-embed-theme", onThemeEvent);
    };
  }, []);

  return (
    <ThemeProvider forcedTheme={embedTheme} attribute="class" enableSystem={false}>
      <ChatwootEmbedInventoryBody />
    </ThemeProvider>
  );
}
