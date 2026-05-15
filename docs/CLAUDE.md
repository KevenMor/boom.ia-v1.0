# docs

## Propósito
Documentação operacional do projeto — paridade dev/prod, relatórios E2E, sistema de hospedagem e guias de funcionalidades.

## Arquitetura
- Documentos markdown organizados por tema.
- Relatórios E2E gerados por scripts de teste.
- Documentação de hospedagem é a mais extensa (8 arquivos).

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| DEV-PROD-PARIDADE.md | Regras de paridade entre dev e produção |
| LEMBRETES-AGENDAMENTO.md | Documentação do sistema de lembretes |
| CHAT-AO-VIVO-LOGS.md | Logging de chat ao vivo |
| E2E-*.md | Relatórios de testes end-to-end por tenant |
| HOSPEDAGEM*.md | Documentação completa do módulo de hospedagem (ativação, exemplos, fluxos, tool spec, diagramas, correções) |

## Decisões técnicas
- Docs no repo (não wiki externa) — versionados junto com código.
- Relatórios E2E mantidos como histórico — não deletar.
- Hospedagem tem documentação extensa por ser o módulo mais complexo.

## Convenções
- Nomes em UPPER-KEBAB-CASE.
- Prefixo por tema: `E2E-*`, `HOSPEDAGEM*`.
- Português brasileiro.

## Fluxos críticos
Nenhum — pasta de referência.

## Cuidados ao modificar
- Não deletar relatórios E2E (histórico).
- Manter DEV-PROD-PARIDADE.md atualizado ao alterar deploy.
- Documentação de hospedagem deve refletir estado atual do código.
