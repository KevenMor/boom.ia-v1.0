# lib (frontend)

## Propósito
Funções puras + HTTP client. Sem React (exceto tipos). Testes `*.test.ts` lado-a-lado.

## Arquivos-chave

| Arquivo | Papel |
|---------|--------|
| utils.ts | `cn()` — único merge de classes |
| api-client.ts | `callAPI` / `getApiBase` + header `x-nexus-auth` |
| tenant-modules.ts | 22 `ModuleKey` + labels/ações ACL |
| tenant-modules-cache.ts / resolve-tenant-module-access.ts | cache e resolução ACL |
| dashboard-visual.ts | `DashboardVisual`, charts (helpers ignoram `visual` hoje) |
| embed-theme.ts / embed-credentials.ts / embed-*-api.ts | embeds Chatwoot |
| br-datetime.ts / capitalizeName.ts | locale BR |
| exportCsv.ts / parseCsv.ts | CSV |
| image-file-guards.ts | tipo/tamanho upload |
| provider-models.ts / tool-type-meta.ts | catálogos LLM/tools |
| chatMessageDisplay.ts / conversation-display.ts | chat UI |
| suite-gallery-display.ts / videoUrl.ts / viacep.ts | domínio |
| financial-templates.ts / calendar-ownership.ts / crm-phone-match.ts | domínio |
| query-cache-persist.ts / sandbox-session.ts | persistência |

## Decisões
- `getApiBase()`: `/api` em dev (proxy Vite); `origin/api` em prod
- `cn()` = clsx + tailwind-merge — não concatenar classes na mão

## Cuidados
- Alterar `api-client` / `cn` / `getApiBase` afeta o painel inteiro
- `image-file-guards` é limite de segurança
- Classes `cw-*` **não** estão no Tailwind — ver `docs/DESIGN-SYSTEM.md`
