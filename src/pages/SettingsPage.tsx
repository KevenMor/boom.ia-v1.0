import { Settings, Shield, Clock, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Configurações da Plataforma</h2>
        <p className="text-sm text-muted-foreground">Parâmetros globais do Nexus AI</p>
      </div>

      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Geral
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome da plataforma</Label>
          <Input defaultValue="Nexus AI" className="h-9 bg-background max-w-sm" />
        </div>
      </Card>

      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Quotas padrão para novos tenants
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max agentes</Label>
            <Input type="number" defaultValue="5" className="h-9 bg-background" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max msgs/mês</Label>
            <Input type="number" defaultValue="50000" className="h-9 bg-background" />
          </div>
        </div>
      </Card>

      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          LGPD — Retenção de dados
        </div>
        <div className="space-y-2 max-w-sm">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Retenção de mensagens (meses)</Label>
          <Input type="number" defaultValue="12" className="h-9 bg-background" />
        </div>
      </Card>

      <Button>Salvar configurações</Button>
    </div>
  );
}
