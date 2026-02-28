import { Card } from "@/components/ui/card";

const activities = [
  { initials: "SA", name: "Sistema", action: "provisionou tenant Acme Corp", time: "3m", color: "bg-emerald-500" },
  { initials: "AD", name: "Admin", action: "atualizou agente de vendas", time: "12m", color: "bg-blue-500" },
  { initials: "SY", name: "Sync", action: "importou 48 itens de inventário", time: "28m", color: "bg-violet-500" },
  { initials: "WH", name: "Webhook", action: "processou callback Chatwoot", time: "45m", color: "bg-amber-500" },
  { initials: "AG", name: "Agente", action: "finalizou 12 conversas", time: "1h", color: "bg-pink-500" },
];

export function ActivityFeed() {
  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Atividade em equipe</h2>
          <p className="text-xs text-muted-foreground">Novidades da sua equipe</p>
        </div>
        <span className="text-xs text-primary font-medium cursor-pointer hover:underline">
          Ver tudo ↗
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {activities.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${item.color}`}
            >
              {item.initials}
            </div>
            <p className="flex-1 text-sm">
              <span className="font-medium">{item.name}</span>{" "}
              <span className="text-muted-foreground">{item.action}</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
