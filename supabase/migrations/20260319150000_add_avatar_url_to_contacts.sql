-- Adiciona avatar_url à tabela contacts para exibir foto do lead
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
