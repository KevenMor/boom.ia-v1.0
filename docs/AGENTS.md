# docs

## Contexto rápido
Documentação operacional — paridade dev/prod, relatórios E2E, hospedagem e guias de funcionalidades.

## Stack e ferramentas
- Markdown
- Gerado manualmente e por scripts E2E

## Como modificar

### Adicionar uma feature
1. Criar `docs/NOME-DO-TEMA.md`
2. Usar formato existente como referência
3. Linkar no CLAUDE.md raiz se relevante

### Corrigir um bug
1. Verificar se doc reflete estado atual do código
2. Atualizar com informação correta

### Refatorar
1. Não deletar relatórios E2E
2. Consolidar docs de hospedagem se ficarem redundantes

## Comandos úteis
```bash
# buscar em docs
grep -r "termo" docs/
```

## Regras invioláveis
- Nunca deletar relatórios E2E (histórico de qualidade)
- Sempre manter DEV-PROD-PARIDADE.md atualizado
- Documentar em português brasileiro

## Mapa de dependências
```
docs/
├── referencia → server/ (funcionalidades documentadas)
├── referencia → docker/ (deploy)
├── referencia → sql/ (schema)
└── depende de → nenhum código (pura documentação)
```
