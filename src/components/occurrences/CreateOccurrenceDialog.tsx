import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateOccurrence } from "@/hooks/useOccurrences";
import { useContacts } from "@/hooks/useContacts";
import { useInventory } from "@/hooks/useInventory";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleCombobox } from "@/components/occurrences/VehicleCombobox";
import { ContactCombobox } from "@/components/occurrences/ContactCombobox";
import { OccurrencePhotoUpload } from "@/components/occurrences/OccurrencePhotoUpload";
import { formatBrDateInput, formatBrTimeInput, isoToBrDateAndTime, parseBrDateTimeToIso } from "@/lib/br-datetime";
import { OCCURRENCE_LOCATION_LABELS, OCCURRENCE_LOCATION_TYPES } from "@/lib/occurrence-locations";
import {
  occurrenceModalContentClassName,
  occurrenceModalOverlayClassName,
} from "@/components/occurrences/occurrence-modal-classes";

const locationZ = z.enum(OCCURRENCE_LOCATION_TYPES);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const schema = z
  .object({
    inventory_id: z.string().min(1, "Selecione o veículo"),
    contact_id: z.string().optional(),
    title: z.string().min(1, "Título é obrigatório").max(500),
    description: z.string().optional(),
    photo_urls: z.array(z.string().max(2048)).max(15, "No máximo 15 fotos").default([]),
    status: z.enum(["aberta", "em_andamento", "resolvida", "cancelada"]).default("aberta"),
    severity: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
    date_br: z.string().optional(),
    time_br: z.string().optional(),
    location_type: locationZ.default("loja"),
    location_detail: z.string().optional(),
    odometer_km: z
      .string()
      .optional()
      .refine((s) => !s?.trim() || /^\d{1,7}$/.test(s.trim()), "Quilometragem inválida"),
  })
  .superRefine((data, ctx) => {
    const cid = data.contact_id?.trim() ?? "";
    if (cid && !UUID_RE.test(cid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cliente inválido",
        path: ["contact_id"],
      });
    }
    if (data.location_type === "outro" && !data.location_detail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Descreva o local",
        path: ["location_detail"],
      });
    }
    const d = data.date_br?.trim() ?? "";
    const t = data.time_br?.trim() ?? "";
    if (!d && !t) return;
    if (!d || !t) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preencha data e hora, ou deixe os dois vazios para usar o momento actual",
        path: !d ? ["date_br"] : ["time_br"],
      });
      return;
    }
    if (!parseBrDateTimeToIso(d, t)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data ou hora inválida (use dd/mm/aaaa e hh:mm)",
        path: ["date_br"],
      });
    }
  });

type FormData = z.infer<typeof schema>;

interface CreateOccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOccurrenceDialog({ open, onOpenChange }: CreateOccurrenceDialogProps) {
  const createMutation = useCreateOccurrence();
  const { selectedTenantId } = useTenantContext();
  const { data: invData, isLoading: invLoading } = useInventory({
    tenant_id: selectedTenantId ?? undefined,
    limit: 500,
  });
  const vehicles = invData?.data ?? [];
  const { data: contactsData, isLoading: contactsLoading } = useContacts({
    tenant_id: selectedTenantId ?? undefined,
    limit: 400,
    queryEnabled: open,
  });
  const contacts = contactsData?.data ?? [];

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      inventory_id: "",
      contact_id: "",
      title: "",
      description: "",
      photo_urls: [],
      status: "aberta",
      severity: "media",
      date_br: "",
      time_br: "",
      location_type: "loja",
      location_detail: "",
      odometer_km: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    const { dateBr, timeBr } = isoToBrDateAndTime(new Date().toISOString());
    reset({
      inventory_id: "",
      contact_id: "",
      title: "",
      description: "",
      photo_urls: [],
      status: "aberta",
      severity: "media",
      date_br: dateBr,
      time_br: timeBr,
      location_type: "loja",
      location_detail: "",
      odometer_km: "",
    });
  }, [open, reset]);

  const inventoryId = watch("inventory_id");
  const contactId = watch("contact_id");
  const photoUrls = watch("photo_urls");
  const statusVal = watch("status");
  const severityVal = watch("severity");
  const locationType = watch("location_type");
  const dateBr = watch("date_br");
  const timeBr = watch("time_br");

  const onSubmit = async (data: FormData) => {
    if (!selectedTenantId) {
      toast.error("Selecione um tenant.");
      return;
    }
    try {
      const d = data.date_br?.trim() ?? "";
      const t = data.time_br?.trim() ?? "";
      let occurred_at: string | undefined;
      if (d && t) {
        const iso = parseBrDateTimeToIso(d, t);
        if (!iso) {
          toast.error("Data ou hora inválida.");
          return;
        }
        occurred_at = iso;
      }

      const odometer_km = data.odometer_km?.trim() ? parseInt(data.odometer_km.trim(), 10) : null;
      const location_detail = data.location_detail?.trim() || null;

      await createMutation.mutateAsync({
        tenant_id: selectedTenantId,
        inventory_id: data.inventory_id,
        contact_id: data.contact_id?.trim() || null,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        photo_urls: data.photo_urls ?? [],
        status: data.status,
        severity: data.severity,
        ...(occurred_at ? { occurred_at } : {}),
        location_type: data.location_type,
        location_detail,
        odometer_km,
      });
      toast.success("Ocorrência registada.");
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      toast.error("Erro: " + message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={occurrenceModalOverlayClassName}
        className={occurrenceModalContentClassName}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b bg-muted/30 px-5 py-4 text-left sm:px-8 sm:text-left md:px-10 lg:px-12">
          <DialogTitle>Nova ocorrência</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-5 sm:px-8 sm:py-6 md:px-10 lg:px-12">
            <div className="w-full max-w-full space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <Label>Veículo</Label>
            {invLoading ? (
              <Skeleton className="h-11 w-full" />
            ) : (
              <VehicleCombobox
                items={vehicles}
                value={inventoryId}
                onValueChange={(v) => setValue("inventory_id", v, { shouldValidate: true })}
                disabled={createMutation.isPending}
              />
            )}
            {errors.inventory_id && (
              <p className="text-xs text-destructive">{errors.inventory_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cliente associado (opcional)</Label>
            {contactsLoading ? (
              <Skeleton className="h-11 w-full" />
            ) : (
              <ContactCombobox
                items={contacts}
                value={contactId ?? ""}
                onValueChange={(v) => setValue("contact_id", v, { shouldValidate: true })}
                disabled={createMutation.isPending}
              />
            )}
            {errors.contact_id && (
              <p className="text-xs text-destructive">{errors.contact_id.message}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Vincule a ocorrência a um contacto do CRM; na lista poderá abrir o cadastro do cliente.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="occ-title">Título</Label>
            <Input id="occ-title" {...register("title")} className="h-11" placeholder="Resumo da ocorrência" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="occ-desc">Descrição</Label>
            <Textarea id="occ-desc" {...register("description")} rows={5} className="min-h-[7.5rem]" placeholder="Detalhes (opcional)" />
          </div>

          <OccurrencePhotoUpload
            tenantId={selectedTenantId ?? undefined}
            value={photoUrls}
            onChange={(urls) => setValue("photo_urls", urls, { shouldValidate: true })}
            disabled={createMutation.isPending}
          />
          {errors.photo_urls && <p className="text-xs text-destructive">{errors.photo_urls.message}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
            <div className="space-y-2">
              <Label>Local da ocorrência</Label>
              <Select
                value={locationType}
                onValueChange={(v) => setValue("location_type", v as FormData["location_type"], { shouldValidate: true })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(Object.keys(OCCURRENCE_LOCATION_LABELS) as Array<keyof typeof OCCURRENCE_LOCATION_LABELS>).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {OCCURRENCE_LOCATION_LABELS[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="occ-odo">Quilometragem no momento (km)</Label>
              <Input
                id="occ-odo"
                inputMode="numeric"
                placeholder="Opcional"
                className="h-11"
                {...register("odometer_km")}
              />
              {errors.odometer_km && (
                <p className="text-xs text-destructive">{errors.odometer_km.message}</p>
              )}
            </div>
          </div>

          {locationType === "outro" && (
            <div className="space-y-2">
              <Label htmlFor="occ-loc-detail">Descrição do local</Label>
              <Textarea
                id="occ-loc-detail"
                {...register("location_detail")}
                rows={2}
                placeholder="Onde aconteceu?"
                className="min-h-[4rem]"
              />
              {errors.location_detail && (
                <p className="text-xs text-destructive">{errors.location_detail.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={statusVal}
                onValueChange={(v) => setValue("status", v as FormData["status"], { shouldValidate: true })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="resolvida">Resolvida</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select
                value={severityVal}
                onValueChange={(v) => setValue("severity", v as FormData["severity"], { shouldValidate: true })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Severidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
            <div className="space-y-2">
              <Label htmlFor="occ-date">Data (dd/mm/aaaa)</Label>
              <Input
                id="occ-date"
                autoComplete="off"
                placeholder="dd/mm/aaaa"
                className="h-11"
                value={dateBr ?? ""}
                onChange={(e) => setValue("date_br", formatBrDateInput(e.target.value), { shouldValidate: true })}
              />
              {errors.date_br && <p className="text-xs text-destructive">{errors.date_br.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="occ-time">Hora (24h)</Label>
              <Input
                id="occ-time"
                autoComplete="off"
                placeholder="hh:mm"
                className="h-11"
                value={timeBr ?? ""}
                onChange={(e) => setValue("time_br", formatBrTimeInput(e.target.value), { shouldValidate: true })}
              />
              {errors.time_br && <p className="text-xs text-destructive">{errors.time_br.message}</p>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Opcional: deixe data e hora vazias para registar com o momento actual. Formato brasileiro.
          </p>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-5 py-4 sm:justify-end sm:px-8 md:px-10 lg:px-12">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
