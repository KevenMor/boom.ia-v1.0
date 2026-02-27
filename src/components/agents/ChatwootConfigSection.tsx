import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  chatwootUrl: string;
  setChatwootUrl: (v: string) => void;
  chatwootApiToken: string;
  setChatwootApiToken: (v: string) => void;
  chatwootAccountId: string;
  setChatwootAccountId: (v: string) => void;
  webhookUrl?: string;
}

export function ChatwootConfigSection({
  chatwootUrl,
  setChatwootUrl,
  chatwootApiToken,
  setChatwootApiToken,
  chatwootAccountId,
  setChatwootAccountId,
  webhookUrl,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-border/50 p-3">
      <div className="flex items-center gap-2">
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Chatwoot
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            URL do Chatwoot
          </Label>
          <Input
            placeholder="https://chatwoot.suaempresa.com"
            value={chatwootUrl}
            onChange={(e) => setChatwootUrl(e.target.value)}
            className="h-8 bg-background font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Account ID
            </Label>
            <Input
              placeholder="1"
              value={chatwootAccountId}
              onChange={(e) => setChatwootAccountId(e.target.value)}
              className="h-8 bg-background font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              API Access Token
            </Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={chatwootApiToken}
              onChange={(e) => setChatwootApiToken(e.target.value)}
              className="h-8 bg-background font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {webhookUrl && (
        <div className="space-y-1 pt-1 border-t border-border/30">
          <Label className="text-[10px] text-muted-foreground">
            URL do Webhook (cole no Chatwoot → Inbox → Settings → Webhook URL)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={webhookUrl}
              className="h-8 bg-muted font-mono text-[10px] text-muted-foreground"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast.success("URL copiada!");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Configure o webhook do Chatwoot apontando para a URL acima. Respostas do
        agente serão enviadas automaticamente de volta para a conversa.
      </p>
    </div>
  );
}
