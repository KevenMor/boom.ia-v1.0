# components

## Contexto rápido
Primitivos shadcn (`ui/`), shell (`layout/`) e domínio. Spec: `docs/DESIGN-SYSTEM.md`. Inventário de pastas: `CLAUDE.md`.

## Stack e ferramentas
- React 18, TypeScript
- shadcn/ui (Radix + Tailwind)
- Lucide React (ícones)
- Tailwind CSS

## Como modificar

### Adicionar uma feature (novo componente)
1. Identificar domínio: `src/components/{domínio}/NovoComponente.tsx`
2. Para primitivo UI: `npx shadcn-ui@latest add {component}`
3. Tipar props com interface
4. Consumir dados via hooks (não fetch direto)
5. Usar primitivos de `ui/` e o DS certo (TypeUI vs Chatwoot vs default)
6. Dashboard/kanban: classes `.tu-*` só dentro de `.ds-typeui`

### Corrigir um bug
1. Identificar componente pelo DOM (React DevTools)
2. Verificar props recebidas
3. Verificar hook que fornece dados
4. Para bugs visuais: verificar classes Tailwind e dark mode

### Refatorar
1. Não mover componentes entre domínios sem verificar imports
2. Não alterar `ui/` manualmente — usar CLI shadcn para updates
3. Extrair componentes inline quando > 50 linhas

## Comandos úteis
```bash
# adicionar componente shadcn
npx shadcn-ui@latest add button

# rodar frontend
npm run dev

# verificar tipos
npx tsc --noEmit
```

## Regras invioláveis
- Nunca colocar lógica de negócio em componentes UI
- Nunca importar hooks de dados em `ui/` (manter primitivos puros)
- Nunca fazer fetch direto — usar hooks
- Sempre suportar dark mode (`dark:`)
- Não usar `ui/sidebar.tsx` (shell é `AppSidebar`)
- Não inventar classes `bg-cw-*` (tokens Chatwoot ainda não estão no Tailwind)
- Sempre tipar props (nunca `any`)

## Mapa de dependências
```
components/
├── consome → ../hooks/* (dados via props ou hooks diretos)
├── consome → ../contexts/* (auth, tenant, sidebar)
├── consome → ../lib/utils.ts (cn())
├── consome → ui/ (primitivos shadcn)
├── expõe para → ../pages/* (composição)
└── depende de env → nenhuma
```
