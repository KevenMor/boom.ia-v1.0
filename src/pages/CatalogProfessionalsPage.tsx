import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProfessionalsList } from "@/hooks/useServiceCatalog";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import type { Professional } from "@/types/database";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function CatalogProfessionalsPage() {
  const { selectedTenantId } = useTenantContext();
  const { isSuperAdmin, isTenantAdmin } = useAuth();
  const canManage = isSuperAdmin || isTenantAdmin(selectedTenantId);
  const qc = useQueryClient();
  const { data: list, isLoading } = useProfessionalsList(selectedTenantId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [fullName, setFullName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFullName("");
    setPhotoUrl("");
    setBio("");
    setDialogOpen(true);
  };

  const openEdit = (p: Professional) => {
    setEditing(p);
    setFullName(p.full_name);
    setPhotoUrl(p.photo_url ?? "");
    setBio(p.bio_short ?? "");
    setDialogOpen(true);
  };

  const onSave = async () => {
    if (!selectedTenantId || !fullName.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: selectedTenantId,
        full_name: fullName.trim(),
        photo_url: photoUrl.trim() || null,
        bio_short: bio.trim() || null,
      };
      if (editing) {
        const { error } = await nexusDb.from("professionals").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Profissional atualizado");
      } else {
        const { error } = await nexusDb.from("professionals").insert(payload);
        if (error) throw error;
        toast.success("Profissional criado");
      }
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["professionals", selectedTenantId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!selectedTenantId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Selecione um tenant para gerir profissionais.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Painel</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/catalog">Catálogo</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Profissionais</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link to="/catalog" aria-label="Voltar ao catálogo">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Profissionais</h1>
            <p className="text-sm text-muted-foreground">
              Vinculados aos serviços no cadastro de cada item.
            </p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo profissional
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Bio (resumo)</TableHead>
                {canManage && <TableHead className="w-[100px] text-end">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                    Nenhum profissional cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                (list ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-md truncate text-muted-foreground text-sm">
                      {p.bio_short ?? "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar profissional" : "Novo profissional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome completo</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: Ana Souza" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">URL da foto</label>
              <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Bio curta (para o agente)</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="Como o profissional se apresenta ao cliente..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void onSave()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
