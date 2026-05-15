# types

## Propósito
Declarações TypeScript globais do servidor.

## Arquitetura
- Arquivo único `global.d.ts` com tipos/interfaces globais disponíveis sem import.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| global.d.ts | Declarações globais de tipo para o server |

## Decisões técnicas
- Tipos globais evitam imports repetitivos para interfaces usadas em todo o server.

## Convenções
- Apenas tipos verdadeiramente globais aqui — tipos de domínio ficam nos respectivos módulos.

## Fluxos críticos
Nenhum — pasta de suporte.

## Cuidados ao modificar
- Alterações afetam todo o server — verificar com `tsc --noEmit`.
