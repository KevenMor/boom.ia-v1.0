import { useState } from "react";
import { Copy, Check, Eye, EyeOff, AlertCircle, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantIntegration } from "@/hooks/useTenantIntegration";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function CopyField({
  id,
  label,
  hint,
  value,
  mono = true,
  masked = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  mono?: boolean;
  masked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!masked);

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success("Copiado!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const display = masked && !visible ? "•".repeat(Math.min(value.length, 24)) : value;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={display}
          className={cn("h-11 bg-muted/30", mono && "font-mono text-sm")}
        />
        {masked && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar" : "Mostrar"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={copy}
          disabled={!value}
          aria-label={`Copiar ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

interface TenantApiIntegrationCardProps {
  tenantId: string;
}

export function TenantApiIntegrationCard({ tenantId }: TenantApiIntegrationCardProps) {
  const { data, isLoading, isError, error } = useTenantIntegration(tenantId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar integração: {error instanceof Error ? error.message : "desconhecido"}
      </p>
    );
  }

  const curlStatus = `curl -s "${data.endpoints.status}" \\
  -H "${data.header_name}: ${data.toggle_secret ?? "SEU_SECRET"}"`;

  const curlToggle = `curl -s -X POST "${data.endpoints.toggle}" \\
  -H "Content-Type: application/json" \\
  -H "${data.header_name}: ${data.toggle_secret ?? "SEU_SECRET"}" \\
  -d '${JSON.stringify(data.toggle_body_example)}'`;

  return (
    <div className="space-y-5">
      <CopyField
        id="tenant-integration-id"
        label="Tenant ID"
        hint="UUID do tenant no Supabase (Boom.IA)"
        value={data.tenant_id}
      />

      {data.toggle_secret_configured ? (
        <CopyField
          id="tenant-integration-secret"
          label="Secret toggle IA"
          hint="TENANT_AI_TOGGLE_SECRET — liga/desliga todos os agentes deste tenant via API externa"
          value={data.toggle_secret ?? ""}
          masked
        />
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Secret não configurado no servidor</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Defina <code className="font-mono text-[11px]">TENANT_AI_TOGGLE_SECRET</code> no env do container server (Portainer) e reinicie.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tenant-integration-base" className="text-sm font-medium text-foreground">
          URL base da API
        </Label>
        <p className="text-xs text-muted-foreground">Usada pelo sistema externo (Mega, cron-job.org, etc.)</p>
        <div className="flex gap-2">
          <Input
            id="tenant-integration-base"
            readOnly
            value={data.api_base_url}
            className="h-11 bg-muted/30 font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => {
              void navigator.clipboard.writeText(data.api_base_url).then(() => toast.success("URL copiada!"));
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Endpoints</p>
        <div className="space-y-2 text-xs">
          <div>
            <span className="font-medium text-muted-foreground">GET status — </span>
            <code className="break-all font-mono">{data.endpoints.status}</code>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">POST toggle — </span>
            <code className="break-all font-mono">{data.endpoints.toggle}</code>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Header obrigatório: <code className="font-mono">{data.header_name}</code> ou{" "}
          <code className="font-mono">Authorization: Bearer &lt;secret&gt;</code>
        </p>
      </div>

      <details className="rounded-lg border border-border bg-muted/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Exemplo cURL (testar integração)
        </summary>
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Consultar status</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] font-mono leading-relaxed">{curlStatus}</pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Ligar agentes</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] font-mono leading-relaxed">{curlToggle}</pre>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              void navigator.clipboard.writeText(curlToggle).then(() => toast.success("cURL copiado!"));
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar cURL do toggle
          </Button>
        </div>
      </details>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <ExternalLink className="h-3 w-3" />
        Documentação: <code className="font-mono">scripts/cron-tenant-ai/README.md</code>
      </p>
    </div>
  );
}
