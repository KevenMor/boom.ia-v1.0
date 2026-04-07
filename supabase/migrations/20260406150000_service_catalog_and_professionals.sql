-- Catálogo inteligente (serviços/produtos), profissionais, vínculos N:N e exceções de agenda.
-- RLS: leitura para quem tem acesso ao tenant; escrita para tenant_admin (e superadmin onde aplicável).

-- ---------------------------------------------------------------------------
-- 1. Categorias por tenant (opcional; itens podem ficar sem categoria)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_tenant
  ON public.catalog_categories (tenant_id);

COMMENT ON TABLE public.catalog_categories IS
  'Categorias do catálogo (ex.: Habilitação, Estética) por tenant.';

-- ---------------------------------------------------------------------------
-- 2. Profissionais
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  photo_url text,
  bio_short text,
  working_hours jsonb DEFAULT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON public.professionals (tenant_id);

-- CREATE TABLE IF NOT EXISTS não adiciona colunas se a tabela já existia (ex.: stub antigo).
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT NULL;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.professionals.working_hours IS
  'Horários recorrentes por dia (seg-dom). Mesmo padrão sugerido em calendars.working_hours.';

-- ---------------------------------------------------------------------------
-- 3. Itens do catálogo (serviço ou produto)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.catalog_categories (id) ON DELETE SET NULL,

  name text NOT NULL,
  item_type text NOT NULL DEFAULT 'service'
    CHECK (item_type IN ('service', 'product')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'coming_soon')),
  image_url text,

  description text,
  faq_text text,

  price_standard numeric(14, 2),
  price_promo numeric(14, 2),
  promo_valid_until date,
  payment_methods text[] DEFAULT '{}',
  max_installments int,
  installment_note text,
  cancellation_policy text,

  duration_minutes int,
  buffer_after_minutes int,
  attendance_type text
    CHECK (attendance_type IS NULL OR attendance_type IN ('individual', 'group')),
  max_capacity int,
  resource_required text,
  available_weekdays smallint[] DEFAULT NULL,

  prerequisites text,
  target_audience text,

  rag_synced_at timestamptz,
  rag_sync_status text NOT NULL DEFAULT 'pending'
    CHECK (rag_sync_status IN ('pending', 'synced', 'error')),
  rag_last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT catalog_items_available_weekdays_range CHECK (
    available_weekdays IS NULL
    OR available_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  )
);

-- Tabela já existente (CREATE IF NOT EXISTS) não ganha colunas novas; índices/COMMENT exigem que existam.
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.catalog_categories (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS faq_text text,
  ADD COLUMN IF NOT EXISTS price_standard numeric(14, 2),
  ADD COLUMN IF NOT EXISTS price_promo numeric(14, 2),
  ADD COLUMN IF NOT EXISTS promo_valid_until date,
  ADD COLUMN IF NOT EXISTS payment_methods text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_installments int,
  ADD COLUMN IF NOT EXISTS installment_note text,
  ADD COLUMN IF NOT EXISTS cancellation_policy text,
  ADD COLUMN IF NOT EXISTS duration_minutes int,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes int,
  ADD COLUMN IF NOT EXISTS attendance_type text,
  ADD COLUMN IF NOT EXISTS max_capacity int,
  ADD COLUMN IF NOT EXISTS resource_required text,
  ADD COLUMN IF NOT EXISTS available_weekdays smallint[],
  ADD COLUMN IF NOT EXISTS prerequisites text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS rag_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS rag_sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rag_last_error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant ON public.catalog_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_status ON public.catalog_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_type ON public.catalog_items (tenant_id, item_type);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON public.catalog_items (category_id);

COMMENT ON TABLE public.catalog_items IS
  'Cadastro estruturado de serviços/produtos para atendimento, RAG e agendamento.';
COMMENT ON COLUMN public.catalog_items.available_weekdays IS
  '0=domingo … 6=sábado (convenção ISO extract(dow)). NULL = sem restrição explícita no cadastro.';
COMMENT ON COLUMN public.catalog_items.payment_methods IS
  'Valores sugeridos: pix, credit_card, debit_card, boleto, cash (livre para o app validar).';
COMMENT ON COLUMN public.catalog_items.rag_sync_status IS
  'Estado da última sincronização do texto derivado com o índice RAG.';

-- ---------------------------------------------------------------------------
-- 4. Profissionais habilitados por item (N:N) + no máximo um padrão por item
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_item_professionals (
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items (id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_item_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_professionals_professional
  ON public.catalog_item_professionals (professional_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_item_one_default_professional
  ON public.catalog_item_professionals (catalog_item_id)
  WHERE is_default = true;

-- ---------------------------------------------------------------------------
-- 5. Upsell / itens relacionados (N:N, mesmo tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_item_related (
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items (id) ON DELETE CASCADE,
  related_catalog_item_id uuid NOT NULL REFERENCES public.catalog_items (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_item_id, related_catalog_item_id),
  CONSTRAINT catalog_item_related_distinct CHECK (catalog_item_id <> related_catalog_item_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_related_related
  ON public.catalog_item_related (related_catalog_item_id);

-- ---------------------------------------------------------------------------
-- 6. Bloqueios / exceções na agenda do profissional
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_schedule_exceptions_range CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_professional_schedule_exceptions_professional
  ON public.professional_schedule_exceptions (professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_schedule_exceptions_range
  ON public.professional_schedule_exceptions (professional_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Integridade: vínculos e relacionamentos só dentro do mesmo tenant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_enforce_same_tenant_item_professional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t_item uuid;
  t_prof uuid;
BEGIN
  SELECT tenant_id INTO t_item FROM public.catalog_items WHERE id = NEW.catalog_item_id;
  SELECT tenant_id INTO t_prof FROM public.professionals WHERE id = NEW.professional_id;
  IF t_item IS NULL OR t_prof IS NULL OR t_item <> t_prof THEN
    RAISE EXCEPTION 'catalog_item_professionals: item e profissional devem pertencer ao mesmo tenant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_item_professionals_same_tenant ON public.catalog_item_professionals;
CREATE TRIGGER trg_catalog_item_professionals_same_tenant
  BEFORE INSERT OR UPDATE ON public.catalog_item_professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_enforce_same_tenant_item_professional();

CREATE OR REPLACE FUNCTION public.catalog_enforce_same_tenant_related()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t_a uuid;
  t_b uuid;
BEGIN
  SELECT tenant_id INTO t_a FROM public.catalog_items WHERE id = NEW.catalog_item_id;
  SELECT tenant_id INTO t_b FROM public.catalog_items WHERE id = NEW.related_catalog_item_id;
  IF t_a IS NULL OR t_b IS NULL OR t_a <> t_b THEN
    RAISE EXCEPTION 'catalog_item_related: itens devem pertencer ao mesmo tenant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_item_related_same_tenant ON public.catalog_item_related;
CREATE TRIGGER trg_catalog_item_related_same_tenant
  BEFORE INSERT OR UPDATE ON public.catalog_item_related
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_enforce_same_tenant_related();

CREATE OR REPLACE FUNCTION public.catalog_items_category_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cat_tenant uuid;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.tenant_id INTO cat_tenant
  FROM public.catalog_categories c
  WHERE c.id = NEW.category_id;
  IF cat_tenant IS NULL OR cat_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'catalog_items: categoria deve pertencer ao mesmo tenant do item';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_items_category_tenant ON public.catalog_items;
CREATE TRIGGER trg_catalog_items_category_tenant
  BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_items_category_same_tenant();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_categories_updated_at ON public.catalog_categories;
CREATE TRIGGER trg_catalog_categories_updated_at
  BEFORE UPDATE ON public.catalog_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_touch_updated_at();

DROP TRIGGER IF EXISTS trg_professionals_updated_at ON public.professionals;
CREATE TRIGGER trg_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_touch_updated_at();

DROP TRIGGER IF EXISTS trg_catalog_items_updated_at ON public.catalog_items;
CREATE TRIGGER trg_catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_touch_updated_at();

DROP TRIGGER IF EXISTS trg_professional_schedule_exceptions_updated_at ON public.professional_schedule_exceptions;
CREATE TRIGGER trg_professional_schedule_exceptions_updated_at
  BEFORE UPDATE ON public.professional_schedule_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_related ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_schedule_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped select catalog_categories" ON public.catalog_categories;
DROP POLICY IF EXISTS "Tenant admin can manage catalog_categories" ON public.catalog_categories;
DROP POLICY IF EXISTS "Service role can manage catalog_categories" ON public.catalog_categories;

DROP POLICY IF EXISTS "Tenant scoped select professionals" ON public.professionals;
DROP POLICY IF EXISTS "Tenant admin can manage professionals" ON public.professionals;
DROP POLICY IF EXISTS "Service role can manage professionals" ON public.professionals;

DROP POLICY IF EXISTS "Tenant scoped select catalog_items" ON public.catalog_items;
DROP POLICY IF EXISTS "Tenant admin can manage catalog_items" ON public.catalog_items;
DROP POLICY IF EXISTS "Service role can manage catalog_items" ON public.catalog_items;

DROP POLICY IF EXISTS "Tenant scoped select catalog_item_professionals" ON public.catalog_item_professionals;
DROP POLICY IF EXISTS "Tenant admin can manage catalog_item_professionals" ON public.catalog_item_professionals;
DROP POLICY IF EXISTS "Service role can manage catalog_item_professionals" ON public.catalog_item_professionals;

DROP POLICY IF EXISTS "Tenant scoped select catalog_item_related" ON public.catalog_item_related;
DROP POLICY IF EXISTS "Tenant admin can manage catalog_item_related" ON public.catalog_item_related;
DROP POLICY IF EXISTS "Service role can manage catalog_item_related" ON public.catalog_item_related;

DROP POLICY IF EXISTS "Tenant scoped select professional_schedule_exceptions" ON public.professional_schedule_exceptions;
DROP POLICY IF EXISTS "Tenant admin can manage professional_schedule_exceptions" ON public.professional_schedule_exceptions;
DROP POLICY IF EXISTS "Service role can manage professional_schedule_exceptions" ON public.professional_schedule_exceptions;

-- catalog_categories
CREATE POLICY "Tenant scoped select catalog_categories"
  ON public.catalog_categories FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage catalog_categories"
  ON public.catalog_categories FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Service role can manage catalog_categories"
  ON public.catalog_categories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- professionals
CREATE POLICY "Tenant scoped select professionals"
  ON public.professionals FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage professionals"
  ON public.professionals FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Service role can manage professionals"
  ON public.professionals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- catalog_items
CREATE POLICY "Tenant scoped select catalog_items"
  ON public.catalog_items FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage catalog_items"
  ON public.catalog_items FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Service role can manage catalog_items"
  ON public.catalog_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- catalog_item_professionals
CREATE POLICY "Tenant scoped select catalog_item_professionals"
  ON public.catalog_item_professionals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.id = catalog_item_id
        AND public.user_has_tenant_access(ci.tenant_id)
    )
  );

CREATE POLICY "Tenant admin can manage catalog_item_professionals"
  ON public.catalog_item_professionals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.id = catalog_item_id
        AND public.user_is_tenant_admin(ci.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.id = catalog_item_id
        AND public.user_is_tenant_admin(ci.tenant_id)
    )
  );

CREATE POLICY "Service role can manage catalog_item_professionals"
  ON public.catalog_item_professionals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- catalog_item_related
CREATE POLICY "Tenant scoped select catalog_item_related"
  ON public.catalog_item_related FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.id = catalog_item_id
        AND public.user_has_tenant_access(ci.tenant_id)
    )
  );

CREATE POLICY "Tenant admin can manage catalog_item_related"
  ON public.catalog_item_related FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.id = catalog_item_id
        AND public.user_is_tenant_admin(ci.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.catalog_items ci
      WHERE ci.id = catalog_item_id
        AND public.user_is_tenant_admin(ci.tenant_id)
    )
  );

CREATE POLICY "Service role can manage catalog_item_related"
  ON public.catalog_item_related FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- professional_schedule_exceptions
CREATE POLICY "Tenant scoped select professional_schedule_exceptions"
  ON public.professional_schedule_exceptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id
        AND public.user_has_tenant_access(p.tenant_id)
    )
  );

CREATE POLICY "Tenant admin can manage professional_schedule_exceptions"
  ON public.professional_schedule_exceptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id
        AND public.user_is_tenant_admin(p.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id
        AND public.user_is_tenant_admin(p.tenant_id)
    )
  );

CREATE POLICY "Service role can manage professional_schedule_exceptions"
  ON public.professional_schedule_exceptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
