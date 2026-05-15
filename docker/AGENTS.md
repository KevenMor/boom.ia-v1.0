# docker

## Contexto rápido
Infraestrutura Docker — proxy Nginx, Dockerfiles e documentação de deploy via Portainer/GHCR.

## Stack e ferramentas
- Docker, Nginx
- GHCR (GitHub Container Registry)
- Portainer (orquestração na VPS)
- Shell scripts (entrypoint)

## Como modificar

### Adicionar uma feature
1. Para novo serviço: criar Dockerfile na raiz, adicionar ao docker-compose
2. Para nova rota no proxy: editar `nginx-proxy.conf`
3. Rebuild: `npm run build:docker:all`

### Corrigir um bug
1. Verificar logs no Portainer (container logs)
2. Para CORS: verificar `nginx-proxy.conf` e `LOGIN-CORS-SUPABASE.md`
3. Para conectividade: verificar `SUPABASE-CONNECTIVITY.md`
4. Para auth: verificar env vars no stack

### Refatorar
1. Consolidar docker-compose.* (8+ variantes) quando possível
2. Não alterar proxy sem testar todas as rotas
3. Manter docs atualizados ao alterar config

## Comandos úteis
```bash
# build todas as imagens
npm run build:docker:all

# build individual
docker build -f docker/Dockerfile.proxy -t ghcr.io/kevenmor/boom-ia-proxy .

# push para GHCR
docker push ghcr.io/kevenmor/boom-ia-proxy:latest

# testar proxy local
docker-compose -f docker-compose.local.yml up

# ver logs de container
docker logs boom-ia-server --tail 100 -f
```

## Regras invioláveis
- Nunca hardcodar secrets em Dockerfiles
- Nunca push com tag `latest` sem testar
- Sempre manter paridade dev↔prod
- Nunca expor portas internas sem proxy
- Sempre documentar mudanças de infra nos .md desta pasta

## Mapa de dependências
```
docker/
├── consome → Dockerfiles na raiz (server, frontend)
├── consome → docker-compose.* na raiz
├── expõe para → VPS (via GHCR + Portainer)
└── depende de env → GHCR token, env vars do stack
```
