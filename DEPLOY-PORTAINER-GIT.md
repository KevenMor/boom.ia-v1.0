# Deploy no Portainer com Git (Recomendado)

Este método faz com que o Portainer clone o repositório e faça build automaticamente. **Sempre pega o código mais recente** após cada commit.

## Vantagens

- ✅ Sempre usa o código mais recente do repositório
- ✅ Não precisa fazer build e push manual de imagens
- ✅ Basta fazer commit + redeploy no Portainer
- ✅ Ideal para desenvolvimento contínuo

## Passo a passo

### 1. Excluir a stack atual (se existir)

No Portainer:
1. **Stacks** → selecione `boom_ia`
2. Clique em **Delete** (ou **Remove**)
3. Confirme a exclusão

### 2. Criar nova stack com Git

No Portainer:
1. **Stacks** → **Add stack**
2. Escolha **Git Repository**
3. Preencha:
   - **Name:** `boom_ia`
   - **Repository URL:** `https://github.com/KevenMor/boom-agents.git`
   - **Repository reference:** `main`
   - **Compose path:** `docker-compose.portainer-git-traefik.yml`
   
4. **Repository authentication:**
   - ✅ Marque "Use authentication"
   - **Username:** `KevenMor`
   - **Password:** `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`

5. **Environment variables:**
   - Cole o conteúdo do arquivo `.env.portainer-git-traefik`
   - Ou copie as variáveis abaixo:

```env
PORT=3001
NODE_ENV=production
NEXUS_DB_URL=https://boomsolution-supabase.kgn6uc.easypanel.host
NEXUS_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q
NEXUS_DB_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
ENCRYPTION_KEY=change-me-32-chars-minimum!!
API_BASE_URL=https://ia.agboom.com.br
CORS_ORIGINS=https://ia.agboom.com.br
OPENAI_API_KEY=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
GEMINI_API_KEY=AIzaSyDsSKTvCIDGH3RaRq0m7ue6TtIWEhbfvpQ
INTERNAL_API_INSECURE_TLS=true
VITE_SUPABASE_URL=https://boomsolution-supabase.kgn6uc.easypanel.host
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
VITE_SUPABASE_PROJECT_ID=default
VITE_API_URL=https://ia.agboom.com.br/api
```

6. Clique em **Deploy the stack**

### 3. Aguardar o build

O Portainer vai:
1. Clonar o repositório
2. Fazer build das 3 imagens (server, frontend, proxy)
3. Subir os containers

**Isso pode levar 5-10 minutos na primeira vez.**

### 4. Verificar logs

Após o deploy:
1. **Stacks** → `boom_ia`
2. Clique no serviço `server`
3. Veja os logs para confirmar que está rodando

### 5. Testar o chat

Acesse `https://ia.agboom.com.br` e teste o chat.

---

## Workflow de atualização

Após fazer alterações no código:

1. **Commit e push:**
   ```bash
   git add .
   git commit -m "fix: sua mensagem"
   git push
   ```

2. **Redeploy no Portainer:**
   - **Stacks** → `boom_ia`
   - Clique em **Pull and redeploy** (ou **Redeploy**)
   - Aguarde o rebuild

3. **Pronto!** O Portainer vai puxar o código novo e fazer rebuild.

---

## Troubleshooting

### Build falha

Se o build falhar, verifique:
- Token do GitHub está correto
- Repositório está acessível
- Arquivos `Dockerfile.server`, `Dockerfile`, `docker/Dockerfile.proxy` existem

### 502 continua

Se o 502 continuar após o deploy:
1. Veja os logs do serviço `server`
2. Procure por erros como `DEPTH_ZERO_SELF_SIGNED_CERT`, `ECONNREFUSED`, etc.
3. Verifique se `INTERNAL_API_INSECURE_TLS=true` está nas variáveis de ambiente

### Traefik não roteia

Se o site não carregar:
1. Verifique se a rede `minha_rede` existe
2. Confirme que o Traefik está rodando
3. Veja os logs do Traefik para erros de roteamento
