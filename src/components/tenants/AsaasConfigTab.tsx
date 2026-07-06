import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Save, FlaskConical, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsaasConfig, useSaveAsaasConfig, useTestAsaasConnection, type AsaasEnvironment } from "@/hooks/useAsaasConfig";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const schema = z.object({
  environment: z.enum(["sandbox", "production"]),
  api_key: z.string().optional(),
  webhook_token: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface AsaasConfigTabProps {
  tenantId: string;
}

export function AsaasConfigTab({ tenantId }: AsaasConfigTabProps) {
  const { data: cfg, isLoading } = useAsaasConfig(tenantId);
  const save = useSaveAsaasConfig();
  const test = useTestAsaasConnection();
  const [showKey, setShowKey] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: {
      environment: cfg?.data?.environment ?? "sandbox",
      api_key: "",
      webhook_token: "",
    },
  });

  const environment = watch("environment");

  const onSubmit = async (data: FormData) => {
    try {
      await save.mutateAsync({
        tenant_id: tenantId,
        environment: data.environment as AsaasEnvironment,
        api_key: data.api_key || undefined,
        webhook_token: data.webhook_token || null,
      });
      toast.success("Configuração salva!");
      setValue("api_key", "");
      setValue("webhook_token", "");
    } catch (err: unknown) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : ""));
    }
  };

  const onTest = async () => {
    try {
      const res = await test.mutateAsync({ tenant_id: tenantId });
      if (res.ok) {
        toast.success("Conexão ok!");
      } else {
        toast.error("Falhou: " + (res.error || "verifique a API key e o ambiente"));
      }
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const status = cfg?.data?.last_test_status;
  const lastError = cfg?.data?.last_test_error;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Integração Asaas</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Conecte a conta Asaas desta empresa para que toda fatura criada no CRM vire uma cobrança
            real (PIX/Boleto) e o status seja atualizado automaticamente quando o cliente pagar.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Ambiente</Label>
          <div className="flex gap-2">
            {(["sandbox", "production"] as const).map((env) => (
              <label
                key={env}
                className={cn(
                  "flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors",
                  environment === env
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30"
                )}
              >
                <input
                  type="radio"
                  value={env}
                  {...register("environment")}
                  className="sr-only"
                />
                {env === "sandbox" ? "Sandbox (testes)" : "Produção"}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sandbox é o ambiente de homologação do Asaas. Use produção somente após validar
            que o ciclo de cobrança funciona ponta-a-ponta em sandbox.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_key">API key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="api_key"
                type={showKey ? "text" : "password"}
                placeholder={cfg?.data?.api_key_set ? "•••••••• (já configurada — preencha só se quiser trocar)" : "Cole aqui sua API key do Asaas"}
                autoComplete="off"
                {...register("api_key")}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {cfg?.data?.api_key_set && (
            <p className="text-[11px] text-muted-foreground">✓ API key salva (criptografada). Deixe em branco para manter a atual.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhook_token">Webhook token (opcional)</Label>
          <Input
            id="webhook_token"
            type="text"
            placeholder="Token configurado no painel do Asaas → Integrações"
            autoComplete="off"
            {...register("webhook_token")}
          />
          <p className="text-[11px] text-muted-foreground">
            Crie um token no painel Asaas (Integrações → Webhooks) e cole aqui. Necessário se
            você quiser usar a URL autenticada <code>/api/webhooks/asaas/&lt;tenantId&gt;</code>.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={test.isPending}
            className="gap-2"
          >
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Testar conexão
          </Button>
        </div>
      </div>

      {cfg?.data && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h4 className="text-sm font-medium text-foreground">Status da conexão</h4>
          {status === "ok" && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
              <div>
                <p className="text-foreground">Conectado</p>
                {cfg.data.account_name && (
                  <p className="text-xs text-muted-foreground">Conta: {cfg.data.account_name}</p>
                )}
                {cfg.data.wallet_id && (
                  <p className="text-xs text-muted-foreground">Wallet: {cfg.data.wallet_id}</p>
                )}
                {cfg.data.last_tested_at && (
                  <p className="text-xs text-muted-foreground">
                    Último teste: {new Date(cfg.data.last_tested_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-foreground">Falhou</p>
                <p className="text-xs text-muted-foreground">{lastError}</p>
              </div>
            </div>
          )}
          {!status && (
            <p className="text-xs text-muted-foreground">Ainda não testado. Clique em "Testar conexão".</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-5 text-xs text-muted-foreground space-y-2">
        <p className="text-foreground font-medium text-sm">Como funciona</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Salve a API key acima e clique em "Testar conexão".</li>
          <li>Ao criar uma fatura no perfil de um cliente, ela vira automaticamente uma cobrança no Asaas.</li>
          <li>O Asaas notifica nosso webhook quando o cliente paga — o status da fatura é sincronizado.</li>
        </ol>
        <p className="pt-2">
          <strong>Pré-requisito:</strong> cada cliente precisa ter CPF/CNPJ cadastrado (campo
          "cpf_cnpj" no contato). Atualize o cadastro antes de criar a primeira fatura.
        </p>
      </div>
    </form>
  );
}

export function AsaasInvoiceActions({ invoice, contactId }: { invoice: { id: string; tenant_id: string; asaas_charge_url?: string | null; asaas_invoice_url?: string | null; asaas_pix_payload?: string | null; asaas_status?: string | null }; contactId: string }) {
  const retry = useRetryInvoiceSync();

  const onCopyPix = () => {
    if (invoice.asaas_pix_payload) {
      void navigator.clipboard.writeText(invoice.asaas_pix_payload);
      toast.success("PIX copiado!");
    }
  };

  const onRetry = async () => {
    try {
      await retry.mutateAsync({ tenant_id: invoice.tenant_id, invoice_id: invoice.id, contact_id: contactId });
      toast.success("Reenviado ao Asaas!");
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    }
  };

  const chargeUrl = invoice.asaas_charge_url || invoice.asaas_invoice_url;
  if (!chargeUrl && !invoice.asaas_pix_payload && invoice.asaas_status !== "ERROR") return null;

  return (
    <div className="flex items-center gap-1.5">
      {chargeUrl && (
        <a
          href={chargeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted"
          title="Abrir cobrança no Asaas"
        >
          🔗 Asaas
        </a>
      )}
      {invoice.asaas_pix_payload && (
        <Button type="button" variant="outline" size="sm" onClick={onCopyPix} className="h-7 px-2 text-xs gap-1">
          <Copy className="h-3 w-3" /> Copiar PIX
        </Button>
      )}
      {invoice.asaas_status === "ERROR" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={retry.isPending}
          className="h-7 px-2 text-xs gap-1"
          title={invoice.asaas_charge_url ? undefined : "Reenviar para Asaas"}
        >
          {retry.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Reenviar
        </Button>
      )}
    </div>
  );
}