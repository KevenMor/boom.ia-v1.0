// ============================================================
// Nexus AI — Prompt Registry
// Maps tenant slugs to their prompt extensions.
// To add a new tenant: create a file and register it here.
// ============================================================

import { BASE_GREETING } from "./base.ts";
import { SYSTEM_PROMPT_EXTENSION as PPL_MOTORS } from "./ppl-motors.ts";

/**
 * Registry de prompts por tenant slug.
 * Chave = slug do tenant (conforme DB).
 * Valor = string com instruções extras que serão CONCATENADAS ao system_prompt do agente.
 */
const TENANT_PROMPTS: Record<string, string> = {
  // PPL Motors — slug legado com typo
  "ppl-mortors": PPL_MOTORS,
  // Alias correto caso seja corrigido no futuro
  "ppl-motors": PPL_MOTORS,
};

/**
 * Retorna o prompt completo para um agente, compondo:
 * 1. system_prompt do agente (do banco)
 * 2. Extensão do tenant (se existir no registry)
 * 3. Instruções base de saudação (sempre)
 *
 * @param agentSystemPrompt - system_prompt configurado no agente
 * @param tenantSlug - slug do tenant
 * @param hasInventoryTool - se o agente possui tool de inventory_query
 */
export function buildSystemPrompt(
  agentSystemPrompt: string,
  tenantSlug: string | null,
  hasInventoryTool: boolean,
): string {
  const base = agentSystemPrompt || "You are a helpful AI assistant.";

  // Tenant-specific extension
  let extension = "";
  if (tenantSlug && TENANT_PROMPTS[tenantSlug]) {
    extension = "\n\n" + TENANT_PROMPTS[tenantSlug];
  }

  // Only include vehicle-specific extension if agent has inventory tool
  // (prevents non-vehicle tenants from getting irrelevant instructions)
  if (!hasInventoryTool) {
    extension = "";
  }

  const greeting = "\n\n" + BASE_GREETING;

  return base + extension + greeting;
}
