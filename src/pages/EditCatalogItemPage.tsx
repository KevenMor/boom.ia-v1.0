import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Save,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { buildCatalogRagPreviewText } from "@/lib/catalog-rag-preview";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCatalogCategories,
  useCatalogItem,
  useCatalogItemLinks,
  useCatalogItemsList,
  useDeleteCatalogItem,
  useProfessionalsList,
} from "@/hooks/useServiceCatalog";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import type { CatalogAttendanceType, CatalogItemStatus, CatalogItemType } from "@/types/database";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const PAYMENT_OPTIONS = [
  { id: "pix", label: "PIX" },
  { id: "credit_card", label: "Cartão de crédito" },
  { id: "debit_card", label: "Cartão de débito" },
  { id: "boleto", label: "Boleto" },
  { id: "cash", label: "Dinheiro" },
] as const;

const WEEKDAYS: { d: number; label: string }[] = [
  { d: 0, label: "Dom" },
  { d: 1, label: "Seg" },
  { d: 2, label: "Ter" },
  { d: 3, label: "Qua" },
  { d: 4, label: "Qui" },
  { d: 5, label: "Sex" },
  { d: 6, label: "Sáb" },
];

function parseOptionalNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function FormSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-medium hover:bg-muted/40 rounded-t-xl">
        <span>{title}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t px-4 py-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function EditCatalogItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedTenantId } = useTenantContext();
  const { isSuperAdmin, isTenantAdmin } = useAuth();
  const canManage = isSuperAdmin || isTenantAdmin(selectedTenantId);
  const isNew = itemId === "new";

  const { data: row, isLoading: rowLoading } = useCatalogItem(itemId, selectedTenantId);
  const { data: links, isLoading: linksLoading } = useCatalogItemLinks(isNew ? undefined : itemId);
  const { data: categories } = useCatalogCategories(selectedTenantId);
  const { data: professionals } = useProfessionalsList(selectedTenantId);
  const { data: allItems } = useCatalogItemsList({
    tenantId: selectedTenantId,
    sort: "name_asc",
    status: "all",
    itemType: "all",
  });

  const deleteItem = useDeleteCatalogItem();

  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<CatalogItemType>("service");
  const [categoryId, setCategoryId] = useState<string>("");
  const [status, setStatus] = useState<CatalogItemStatus>("active");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [faqText, setFaqText] = useState("");
  const [priceStandard, setPriceStandard] = useState("");
  const [pricePromo, setPricePromo] = useState("");
  const [promoUntil, setPromoUntil] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [maxInstallments, setMaxInstallments] = useState("");
  const [installmentNote, setInstallmentNote] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [bufferAfter, setBufferAfter] = useState("");
  const [attendanceType, setAttendanceType] = useState<CatalogAttendanceType | "">("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [resourceRequired, setResourceRequired] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [prerequisites, setPrerequisites] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [selProfessionals, setSelProfessionals] = useState<string[]>([]);
  const [defaultProfessionalId, setDefaultProfessionalId] = useState<string>("");
  const [relatedIds, setRelatedIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const applyRow = useCallback(() => {
    if (!row) return;
    setName(row.name ?? "");
    setItemType(row.item_type ?? "service");
    setCategoryId(row.category_id ?? "");
    setStatus(row.status ?? "active");
    setImageUrl(row.image_url ?? "");
    setDescription(row.description ?? "");
    setFaqText(row.faq_text ?? "");
    setPriceStandard(row.price_standard != null ? String(row.price_standard) : "");
    setPricePromo(row.price_promo != null ? String(row.price_promo) : "");
    setPromoUntil(row.promo_valid_until ?? "");
    setPaymentMethods(Array.isArray(row.payment_methods) ? [...row.payment_methods] : []);
    setMaxInstallments(row.max_installments != null ? String(row.max_installments) : "");
    setInstallmentNote(row.installment_note ?? "");
    setCancellationPolicy(row.cancellation_policy ?? "");
    setDurationMinutes(row.duration_minutes != null ? String(row.duration_minutes) : "");
    setBufferAfter(row.buffer_after_minutes != null ? String(row.buffer_after_minutes) : "");
    setAttendanceType(row.attendance_type ?? "");
    setMaxCapacity(row.max_capacity != null ? String(row.max_capacity) : "");
    setResourceRequired(row.resource_required ?? "");
    setWeekdays(Array.isArray(row.available_weekdays) ? [...row.available_weekdays] : []);
    setPrerequisites(row.prerequisites ?? "");
    setTargetAudience(row.target_audience ?? "");
  }, [row]);

  useEffect(() => {
    if (row) applyRow();
  }, [row, applyRow]);

  useEffect(() => {
    if (!links || isNew) return;
    const pids = links.professionals.map((x) => x.professional_id);
    setSelProfessionals(pids);
    const def = links.professionals.find((x) => x.is_default);
    setDefaultProfessionalId(def?.professional_id ?? "");
    setRelatedIds(links.related.map((x) => x.related_catalog_item_id));
  }, [links, isNew]);

  const categoryName = useMemo(() => {
    const c = categories?.find((x) => x.id === categoryId);
    return c?.name ?? row?.catalog_categories?.name ?? null;
  }, [categories, categoryId, row]);

  const professionalNames = useMemo(() => {
    const map = new Map((professionals ?? []).map((p) => [p.id, p.full_name]));
    return selProfessionals.map((id) => map.get(id) ?? id);
  }, [professionals, selProfessionals]);

  const previewText = useMemo(
    () =>
      buildCatalogRagPreviewText(
        {
          name,
          item_type: itemType,
          status,
          description,
          faq_text: faqText,
          price_standard: parseOptionalNumber(priceStandard),
          price_promo: parseOptionalNumber(pricePromo),
          promo_valid_until: promoUntil || null,
          payment_methods: paymentMethods,
          max_installments: parseOptionalInt(maxInstallments),
          installment_note: installmentNote,
          cancellation_policy: cancellationPolicy,
          duration_minutes: parseOptionalInt(durationMinutes),
          buffer_after_minutes: parseOptionalInt(bufferAfter),
          attendance_type: attendanceType || null,
          max_capacity: parseOptionalInt(maxCapacity),
          resource_required: resourceRequired,
          available_weekdays: weekdays.length ? weekdays : null,
          prerequisites,
          target_audience: targetAudience,
          category_name: categoryName,
        },
        { professional_names: professionalNames }
      ),
    [
      name,
      itemType,
      status,
      description,
      faqText,
      priceStandard,
      pricePromo,
      promoUntil,
      paymentMethods,
      maxInstallments,
      installmentNote,
      cancellationPolicy,
      durationMinutes,
      bufferAfter,
      attendanceType,
      maxCapacity,
      resourceRequired,
      weekdays,
      prerequisites,
      targetAudience,
      categoryName,
      professionalNames,
    ]
  );

  const criticalEmpty = !name.trim() || !description.trim();

  const togglePayment = (id: string, checked: boolean) => {
    setPaymentMethods((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const toggleWeekday = (d: number, checked: boolean) => {
    setWeekdays((prev) => (checked ? [...new Set([...prev, d])].sort((a, b) => a - b) : prev.filter((x) => x !== d)));
  };

  const toggleProfessional = (id: string, checked: boolean) => {
    setSelProfessionals((prev) => {
      const next = checked ? [...prev, id] : prev.filter((x) => x !== id);
      if (defaultProfessionalId && !next.includes(defaultProfessionalId)) {
        setDefaultProfessionalId("");
      }
      return next;
    });
  };

  const toggleRelated = (id: string, checked: boolean) => {
    setRelatedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const onSave = async () => {
    if (!selectedTenantId || !canManage) return;
    if (!name.trim()) {
      toast.error("Informe o nome do item.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: selectedTenantId,
        name: name.trim(),
        item_type: itemType,
        category_id: categoryId || null,
        status,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
        faq_text: faqText.trim() || null,
        price_standard: parseOptionalNumber(priceStandard),
        price_promo: parseOptionalNumber(pricePromo),
        promo_valid_until: promoUntil.trim() || null,
        payment_methods: paymentMethods,
        max_installments: parseOptionalInt(maxInstallments),
        installment_note: installmentNote.trim() || null,
        cancellation_policy: cancellationPolicy.trim() || null,
        duration_minutes: parseOptionalInt(durationMinutes),
        buffer_after_minutes: parseOptionalInt(bufferAfter),
        attendance_type: attendanceType || null,
        max_capacity: parseOptionalInt(maxCapacity),
        resource_required: resourceRequired.trim() || null,
        available_weekdays: weekdays.length ? weekdays : null,
        prerequisites: prerequisites.trim() || null,
        target_audience: targetAudience.trim() || null,
        rag_sync_status: "pending" as const,
        rag_last_error: null,
      };

      let id = itemId!;
      if (isNew) {
        const { data, error } = await nexusDb.from("catalog_items").insert(payload).select("id").single();
        if (error) throw error;
        id = (data as { id: string }).id;
      } else {
        const { error } = await nexusDb.from("catalog_items").update(payload).eq("id", itemId!);
        if (error) throw error;
      }

      await nexusDb.from("catalog_item_professionals").delete().eq("catalog_item_id", id);
      if (selProfessionals.length) {
        let defId = defaultProfessionalId;
        if (!defId || !selProfessionals.includes(defId)) {
          defId = selProfessionals[0] ?? "";
        }
        const rows = selProfessionals.map((professional_id) => ({
          catalog_item_id: id,
          professional_id,
          is_default: professional_id === defId,
        }));
        const { error: e2 } = await nexusDb.from("catalog_item_professionals").insert(rows);
        if (e2) throw e2;
      }

      await nexusDb.from("catalog_item_related").delete().eq("catalog_item_id", id);
      if (relatedIds.length) {
        const relRows = relatedIds.map((related_catalog_item_id, sort_order) => ({
          catalog_item_id: id,
          related_catalog_item_id,
          sort_order,
        }));
        const { error: e3 } = await nexusDb.from("catalog_item_related").insert(relRows);
        if (e3) throw e3;
      }

      toast.success(isNew ? "Item criado" : "Item atualizado");
      void qc.invalidateQueries({ queryKey: ["catalog_items"] });
      void qc.invalidateQueries({ queryKey: ["catalog_item"] });
      void qc.invalidateQueries({ queryKey: ["catalog_item_links"] });
      if (isNew) {
        navigate(`/catalog/items/${id}`, { replace: true });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const onCreateCategory = async () => {
    if (!selectedTenantId || !newCatName.trim()) return;
    const { data, error } = await nexusDb
      .from("catalog_categories")
      .insert({ tenant_id: selectedTenantId, name: newCatName.trim(), sort_order: 0 })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setCategoryId((data as { id: string }).id);
    setNewCatName("");
    setCatDialogOpen(false);
    void qc.invalidateQueries({ queryKey: ["catalog_categories", selectedTenantId] });
    toast.success("Categoria criada");
  };

  const onDelete = async () => {
    if (!itemId || isNew) return;
    try {
      await deleteItem.mutateAsync(itemId);
      toast.success("Item removido");
      navigate("/catalog");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
    setDeleteOpen(false);
  };

  if (!selectedTenantId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Selecione um tenant.
      </div>
    );
  }

  if (!isNew && (rowLoading || linksLoading)) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando…
      </div>
    );
  }

  if (!isNew && !row) {
    return (
      <div className="space-y-4 text-center py-16">
        <p className="text-muted-foreground">Item não encontrado.</p>
        <Button asChild variant="outline">
          <Link to="/catalog">Voltar ao catálogo</Link>
        </Button>
      </div>
    );
  }

  const relatedOptions = (allItems ?? []).filter((i) => i.id !== itemId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Painel</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/catalog">Catálogo</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{isNew ? "Novo item" : "Editar item"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/catalog" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight flex-1 min-w-0 truncate">
          {isNew ? "Novo item" : name || "Editar item"}
        </h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Button>
            )}
            <Button size="sm" className="gap-2" disabled={saving} onClick={() => void onSave()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        )}
      </div>

      {!canManage && (
        <p className="text-sm text-muted-foreground rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          Apenas administradores do tenant podem editar. Você pode visualizar os dados abaixo.
        </p>
      )}

      {criticalEmpty && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Campos importantes para o agente estão vazios: <strong>nome</strong> e/ou{" "}
            <strong>descrição</strong>. O RAG e as respostas ficarão pobres até preencher.
          </span>
        </div>
      )}

      <div className="space-y-4">
        <FormSection title="1. Identidade">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome do item</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={itemType} onValueChange={(v) => setItemType(v as CatalogItemType)} disabled={!canManage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Serviço</SelectItem>
                  <SelectItem value="product">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CatalogItemStatus)} disabled={!canManage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="coming_soon">Em breve</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label>Categoria</Label>
                <Select value={categoryId || "__none__"} onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)} disabled={!canManage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canManage && (
                <Button type="button" variant="outline" size="sm" onClick={() => setCatDialogOpen(true)}>
                  Nova categoria
                </Button>
              )}
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>URL da imagem</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={!canManage} placeholder="https://..." />
            </div>
          </div>
        </FormSection>

        <FormSection title="2. Descrição (RAG / atendimento)">
          <div className="space-y-1">
            <Label>Descrição do item</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} rows={6} />
          </div>
          <div className="space-y-1">
            <Label>Perguntas frequentes</Label>
            <Textarea value={faqText} onChange={(e) => setFaqText(e.target.value)} disabled={!canManage} rows={5} />
          </div>
        </FormSection>

        <FormSection title="3. Comercial">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Preço padrão (R$)</Label>
              <Input value={priceStandard} onChange={(e) => setPriceStandard(e.target.value)} disabled={!canManage} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Preço promocional</Label>
              <Input value={pricePromo} onChange={(e) => setPricePromo(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Validade da promoção</Label>
              <Input type="date" value={promoUntil} onChange={(e) => setPromoUntil(e.target.value)} disabled={!canManage} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Formas de pagamento</Label>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_OPTIONS.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={paymentMethods.includes(p.id)}
                    onCheckedChange={(c) => togglePayment(p.id, c === true)}
                    disabled={!canManage}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Parcelamento máximo (x)</Label>
              <Input value={maxInstallments} onChange={(e) => setMaxInstallments(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Condição de parcelamento</Label>
              <Input value={installmentNote} onChange={(e) => setInstallmentNote(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Política de cancelamento / reembolso</Label>
              <Textarea value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} disabled={!canManage} rows={4} />
            </div>
          </div>
        </FormSection>

        <FormSection title="4. Operacional (agendamento)">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Duração (minutos)</Label>
              <Input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1">
              <Label>Intervalo após (minutos)</Label>
              <Input value={bufferAfter} onChange={(e) => setBufferAfter(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1">
              <Label>Tipo de atendimento</Label>
              <Select
                value={attendanceType || "__none__"}
                onValueChange={(v) => setAttendanceType(v === "__none__" ? "" : (v as CatalogAttendanceType))}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="group">Grupo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Capacidade máxima</Label>
              <Input value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Recurso necessário</Label>
              <Input value={resourceRequired} onChange={(e) => setResourceRequired(e.target.value)} disabled={!canManage} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Dias disponíveis</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ d, label }) => (
                <label
                  key={d}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer",
                    weekdays.includes(d) ? "border-primary bg-primary/10" : "border-border"
                  )}
                >
                  <Checkbox
                    checked={weekdays.includes(d)}
                    onCheckedChange={(c) => toggleWeekday(d, c === true)}
                    disabled={!canManage}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </FormSection>

        <FormSection title="5. Profissionais habilitados">
          <p className="text-xs text-muted-foreground">
            Cadastre profissionais em <Link className="underline text-primary" to="/catalog/professionals">Profissionais</Link>.
          </p>
          <ScrollArea className="h-40 rounded-md border p-2">
            <div className="space-y-2 pr-3">
              {(professionals ?? []).map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selProfessionals.includes(p.id)}
                    onCheckedChange={(c) => toggleProfessional(p.id, c === true)}
                    disabled={!canManage}
                  />
                  {p.full_name}
                </label>
              ))}
              {!professionals?.length && <p className="text-sm text-muted-foreground">Nenhum profissional neste tenant.</p>}
            </div>
          </ScrollArea>
          {selProfessionals.length > 0 && (
            <div className="space-y-1">
              <Label>Profissional padrão</Label>
              <Select value={defaultProfessionalId || "__none__"} onValueChange={(v) => setDefaultProfessionalId(v === "__none__" ? "" : v)} disabled={!canManage}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha entre os marcados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {selProfessionals.map((id) => {
                    const p = professionals?.find((x) => x.id === id);
                    return (
                      <SelectItem key={id} value={id}>
                        {p?.full_name ?? id}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </FormSection>

        <FormSection title="6. Inteligência de vendas">
          <div className="space-y-1">
            <Label>Pré-requisitos</Label>
            <Textarea value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)} disabled={!canManage} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Público-alvo / indicação</Label>
            <Textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} disabled={!canManage} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Itens relacionados (upsell)</Label>
            <ScrollArea className="h-36 rounded-md border p-2">
              <div className="space-y-2 pr-3">
                {relatedOptions.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={relatedIds.includes(i.id)}
                      onCheckedChange={(c) => toggleRelated(i.id, c === true)}
                      disabled={!canManage}
                    />
                    {i.name}
                  </label>
                ))}
                {!relatedOptions.length && (
                  <p className="text-sm text-muted-foreground">Cadastre outros itens para sugerir como complemento.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </FormSection>

        <FormSection title="Preview do documento (RAG)" defaultOpen={false}>
          <p className="text-xs text-muted-foreground mb-2">
            Texto derivado do formulário; a sincronização com o índice vetorial será feita pelo backend quando estiver ligada.
          </p>
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs font-mono max-h-80 overflow-auto border">
            {previewText}
          </pre>
          {!isNew && row && (
            <p className="text-xs text-muted-foreground mt-2">
              RAG: <span className="font-medium">{row.rag_sync_status}</span>
              {row.rag_synced_at && (
                <>
                  {" "}
                  · última sync: {new Date(row.rag_synced_at).toLocaleString("pt-BR")}
                </>
              )}
            </p>
          )}
        </FormSection>
      </div>

      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
          </DialogHeader>
          <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Ex.: Habilitação" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void onCreateCategory()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o item e os vínculos com profissionais e upsell. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void onDelete()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
