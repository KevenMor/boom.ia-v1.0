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
import { useUpdateTool } from "@/hooks/useTools";
import { toast } from "sonner";
import type { Tool } from "@/types/database";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.string(),
  endpoint: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props { tool: Tool | null; open: boolean; onOpenChange: (o: boolean) => void; }

export function EditToolDialog({ tool, open, onOpenChange }: Props) {
  const update = useUpdateTool();
  const { register, handleSubmit, setValue, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (tool) reset({ name: tool.name, description: tool.description ?? "", type: tool.type, endpoint: tool.endpoint ?? "" });
  }, [tool, reset]);

  const onSubmit = async (data: FormData) => {
    if (!tool) return;
    try {
      await update.mutateAsync({ id: tool.id, ...data, description: data.description || null, endpoint: data.endpoint || null });
      toast.success("Tool atualizada");
      onOpenChange(false);
    } catch (err: any) { toast.error("Erro: " + (err.message ?? "")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar Tool</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input {...register("name")} className="h-9 bg-background font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Input {...register("description")} className="h-9 bg-background" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo</Label>
              <Select defaultValue={tool?.type} onValueChange={(v) => setValue("type", v)}>
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
              <Input {...register("endpoint")} className="h-9 bg-background font-mono text-sm" />
            </div>
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
