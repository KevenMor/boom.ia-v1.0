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
import { useState } from "react";
import { Sparkles } from "lucide-react";

const presets = [
  { name: "Google Gemini", base_url: "https://generativelanguage.googleapis.com/v1beta", model_default: "gemini-2.0-flash", icon: "✦" },
  { name: "OpenAI", base_url: "https://api.openai.com/v1", model_default: "gpt-4o", icon: "◉" },
  { name: "Anthropic", base_url: "https://api.anthropic.com/v1", model_default: "claude-sonnet-4-20250514", icon: "◈" },
  { name: "Groq", base_url: "https://api.groq.com/openai/v1", model_default: "llama-3.3-70b-versatile", icon: "⚡" },
];

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
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", base_url: "", model_default: "" },
  });

  const applyPreset = (index: number) => {
    const p = presets[index];
    setSelectedPreset(index);
    setValue("name", p.name);
    setValue("base_url", p.base_url);
    setValue("model_default", p.model_default);
  };

  const onSubmit = async (data: FormData) => {
    try {
      await create.mutateAsync({
        name: data.name,
        base_url: data.base_url || null,
        model_default: data.model_default || null,
      });
      toast.success(`Provider "${data.name}" criado`);
      reset();
      setSelectedPreset(null);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? "desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); setSelectedPreset(null); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Novo Provider</DialogTitle></DialogHeader>

        {/* Presets */}
        <div className="space-y-2">
          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Presets
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p, i) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(i)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedPreset === i
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <span className="text-base">{p.icon}</span>
                <div>
                  <span className="font-medium text-xs">{p.name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{p.model_default}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input {...register("name")} placeholder="Google Gemini" className="h-9 bg-background" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Base URL</Label>
            <Input {...register("base_url")} placeholder="https://api.openai.com/v1" className="h-9 bg-background font-mono text-sm" />
            {errors.base_url && <p className="text-xs text-destructive">{errors.base_url.message}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo Padrão</Label>
            <Input {...register("model_default")} placeholder="gemini-2.0-flash" className="h-9 bg-background font-mono text-sm" />
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
