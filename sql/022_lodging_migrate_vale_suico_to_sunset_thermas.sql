-- Boom IA — Move todo o domínio de hospedagem do tenant Vale Suíço → Sunset Thermas Park.
-- Tabelas: lodging_park_days, lodging_accommodation_types, lodging_units, lodging_reservations
--
-- Conflitos: em lodging_park_days, para a mesma data já existente no Sunset, a linha do Vale é apagada
-- (mantém-se o registro que já estava no Sunset).
--
-- Origem: por omissão apenas `vale-suico`. Se também usar `vale-suico-resort`, duplique o bloco
-- ou altere o WHERE para: WHERE t.slug IN ('vale-suico', 'vale-suico-resort') com política clara
-- (dois tenants → um destino pode exigir duas execuções com slugs diferentes).

DO $migrate$
DECLARE
  v_src uuid;
  v_dst uuid;
  n_days int;
  n_types int;
  n_units int;
  n_res int;
BEGIN
  SELECT t.id INTO v_src
  FROM public.tenants t
  WHERE t.slug = 'vale-suico'
  LIMIT 1;

  SELECT t.id INTO v_dst
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Tenant origem não encontrado (slug vale-suico). Rode: SELECT id, slug FROM public.tenants;';
  END IF;
  IF v_dst IS NULL THEN
    RAISE EXCEPTION 'Tenant destino não encontrado (slugs sunset-thermas-park / sunset-thermas).';
  END IF;
  IF v_src = v_dst THEN
    RAISE EXCEPTION 'Origem e destino são o mesmo tenant; nada a fazer.';
  END IF;

  SELECT count(*)::int INTO n_days FROM public.lodging_park_days WHERE tenant_id = v_src;
  SELECT count(*)::int INTO n_types FROM public.lodging_accommodation_types WHERE tenant_id = v_src;
  SELECT count(*)::int INTO n_units FROM public.lodging_units WHERE tenant_id = v_src;
  SELECT count(*)::int INTO n_res FROM public.lodging_reservations WHERE tenant_id = v_src;

  RAISE NOTICE 'Antes da migração (tenant vale-suico): park_days=%, types=%, units=%, reservations=%',
    n_days, n_types, n_units, n_res;

  DELETE FROM public.lodging_park_days d
  WHERE d.tenant_id = v_src
    AND EXISTS (
      SELECT 1
      FROM public.lodging_park_days x
      WHERE x.tenant_id = v_dst
        AND x.calendar_date = d.calendar_date
    );

  UPDATE public.lodging_park_days SET tenant_id = v_dst WHERE tenant_id = v_src;

  UPDATE public.lodging_accommodation_types SET tenant_id = v_dst WHERE tenant_id = v_src;
  UPDATE public.lodging_units SET tenant_id = v_dst WHERE tenant_id = v_src;
  UPDATE public.lodging_reservations SET tenant_id = v_dst WHERE tenant_id = v_src;

  RAISE NOTICE 'Migração concluída: dados de hospedagem do tenant % agora no tenant %', v_src, v_dst;
END
$migrate$;
