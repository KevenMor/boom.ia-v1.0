import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const mockLogs = [
  { user: "admin@nexus.ai", action: "agent.version.publish", resource: "Agendamento v5", tenant: "Clínica Saúde+", time: "2min atrás" },
  { user: "admin@nexus.ai", action: "tenant.create", resource: "Escola Saber", tenant: "—", time: "1h atrás" },
  { user: "joao@clinica.com", action: "agent.edit", resource: "Agendamento", tenant: "Clínica Saúde+", time: "3h atrás" },
  { user: "admin@nexus.ai", action: "secret.rotate", resource: "OPENAI_API_KEY", tenant: "Auto Peças JM", time: "1d atrás" },
  { user: "admin@nexus.ai", action: "tool.create", resource: "cep_lookup", tenant: "—", time: "2d atrás" },
];

export default function Audit() {
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

      <Card className="border-border bg-card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 text-left">Usuário</th>
              <th className="px-5 py-3 text-left">Ação</th>
              <th className="px-5 py-3 text-left">Recurso</th>
              <th className="px-5 py-3 text-left">Tenant</th>
              <th className="px-5 py-3 text-right">Quando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockLogs.map((log, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                <td className="px-5 py-3 text-sm font-mono text-muted-foreground">{log.user}</td>
                <td className="px-5 py-3">
                  <Badge variant="secondary" className="font-mono text-[10px]">{log.action}</Badge>
                </td>
                <td className="px-5 py-3 text-sm">{log.resource}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{log.tenant}</td>
                <td className="px-5 py-3 text-right text-xs text-muted-foreground">{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
