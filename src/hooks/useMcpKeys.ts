/**
 * useMcpKeys.ts — React Query hooks para gerenciamento de API Keys MCP por tenant
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await nexusDb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Não autenticado.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
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
  return useQuery({
    queryKey: ["mcp-keys"],
    queryFn: async (): Promise<McpKey[]> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/mcp-keys`, { headers });
      if (!res.ok) throw new Error("Erro ao carregar chaves MCP.");
      const json = await res.json();
      return json.keys ?? [];
    },
  });
}

/** Gera uma nova MCP key — retorna o token completo (exposto uma única vez) */
export function useCreateMcpKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string): Promise<{ token: string; key: McpKey }> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/mcp-keys`, {
        method: "POST",
        headers,
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).error ?? "Erro ao gerar chave MCP.");
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
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/mcp-keys/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Erro ao revogar chave MCP.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-keys"] }),
  });
}

/** Monta a URL para download do mcp-config.json com o token gerado */
export function buildMcpConfigUrl(token: string): string {
  return `${API_BASE}/mcp-keys/config?token=${encodeURIComponent(token)}`;
}
