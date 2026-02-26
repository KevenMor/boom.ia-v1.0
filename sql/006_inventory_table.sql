-- ============================================================
-- Nexus AI — Tabela de Estoque de Veículos
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- Sincroniza com pplmotors.com.br/Veiculos a cada 30 min
-- ============================================================

-- 1. Tabela principal de inventário
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT UNIQUE,                    -- ID do veículo no site (ex: 3417124)
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,                        -- Marca (AUDI, BMW, etc.)
  model TEXT NOT NULL,                        -- Modelo (A3, Q5, etc.)
  version TEXT,                               -- Versão completa
  year INTEGER,                               -- Ano
  price NUMERIC(12,2),                        -- Preço
  mileage INTEGER,                            -- Quilometragem
  color TEXT,                                 -- Cor
  transmission TEXT,                          -- Câmbio
  fuel_type TEXT,                             -- Combustível
  photo_url TEXT,                             -- Foto principal
  photos JSONB DEFAULT '[]',                  -- Array de URLs de fotos adicionais
  detail_url TEXT,                            -- Link para página de detalhes
  description TEXT,                           -- Descrição adicional
  status TEXT NOT NULL DEFAULT 'available'     -- available, sold, reserved
    CHECK (status IN ('available', 'sold', 'reserved')),
  raw_data JSONB DEFAULT '{}',                -- Dados brutos do scraping
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON public.inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_brand ON public.inventory(brand);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_external_id ON public.inventory(external_id);

-- 3. RLS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage inventory"
  ON public.inventory FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon também pode ler (para os agentes consultarem)
CREATE POLICY "Anon can view inventory"
  ON public.inventory FOR SELECT
  TO anon
  USING (true);

-- Anon pode inserir/atualizar (para o sync da edge function)
CREATE POLICY "Anon can upsert inventory"
  ON public.inventory FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update inventory"
  ON public.inventory FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 4. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_updated_at();
