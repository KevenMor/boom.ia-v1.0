import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Bot, AlertCircle } from "lucide-react";
import { EmbedAgentEditor } from "@/components/embed/EmbedAgentEditor";
import {
  fetchChatwootAgentMirror,
  parseChatwootAccountIdFromMessage,
  type AgentMirrorPayload,
  type MirrorProviderRow,
} from "@/lib/chatwoot-embed-mirror";
import { parseEmbedCredentialsFromLocation, parseEmbedInitMessage, persistEmbedCredentials } from "@/lib/embed-credentials";
import { getApiBase } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMBED_VERSION = "v3";

function resolveInitialCredentials() {
  return parseEmbedCredentialsFromLocation();
}

export default function ChatwootEmbedMirror() {
  const initial = resolveInitialCredentials();
  const [embedKey, setEmbedKey] = useState(initial.key);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [agents, setAgents] = useState<AgentMirrorPayload[]>([]);
  const [providers, setProviders] = useState<MirrorProviderRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (!initial.key) {
      return (
        "Key ausente. Abra via Mega (Dashboard Script atualizado) ou use: " +
        "/api/embed/chatwoot/view?key=SUA_CHAVE&account_id=9"
      );
    }
    if (!initial.accountId) {
      return "account_id ausente. Use account_id=9 para PPL Motors.";
    }
    return null;
  });

  const applyCredentials = useCallback((key?: string, acct?: string) => {
    if (key) setEmbedKey(key);
    if (acct) setAccountId(acct);
    if (key || acct) {
      persistEmbedCredentials({ key, accountId: acct });
    }
  }, []);

  const loadMirror = useCallback(async (resolvedAccountId: string, key: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChatwootAgentMirror(resolvedAccountId, key, getApiBase());
      setAgents(data.agents ?? []);
      setProviders(data.providers ?? []);
      setSelectedId((prev) => {
        if (prev && data.agents.some((a) => a.id === prev)) return prev;
        return data.agents[0]?.id ?? "";
      });
      if ((data.agents ?? []).length === 0) {
        setError(data.message ?? "Nenhum agente vinculado a esta conta Chatwoot.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao carregar agente";
      setError(
        msg.includes("Chave de espelho")
          ? `${msg} — confira CHATWOOT_MIRROR_EMBED_KEY no Easypanel e EMBED_KEY no script Mega.`
          : msg,
      );
      setAgents([]);
    } finally {
      setLoading(false);
    }
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

      const parsedId = parseChatwootAccountIdFromMessage(event.data);
      if (parsedId) setAccountId((prev) => prev || parsedId);
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
    void loadMirror(accountId, embedKey);
  }, [accountId, embedKey, loadMirror]);

  useEffect(() => {
    if (embedKey && accountId) return;
    const timer = window.setTimeout(() => {
      if (!embedKey) {
        setError(
          "Key não recebida. Recole o script PPL no Mega e faça redeploy frontend+server. " +
            "Teste: https://ia.agboom.com.br/api/embed/chatwoot/view?key=...&account_id=9",
        );
      } else if (!accountId) {
        setError("account_id ausente — use conta 9 (PPL Motors).");
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [embedKey, accountId]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? agents[0] ?? null,
    [agents, selectedId],
  );

  const handleSaved = (updated: AgentMirrorPayload) => {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  return (
    <div className="min-h-[100dvh] bg-background font-sans text-foreground">
      <header className="border-b border-border bg-card px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted">
              <Bot className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h1 className="text-base font-semibold">Boom IA — Agente</h1>
              <p className="text-xs text-muted-foreground">
                Conta Chatwoot {accountId || "—"} · embed {EMBED_VERSION}
              </p>
            </div>
          </div>
          {agents.length > 1 && (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Selecionar agente" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      {loading && (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      )}

      {!loading && error && (
        <div className="mx-auto flex max-w-[1280px] items-start gap-2 p-4 text-sm">
          <div className="flex w-full items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!loading && !error && selectedAgent && embedKey && accountId && (
        <EmbedAgentEditor
          agent={selectedAgent}
          providers={providers}
          accountId={accountId}
          embedKey={embedKey}
          apiBase={getApiBase()}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
