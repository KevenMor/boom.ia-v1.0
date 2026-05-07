-- Valor de ingresso do parque por dia (texto livre).
-- Equivalente a supabase/migrations/20260507160000_lodging_park_day_ticket_value.sql

ALTER TABLE public.lodging_park_days
  ADD COLUMN IF NOT EXISTS park_ticket_value TEXT;
