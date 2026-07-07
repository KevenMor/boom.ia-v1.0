-- Boom IA — Seed Reservas do Brasil (Delta Empreendimentos)
-- Tabelas: lot_developments, lots
-- Idempotente: não duplica se slug reservas-do-brasil já existir no tenant.
--
-- Pré-requisitos:
--   1. sql/039_lot_developments_and_lots.sql aplicado
--   2. Tenant delta-empreendimentos (ou alias delta_empreendimentos) existente
--   3. Módulo loteamentos habilitado em tenant_modules (painel Edit Tenant)

DO $seed_lots$
DECLARE
  v_tenant uuid;
  v_dev uuid;
  v_map_url text := 'https://instacasa-files.s3.us-east-2.amazonaws.com/empreendimentos/2415/midiasDoEmpreendimento/galeriaDeImagens/N77FO_Rsv-do-Brasil_Mapa-de-Lotes_norte-leve/w1920';
  v_cols int := 15;
  v_rows int := 10;
  i int;
  col_i int;
  row_i int;
  cell_w numeric := 1.0 / v_cols;
  cell_h numeric := 1.0 / v_rows;
  pad numeric := 0.008;
  area_min numeric := 1000;
  area_max numeric := 1442.84;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('delta-empreendimentos', 'delta_empreendimentos', 'delta')
  ORDER BY CASE t.slug
    WHEN 'delta-empreendimentos' THEN 1
    WHEN 'delta_empreendimentos' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant Delta não encontrado (slugs delta-empreendimentos / delta).';
  END IF;

  SELECT d.id INTO v_dev
  FROM public.lot_developments d
  WHERE d.tenant_id = v_tenant AND d.slug = 'reservas-do-brasil'
  LIMIT 1;

  IF v_dev IS NULL THEN
    INSERT INTO public.lot_developments (
      tenant_id, name, slug, city, state, address, description, status, map_image_url, map_config, display_order
    ) VALUES (
      v_tenant,
      'Reservas do Brasil',
      'reservas-do-brasil',
      'Araçoiaba da Serra',
      'SP',
      'Rodovia Vereador João Antônio Nunes (SP-268)',
      'Empreendimento fechado com 145 lotes de 1.000 a 1.442,84 m² — biomas Cerrado, Mata Atlântica e Pantanal.',
      'active',
      v_map_url,
      jsonb_build_object('source', 'instacasa', 'empreendimento_id', 2415),
      0
    )
    RETURNING id INTO v_dev;
  END IF;

  IF EXISTS (SELECT 1 FROM public.lots WHERE development_id = v_dev LIMIT 1) THEN
    RAISE NOTICE 'Lotes já existem para Reservas do Brasil — seed ignorado.';
    RETURN;
  END IF;

  FOR i IN 1..145 LOOP
    col_i := (i - 1) % v_cols;
    row_i := (i - 1) / v_cols;
    INSERT INTO public.lots (
      tenant_id,
      development_id,
      code,
      block,
      lot_number,
      area_m2,
      status,
      map_geometry
    ) VALUES (
      v_tenant,
      v_dev,
      format('L-%s', lpad(i::text, 3, '0')),
      format('Q%s', (col_i % 5) + 1),
      lpad(((i - 1) % 30 + 1)::text, 2, '0'),
      round((area_min + (area_max - area_min) * ((i - 1)::numeric / 144)), 2),
      'available',
      jsonb_build_object(
        'type', 'rect',
        'x', round((col_i * cell_w + pad)::numeric, 4),
        'y', round((row_i * cell_h + pad)::numeric, 4),
        'w', round((cell_w - pad * 2)::numeric, 4),
        'h', round((cell_h - pad * 2)::numeric, 4)
      )
    );
  END LOOP;

  RAISE NOTICE 'Seed Reservas do Brasil: 145 lotes criados (development_id=%).', v_dev;
END;
$seed_lots$;
