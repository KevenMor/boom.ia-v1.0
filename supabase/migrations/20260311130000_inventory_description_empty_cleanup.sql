-- Limpa registros com description = 'EMPTY' (placeholder antigo)
-- A coluna description agora armazena apenas o tipo do veículo (hatch, sedan, SUV, camionete)
UPDATE public.inventory
SET description = NULL
WHERE description = 'EMPTY';
