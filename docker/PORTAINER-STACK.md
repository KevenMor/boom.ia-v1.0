# Deploy da Boom IA como Stack no Portainer

## 1. Preparar as variáveis

Use o arquivo **`.env.portainer.example`** na raiz do projeto como modelo. Preencha (ou peça para o assistente preencher) com os dados do **Supabase na sua VPS**:

- **NEXUS_DB_URL** – URL da API do Supabase (Kong). Se o Supabase está na mesma VPS na mesma rede Docker: `http://NOME_DO_SERVIÇO_SUPABASE:8000`. Se tem domínio: `https://supabase.seudominio.com`.
- **NEXUS_SERVICE_ROLE_KEY** – Chave `service_role` do projeto (Settings → API no dashboard do Supabase).
- **NEXUS_DB_ANON_KEY** – Chave `anon` do projeto.
- **VITE_SUPABASE_URL** – URL que o **navegador** usa para auth (geralmente a URL pública do Supabase).
- **VITE_SUPABASE_PUBLISHABLE_KEY** – Mesma chave `anon`.
- **VITE_SUPABASE_PROJECT_ID** – Project reference (ex.: no dashboard ou na URL).
- **ENCRYPTION_KEY** – String de 32+ caracteres (ex.: `openssl rand -base64 32`).
- **API_BASE_URL** e **CORS_ORIGINS** – URL do painel (ex.: `https://ia.agboom.com.br`).
- **VITE_API_URL** – URL do painel + `/api` (ex.: `https://ia.agboom.com.br/api`).

## 2. Criar a Stack no Portainer

1. **Stacks** → **Add stack**.
2. **Name**: `boom-ia` (ou outro nome).
3. **Build method**: **Git repository** (recomendado).
   - **Repository URL**: `https://github.com/KevenMor/boom.ia-v1.0` (ou seu repositório).
   - **Repository reference**: `main` (ou a branch que você usa).
   - **Compose path**: `docker-compose.yml` (se estiver na raiz, pode deixar em branco dependendo da versão do Portainer).
4. **Environment variables**:
   - Opção A: **Load variables from .env file** e cole o conteúdo do `.env` já preenchido.
   - Opção B: Adicione cada variável manualmente (nome e valor).
5. **Deploy the stack**.

## 3. Rede e portas

- A stack expõe apenas a **porta 80** (serviço `proxy`).
- O proxy encaminha:
  - `/` → frontend (React).
  - `/api` → servidor (Node.js).
- Se o painel for acessado por domínio (ex.: `ia.agboom.com.br`), configure o DNS/reverse proxy para apontar para o IP da VPS na porta 80.

## 4. Após o deploy

- Acesse o painel pela URL configurada em **API_BASE_URL** / **CORS_ORIGINS** (ex.: `https://ia.agboom.com.br`).
- Se der erro de login ou "Failed to fetch", confira:
  - **VITE_API_URL** com a URL correta (mesmo domínio + `/api`).
  - **NEXUS_DB_URL** acessível a partir do container do servidor (URL interna na mesma rede ou URL pública).
  - **CORS_ORIGINS** com exatamente a origem do frontend (com `https`, sem barra no final).
