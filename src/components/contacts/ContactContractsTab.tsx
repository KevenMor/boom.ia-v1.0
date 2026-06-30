import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ScrollText, Pencil, Trash2, ExternalLink } from "lucide-react";
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
} from "@/hooks/useContacts";
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contracts?.length ? `${contracts.length} contrato(s)` : "Nenhum contrato"}
        </p>
        <Button size="sm" onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo contrato
        </Button>
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
            <ContractCard key={c.id} contract={c} onEdit={() => handleEdit(c)} onDelete={() => setDeleteId(c.id)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
          <ScrollText className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum contrato cadastrado</p>
          <Button variant="outline" size="sm" onClick={handleOpenNew}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar contrato
          </Button>
        </div>
      )}

      <CreateContractDialog
        contactId={contactId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
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
}: {
  contract: ContactContract;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">{contract.title}</p>
          {contract.contract_number && (
            <p className="text-xs text-muted-foreground">Nº {contract.contract_number}</p>
          )}
        </div>
        <Badge className={`text-xs border-0 ${STATUS_CLASS[contract.status]}`}>
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
        <p className="text-xs text-muted-foreground line-clamp-2">{contract.payment_terms}</p>
      )}
      <div className="flex items-center justify-end gap-1 pt-1">
        {contract.document_url && (
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={contract.document_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
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
