-- Boom IA — Carga de tipos e unidades de hospedagem a partir das telas do PMS (categorias + nomes exibidos).
-- Tabelas: public.lodging_accommodation_types, public.lodging_units
--
-- Tenant na UI: o workspace "Sunset Thermas Park" NÃO é o mesmo que "Vale Suíço". O slug costuma ser
-- `sunset-thermas-park` ou `sunset-thermas`. Confira o seu banco:
--   SELECT id, slug, name FROM public.tenants ORDER BY name;
--
-- 1) Ajuste o slug na linha WHERE abaixo para bater com o tenant onde você está logado no app.
-- 2) Se já rodou o seed no tenant errado, rode sql/022_lodging_migrate_vale_suico_to_sunset_thermas.sql ou apague e rode de novo.
-- 3) Opcional: descomente o DELETE para reimportar no mesmo tenant.

-- DELETE FROM public.lodging_units WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sunset-thermas-park' LIMIT 1);
-- DELETE FROM public.lodging_accommodation_types WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sunset-thermas-park' LIMIT 1);

DO $seed$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  -- Se o seu tenant for outro (ex.: vale-suico), troque a lista acima ou use:
  -- SELECT t.id INTO v_tenant FROM public.tenants t WHERE t.slug = 'meu-slug' LIMIT 1;

  -- Alternativa fixa por UUID (comente o SELECT acima e use):
  -- v_tenant := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Nenhum tenant com slug sunset-thermas-park ou sunset-thermas. Rode: SELECT id, slug, name FROM public.tenants; e ajuste o WHERE.';
  END IF;

  CREATE TEMP TABLE _lodging_seed_types (
    name text PRIMARY KEY,
    display_order int NOT NULL,
    id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _lodging_seed_types (name, display_order, id)
  SELECT v.name, v.ord, gen_random_uuid()
  FROM (VALUES
    ('STANDART', 10),
    ('LUXO QUÁDRUPLO', 20),
    ('LUXO VISTA PISCINA', 30),
    ('LUXO DUPLO', 40),
    ('MASTER COM VARANDA', 50),
    ('LUXO COM VARANDA', 60),
    ('LOFT', 70)
  ) AS v(name, ord);

  INSERT INTO public.lodging_accommodation_types (id, tenant_id, name, display_order)
  SELECT s.id, v_tenant, s.name, s.display_order
  FROM _lodging_seed_types s;

  INSERT INTO public.lodging_units (tenant_id, accommodation_type_id, name, status)
  SELECT v_tenant, t.id, u.unit_name, 'active'
  FROM (VALUES
    ('STANDART', 'Chalé Quádruplo 117'),
    ('STANDART', 'Chalé Quádruplo 118'),
    ('STANDART', 'Chalé Quádruplo 119'),
    ('STANDART', 'Chalé Quádruplo 120'),
    ('STANDART', 'Chalé Quádruplo 121'),
    ('STANDART', 'Chalé Quádruplo 122'),
    ('STANDART', 'Chalé Quádruplo 123'),
    ('STANDART', 'Chalé Quádruplo 124'),
    ('STANDART', 'Chalé Quádruplo 125'),
    ('STANDART', 'Chalé Quádruplo 126'),
    ('STANDART', 'Chalé Quádruplo 127'),
    ('STANDART', 'Chalé Quádruplo 128'),
    ('LUXO QUÁDRUPLO', 'Superior Familia 109'),
    ('LUXO QUÁDRUPLO', 'Superior Família 110'),
    ('LUXO QUÁDRUPLO', 'Superior Família 101'),
    ('LUXO QUÁDRUPLO', 'Superior Família 102'),
    ('LUXO QUÁDRUPLO', 'Superior Família 103'),
    ('LUXO VISTA PISCINA', 'Premier Família 105'),
    ('LUXO VISTA PISCINA', 'Premier Família 106'),
    ('LUXO VISTA PISCINA', 'Premier Família 107'),
    ('LUXO VISTA PISCINA', 'Premier Família 108'),
    ('LUXO DUPLO', 'Superior Familia 104'),
    ('LUXO DUPLO', 'Superior Casal 111'),
    ('LUXO DUPLO', 'Superior Casal 112'),
    ('LUXO DUPLO', 'Superior Casal 113'),
    ('LUXO DUPLO', 'Superior Casal 114'),
    ('MASTER COM VARANDA', 'Master Varanda 116'),
    ('LUXO COM VARANDA', 'Suite Varanda 115'),
    ('LOFT', 'Loft com SPA 201'),
    ('LOFT', 'Loft com SPA 202')
  ) AS u(type_name, unit_name)
  JOIN _lodging_seed_types t ON t.name = u.type_name;
END
$seed$;

-- Migração Vale Suíço → Sunset (park_days, categorias, unidades, reservas): ver sql/022_lodging_migrate_vale_suico_to_sunset_thermas.sql
