import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Send, FileSpreadsheet, History, Megaphone, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAgents } from "@/hooks/useAgents";
import { useTenantContext } from "@/contexts/TenantContext";
import { FINANCIAL_TEMPLATES, renderFinancialTemplate } from "@/lib/financial-templates";
import { callAPI } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FinancialStatus = "pago" | "pendente" | "vencido" | "outro";

interface FinancialRow {
  id: string;
  name: string;
  phone: string;
  value: string;
  dueDate: string;
  status: FinancialStatus;
}

interface CampaignResultItem {
  index: number;
  name: string;
  phone: string;
  ok: boolean;
  error?: string;
  channel?: "waha" | "chatwoot";
}

interface CampaignResult {
  total: number;
  sent: number;
  failed: number;
  delivery?: "waha" | "chatwoot";
  results: CampaignResultItem[];
}

interface SendCampaignAccepted {
  async: true;
  job_id: string;
}

type CampaignJobProgress = { index: number; total: number; sent: number; failed: number };

type CampaignStatusResponse =
  | { status: "queued" | "running"; progress?: CampaignJobProgress }
  | { status: "completed"; result: CampaignResult }
  | { status: "failed"; error: string };

function isSendCampaignAccepted(value: unknown): value is SendCampaignAccepted {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SendCampaignAccepted).async === true &&
    typeof (value as SendCampaignAccepted).job_id === "string"
  );
}

interface FinanceiroCampaignRun {
  id: string;
  tenant_id: string;
  agent_id: string;
  job_id: string | null;
  message_template: string;
  status: string;
  summary: {
    total?: number;
    sent?: number;
    failed?: number;
    delivery?: string;
    results_truncated?: boolean;
  } | null;
  results: CampaignResultItem[] | null;
  error_message: string | null;
  created_at: string;
}

function parseHistoryResults(raw: unknown): CampaignResultItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw as CampaignResultItem[];
}

function agentConfigHasWaha(cfg: Record<string, unknown>): boolean {
  return Boolean(cfg.waha_url && cfg.waha_api_key);
}

function agentConfigHasChatwoot(cfg: Record<string, unknown>): boolean {
  return Boolean(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
}

const HEADER_ALIASES: Record<string, keyof Omit<FinancialRow, "id">> = {
  nome: "name",
  cliente: "name",
  contato: "name",
  telefone: "phone",
  celular: "phone",
  fone: "phone",
  whatsapp: "phone",
  valor: "value",
  divida: "value",
  total: "value",
  vencimento: "dueDate",
  data: "dueDate",
  prazo: "dueDate",
  status: "status",
  situacao: "status",
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeStatus(raw: unknown): FinancialStatus {
  const status = String(raw ?? "").toLowerCase().trim();
  if (!status) return "outro";
  if (status.includes("pag")) return "pago";
  if (status.includes("pend")) return "pendente";
  if (status.includes("venc")) return "vencido";
  return "outro";
}

function statusBadgeClass(status: FinancialStatus): string {
  if (status === "pago") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "pendente") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (status === "vencido") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

function statusLabel(status: FinancialStatus): string {
  if (status === "pago") return "Pago";
  if (status === "pendente") return "Pendente";
  if (status === "vencido") return "Vencido";
  return "Outro";
}

function parseExcelFile(file: File): Promise<FinancialRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve([]);
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const mappedRows: FinancialRow[] = rows
          .map((row, index) => {
            const mapped: Partial<Omit<FinancialRow, "id">> = {};
            for (const [key, value] of Object.entries(row)) {
              const normalized = normalizeHeader(key);
              const targetField = HEADER_ALIASES[normalized];
              if (targetField) mapped[targetField] = String(value ?? "").trim() as never;
            }
            return {
              id: `row-${index}`,
              name: String(mapped.name ?? "").trim(),
              phone: String(mapped.phone ?? "").trim(),
              value: String(mapped.value ?? "").trim(),
              dueDate: String(mapped.dueDate ?? "").trim(),
              status: normalizeStatus(mapped.status),
            } satisfies FinancialRow;
          })
          .filter((row) => row.name || row.phone);
        resolve(mappedRows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo Excel."));
    reader.readAsArrayBuffer(file);
  });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "Nao informado";
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export default function FinanceiroPage() {
  const { selectedTenantId } = useTenantContext();
  const { data: agents = [] } = useAgents(selectedTenantId ?? undefined);

  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateId, setTemplateId] = useState(FINANCIAL_TEMPLATES[0]?.id ?? "");
  const [messageTemplate, setMessageTemplate] = useState(FINANCIAL_TEMPLATES[0]?.body ?? "");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [delayMinSec, setDelayMinSec] = useState(15);
  const [delayMaxSec, setDelayMaxSec] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [campaignResult, setCampaignResult] = useState<CampaignResult | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualDueDate, setManualDueDate] = useState("");
  const [manualStatus, setManualStatus] = useState<FinancialStatus>("pendente");

  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);
  const selectedCount = selectedRows.length;
  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  const availableAgents = useMemo(
    () =>
      agents.filter((agent) => {
        const cfg = (agent.config ?? {}) as Record<string, unknown>;
        return agentConfigHasWaha(cfg) || agentConfigHasChatwoot(cfg);
      }),
    [agents]
  );

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const previewRow = selectedRows[0] ?? rows[0];
  const previewMessage = previewRow
    ? renderFinancialTemplate(messageTemplate, {
        nome: previewRow.name || "Cliente",
        valor: previewRow.value || "0,00",
        vencimento: previewRow.dueDate || "--/--/----",
      })
    : messageTemplate;

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<CampaignJobProgress | null>(null);
  const [historyRuns, setHistoryRuns] = useState<FinanceiroCampaignRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [financeiroTab, setFinanceiroTab] = useState<"disparos" | "historico">("disparos");
  const [historyDetailRun, setHistoryDetailRun] = useState<FinanceiroCampaignRun | null>(null);
  const [historyDetailLoadingId, setHistoryDetailLoadingId] = useState<string | null>(null);

  const progressValue = useMemo(() => {
    if (liveProgress && liveProgress.total > 0) {
      return Math.min(100, Math.round(((liveProgress.index + 1) / liveProgress.total) * 100));
    }
    if (campaignResult) {
      return Math.round((campaignResult.sent / Math.max(campaignResult.total, 1)) * 100);
    }
    return 0;
  }, [liveProgress, campaignResult]);

  useEffect(() => {
    if (financeiroTab !== "historico" || !selectedTenantId) {
      if (!selectedTenantId) setHistoryRuns([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void callAPI<{ runs: FinanceiroCampaignRun[] }>(
      `/financeiro/campaign-runs?tenant_id=${encodeURIComponent(selectedTenantId)}&limit=40`,
      { method: "GET" }
    )
      .then((response) => {
        if (!cancelled) setHistoryRuns(response.runs ?? []);
      })
      .catch(() => {
        if (!cancelled) setHistoryRuns([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTenantId, historyRefresh, financeiroTab]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const status = await callAPI<CampaignStatusResponse>(`/financeiro/campaign/${activeJobId}/status`, {
          method: "GET",
        });
        if (cancelled) return;

        if (status.status === "completed") {
          setCampaignResult(status.result);
          setActiveJobId(null);
          setLiveProgress(null);
          setHistoryRefresh((n) => n + 1);
          const via = status.result.delivery === "waha" ? "WAHA" : "Chatwoot";
          toast.success(`Disparo finalizado (${via}): ${status.result.sent} enviados, ${status.result.failed} falhas.`);
          return;
        }

        if (status.status === "failed") {
          setActiveJobId(null);
          setLiveProgress(null);
          setHistoryRefresh((n) => n + 1);
          toast.error(status.error || "Campanha falhou.");
          return;
        }

        setLiveProgress(status.progress ?? null);
      } catch (error) {
        if (cancelled) return;
        setActiveJobId(null);
        setLiveProgress(null);
        toast.error(error instanceof Error ? error.message : "Erro ao acompanhar campanha.");
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeJobId]);

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(rows.map((row) => row.id)));
      return;
    }
    setSelectedIds(new Set());
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleFileInput = async (file: File | null) => {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Formato invalido. Use .xlsx ou .xls");
      return;
    }
    try {
      const parsed = await parseExcelFile(file);
      setRows(parsed);
      setSelectedIds(new Set());
      setCampaignResult(null);
      toast.success(`${parsed.length} registros carregados da planilha.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel importar a planilha.");
    }
  };

  const handleTemplateChange = (newTemplateId: string) => {
    setTemplateId(newTemplateId);
    const template = FINANCIAL_TEMPLATES.find((item) => item.id === newTemplateId);
    if (template) setMessageTemplate(template.body);
  };

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
  };

  const handleSendCampaign = async () => {
    if (!selectedCount) {
      toast.error("Selecione pelo menos um registro.");
      return;
    }
    if (!selectedAgentId) {
      toast.error("Selecione um agente com WAHA ou Chatwoot configurado.");
      return;
    }
    const minSec = Number.isFinite(delayMinSec) ? Math.max(0, delayMinSec) : 0;
    const maxSec = Number.isFinite(delayMaxSec) ? Math.max(minSec, delayMaxSec) : minSec;

    setSubmitting(true);
    setCampaignResult(null);
    setLiveProgress(null);
    try {
      const response = await callAPI<SendCampaignAccepted | CampaignResult>("/financeiro/send-campaign", {
        body: {
          agent_id: selectedAgentId,
          message_template: messageTemplate,
          delay_min_ms: Math.round(minSec * 1000),
          delay_max_ms: Math.round(maxSec * 1000),
          contacts: selectedRows.map((row) => ({
            name: row.name,
            phone: row.phone,
            value: row.value,
            due_date: row.dueDate,
            status: row.status,
          })),
        },
      });

      if (isSendCampaignAccepted(response)) {
        setActiveJobId(response.job_id);
        setDialogOpen(false);
        toast.message("Campanha em segundo plano", {
          description: "Pode fechar esta tela: o envio continua no servidor. Acompanhe o progresso abaixo.",
        });
        return;
      }

      setCampaignResult(response as CampaignResult);
      setDialogOpen(false);
      setHistoryRefresh((n) => n + 1);
      const via = (response as CampaignResult).delivery === "waha" ? "WAHA" : "Chatwoot";
      toast.success(
        `Disparo finalizado (${via}): ${(response as CampaignResult).sent} enviados, ${(response as CampaignResult).failed} falhas.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar campanha.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddManualRow = () => {
    const name = manualName.trim();
    const phone = manualPhone.trim();
    if (!name || !phone) {
      toast.error("Preencha pelo menos nome e telefone para inserir manualmente.");
      return;
    }

    const newRow: FinancialRow = {
      id: `manual-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name,
      phone,
      value: manualValue.trim(),
      dueDate: manualDueDate.trim(),
      status: manualStatus,
    };

    setRows((previous) => [newRow, ...previous]);
    setManualName("");
    setManualPhone("");
    setManualValue("");
    setManualDueDate("");
    setManualStatus("pendente");
    toast.success("Cliente inserido manualmente na lista.");
  };

  const openHistoryDetail = async (run: FinanceiroCampaignRun) => {
    if (Array.isArray(run.results)) {
      setHistoryDetailRun(run);
      return;
    }
    setHistoryDetailLoadingId(run.id);
    try {
      const response = await callAPI<{ run: FinanceiroCampaignRun }>(
        `/financeiro/campaign-run/${encodeURIComponent(run.id)}`,
        { method: "GET" }
      );
      setHistoryDetailRun(response.run);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar o detalhe.");
    } finally {
      setHistoryDetailLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Financeiro</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Disparos em lote via WhatsApp (WAHA ou Chatwoot) e registro operacional das campanhas — dados persistidos por
          tenant.
        </p>
      </header>

      <Tabs
        value={financeiroTab}
        onValueChange={(value) => setFinanceiroTab(value as "disparos" | "historico")}
        className="w-full"
      >
        <TabsList className="flex h-auto w-full max-w-lg flex-wrap gap-0 rounded-none border-b border-border bg-transparent p-0 shadow-none">
          <TabsTrigger
            value="disparos"
            className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <Megaphone className="h-4 w-4 shrink-0 opacity-80" />
            Disparos
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <History className="h-4 w-4 shrink-0 opacity-80" />
            Historico
            {historyRuns.length > 0 ? (
              <span className="ml-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {historyRuns.length > 99 ? "99+" : historyRuns.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="disparos" className="mt-6 space-y-4 outline-none">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Financeiro - Disparos em lote</CardTitle>
            <CardDescription>Importe uma planilha Excel e dispare mensagens financeiras com atraso configuravel.</CardDescription>
          </div>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleFileInput(file);
                event.currentTarget.value = "";
              }}
            />
            <Button type="button" className="gap-2" asChild>
              <span>
                <Upload className="h-4 w-4" />
                Importar planilha
              </span>
            </Button>
          </label>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Cabecalhos aceitos: Nome/Cliente, Telefone/WhatsApp, Valor, Vencimento e Status.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inserir cliente manualmente</CardTitle>
          <CardDescription>Use este formulario para adicionar um cliente sem planilha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder="Nome"
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
            />
            <Input
              placeholder="Telefone / WhatsApp"
              value={manualPhone}
              onChange={(event) => setManualPhone(event.target.value)}
            />
            <Input
              placeholder="Valor (R$)"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
            />
            <Input
              placeholder="Vencimento"
              value={manualDueDate}
              onChange={(event) => setManualDueDate(event.target.value)}
            />
            <Select value={manualStatus} onValueChange={(value) => setManualStatus(value as FinancialStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleAddManualRow}>
              Adicionar cliente
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Registros importados ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="text-sm">
                <strong>{selectedCount}</strong> contato(s) selecionado(s) para disparo.
              </div>
              <Button type="button" className="gap-2" onClick={() => setDialogOpen(true)}>
                <Send className="h-4 w-4" />
                Configurar disparo
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={(value) => toggleAll(Boolean(value))} />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nenhum registro carregado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const checked = selectedIds.has(row.id);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox checked={checked} onCheckedChange={(value) => toggleRow(row.id, Boolean(value))} />
                    </TableCell>
                    <TableCell>{row.name || "-"}</TableCell>
                    <TableCell>{formatPhone(row.phone)}</TableCell>
                    <TableCell>{row.value || "-"}</TableCell>
                    <TableCell>{row.dueDate || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusBadgeClass(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {activeJobId && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Campanha em execução (segundo plano)</CardTitle>
            <CardDescription>
              O servidor envia as mensagens com o atraso configurado entre cada uma. Este painel atualiza automaticamente.
              {liveProgress ? (
                <span className="mt-1 block text-foreground/80">
                  Progresso: contato {liveProgress.index + 1} de {liveProgress.total} — {liveProgress.sent} enviado(s),{" "}
                  {liveProgress.failed} falha(s).
                </span>
              ) : (
                <span className="mt-1 block text-foreground/80">Aguardando início…</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progressValue} />
          </CardContent>
        </Card>
      )}

      {campaignResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado do envio</CardTitle>
            <CardDescription>
              {campaignResult.sent} enviado(s), {campaignResult.failed} falha(s) em {campaignResult.total} contato(s).
              {campaignResult.delivery ? (
                <span className="mt-1 block text-foreground/80">
                  Canal: <strong>{campaignResult.delivery === "waha" ? "WAHA (WhatsApp direto)" : "Chatwoot"}</strong>
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressValue} />
            <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3 text-sm">
              {campaignResult.results.map((item) => (
                <div key={`${item.index}-${item.phone}`} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div>
                      {item.name || "Sem nome"} - {item.phone}
                    </div>
                    {!item.ok && item.error ? (
                      <p className="mt-1 break-all text-xs text-muted-foreground">{item.error}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    {item.channel ? (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {item.channel === "waha" ? "WAHA" : "Chatwoot"}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" className={item.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                      {item.ok ? "Enviado" : "Falhou"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="historico" className="mt-6 outline-none">
          <Card className="overflow-hidden shadow-sm">
            <div className="border-b bg-muted/40 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Historico de campanhas</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                    Registros do tenant atual — detalhe por contato ao clicar em Ver.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  disabled={!selectedTenantId || historyLoading}
                  onClick={() => setHistoryRefresh((n) => n + 1)}
                >
                  <RefreshCw className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>
            </div>
            <CardContent className="p-0">
              {!selectedTenantId ? (
                <p className="p-6 text-sm text-muted-foreground">Selecione um tenant para ver o historico.</p>
              ) : historyLoading && historyRuns.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
              ) : historyRuns.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Nenhum disparo registrado. Apos concluir uma campanha, o registro aparece aqui. Confirme a migracao
                  <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">financeiro_campaign_runs</code> no Supabase.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
                        <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Data / hora
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Agente
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Canal
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Contatos
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          OK
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Falhas
                        </TableHead>
                        <TableHead className="w-[100px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Acao
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRuns.map((run) => {
                        const summary = run.summary ?? {};
                        const agentLabel = agentNameById.get(run.agent_id) ?? run.agent_id.slice(0, 8);
                        const when = new Date(run.created_at).toLocaleString("pt-BR");
                        const delivery =
                          summary.delivery === "waha" ? "WAHA" : summary.delivery === "chatwoot" ? "Chatwoot" : "—";
                        return (
                          <TableRow key={run.id} className="text-sm">
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{when}</TableCell>
                            <TableCell className="max-w-[140px] truncate font-medium">{agentLabel}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  run.status === "completed"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                                }
                              >
                                {run.status === "completed" ? "Concluido" : "Falhou"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{delivery}</TableCell>
                            <TableCell className="text-right tabular-nums">{summary.total ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                              {summary.sent ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-red-700 dark:text-red-400">
                              {summary.failed ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2"
                                disabled={historyDetailLoadingId === run.id}
                                onClick={() => void openHistoryDetail(run)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Ver
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(historyDetailRun)} onOpenChange={(open) => !open && setHistoryDetailRun(null)}>
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Detalhe da campanha</DialogTitle>
            <DialogDescription>
              {historyDetailRun
                ? new Date(historyDetailRun.created_at).toLocaleString("pt-BR")
                : ""}
            </DialogDescription>
          </DialogHeader>
          {historyDetailRun ? (
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {historyDetailRun.error_message ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {historyDetailRun.error_message}
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Template</p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {historyDetailRun.message_template || "—"}
                </p>
              </div>
              {(historyDetailRun.summary as { results_truncated?: boolean } | null)?.results_truncated ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Lista de contatos truncada no armazenamento (campanha muito grande).
                </p>
              ) : null}
              {parseHistoryResults(historyDetailRun.results).length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Por contato
                  </p>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
                    {parseHistoryResults(historyDetailRun.results).map((item) => (
                      <div
                        key={`${historyDetailRun.id}-${item.index}-${item.phone}`}
                        className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div>
                            {item.name || "Sem nome"} — {item.phone}
                          </div>
                          {!item.ok && item.error ? (
                            <p className="mt-0.5 break-all text-muted-foreground">{item.error}</p>
                          ) : null}
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            item.ok ? "shrink-0 bg-emerald-100 text-emerald-800" : "shrink-0 bg-red-100 text-red-800"
                          }
                        >
                          {item.ok ? "Enviado" : "Falhou"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : historyDetailRun.status === "completed" ? (
                <p className="text-xs text-muted-foreground">Sem lista de contatos neste registro.</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="border-t px-6 py-3">
            <Button type="button" variant="secondary" onClick={() => setHistoryDetailRun(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar disparo financeiro</DialogTitle>
            <DialogDescription>
              Selecione template, agente e configuracao de atraso para evitar bloqueio no WhatsApp. Se o agente tiver
              WAHA (<code className="rounded bg-muted px-1">waha_url</code> + <code className="rounded bg-muted px-1">waha_api_key</code>
              ), o envio usa <strong>WAHA</strong>; caso contrario, usa Chatwoot com as configuracoes ja salvas no agente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Template</p>
                <Select value={templateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o template" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Agente / Caixa de entrada</p>
                <Select value={selectedAgentId} onValueChange={handleAgentChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Mensagem da campanha</p>
              <Textarea
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                className="min-h-28"
              />
              <p className="text-xs text-muted-foreground">Variaveis disponiveis: {"{nome}"}, {"{valor}"}, {"{vencimento}"}.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Atraso minimo (seg)</p>
                <Input
                  type="number"
                  min={0}
                  value={delayMinSec}
                  onChange={(event) => setDelayMinSec(Number(event.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Atraso maximo (seg)</p>
                <Input
                  type="number"
                  min={0}
                  value={delayMaxSec}
                  onChange={(event) => setDelayMaxSec(Number(event.target.value) || 0)}
                />
              </div>
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-sm">
              Delay por mensagem: <strong>{Math.max(0, delayMinSec)}s - {Math.max(delayMinSec, delayMaxSec)}s</strong>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Preview da mensagem</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{previewMessage || "Sem preview disponivel."}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSendCampaign()} disabled={submitting || Boolean(activeJobId)}>
              {submitting ? "Enviando..." : activeJobId ? "Campanha em andamento" : "Iniciar disparo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
