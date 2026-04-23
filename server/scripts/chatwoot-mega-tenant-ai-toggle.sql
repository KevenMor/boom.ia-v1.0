-- =============================================================================
-- Dados para configurar o Dashboard Script no Mega (POST/GET /api/tenant-ai/*).
-- O script altera o status de TODOS os agentes da tenant (active/inactive), não ai_globally_enabled.
-- Executar no SQL Editor do Supabase (projeto Nexus / control plane).
-- Coluna tenants.ai_globally_enabled (migration 20260422160000) continua usada pelo servidor
-- como corte extra de emergência; o Mega não a mexe.
--
-- CORS (servidor Node / Easypanel .env), senão o Mega mostra "Failed to fetch":
--   TENANT_AI_TOGGLE_CORS_ORIGINS=<copia a "Origem" do painel do script, ex. https://mega...>
--   ou TENANT_AI_TOGGLE_CORS_ORIGINS=*.seudominio.com
-- =============================================================================

-- 1) Tenants com UUID, nome, slug e estado atual da IA global
SELECT
  t.id                    AS tenant_id,
  t.name                  AS tenant_name,
  t.slug,
  t.ai_globally_enabled,
  (SELECT COUNT(*)::int FROM public.agents a WHERE a.tenant_id = t.id) AS agents_count
FROM public.tenants t
ORDER BY t.name;

-- 2) Mesma lista com agentes (útil para confirmar qual tenant é a da instância Chatwoot)
SELECT
  t.id           AS tenant_id,
  t.name         AS tenant_name,
  t.slug,
  t.ai_globally_enabled,
  a.id           AS agent_id,
  a.name         AS agent_name,
  a.status       AS agent_status
FROM public.tenants t
LEFT JOIN public.agents a ON a.tenant_id = t.id
ORDER BY t.name, a.name;

-- 3) Se a coluna ainda não existir (migration não aplicada), verás erro — aplica então:
-- supabase db push / migração 20260422160000_tenant_ai_globally_enabled.sql
