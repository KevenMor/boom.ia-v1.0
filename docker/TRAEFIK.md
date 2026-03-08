# Boom IA atrás do Traefik

O `docker-compose.portainer.yml` está configurado para o **Traefik** rotear **ia.agboom.com.br** para o proxy da stack (porta 80 do container). Acesso: **http://ia.agboom.com.br** e **https://ia.agboom.com.br** (se o Traefik tiver TLS).

## Rede externa: criar ou usar a do Traefik

A stack usa a rede **`traefik_public`** (external). Se ela não existir, o deploy falha com *network could not be found*.

**Opção A – Criar a rede na VPS (SSH ou Portainer → Networks):**
```bash
docker network create --driver overlay traefik_public
```
Depois, na stack do **Traefik**, coloque o serviço do Traefik também na rede `traefik_public` (se ainda não estiver). Assim o Boom IA e o Traefik ficam na mesma rede.

**Opção B – Usar a rede que o Traefik já usa**  
No Portainer: **Networks** → veja em qual rede o **Traefik** está (ex.: `traefik_web`, `proxy`, nome da stack do Traefik). No compose do Boom IA, troque `traefik_public` por esse nome (nas `networks:` e na label `traefik.docker.network` do proxy).

## O que o compose faz

- **Rede `traefik_public`** (external): o proxy entra nessa rede para o Traefik alcançá-lo.
- **Rede `internal`** (overlay): server, frontend e proxy se falam por ela.
- **Labels no proxy**: o Traefik cria o router e o service e faz o load balance na porta 80 do proxy.

## Ajustes comuns

1. **Nome da rede**  
   Se a rede do Traefik não for `traefik_public`, troque no compose:
   ```yaml
   networks:
     traefik_public:
       external: true
   ```
   pelo nome correto (ex.: `web`, `proxy`, `minha_rede` se for a que o Traefik usa).

2. **Só HTTP (sem HTTPS)**  
   Remova as linhas de TLS e use só o entrypoint `web`:
   ```yaml
   - "traefik.http.routers.boom-ia.entrypoints=web"
   ```
   e apague as linhas `tls=true` e `tls.certresolver=...`.

3. **Nome do cert resolver**  
   Se o Let's Encrypt no Traefik tiver outro nome (ex.: `le`), troque:
   ```yaml
   - "traefik.http.routers.boom-ia.tls.certresolver=le"
   ```

4. **Entrypoints**  
   Confira no Traefik os entrypoints (ex.: `web` para 80, `websecure` para 443) e use os mesmos nas labels.

## Depois de alterar

Atualize a stack no Portainer (Web editor ou Git). O Traefik passa a expor **ia.agboom.com.br** sem precisar de **:8081**.
