# docker

## Propósito
Configuração Docker e documentação de deploy — imagens, proxy reverso e guias operacionais para Portainer/GHCR.

## Arquitetura
- 3 imagens Docker: `boom-ia-server`, `boom-ia-frontend`, `boom-ia-proxy`.
- Proxy Nginx faz roteamento: `/api/*` → server, `/*` → frontend.
- Deploy via Portainer na VPS (pull de GHCR).
- Múltiplos docker-compose na raiz para diferentes alvos (local, Portainer, Traefik).

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| Dockerfile.proxy | Imagem Nginx para proxy reverso |
| nginx-proxy.conf | Config Nginx (rotas /api → server, / → frontend) |
| proxy-entrypoint.sh | Entrypoint com substituição de variáveis |
| BUILD-AND-PUSH.md | Guia de build e push para GHCR |
| PORTAINER-COPY-PASTE.md | Stack para colar no Portainer |
| PORTAINER-TROUBLESHOOTING.md | Troubleshooting de deploy |
| GITHUB-TOKEN-PORTAINER.md | Config de token GitHub no Portainer |
| SUPABASE-CONNECTIVITY.md | Conectividade Docker → Supabase |
| LOGIN-CORS-SUPABASE.md | Resolução de CORS com Supabase Auth |

## Decisões técnicas
- GHCR (GitHub Container Registry) como registry — integra com GitHub do projeto.
- Portainer para orquestração na VPS — sem CI/CD automatizado (build manual).
- Proxy Nginx separado — permite escalar server/frontend independentemente.
- Múltiplos docker-compose é dívida técnica — consolidar quando possível.

## Convenções
- Imagens tagueadas com `latest` e versão semântica.
- Documentação operacional em markdown dentro da pasta.
- Variáveis de ambiente passadas via docker-compose (não hardcoded).

## Fluxos críticos
1. `Dev → npm run build:docker:all → push GHCR → Portainer pull → stack up`
2. `Request → Nginx proxy → /api/* → server:3001 | /* → frontend:80`

## Cuidados ao modificar
- Alterar nginx-proxy.conf exige rebuild da imagem proxy.
- Alterar env vars exige restart do stack no Portainer.
- Testar CORS após mudanças no proxy.
- Manter paridade dev↔prod (ver docs/DEV-PROD-PARIDADE.md).
