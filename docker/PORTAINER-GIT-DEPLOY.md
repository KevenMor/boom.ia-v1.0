# Deploy no Portainer a partir do Git (repositório privado)

Use este método se você quer que o Portainer **clone o repositório** e faça **build** dos containers.

---

## 1. No Portainer

1. **Stacks** → **Add stack**
2. **Name**: `boom-ia` (ou outro nome)
3. **Build method**: **Git repository**
4. Preencha:
   - **Repository URL**: `https://github.com/KevenMor/boom-agents.git`
   - **Repository reference**: `main`
   - **Compose path**: `docker-compose.portainer-git.yml`
5. Ative **Repository authentication**:
   - **Username**: `KevenMor`
   - **Password**: `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` (seu token do GitHub)
6. Em **Environment variables**, adicione (ou use "Load from .env file" e cole):

```
PORT=3001
NODE_ENV=production
NEXUS_DB_URL=https://boomsolution-supabase.kgn6uc.easypanel.com
NEXUS_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q
NEXUS_DB_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
ENCRYPTION_KEY=change-me-32-chars-minimum!!
API_BASE_URL=https://ia.agboom.com.br
CORS_ORIGINS=https://ia.agboom.com.br
VITE_SUPABASE_URL=https://boomsolution-supabase.kgn6uc.easypanel.com
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
VITE_SUPABASE_PROJECT_ID=default
VITE_API_URL=https://ia.agboom.com.br/api
```

7. **Deploy the stack**

---

## 2. Acesso

O painel fica em **http://IP_DA_VPS:8081** (porta 8081 para não conflitar com o Traefik).

Se quiser usar `https://ia.agboom.com.br` na porta 80, configure no **Traefik** um roteamento para o serviço `boom_ia_proxy` na porta 8081.

---

## Diferença entre os composes

- **`docker-compose.portainer-git.yml`**: para deploy **por Git** (Portainer clona e builda; precisa de token).
- **`docker-compose.portainer.yml`**: para deploy **por Web editor** (usa imagens do GHCR; não precisa de token).

Use o método **Git** se o Portainer suportar build (modo standalone). Use o método **Web editor** se estiver em modo Swarm ou se o build não funcionar.
