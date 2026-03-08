# Configuração Easypanel - Boom IA

## 1. Dois serviços necessários

O repositório tem **dois** containers:

| Serviço   | Build Path | Dockerfile       | Porta | O que faz |
|-----------|------------|------------------|-------|-----------|
| **Frontend** | `/` (raiz) | `Dockerfile`     | 80  | Painel React (nginx) |
| **Servidor** | `/` (raiz) | **`Dockerfile.server`** | 3001 | API Node.js (chat, banco, tools) |

Use **`Dockerfile.server`** na raiz para o servidor — assim o Build Path pode ser `/` e não ocorre o erro `server/server: no such file or directory`.

- **Só o servidor** usa variáveis de banco (`NEXUS_DB_URL`, `NEXUS_SERVICE_ROLE_KEY`).
- As variáveis do **server/.env.easypanel** devem ser configuradas **apenas no serviço do Servidor** no Easypanel.

---

## 2. Configuração do serviço SERVIDOR no Easypanel

### Fonte (Source)
- **Github:** `KevenMor/boom.ia-v1.0`
- **Ramo:** `main`
- **Caminho de Build (Build Path):** **`/`** (raiz)

### Construção (Build)
- **Método:** Dockerfile
- **Arquivo:** **`Dockerfile.server`** ← obrigatório (é o Dockerfile da raiz que builda o server)

Se você usar Build Path `server` e Arquivo `Dockerfile`, o Arquivo deve ser só **`Dockerfile`** (não `server/Dockerfile`), senão o Easypanel procura `server/server/Dockerfile` e dá erro.

### Variáveis de ambiente (Environment)
Adicione **cada variável** separadamente (nome e valor). Não cole o `.env` inteiro com comentários.

Obrigatórias:

| Nome | Valor |
|------|--------|
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `NEXUS_DB_URL` | Ver seção 3 abaixo |
| `NEXUS_SERVICE_ROLE_KEY` | Chave service_role do seu Supabase |
| `ENCRYPTION_KEY` | Sua chave de 32+ caracteres |
| `API_BASE_URL` | `https://ia.agboom.com.br` |
| `CORS_ORIGINS` | `https://ia.agboom.com.br` |

Opcionais (fallback): `NEXUS_DB_ANON_KEY`

---

## 3. NEXUS_DB_URL – conexão com o banco

O servidor usa a **API REST** do Supabase (HTTP), não conexão direta PostgreSQL.

### Se o Supabase está no Easypanel (self-hosted)

O Kong (API) costuma estar na **porta 8000**.

- **URL pública:**  
  `https://boomsolution-supabase.kgn6uc.easypanel.host`  
  (se o Easypanel expõe HTTPS na porta 443 para esse serviço)

- **URL interna** (recomendado entre serviços no mesmo Easypanel):  
  `http://NOME_DO_SERVIÇO_SUPABASE:8000`  
  Exemplo: `http://boomsolution-supabase:8000`  
  (troque pelo nome real do serviço Supabase no Easypanel)

Teste primeiro a **URL interna** no serviço do servidor:

```env
NEXUS_DB_URL=http://boomsolution-supabase:8000
```

Se o nome do serviço for outro (ex.: `supabase`), use esse nome no lugar de `boomsolution-supabase`.

### Se o Supabase é Cloud (supabase.com)

- **NEXUS_DB_URL:** `https://SEU_PROJECT_REF.supabase.co`
- **NEXUS_SERVICE_ROLE_KEY:** em **Settings → API → service_role** no dashboard do projeto

---

## 4. Checklist – falha de comunicação com o banco

- [ ] Existe um **serviço separado** para o servidor (Build Path = `server`), não só o frontend.
- [ ] No serviço do **servidor**, todas as variáveis do **server/.env.easypanel** estão preenchidas (sem comentários nos valores).
- [ ] **NEXUS_DB_URL** é URL HTTP/HTTPS da API (não `postgres://`).
- [ ] Se Supabase está no Easypanel: **NEXUS_DB_URL** usa a URL **interna** (ex.: `http://boomsolution-supabase:8000`).
- [ ] **NEXUS_SERVICE_ROLE_KEY** é a chave **service_role** do **mesmo** projeto Supabase dessa URL.
- [ ] Após alterar variáveis, o serviço do servidor foi **reiniciado** (redeploy/restart).

---

## 5. Domínio ia.agboom.com.br

- **Frontend:** `https://ia.agboom.com.br` → serviço que usa o Dockerfile da **raiz** (porta 80).
- **API:** `https://ia.agboom.com.br/api` → deve ser encaminhado para o **serviço do servidor** (porta 3001).

No Easypanel (ou proxy reverso), configure o roteamento para que `/api` aponte para o container do servidor na porta 3001.

---

## 6. Resumo rápido

1. **Dois serviços:** frontend (raiz, porta 80) e servidor (build path `server`, porta 3001).
2. **Variáveis de banco** só no serviço do **servidor**.
3. **NEXUS_DB_URL** no Easypanel self-hosted: preferir URL interna `http://NOME_SERVIÇO_SUPABASE:8000`.
4. **NEXUS_SERVICE_ROLE_KEY** = service_role do mesmo projeto Supabase.
5. Depois de mudar env, **reiniciar** o serviço do servidor.
