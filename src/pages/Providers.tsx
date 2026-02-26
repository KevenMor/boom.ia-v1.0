import { Cpu, CheckCircle2, AlertTriangle, XCircle, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProviders } from "@/hooks/useProviders";
import { Skeleton } from "@/components/ui/skeleton";

const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle2 className="h-4 w-4 text-success" />,
  degraded: <AlertTriangle className="h-4 w-4 text-warning" />,
  offline: <XCircle className="h-4 w-4 text-destructive" />,
};

export default function Providers() {
  const { data: providers, isLoading, error } = useProviders();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Model Providers</h2>
          <p className="text-sm text-muted-foreground">Status e configuração dos provedores de LLM</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Provider
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar providers: {error.message}</p>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && (providers?.length ?? 0) === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum provider cadastrado</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(providers ?? []).map((p, i) => (
          <Card
            key={p.id}
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
                    {statusIcons[p.status] ?? statusIcons.active}
                    <span className="text-xs capitalize text-muted-foreground">{p.status}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.model_default && (
                <Badge variant="secondary" className="font-mono text-[10px]">{p.model_default}</Badge>
              )}
              {p.base_url && (
                <Badge variant="secondary" className="font-mono text-[10px] truncate max-w-[200px]">{p.base_url}</Badge>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
