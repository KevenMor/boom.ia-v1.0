export type ModuleGroup = "overview" | "infrastructure" | "system";

export type ModuleKey =
  | "dashboard"
  | "conversations"
  | "agents"
  | "calendar"
  | "followups"
  | "inventory"
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
  | "settings";

export interface TenantModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  group: ModuleGroup;
}

export const TENANT_MODULES: TenantModuleDef[] = [
  { key: "dashboard", label: "Painel", description: "Visão geral da operação.", group: "overview" },
  { key: "conversations", label: "Chat ao Vivo", description: "Conversas e atendimento.", group: "overview" },
  { key: "agents", label: "Agentes", description: "Gestão de agentes IA.", group: "overview" },
  { key: "calendar", label: "Agenda", description: "Calendário e horários.", group: "overview" },
  { key: "followups", label: "Follow-ups", description: "Fila de retornos automáticos.", group: "overview" },
  { key: "inventory", label: "Inventário", description: "Estoque de veículos/produtos.", group: "overview" },
  {
    key: "service_catalog",
    label: "Catálogo",
    description: "Serviços e produtos (atendimento, agenda, RAG).",
    group: "overview",
  },
  { key: "contacts", label: "Leads", description: "Gestão de contatos/leads.", group: "overview" },
  { key: "clients", label: "Clientes", description: "Base de clientes.", group: "overview" },
  { key: "tenants", label: "Tenants", description: "Administração de empresas.", group: "infrastructure" },
  { key: "tools", label: "Ferramentas", description: "Ferramentas de execução.", group: "infrastructure" },
  { key: "providers", label: "Provedores", description: "Provedores e modelos.", group: "infrastructure" },
  { key: "analytics_tokens", label: "Analytics Tokens", description: "Métricas de consumo.", group: "system" },
  { key: "prompts", label: "Prompts", description: "Biblioteca de prompts.", group: "system" },
  { key: "monitoring", label: "Monitoramento", description: "Saúde e execução.", group: "system" },
  { key: "audit", label: "Auditoria", description: "Trilhas de auditoria.", group: "system" },
  { key: "settings", label: "Configurações", description: "Configurações gerais.", group: "system" },
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
