import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTool } from "@/hooks/useTools";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  description: z.string().optional(),
  type: z.string().default("function"),
  endpoint: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function CreateToolDialog({ open, onOpenChange }: Props) {
  const create = useCreateTool();
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", type: "function", endpoint: "" },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await create.mutateAsync({
        name: data.name,
        description: data.description || null,
        type: data.type,
        endpoint: data.endpoint || null,
      });
      toast.success(`Tool "${data.name}" criada`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? ""));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nova Tool</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input {...register("name")} placeholder="db_query" className="h-9 bg-background font-mono text-sm" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Input {...register("description")} placeholder="Consulta ao banco de dados" className="h-9 bg-background" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo</Label>
              <Select defaultValue="function" onValueChange={(v) => setValue("type", v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="function">Function</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Endpoint</Label>
              <Input {...register("endpoint")} placeholder="https://..." className="h-9 bg-background font-mono text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Criando..." : "Criar Tool"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
