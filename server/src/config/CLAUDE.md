# config

## Propósito
Validação e acesso a variáveis de ambiente do servidor.

## Arquitetura
- Arquivo único `env.ts` com duas funções: `validateEnv()` (chamada no bootstrap) e `getEnv(key, fallback)`.
- Variáveis obrigatórias: `NEXUS_DB_URL`, e pelo menos uma de `NEXUS_SERVICE_ROLE_KEY` ou `NEXUS_DB_ANON_KEY`.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| env.ts | validateEnv(), getEnv() — validação e acesso tipado a env vars |

## Decisões técnicas
- Fail-fast: se variáveis obrigatórias faltam, o server não inicia (throw).
- `getEnv()` aceita fallback opcional — sem fallback, throw.

## Convenções
- Todas as env vars documentadas em `.env.example` e `server/.env`.
- Nunca acessar `process.env` diretamente fora deste módulo (ideal, não enforced).

## Fluxos críticos
1. `index.ts bootstrap → validateEnv() → server inicia ou crash`

## Cuidados ao modificar
- Adicionar nova env obrigatória quebra deploy se não configurada na VPS.
- Documentar novas vars em `.env.example`.
