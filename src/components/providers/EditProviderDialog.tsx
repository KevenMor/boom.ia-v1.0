import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateProvider } from "@/hooks/useProviders";
import { toast } from "sonner";
import type { Provider } from "@/types/database";

const schema = z.object({
  name: z.string().min(2),
  base_url: z.string().optional(),
  model_default: z.string().optional(),
  status: z.string(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  provider: Provider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProviderDialog({ provider, open, onOpenChange }: Props) {
  const update = useUpdateProvider();
  const { register, handleSubmit, setValue, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (provider) reset({ name: provider.name, base_url: provider.base_url ?? "", model_default: provider.model_default ?? "", status: provider.status });
  }, [provider, reset]);

  const onSubmit = async (data: FormData) => {
    if (!provider) return;
    try {
      await update.mutateAsync({ id: provider.id, ...data, base_url: data.base_url || null, model_default: data.model_default || null });
      toast.success("Provider atualizado");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? "desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar Provider</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input {...register("name")} className="h-9 bg-background" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Base URL</Label>
            <Input {...register("base_url")} className="h-9 bg-background font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo Padrão</Label>
            <Input {...register("model_default")} className="h-9 bg-background font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select defaultValue={provider?.status} onValueChange={(v) => setValue("status", v)}>
              <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="degraded">Degradado</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={update.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
