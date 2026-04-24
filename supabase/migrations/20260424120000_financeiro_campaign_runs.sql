-- Histórico de campanhas financeiras (disparos em lote), escopo por tenant.

CREATE TABLE IF NOT EXISTS public.financeiro_campaign_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id TEXT,
  message_template TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_campaign_runs_tenant_created
  ON public.financeiro_campaign_runs(tenant_id, created_at DESC);

ALTER TABLE public.financeiro_campaign_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeiro_campaign_runs select"
  ON public.financeiro_campaign_runs
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin() OR public.user_has_tenant_access(tenant_id));

CREATE POLICY "financeiro_campaign_runs insert"
  ON public.financeiro_campaign_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_tenant_access(tenant_id)
    AND created_by = auth.uid()
  );

GRANT SELECT, INSERT ON public.financeiro_campaign_runs TO authenticated;
GRANT ALL ON public.financeiro_campaign_runs TO service_role;
