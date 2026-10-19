# Design System — Boom IA

Fonte de verdade para produzir UI. Skills Cursor: `.cursor/skills/boom-chatwoot-ds/` e `.cursor/skills/typeui-dashboard/`. Tokens em `src/index.css` + `tailwind.config.ts`.

Antes de estilizar: escolher **uma** das três camadas abaixo. Não misturar no mesmo componente.

---

## Três camadas

| Camada | Wrapper | Quando usar | Fonte |
|--------|---------|-------------|-------|
| **shadcn default** | nenhum (herda `AppLayout`) | Quase todo o painel: agentes, tenants, CRM, financeiro, inventário, agenda, settings, analytics, loteamentos (painel) | `bg-background`, `text-primary`, `Card`, `Button` |
| **TypeUI** | `ds-typeui font-plex` | `/dashboard`, `/kanban`, widgets em `src/components/dashboard/v2/` | tokens `--tu-*`, classes `.tu-panel` `.tu-kpi` `.tu-label` `.tu-value` `.tu-hint` |
| **Chatwoot DS** | `ds-chatwoot font-cw` | Embeds Chatwoot + perfil de contato | wrappers nas páginas embed; ver gap de tokens abaixo |

`/dashboard/v2` redireciona para `/dashboard`. O painel oficial de métricas é TypeUI, não Chatwoot.

---

## Decisão rápida

```
É embed Chatwoot ou perfil de contato?
  → ds-chatwoot font-cw  (usar shadcn por baixo; tokens cw-* ainda não estão no Tailwind)
É /dashboard ou /kanban (métricas / board imersivo)?
  → ds-typeui font-plex
Senão (página admin no AppLayout):
  → shadcn default (space-y-6, Card, tokens semânticos)
```

---

## Tokens globais (shadcn)

Valores HSL **sem** `hsl()` — consumo: `hsl(var(--primary))` ou classes Tailwind `bg-primary`.

### Light (`:root`)

| Token | HSL | Uso |
|-------|-----|-----|
| `--background` | `210 40% 98%` | Fundo da app |
| `--foreground` | `215 28% 17%` | Texto |
| `--card` | `0 0% 100%` | Cards |
| `--primary` | `217 91% 60%` | Ação primária (azul) |
| `--muted` / `--muted-foreground` | `210 15% 96%` / `215 16% 47%` | Secundário |
| `--destructive` | `0 84% 60%` | Erro |
| `--success` | `160 84% 39%` | Sucesso |
| `--warning` | `38 92% 50%` | Aviso |
| `--info` | `217 91% 60%` | Info (= primary) |
| `--border` / `--input` / `--ring` | `214 32% 91%` / mesmo / `217 91% 60%` | Bordas e foco |
| `--radius` | `8px` | Raio base |
| `--sidebar-*` | ver `src/index.css` | Sidebar |

### Dark (`.dark`)

Fundo `225 15% 6%`, cards `225 14% 9%`, primary `217 91% 65%`. Tema persistido em `localStorage` key `boomia-theme`. Default do `ThemeProvider`: **dark**.

### Tailwind — tipografia

| Token | px | Uso |
|-------|-----|-----|
| `text-xs` | 11 | labels densos |
| `text-sm` | 13 | UI padrão, header |
| `text-base` | 14 | corpo (também o `body`) |
| `text-md` | 16 | títulos de card |
| `text-lg` | 20 | títulos de página |
| `text-xl` | 28 | display raro |
| `text-2xl` | 36 | display raro |

Fontes (`index.html` + `tailwind.config.ts`):

| Família | Classe | Uso |
|---------|--------|-----|
| Inter | `font-sans` (default) | App + embeds |
| IBM Plex Sans | `font-plex` | TypeUI |
| JetBrains Mono | `font-mono` | código |

Ícones: **Lucide** (`strokeWidth={1.5}` no chrome). Não usar Material Symbols em telas novas (`Ms` é legado).

---

## TypeUI (`.ds-typeui`)

Remapeia tokens shadcn **dentro do wrapper**. Grid 8pt. WCAG 2.2 AA. Alvos ≥44px.

### Tokens `--tu-*`

| Token | Light | Dark |
|-------|-------|------|
| `--tu-primary` | `207 87% 36%` | `207 80% 52%` |
| `--tu-surface` | `210 25% 97%` | `240 6% 4%` |
| `--tu-elevated` | `0 0% 100%` | `240 5% 7%` |
| `--tu-text` | `222 47% 11%` | `0 0% 98%` |
| `--tu-muted` | `215 16% 42%` | `220 9% 58%` |
| `--tu-border` | `214 24% 88%` | `240 4% 16%` |
| `--tu-success` / `--tu-warning` / `--tu-danger` | verde / âmbar / vermelho | variantes dark |

### Classes

| Classe | Uso |
|--------|-----|
| `.tu-panel` | painel glass, radius 12px |
| `.tu-kpi` | card KPI com hover na borda primary |
| `.tu-label` | 13px/500 muted |
| `.tu-value` | número tabular |
| `.tu-hint` / `.tu-hint-up` / `.tu-hint-down` | dica / delta |

### Skeleton de página TypeUI

```tsx
<div className="ds-typeui font-plex -m-6 min-h-[calc(100dvh-4rem)] space-y-7 p-6 md:-m-8 md:space-y-8 md:p-8">
  <SectionHeader eyebrow="Operação" title="Painel" />
  <div className="grid gap-3 sm:grid-cols-3">
    <div className="tu-kpi px-4 py-3.5">
      <p className="tu-label">Conversas</p>
      <p className="tu-value text-lg">128</p>
    </div>
  </div>
  <div className="tu-panel px-4 py-3">…</div>
</div>
```

Componentes v2: `src/components/dashboard/v2/SectionHeader.tsx`, `QuickActionsRow.tsx`, `OpsKpiStrip.tsx`.

---

## Chatwoot DS (`.ds-chatwoot`)

### Onde está aplicado

- `ChatwootEmbedClient`, `ChatwootEmbedClients`, `ChatwootEmbedInventory`, `ChatwootEmbedHospedagem`, `ChatwootEmbedLoteamentos`
- `ContactProfilePage`, `ContactProfileEmbed`
- HTML server: `server/src/services/chatwoot-*-embed-view-html.ts`
- Tema Mega: `src/lib/embed-theme.ts` injeta `--cw-surface` / `--cw-brand` via JS

### Gap conhecido (ler antes de usar `cw-*`)

A skill documenta tokens `--cw-*` e classes Tailwind `bg-cw-elevated`, `text-cw-brand`, `font-cw`. **Hoje:**

- `src/index.css` **não** define o bloco `.ds-chatwoot { --cw-* }`
- `tailwind.config.ts` **não** tem `colors.cw` nem `fontFamily.cw`
- Páginas usam o wrapper + fallbacks (`bg-slate-50`, `bg-[hsl(var(--cw-surface,0_0%_98%))]`)

**Regra para agentes:** no embed, manter o wrapper `ds-chatwoot font-cw`. Estilizar com tokens shadcn (`bg-background`, `border-border`) ou CSS vars com fallback. **Não** inventar `bg-cw-elevated` / `text-cw-brand` como se fossem classes Tailwind estáveis até os tokens serem portados para `index.css` + `tailwind.config.ts`.

Mock visual (referência, não código): `docs/design/DS_IMPROVEMENTS.html`.

---

## Layout shell

```
AppLayout (100dvh)
├── AppSidebar (240px / 64px colapsada) — tokens sidebar-*
│   ├── BoomIaLogo + TenantSwitcher
│   ├── Nav (ACL por moduleKey)
│   └── Footer usuário
└── coluna
    ├── AppHeader (h-12, blur) — título, ThemeToggle, notificações
    └── <main>
        • default: p-6 md:p-8 overflow-y-auto
        • imersivo (/conversations, /kanban, sandbox): sem padding
```

Grupos da sidebar: Operação, Comercial, Reservas, Loteamentos, Admin, Sistema.

`ui/sidebar.tsx` (shadcn) **não** é o shell — o app usa `AppSidebar` + `SidebarContext`.

---

## Primitivos shadcn (`src/components/ui/`)

Estilo **default**, `baseColor: slate`, variáveis CSS. Adicionar via `npx shadcn-ui@latest add {nome}`.

**Custom (não gerar via CLI):** `date-input-br.tsx`, `material-symbol.tsx`, `theme-toggle.tsx`.

**Button:** `default` | `destructive` | `outline` | `secondary` | `ghost` | `link` — sizes `default` (h-9) `sm` `lg` `icon`.

**Badge extra:** `success`, `warning` além do padrão.

**Card / .box:** radius `rounded-xl` (12px), sombra `0 1px 3px rgba(0,0,0,0.08)`.

Dois sistemas de toast: Radix (`toaster` + `use-toast`) e Sonner (`sonner.tsx`, sincronizado com next-themes). Preferir o já usado na tela.

---

## Espaçamento e radius

| Token | Valor |
|-------|-------|
| `--radius` | 8px |
| `rounded-sm` / `md` / `lg` (tw extend) | 6 / 8 / 12px |
| `.tu-panel` / cards | 12px |
| Main padding | `p-6 md:p-8` |
| Container embeds/loteamentos | `max-w-[1280px] px-4 sm:px-6 lg:px-8` |
| Sidebar | 240 / 64px |
| Header | 48px |

Números de métrica: `tabular-nums` ou `.metric-value`.

---

## Dark mode

- `next-themes` + `attribute="class"` + `darkMode: ["class"]`
- Toggle: `src/components/ui/theme-toggle.tsx`
- Embeds: `applyEmbedTheme()` / postMessage `boom-ia-embed:theme`
- Sempre testar light **e** dark

---

## Domínios de componentes (`src/components/`)

| Pasta | DS típico |
|-------|-----------|
| `layout/` | shadcn + sidebar tokens |
| `dashboard/` + `dashboard/v2/` | TypeUI no painel; widgets `.box` legado |
| `kanban/` | TypeUI wrapper + shadcn board |
| `embed/` `contacts/` (perfil) | Chatwoot wrapper |
| `loteamentos/` `hospedagem/` | painel shadcn; embed com header próprio + wrapper Chatwoot |
| `agents/` `tenants/` `tools/` `providers/` `inventory/` `occurrences/` `suite-galleries/` `sandbox/` `calendar/` `chat/` `brand/` | shadcn default |
| `ui/` | primitivos puros — sem fetch, sem hooks de dados |

---

## Como adicionar uma página

### Admin padrão

1. `src/pages/MinhaPage.tsx` com `space-y-6` + hooks (nunca fetch direto)
2. Rota em `src/App.tsx` com `ProtectedRoute` + `ModuleRoute module="chave"`
3. Item em `AppSidebar` com `moduleKey`
4. Título em `AppHeader` (`routeTitles`) se necessário
5. Módulo em `src/lib/tenant-modules.ts` se for recurso novo

### Dashboard / métricas

Wrapper TypeUI + `SectionHeader` + `.tu-kpi` / `.tu-panel`. Skill `typeui-dashboard`.

### Embed Chatwoot

Rota pública em `App.tsx` (fora do `AppLayout`). Wrapper `ds-chatwoot font-cw`. Auth via `embed-*-auth.ts` no server. Script HTML em `scripts/tenants/`.

---

## Do / Don't

### Do

- `cn()` de `src/lib/utils.ts`
- Tokens semânticos, nunca hex solto em tela nova
- Estados vazio / loading / erro em listas e dashboards
- Dark mode em toda tela nova
- Props tipadas; lógica de dados nos hooks

### Don't

- Alterar `--primary` global para “ficar Chatwoot”
- Misturar TypeUI e Chatwoot no mesmo wrapper
- Editar `ui/` na mão se o CLI shadcn cobre
- Fetch em `pages/` ou `ui/`
- Usar `font-jakarta`, `glass-card`, `primary-tint*`, `gradient-text` (legado não wired)
- Assumir que `bg-cw-*` existe no Tailwind
- Hardcodar `tenantId`

---

## Legado (não copiar)

| Símbolo | Status |
|---------|--------|
| `PremiumKpiStrip`, `font-jakarta`, `glass-card` | Stitch; não portado |
| `primary-tint1/2/3` | usado em charts antigos; **não definido** |
| `visual="cw"` em dashboard | legado; painel atual é TypeUI |
| `ui/sidebar.tsx` | instalado, não é o shell |
| `TenantPaymentsPage.tsx` | página **sem rota** em `App.tsx` |
| Material Symbols (`Ms`) | fonte não carregada no `index.html` |
