import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Bot, AlertCircle } from "lucide-react";
import { EmbedAgentEditor } from "@/components/embed/EmbedAgentEditor";
import {
  fetchChatwootAgentMirror,
  parseChatwootAccountIdFromMessage,
  type AgentMirrorPayload,
  type MirrorProviderRow,
} from "@/lib/chatwoot-embed-mirror";
import { getApiBase } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ChatwootEmbedMirror() {
  const [params] = useSearchParams();
  const embedKey = params.get("key")?.trim() ?? "";
  const accountFromUrl = params.get("account_id")?.trim() ?? "";

  const [accountId, setAccountId] = useState(accountFromUrl);
  const [agents, setAgents] = useState<AgentMirrorPayload[]>([]);
  const [providers, setProviders] = useState<MirrorProviderRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMirror = useCallback(async (resolvedAccountId: string) => {
    if (!embedKey) {
      setError("Parâmetro key ausente na URL do embed.");
      setLoading(false);
      return;
    }
    if (!resolvedAccountId) {
      setError("Aguardando account_id do Chatwoot…");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChatwootAgentMirror(resolvedAccountId, embedKey, getApiBase());
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
      setError(e instanceof Error ? e.message : "Falha ao carregar agente");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [embedKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsedId = parseChatwootAccountIdFromMessage(event.data);
      if (parsedId) setAccountId((prev) => prev || parsedId);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (accountFromUrl) setAccountId(accountFromUrl);
  }, [accountFromUrl]);

  useEffect(() => {
    if (!accountId) return;
    void loadMirror(accountId);
  }, [accountId, loadMirror]);

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
              <p className="text-xs text-muted-foreground">Conta Chatwoot {accountId || "—"}</p>
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
