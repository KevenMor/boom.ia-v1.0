# AGENTS – Boom IA – Deploy e fluxo das imagens

Documentação para agentes e desenvolvedores sobre como o projeto sobe na VPS (Portainer) e de onde vêm as imagens.

---

## O que está rodando na VPS

1. **Compose (YAML)**  
   O conteúdo do `docker-compose.portainer.yml` é **colado no Portainer** (Web editor). Ou seja: a definição da stack é o arquivo que **você colou** no Portainer, **não** um clone do repositório na VPS.

2. **Imagens (server, frontend, proxy)**  
   São **buildadas no PC** (ou em CI) e enviadas para o **GitHub Container Registry (GHCR)** com `docker push`.  
   Na VPS o Docker **só faz pull** dessas imagens do GHCR (`ghcr.io/kevenmor/...`).  
   Na VPS **não** acontece:
   - clone do repositório no GitHub
   - `docker build`
   - uso direto do código do GitHub

---

## Resumo

| O quê              | Onde fica / de onde vem                            |
|--------------------|----------------------------------------------------|
| Código do projeto  | Repositório GitHub (no PC / CI; não é clonado na VPS) |
| Build das imagens  | Feito no PC → enviado para o GHCR                  |
| Na VPS             | Só o **compose** (colado no Portainer) + **pull** das imagens do GHCR |

Conclusão: na VPS sobe o **build do projeto** no sentido de **imagens já buildadas** (que estavam no GHCR). A stack usa o **arquivo (compose) que foi colado no Portainer**, e **não** um clone direto do repositório no GitHub. O repositório GitHub não é acessado pela VPS nesse fluxo; só o **GHCR** (registry de imagens) é.

---

## Arquivos relevantes

- **Stack Portainer (Web editor):** `docker-compose.portainer.yml`
- **Deploy por Git (quando suportado):** `docker-compose.portainer-git.yml`
- **Compose local (Docker Desktop):** `docker-compose.yml`
- **Registry:** GHCR – `ghcr.io/kevenmor/boom-ia-server`, `boom-ia-frontend`, `boom-ia-proxy`
- **Token GHCR:** configurar em Portainer > Registries (ou `docker login ghcr.io` na VPS)
