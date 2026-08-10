import { useState } from "react";
import { Shield, Clock, Globe, Plug, Plus, Trash2, Copy, FileJson, KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useMcpKeys, useCreateMcpKey, useRevokeMcpKey, type McpKey } from "@/hooks/useMcpKeys";

const STORAGE_KEY = "boomia_platform_settings";

interface PlatformSettings {
  platform_name: string;
  max_agents: number;
  max_msgs_month: number;
  retention_months: number;
}

const defaults: PlatformSettings = {
  platform_name: "Boom IA",
  max_agents: 5,
  max_msgs_month: 50000,
  retention_months: 12,
};

function loadSettings(): PlatformSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca usado";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// ─── MCP Keys Section ────────────────────────────────────────────────────────

function McpKeysSection() {
  const { data: keys = [], isLoading } = useMcpKeys();
  const createKey = useCreateMcpKey();
  const revokeKey = useRevokeMcpKey();

  const [newLabel, setNewLabel] = useState("default");
  const [createOpen, setCreateOpen] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<McpKey | null>(null);
  const [configTarget, setConfigTarget] = useState<McpKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  async function handleCreate() {
    try {
      const result = await createKey.mutateAsync(newLabel);
      setRevealToken(result.token);
      setCreateOpen(false);
      setNewLabel("default");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar chave MCP.");
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync(revokeTarget.id);
      toast.success("Chave revogada com sucesso.");
      setRevokeTarget(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao revogar chave.");
    }
  }

  function handleCopyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      toast.success("Token copiado para a área de transferência.");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const MCP_SERVER_URL = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL.replace("/api", "")}/mcp`
    : `${window.location.protocol}//${window.location.host}/mcp`;

  function buildJsonConfig(token: string): string {
    return JSON.stringify({
      mcpServers: {
        "boom-ia": {
          type: "http",
          url: MCP_SERVER_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    }, null, 2);
  }

  function handleCopyJson(token: string) {
    navigator.clipboard.writeText(buildJsonConfig(token)).then(() => {
      setCopiedJson(true);
      toast.success("JSON de configuração copiado!");
      setTimeout(() => setCopiedJson(false), 2000);
    });
  }

  return (
    <>
      <Card className="border-border bg-card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Conexão MCP</span>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
              Model Context Protocol
            </Badge>
          </div>
          <Button
            id="btn-new-mcp-key"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setCreateOpen(true)}
            disabled={keys.length >= 10}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova chave
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Gere uma chave de API para conectar qualquer cliente de IA compatível com MCP (Claude Desktop, Cursor, Continue.dev, etc.) ao Boom IA.
          A IA poderá listar e editar seus agentes, prompts e configurações diretamente.
          <span className="block mt-1 font-medium text-foreground/60">URL do servidor: <code className="font-mono bg-muted px-1 rounded text-[11px]">{MCP_SERVER_URL}</code></span>
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando chaves...
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-6 text-center">
            <KeyRound className="h-7 w-7 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Nenhuma chave MCP gerada ainda.</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Clique em "Nova chave" para começar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-4 py-3"
              >
                <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{key.label}</span>
                    <code className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {key.key_preview}
                    </code>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">Criada {formatDate(key.created_at)}</span>
                    <span className="text-[11px] text-muted-foreground">• Último uso: {formatDate(key.last_used_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    id={`btn-config-mcp-${key.id}`}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    onClick={() => setConfigTarget(key)}
                    title="Ver configuração MCP"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    id={`btn-revoke-mcp-${key.id}`}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setRevokeTarget(key)}
                    title="Revogar chave"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {keys.length >= 10 && (
          <p className="text-xs text-amber-500 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Limite de 10 chaves atingido. Revogue uma chave antes de criar outra.
          </p>
        )}
      </Card>

      {/* Dialog: Criar nova chave */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova chave MCP</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar esta chave (ex: "claude-desktop", "cursor").
              Após a criação, o token completo será exibido <strong>uma única vez</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="mcp-key-label" className="text-xs uppercase tracking-wider text-muted-foreground">
              Identificador da chave
            </Label>
            <Input
              id="mcp-key-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="ex: claude-desktop"
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              id="btn-confirm-create-mcp-key"
              onClick={handleCreate}
              disabled={createKey.isPending || !newLabel.trim()}
            >
              {createKey.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Gerar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Exibir token gerado */}
      <Dialog open={!!revealToken} onOpenChange={(open) => { if (!open) setRevealToken(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Chave MCP criada!
            </DialogTitle>
            <DialogDescription>
              Copie o token e/ou o JSON de configuração abaixo. O token{" "}
              <strong>não será exibido novamente</strong>, mas você pode visualizar
              a estrutura de configuração a qualquer momento na lista de chaves.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Token de acesso</Label>
              <code className="block rounded-md bg-muted px-3 py-2 text-[12px] font-mono break-all leading-relaxed border border-border">
                {revealToken}
              </code>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">JSON de configuração MCP</Label>
              <code className="block rounded-md bg-muted px-3 py-2 text-[11px] font-mono whitespace-pre border border-border overflow-x-auto">
                {revealToken ? buildJsonConfig(revealToken) : ""}
              </code>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                id="btn-copy-mcp-token"
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => revealToken && handleCopyToken(revealToken)}
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado!" : "Copiar token"}
              </Button>
              <Button
                id="btn-copy-mcp-json"
                className="flex-1 gap-2"
                onClick={() => revealToken && handleCopyJson(revealToken)}
              >
                {copiedJson ? <CheckCircle2 className="h-4 w-4" /> : <FileJson className="h-4 w-4" />}
                {copiedJson ? "Copiado!" : "Copiar JSON"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button id="btn-close-mcp-reveal" onClick={() => setRevealToken(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar revogação */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar chave MCP?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave <strong>"{revokeTarget?.label}"</strong> ({revokeTarget?.key_preview}) será desativada permanentemente.
              Qualquer cliente de IA usando esta chave perderá acesso imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              id="btn-confirm-revoke-mcp-key"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevoke}
            >
              {revokeKey.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : null}
              Sim, revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Ver configuração de chave existente */}
      <Dialog open={!!configTarget} onOpenChange={(open) => { if (!open) setConfigTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-muted-foreground" />
              Configuração MCP — {configTarget?.label}
            </DialogTitle>
            <DialogDescription>
              Cole o JSON abaixo no seu cliente de IA (Claude Desktop, Cursor, etc.).
              Substitua <code className="font-mono text-[11px] bg-muted px-1 rounded">SEU_TOKEN_AQUI</code> pelo token completo que você copiou ao criar esta chave.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <code className="block rounded-md bg-muted px-3 py-3 text-[11px] font-mono whitespace-pre border border-border overflow-x-auto leading-relaxed">
              {configTarget ? JSON.stringify({
                mcpServers: {
                  "boom-ia": {
                    type: "http",
                    url: MCP_SERVER_URL,
                    headers: { Authorization: "Bearer SEU_TOKEN_AQUI" },
                  },
                },
              }, null, 2) : ""}
            </code>
            <Button
              id="btn-copy-config-template"
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                if (!configTarget) return;
                const json = JSON.stringify({
                  mcpServers: {
                    "boom-ia": {
                      type: "http",
                      url: MCP_SERVER_URL,
                      headers: { Authorization: "Bearer SEU_TOKEN_AQUI" },
                    },
                  },
                }, null, 2);
                navigator.clipboard.writeText(json).then(() => toast.success("JSON copiado! Lembre de substituir SEU_TOKEN_AQUI."));
              }}
            >
              <Copy className="h-4 w-4" />
              Copiar JSON (substituir token depois)
            </Button>
          </div>

          <DialogFooter>
            <Button id="btn-close-config-dialog" onClick={() => setConfigTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(loadSettings);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    toast.success("Configurações salvas com sucesso!");
  };

  const update = (key: keyof PlatformSettings, value: string | number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Geral
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome da plataforma</Label>
          <Input
            value={settings.platform_name}
            onChange={(e) => update("platform_name", e.target.value)}
            className="h-9 bg-background max-w-sm"
          />
        </div>
      </Card>

      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Quotas padrão para novos tenants
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max agentes</Label>
            <Input
              type="number"
              value={settings.max_agents}
              onChange={(e) => update("max_agents", Number(e.target.value))}
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max msgs/mês</Label>
            <Input
              type="number"
              value={settings.max_msgs_month}
              onChange={(e) => update("max_msgs_month", Number(e.target.value))}
              className="h-9 bg-background"
            />
          </div>
        </div>
      </Card>

      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          LGPD — Retenção de dados
        </div>
        <div className="space-y-2 max-w-sm">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Retenção de mensagens (meses)</Label>
          <Input
            type="number"
            value={settings.retention_months}
            onChange={(e) => update("retention_months", Number(e.target.value))}
            className="h-9 bg-background"
          />
        </div>
      </Card>

      <Button onClick={handleSave}>Salvar configurações</Button>

      {/* Seção MCP — separada das configurações gerais da plataforma */}
      <div className="pt-2">
        <div className="mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            Integrações externas
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Conecte clientes de IA externos via protocolo MCP.</p>
        </div>
        <McpKeysSection />
      </div>
    </div>
  );
}
