# Portainer – Stack 0/1 e sem logs

Quando todos os serviços ficam **0/1** e não aparecem logs, em geral é **falha ao puxar a imagem** ou **container saindo logo ao subir**. Siga os passos abaixo.

---

## 1. Ver o erro real no Portainer

Os logs do serviço podem estar vazios se o container nem chegar a rodar. O motivo costuma aparecer na **tarefa** do serviço:

1. **Services** → clique no nome do serviço (ex.: **boom_ia_server**).
2. Aba **Tasks**.
3. Clique na tarefa com status **Failed** / **Rejected** / **Shutdown**.
4. Veja a mensagem (ex.: `no such image`, `pull access denied`, `failed to create task`).

Anote a mensagem; ela indica se o problema é **pull da imagem** ou **erro ao iniciar**.

---

## 2. Imagens do GHCR acessíveis na VPS

Se o erro for tipo **pull access denied** ou **unauthorized**, a VPS não está conseguindo baixar as imagens do GitHub Container Registry.

**Opção A – Deixar os pacotes públicos (recomendado):**

1. No GitHub: **Your profile** → **Your repositories** → **boom.ia-v1.0** (ou pelo menu).
2. À direita: **Packages** (ou acesse **github.com/KevenMor?tab=packages**).
3. Abra cada pacote: **kevenmor/boom-ia-server**, **kevenmor/boom-ia-frontend**, **kevenmor/boom-ia-proxy**.
4. Em cada um: **Package settings** → **Danger zone** → **Change visibility** → **Public**.

Assim o Portainer na VPS consegue fazer `docker pull` sem login.

**Opção B – Usar credenciais no Portainer:**

1. No Portainer: **Registries** → **Add registry**.
2. **Name:** `ghcr.io`
3. **Registry URL:** `https://ghcr.io`
4. **Authentication:** marque e use:
   - **Username:** `KevenMor`
   - **Password:** token do GitHub com permissão `read:packages`
5. **Add registry**.

Depois disso, o Portainer usa esse registry para puxar as imagens `ghcr.io/kevenmor/...`.

---

## 3. Testar com uma stack mínima

Para confirmar que o Swarm e o Portainer estão ok:

1. **Stacks** → **Add stack** → **Web editor**.
2. Nome: `teste-nginx`.
3. Cole:

```yaml
version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - target: 80
        published: 8082
        mode: host
    deploy:
      replicas: 1
      restart_policy:
        condition: any
```

4. **Deploy the stack**.

Se ficar **1/1** e você acessar `http://IP_DA_VPS:8082` e ver a página do nginx, o problema da stack Boom IA é **só imagem** (pull) ou **configuração da aplicação**. Se esse teste também ficar 0/1, o problema é do ambiente (rede, Swarm, Portainer).

---

## 4. Resumo

| Sintoma              | Onde ver o erro              | Ação provável                          |
|----------------------|-----------------------------|----------------------------------------|
| 0/1, sem logs       | Services → serviço → Tasks  | Ver mensagem da tarefa falha           |
| `pull access denied`| Mensagem na tarefa          | Deixar pacotes GHCR públicos ou registry no Portainer |
| Tarefa "Rejected"    | Mensagem na tarefa          | Ajustar recurso, placement ou imagem   |

Depois de deixar as imagens públicas (ou adicionar o registry), faça **Redeploy** da stack Boom IA e confira de novo em **Tasks** se ainda aparecer 0/1.

---

## 5. Já deixou público e ainda 0/1

1. **Veja o erro na tarefa**  
   **Services** → **boom_ia_server** (ou boom_ia_proxy) → aba **Tasks** → clique na tarefa com status **Failed** / **Rejected**.  
   A mensagem pode ser:
   - `no such image` / `pull access denied` → imagem inacessível ou nome errado
   - `failed to create task` / `invalid argument` → configuração do serviço ou do Swarm
   - `non-zero exit` → container saiu ao iniciar; veja os **logs** do serviço (aba Logs). Com **server v6** deve aparecer pelo menos `[Boom] Server starting...` antes de qualquer erro do Node.

2. **Remova a stack por completo**  
   Stacks → boom_ia → **Remove stack** (não só Redeploy). O Swarm às vezes mantém estado de falha em cache.

3. **Crie a stack de novo**  
   Add stack → Web editor → cole o `docker-compose.portainer-images.yml` (server **v6**, proxy **v4**) → Deploy the stack.

4. **Teste pull/run na VPS** (se tiver SSH):
   ```bash
   docker pull ghcr.io/kevenmor/boom-ia-server:v6
   docker run --rm -e PORT=3001 ghcr.io/kevenmor/boom-ia-server:v6
   ```
   Se o `pull` falhar, o problema é rede/firewall ou pacote não público.  
   Se o `run` subir e cair na hora, veja a última linha do log (erro do Node). O server v6 imprime `[Boom] Server starting...` antes do Node; se aparecer isso e depois uma mensagem de erro, essa é a causa.

**Manda a mensagem de erro que aparece na tarefa** (e, se houver, a última linha do log do serviço) para afinar o próximo passo.

---

## 6. Proxy 0/1 com "host not found in upstream server"

Se o **boom_ia_proxy** fica **0/1** e nos logs aparece `host not found in upstream "server"`, o container está rodando a **imagem antiga** do proxy (sem o resolver em tempo de requisição).

**O que fazer:**

1. **No seu PC**, rebuild e push da imagem do proxy:
   ```powershell
   cd "C:\...\boom-agents"
   docker build -f docker/Dockerfile.proxy -t ghcr.io/kevenmor/boom-ia-proxy:latest .
   docker push ghcr.io/kevenmor/boom-ia-proxy:latest
   ```
2. No **Portainer**: na stack **boom_ia**, abra o serviço **boom_ia_proxy** → **Pull and redeploy** (ou **Recreate**) para puxar a nova imagem.

---

## 7. Porta 80 já em uso (proxy não sobe com 80:80)

Se o proxy está configurado com **80:80** e continua 0/1 (e não é o erro "host not found"), pode ser que a **porta 80** já esteja em uso na VPS.

**Na VPS (SSH):**
```bash
sudo ss -tlnp | grep ':80 '
# ou
sudo netstat -tlnp | grep ':80 '
```
Se aparecer algum processo, a 80 está ocupada. Opções:
- No compose, use **8081** de novo: `published: 8081` e acesse **http://ia.agboom.com.br:8081**.
- Ou pare o serviço que usa a 80 e deixe o proxy na 80.

---

## 8. Rede customizada (ex.: minha_rede)

A stack **boom_ia** usa a rede padrão da stack (**boom_ia_default**). O `docker-compose.portainer.yml` **não** referencia redes customizadas como **minha_rede**. Se você não anexou a stack à **minha_rede** no Portainer, ela não é a causa do proxy 0/1.  
Se a stack estiver em uma rede **internal: true**, o proxy não recebe tráfego externo; use a rede padrão da stack.
