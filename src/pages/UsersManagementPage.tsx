import { useMemo, useState } from "react";
import { UserPlus, Pencil, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTenants } from "@/hooks/useTenants";
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
  type AdminUser,
  type TenantMembershipRole,
} from "@/hooks/useAdminUsers";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type MembershipDraft = { tenant_id: string; role: TenantMembershipRole };

function emptyRow(tenants: { id: string }[]): MembershipDraft {
  return { tenant_id: tenants[0]?.id ?? "", role: "tenant_user" };
}

function isSuperProfile(role: string) {
  const r = role.toLowerCase();
  return r === "superadmin" || r === "admin";
}

export default function UsersManagementPage() {
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const { data: users, isLoading: usersLoading, error } = useAdminUsers();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [membershipRows, setMembershipRows] = useState<MembershipDraft[]>([]);

  const [editFullName, setEditFullName] = useState("");
  const [editRows, setEditRows] = useState<MembershipDraft[]>([]);

  const activeTenants = useMemo(
    () => (tenants ?? []).filter((t) => t.status === "active"),
    [tenants]
  );

  const openCreate = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setMembershipRows(activeTenants.length ? [emptyRow(activeTenants)] : []);
    setCreateOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    if (isSuperProfile(u.role)) {
      toast.error("Super admin não pode ser editado nesta tela.");
      return;
    }
    setEditUser(u);
    setEditFullName(u.full_name ?? "");
    setEditRows(
      u.memberships.length > 0
        ? u.memberships.map((m) => ({
            tenant_id: m.tenant_id,
            role: (m.role === "tenant_admin" ? "tenant_admin" : "tenant_user") as TenantMembershipRole,
          }))
        : activeTenants.length
          ? [emptyRow(activeTenants)]
          : []
    );
  };

  const submitCreate = async () => {
    const rows = membershipRows.filter((r) => r.tenant_id);
    try {
      await createUser.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim() || null,
        memberships: rows,
      });
      toast.success("Usuário criado e vinculado às empresas.");
      setCreateOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao criar usuário";
      toast.error(msg);
    }
  };

  const submitEdit = async () => {
    if (!editUser) return;
    const rows = editRows.filter((r) => r.tenant_id);
    try {
      await updateUser.mutateAsync({
        id: editUser.id,
        full_name: editFullName.trim() || null,
        memberships: rows,
      });
      toast.success("Usuário atualizado.");
      setEditUser(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao atualizar";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre usuários do painel e defina em quais empresas entram e com qual função (admin da empresa ou só visualização).
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={openCreate} disabled={tenantsLoading || !activeTenants.length}>
          <UserPlus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Como funciona</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-foreground/90">Admin da empresa</strong> — pode configurar dados daquela empresa (agentes, módulos permitidos pelo super admin, etc.).
          </li>
          <li>
            <strong className="text-foreground/90">Visualização</strong> — acesso de leitura às telas da empresa, sem permissões de gestão.
          </li>
        </ul>
        <p className="mt-2 text-xs">
          Contas <strong className="text-foreground/90">super admin</strong> não são geridas aqui (perfil global).
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Erro ao carregar usuários: {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {usersLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / e-mail</TableHead>
                <TableHead>Perfil global</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.full_name || "—"}
                    <div className="text-xs text-muted-foreground font-normal truncate max-w-[260px]" title={u.email ?? u.id}>
                      {u.email ?? u.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isSuperProfile(u.role) ? "default" : "secondary"}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md">
                    {u.memberships.length === 0 ? (
                      "Nenhuma empresa"
                    ) : (
                      <ul className="space-y-0.5">
                        {u.memberships.map((m) => (
                          <li key={m.id}>
                            {m.tenants?.name ?? m.tenant_id.slice(0, 8) + "…"} —{" "}
                            <span className="text-foreground">
                              {m.role === "tenant_admin" ? "Admin da empresa" : "Visualização"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    {!isSuperProfile(u.role) ? (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <p className="text-sm text-muted-foreground">
              O usuário poderá entrar no painel com o e-mail e a senha abaixo. O perfil global será <strong>tenant_user</strong>; o acesso por empresa define admin ou visualização.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="nu-email">E-mail</Label>
              <Input
                id="nu-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
              />
            </div>
            <div>
              <Label htmlFor="nu-pass">Senha (mín. 8 caracteres)</Label>
              <Input
                id="nu-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="nu-name">Nome completo (opcional)</Label>
              <Input
                id="nu-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Maria Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>Acesso por empresa</Label>
              {membershipRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma empresa ativa para vincular.</p>
              ) : (
                membershipRows.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[160px]">
                      <Select
                        value={row.tenant_id}
                        onValueChange={(v) => {
                          const next = [...membershipRows];
                          next[idx] = { ...next[idx], tenant_id: v };
                          setMembershipRows(next);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Empresa" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeTenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[200px]">
                      <Select
                        value={row.role}
                        onValueChange={(v) => {
                          const next = [...membershipRows];
                          next[idx] = { ...next[idx], role: v as TenantMembershipRole };
                          setMembershipRows(next);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tenant_admin">Admin da empresa</SelectItem>
                          <SelectItem value="tenant_user">Visualização</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMembershipRows((r) => r.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMembershipRows((r) => [...r, emptyRow(activeTenants)])}
                disabled={!activeTenants.length}
              >
                + Adicionar empresa
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitCreate()} disabled={createUser.isPending}>
              {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Atualize o nome e os vínculos com empresas. Isso substitui a lista de empresas do usuário.
            </p>
          </DialogHeader>
          {editUser && (
            <>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Nome</Label>
                  <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Empresas</Label>
                  {editRows.map((row, idx) => (
                    <div key={idx} className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[160px]">
                        <Select
                          value={row.tenant_id}
                          onValueChange={(v) => {
                            const next = [...editRows];
                            next[idx] = { ...next[idx], tenant_id: v };
                            setEditRows(next);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeTenants.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-[200px]">
                        <Select
                          value={row.role}
                          onValueChange={(v) => {
                            const next = [...editRows];
                            next[idx] = { ...next[idx], role: v as TenantMembershipRole };
                            setEditRows(next);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tenant_admin">Admin da empresa</SelectItem>
                            <SelectItem value="tenant_user">Visualização</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditRows((r) => r.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditRows((r) => [...r, emptyRow(activeTenants)])}
                    disabled={!activeTenants.length}
                  >
                    + Adicionar empresa
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditUser(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => void submitEdit()} disabled={updateUser.isPending}>
                  {updateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
