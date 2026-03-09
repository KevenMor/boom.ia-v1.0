# Verificação E2E – Boom IA em produção (EasyPanel)

## Erro 502 e "server could not be resolved"

Se no log do **frontend (Boom_iav1)** aparecer:

```
server could not be resolved (3: Host not found)
POST /api/supabase-proxy/auth/v1/token ... 502
```

é porque o container do frontend foi buildado com o **nginx antigo** (hostname `server:3001`). No EasyPanel o backend se chama **services_boomia**. O repositório já tem o `nginx.conf` correto; é obrigatório dar **Redeploy do Boom_iav1** para a nova imagem subir.

## Erro "Decryption failed" no sandbox

Acontece quando a **ENCRYPTION_KEY** do serviço **services_boomia** não é a mesma que foi usada para criptografar as chaves dos providers no banco. Solução: usar a mesma ENCRYPTION_KEY em todos os ambientes ou re-salvar as chaves dos providers (Provedores → editar → salvar a API key de novo). O endpoint `/admin/provider-keys` (decrypt) agora retorna mensagem clara em caso de falha.

## Erro "Provider error: 403" no sandbox

O **403** vem da API do provedor de IA (OpenAI ou Gemini), não do nosso servidor. Significa que a **API key** configurada no provedor está **inválida, expirada ou sem permissão** para aquele endpoint/modelo.

**O que fazer:**

1. **Provedores** (menu) → abrir o provedor usado pelo agente (ex.: OpenAI ou Google).
2. **Atualizar a API key:** editar e colar uma chave válida, depois salvar (a chave será criptografada com a ENCRYPTION_KEY do servidor).
3. Se usar **chaves por variável de ambiente** (OPENAI_API_KEY / GEMINI_API_KEY no **services_boomia**), conferir se estão corretas e com créditos/plano ativo.
4. **403** também pode ser plano sem acesso ao modelo (ex.: modelo só para contas pagas) ou base_url errada no provedor — conferir **Base URL** (OpenAI: `https://api.openai.com/v1`, Gemini: `https://generativelanguage.googleapis.com/v1beta`).

O servidor agora envia uma mensagem mais clara para o frontend em caso de 401/403/429 do provedor.

---

## O que foi corrigido

1. **Hostname do backend no nginx**  
   O frontend (Boom_iav1) usa nginx como reverse proxy para a API. O backend no EasyPanel chama-se **services_boomia**, mas o `nginx.conf` estava com **server:3001**.  
   - **Alteração:** em `nginx.conf`, `server:3001` foi trocado para **services_boomia:3001**.  
   - **Commit:** `fix: nginx backend hostname to services_boomia for EasyPanel` (já no GitHub).

2. **Decrypt do provider no server**  
   Em `server/src/routes/admin.ts`, o action `decrypt` de `/admin/provider-keys` agora está em try/catch e retorna `{ error: "Decryption failed", detail: "..." }` em vez de 500 bruto quando a ENCRYPTION_KEY não confere.

3. **Redeploy do frontend**  
   Para a correção valer em produção, é preciso **dar redeploy do serviço Boom_iav1** no EasyPanel (para buildar de novo com o `nginx.conf` atualizado).

---

## Passos para garantir funcionamento

### 1. Redeploy do Boom_iav1

- EasyPanel → projeto **conexoesapp** → serviço **Boom_iav1** → **Deploy** (ou “Redeploy”).
- Aguardar o build e o container subir.

### 2. Checar conectividade da API

Após o redeploy, abrir no navegador (ou via curl):

- **Health do servidor:**  
  https://ia.agboom.com.br/health  
  - Esperado: JSON `{"ok":true,"timestamp":"..."}`.

- **Health do Nexus (Supabase):**  
  https://ia.agboom.com.br/api/health/nexus  
  - Esperado: JSON com status da conexão (ex.: `{"ok":true}` ou similar).

Se aparecer a página 404 do Boom IA em vez de JSON, o proxy ainda não está indo para o backend (confirme o redeploy e o nome do serviço **services_boomia**).

### 3. Login E2E

1. Abrir https://ia.agboom.com.br/
2. Fazer logout se já estiver logado.
3. Login: **contato@agboom.com.br** / **123456**.
4. Verificar:
   - Redirecionamento para o dashboard.
   - Aba “Agentes” e sandbox do agente sem erro “Chat error: fetch failed” no console.

### 4. Console e rede

- **Console (F12):** não deve aparecer `Chat error: Error: fetch failed` ao abrir o sandbox de um agente.
- **Rede (F12 → Network):** chamadas para `ia.agboom.com.br/api/...` (ex.: `/api/chat`, `/api/supabase-proxy/...`) devem retornar **200** (ou 201 etc.), não 502/503/404.

---

## Resumo da arquitetura (EasyPanel)

- **Boom_iav1:** frontend (React + nginx). Domínio: **ia.agboom.com.br**. Nginx faz proxy de `/api/` e `/health` para o backend.
- **services_boomia:** backend Node (Fastify) na porta **3001**. Sem domínio público; acessado só pelo frontend via rede interna.
- **Supabase:** já em uso em **boomsolution-supabase.kgn6uc.easypanel.host** (auth e REST). O frontend usa `/api/supabase-proxy` (que o backend repassa ao Supabase) ou contato direto conforme o build.

Se após o redeploy o login ou o chat ainda falharem, conferir nos logs do **services_boomia** (EasyPanel → Logs do serviço) erros de conexão com Supabase ou de binding na porta 3001.
