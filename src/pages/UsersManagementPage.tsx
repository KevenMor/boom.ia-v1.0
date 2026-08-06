import { useMemo, useState, useEffect } from "react";
import { UserPlus, Pencil, Loader2, Trash2, Search, Users, ShieldCheck, Lock, ChevronDown } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useAuth } from "@/contexts/AuthContext";
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeleteAdminUser,
  type AdminUser,
  type TenantMembershipRole,
} from "@/hooks/useAdminUsers";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUserModuleAcl, useSaveUserModuleAcl } from "@/hooks/useUserModuleAcl";
import { TENANT_MODULES, createDefaultModuleState, type ModuleGroup, type ModuleKey, type ModuleAction } from "@/lib/tenant-modules";

const GROUP_LABELS: Record<ModuleGroup, string> = {
  overview: "Visão geral",
  infrastructure: "Infraestrutura",
  system: "Sistema",
};
const GROUP_ORDER: ModuleGroup[] = ["overview", "infrastructure", "system"];

type MembershipDraft = { tenant_id: string; role: TenantMembershipRole };

function emptyRow(tenants: { id: string }[], existing: string[] = []): MembershipDraft {
  const first = tenants.find((t) => !existing.includes(t.id)) ?? tenants[0];
  return { tenant_id: first?.id ?? "", role: "tenant_user" };
}

function isSuperProfile(role: string) {
  const r = role.toLowerCase().replace(/[\s-]+/g, "_");
  return r === "superadmin" || r === "super_admin";
}

function avatarColor(str: string): string {
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-rose-500",
    "bg-amber-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string | null, email: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(" ");
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email ?? "?").slice(0, 2).toUpperCase();
}

function RoleBadge({ role }: { role: string }) {
  if (isSuperProfile(role)) {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
        <ShieldCheck className="h-3 w-3" />
        superadmin
      </Badge>
    );
  }
  if (role === "tenant_admin") {
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 hover:bg-amber-500/20">
        tenant_admin
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      {role}
    </Badge>
  );
}

function MembershipRoleLabel({ role }: { role: string }) {
  if (role === "tenant_admin") return <span className="text-amber-400 font-medium">Admin</span>;
  return <span className="text-muted-foreground">Visualização</span>;
}

function MembershipRows({
  rows,
  activeTenants,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: MembershipDraft[];
  activeTenants: { id: string; name: string }[];
  onChange: (idx: number, field: keyof MembershipDraft, value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
}) {
  const selectedIds = rows.map((r) => r.tenant_id).filter(Boolean);
  const remaining = activeTenants.filter((t) => !selectedIds.includes(t.id));
  const canAddMore = remaining.length > 0;

  return (
    <div className="space-y-1.5">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma empresa ativa para vincular.</p>
      ) : (
        rows.map((row, idx) => {
          const thisTenant = activeTenants.find((t) => t.id === row.tenant_id);
          // Options = other unselected tenants + the current row's tenant
          const options = activeTenants.filter(
            (t) => t.id === row.tenant_id || !selectedIds.includes(t.id)
          );
          return (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2"
            >
              {/* Company name / select */}
              <div className="flex-1 min-w-0">
                <Select value={row.tenant_id} onValueChange={(v) => onChange(idx, "tenant_id", v)}>
                  <SelectTrigger className="h-8 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus:ring-0">
                    <SelectValue placeholder="Selecionar empresa">
                      {thisTenant?.name ?? "Selecionar empresa"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Role toggle */}
              <div className="shrink-0">
                <Select value={row.role} onValueChange={(v) => onChange(idx, "role", v)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_admin">Admin</SelectItem>
                    <SelectItem value="tenant_user">Visualização</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full mt-1 border-dashed text-muted-foreground hover:text-foreground"
        onClick={onAdd}
        disabled={!canAddMore}
      >
        + Adicionar empresa
        {!canAddMore && rows.length > 0 && (
          <span className="ml-1 text-xs opacity-60">(todas vinculadas)</span>
        )}
      </Button>
    </div>
  );
}

// State shape for the ACL editor
interface AclModuleState {
  enabled: boolean;
  // null = all actions allowed; Set = only these actions allowed
  actions: Set<ModuleAction> | null;
}

function buildDefaultAclState(): Record<ModuleKey, AclModuleState> {
  return TENANT_MODULES.reduce((acc, m) => {
    acc[m.key] = { enabled: true, actions: null };
    return acc;
  }, {} as Record<ModuleKey, AclModuleState>);
}

// Per-tenant ACL editor shown inside the edit dialog
function UserAclPanel({ userId, tenantId }: { userId: string; tenantId: string }) {
  const { data: aclEntries, isLoading } = useUserModuleAcl(userId, tenantId);
  const saveAcl = useSaveUserModuleAcl();

  const [isCustom, setIsCustom] = useState(false);
  const [aclState, setAclState] = useState<Record<ModuleKey, AclModuleState>>(buildDefaultAclState);
  const [initialized, setInitialized] = useState(false);
  const [expandedModule, setExpandedModule] = useState<ModuleKey | null>(null);

  useEffect(() => {
    if (isLoading || initialized) return;
    if (aclEntries && aclEntries.length > 0) {
      const state = buildDefaultAclState();
      for (const e of aclEntries) {
        const key = e.module_key as ModuleKey;
        if (!(key in state)) continue;
        state[key] = {
          enabled: e.enabled,
          actions: e.allowed_actions ? new Set(e.allowed_actions) : null,
        };
      }
      setAclState(state);
      setIsCustom(true);
    }
    setInitialized(true);
  }, [aclEntries, isLoading, initialized]);

  const handleToggleCustom = (on: boolean) => {
    setIsCustom(on);
    if (on) setAclState(buildDefaultAclState());
  };

  const toggleModule = (key: ModuleKey, enabled: boolean) => {
    setAclState((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled, actions: enabled ? prev[key].actions : null },
    }));
    if (!enabled && expandedModule === key) setExpandedModule(null);
  };

  const toggleAction = (moduleKey: ModuleKey, action: ModuleAction, checked: boolean) => {
    setAclState((prev) => {
      const mod = prev[moduleKey];
      const modDef = TENANT_MODULES.find((m) => m.key === moduleKey)!;
      // If currently null (all allowed), expand to full set first
      const current = mod.actions ?? new Set(modDef.actions.map((a) => a.key));
      const next = new Set(current);
      if (checked) next.add(action);
      else next.delete(action);
      // If all actions selected → back to null (all allowed)
      const allKeys = modDef.actions.map((a) => a.key);
      const isAll = allKeys.every((k) => next.has(k));
      return { ...prev, [moduleKey]: { ...mod, actions: isAll ? null : next } };
    });
  };

  const handleSave = async () => {
    const modules = isCustom
      ? TENANT_MODULES.map((m) => ({
          module_key: m.key,
          enabled: aclState[m.key].enabled,
          allowed_actions: aclState[m.key].actions ? Array.from(aclState[m.key].actions!) : null,
        }))
      : [];
    try {
      await saveAcl.mutateAsync({ userId, tenantId, modules });
      toast.success("Permissões salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar permissões");
    }
  };

  if (isLoading || !initialized) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }

  return (
    <div className="space-y-3">
      {/* Inherit vs custom toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Permissões customizadas</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isCustom ? "Usando permissões próprias deste usuário" : "Herdando permissões da empresa"}
          </p>
        </div>
        <Switch checked={isCustom} onCheckedChange={handleToggleCustom} />
      </div>

      {/* Module + actions — only shown when custom */}
      {isCustom && (
        <div className="space-y-3">
          {GROUP_ORDER.map((group) => {
            const mods = TENANT_MODULES.filter((m) => m.group === group);
            return (
              <div key={group} className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-0.5">
                  {GROUP_LABELS[group]}
                </p>
                {mods.map((mod) => {
                  const modState = aclState[mod.key];
                  const isExpanded = expandedModule === mod.key;
                  const hasRestrictions = modState.enabled && modState.actions !== null;
                  const allowedCount = modState.actions?.size ?? mod.actions.length;

                  return (
                    <div
                      key={mod.key}
                      className={cn(
                        "rounded-lg border transition-colors",
                        modState.enabled ? "border-border bg-muted/20" : "border-border/40 bg-muted/5 opacity-50"
                      )}
                    >
                      {/* Module header row */}
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Switch
                          checked={modState.enabled}
                          onCheckedChange={(v) => toggleModule(mod.key, v)}
                          className="scale-90 shrink-0"
                        />
                        <span className="flex-1 text-xs font-medium text-foreground">{mod.label}</span>

                        {/* Action count badge + expand button */}
                        {modState.enabled && mod.actions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setExpandedModule(isExpanded ? null : mod.key)}
                            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <span className={cn(hasRestrictions && "text-amber-400 font-medium")}>
                              {allowedCount}/{mod.actions.length} ações
                            </span>
                            <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                          </button>
                        )}
                      </div>

                      {/* Actions checkboxes */}
                      {isExpanded && modState.enabled && (
                        <div className="border-t border-border/60 px-3 pb-3 pt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                          {mod.actions.map((action) => {
                            const checked = modState.actions === null || modState.actions.has(action.key);
                            return (
                              <label
                                key={action.key}
                                className="flex items-center gap-2 cursor-pointer group"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleAction(mod.key, action.key, e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                                />
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                  {action.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={() => void handleSave()} disabled={saveAcl.isPending} className="gap-2">
          {saveAcl.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salvar permissões
        </Button>
      </div>
    </div>
  );
}

export default function UsersManagementPage() {
  const { isSuperAdmin } = useAuth();
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const { data: users, isLoading: usersLoading, error } = useAdminUsers();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState("");
  const [editAclTenant, setEditAclTenant] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [membershipRows, setMembershipRows] = useState<MembershipDraft[]>([]);
  const [ensurePersonalCalendar, setEnsurePersonalCalendar] = useState(true);

  const [editFullName, setEditFullName] = useState("");
  const [editRows, setEditRows] = useState<MembershipDraft[]>([]);
  const [editEnsureCalendar, setEditEnsureCalendar] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordConfirm, setEditPasswordConfirm] = useState("");

  const activeTenants = useMemo(
    () => (tenants ?? []).filter((t) => t.status === "active"),
    [tenants]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const openCreate = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setMembershipRows(activeTenants.length ? [emptyRow(activeTenants)] : []);
    setEnsurePersonalCalendar(true);
    setCreateOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditFullName(u.full_name ?? "");
    setEditPassword("");
    setEditPasswordConfirm("");
    const rows = u.memberships.length > 0
      ? u.memberships.map((m) => ({
          tenant_id: m.tenant_id,
          role: (m.role === "tenant_admin" ? "tenant_admin" : "tenant_user") as TenantMembershipRole,
        }))
      : activeTenants.length
        ? [emptyRow(activeTenants)]
        : [];
    setEditRows(rows);
    setEditAclTenant(rows[0]?.tenant_id ?? null);
    setEditEnsureCalendar(true);
  };

  const submitCreate = async () => {
    const rows = membershipRows.filter((r) => r.tenant_id);
    try {
      await createUser.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim() || null,
        memberships: rows,
        ensure_personal_calendars: ensurePersonalCalendar,
      });
      toast.success(
        ensurePersonalCalendar
          ? "Usuário criado, vinculado e com agenda pessoal."
          : "Usuário criado e vinculado às empresas."
      );
      setCreateOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário");
    }
  };

  const submitEdit = async () => {
    if (!editUser) return;
    const rows = editRows.filter((r) => r.tenant_id);
    const nextPassword = editPassword.trim();
    if (nextPassword || editPasswordConfirm) {
      if (nextPassword.length < 8) {
        toast.error("A nova senha deve ter pelo menos 8 caracteres.");
        return;
      }
      if (nextPassword !== editPasswordConfirm) {
        toast.error("A confirmação da senha não confere.");
        return;
      }
    }
    try {
      await updateUser.mutateAsync({
        id: editUser.id,
        full_name: editFullName.trim() || null,
        memberships: rows,
        ensure_personal_calendars: editEnsureCalendar,
        ...(nextPassword ? { password: nextPassword } : {}),
      });
      toast.success(
        nextPassword
          ? "Usuário atualizado e senha alterada."
          : editEnsureCalendar
            ? "Usuário atualizado (agenda pessoal garantida)."
            : "Usuário atualizado."
      );
      setEditUser(null);
      setEditPassword("");
      setEditPasswordConfirm("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      toast.success("Usuário removido.");
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover usuário");
    }
  };

  const changeMembershipRow = (
    rows: MembershipDraft[],
    setRows: (r: MembershipDraft[]) => void,
    idx: number,
    field: keyof MembershipDraft,
    value: string
  ) => {
    const next = [...rows];
    next[idx] = { ...next[idx], [field]: value };
    setRows(next);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Usuários</h2>
            {!usersLoading && users && (
              <Badge variant="secondary" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {users.length}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Cadastre usuários do painel e defina em quais empresas entram e com qual função.
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={openCreate} disabled={tenantsLoading || !activeTenants.length}>
          <UserPlus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      {/* Info card */}
      <div className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Como funciona</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-foreground/90">Admin da empresa</strong> — pode configurar dados daquela empresa (agentes, módulos, etc.).
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

      {/* Search */}
      {!usersLoading && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Table */}
      {usersLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
          <Users className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
          </p>
          {search && (
            <button onClick={() => setSearch("")} className="mt-2 text-xs text-primary hover:underline">
              Limpar busca
            </button>
          )}
        </div>
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
              {filteredUsers.map((u) => {
                const initials = getInitials(u.full_name, u.email);
                const color = avatarColor(u.email ?? u.id);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", color)}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-foreground leading-none">
                            {u.full_name || <span className="text-muted-foreground italic">Sem nome</span>}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5" title={u.email ?? u.id}>
                            {u.email ?? u.id}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="text-sm max-w-md">
                      {u.memberships.length === 0 ? (
                        <span className="text-muted-foreground text-xs">Nenhuma empresa</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {u.memberships.map((m) => (
                            <span
                              key={m.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                                m.role === "tenant_admin"
                                  ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                                  : "border-border bg-muted/50 text-muted-foreground"
                              )}
                            >
                              {m.tenants?.name ?? m.tenant_id.slice(0, 8) + "…"}
                              <span className="opacity-60">·</span>
                              <MembershipRoleLabel role={m.role} />
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {(isSuperAdmin || !isSuperProfile(u.role)) && (
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(u)}
                            title="Remover usuário"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
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
              O usuário poderá entrar no painel com o e-mail e a senha abaixo. O perfil global será <strong>tenant_user</strong>.
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
              <MembershipRows
                rows={membershipRows}
                activeTenants={activeTenants}
                onChange={(idx, field, value) =>
                  changeMembershipRow(membershipRows, setMembershipRows, idx, field, value)
                }
                onRemove={(idx) => setMembershipRows((r) => r.filter((_, i) => i !== idx))}
                onAdd={() => setMembershipRows((r) => [...r, emptyRow(activeTenants, r.map((x) => x.tenant_id))])}
              />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                checked={ensurePersonalCalendar}
                onChange={(e) => setEnsurePersonalCalendar(e.target.checked)}
              />
              <span className="text-sm leading-snug">
                <span className="font-medium">Criar agenda pessoal</span>
                <span className="block text-muted-foreground text-xs mt-0.5">
                  Para cada empresa com perfil &quot;Visualização&quot; (tenant_user), cria uma agenda vinculada a este usuário (ex.: corretor).
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => void submitCreate()} disabled={createUser.isPending}>
              {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editUser?.full_name || editUser?.email}
            </p>
          </DialogHeader>
          {editUser && (
            <Tabs defaultValue="dados" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="dados" className="flex-1">Dados e empresas</TabsTrigger>
                <TabsTrigger value="permissoes" className="flex-1 gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  Permissões
                </TabsTrigger>
              </TabsList>

              {/* Aba Dados */}
              <TabsContent value="dados" className="space-y-4 pt-2">
                <div>
                  <Label>E-mail</Label>
                  <Input value={editUser.email ?? ""} disabled className="bg-muted/40" />
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
                </div>
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Alterar senha</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deixe em branco para manter a senha atual. Mínimo de 8 caracteres.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="eu-pass">Nova senha</Label>
                    <Input
                      id="eu-pass"
                      type="password"
                      autoComplete="new-password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <Label htmlFor="eu-pass2">Confirmar nova senha</Label>
                    <Input
                      id="eu-pass2"
                      type="password"
                      autoComplete="new-password"
                      value={editPasswordConfirm}
                      onChange={(e) => setEditPasswordConfirm(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Empresas</Label>
                  <MembershipRows
                    rows={editRows}
                    activeTenants={activeTenants}
                    onChange={(idx, field, value) => {
                      changeMembershipRow(editRows, setEditRows, idx, field, value);
                      if (field === "tenant_id" && idx === 0) setEditAclTenant(value);
                    }}
                    onRemove={(idx) => {
                      setEditRows((r) => {
                        const next = r.filter((_, i) => i !== idx);
                        setEditAclTenant(next[0]?.tenant_id ?? null);
                        return next;
                      });
                    }}
                    onAdd={() => setEditRows((r) => [...r, emptyRow(activeTenants, r.map((x) => x.tenant_id))])}
                  />
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-border p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                    checked={editEnsureCalendar}
                    onChange={(e) => setEditEnsureCalendar(e.target.checked)}
                  />
                  <span className="text-sm leading-snug">
                    <span className="font-medium">Garantir agenda pessoal</span>
                    <span className="block text-muted-foreground text-xs mt-0.5">
                      Cria a agenda do corretor se ainda não existir nas empresas com perfil tenant_user.
                    </span>
                  </span>
                </label>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
                  <Button onClick={() => void submitEdit()} disabled={updateUser.isPending}>
                    {updateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                  </Button>
                </DialogFooter>
              </TabsContent>

              {/* Aba Permissões */}
              <TabsContent value="permissoes" className="pt-2 space-y-3">
                {editRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Vincule o usuário a pelo menos uma empresa para definir permissões.
                  </p>
                ) : (
                  <>
                    {editRows.length > 1 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Empresa</Label>
                        <Select value={editAclTenant ?? ""} onValueChange={setEditAclTenant}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecione a empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            {editRows.filter((r) => r.tenant_id).map((r) => {
                              const t = activeTenants.find((x) => x.id === r.tenant_id);
                              return (
                                <SelectItem key={r.tenant_id} value={r.tenant_id}>
                                  {t?.name ?? r.tenant_id}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {editAclTenant && (
                      <UserAclPanel
                        key={`${editUser.id}-${editAclTenant}`}
                        userId={editUser.id}
                        tenantId={editAclTenant}
                      />
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>?
              Esta ação não pode ser desfeita e remove todos os vínculos com empresas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void submitDelete()}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
