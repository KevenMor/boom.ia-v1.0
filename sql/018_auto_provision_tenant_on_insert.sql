-- Auto-provision tenant schema on INSERT
-- Quando um tenant é criado, o schema dp_<slug> e todas as tabelas são criados automaticamente.

CREATE OR REPLACE FUNCTION public.trigger_provision_tenant_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_tenant_schema(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_tenant_on_insert ON public.tenants;
CREATE TRIGGER trg_provision_tenant_on_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_provision_tenant_on_insert();
