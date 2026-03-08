# Rodar Boom IA com Docker

## 1. Arquivo `.env`

Na **raiz do projeto**, crie um arquivo `.env` (não commitar) a partir do exemplo:

```bash
cp .env.example .env
```

Edite o `.env` e preencha:

- **NEXUS_*** e **VITE_SUPABASE_***: use o **seu** projeto Supabase (veja seção abaixo).
- **ENCRYPTION_KEY**: string de 32+ caracteres (ex.: `openssl rand -base64 32`).

## 2. Sobre a URL do Supabase (não use mais a do Lovable)

A URL `https://qqueviooottrostbxkek.supabase.co` é de um projeto **Supabase Cloud** que o Lovable criou para o app. Se você já migrou para o **seu** Supabase (Easypanel self-hosted ou outro projeto em supabase.com), use **sempre** a URL e as chaves **do seu projeto**:

| Onde | O que usar |
|------|------------|
| **Servidor** (`NEXUS_DB_URL`, `NEXUS_SERVICE_ROLE_KEY`, `NEXUS_DB_ANON_KEY`) | URL e chaves do **seu** Supabase |
| **Frontend** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`) | **Mesmo** projeto Supabase |

- **Supabase Cloud**: em [supabase.com](https://supabase.com) → seu projeto → Settings → API: URL, `anon` e `service_role`.
- **Supabase no Easypanel**: use a URL interna no servidor (`http://NOME_SERVIÇO:8000`) e a URL **pública** no frontend (para o browser acessar auth), se aplicável.

Assim você deixa de depender do projeto “Lovable Cloud” e usa só o seu banco.

## 3. Subir os containers

```bash
docker-compose up --build -d
```

- **Frontend + API**: http://localhost (proxy na porta 80).
- **API direta**: o servidor escuta na rede interna na porta 3001 (não exposta).

## 4. Parar

```bash
docker-compose down
```

## 5. Produção (Easypanel)

Para deploy em produção, use dois serviços no Easypanel (frontend e server) e as variáveis descritas em `server/EASYPANEL-CONFIG.md` e em `.env.frontend.easypanel`. O `.env` da raiz é para rodar com **Docker Compose** local.
