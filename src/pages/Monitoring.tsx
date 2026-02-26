import { Activity, AlertTriangle, Clock, Inbox } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const dlqItems = [
  { id: "dlq-1", tenant: "Imobiliária Lar", error: "Timeout: OpenAI API", attempts: 3, time: "12min atrás" },
  { id: "dlq-2", tenant: "Escola Saber", error: "Tool 'db_query' failed: connection refused", attempts: 3, time: "45min atrás" },
];

export default function Monitoring() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Queue Depth" value="4" change="Normal" changeType="neutral" icon={Inbox} />
        <StatCard title="P95 Latência" value="3.8s" change="-0.4s vs ontem" changeType="positive" icon={Clock} />
        <StatCard title="Taxa de Erro" value="0.06%" change="Abaixo do limiar" changeType="positive" icon={AlertTriangle} />
        <StatCard title="Workers Ativos" value="3/3" change="Saudável" changeType="positive" icon={Activity} />
      </div>

      <Card className="border-border bg-card p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Dead Letter Queue</h2>
          <Badge variant="secondary" className="text-xs">{dlqItems.length} itens</Badge>
        </div>
        {dlqItems.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum item na DLQ
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dlqItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">{item.tenant}</p>
                  <p className="text-xs text-destructive font-mono">{item.error}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{item.time}</p>
                  <p className="text-xs text-muted-foreground">{item.attempts} tentativas</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
