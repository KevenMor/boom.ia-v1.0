-- Boom IA — Seed de valores (tarifas) para Sunset Thermas Park.
-- Tabela: public.lodging_rate_items
--
-- Ajuste o v_tenant_slug se o seu tenant for outro. Valores do PDF Sunset Thermas Park,
-- em BRL (Real), sem vigência específica (valid_from/valid_to = NULL = sempre válido).
-- Nota: "não válido para datas especiais, eventos, Natal/Réveillon" é regra comercial
-- registrada no campo notes para contexto da IA, não é filtro na query.

DO $seed_rates$
DECLARE
  v_tenant uuid;
  v_suite_vista uuid;
  v_suite_varanda uuid;
  v_suite_sem_varanda uuid;
  v_suite_master uuid;
  v_chale_std uuid;
  v_loft_hidro uuid;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant Sunset não encontrado (slugs sunset-thermas-park / sunset-thermas).';
  END IF;

  SELECT id INTO v_suite_vista
  FROM public.lodging_accommodation_types
  WHERE tenant_id = v_tenant AND name = 'LUXO VISTA PISCINA'
  LIMIT 1;

  SELECT id INTO v_suite_varanda
  FROM public.lodging_accommodation_types
  WHERE tenant_id = v_tenant AND name = 'LUXO COM VARANDA'
  LIMIT 1;

  SELECT id INTO v_suite_sem_varanda
  FROM public.lodging_accommodation_types
  WHERE tenant_id = v_tenant AND name LIKE '%LUXO DUPLO%'
  LIMIT 1;

  SELECT id INTO v_suite_master
  FROM public.lodging_accommodation_types
  WHERE tenant_id = v_tenant AND name = 'MASTER COM VARANDA'
  LIMIT 1;

  SELECT id INTO v_chale_std
  FROM public.lodging_accommodation_types
  WHERE tenant_id = v_tenant AND name = 'STANDART'
  LIMIT 1;

  SELECT id INTO v_loft_hidro
  FROM public.lodging_accommodation_types
  WHERE tenant_id = v_tenant AND name = 'LOFT'
  LIMIT 1;

  IF v_suite_vista IS NULL OR v_suite_varanda IS NULL OR v_suite_sem_varanda IS NULL
     OR v_suite_master IS NULL OR v_chale_std IS NULL OR v_loft_hidro IS NULL THEN
    RAISE EXCEPTION 'Uma ou mais categorias de acomodação não encontradas. Verifique os nomes.';
  END IF;

  INSERT INTO public.lodging_rate_items
    (tenant_id, accommodation_type_id, guests, nights, price, currency, notes)
  VALUES
    -- Suíte Luxo com Vista para Piscina
    (v_tenant, v_suite_vista, 3, 1, 1127.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 3, 2, 2254.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 3, 3, 3381.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 3, 4, 4508.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 3, 5, 5635.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 4, 1, 1357.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 4, 2, 2714.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 4, 3, 4071.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 4, 4, 5428.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_vista, 4, 5, 6785.00, 'BRL', 'Não válido para datas especiais/eventos'),

    -- Suíte Luxo com Varanda
    (v_tenant, v_suite_varanda, 2, 1, 832.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 2, 2, 1664.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 2, 3, 2496.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 2, 4, 3328.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 2, 5, 4160.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 3, 1, 1062.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 3, 2, 2124.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 3, 3, 3186.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 3, 4, 4248.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 3, 5, 5310.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 4, 1, 1292.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 4, 2, 2584.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 4, 3, 3876.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 4, 4, 5168.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_varanda, 4, 5, 6460.00, 'BRL', 'Não válido para datas especiais/eventos'),

    -- Suíte Luxo sem Varanda (categoria LUXO DUPLO)
    (v_tenant, v_suite_sem_varanda, 2, 1, 782.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 2, 2, 1564.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 2, 3, 2346.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 2, 4, 3128.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 2, 5, 3910.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 3, 1, 1012.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 3, 2, 2024.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 3, 3, 3036.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 3, 4, 4048.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 3, 5, 5060.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 4, 1, 1242.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 4, 2, 2484.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 4, 3, 3726.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 4, 4, 4968.00, 'BRL', 'Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_sem_varanda, 4, 5, 6260.00, 'BRL', 'Não válido para datas especiais/eventos'),

    -- Suíte Luxo Master com Varanda (até 4 pessoas, mesmo valor)
    (v_tenant, v_suite_master, 4, 1, 1457.00, 'BRL', 'Acomodação até 4 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_master, 4, 2, 2914.00, 'BRL', 'Acomodação até 4 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_master, 4, 3, 4371.00, 'BRL', 'Acomodação até 4 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_master, 4, 4, 5828.00, 'BRL', 'Acomodação até 4 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_suite_master, 4, 5, 7285.00, 'BRL', 'Acomodação até 4 pessoas. Não válido para datas especiais/eventos'),

    -- Chalé Standard
    (v_tenant, v_chale_std, 2, 1, 552.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 2, 2, 1104.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 2, 3, 1656.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 2, 4, 2208.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 2, 5, 2760.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 3, 1, 782.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 3, 2, 1564.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 3, 3, 2346.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 3, 4, 3128.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 3, 5, 3910.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 4, 1, 1012.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 4, 2, 2024.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 4, 3, 3036.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 4, 4, 4048.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),
    (v_tenant, v_chale_std, 4, 5, 5060.00, 'BRL', 'Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos'),

    -- Loft Premium com Hidro (até 6 pessoas, mesmo valor)
    (v_tenant, v_loft_hidro, 6, 1, 2700.00, 'BRL', '2 dormitórios, até 6 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_loft_hidro, 6, 2, 5400.00, 'BRL', '2 dormitórios, até 6 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_loft_hidro, 6, 3, 8100.00, 'BRL', '2 dormitórios, até 6 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_loft_hidro, 6, 4, 10800.00, 'BRL', '2 dormitórios, até 6 pessoas. Não válido para datas especiais/eventos'),
    (v_tenant, v_loft_hidro, 6, 5, 13500.00, 'BRL', '2 dormitórios, até 6 pessoas. Não válido para datas especiais/eventos')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seed de valores concluído: % linhas inseridas/atualizadas.', (SELECT count(*) FROM public.lodging_rate_items WHERE tenant_id = v_tenant);
END
$seed_rates$;
