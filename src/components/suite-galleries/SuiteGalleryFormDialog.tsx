import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreateSuiteGallery, useUpdateSuiteGallery } from "@/hooks/useSuiteGalleries";
import { useTenantContext } from "@/contexts/TenantContext";
import type { SuiteGallery } from "@/types/database";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  llm_media_guidance: z.string().max(8000).optional(),
  display_order: z.coerce.number().int().min(0).default(0),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gallery?: SuiteGallery | null;
};

export function SuiteGalleryFormDialog({ open, onOpenChange, gallery }: Props) {
  const { selectedTenantId } = useTenantContext();
  const isEdit = !!gallery;

  const create = useCreateSuiteGallery();
  const update = useUpdateSuiteGallery();
  const isPending = create.isPending || update.isPending;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", llm_media_guidance: "", display_order: 0 },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: gallery?.name ?? "",
        description: gallery?.description ?? "",
        llm_media_guidance: gallery?.llm_media_guidance ?? "",
        display_order: gallery?.display_order ?? 0,
      });
    }
  }, [open, gallery, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && gallery) {
        await update.mutateAsync({
          id: gallery.id,
          name: values.name,
          description: values.description || null,
          llm_media_guidance: values.llm_media_guidance?.trim() || null,
          display_order: values.display_order,
        });
        toast.success("Galeria atualizada.");
      } else {
        await create.mutateAsync({
          tenant_id: selectedTenantId ?? "",
          name: values.name,
          description: values.description || null,
          llm_media_guidance: values.llm_media_guidance?.trim() || null,
          display_order: values.display_order,
          media_urls: [],
        });
        toast.success("Galeria criada.");
      }
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : "Tente novamente."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar galeria" : "Nova galeria"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sg-name">Nome <span className="text-destructive">*</span></Label>
            <Input
              id="sg-name"
              placeholder="ex.: Destaque verão, Produto A, Evento…"
              {...register("name")}
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sg-desc">Descrição</Label>
            <Textarea
              id="sg-desc"
              placeholder="Descrição opcional desta galeria…"
              rows={3}
              {...register("description")}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sg-llm">Orientação para o agente (envio de imagens / vídeos)</Label>
            <Textarea
              id="sg-llm"
              placeholder="Ex.: Só enviar fotos depois que o cliente disser que quer ver; nunca na primeira mensagem. Usar photos_markdown só após confirmação explícita."
              rows={4}
              className="min-h-[100px] resize-y"
              {...register("llm_media_guidance")}
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              Incluído no resultado da tool de Galeria para a LLM (campo <span className="font-mono">orientacao_envio_midias</span>). Opcional.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sg-order">Ordem de exibição</Label>
            <Input
              id="sg-order"
              type="number"
              min={0}
              {...register("display_order")}
              disabled={isPending}
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">Menor número aparece primeiro.</p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar galeria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
