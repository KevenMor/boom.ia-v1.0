import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Audit() {
  const { data: logs, isLoading, error } = useAuditLogs();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Auditoria</h2>
          <p className="text-sm text-muted-foreground">Registro de ações administrativas</p>
        </div>
        <Button variant="secondary" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar logs: {error.message}</p>
      )}

      <Card className="border-border bg-card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 text-left">Ação</th>
              <th className="px-5 py-3 text-left">Entidade</th>
              <th className="px-5 py-3 text-right">Quando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-3" colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))}
            {!isLoading && (logs?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nenhum log de auditoria
                </td>
              </tr>
            )}
            {(logs ?? []).map((log, i) => (
              <tr
                key={log.id}
                className="hover:bg-muted/30 transition-colors animate-fade-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <td className="px-5 py-3">
                  <Badge variant="secondary" className="font-mono text-[10px]">{log.action}</Badge>
                </td>
                <td className="px-5 py-3 text-sm text-muted-foreground">
                  {log.entity_type ? `${log.entity_type}` : "—"}
                  {log.entity_id ? ` (${log.entity_id.slice(0, 8)}...)` : ""}
                </td>
                <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
