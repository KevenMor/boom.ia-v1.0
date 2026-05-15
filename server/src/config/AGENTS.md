# config

## Contexto rápido
Validação de variáveis de ambiente do servidor — garante que o server não inicia sem configuração mínima.

## Stack e ferramentas
- TypeScript puro
- process.env (Node.js)

## Como modificar

### Adicionar uma feature
1. Adicionar nova var ao array `required` ou `keyRequired` em `env.ts`
2. Documentar em `.env.example` e `server/.env`
3. Atualizar docker-compose e Portainer stack

### Corrigir um bug
1. Verificar se a var está definida no ambiente (`.env`, Docker, Portainer)
2. Verificar se não há espaços/quebras de linha no valor

### Refatorar
1. Não remover validação de vars existentes sem verificar todos os consumidores

## Comandos úteis
```bash
# verificar env vars carregadas
cd server && node -e "require('dotenv/config'); console.log(Object.keys(process.env).filter(k => k.startsWith('NEXUS')))"
```

## Regras invioláveis
- Nunca commitar valores reais de env vars
- Sempre validar novas vars obrigatórias antes do server iniciar

## Mapa de dependências
```
config/
├── expõe para → ../index.ts (validateEnv)
├── expõe para → ../routes/*, ../services/* (getEnv)
└── depende de env → NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY, NEXUS_DB_ANON_KEY
```
