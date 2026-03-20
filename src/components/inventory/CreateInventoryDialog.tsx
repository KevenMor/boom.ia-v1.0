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
import { useCreateInventory } from "@/hooks/useInventory";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";

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
  status: z.enum(["available", "sold", "reserved"]).default("available"),
});

type FormData = z.infer<typeof schema>;

interface CreateInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PPL_MOTORS_TENANT_ID = "bc4a1dc9-a205-4b4b-9b6c-47bf677a2728";

export function CreateInventoryDialog({ open, onOpenChange }: CreateInventoryDialogProps) {
  const createInventory = useCreateInventory();
  const { selectedTenantId } = useTenantContext();

  const tenantId = selectedTenantId ?? PPL_MOTORS_TENANT_ID;

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
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
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createInventory.mutateAsync({
        tenant_id: tenantId,
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
      });
      toast.success("Veículo cadastrado!");
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao cadastrar: " + (err.message ?? "erro desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Novo Veículo</DialogTitle>
          <p className="text-sm text-muted-foreground">Cadastre um veículo manualmente no inventário</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="brand">Marca *</Label>
              <Input id="brand" {...register("brand")} placeholder="Ex: Volkswagen" />
              {errors.brand && <p className="text-xs text-destructive mt-1">{errors.brand.message}</p>}
            </div>
            <div>
              <Label htmlFor="model">Modelo *</Label>
              <Input id="model" {...register("model")} placeholder="Ex: Golf" />
              {errors.model && <p className="text-xs text-destructive mt-1">{errors.model.message}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="version">Versão</Label>
            <Input id="version" {...register("version")} placeholder="Ex: GTI 2.0 TSI" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="year">Ano</Label>
              <Input id="year" type="number" {...register("year")} placeholder="2024" />
            </div>
            <div>
              <Label htmlFor="price">Preço (R$)</Label>
              <Input id="price" type="number" {...register("price")} placeholder="150000" />
            </div>
            <div>
              <Label htmlFor="mileage">Km</Label>
              <Input id="mileage" type="number" {...register("mileage")} placeholder="50000" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="color">Cor</Label>
              <Input id="color" {...register("color")} placeholder="Preto" />
            </div>
            <div>
              <Label htmlFor="transmission">Câmbio</Label>
              <Input id="transmission" {...register("transmission")} placeholder="Automático" />
            </div>
            <div>
              <Label htmlFor="fuel_type">Combustível</Label>
              <Input id="fuel_type" {...register("fuel_type")} placeholder="Flex" />
            </div>
          </div>

          <div>
            <Label htmlFor="photo_url">URL da foto principal</Label>
            <Input id="photo_url" {...register("photo_url")} placeholder="https://..." />
          </div>

          <div>
            <Label htmlFor="detail_url">URL da página de detalhes</Label>
            <Input id="detail_url" {...register("detail_url")} placeholder="https://..." />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" {...register("description")} placeholder="SUV, 4 portas..." />
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select onValueChange={(v) => setValue("status", v as "available" | "sold" | "reserved")} defaultValue="available">
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
            <Button type="submit" disabled={createInventory.isPending}>
              {createInventory.isPending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
