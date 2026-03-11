-- Adiciona FK de appointment_reminders.agent_id -> agents.id
-- Necessário para o PostgREST/Supabase resolver o join agents(id, name) no schema cache
ALTER TABLE public.appointment_reminders
  ADD CONSTRAINT fk_appointment_reminders_agent
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE RESTRICT;
