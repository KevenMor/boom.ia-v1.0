-- Liga/desliga IA para todos os agentes da tenant (ex.: botão no dashboard script Chatwoot/Mega).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ai_globally_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.ai_globally_enabled IS
  'Quando false, webhooks e /queue/process não acionam o modelo para essa tenant; follow-ups são cancelados ao processar; mensagens podem continuar a sincronizar para o Chat ao Vivo.';
