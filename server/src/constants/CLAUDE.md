# constants

## Propósito
Constantes compartilhadas do backend — atualmente contém lista de respostas "soft" do LLM que devem ser filtradas.

## Arquitetura
- Arquivo único com array de strings + teste.
- Consumido por `routes/chat-local.ts` para detectar respostas vazias/inúteis do LLM.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| assistant-soft-replies.ts | Lista de frases genéricas que o LLM produz e devem ser filtradas |
| assistant-soft-replies.test.ts | Testes da lista |

## Decisões técnicas
- Filtro por substring match — frases como "Como posso ajudar?" são descartadas quando o agente deveria ficar em silêncio.

## Convenções
- Constantes em UPPER_SNAKE_CASE.
- Teste lado-a-lado.

## Fluxos críticos
1. `chat-local.ts → verifica se resposta do LLM é soft reply → descarta se sim`

## Cuidados ao modificar
- Adicionar frases muito genéricas pode filtrar respostas legítimas.
- Rodar teste após alteração.
