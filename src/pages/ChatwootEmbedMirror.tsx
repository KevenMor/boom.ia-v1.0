import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Bot, AlertCircle } from "lucide-react";
import { AgentMirrorPanel } from "@/components/embed/AgentMirrorPanel";
import {
  fetchChatwootAgentMirror,
  parseChatwootAccountIdFromMessage,
  type AgentMirrorPayload,
} from "@/lib/chatwoot-embed-mirror";
import { getApiBase } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ChatwootEmbedMirror() {
  const [params] = useSearchParams();
  const embedKey = params.get("key")?.trim() ?? "";
  const accountFromUrl = params.get("account_id")?.trim() ?? "";

  const [accountId, setAccountId] = useState(accountFromUrl);
  const [agents, setAgents] = useState<AgentMirrorPayload[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMirror = useCallback(async (resolvedAccountId: string) => {
    if (!embedKey) {
      setError("Parâmetro key ausente na URL do Dashboard App.");
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
      setSelectedId((prev) => {
        if (prev && data.agents.some((a) => a.id === prev)) return prev;
        return data.agents[0]?.id ?? "";
      });
      if ((data.agents ?? []).length === 0) {
        setError(data.message ?? "Nenhum agente vinculado a esta conta Chatwoot.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar espelho");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [embedKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsedId = parseChatwootAccountIdFromMessage(event.data);
      if (parsedId) {
        setAccountId((prev) => prev || parsedId);
      }
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

  return (
    <div className="ds-chatwoot min-h-[100dvh] bg-cw-surface px-3 py-4 font-cw text-cw-slate-12 sm:px-4">
      <header className="mb-4 flex flex-col gap-2 border-b border-cw-weak pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha">
            <Bot className="h-4 w-4 text-cw-brand" />
          </span>
          <div>
            <h1 className="text-base font-semibold text-cw-slate-12">Boom IA — Espelho do Agente</h1>
            <p className="text-xs text-cw-slate-10">Somente leitura · conta Chatwoot {accountId || "—"}</p>
          </div>
        </div>
        {agents.length > 1 && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full sm:w-[240px] border-cw-weak bg-cw-elevated">
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
      </header>

      {loading && (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-cw-slate-10">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando configurações…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && selectedAgent && <AgentMirrorPanel agent={selectedAgent} />}
    </div>
  );
}
