import { Cpu, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const mockProviders = [
  { name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini"], status: "online", latencyMs: 1200, costIn: 2.5, costOut: 10, circuit: "closed" },
  { name: "Anthropic", models: ["claude-sonnet-4-20250514", "claude-3-haiku"], status: "online", latencyMs: 1400, costIn: 3, costOut: 15, circuit: "closed" },
  { name: "Google", models: ["gemini-2.0-flash", "gemini-pro"], status: "online", latencyMs: 900, costIn: 0.5, costOut: 1.5, circuit: "closed" },
  { name: "DeepSeek", models: ["deepseek-chat", "deepseek-coder"], status: "degraded", latencyMs: 3200, costIn: 0.14, costOut: 0.28, circuit: "half-open" },
];

const statusIcons = {
  online: <CheckCircle2 className="h-4 w-4 text-success" />,
  degraded: <AlertTriangle className="h-4 w-4 text-warning" />,
  offline: <XCircle className="h-4 w-4 text-destructive" />,
};

export default function Providers() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Model Providers</h2>
        <p className="text-sm text-muted-foreground">Status e configuração dos provedores de LLM</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {mockProviders.map((p, i) => (
          <Card
            key={p.name}
            className="border-border bg-card p-5 animate-fade-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {statusIcons[p.status as keyof typeof statusIcons]}
                    <span className="text-xs capitalize text-muted-foreground">{p.status}</span>
                  </div>
                </div>
              </div>
              <Badge
                className={
                  p.circuit === "closed"
                    ? "bg-success/10 text-success border-success/20 hover:bg-success/20 text-[10px]"
                    : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20 text-[10px]"
                }
              >
                CB: {p.circuit}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.models.map((m) => (
                <Badge key={m} variant="secondary" className="font-mono text-[10px]">{m}</Badge>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Latência</p>
                <p className="font-mono text-sm font-semibold">{p.latencyMs}ms</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">$/1K in</p>
                <p className="font-mono text-sm font-semibold">${p.costIn}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">$/1K out</p>
                <p className="font-mono text-sm font-semibold">${p.costOut}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
