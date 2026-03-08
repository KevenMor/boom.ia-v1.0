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
