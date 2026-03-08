import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Eye, EyeOff, Copy, Check, Loader2, Code2, MessageSquare, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { callAPI } from "@/lib/api-client";
import { toast } from "sonner";
import { useTenantContext } from "@/contexts/TenantContext";

interface TenantSummary {
  slug: string;
  version: string;
  description: string;
  systemPromptLength: number;
  communicationRulesLength: number;
  dispatcherPromptLength: number;
  followupPromptLength: number;
}

interface TenantDetail {
  slug: string;
  version: string;
  description: string;
  systemPrompt: string;
  communicationRules: string;
  dispatcherPrompt: string;
  followupPrompt: string;
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

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function PromptsPage() {
  const navigate = useNavigate();
  const [allTenants, setAllTenants] = useState<TenantSummary[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { selectedTenant } = useTenantContext();

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    try {
      const data = await callAPI<{ tenants?: TenantSummary[] }>("/admin/prompts", { method: "GET" });
      setAllTenants(data.tenants || []);
    } catch (err: any) {
      toast.error("Erro ao carregar prompts: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(slug: string) {
    setLoadingDetail(true);
    try {
      const detail = await callAPI<Record<string, unknown>>(`/admin/prompts?slug=${slug}`, { method: "GET" });
      setSelectedDetail(detail);
    } catch (err: any) {
      toast.error("Erro ao carregar detalhes: " + (err.message || ""));
    } finally {
      setLoadingDetail(false);
    }
  }

  // Extract agent name from description (e.g. "Juliana — SDR PPL Motors..." → "Juliana")
  function getAgentName(desc: string) {
    const dash = desc.indexOf("—");
    return dash > 0 ? desc.substring(0, dash).trim() : desc.split(" ")[0];
  }

  // Extract role/company from description
  function getRole(desc: string) {
    const dash = desc.indexOf("—");
    return dash > 0 ? desc.substring(dash + 1).trim() : "";
  }

  // Filter tenants by selected tenant slug
  const tenants = selectedTenant
    ? allTenants.filter((t) => {
        const tenantSlug = selectedTenant.slug.toLowerCase();
        const promptSlug = t.slug.toLowerCase();
        return promptSlug === tenantSlug || promptSlug.startsWith(tenantSlug) || tenantSlug.startsWith(promptSlug);
      })
    : allTenants;

  const totalChars = tenants.reduce((sum, t) => sum + t.systemPromptLength + t.communicationRulesLength + t.dispatcherPromptLength + t.followupPromptLength, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Prompts por Tenant</h1>
          <p className="text-sm text-muted-foreground">Visualize os prompts gerenciados no código para cada tenant</p>
        </div>
        {!loading && tenants.length > 0 && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span>{tenants.length} tenants</span>
            <span className="text-border">·</span>
            <span>{formatNumber(totalChars)} chars total</span>
          </div>
        )}
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
          {/* Tenant list */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            {tenants.map((t, idx) => {
              const isSelected = selectedDetail?.slug === t.slug;
              const isLast = idx === tenants.length - 1;
              const agentName = getAgentName(t.description);
              const role = getRole(t.description);
              const totalLen = t.systemPromptLength + t.communicationRulesLength + t.dispatcherPromptLength + t.followupPromptLength;

              return (
                <button
                  key={t.slug}
                  onClick={() => loadDetail(t.slug)}
                  className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-all hover:bg-muted/40 ${
                    isSelected ? "bg-primary/5" : ""
                  } ${!isLast ? "border-b border-border" : ""}`}
                >
                  {/* Avatar circle */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isSelected 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-primary/10 text-primary"
                  }`}>
                    {agentName.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{agentName}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] font-mono">{t.version}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{role}</p>
                  </div>

                  {/* Stats */}
                  <div className="hidden md:flex items-center gap-4 text-[11px] text-muted-foreground tabular-nums">
                    <div className="text-center">
                      <div className="font-semibold text-foreground/70">{formatNumber(t.systemPromptLength)}</div>
                      <div>System</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-foreground/70">{formatNumber(t.communicationRulesLength)}</div>
                      <div>Rules</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-foreground/70">{formatNumber(t.dispatcherPromptLength)}</div>
                      <div>Dispatch</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-foreground/70">{formatNumber(t.followupPromptLength)}</div>
                      <div>Follow-up</div>
                    </div>
                  </div>

                  {/* Total + arrow */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground hidden sm:inline">{formatNumber(totalLen)}</span>
                    <ChevronRight className={`h-4 w-4 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground/40"}`} />
                  </div>
                </button>
              );
            })}
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
                title="Follow-up Prompt"
                icon={MessageSquare}
                content={selectedDetail.followupPrompt}
                badge="Reengajamento automático"
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
