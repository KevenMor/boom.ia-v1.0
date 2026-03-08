# Testes de conectividade com o Supabase (Easypanel)

Use estes testes para descobrir por que o login dá "Failed to fetch" ou se o backend não consegue falar com o Supabase.

---

## Teste A – Backend → Supabase

Verifica se o **servidor** (boom_ia_server) consegue alcançar o Supabase (NEXUS_DB_URL).

**Como testar:**

```bash
curl -s "https://ia.agboom.com.br/api/health/nexus"
```

**Resultado esperado (ok):**
```json
{"ok":true,"nexus":"reachable","url":"boomsolution-supabase.kgn6uc.easypanel.com"}
```

**Se `ok: false`:** o problema é rede, URL ou credenciais no backend. Confira `NEXUS_DB_URL` e `NEXUS_DB_ANON_KEY` no compose da stack boom_ia.

---

## Teste B – Navegador → Supabase (login)

Verifica se o **navegador** consegue chamar o Supabase Auth (CORS, URL).

**Como testar:**

1. Abra **https://ia.agboom.com.br/login**
2. Abra o **DevTools** (F12) → aba **Network**
3. Tente fazer login (email e senha)
4. Localize a requisição que falha (em vermelho), geralmente para `.../auth/v1/token`

**O que observar:**

- Se a requisição aparecer em vermelho e no detalhe **não** houver header `Access-Control-Allow-Origin` (ou com origem diferente de `https://ia.agboom.com.br`) → **CORS**. O Supabase (Kong) precisa permitir essa origem. Ver [LOGIN-CORS-SUPABASE.md](LOGIN-CORS-SUPABASE.md).
- Se der "blocked by CORS", "Failed to fetch" ou "net::ERR_..." → anote a **URL exata** usada (deve ser a do `VITE_SUPABASE_URL` do build do frontend). Confira se é a URL pública correta do Supabase (ex.: `https://boomsolution-supabase.kgn6uc.easypanel.com`).

---

## Teste C – URL do Supabase acessível

Verifica se a URL do Supabase responde de fora (VPS ou seu PC).

**Como testar (na VPS ou no seu PC):**

```bash
curl -I "https://boomsolution-supabase.kgn6uc.easypanel.com/rest/v1/"
```

**Resultado esperado:** status 200 ou 401 (não timeout, não DNS error). Se der timeout ou "Could not resolve host", a URL está errada ou inacessível.

Se o frontend usa outra URL (ex.: `.host` em vez de `.com`), teste também:

```bash
curl -I "https://boomsolution-supabase.kgn6uc.easypanel.host/rest/v1/"
```

---

## Resumo

| Teste | O que verifica | Se falhar |
|-------|----------------|-----------|
| A | Servidor → Supabase | Ajuste NEXUS_DB_URL, credenciais ou rede no backend |
| B | Navegador → Supabase (login) | CORS no Supabase/Kong ou VITE_SUPABASE_URL errada no build do frontend |
| C | URL do Supabase acessível | URL errada ou Supabase inacessível |

Ver também [LOGIN-CORS-SUPABASE.md](LOGIN-CORS-SUPABASE.md) para configurar CORS no Easypanel/Supabase.
