# 🚀 Guia de Deploy - Boom IA Stack (ATUALIZADO)

## ✅ **1. YML CORRETO PARA PORTAINER**

Use: **`docker-compose.portainer-images.yml`**

Este arquivo está configurado com:
- ✅ **Server**: `ghcr.io/kevenmor/boom-ia-server:v4-debug` (com logs de debug)
- ✅ **Proxy**: `ghcr.io/kevenmor/boom-ia-proxy:v2` (com resolver DNS do Docker)
- ✅ **Frontend**: `ghcr.io/kevenmor/boom-ia-frontend:latest`
- ✅ Todas as variáveis de ambiente hardcoded
- ✅ `INTERNAL_API_BASE: "http://server:3001"` (HTTP interno)
- ✅ `INTERNAL_API_INSECURE_TLS: "true"` (backup se precisar HTTPS)
- ✅ Delays de restart para evitar race conditions (proxy aguarda 10s, frontend 5s)

---

## 📋 **2. PASSOS PARA DEPLOY NO PORTAINER**

### **Deletar e Recriar Stack**

1. **Deletar stack antiga:**
   - Acesse: https://portainer.agboom.com.br
   - Vá em: **Stacks** > `boom_ia` > **Delete this stack**

2. **Criar nova stack:**
   - Clique em: **Add stack**
   - Nome: `boom_ia`
   - Método: **Web editor**
   - Cole o conteúdo completo de: `docker-compose.portainer-images.yml`
   - Clique em: **Deploy the stack**

3. **Aguardar deploy:**
   - Aguarde 30-60 segundos
   - Vá em: **Stacks** > `boom_ia` > **Services**
   - Verifique se todos os 3 serviços estão `1/1` (running)

**IMPORTANTE:** O proxy pode reiniciar algumas vezes até o server estar pronto. Isso é normal devido ao delay de 10s configurado.

---

## 🔧 **3. PROBLEMAS RESOLVIDOS NESTA VERSÃO**

### ✅ **Problema: "host not found in upstream 'server'"**

**Causa:** O proxy (nginx) estava tentando resolver o hostname `server` durante a inicialização, antes do serviço `server` estar disponível na rede Docker.

**Solução aplicada:**
1. Adicionado `resolver 127.0.0.11` no nginx (DNS interno do Docker)
2. Uso de variáveis `set $backend` para resolver o hostname em tempo de requisição (não na inicialização)
3. Delays de restart: proxy aguarda 10s, frontend 5s
4. Nova imagem do proxy: `v2` (forçando pull da nova versão)

### ✅ **Problema: DEPTH_ZERO_SELF_SIGNED_CERT**

**Causa:** O server estava fazendo `fetch` externo com HTTPS para `https://server:3001/api/chat-local`.

**Solução aplicada:**
1. Implementado `fastify.inject()` para chamadas in-process (sem rede)
2. Configurado `INTERNAL_API_BASE: "http://server:3001"` (HTTP interno)
3. Logs de debug adicionados para rastrear o fluxo

---

## 🧪 **4. TESTAR EM PRODUÇÃO**

Após o deploy, teste o chat:

1. Acesse: https://ia.agboom.com.br
2. Faça login
3. Envie uma mensagem no chat
4. Verifique se a resposta chega sem erro 502

### **Verificar Logs**

No Portainer:
1. Vá em: **Stacks** > `boom_ia` > **Services**
2. Clique em: `boom_ia_server`
3. Veja os logs em tempo real

**Logs esperados com v4-debug:**
```
[Chat] USE_CHAT_LOCAL: true USE_CHAT_LOCAL_INJECT: true
[Chat] Usando fastify.inject() para /api/chat-local
[Chat-Local] Recebendo mensagem...
```

**Logs esperados do proxy (v2):**
```
/docker-entrypoint.sh: Configuration complete; ready for start up
```

Se você ver `[emerg] host not found in upstream "server"` seguido de restart, é normal. O proxy vai reiniciar até o server estar pronto (máximo 3-4 tentativas).

---

## 🔧 **5. TROUBLESHOOTING**

### **Problema: Proxy continua com erro "host not found"**

**Causa:** Imagem antiga do proxy ainda em cache.

**Solução:**
1. SSH no servidor
2. Force o pull: `docker pull ghcr.io/kevenmor/boom-ia-proxy:v2`
3. Delete a stack no Portainer
4. Recrie a stack com `docker-compose.portainer-images.yml`

### **Problema: Server não mostra logs de debug**

**Causa:** Imagem antiga do server ainda em cache.

**Solução:**
1. SSH no servidor
2. Force o pull: `docker pull ghcr.io/kevenmor/boom-ia-server:v4-debug`
3. Delete a stack no Portainer
4. Recrie a stack com `docker-compose.portainer-images.yml`

### **Problema: Erro 502 persiste**

**Causa:** Código ainda está fazendo `fetch` com HTTPS.

**Solução:**
1. Verifique os logs do server para confirmar que `fastify.inject()` está sendo usado
2. Se não estiver, significa que a variável `USE_CHAT_LOCAL_INJECT` está `false`
3. Verifique o arquivo YML (linha 31-32) para confirmar as variáveis

---

## 📝 **RESUMO**

✅ **Arquivo correto:** `docker-compose.portainer-images.yml`  
✅ **Imagens corretas:**
   - Server: `ghcr.io/kevenmor/boom-ia-server:v4-debug`
   - Proxy: `ghcr.io/kevenmor/boom-ia-proxy:v2`
   - Frontend: `ghcr.io/kevenmor/boom-ia-frontend:latest`
✅ **Tudo commitado:** Sim, último commit `ddcf0b8`  
✅ **Próximo passo:** Deletar e recriar stack no Portainer  

---

## 🎯 **CHECKLIST FINAL**

- [ ] Stack antiga deletada no Portainer
- [ ] Nova stack criada com `docker-compose.portainer-images.yml`
- [ ] Todos os 3 serviços rodando (1/1 replicas)
- [ ] Proxy não mostra mais erro "host not found"
- [ ] Server mostra logs de debug
- [ ] Chat testado em https://ia.agboom.com.br
- [ ] Resposta do agente funciona sem erro 502

**Boa sorte! 🚀**
