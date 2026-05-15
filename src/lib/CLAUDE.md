# lib (frontend)

## Propósito
Utilitários puros do frontend — API client, formatação BR, CSV, validação de imagens e helpers de domínio.

## Arquitetura
- Funções puras exportadas (sem side-effects, exceto `api-client.ts` que faz HTTP).
- `utils.ts` contém `cn()` (clsx + tailwind-merge) — usado em TODOS os componentes.
- `api-client.ts` é o wrapper HTTP com auto-auth (injeta token Supabase).
- Dependências internas: `../integrations/supabase/nexus-client.ts`.
- Dependências externas: clsx, tailwind-merge.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| utils.ts | cn() — merge de classes Tailwind |
| api-client.ts | callAPI(), getApiBase() — HTTP client com auth automática |
| br-datetime.ts | Formatação de datas em pt-BR |
| capitalizeName.ts | Capitalização de nomes |
| exportCsv.ts | Exportação de dados para CSV |
| parseCsv.ts | Parse de CSV |
| viacep.ts | Consulta CEP via ViaCEP API |
| videoUrl.ts | Utilitários de URL de vídeo |
| provider-models.ts | Lista de modelos por provider LLM |
| image-file-guards.ts | Validação de arquivos de imagem (tipo, tamanho) |
| suite-gallery-display.ts | Formatação de galerias para exibição |
| tenant-modules.ts | Verificação de módulos habilitados |
| chatMessageDisplay.ts | Formatação de mensagens de chat |
| financial-templates.ts | Templates de mensagens financeiras |

## Decisões técnicas
- `api-client.ts` resolve URL automaticamente: `/api` em dev (proxy Vite), `origin/api` em prod.
- Auto-auth: injeta `x-nexus-auth` header com access_token da sessão Supabase.
- `cn()` é o padrão shadcn — nunca usar `classnames` ou concatenação manual.

## Convenções
- Funções puras, sem estado.
- Testes lado-a-lado: `*.test.ts`.
- Nomes descritivos em camelCase.

## Fluxos críticos
1. `Hook/componente → callAPI("/endpoint", { body }) → auto-auth → fetch → JSON response`
2. `Componente → cn("base", conditional && "extra") → classe Tailwind merged`

## Cuidados ao modificar
- `api-client.ts` — alterações afetam TODAS as chamadas HTTP do frontend.
- `utils.ts` (cn) — usado em todos os componentes, não alterar assinatura.
- Não remover lógica de resolução de URL sem testar dev + prod.
- `image-file-guards.ts` — validação de segurança, não relaxar limites sem motivo.
