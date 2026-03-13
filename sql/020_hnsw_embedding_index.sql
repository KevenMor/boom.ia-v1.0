-- ============================================================
-- Nexus AI — HNSW index para busca por similaridade em knowledge_chunks
-- Execute no Supabase (SQL Editor ou psql)
-- Requer: CREATE EXTENSION IF NOT EXISTS vector;
-- ============================================================
-- Cria índice HNSW no campo embedding para buscas ORDER BY embedding <=> query_vector
-- (cosine distance). Necessário para RAG com pgvector.

DO $$
DECLARE
  r RECORD;
  v_prefix TEXT;
BEGIN
  FOR r IN SELECT id, db_name FROM public.tenants WHERE db_name IS NOT NULL AND status = 'active'
  LOOP
    v_prefix := replace(replace(r.db_name, 'dp_', ''), '-', '_');
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_chunks_embedding ON %I.knowledge_chunks USING hnsw (embedding vector_cosine_ops)',
        v_prefix,
        r.db_name
      );
      RAISE NOTICE 'Índice HNSW criado para schema %', r.db_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Erro ao criar índice para %: %', r.db_name, SQLERRM;
    END;
  END LOOP;
END $$;
