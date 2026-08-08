import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateContact } from "@/hooks/useContacts";
import { toast } from "sonner";
import { fetchAddressByCep } from "@/lib/viacep";
import { capitalizeName, capitalizeAsYouType } from "@/lib/capitalizeName";
import type { Contact } from "@/types/database";
import { User, Phone, Mail, MapPin, FileText, Loader2, Building2 } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.union([z.string().email("E-mail inválido"), z.literal("")]).optional(),
  phone: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  notes: z.string().optional(),
  contact_type: z.enum(["lead", "client"]).optional(),
});

type FormData = z.infer<typeof schema>;

interface EditContactDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditContactDialog({ contact, open, onOpenChange }: EditContactDialogProps) {
  const updateContact = useUpdateContact();

  const [cepLoading, setCepLoading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
      defaultValues: {
      name: "",
      email: "",
      phone: "",
      cpf_cnpj: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      notes: "",
      contact_type: "lead" as const,
    },
  });

  const contactType = watch("contact_type");

  useEffect(() => {
    if (contact) {
      reset({
        name: contact.name,
        email: contact.email || "",
        phone: contact.phone || "",
        cpf_cnpj: contact.cpf_cnpj || "",
        address: contact.address || "",
        city: contact.city || "",
        state: contact.state || "",
        zip_code: contact.zip_code || "",
        notes: contact.notes || "",
        contact_type: (contact.contact_type === "client" ? "client" : "lead") as "lead" | "client",
      });
    }
  }, [contact, reset]);

  const onSubmit = async (data: FormData) => {
    if (!contact) return;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        name: capitalizeName(data.name),
        email: data.email || null,
        phone: data.phone || null,
        cpf_cnpj: data.cpf_cnpj || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code || null,
        notes: data.notes || null,
        contact_type: data.contact_type === "client" ? "client" : "lead",
      });
      toast.success("Contato atualizado!");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="border-b pb-4 mb-4">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Editar Contato
          </DialogTitle>
          <DialogDescription className="text-xs">
            Atualize as informações do cadastro de {contact.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Seção: Identificação */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Identificação</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="name" className="text-xs font-semibold">Nome Completo *</Label>
                <Input
                  id="name"
                  {...register("name")}
                  onChange={(e) => {
                    const cursor = e.target.selectionStart;
                    const val = capitalizeAsYouType(e.target.value);
                    setValue("name", val);
                    setTimeout(() => {
                      if (e.target && cursor !== null) {
                        e.target.setSelectionRange(cursor, cursor);
                      }
                    }, 0);
                  }}
                  onBlur={(e) => {
                    register("name").onBlur(e);
                    setValue("name", capitalizeName(e.target.value));
                  }}
                  className="h-9 text-sm capitalize"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>

              <div className="space-y-1 md:col-span-1">
                <Label className="text-xs font-semibold">Tipo de Contato</Label>
                <Select value={contactType} onValueChange={(v) => setValue("contact_type", v as "lead" | "client")}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="cpf_cnpj" className="text-xs font-semibold">CPF ou CNPJ</Label>
                <Input id="cpf_cnpj" {...register("cpf_cnpj")} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção: Contato */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Informações de Contato</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                  <Input id="email" type="email" {...register("email")} className="pl-9 h-9 text-sm" />
                </div>
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-semibold">Telefone / WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                  <Input id="phone" {...register("phone")} className="pl-9 h-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Endereço */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Localidade e Endereço</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="zip_code" className="text-xs font-semibold">CEP</Label>
                <div className="relative">
                  <Input
                    id="zip_code"
                    placeholder="01310-100"
                    disabled={cepLoading}
                    className="h-9 text-sm pr-8"
                    {...(() => {
                      const { onBlur, ...rest } = register("zip_code");
                      return {
                        ...rest,
                        onBlur: async (e: React.FocusEvent<HTMLInputElement>) => {
                          onBlur(e);
                          const cep = e.target.value.trim();
                          if (cep.replace(/\D/g, "").length !== 8) return;
                          setCepLoading(true);
                          try {
                            const result = await fetchAddressByCep(cep);
                            if (result) {
                              setValue("address", result.address);
                              setValue("city", result.city);
                              setValue("state", result.state);
                              toast.success("Endereço preenchido automaticamente");
                            } else {
                              toast.error("CEP não encontrado");
                            }
                          } finally {
                            setCepLoading(false);
                          }
                        },
                      };
                    })()}
                  />
                  {cepLoading && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              
              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="address" className="text-xs font-semibold">Logradouro, Nº, Compl.</Label>
                <Input id="address" {...register("address")} placeholder="Ex: Av. Paulista, 1000 - Apto 12" className="h-9 text-sm" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="city" className="text-xs font-semibold">Cidade</Label>
                <Input id="city" {...register("city")} placeholder="Ex: São Paulo" className="h-9 text-sm" />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="state" className="text-xs font-semibold">Estado</Label>
                <Input id="state" {...register("state")} placeholder="UF" maxLength={2} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção: Observações */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Informações Adicionais</span>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs font-semibold">Observações internas</Label>
              <Textarea id="notes" {...register("notes")} rows={3} className="resize-none text-sm" />
            </div>
          </div>

          <DialogFooter className="border-t pt-4 mt-6">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={updateContact.isPending}>
              {updateContact.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
