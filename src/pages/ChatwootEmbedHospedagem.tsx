import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { parseEmbedCredentialsFromLocation, parseEmbedInitMessage, persistEmbedCredentials } from "@/lib/embed-credentials";
import { bootstrapEmbedHospedagem } from "@/lib/embed-hospedagem-api";
import { setActiveEmbedHospedagem } from "@/lib/api-client";
import { EmbedHospedagemProvider } from "@/contexts/EmbedHospedagemContext";
import { HospedagemEmbedHeader } from "@/components/hospedagem/HospedagemEmbedHeader";
import ParkCalendarManagementPage from "@/pages/hospedagem/ParkCalendarManagementPage";
import LodgingRegistryPage from "@/pages/hospedagem/LodgingRegistryPage";
import LodgingPricingPage from "@/pages/hospedagem/LodgingPricingPage";

const BASE_PATH = "/embed/chatwoot/hospedagem";

export default function ChatwootEmbedHospedagem() {
  const initial = parseEmbedCredentialsFromLocation();
  const location = useLocation();
  const [embedKey, setEmbedKey] = useState(initial.key);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [tenantId, setTenantId] = useState<string>("");
  const [tenantName, setTenantName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (!initial.key) {
      return "Key ausente. Abra via Mega (Dashboard Script de Reservas) ou use ?key=...&account_id=...";
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

      const data = event.data as { type?: string; theme?: string } | null;
      if (data?.type === "boom-ia-embed:theme" && data.theme) {
        const dark = data.theme === "dark";
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
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
    void bootstrapEmbedHospedagem({ embedKey, accountId })
      .then((res) => {
        if (cancelled) return;
        setTenantId(res.tenant_id);
        setTenantName(res.tenant_name);
        setActiveEmbedHospedagem({ embedKey, accountId });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Falha ao carregar reservas";
        setError(
          msg.includes("Chave") || msg.includes("inválida")
            ? `${msg} — confira CHATWOOT_MIRROR_EMBED_KEY no server e EMBED_KEY no script Mega.`
            : msg.includes("chatwoot_account_id")
              ? `${msg} — configure config.chatwoot_account_id no agente Julia (Sunset).`
              : msg,
        );
        setActiveEmbedHospedagem(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      setActiveEmbedHospedagem(null);
    };
  }, [embedKey, accountId]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando painel de reservas…
      </div>
    );
  }

  if (error || !embedKey || !accountId || !tenantId) {
    return (
      <div className="min-h-[100dvh] bg-background p-4 font-sans">
        <div className="mx-auto flex max-w-lg items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || "Não foi possível iniciar o painel de reservas."}</span>
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
    <EmbedHospedagemProvider value={embedValue}>
      <div className="ds-chatwoot font-cw min-h-[100dvh] bg-slate-50 text-foreground dark:bg-background">
        <HospedagemEmbedHeader />

        <Routes location={location}>
          <Route index element={<Navigate to="calendario-parque" replace />} />
          <Route path="calendario-parque" element={<ParkCalendarManagementPage />} />
          <Route path="cadastro" element={<LodgingRegistryPage />} />
          <Route path="valores" element={<LodgingPricingPage />} />
          <Route path="*" element={<Navigate to="calendario-parque" replace />} />
        </Routes>
      </div>
    </EmbedHospedagemProvider>
  );
}
