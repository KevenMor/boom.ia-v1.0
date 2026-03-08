# Instruções para Redeploy no Portainer

**Status:** Imagens Docker atualizadas e enviadas para o GHCR. O chat em produção ainda retorna 502 até que o redeploy seja concluído.

As imagens Docker foram atualizadas e enviadas para o GHCR. Siga estes passos para aplicar as correções em produção:

## 1. Acessar o Portainer

1. Abra o painel do Portainer no navegador
2. Navegue até a stack **Boom IA** (ou o nome da stack que você usa)

## 2. Atualizar a Stack

1. Clique na stack
2. Clique em **"Editor"** ou **"Update the stack"**
3. Certifique-se de que o conteúdo do editor usa o arquivo `docker-compose.portainer.yml` atualizado
4. Se o Portainer estiver configurado para usar o repositório Git:
   - Clique em **"Pull and redeploy"** ou **"Update the stack"**
   - Se não tiver opção de pull, faça um **"Redeploy"** da stack
5. Se usar o Web Editor:
   - Cole o conteúdo de `docker-compose.portainer.yml`
   - Clique em **"Update the stack"**

## 3. Forçar Pull das Novas Imagens

Para garantir que as imagens mais recentes sejam usadas:

1. No Portainer, vá em **Services** ou **Containers**
2. Para cada serviço (server, frontend, proxy):
   - Clique no serviço
   - Opção **"Pull and redeploy"** ou **"Recreate"**
   - Se não houver, use **"Update the stack"** com a opção **"Pull latest image"** marcada

## 4. Verificar

1. Aguarde os containers reiniciarem (1-2 minutos)
2. Verifique os logs do container **server** - não deve haver erros de startup
3. Teste o chat em: https://ia.agboom.com.br/agents
   - Envie "Olá" para uma mensagem simples
   - Envie "Quero comprar uma S10" para testar com tool call

## Variáveis de Ambiente (já no docker-compose.portainer.yml)

- `OPENAI_API_KEY` - chave OpenAI para fallback
- `GEMINI_API_KEY` - chave Gemini para fallback

Ambas já estão configuradas no arquivo. Se o Portainer usar variáveis de ambiente separadas, adicione-as manualmente.
