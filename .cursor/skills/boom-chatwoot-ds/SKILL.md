---
name: boom-chatwoot-ds
disable-model-invocation: true
description: >-
  Aplica o design system estilo Chatwoot (tokens n-*, tipografia Inter, cards
  discretos, estados de campo/botão) em telas React do Boom IA com Tailwind e
  shadcn. Use quando o usuário pedir visual Chatwoot, DS escopo `.ds-chatwoot`,
  ou componentes com prop `visual="cw"`.
---

# Boom IA × Chatwoot DS (React)

## Composição com TypeUI (`typeui-dashboard`)

Para **dashboards e métricas**, o skill **typeui-dashboard** traz hierarquia, grelha modular, estados vazio/loading/erro, WCAG 2.2 AA, grelha **8pt** e alvos **≥44px**. O painel em produção é o clássico em **`/dashboard`**; mapear semanticamente (primary/success/warning) para tokens **`cw-*`** quando usar `.ds-chatwoot`.

## Escopo no projeto

- **Shell visual**: envolva a página (ou seção) em `<div className="ds-chatwoot ...">`. Tokens `--cw-*` e utilitários tipográficos valem **só** dentro desse escopo.
- **Tokens**: ver [tokens.md](tokens.md). No código Tailwind use o prefixo `cw-*` (`bg-cw-elevated`, `text-cw-slate-12`, `border-cw-weak`, `text-cw-brand`).
- **Fonte**: `font-cw` (Inter + fallbacks) no wrapper do painel.

## Mapeamento Vue → React (Boom)

| Material original (Vue/SCSS) | Neste repo |
|------------------------------|------------|
| `.field-base` | Preferir `Input` shadcn; para raw, copiar padrão outline/hover do skill de referência em `tokens.md` |
| `.btn`, `.btn-primary` | `Button` shadcn com classes `cw` onde precisar de marca escura/azul dark |
| `.card` / `.banner` | `Card` / `Alert` shadcn dentro de `.ds-chatwoot`, ou utilitários `border-cw-weak bg-cw-elevated` |
| `text-heading-1` etc. | Classes documentadas em `tokens.md` (`.text-cw-h1` …) |

## Regras

1. **Não** alterar variáveis HSL globais (`--primary`, `--card`, …) para imitar Chatwoot; isso quebra o restante do app. Sempre escopo `.ds-chatwoot`. **Harmonia light (produto Chatwoot):** `--cw-surface` ≈ `#f8f9fa`, cartões brancos, acento azul `--cw-brand` ≈ `#2563eb`, bordas leves, cards `rounded-2xl` — não usar o cinza “brand” `#1f2937` dos docs extraídos como cor primária no painel.
2. **Gráficos (Recharts)**: cores podem seguir `hsl(var(--primary))` no primeiro passo; evolução — trocar strokes/fills para `var(--cw-brand)` onde fizer sentido.
3. **Dark mode**: já coberto por `.dark .ds-chatwoot { ... }` em `src/index.css` — testar com toggle de tema existente.
4. **Acessibilidade**: manter contraste; labels associados a inputs; foco visível (ring ou outline `cw-brand`).

## Quando estender

- Novos blocos no painel: reutilizar padrão `.box` sob `.ds-chatwoot`, ou `Card` do shadcn com utilitários `cw`.
- Gráficos e cards partilhados: aceitar prop opcional `visual?: "default" | "cw"` e usar `src/lib/dashboard-visual.ts` (tooltip, eixos, paleta `CW_DONUT_COLORS`).
- Documentação longa dos docs externos do usuário: manter cópia de referência em `tokens.md`; não duplicar guias inteiros no SKILL.md.
- **Referência visual “antes/depois” (dark, 7 padrões):** `docs/design/DS_IMPROVEMENTS.html` — stat cards, nav, tags com outline, botões, banners, lista de agentes, diálogo; abrir no browser.

## Checklist rápido

- [ ] Raiz da view com `ds-chatwoot` + `font-cw`
- [ ] Cores via `cw-*`, não misturar `primary` teal com marca Chatwoot no mesmo componente sem intenção
- [ ] Responsivo: grids `grid-cols-1 md:…` como no painel clássico
- [ ] Tema claro/escuro verificado
