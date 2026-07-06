-- ============================================================
-- 038 — Integração Asaas (gateway de pagamento) por tenant
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

-- 1) Config do Asaas por tenant (1 linha por empresa)
CREATE TABLE IF NOT EXISTS public.tenant_asaas_config (
  tenant_id          uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment        text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  api_key_encrypted  text,
  webhook_token      text,
  wallet_id          text,
  account_name       text,
  last_tested_at     timestamptz,
  last_test_status   text,
  last_test_error    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_asaas_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_asaas_read ON public.tenant_asaas_config;
CREATE POLICY tenant_asaas_read ON public.tenant_asaas_config
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = tenant_asaas_config.tenant_id
      AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS tenant_asaas_admin_write ON public.tenant_asaas_config;
CREATE POLICY tenant_asaas_admin_write ON public.tenant_asaas_config
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = tenant_asaas_config.tenant_id
      AND m.user_id = auth.uid()
      AND m.role = 'tenant_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = tenant_asaas_config.tenant_id
      AND m.user_id = auth.uid()
      AND m.role = 'tenant_admin'
  ));


-- 2) Contact: guardar id do customer Asaas
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_synced_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cpf_cnpj         text;

CREATE INDEX IF NOT EXISTS contacts_asaas_customer_id_idx
  ON public.contacts(asaas_customer_id) WHERE asaas_customer_id IS NOT NULL;


-- 3) Contact invoice: campos Asaas (100% nullable, não quebra nada existente)
ALTER TABLE public.contact_invoices
  ADD COLUMN IF NOT EXISTS asaas_charge_id        text,
  ADD COLUMN IF NOT EXISTS asaas_charge_url       text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url      text,
  ADD COLUMN IF NOT EXISTS asaas_bank_slip_url    text,
  ADD COLUMN IF NOT EXISTS asaas_pix_qrcode       text,
  ADD COLUMN IF NOT EXISTS asaas_pix_payload      text,
  ADD COLUMN IF NOT EXISTS asaas_billing_type     text,
  ADD COLUMN IF NOT EXISTS asaas_status           text,
  ADD COLUMN IF NOT EXISTS asaas_synced_at        timestamptz,
  ADD COLUMN IF NOT EXISTS asaas_last_error      text;

CREATE INDEX IF NOT EXISTS contact_invoices_asaas_charge_id_idx
  ON public.contact_invoices(asaas_charge_id) WHERE asaas_charge_id IS NOT NULL;