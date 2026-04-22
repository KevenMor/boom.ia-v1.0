-- Orientação por galeria: quando o agente pode enviar fotos/vídeos (texto livre para o LLM).

ALTER TABLE public.suite_galleries
  ADD COLUMN IF NOT EXISTS llm_media_guidance TEXT;

COMMENT ON COLUMN public.suite_galleries.llm_media_guidance IS
  'Instruções para o agente LLM sobre quando enviar mídias desta galeria (ex.: só após confirmação, nunca na primeira mensagem).';
