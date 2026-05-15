import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const OPTIONS = [
  {
    value: "active",
    title: "Ativo",
    description: "Produção — uso normal nas conversas do Chatwoot.",
  },
  {
    value: "test",
    title: "Teste",
    description: "Ambiente restrito — só responde quando a conversa está atribuída ao assignee de teste.",
  },
  {
    value: "inactive",
    title: "Inativo",
    description: "Cadastro desabilitado — não processa mensagens.",
  },
] as const;

export function AgentStatusField({
  value,
  onChange,
  idPrefix = "agent-status",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  idPrefix?: string;
  className?: string;
}) {
  const safe = OPTIONS.some((o) => o.value === value) ? value : "inactive";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-background text-left shadow-sm",
        className,
      )}
      role="group"
      aria-label="Situação do agente"
    >
      <RadioGroup value={safe} onValueChange={onChange} className="flex flex-col gap-0">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            htmlFor={`${idPrefix}-${opt.value}`}
            className={cn(
              "flex cursor-pointer gap-3 border-border px-3 py-2.5 transition-colors",
              "border-b last:border-b-0 hover:bg-muted/30",
              safe === opt.value && "bg-muted/50",
            )}
          >
            <RadioGroupItem value={opt.value} id={`${idPrefix}-${opt.value}`} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight text-foreground">{opt.title}</span>
              <span className="mt-1 block text-xs leading-snug text-muted-foreground">{opt.description}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
