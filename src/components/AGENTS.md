# components

## Contexto rápido
Componentes React do painel — primitivos UI (shadcn), layout da app e componentes de domínio por feature.

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
5. Usar primitivos de `ui/` para consistência visual

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
- Sempre suportar dark mode (usar classes Tailwind dark:)
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
