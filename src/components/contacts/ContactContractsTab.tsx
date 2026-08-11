import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ScrollText, Pencil, Trash2, ExternalLink, Eye, Copy, Check, Printer, FileSignature, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useContactContracts,
  useCreateContactContract,
  useUpdateContactContract,
  useDeleteContactContract,
  useContractTemplates,
  useGenerateContactContract,
  useContact,
  useUpdateContact,
} from "@/hooks/useContacts";
import { useTenantContext } from "@/contexts/TenantContext";
import type { ContactContract, ContactContractStatus } from "@/types/database";
import { toast } from "sonner";

const STATUS_LABELS: Record<ContactContractStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  expired: "Expirado",
  cancelled: "Cancelado",
  suspended: "Suspenso",
};

const STATUS_CLASS: Record<ContactContractStatus, string> = {
  draft: "bg-slate-500/15 text-slate-600",
  active: "bg-emerald-500/15 text-emerald-600",
  expired: "bg-amber-500/15 text-amber-600",
  cancelled: "bg-red-500/15 text-red-600",
  suspended: "bg-orange-500/15 text-orange-600",
};

const schema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  contract_number: z.string().optional(),
  status: z.enum(["draft", "active", "expired", "cancelled", "suspended"]).default("draft"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  value: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  payment_terms: z.string().optional(),
  description: z.string().optional(),
  document_url: z.string().optional(),
}).refine((d) => {
  if (d.start_date && d.end_date && d.end_date < d.start_date) return false;
  return true;
}, { message: "Data de término deve ser posterior ao início", path: ["end_date"] });

type FormData = z.infer<typeof schema>;

function formatBRL(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

interface Props {
  contactId: string;
}

export function ContactContractsTab({ contactId }: Props) {
  const { data: contracts, isLoading } = useContactContracts(contactId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewTitle, setViewTitle] = useState<string>("");
  const [editing, setEditing] = useState<ContactContract | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteContract = useDeleteContactContract(contactId);

  const handleOpenNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (c: ContactContract) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteContract.mutate(deleteId, {
      onSuccess: () => { toast.success("Contrato removido"); setDeleteId(null); },
      onError: () => toast.error("Erro ao remover contrato"),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {contracts?.length ? `${contracts.length} contrato(s)` : "Nenhum contrato"}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)} className="h-8 text-xs">
            <ScrollText className="h-3.5 w-3.5 mr-1" /> Gerar de modelo
          </Button>
          <Button size="sm" onClick={handleOpenNew} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo manual
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : contracts && contracts.length > 0 ? (
        <div className="space-y-3">
          {contracts.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              onEdit={() => handleEdit(c)}
              onDelete={() => setDeleteId(c.id)}
              onViewContent={(title, content) => {
                setViewTitle(title);
                setViewContent(content);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
          <ScrollText className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum contrato cadastrado</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
              <ScrollText className="h-4 w-4 mr-1" /> Gerar de modelo
            </Button>
            <Button size="sm" onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar manual
            </Button>
          </div>
        </div>
      )}

      <CreateContractDialog
        contactId={contactId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <GenerateContractDialog
        contactId={contactId}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
      />

      <ViewContractContentDialog
        contactId={contactId}
        title={viewTitle}
        content={viewContent}
        open={!!viewContent}
        onOpenChange={(open) => !open && setViewContent(null)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contrato?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContractCard({
  contract,
  onEdit,
  onDelete,
  onViewContent,
}: {
  contract: ContactContract;
  onEdit: () => void;
  onDelete: () => void;
  onViewContent: (title: string, content: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground">{contract.title}</p>
          {contract.contract_number && (
            <p className="text-xs text-muted-foreground font-mono">Nº {contract.contract_number}</p>
          )}
        </div>
        <Badge className={`text-xs border-0 font-medium ${STATUS_CLASS[contract.status]}`}>
          {STATUS_LABELS[contract.status]}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {formatBRL(contract.value) && <span className="font-medium text-foreground">{formatBRL(contract.value)}</span>}
        {(contract.start_date || contract.end_date) && (
          <span>{formatDate(contract.start_date) ?? "?"} — {formatDate(contract.end_date) ?? "indeterminado"}</span>
        )}
      </div>
      {contract.payment_terms && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{contract.payment_terms}</p>
      )}
      <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/40">
        {contract.content && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
            onClick={() => onViewContent(contract.title, contract.content!)}
            title="Visualizar texto do contrato"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {contract.document_url && (
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="Abrir link do documento">
            <a href={contract.document_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CreateContractDialog({
  contactId,
  open,
  onOpenChange,
  editing,
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ContactContract | null;
}) {
  const createContract = useCreateContactContract(contactId);
  const updateContract = useUpdateContactContract(contactId);
  const isEditing = !!editing;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: editing?.title ?? "",
      contract_number: editing?.contract_number ?? "",
      status: editing?.status ?? "draft",
      start_date: editing?.start_date ?? "",
      end_date: editing?.end_date ?? "",
      value: editing?.value != null ? editing.value : "",
      payment_terms: editing?.payment_terms ?? "",
      description: editing?.description ?? "",
      document_url: editing?.document_url ?? "",
    },
  });

  const status = watch("status");

  useEffect(() => {
    if (!open) return;
    reset({
      title: editing?.title ?? "",
      contract_number: editing?.contract_number ?? "",
      status: editing?.status ?? "draft",
      start_date: editing?.start_date ?? "",
      end_date: editing?.end_date ?? "",
      value: editing?.value != null ? editing.value : "",
      payment_terms: editing?.payment_terms ?? "",
      description: editing?.description ?? "",
      document_url: editing?.document_url ?? "",
    });
  }, [open, editing, reset]);

  const onSubmit = (values: FormData) => {
    const payload = {
      title: values.title,
      contract_number: values.contract_number || null,
      status: values.status,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      value: values.value !== "" ? Number(values.value) : null,
      payment_terms: values.payment_terms || null,
      description: values.description || null,
      document_url: values.document_url?.trim() || null,
    };

    if (isEditing) {
      updateContract.mutate(
        { contractId: editing!.id, ...payload },
        {
          onSuccess: () => { toast.success("Contrato atualizado"); onOpenChange(false); reset(); },
          onError: () => toast.error("Erro ao atualizar contrato"),
        }
      );
    } else {
      createContract.mutate(payload, {
        onSuccess: () => { toast.success("Contrato criado"); onOpenChange(false); reset(); },
        onError: () => toast.error("Erro ao criar contrato"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar contrato" : "Novo contrato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input {...register("title")} placeholder="Hospedagem anual, pacote corporativo..." />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Número do contrato</Label>
              <Input {...register("contract_number")} placeholder="CTR-2026-001" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as FormData["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as ContactContractStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" {...register("start_date")} />
            </div>
            <div className="space-y-2">
              <Label>Término</Label>
              <Input type="date" {...register("end_date")} />
              {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" min="0" {...register("value")} placeholder="0,00" />
          </div>
          <div className="space-y-2">
            <Label>Condições de pagamento</Label>
            <Input {...register("payment_terms")} placeholder="40% entrada, restante em 3x..." />
          </div>
          <div className="space-y-2">
            <Label>URL do documento assinado (PDF)</Label>
            <Input {...register("document_url")} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Descrição / observações</Label>
            <Textarea {...register("description")} rows={3} className="resize-none" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createContract.isPending || updateContract.isPending}>
              {isEditing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CONTACT_FIELD_MAP: Record<string, { label: string; key: string }> = {
  nome: { label: "Nome completo do cliente", key: "name" },
  nome_cliente: { label: "Nome completo do cliente", key: "name" },
  email: { label: "E-mail do cliente", key: "email" },
  telefone: { label: "Telefone do cliente", key: "phone" },
  phone: { label: "Telefone do cliente", key: "phone" },
  cpf_cnpj: { label: "CPF/CNPJ do cliente", key: "cpf_cnpj" },
  cpf: { label: "CPF/CNPJ do cliente", key: "cpf_cnpj" },
  cnpj: { label: "CPF/CNPJ do cliente", key: "cpf_cnpj" },
  documento: { label: "CPF/CNPJ do cliente", key: "cpf_cnpj" },
  endereco: { label: "Endereço completo", key: "address" },
  address: { label: "Endereço completo", key: "address" },
  cidade: { label: "Cidade", key: "city" },
  city: { label: "Cidade", key: "city" },
  estado: { label: "Estado/UF", key: "state" },
  state: { label: "Estado/UF", key: "state" },
  uf: { label: "Estado/UF", key: "state" },
  cep: { label: "CEP", key: "zip_code" },
  zip_code: { label: "CEP", key: "zip_code" },
};

const CONTRACT_FIELD_MAP: Record<string, { label: string; key: string; type: string }> = {
  valor: { label: "Valor do contrato (R$)", key: "value", type: "number" },
  valor_contrato: { label: "Valor do contrato (R$)", key: "value", type: "number" },
  valor_total: { label: "Valor do contrato (R$)", key: "value", type: "number" },
  forma_pagamento: { label: "Condições de pagamento", key: "payment_terms", type: "text" },
  condicoes_pagamento: { label: "Condições de pagamento", key: "payment_terms", type: "text" },
  pagamento: { label: "Condições de pagamento", key: "payment_terms", type: "text" },
  numero_contrato: { label: "Número do contrato", key: "contract_number", type: "text" },
  contrato_numero: { label: "Número do contrato", key: "contract_number", type: "text" },
  data_inicio: { label: "Data de início", key: "start_date", type: "date" },
  inicio: { label: "Data de início", key: "start_date", type: "date" },
  data_termino: { label: "Data de término", key: "end_date", type: "date" },
  termino: { label: "Data de término", key: "end_date", type: "date" },
};

const extractPlaceholders = (text: string): string[] => {
  const regex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  const matches = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1].toLowerCase());
  }
  return Array.from(matches);
};

const getFieldIcon = (key: string) => {
  switch (key) {
    case "name": return <User className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "email": return <Mail className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "phone": return <Phone className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "cpf_cnpj": return <CreditCard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "address": return <MapPin className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "city": return <Building2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "state": return <Globe className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "zip_code": return <Navigation className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "value": return <DollarSign className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "payment_terms": return <CreditCard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "contract_number": return <Hash className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "start_date":
    case "end_date": return <Calendar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    default: return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

function GenerateContractDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { selectedTenantId } = useTenantContext();
  const { data: templates } = useContractTemplates(selectedTenantId);
  const { data: contact } = useContact(contactId);
  const updateContact = useUpdateContact();
  const generateContract = useGenerateContactContract(contactId);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  const [contractValues, setContractValues] = useState({
    value: "",
    payment_terms: "",
    contract_number: "",
    start_date: "",
    end_date: "",
  });

  const [contactValues, setContactValues] = useState({
    name: "",
    email: "",
    phone: "",
    cpf_cnpj: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
  });

  const [previewText, setPreviewText] = useState<string>("");

  const templatesList = templates ?? [];
  const template = templatesList.find((t) => t.id === selectedTemplateId);

  // Preencher dados do contato quando ele abrir
  useEffect(() => {
    if (contact) {
      setContactValues({
        name: contact.name || "",
        email: contact.email || "",
        phone: contact.phone || "",
        cpf_cnpj: contact.cpf_cnpj || "",
        address: contact.address || "",
        city: contact.city || "",
        state: contact.state || "",
        zip_code: contact.zip_code || "",
      });
    }
  }, [contact, open]);

  // Limpar formulário ao fechar/abrir
  useEffect(() => {
    if (!open) {
      setSelectedTemplateId("");
      setPreviewText("");
      setContractValues({
        value: "",
        payment_terms: "",
        contract_number: "",
        start_date: "",
        end_date: "",
      });
    }
  }, [open]);

  // Analisa dinamicamente quais variáveis são necessárias
  const requiredContactFields = useMemo(() => {
    if (!template) return [];
    const fields = new Map<string, { label: string; key: string }>();
    const placeholders = extractPlaceholders(template.content);
    for (const p of placeholders) {
      const mapping = CONTACT_FIELD_MAP[p];
      if (mapping && !fields.has(mapping.key)) {
        fields.set(mapping.key, mapping);
      }
    }
    return Array.from(fields.values());
  }, [template]);

  const requiredContractFields = useMemo(() => {
    if (!template) return [];
    const fields = new Map<string, { label: string; key: string; type: string }>();
    const placeholders = extractPlaceholders(template.content);
    for (const p of placeholders) {
      const mapping = CONTRACT_FIELD_MAP[p];
      if (mapping && !fields.has(mapping.key)) {
        fields.set(mapping.key, mapping);
      }
    }
    return Array.from(fields.values());
  }, [template]);

  // Gera pré-visualização dinâmica
  useEffect(() => {
    if (!template) {
      setPreviewText("");
      return;
    }

    const valNum = Number(contractValues.value);
    const formattedValue = valNum && !isNaN(valNum)
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valNum)
      : "";

    const formatDateStr = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split("-");
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateStr;
    };

    let text = template.content;
    const replacements: Record<string, string> = {
      nome: contactValues.name || "",
      nome_cliente: contactValues.name || "",
      email: contactValues.email || "",
      telefone: contactValues.phone || "",
      phone: contactValues.phone || "",
      cpf_cnpj: contactValues.cpf_cnpj || "",
      cpf: contactValues.cpf_cnpj || "",
      cnpj: contactValues.cpf_cnpj || "",
      documento: contactValues.cpf_cnpj || "",
      endereco: contactValues.address || "",
      address: contactValues.address || "",
      cidade: contactValues.city || "",
      city: contactValues.city || "",
      estado: contactValues.state || "",
      state: contactValues.state || "",
      uf: contactValues.state || "",
      cep: contactValues.zip_code || "",
      zip_code: contactValues.zip_code || "",
      data: new Date().toLocaleDateString("pt-BR"),
      data_extenso: new Date().toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }),
      // Campos específicos do contrato
      valor: formattedValue,
      valor_contrato: formattedValue,
      valor_total: formattedValue,
      forma_pagamento: contractValues.payment_terms,
      condicoes_pagamento: contractValues.payment_terms,
      pagamento: contractValues.payment_terms,
      numero_contrato: contractValues.contract_number,
      contrato_numero: contractValues.contract_number,
      data_inicio: formatDateStr(contractValues.start_date),
      inicio: formatDateStr(contractValues.start_date),
      data_termino: formatDateStr(contractValues.end_date),
      termino: formatDateStr(contractValues.end_date),
    };

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
      text = text.replace(regex, value);
    }
    setPreviewText(text);
  }, [template, contactValues, contractValues, templatesList]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) return;

    // 1. Atualizar silenciosamente o contato no banco de dados para sincronizar os campos
    updateContact.mutate(
      {
        id: contactId,
        name: contactValues.name,
        email: contactValues.email,
        phone: contactValues.phone,
        cpf_cnpj: contactValues.cpf_cnpj,
        address: contactValues.address,
        city: contactValues.city,
        state: contactValues.state,
        zip_code: contactValues.zip_code,
      },
      {
        onSuccess: () => {
          // 2. Gerar o contrato enviando as variáveis do contrato
          generateContract.mutate(
            {
              template_id: selectedTemplateId,
              contract_number: contractValues.contract_number || undefined,
              value: contractValues.value ? Number(contractValues.value) : undefined,
              payment_terms: contractValues.payment_terms || undefined,
              start_date: contractValues.start_date || undefined,
              end_date: contractValues.end_date || undefined,
            },
            {
              onSuccess: () => {
                toast.success("Contrato gerado com sucesso!");
                onOpenChange(false);
              },
              onError: (err: any) => {
                toast.error("Erro ao gerar contrato: " + err.message);
              },
            }
          );
        },
        onError: (err: any) => {
          toast.error("Erro ao atualizar dados do cliente: " + err.message);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl md:max-w-6xl w-[95vw] max-h-[90vh] h-[85vh] p-0 overflow-hidden flex flex-col rounded-xl border border-border/40 shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold tracking-tight">Gerador de Contrato Digital</DialogTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Preencha as variáveis e gere o documento final instantaneamente</p>
              </div>
            </div>
          </div>

          {/* Main Content Split */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 bg-muted/10">
            
            {/* Left Panel: Form Settings */}
            <div className="md:col-span-5 border-r border-border/40 overflow-y-auto p-6 space-y-6 bg-background dark:bg-slate-900/10">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Modelo Base *</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="h-10 text-xs border-border/60 shadow-sm focus:ring-indigo-500/20">
                    <SelectValue placeholder="Selecione um modelo de contrato..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesList.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {template ? (
                <div className="space-y-6">
                  {/* Dados do Contrato */}
                  {requiredContractFields.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-indigo-500" />
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Dados do Contrato</h3>
                      </div>
                      <div className="space-y-3">
                        {requiredContractFields.map((f) => (
                          <div key={f.key} className="space-y-1.5">
                            <Label className="text-[11px] font-medium text-muted-foreground">{f.label} *</Label>
                            <div className="relative rounded-md shadow-sm">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                {getFieldIcon(f.key)}
                              </div>
                              <Input
                                type={f.type}
                                value={contractValues[f.key as keyof typeof contractValues]}
                                onChange={(e) => setContractValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                                required
                                className="h-9 pl-9 text-xs border-border/60 shadow-sm focus-visible:ring-indigo-500/20"
                                placeholder={f.key === "value" ? "Ex: 1500" : ""}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cadastro do Cliente */}
                  {requiredContactFields.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-indigo-500" />
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Cadastro do Cliente</h3>
                      </div>
                      <div className="space-y-3">
                        {requiredContactFields.map((f) => (
                          <div key={f.key} className="space-y-1.5">
                            <Label className="text-[11px] font-medium text-muted-foreground">{f.label} *</Label>
                            <div className="relative rounded-md shadow-sm">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                {getFieldIcon(f.key)}
                              </div>
                              <Input
                                value={contactValues[f.key as keyof typeof contactValues]}
                                onChange={(e) => setContactValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                                required
                                className="h-9 pl-9 text-xs border-amber-200 focus-visible:ring-amber-300 dark:border-amber-900/40 bg-amber-50/10"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground bg-muted/20 border border-dashed rounded-lg p-6">
                  <ScrollText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-[11px] font-medium">Selecione um modelo de contrato para preencher as variáveis do documento.</p>
                </div>
              )}
            </div>

            {/* Right Panel: A4 Live Document Preview */}
            <div className="md:col-span-7 bg-slate-100 dark:bg-slate-950 p-6 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2 shrink-0">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Visualização do Documento
                </span>
                <span className="text-[9px] text-muted-foreground uppercase bg-white dark:bg-slate-900 px-2 py-0.5 rounded shadow-sm border border-border/40">Modo A4 Timbrado</span>
              </div>
              <div className="flex-1 bg-white text-black p-8 sm:p-12 rounded-lg shadow-lg border border-border/30 overflow-y-auto select-text font-serif leading-relaxed text-justify max-w-[800px] mx-auto w-full">
                {previewText ? (
                  <div
                    className="text-[11px] text-gray-800"
                    dangerouslySetInnerHTML={{ __html: previewText }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20 text-muted-foreground font-sans">
                    <FileText className="h-10 w-10 text-muted-foreground/30 mb-2 animate-bounce" />
                    <p className="text-xs">Aguardando seleção do modelo base...</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-border/50 bg-background flex items-center justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9 px-4 text-xs font-medium">
              Cancelar
            </Button>
            <Button 
              type="submit" 
              size="sm" 
              disabled={!selectedTemplateId || generateContract.isPending || updateContact.isPending}
              className="h-9 px-4 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700"
            >
              {generateContract.isPending || updateContact.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Processando...
                </>
              ) : (
                "Gerar e Salvar Contrato"
              )}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewContractContentDialog({
  contactId,
  title,
  content,
  open,
  onOpenChange,
}: {
  contactId: string;
  title: string;
  content: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { selectedTenant } = useTenantContext();
  const { data: contact } = useContact(contactId);
  const [copied, setCopied] = useState(false);

  const logoUrl = (selectedTenant?.settings as any)?.logo_url || null;

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Texto do contrato copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 border-none p-0 sm:p-6">
        <DialogHeader className="flex flex-row items-center justify-between px-6 pt-6 sm:px-0 sm:pt-0 border-b border-border/50 pb-3 print-hide">
          <DialogTitle className="text-sm font-semibold truncate max-w-[50%]">{title}</DialogTitle>
          <div className="flex items-center gap-2">
            {content && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir / PDF
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </>
            )}
          </div>
        </DialogHeader>
        
        {/* Folha Timbrada do Contrato */}
        <div 
          id="print-contract-document" 
          className="my-4 mx-auto max-w-[800px] bg-white text-black p-8 sm:p-16 border border-gray-200 shadow-sm rounded-md font-sans"
        >
          {/* Cabeçalho */}
          <div className="text-center mb-8 border-b border-gray-100 pb-6 flex flex-col items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-h-16 w-auto object-contain" />
            ) : (
              <div className="h-10 w-10 rounded bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                {selectedTenant?.name?.substring(0, 2).toUpperCase() || "CN"}
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{selectedTenant?.name}</p>
              {(selectedTenant?.settings as any)?.cnpj && (
                <p className="text-[10px] text-gray-400 mt-0.5">CNPJ: {(selectedTenant?.settings as any).cnpj}</p>
              )}
            </div>
          </div>

          {/* Título */}
          <h2 className="text-base font-bold uppercase text-center mb-8 tracking-wide text-gray-900 border-b border-gray-100 pb-2">
            {title}
          </h2>

          {/* Corpo do Contrato */}
          <div 
            className="text-xs leading-relaxed text-gray-800 text-justify font-serif px-2 select-text"
            dangerouslySetInnerHTML={{ __html: content || "Nenhum texto associado a este contrato." }}
          />

          {/* Bloco de Assinaturas */}
          {content && (
            <div className="mt-16 pt-12 border-t border-gray-100 grid grid-cols-2 gap-8 text-center text-[10px] print:mt-24">
              <div className="flex flex-col items-center">
                <div className="border-t border-gray-300 w-40 pt-1.5" />
                <p className="font-bold text-gray-900 uppercase">{selectedTenant?.name || "CONTRATANTE"}</p>
                <p className="text-[9px] text-gray-500">Contratante</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="border-t border-gray-300 w-40 pt-1.5" />
                <p className="font-bold text-gray-900 uppercase">{contact?.name || "CONTRATADO"}</p>
                <p className="text-[9px] text-gray-500">Contratado</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 sm:px-0 sm:pb-0 pt-3 border-t border-border/50 print-hide">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
