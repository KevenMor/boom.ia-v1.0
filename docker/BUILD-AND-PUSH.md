# Buildar e publicar imagens para usar no Portainer

Se o Portainer não suportar `build:` (ex.: modo Swarm), use imagens pré-buildadas no GitHub Container Registry (GHCR) ou Docker Hub.

---

## 1. Autenticar no GitHub Container Registry

```bash
echo "SEU_GITHUB_TOKEN" | docker login ghcr.io -u SEU_USUARIO --password-stdin
```

Substitua:
- `SEU_GITHUB_TOKEN`: Personal Access Token com escopo `write:packages` e `read:packages`.
- `SEU_USUARIO`: seu usuário do GitHub (ex.: `KevenMor`).

---

## 2. Buildar e publicar as imagens

### Server (API Node.js)

```bash
cd /caminho/para/boom-agents
docker build -f Dockerfile.server -t ghcr.io/kevenMor/boom-ia-server:latest .
docker push ghcr.io/kevenMor/boom-ia-server:latest
```

### Frontend (React)

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://ia.agboom.com.br:8000 \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sua_anon_key \
  --build-arg VITE_SUPABASE_PROJECT_ID=default \
  --build-arg VITE_API_URL=https://ia.agboom.com.br/api \
  -t ghcr.io/kevenMor/boom-ia-frontend:latest \
  .
docker push ghcr.io/kevenMor/boom-ia-frontend:latest
```

**Importante:** troque os valores dos `--build-arg` pelos valores **reais** do seu Supabase na VPS. O frontend é buildado com essas URLs **embutidas** no bundle.

---

## 3. Usar no Portainer

1. No Portainer, crie a stack com o arquivo **`docker-compose.portainer.yml`** (ou cole o conteúdo).
2. Defina as variáveis de ambiente (só as do **servidor**; o frontend já tem as URLs no build).
3. Deploy da stack.

As imagens são baixadas do GHCR; não há build no Portainer.

---

## Alternativa: Docker Hub

Se preferir Docker Hub:

```bash
docker login
docker build -f Dockerfile.server -t seuusuario/boom-ia-server:latest .
docker push seuusuario/boom-ia-server:latest

docker build --build-arg ... -t seuusuario/boom-ia-frontend:latest .
docker push seuusuario/boom-ia-frontend:latest
```

E no `docker-compose.portainer.yml`, troque `ghcr.io/kevenMor/...` por `seuusuario/...`.
