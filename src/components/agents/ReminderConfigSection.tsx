import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock } from "lucide-react";

interface Props {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  minutesBefore: number;
  setMinutesBefore: (v: number) => void;
  template: string;
  setTemplate: (v: string) => void;
}

export function ReminderConfigSection({
  enabled, setEnabled,
  minutesBefore, setMinutesBefore,
  template, setTemplate,
}: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Lembrete de Agendamento</h4>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Enviar lembrete quantos minutos antes?</Label>
            <Input
              type="number"
              min={5}
              max={1440}
              value={minutesBefore}
              onChange={(e) => setMinutesBefore(Math.max(5, Number(e.target.value)))}
              className="h-10 w-32 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Ex: 60 = 1 hora antes, 120 = 2 horas antes
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Template da mensagem</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Olá! 😊 Passando para lembrar do seu agendamento de {titulo} hoje às {horario}. Te esperamos! 🙌"
              rows={3}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code className="bg-muted px-1 rounded">{"{titulo}"}</code>, <code className="bg-muted px-1 rounded">{"{horario}"}</code>, <code className="bg-muted px-1 rounded">{"{data}"}</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
