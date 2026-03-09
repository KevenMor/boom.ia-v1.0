# Paridade Dev ↔ Produção

Garantir que tudo que funciona em dev funcione **exatamente igual** em produção.

---

## Regra de ouro

**Server e frontend precisam ser deployados juntos.** Se apenas o server for atualizado, a produção terá frontend antigo (e vice-versa).

---

## Checklist de deploy

### 1. Deploy do server
- [ ] Build da imagem `ghcr.io/kevenmor/boom-ia-server:latest`
- [ ] Push para o GHCR
- [ ] Stack na VPS faz pull da nova imagem

### 2. Deploy do frontend
- [ ] Build da imagem `ghcr.io/kevenmor/boom-ia-frontend:latest`
- [ ] **Build args** (se usar Easypanel/Docker): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`
- [ ] Push para o GHCR
- [ ] Stack na VPS faz pull da nova imagem

### 3. Proxy
- [ ] Imagem `ghcr.io/kevenmor/boom-ia-proxy:latest` — raramente muda

---

## O que NÃO muda entre dev e prod

| Aspecto | Comportamento |
|---------|---------------|
| **Código** | Mesmo código em ambos |
| **Features** | Nenhuma feature é escondida em prod |
| **API** | Mesma lógica; apenas a URL muda (localhost vs ia.agboom.com.br) |
| **Supabase** | Mesmo banco; URL resolve via proxy em ambos |

---

## O que muda (apenas URLs, automaticamente)

| Contexto | API | Supabase |
|----------|-----|----------|
| **Dev** | `/api` → proxy Vite → localhost:3001 | `window.origin/api/supabase-proxy` → backend |
| **Prod** | `https://ia.agboom.com.br/api` → proxy nginx → server | `https://ia.agboom.com.br/api/supabase-proxy` → backend |

A detecção é feita em runtime por `window.location.origin` (localhost = dev, domínio = prod). Não há flags ou config manual.

---

## Variáveis de ambiente

### Server (runtime)
Definidas no compose/stack:
- `NEXUS_DB_URL`, `NEXUS_SERVICE_ROLE_KEY`, `NEXUS_DB_ANON_KEY`
- `API_BASE_URL`, `CORS_ORIGINS`
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ENCRYPTION_KEY`

### Frontend (build time)
Passadas como build args no Docker:
- `VITE_SUPABASE_URL` — fallback: `https://boomsolution-supabase.kgn6uc.easypanel.host`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — fallback: anon key do Supabase demo
- `VITE_API_URL` — fallback: `http://localhost:3001/api` (não usado em prod; o frontend usa `window.location.origin/api`)

Se não passar os args, os fallbacks garantem funcionamento básico.

---

## Se algo funciona em dev mas não em prod

1. **Frontend desatualizado?** — Rebuild e push da imagem do frontend.
2. **Server desatualizado?** — Rebuild e push da imagem do server.
3. **Tenant/agente?** — Em prod, verifique se o tenant selecionado tem os mesmos agentes configurados (ex.: `reminder_enabled`).
4. **Cache do navegador?** — Ctrl+Shift+R ou abrir em aba anônima.

---

## Build local (para testar antes do deploy)

```bash
# Build ambos (server + frontend)
npm run build:docker:all

# Ou separadamente:
npm run build:docker:server
npm run build:docker:frontend

# Push (após docker login ghcr.io)
docker push ghcr.io/kevenmor/boom-ia-server:latest
docker push ghcr.io/kevenmor/boom-ia-frontend:latest
```
