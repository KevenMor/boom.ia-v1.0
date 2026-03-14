# Bug: consultar_base_conhecimento sem resposta (Mariana / Vicentim)

## O que aconteceu

O agente Mariana disse que iria consultar a base de conhecimento sobre bruxismo, chamou a tool `consultar_base_conhecimento(pergunta="O que é bruxismo e como é tratado?")` — mas o cliente não recebeu a resposta.

## Possíveis causas

### 1. Tool não vinculada ao agente
A tool precisa estar em `agent_tools` para o agente usá-la.

**Solução:** Execute o seed no Supabase SQL Editor:
```sql
-- Conteúdo de sql/022_vicentim_rag_tool_seed.sql
```

### 2. Base RAG vazia (mais provável)
A tool `consultar_base_conhecimento` busca em `knowledge_chunks` e `knowledge_documents`. Se essas tabelas estiverem vazias, a busca retorna nada e o modelo pode não ter contexto para responder.

**Solução:** Ingerir o conteúdo do site no RAG:
```bash
# 1. Garantir que o JSON existe (já existe em server/data/vicentim-website-content.json)
# 2. Executar o ingest
cd server
npx tsx scripts/ingest-vicentim-website.ts
```

Requer: `NEXUS_DB_URL`, `NEXUS_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`

### 3. Parâmetro `pergunta` vs `query`
O modelo chamou com `pergunta="..."` mas o schema da tool tinha apenas `query`. O executor já aceita ambos (`args?.query ?? args?.pergunta`). O seed foi atualizado para aceitar `pergunta` também.

### 4. Dupla chamada da tool
As duas linhas idênticas no chat podem ser retentativas ou exibição de debug. Verificar se o frontend está mostrando tool calls como mensagens.

## Checklist de verificação

- [ ] Tool `consultar_base_conhecimento` existe em `public.tools` para o tenant Vicentim
- [ ] Link em `agent_tools` entre a Mariana e a tool
- [ ] Tabelas `knowledge_documents` e `knowledge_chunks` no schema do tenant têm dados
- [ ] RPC `rag_search_chunks` existe e funciona
- [ ] `OPENAI_API_KEY` configurada (para embeddings na busca)

## Comandos úteis

```bash
# Listar tools do agente
npx tsx server/list-agent-tools.ts Mariana

# Verificar tools
npm run verify:tools
```
