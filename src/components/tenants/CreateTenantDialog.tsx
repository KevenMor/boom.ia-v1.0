import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTenant } from "@/hooks/useTenants";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  slug: z
    .string()
    .min(2, "Slug deve ter pelo menos 2 caracteres")
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: z.string().default("starter"),
});

type FormData = z.infer<typeof schema>;

interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTenantDialog({ open, onOpenChange }: CreateTenantDialogProps) {
  const createTenant = useCreateTenant();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "", plan: "starter" },
  });

  const nameValue = watch("name");

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const onSubmit = async (data: FormData) => {
    try {
      await createTenant.mutateAsync(data);
      toast.success(`Tenant "${data.name}" criado com sucesso`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao criar tenant: " + (err.message ?? "erro desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Tenant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nome da empresa
            </Label>
            <Input
              id="name"
              placeholder="Empresa XYZ"
              {...register("name", {
                onChange: (e) => {
                  const slug = generateSlug(e.target.value);
                  setValue("slug", slug);
                },
              })}
              className="h-9 bg-background"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Slug (identificador único)
            </Label>
            <Input
              id="slug"
              placeholder="empresa-xyz"
              {...register("slug")}
              className="h-9 bg-background font-mono text-sm"
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Plano
            </Label>
            <Select defaultValue="starter" onValueChange={(v) => setValue("plan", v)}>
              <SelectTrigger className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createTenant.isPending} className="gap-2">
              {createTenant.isPending && (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              )}
              Criar Tenant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
