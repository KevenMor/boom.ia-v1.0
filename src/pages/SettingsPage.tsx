import { useState, useEffect } from "react";
import { Settings, Shield, Clock, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STORAGE_KEY = "nexus_platform_settings";

interface PlatformSettings {
  platform_name: string;
  max_agents: number;
  max_msgs_month: number;
  retention_months: number;
}

const defaults: PlatformSettings = {
  platform_name: "Boom IA",
  max_agents: 5,
  max_msgs_month: 50000,
  retention_months: 12,
};

function loadSettings(): PlatformSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(loadSettings);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    toast.success("Configurações salvas com sucesso!");
  };

  const update = (key: keyof PlatformSettings, value: string | number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Configurações da Plataforma</h2>
        <p className="text-sm text-muted-foreground">Parâmetros globais do Boom IA</p>
      </div>

      <Card className="border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Geral
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome da plataforma</Label>
          <Input
            value={settings.platform_name}
            onChange={(e) => update("platform_name", e.target.value)}
            className="h-9 bg-background max-w-sm"
          />
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
            <Input
              type="number"
              value={settings.max_agents}
              onChange={(e) => update("max_agents", Number(e.target.value))}
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max msgs/mês</Label>
            <Input
              type="number"
              value={settings.max_msgs_month}
              onChange={(e) => update("max_msgs_month", Number(e.target.value))}
              className="h-9 bg-background"
            />
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
          <Input
            type="number"
            value={settings.retention_months}
            onChange={(e) => update("retention_months", Number(e.target.value))}
            className="h-9 bg-background"
          />
        </div>
      </Card>

      <Button onClick={handleSave}>Salvar configurações</Button>
    </div>
  );
}
