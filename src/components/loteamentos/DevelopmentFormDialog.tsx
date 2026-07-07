import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { inferImageContentTypeForUpload } from "@/lib/image-file-guards";
import { normalizeSuiteGalleryMediaUrl } from "@/lib/suite-gallery-display";
import type { LotDevelopment } from "@/hooks/useLoteamentos";
import { useCreateLotDevelopment, useUpdateLotDevelopment } from "@/hooks/useLoteamentos";
import { toast } from "sonner";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Props = {
  tenantId: string;
  development?: LotDevelopment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DevelopmentFormDialog({ tenantId, development, open, onOpenChange }: Props) {
  const isEdit = Boolean(development?.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [mapImageUrl, setMapImageUrl] = useState("");

  const create = useCreateLotDevelopment();
  const update = useUpdateLotDevelopment();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setName(development?.name ?? "");
    setCity(development?.city ?? "");
    setState(development?.state ?? "");
    setAddress(development?.address ?? "");
    setDescription(development?.description ?? "");
    setStatus(development?.status ?? "active");
    setMapImageUrl(development?.map_image_url ?? "");
  }, [open, development]);

  const handleUpload = async (file: File) => {
    if (!tenantId) return;
    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const path = `${tenantId}/loteamentos/map-${id}`;
      const contentType = inferImageContentTypeForUpload(file);
      const { error } = await supabase.storage.from("suite-galleries").upload(path, file, { upsert: true, contentType });
      if (error) throw error;
      const { data } = supabase.storage.from("suite-galleries").getPublicUrl(path);
      setMapImageUrl(`${normalizeSuiteGalleryMediaUrl(data.publicUrl)}?t=${Date.now()}`);
      toast.success("Imagem do mapa enviada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do empreendimento.");
      return;
    }
    const finalSlug = isEdit && development ? development.slug : slugify(name);
    if (!finalSlug) {
      toast.error("Nome inválido para gerar identificador interno.");
      return;
    }
    const body = {
      tenant_id: tenantId,
      name: name.trim(),
      slug: finalSlug,
      city: city.trim() || null,
      state: state.trim() || null,
      address: address.trim() || null,
      description: description.trim() || null,
      status,
      map_image_url: mapImageUrl.trim() || null,
    };
    try {
      if (isEdit && development) {
        await update.mutateAsync({ id: development.id, ...body });
        toast.success("Empreendimento atualizado.");
      } else {
        await create.mutateAsync(body);
        toast.success("Empreendimento criado.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar empreendimento" : "Novo empreendimento"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dev-name">Nome</Label>
            <Input id="dev-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dev-city">Cidade</Label>
              <Input id="dev-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-state">UF</Label>
              <Input id="dev-state" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-address">Endereço</Label>
            <Input id="dev-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-desc">Descrição</Label>
            <Textarea id="dev-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-map-url">URL da imagem do mapa</Label>
            <Input id="dev-map-url" value={mapImageUrl} onChange={(e) => setMapImageUrl(e.target.value)} placeholder="https://…" />
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                Enviar imagem
              </Button>
            </div>
            {mapImageUrl && (
              <img src={mapImageUrl} alt="Prévia do mapa" className="mt-2 max-h-32 rounded border object-contain" />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
