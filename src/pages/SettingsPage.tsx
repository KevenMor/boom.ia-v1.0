import { useState } from "react";
import { Plug, Plus, Trash2, Copy, FileJson, KeyRound, CheckCircle2, AlertCircle, Loader2, Lock, Check } from "lucide-react";
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

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca usado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

export default function SettingsPage() {
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
    <div className="w-full max-w-[900px] mx-auto pb-12 animate-in fade-in-50 duration-300">
      <Card className="border border-border/80 bg-card/60 backdrop-blur-md shadow-lg rounded-2xl overflow-hidden">
        {/* Card Header Premium */}
        <div className="border-b border-border/80 px-6 py-5 flex items-center justify-between bg-muted/20">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight">Conexão MCP</span>
              <Badge variant="secondary" className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md font-semibold tracking-wider bg-primary/5 text-primary border border-primary/10">
                Live Server
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Integração externa via Model Context Protocol para LLMs e IAs de terceiros.
            </p>
          </div>
          
          <Button
            id="btn-new-mcp-key"
            size="sm"
            className="h-9 gap-1.5 text-xs font-medium shadow-md transition-all hover:shadow-lg active:scale-95"
            onClick={() => setCreateOpen(true)}
            disabled={keys.length >= 10}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova chave
          </Button>
        </div>

        {/* Server Config Block */}
        <div className="px-6 py-4 bg-muted/10 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">URL de Endpoint do Servidor</span>
            <div className="font-mono bg-background border border-border/60 text-foreground/80 px-3 py-1.5 rounded-lg text-[11px] select-all truncate max-w-[500px]">
              {MCP_SERVER_URL}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs self-start sm:self-center font-medium border border-border hover:bg-background"
            onClick={() => {
              navigator.clipboard.writeText(MCP_SERVER_URL);
              toast.success("URL copiada!");
            }}
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            Copiar URL
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Carregando chaves de acesso...
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-12 text-center bg-background/30 transition-all hover:bg-background/40">
              <p className="text-sm font-medium text-foreground/90">Nenhuma chave MCP gerada</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Para permitir que o Claude Desktop, Cursor ou outras IAs acessem seus agentes, crie uma chave de API.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40 border border-border/60 rounded-xl overflow-hidden bg-background/20">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold tracking-tight text-foreground/90">{key.label}</span>
                        <Badge variant="outline" className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-muted/40 text-muted-foreground border-border/60">
                          {key.key_preview}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        <span>Criada em {formatDate(key.created_at)}</span>
                        <span>•</span>
                        <span>Uso: {formatDate(key.last_used_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      id={`btn-config-mcp-${key.id}`}
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/20 border-border/60 bg-background"
                      onClick={() => setConfigTarget(key)}
                      title="Ver configuração MCP"
                    >
                      <FileJson className="h-4 w-4" />
                    </Button>
                    <Button
                      id={`btn-revoke-mcp-${key.id}`}
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 hover:border-destructive/20 border-border/60 bg-background"
                      onClick={() => setRevokeTarget(key)}
                      title="Revogar chave"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {keys.length >= 10 && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2.5">
              <AlertCircle className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Limite de Chaves Atingido</p>
                <p className="text-[11px] text-muted-foreground">Você atingiu o limite de 10 chaves. Revogue um acesso antigo para poder criar novas credenciais.</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Dialog: Criar nova chave */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nova chave MCP</DialogTitle>
            <DialogDescription>
              Insira um rótulo para identificar onde esta chave será usada (ex: "Claude Desktop", "Cursor").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="mcp-key-label" className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Identificador da chave
              </Label>
              <Input
                id="mcp-key-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Claude Desktop"
                className="h-10 bg-background/50 border-border/80 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button
              id="btn-confirm-create-mcp-key"
              onClick={handleCreate}
              disabled={createKey.isPending || !newLabel.trim()}
              className="rounded-xl"
            >
              {createKey.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Gerar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Exibir token gerado */}
      <Dialog open={!!revealToken} onOpenChange={(open) => { if (!open) setRevealToken(null); }}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              Chave MCP criada!
            </DialogTitle>
            <DialogDescription>
              Copie os dados abaixo. O token de acesso <strong>não poderá ser exibido novamente</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Token de acesso</Label>
              <code className="block rounded-xl bg-muted px-4 py-3 text-[12px] font-mono break-all leading-relaxed border border-border/80 relative select-all text-foreground/90">
                {revealToken}
              </code>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">JSON de configuração MCP</Label>
              <code className="block rounded-xl bg-muted px-4 py-3 text-[11px] font-mono whitespace-pre border border-border/80 overflow-x-auto leading-relaxed max-h-[160px] text-foreground/80">
                {revealToken ? buildJsonConfig(revealToken) : ""}
              </code>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row pt-2">
              <Button
                id="btn-copy-mcp-token"
                variant="outline"
                className="flex-1 gap-2 rounded-xl h-10 font-medium"
                onClick={() => revealToken && handleCopyToken(revealToken)}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                {copied ? "Token Copiado!" : "Copiar Token"}
              </Button>
              <Button
                id="btn-copy-mcp-json"
                className="flex-1 gap-2 rounded-xl h-10 font-medium shadow-md hover:shadow-lg"
                onClick={() => revealToken && handleCopyJson(revealToken)}
              >
                {copiedJson ? <Check className="h-4 w-4" /> : <FileJson className="h-4 w-4" />}
                {copiedJson ? "Configuração Copiada!" : "Copiar JSON"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button id="btn-close-mcp-reveal" onClick={() => setRevealToken(null)} className="w-full sm:w-auto rounded-xl">
              Entendido, fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar revogação */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar chave MCP?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave <strong>"{revokeTarget?.label}"</strong> ({revokeTarget?.key_preview}) será desativada permanentemente.
              Todos os clientes conectados com esta credencial perderão o acesso imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              id="btn-confirm-revoke-mcp-key"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
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
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              Configuração MCP — {configTarget?.label}
            </DialogTitle>
            <DialogDescription>
              Cole o JSON abaixo nas configurações da sua IA e substitua <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded text-primary">SEU_TOKEN_AQUI</code> pelo token copiado originalmente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <code className="block rounded-xl bg-muted px-4 py-3 text-[11px] font-mono whitespace-pre border border-border/80 overflow-x-auto leading-relaxed max-h-[200px] text-foreground/80">
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
              className="w-full gap-2 rounded-xl h-10 font-medium"
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
                navigator.clipboard.writeText(json).then(() => toast.success("Configuração copiada! Substitua o token."));
              }}
            >
              <Copy className="h-4 w-4 text-muted-foreground" />
              Copiar Estrutura JSON
            </Button>
          </div>

          <DialogFooter>
            <Button id="btn-close-config-dialog" variant="ghost" onClick={() => setConfigTarget(null)} className="w-full sm:w-auto rounded-xl">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
