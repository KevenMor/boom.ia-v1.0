import { Timer, UserPlus, Eye, LineChart, ArrowDownCircle, Users, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  { icon: Timer, color: "bg-primary/10 text-primary", label: "Latência Média", trend: "+5.2%", trendType: "positive" as const, value: "2.4s" },
  { icon: UserPlus, color: "bg-primary-tint1/10 text-primary-tint1", label: "Novos Tenants", trend: "+10.3%", trendType: "positive" as const, value: "5" },
  { icon: Eye, color: "bg-primary-tint2/10 text-primary-tint2", label: "Conversas Ativas", trend: "-2.15%", trendType: "negative" as const, value: "45" },
  { icon: LineChart, color: "bg-primary-tint3/10 text-primary-tint3", label: "Taxa Conversão", trend: "+1.5%", trendType: "positive" as const, value: "4.8%" },
  { icon: ArrowDownCircle, color: "bg-secondary/10 text-secondary", label: "Taxa de Erro", trend: "-3.8%", trendType: "positive" as const, value: "0.06%" },
  { icon: Users, color: "bg-warning/10 text-warning", label: "Agentes Ativos", trend: "+7.2%", trendType: "positive" as const, value: "8" },
  { icon: DollarSign, color: "bg-info/10 text-info", label: "Custo Médio/Conversa", trend: "-2.7%", trendType: "negative" as const, value: "R$ 0,12" },
];

export function ActivityFeed() {
  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <span className="box-title">Atividade</span>
        <span className="text-xs text-primary font-medium cursor-pointer hover:underline">
          Hoje ▾
        </span>
      </div>
      <div className="box-body">
        <ul className="space-y-4">
          {activities.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", item.color)}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {item.trendType === "positive" ? "Melhorou" : "Variou"}{" "}
                    <span className={cn("font-medium ml-0.5", item.trendType === "positive" ? "text-success" : "text-destructive")}>
                      {item.trend} {item.trendType === "positive" ? "↑" : "↓"}
                    </span>
                  </span>
                </div>
                <span className="text-[15px] font-semibold shrink-0">{item.value}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
