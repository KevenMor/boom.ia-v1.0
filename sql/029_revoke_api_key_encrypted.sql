-- ============================================================
-- Boom IA — Segurança: bloquear leitura de api_key_encrypted
-- A coluna só deve ser acessível via service_role (usado pelo
-- backend em /admin/provider-keys para encrypt/decrypt).
-- ============================================================

REVOKE SELECT (api_key_encrypted) ON public.providers FROM anon, authenticated;
