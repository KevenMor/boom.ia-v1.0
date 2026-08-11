-- ============================================================
-- 051 — Adicionar colunas de customização de prompts dinâmica em public.agents
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS communication_rules text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS dispatcher_prompt text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS followup_prompt text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS always_inject_comm_rules boolean DEFAULT false;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS skip_greeting boolean DEFAULT false;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS override_prompts boolean DEFAULT false;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS current_version varchar(50) DEFAULT '1.0.0';
