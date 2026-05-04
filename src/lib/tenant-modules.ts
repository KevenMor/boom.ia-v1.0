export type ModuleGroup = "overview" | "infrastructure" | "system";

export type ModuleKey =
  | "dashboard"
  | "conversations"
  | "agents"
  | "calendar"
  | "financeiro"
  | "followups"
  | "inventory"
  | "occurrences"
  | "service_catalog"
  | "contacts"
  | "clients"
  | "tenants"
  | "tools"
  | "providers"
  | "analytics_tokens"
  | "prompts"
  | "monitoring"
  | "audit"
  | "settings"
  | "suite_galleries";

export type ModuleAction = "view" | "create" | "edit" | "delete" | "export" | "reply" | "cancel" | "register";

export interface ModuleActionDef {
  key: ModuleAction;
  label: string;
}

export interface TenantModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  group: ModuleGroup;
  actions: ModuleActionDef[];
}

const A = (key: ModuleAction, label: string): ModuleActionDef => ({ key, label });

export const TENANT_MODULES: TenantModuleDef[] = [
  {
    key: "dashboard",
    label: "Painel",
    description: "Visão geral da operação.",
    group: "overview",
    actions: [A("view", "Visualizar")],
  },
  {
    key: "conversations",
    label: "Chat ao Vivo",
    description: "Conversas e atendimento.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("reply", "Responder")],
  },
  {
    key: "agents",
    label: "Agentes",
    description: "Gestão de agentes IA.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "calendar",
    label: "Agenda",
    description: "Calendário e horários.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar evento"), A("edit", "Editar evento"), A("delete", "Deletar evento")],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Cobranças e disparos financeiros em lote.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar disparo")],
  },
  {
    key: "followups",
    label: "Follow-ups",
    description: "Fila de retornos automáticos.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("cancel", "Cancelar follow-up")],
  },
  {
    key: "inventory",
    label: "Inventário",
    description: "Estoque de veículos/produtos.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar"), A("export", "Exportar")],
  },
  {
    key: "occurrences",
    label: "Ocorrências",
    description: "Registo de ocorrências ligadas ao inventário.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("register", "Registrar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "service_catalog",
    label: "Catálogo",
    description: "Serviços e produtos (atendimento, agenda, RAG).",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "suite_galleries",
    label: "Galeria",
    description: "Fotos e vídeos por galeria.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Fazer upload"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "contacts",
    label: "Leads",
    description: "Gestão de contatos/leads.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar"), A("export", "Exportar")],
  },
  {
    key: "clients",
    label: "Clientes",
    description: "Base de clientes.",
    group: "overview",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar"), A("export", "Exportar")],
  },
  {
    key: "tenants",
    label: "Tenants",
    description: "Administração de empresas.",
    group: "infrastructure",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "tools",
    label: "Ferramentas",
    description: "Ferramentas de execução.",
    group: "infrastructure",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "providers",
    label: "Provedores",
    description: "Provedores e modelos.",
    group: "infrastructure",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "analytics_tokens",
    label: "Analytics Tokens",
    description: "Métricas de consumo.",
    group: "system",
    actions: [A("view", "Visualizar"), A("export", "Exportar")],
  },
  {
    key: "prompts",
    label: "Prompts",
    description: "Biblioteca de prompts.",
    group: "system",
    actions: [A("view", "Visualizar"), A("create", "Criar"), A("edit", "Editar"), A("delete", "Deletar")],
  },
  {
    key: "monitoring",
    label: "Monitoramento",
    description: "Saúde e execução.",
    group: "system",
    actions: [A("view", "Visualizar")],
  },
  {
    key: "audit",
    label: "Auditoria",
    description: "Trilhas de auditoria.",
    group: "system",
    actions: [A("view", "Visualizar"), A("export", "Exportar")],
  },
  {
    key: "settings",
    label: "Configurações",
    description: "Configurações gerais.",
    group: "system",
    actions: [A("view", "Visualizar"), A("edit", "Editar")],
  },
];

export function createDefaultModuleState(): Record<ModuleKey, boolean> {
  return TENANT_MODULES.reduce(
    (acc, module) => {
      acc[module.key] = true;
      return acc;
    },
    {} as Record<ModuleKey, boolean>
  );
}

/** Retorna todas as actions de um módulo habilitadas por padrão */
export function createDefaultActionsForModule(moduleKey: ModuleKey): ModuleAction[] {
  return TENANT_MODULES.find((m) => m.key === moduleKey)?.actions.map((a) => a.key) ?? [];
}
