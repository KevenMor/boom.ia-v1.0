# Portainer – Stack Boom IA (copiar e colar)

## 1. Publicar as imagens no GHCR (uma vez)

No seu PC (PowerShell ou CMD), na **pasta do projeto**:

```powershell
# Login no GitHub Container Registry (use seu token com write:packages)
echo "SEU_GITHUB_TOKEN" | docker login ghcr.io -u KevenMor --password-stdin

# Push das 3 imagens (já buildadas)
docker push ghcr.io/kevenmor/boom-ia-server:latest
docker push ghcr.io/kevenmor/boom-ia-proxy:latest
docker push ghcr.io/kevenmor/boom-ia-frontend:latest
```

Se ainda não tiver as imagens buildadas, antes do push rode:

```powershell
cd C:\Users\keven\OneDrive\Área de Trabalho\Boom\boom-agents

docker build -f Dockerfile.server -t ghcr.io/kevenmor/boom-ia-server:latest .
docker build -f docker/Dockerfile.proxy -t ghcr.io/kevenmor/boom-ia-proxy:latest .
docker build --build-arg VITE_SUPABASE_URL=http://ia.agboom.com.br:8000 --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE --build-arg VITE_SUPABASE_PROJECT_ID=default --build-arg VITE_API_URL=https://ia.agboom.com.br/api -t ghcr.io/kevenmor/boom-ia-frontend:latest .
```

---

## 2. Stack no Portainer – Web editor (Compose)

Em **Stacks** → **Add stack** (ou editar a stack) → **Web editor**, apague tudo e cole **o conteúdo do arquivo `docker-compose.portainer.yml`** (sem rede customizada; testado em Swarm). Não preencha "Environment variables".

**Importante:** No Portainer em modo **Swarm** não use rede customizada e não use `build:` — use só este compose com imagens do GHCR. Com o proxy na porta **80**, acesse **http://ia.agboom.com.br** (sem porta). Se a 80 já estiver em uso, use `published: 8081` e configure um proxy reverso (ver `docker/REVERSE-PROXY-CADDY.md`).

---

## 3. Variáveis (já no compose)

As variáveis já estão **dentro do compose** na seção `environment` do serviço `server`. Não é necessário preencher "Environment variables" no Portainer.

Se precisar alterar depois (ex.: outro Supabase, outro domínio), edite no Web editor:
- `NEXUS_DB_URL`: URL do Kong do Supabase (ex.: `http://supabase_kong:8000`)
- `API_BASE_URL` e `CORS_ORIGINS`: domínio do painel (ex.: `https://ia.agboom.com.br`)
- `ENCRYPTION_KEY`: troque em produção por uma chave de 32+ caracteres

Depois clique em **Deploy the stack**. Acesse **http://ia.agboom.com.br** (DNS apontando para o IP da VPS; porta 80).

Na mesma tela da stack, em **Environment variables** (ou “Load from .env file”), adicione **cada variável** ou cole o bloco (sem os comentários #):

```
PORT=3001
NODE_ENV=production
NEXUS_DB_URL=http://supabase_kong:8000
NEXUS_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q
NEXUS_DB_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
ENCRYPTION_KEY=change-me-32-chars-minimum!!
API_BASE_URL=https://ia.agboom.com.br
CORS_ORIGINS=https://ia.agboom.com.br
```

**Ajuste se precisar:**
- `NEXUS_DB_URL`: se a stack do Supabase tiver outro nome, use `http://NOME_DA_STACK_kong:8000`
- `ENCRYPTION_KEY`: troque por uma chave de 32+ caracteres em produção
