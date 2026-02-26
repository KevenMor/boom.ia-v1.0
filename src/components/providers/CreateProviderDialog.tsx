import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProvider } from "@/hooks/useProviders";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  base_url: z.string().url("URL inválida").or(z.literal("")).optional(),
  model_default: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProviderDialog({ open, onOpenChange }: Props) {
  const create = useCreateProvider();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", base_url: "", model_default: "" },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await create.mutateAsync({
        name: data.name,
        base_url: data.base_url || null,
        model_default: data.model_default || null,
      });
      toast.success(`Provider "${data.name}" criado`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? "desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Novo Provider</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input {...register("name")} placeholder="OpenAI" className="h-9 bg-background" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Base URL</Label>
            <Input {...register("base_url")} placeholder="https://api.openai.com/v1" className="h-9 bg-background font-mono text-sm" />
            {errors.base_url && <p className="text-xs text-destructive">{errors.base_url.message}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo Padrão</Label>
            <Input {...register("model_default")} placeholder="gpt-4o" className="h-9 bg-background font-mono text-sm" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Criar Provider"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
