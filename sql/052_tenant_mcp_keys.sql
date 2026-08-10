-- ============================================================
-- 052 — Tabela de API Keys MCP por Tenant
-- Permite que cada tenant gere chaves para conectar clientes MCP
-- (Claude Desktop, Cursor, etc.) ao sistema Boom IA.
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_mcp_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,   -- SHA-256 do token completo (nunca armazenar o token em si)
  key_preview   TEXT NOT NULL,          -- primeiros 8 chars do token para exibição (ex: boomsk_ab)
  label         TEXT NOT NULL DEFAULT 'default',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- Índice para lookup rápido por hash (caminho quente de autenticação MCP)
CREATE INDEX IF NOT EXISTS idx_tenant_mcp_keys_hash ON public.tenant_mcp_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_mcp_keys_tenant ON public.tenant_mcp_keys (tenant_id);

-- RLS: apenas o próprio tenant (autenticado) e service_role podem ver suas keys
ALTER TABLE public.tenant_mcp_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_mcp_keys_select_own"
  ON public.tenant_mcp_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE tenant_id = tenant_mcp_keys.tenant_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_mcp_keys_insert_own"
  ON public.tenant_mcp_keys FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE tenant_id = tenant_mcp_keys.tenant_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_mcp_keys_delete_own"
  ON public.tenant_mcp_keys FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE tenant_id = tenant_mcp_keys.tenant_id
        AND user_id = auth.uid()
    )
  );
