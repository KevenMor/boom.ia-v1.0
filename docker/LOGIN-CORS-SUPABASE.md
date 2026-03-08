# Login: "Failed to fetch" – CORS no Supabase

O login do painel chama a **API de Auth do Supabase** direto do navegador (de `http://ia.agboom.com.br` para a URL do Supabase no Easypanel). Se o Supabase não permitir a origem do painel, o navegador bloqueia a requisição e aparece **"Failed to fetch"**.

## O que fazer no Easypanel / Supabase

1. **Confirme a URL do Supabase**  
   A mesma URL usada no backend (`NEXUS_DB_URL`) deve ser usada no build do frontend como `VITE_SUPABASE_URL`.  
   Exemplo: `https://boomsolution-supabase.kgn6uc.easypanel.com` (ou `.host`, conforme o que estiver ativo).

2. **Libere CORS para o domínio do painel**  
   No projeto do Supabase no Easypanel (ou no Kong, se configurar por lá), inclua a origem do painel nas origens permitidas (CORS), por exemplo:
   - `http://ia.agboom.com.br`
   - `https://ia.agboom.com.br` (quando tiver HTTPS)

   Onde isso fica depende da versão do Supabase e do Easypanel. Em geral:
   - **Supabase (Dashboard)** → **Authentication** → **URL Configuration** → **Redirect URLs** (e, se existir, configuração de “Allowed origins” ou CORS).
   - **Kong** (se o tráfego passar por ele): adicionar um plugin CORS ou headers que enviem `Access-Control-Allow-Origin: http://ia.agboom.com.br`.

3. **Build do frontend com a URL certa**  
   Ao gerar a imagem do frontend, use a mesma URL do Supabase:
   ```text
   --build-arg VITE_SUPABASE_URL=https://boomsolution-supabase.kgn6uc.easypanel.com
   --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=...
   ```
   Assim o `nexus-client` (e o login) usam essa URL e o CORS precisa permitir apenas essa origem do frontend (`http://ia.agboom.com.br` / `https://ia.agboom.com.br`).

## Resumo

- **Failed to fetch** = navegador bloqueou a chamada (geralmente CORS ou URL errada).
- **URL** = mesma do backend, via `VITE_SUPABASE_URL` no build.
- **CORS** = Supabase/Kong deve permitir a origem `http://ia.agboom.com.br` (e `https://...` quando existir).
