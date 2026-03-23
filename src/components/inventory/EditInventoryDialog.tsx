import { useMemo } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateInventory } from "@/hooks/useInventory";
import { toast } from "sonner";
import type { InventoryItem } from "@/types/database";
import { useEffect, useState } from "react";
import { toDirectDownloadUrl } from "@/lib/videoUrl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { callAPI } from "@/lib/api-client";

type VideoProbeResponse = {
  ok: boolean;
  sizeBytes: number | null;
  deliveryMode: string;
  humanLabelPt: string;
  error?: string;
};

const schema = z.object({
  brand: z.string().min(1, "Marca é obrigatória"),
  model: z.string().min(1, "Modelo é obrigatório"),
  version: z.string().optional(),
  year: z.coerce.number().min(1900).max(2100).optional().nullable(),
  price: z.coerce.number().min(0).optional().nullable(),
  mileage: z.coerce.number().min(0).optional().nullable(),
  color: z.string().optional(),
  transmission: z.string().optional(),
  fuel_type: z.string().optional(),
  photo_url: z.string().optional(),
  detail_url: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["available", "sold", "reserved"]),
  video_details: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

interface EditInventoryDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInventoryDialog({ item, open, onOpenChange }: EditInventoryDialogProps) {
  const updateInventory = useUpdateInventory();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      brand: "",
      model: "",
      version: "",
      year: null,
      price: null,
      mileage: null,
      color: "",
      transmission: "",
      fuel_type: "",
      photo_url: "",
      detail_url: "",
      description: "",
      status: "available",
      video_details: null,
    },
  });

  const videoDetails = watch("video_details");
  const [showPreview, setShowPreview] = useState(false);
  const hasVideoUrl = (videoDetails ?? "").trim().length > 0;

  const [videoProbe, setVideoProbe] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  useEffect(() => {
    const url = (videoDetails ?? "").trim();
    if (!url) {
      setVideoProbe({ status: "idle", message: "" });
      return;
    }
    if (!/^https:\/\//i.test(url)) {
      setVideoProbe({ status: "idle", message: "" });
      return;
    }

    setVideoProbe({ status: "loading", message: "Verificando…" });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await callAPI<VideoProbeResponse>("/inventory/video-probe", {
            method: "POST",
            body: { url, tenant_id: item?.tenant_id },
          });
          if (cancelled) return;
          setVideoProbe({ status: "ready", message: res.humanLabelPt });
        } catch {
          if (cancelled) return;
          setVideoProbe({
            status: "error",
            message: "Não foi possível verificar o link.",
          });
        }
      })();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [videoDetails, item?.tenant_id]);

  useEffect(() => {
    if (item) {
      reset({
        brand: item.brand,
        model: item.model,
        version: item.version || "",
        year: item.year ?? null,
        price: item.price ?? null,
        mileage: item.mileage ?? null,
        color: item.color || "",
        transmission: item.transmission || "",
        fuel_type: item.fuel_type || "",
        photo_url: item.photo_url || "",
        detail_url: item.detail_url || "",
        description: item.description || "",
        status: item.status as "available" | "sold" | "reserved",
        video_details: item.video_details || null,
      });
    }
  }, [item, reset]);

  const onSubmit = async (data: FormData) => {
    if (!item) return;
    try {
      await updateInventory.mutateAsync({
        id: item.id,
        brand: data.brand,
        model: data.model,
        version: data.version || null,
        year: data.year ?? null,
        price: data.price ?? null,
        mileage: data.mileage ?? null,
        color: data.color || null,
        transmission: data.transmission || null,
        fuel_type: data.fuel_type || null,
        photo_url: data.photo_url || null,
        detail_url: data.detail_url || null,
        description: data.description || null,
        status: data.status,
        video_details: data.video_details || null,
      });
      toast.success("Veículo atualizado!");
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      toast.error("Erro ao atualizar: " + message);
    }
  };

  const allPhotoUrls = useMemo(() => {
    if (!item) return [];
    const urls = new Set<string>();
    const addUrl = (u: string | undefined) => u?.trim() && urls.add(u.trim());

    if (item.photo_url?.trim()) urls.add(item.photo_url.trim());

    let photos = item.photos;
    if (typeof photos === "string" && photos.trim()) {
      if (photos.trim().startsWith("[")) {
        try {
          photos = JSON.parse(photos) as unknown;
        } catch {
          addUrl(photos);
        }
      } else {
        addUrl(photos);
      }
    }
    if (Array.isArray(photos)) {
      photos.forEach((p) => {
        const u = typeof p === "string" ? p : (p as { url?: string })?.url;
        addUrl(u);
      });
    }

    const rawPhotos = item.raw_data?.photos;
    if (Array.isArray(rawPhotos)) {
      rawPhotos.forEach((p) => typeof p === "string" && addUrl(p));
    }
    return Array.from(urls);
  }, [item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Editar Veículo</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {item.brand} {item.model} {item.version}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="video_link" className="mb-0">
                Vídeo detalhado (link)
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    aria-label="Ajuda sobre formato do link de vídeo"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(100vw-2rem,22rem)] max-h-[min(70vh,24rem)] overflow-y-auto text-xs leading-relaxed">
                  <p className="font-medium text-foreground mb-2">Formato recomendado</p>
                  <p className="text-muted-foreground mb-2">
                    <strong className="text-foreground/90">Google Drive:</strong> use o link do <em>arquivo</em>, no formato{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono break-all">
                      https://drive.google.com/file/d/SEU_ID_AQUI/view?usp=sharing
                    </code>
                    . Em &quot;Compartilhar&quot;, deixe <strong className="text-foreground/90">qualquer pessoa com o link</strong>{" "}
                    pode ver — o servidor baixa o vídeo para enviar pelo WhatsApp.
                  </p>
                  <p className="text-muted-foreground mb-2">
                    <strong className="text-foreground/90">Outros:</strong> URL <code className="rounded bg-muted px-1">https</code> que aponte direto para o arquivo (ex.{" "}
                    <code className="rounded bg-muted px-1">.mp4</code>) também funciona.
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground/90">Evite:</strong>{" "}
                    <code className="rounded bg-muted px-1">drive.google.com/open?id=...</code>, pastas ou arquivo só com login — o envio automático pode falhar e o cliente receber só o link em texto.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <Input
              id="video_link"
              type="url"
              placeholder="https://drive.google.com/file/d/…/view?usp=sharing"
              value={videoDetails ?? ""}
              onChange={(e) => setValue("video_details", e.target.value || null)}
              className="mt-2"
            />
            {videoProbe.status !== "idle" && (
              <p
                className={`mt-1.5 text-xs ${
                  videoProbe.status === "error" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {videoProbe.message}
              </p>
            )}
            {hasVideoUrl && (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview((p) => !p)}
                >
                  {showPreview ? "Ocultar preview" : "Visualizar"}
                </Button>
                {showPreview && (
                  <div className="mt-2 rounded-lg overflow-hidden bg-muted aspect-video">
                    <video
                      src={toDirectDownloadUrl((videoDetails ?? "").trim())}
                      controls
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="brand">Marca *</Label>
              <Input id="brand" {...register("brand")} />
              {errors.brand && <p className="text-xs text-destructive mt-1">{errors.brand.message}</p>}
            </div>
            <div>
              <Label htmlFor="model">Modelo *</Label>
              <Input id="model" {...register("model")} />
              {errors.model && <p className="text-xs text-destructive mt-1">{errors.model.message}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="version">Versão</Label>
            <Input id="version" {...register("version")} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="year">Ano</Label>
              <Input id="year" type="number" {...register("year")} />
            </div>
            <div>
              <Label htmlFor="price">Preço (R$)</Label>
              <Input id="price" type="number" {...register("price")} />
            </div>
            <div>
              <Label htmlFor="mileage">Km</Label>
              <Input id="mileage" type="number" {...register("mileage")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="color">Cor</Label>
              <Input id="color" {...register("color")} />
            </div>
            <div>
              <Label htmlFor="transmission">Câmbio</Label>
              <Input id="transmission" {...register("transmission")} />
            </div>
            <div>
              <Label htmlFor="fuel_type">Combustível</Label>
              <Input id="fuel_type" {...register("fuel_type")} />
            </div>
          </div>

          <div>
            <Label htmlFor="photo_url">URL da foto principal</Label>
            <Input id="photo_url" {...register("photo_url")} />
          </div>

          {allPhotoUrls.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-auto py-1 px-0 text-muted-foreground hover:text-foreground">
                  Todas as fotos no banco ({allPhotoUrls.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto text-sm">
                  {allPhotoUrls.map((url, i) => (
                    <li key={i}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div>
            <Label htmlFor="detail_url">URL da página de detalhes</Label>
            <Input id="detail_url" {...register("detail_url")} />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" {...register("description")} />
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) => setValue("status", v as "available" | "sold" | "reserved")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="sold">Vendido</SelectItem>
                <SelectItem value="reserved">Reservado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateInventory.isPending}>
              {updateInventory.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
