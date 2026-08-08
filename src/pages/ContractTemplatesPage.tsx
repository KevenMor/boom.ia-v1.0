import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ScrollText, Plus, Pencil, Trash2, ChevronLeft, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  useContractTemplates,
  useCreateContractTemplate,
  useUpdateContractTemplate,
  useDeleteContractTemplate,
} from "@/hooks/useContacts";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const schema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  content: z.string().min(1, "Corpo do contrato é obrigatório"),
});

type FormData = z.infer<typeof schema>;

export default function ContractTemplatesPage() {
  const { selectedTenantId } = useTenantContext();
  const { data: templates, isLoading } = useContractTemplates(selectedTenantId);
  const createTemplate = useCreateContractTemplate();
  const updateTemplate = useUpdateContractTemplate();
  const deleteTemplate = useDeleteContractTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", content: "" },
  });

  const handleEdit = (t: any) => {
    setEditingId(t.id);
    setValue("title", t.title);
    setValue("description", t.description || "");
    setValue("content", t.content);
  };

  const handleCancel = () => {
    setEditingId(null);
    reset({ title: "", description: "", content: "" });
  };

  const onSubmit = (values: FormData) => {
    if (!selectedTenantId) return;

    if (editingId) {
      updateTemplate.mutate(
        { id: editingId, tenant_id: selectedTenantId, ...values },
        {
          onSuccess: () => {
            toast.success("Modelo de contrato atualizado");
            handleCancel();
          },
          onError: () => toast.error("Erro ao atualizar modelo"),
        }
      );
    } else {
      createTemplate.mutate(
        { tenant_id: selectedTenantId, ...values },
        {
          onSuccess: () => {
            toast.success("Modelo de contrato criado");
            handleCancel();
          },
          onError: () => toast.error("Erro ao criar modelo"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId || !selectedTenantId) return;
    deleteTemplate.mutate(
      { id: deleteId, tenant_id: selectedTenantId },
      {
        onSuccess: () => {
          toast.success("Modelo removido");
          setDeleteId(null);
          if (editingId === deleteId) handleCancel();
        },
        onError: () => toast.error("Erro ao remover modelo"),
      }
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
            Modelos de Contratos
          </h1>
          <p className="text-xs text-muted-foreground">Cadastre e gerencie os modelos base de contratos para automação de preenchimento</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Modelos */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border border-border bg-card shadow-sm rounded-lg">
            <CardHeader className="border-b border-border/50 pb-3">
              <CardTitle className="text-sm font-semibold">Modelos Cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : templates && templates.length > 0 ? (
                <div className="divide-y divide-border/40 space-y-3">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className={`pt-3 first:pt-0 flex items-start justify-between gap-2 group cursor-pointer`}
                      onClick={() => handleEdit(t)}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium transition-colors ${editingId === t.id ? 'text-primary' : 'text-foreground hover:text-primary'}`}>
                          {t.title}
                        </p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(t.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum modelo cadastrado.</p>
              )}
            </CardContent>
          </Card>

          {/* Dicas de Placeholders */}
          <Card className="border border-border bg-muted/20 shadow-none rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
                Variáveis Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Use os placeholders abaixo no corpo do contrato para que eles sejam substituídos automaticamente pelos dados do cliente:
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{nome_cliente}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{email}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{telefone}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{cpf_cnpj}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{endereco}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{cidade}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{uf}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{cep}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{data}}"}</div>
                <div className="border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground truncate">{"{{data_extenso}}"}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Formulário de Criação/Edição */}
        <div className="lg:col-span-2">
          <Card className="border border-border bg-card shadow-sm rounded-lg">
            <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  {editingId ? "Editar Modelo de Contrato" : "Novo Modelo de Contrato"}
                </CardTitle>
              </div>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={handleCancel} className="h-8 text-xs">
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Novo modelo
                </Button>
              )}
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-semibold text-muted-foreground">Título do Modelo *</Label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="Contrato de Promessa de Compra e Venda, Contrato de Prestação de Serviços..."
                    className="h-10 text-sm"
                  />
                  {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-semibold text-muted-foreground">Descrição</Label>
                  <Input
                    id="description"
                    {...register("description")}
                    placeholder="Breve descrição sobre a finalidade deste modelo base"
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="content" className="text-xs font-semibold text-muted-foreground">Texto do Contrato *</Label>
                  <Textarea
                    id="content"
                    {...register("content")}
                    placeholder="Escreva as cláusulas do contrato aqui... Ex: Eu, {{nome_cliente}}, portador do documento {{cpf_cnpj}}, residente no endereço {{endereco}}..."
                    rows={16}
                    className="text-sm font-mono leading-relaxed resize-y"
                  />
                  {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
                </div>
              </CardContent>

              <div className="border-t border-border/50 bg-muted/10 px-6 py-4 flex items-center justify-end gap-2">
                {editingId && (
                  <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                    Cancelar
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={createTemplate.isPending || updateTemplate.isPending}>
                  {createTemplate.isPending || updateTemplate.isPending ? "Salvando..." : "Salvar Modelo"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover modelo de contrato?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação removerá o modelo base permanentemente. Contratos já gerados a partir dele continuarão existindo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
