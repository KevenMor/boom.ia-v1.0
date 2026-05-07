-- Valor de ingresso do parque por dia (texto livre, para consulta no painel e futuro consumo pelo agente).

ALTER TABLE public.lodging_park_days
  ADD COLUMN IF NOT EXISTS park_ticket_value TEXT;
