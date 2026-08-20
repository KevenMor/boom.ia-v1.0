/**
 * useMcpKeys.ts — React Query hooks para gerenciamento de API Keys MCP por tenant
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { getApiBase } from "@/lib/api-client";
import { useTenantContext } from "@/contexts/TenantContext";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await nexusDb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Não autenticado.");
  return {
    Authorization: `Bearer ${token}`,
    "x-nexus-auth": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function mcpKeysUrl(tenantId?: string | null, suffix = ""): string {
  const base = `${getApiBase()}/mcp-keys${suffix}`;
  if (!tenantId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}tenant_id=${encodeURIComponent(tenantId)}`;
}

export interface McpKey {
  id: string;
  label: string;
  key_preview: string;
  created_at: string;
  last_used_at: string | null;
}

/** Lista todas as MCP keys do tenant */
export function useMcpKeys() {
  const { selectedTenantId } = useTenantContext();
  return useQuery({
    queryKey: ["mcp-keys", selectedTenantId ?? "all"],
    queryFn: async (): Promise<McpKey[]> => {
      const headers = await getAuthHeaders();
      const res = await fetch(mcpKeysUrl(selectedTenantId), { headers });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Erro ao carregar chaves MCP.");
      }
      const json = await res.json();
      return json.keys ?? [];
    },
  });
}

/** Gera uma nova MCP key — retorna o token completo (exposto uma única vez) */
export function useCreateMcpKey() {
  const qc = useQueryClient();
  const { selectedTenantId } = useTenantContext();
  return useMutation({
    mutationFn: async (label: string): Promise<{ token: string; key: McpKey }> => {
      const headers = await getAuthHeaders();
      const res = await fetch(mcpKeysUrl(selectedTenantId), {
        method: "POST",
        headers,
        body: JSON.stringify({ label, tenant_id: selectedTenantId ?? undefined }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Erro ao gerar chave MCP.");
      }
      const json = await res.json();
      return { token: json.token, key: { id: json.id, label: json.label, key_preview: json.key_preview, created_at: json.created_at, last_used_at: null } };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-keys"] }),
  });
}

/** Revoga (deleta) uma MCP key */
export function useRevokeMcpKey() {
  const qc = useQueryClient();
  const { selectedTenantId } = useTenantContext();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const headers = await getAuthHeaders();
      const res = await fetch(mcpKeysUrl(selectedTenantId, `/${id}`), { method: "DELETE", headers });
      if (!res.ok) throw new Error("Erro ao revogar chave MCP.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-keys"] }),
  });
}

/** Monta a URL para download do mcp-config.json com o token gerado */
export function buildMcpConfigUrl(token: string): string {
  return mcpKeysUrl(null, `/config?token=${encodeURIComponent(token)}`);
}
