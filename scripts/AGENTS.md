# scripts

## Contexto rápido
Scripts de automação — testes E2E visuais (PowerShell) e utilitários de verificação/migração de dados (TypeScript).

## Stack e ferramentas
- PowerShell (E2E visual)
- TypeScript + tsx (scripts de dados)
- Supabase JS (acesso ao banco)

## Como modificar

### Adicionar uma feature (novo script)
1. Para E2E visual: criar `scripts/e2e-nome.ps1`
2. Para verificação/migração: criar `server/scripts/nome.ts`
3. Documentar uso no cabeçalho do arquivo

### Corrigir um bug
1. Verificar se env vars estão configuradas
2. Verificar se server está rodando (para E2E)
3. Verificar conexão com Supabase

### Refatorar
1. Extrair helpers comuns para `server/scripts/lib/`
2. Não mesclar scripts destrutivos com verificações

## Comandos úteis
```bash
# rodar script TS
cd server && npx tsx scripts/verify-agent-tools.ts

# rodar E2E PowerShell
./scripts/e2e-gallery-visual.ps1

# rodar com env específico
cd server && dotenv -e .env -- npx tsx scripts/run-token-migration.ts
```

## Regras invioláveis
- Nunca rodar scripts de migração em produção sem backup
- Nunca rodar `remove-unimplemented-tools.ts` sem confirmar lista
- Sempre testar scripts destrutivos em staging primeiro
- Sempre documentar o que o script faz no cabeçalho

## Mapa de dependências
```
scripts/
├── consome → server/src/services/supabase.ts (createNexusClient)
├── consome → server/.env (env vars)
├── gera → docs/E2E-*.md (relatórios)
├── gera → e2e-screenshots/ (capturas)
└── depende de env → NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY
```
