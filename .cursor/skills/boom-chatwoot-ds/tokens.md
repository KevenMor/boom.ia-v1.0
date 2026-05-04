# Tokens `cw-*` (escopo `.ds-chatwoot`)

Definidos em `src/index.css`. No Tailwind: `bg-cw-surface`, `text-cw-slate12`, etc.

## Cores (light, dentro de `.ds-chatwoot`)

| Token CSS | Uso |
|-----------|-----|
| `--cw-brand` | Marca / ações primárias (light: azul Chatwoot ~`#2563eb`; dark: `#60a5fa`) |
| `--cw-ruby-8` | Erro / alerta forte (#dc2626) |
| `--cw-ruby-9` | Hover erro (#991b1b) |
| `--cw-slate-10` | Placeholder, texto secundário |
| `--cw-slate-11` | Corpo secundário |
| `--cw-slate-12` | Títulos e texto principal |
| `--cw-weak` | Bordas leves |
| `--cw-solid-2` | Fundo muted |
| `--cw-surface` | Fundo da página |
| `--cw-elevated` | Cards elevados |
| `--cw-alpha` | Highlight suave (rgba) |

## Dark (`.dark .ds-chatwoot`)

`--cw-brand` passa para azul (#60a5fa); superfícies escurecem; `--cw-slate-12` vira texto claro.

## Tipografia (classes utilitárias)

| Classe | Equivalente Chatwoot |
|--------|----------------------|
| `.text-cw-h1` | heading-1 (~28px, medium) |
| `.text-cw-h2` | heading-2 (~20px, medium) |
| `.text-cw-body` | body 14px |
| `.text-cw-label` | label 14px medium |

## Cards dashboard (`.ds-chatwoot .box`)

Sobrescreve `.box` / `.box-header` / `.box-title` para borda `cw-weak` e fundo `cw-elevated`, alinhado ao card Chatwoot.

## Código de apoio

- `src/lib/dashboard-visual.ts` — tipo `DashboardVisual`, paleta `CW_DONUT_COLORS`, helpers de tooltip/eixo e ícones de card.
- Componentes em `src/components/dashboard/*` aceitam `visual="cw"` (painel v2); omitir ou `default` mantém o look clássico.
- `docs/design/DS_IMPROVEMENTS.html` — mock “antes/depois” (dark): stat cards, sidebar, tags, botões, banners, lista agentes, diálogo; referência para evoluir o painel.
