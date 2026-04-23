-- Adiciona coluna actions à user_module_acl
-- Quando null = todas as actions do módulo estão liberadas (herda padrão)
-- Quando array = apenas as actions listadas estão permitidas

ALTER TABLE public.user_module_acl
  ADD COLUMN IF NOT EXISTS allowed_actions text[] DEFAULT NULL;
