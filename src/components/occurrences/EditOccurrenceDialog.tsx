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
import { useUpdateOccurrence } from "@/hooks/useOccurrences";
import { useContacts } from "@/hooks/useContacts";
import { useInventory } from "@/hooks/useInventory";
import { useTenantContext } from "@/contexts/TenantContext";
import type { Occurrence, OccurrenceLocationType } from "@/types/database";
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
    inventory_id: z.string().min(1),
    contact_id: z.string().optional(),
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    photo_urls: z.array(z.string().max(2048)).max(15, "No máximo 15 fotos").default([]),
    status: z.enum(["aberta", "em_andamento", "resolvida", "cancelada"]),
    severity: z.enum(["baixa", "media", "alta", "critica"]),
    date_br: z.string().min(1, "Data obrigatória"),
    time_br: z.string().min(1, "Hora obrigatória"),
    location_type: locationZ,
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
    if (!parseBrDateTimeToIso(data.date_br.trim(), data.time_br.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data ou hora inválida (use dd/mm/aaaa e hh:mm)",
        path: ["date_br"],
      });
    }
  });

type FormData = z.infer<typeof schema>;

function coerceLocationType(raw: unknown): OccurrenceLocationType {
  const s = typeof raw === "string" ? raw.trim() : "";
  if ((OCCURRENCE_LOCATION_TYPES as readonly string[]).includes(s)) return s as OccurrenceLocationType;
  return "loja";
}

interface EditOccurrenceDialogProps {
  occurrence: Occurrence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditOccurrenceDialog({ occurrence, open, onOpenChange }: EditOccurrenceDialogProps) {
  const updateMutation = useUpdateOccurrence();
  const { selectedTenantId } = useTenantContext();
  const { data: invData, isLoading: invLoading } = useInventory({
    tenant_id: selectedTenantId ?? occurrence?.tenant_id ?? undefined,
    limit: 500,
  });
  const vehicles = invData?.data ?? [];
  const { data: contactsData, isLoading: contactsLoading } = useContacts({
    tenant_id: selectedTenantId ?? occurrence?.tenant_id ?? undefined,
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

  const statusVal = watch("status");
  const severityVal = watch("severity");
  const inventoryId = watch("inventory_id");
  const contactId = watch("contact_id");
  const photoUrls = watch("photo_urls");
  const locationType = watch("location_type");
  const dateBr = watch("date_br");
  const timeBr = watch("time_br");

  useEffect(() => {
    if (!occurrence || !open) return;
    const { dateBr: d, timeBr: t } = isoToBrDateAndTime(occurrence.occurred_at);
    const loc = coerceLocationType(occurrence.location_type);
    const odo =
      occurrence.odometer_km != null && Number.isFinite(occurrence.odometer_km)
        ? String(occurrence.odometer_km)
        : "";
    reset({
      inventory_id: occurrence.inventory_id,
      contact_id: occurrence.contact_id ?? "",
      title: occurrence.title,
      description: occurrence.description ?? "",
      photo_urls: Array.isArray(occurrence.photo_urls) ? occurrence.photo_urls : [],
      status: occurrence.status,
      severity: occurrence.severity,
      date_br: d,
      time_br: t,
      location_type: loc,
      location_detail: occurrence.location_detail ?? "",
      odometer_km: odo,
    });
  }, [occurrence, open, reset]);

  const onSubmit = async (data: FormData) => {
    if (!occurrence) return;
    const iso = parseBrDateTimeToIso(data.date_br.trim(), data.time_br.trim());
    if (!iso) {
      toast.error("Data ou hora inválida.");
      return;
    }
    try {
      const odometer_km = data.odometer_km?.trim() ? parseInt(data.odometer_km.trim(), 10) : null;
      const location_detail = data.location_detail?.trim() || null;

      await updateMutation.mutateAsync({
        id: occurrence.id,
        inventory_id: data.inventory_id,
        contact_id: data.contact_id?.trim() || null,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        photo_urls: data.photo_urls ?? [],
        status: data.status,
        severity: data.severity,
        occurred_at: iso,
        location_type: data.location_type,
        location_detail,
        odometer_km,
      });
      toast.success("Ocorrência actualizada.");
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
          <DialogTitle>Editar ocorrência</DialogTitle>
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
                disabled={updateMutation.isPending}
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
                disabled={updateMutation.isPending}
              />
            )}
            {errors.contact_id && (
              <p className="text-xs text-destructive">{errors.contact_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-occ-title">Título</Label>
            <Input id="edit-occ-title" {...register("title")} className="h-11" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-occ-desc">Descrição</Label>
            <Textarea id="edit-occ-desc" {...register("description")} rows={5} className="min-h-[7.5rem]" />
          </div>

          <OccurrencePhotoUpload
            tenantId={selectedTenantId ?? occurrence?.tenant_id ?? undefined}
            value={photoUrls}
            onChange={(urls) => setValue("photo_urls", urls, { shouldValidate: true })}
            disabled={updateMutation.isPending}
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
              <Label htmlFor="edit-occ-odo">Quilometragem no momento (km)</Label>
              <Input
                id="edit-occ-odo"
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
              <Label htmlFor="edit-occ-loc-detail">Descrição do local</Label>
              <Textarea
                id="edit-occ-loc-detail"
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
                  <SelectValue />
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
                  <SelectValue />
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
              <Label htmlFor="edit-occ-date">Data (dd/mm/aaaa)</Label>
              <Input
                id="edit-occ-date"
                autoComplete="off"
                placeholder="dd/mm/aaaa"
                className="h-11"
                value={dateBr ?? ""}
                onChange={(e) => setValue("date_br", formatBrDateInput(e.target.value), { shouldValidate: true })}
              />
              {errors.date_br && <p className="text-xs text-destructive">{errors.date_br.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-occ-time">Hora (24h)</Label>
              <Input
                id="edit-occ-time"
                autoComplete="off"
                placeholder="hh:mm"
                className="h-11"
                value={timeBr ?? ""}
                onChange={(e) => setValue("time_br", formatBrTimeInput(e.target.value), { shouldValidate: true })}
              />
              {errors.time_br && <p className="text-xs text-destructive">{errors.time_br.message}</p>}
            </div>
          </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-5 py-4 sm:justify-end sm:px-8 md:px-10 lg:px-12">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
