import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Eye, EyeOff, Copy, Check, Loader2, Code2, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cloudClient } from "@/integrations/supabase/cloud-client";
import { toast } from "sonner";

interface TenantSummary {
  slug: string;
  version: string;
  description: string;
  systemPromptLength: number;
  communicationRulesLength: number;
  dispatcherPromptLength: number;
}

interface TenantDetail {
  slug: string;
  version: string;
  description: string;
  systemPrompt: string;
  communicationRules: string;
  dispatcherPrompt: string;
  fullComposedPrompt: string;
  fullPromptLength: number;
}

function PromptBlock({ title, icon: Icon, content, badge }: { title: string; icon: React.ElementType; content: string; badge?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = content.split("\n").length;
  const chars = content.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50"
      >
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">{lines} linhas · {chars.toLocaleString()} caracteres</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {expanded ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80 font-mono max-h-[600px] overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function PromptsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    try {
      const { data, error } = await cloudClient.functions.invoke("prompt-viewer");
      if (error) throw error;
      setTenants(data.tenants || []);
    } catch (err: any) {
      toast.error("Erro ao carregar prompts: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(slug: string) {
    setLoadingDetail(true);
    try {
      const { data, error } = await cloudClient.functions.invoke("prompt-viewer", {
        body: null,
        headers: {},
      });
      // Use query params via direct fetch
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-viewer?slug=${slug}`;
      const resp = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const detail = await resp.json();
      setSelectedDetail(detail);
    } catch (err: any) {
      toast.error("Erro ao carregar detalhes: " + (err.message || ""));
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">Prompts por Tenant</h1>
          <p className="text-sm text-muted-foreground">Visualize os prompts gerenciados no código para cada tenant</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText className="mb-4 h-12 w-12" />
          <p>Nenhum prompt registrado no código</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tenant cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tenants.map((t) => (
              <button
                key={t.slug}
                onClick={() => loadDetail(t.slug)}
                className={`rounded-xl border p-5 text-left transition-all hover:shadow-md ${
                  selectedDetail?.slug === t.slug
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{t.description}</h3>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{t.slug}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{t.version}</Badge>
                </div>
                <Separator className="my-3" />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>System: {t.systemPromptLength.toLocaleString()}</span>
                  <span>Rules: {t.communicationRulesLength.toLocaleString()}</span>
                  <span>Dispatcher: {t.dispatcherPromptLength.toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Detail view */}
          {loadingDetail && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {selectedDetail && !loadingDetail && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{selectedDetail.description}</h2>
                <Badge variant="secondary">{selectedDetail.version}</Badge>
                <Badge variant="outline" className="text-[10px]">
                  {selectedDetail.fullPromptLength.toLocaleString()} chars total
                </Badge>
              </div>

              <PromptBlock
                title="System Prompt"
                icon={MessageSquare}
                content={selectedDetail.systemPrompt}
                badge="Identidade + Fluxo"
              />

              <PromptBlock
                title="Regras de Comunicação"
                icon={Code2}
                content={selectedDetail.communicationRules}
                badge="Brevidade + Anti-repetição"
              />

              <PromptBlock
                title="Dispatcher Prompt"
                icon={Sparkles}
                content={selectedDetail.dispatcherPrompt}
                badge="Phase 1 — Tool Calling"
              />

              <PromptBlock
                title="Prompt Composto Final"
                icon={FileText}
                content={selectedDetail.fullComposedPrompt}
                badge="System + Rules + Greeting"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
