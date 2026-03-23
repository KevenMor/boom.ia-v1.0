-- Tabela de tipos de serviço por tenant para gestão dinâmica de agendamentos
-- Cada empresa cadastra seus próprios serviços com nome e duração
-- O agente recebe esses serviços em tempo de execução (sem hardcode no prompt)

CREATE TABLE public.calendar_service_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  description      TEXT DEFAULT NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.calendar_service_types IS
  'Tipos de serviço/procedimento oferecidos por cada tenant. Injetados dinamicamente no prompt do agente quando a tool de calendário está ativa.';

COMMENT ON COLUMN public.calendar_service_types.duration_minutes IS
  'Duração padrão do serviço em minutos. Usado pelo agente para calcular o end_at ao criar eventos.';

-- RLS: cada usuário vê apenas serviços do seu próprio tenant
ALTER TABLE public.calendar_service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_service_types_tenant_isolation"
  ON public.calendar_service_types
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Service role bypassa RLS (para o backend)
CREATE POLICY "calendar_service_types_service_role"
  ON public.calendar_service_types
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Índice para queries por tenant (listagem + filtro active)
CREATE INDEX idx_calendar_service_types_tenant
  ON public.calendar_service_types (tenant_id, active);
