import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Database, ServerCog } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateTenant } from "@/hooks/useTenants";
import { toast } from "sonner";
import { useState } from "react";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  slug: z.string().min(2, "Slug deve ter pelo menos 2 caracteres").regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: z.string().default("starter"),
});

type FormData = z.infer<typeof schema>;

interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProvisioningStep = "idle" | "creating" | "provisioning" | "done";

const steps: { key: ProvisioningStep; label: string; icon: typeof Loader2 }[] = [
  { key: "creating", label: "Criando tenant...", icon: ServerCog },
  { key: "provisioning", label: "Provisionando Data Plane...", icon: Database },
  { key: "done", label: "Tenant ativo!", icon: CheckCircle2 },
];

export function CreateTenantDialog({ open, onOpenChange }: CreateTenantDialogProps) {
  const createTenant = useCreateTenant();
  const [step, setStep] = useState<ProvisioningStep>("idle");

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "", plan: "starter" },
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const onSubmit = async (data: FormData) => {
    try {
      setStep("creating");
      await new Promise((r) => setTimeout(r, 400));
      setStep("provisioning");
      await createTenant.mutateAsync(data);
      setStep("done");
      toast.success(`Tenant "${data.name}" criado e provisionado!`);
      await new Promise((r) => setTimeout(r, 1200));
      reset();
      setStep("idle");
      onOpenChange(false);
    } catch (err: any) {
      setStep("idle");
      toast.error("Erro: " + (err.message ?? "erro desconhecido"));
    }
  };

  const isProcessing = step !== "idle";

  return (
    <Dialog open={open} onOpenChange={(o) => !isProcessing && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Novo Tenant</DialogTitle>
          <p className="text-sm text-muted-foreground">Crie uma nova empresa e provisione o Data Plane</p>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div
              key="provisioning"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="py-10 space-y-6"
            >
              {steps.map((s) => {
                const isActive = s.key === step;
                const isDone = s.key === "creating" ? step !== "creating" : s.key === "provisioning" ? step === "done" : step === "done";
                const Icon = s.icon;
                return (
                  <div key={s.key} className={`flex items-center gap-4 transition-opacity ${isActive || isDone ? "opacity-100" : "opacity-30"}`}>
                    {isDone && s.key !== step ? (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                    ) : (
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${isDone && s.key !== step ? "text-success" : isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6 pt-2"
            >
              <div className="space-y-3">
                <Label htmlFor="name" className="text-sm font-medium text-muted-foreground">
                  Nome da empresa
                </Label>
                <Input
                  id="name"
                  placeholder="Empresa XYZ"
                  {...register("name", {
                    onChange: (e) => setValue("slug", generateSlug(e.target.value)),
                  })}
                  className="h-11 rounded-lg bg-background border-border"
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-3">
                <Label htmlFor="slug" className="text-sm font-medium text-muted-foreground">
                  Slug (identificador único)
                </Label>
                <Input
                  id="slug"
                  placeholder="empresa-xyz"
                  {...register("slug")}
                  className="h-11 rounded-lg bg-background border-border font-mono text-sm"
                />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
                <p className="text-xs text-muted-foreground">
                  Schema do Data Plane: <code className="font-mono text-primary">dp_{'<slug>'}</code>
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-muted-foreground">Plano</Label>
                <Select defaultValue="starter" onValueChange={(v) => setValue("plan", v)}>
                  <SelectTrigger className="h-11 rounded-lg bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-3 pt-2">
                <Button type="button" variant="outline" className="h-11 rounded-lg px-6" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-11 rounded-lg px-6">
                  Criar & Provisionar
                </Button>
              </DialogFooter>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
