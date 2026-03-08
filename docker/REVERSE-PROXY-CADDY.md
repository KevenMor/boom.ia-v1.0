# Proxy reverso com Caddy (domínio sem porta + HTTPS)

Use isto **só se a porta 80 já estiver ocupada** na VPS (ex.: outro painel, Traefik). O Caddy escuta na 80 e 443 e encaminha **ia.agboom.com.br** para o serviço na 8081, e ainda gera certificado HTTPS automático (Let's Encrypt).

## 1. Deixar a stack Boom na 8081

No `docker-compose.portainer.yml`, o proxy deve publicar na **8081** (não 80):

```yaml
proxy:
  ports:
    - target: 80
      published: 8081
      mode: host
```

Faça o deploy da stack **boom_ia** com essa configuração.

## 2. Instalar e rodar o Caddy na VPS

Na **VPS** (SSH), com usuário que tenha permissão para usar a porta 80:

**Criar Caddyfile:**

```bash
sudo mkdir -p /etc/caddy
sudo nano /etc/caddy/Caddyfile
```

Conteúdo (opcional: troque o e-mail para avisos do Let's Encrypt):

```
{
    email seu-email@exemplo.com
}

ia.agboom.com.br {
    reverse_proxy 127.0.0.1:8081
}
```

O Caddy obtém certificado HTTPS (Let's Encrypt) automaticamente. Salve (Ctrl+O, Enter, Ctrl+X).

**Rodar Caddy com Docker (recomendado):**

```bash
docker run -d --name caddy --network host \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  caddy:alpine caddy run --config /etc/caddy/Caddyfile
```

Ou [instale o binário do Caddy](https://caddyserver.com/docs/install) e rode como serviço (systemd).

## 3. Resultado

- **http://ia.agboom.com.br** → Caddy encaminha para 127.0.0.1:8081 (stack Boom).
- **https://ia.agboom.com.br** → Caddy gera o certificado e faz proxy para 8081.

Não é mais necessário usar **:8081** na URL para o cliente.
