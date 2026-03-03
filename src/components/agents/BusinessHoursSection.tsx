import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const DAYS = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];

export interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

export type BusinessHours = Record<DayKey, DaySchedule>;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { enabled: true, start: "08:00", end: "18:00" },
  tue: { enabled: true, start: "08:00", end: "18:00" },
  wed: { enabled: true, start: "08:00", end: "18:00" },
  thu: { enabled: true, start: "08:00", end: "18:00" },
  fri: { enabled: true, start: "08:00", end: "18:00" },
  sat: { enabled: true, start: "08:00", end: "12:00" },
  sun: { enabled: false, start: "08:00", end: "12:00" },
};

interface Props {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  hours: BusinessHours;
  setHours: (h: BusinessHours) => void;
  offlineMessage: string;
  setOfflineMessage: (v: string) => void;
}

export function BusinessHoursSection({
  enabled, setEnabled, hours, setHours, offlineMessage, setOfflineMessage,
}: Props) {
  const updateDay = (day: DayKey, patch: Partial<DaySchedule>) => {
    setHours({ ...hours, [day]: { ...hours[day], ...patch } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">🕐 Horário de Trabalho</h3>
          <p className="text-sm text-muted-foreground">
            Defina quando o agente IA pode responder automaticamente
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_100px_60px] gap-2 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Dia</span>
              <span>Início</span>
              <span>Fim</span>
              <span className="text-center">Ativo</span>
            </div>

            {DAYS.map((day) => (
              <div
                key={day.key}
                className={`grid grid-cols-[1fr_100px_100px_60px] gap-2 items-center px-4 py-2.5 border-t border-border transition-opacity ${
                  !hours[day.key].enabled ? "opacity-40" : ""
                }`}
              >
                <span className="text-sm font-medium text-foreground">{day.label}</span>
                <Input
                  type="time"
                  value={hours[day.key].start}
                  onChange={(e) => updateDay(day.key, { start: e.target.value })}
                  disabled={!hours[day.key].enabled}
                  className="h-9 rounded-md bg-background border-border text-sm"
                />
                <Input
                  type="time"
                  value={hours[day.key].end}
                  onChange={(e) => updateDay(day.key, { end: e.target.value })}
                  disabled={!hours[day.key].enabled}
                  className="h-9 rounded-md bg-background border-border text-sm"
                />
                <div className="flex justify-center">
                  <Switch
                    checked={hours[day.key].enabled}
                    onCheckedChange={(v) => updateDay(day.key, { enabled: v })}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">
              Mensagem fora do horário (opcional)
            </Label>
            <Input
              value={offlineMessage}
              onChange={(e) => setOfflineMessage(e.target.value)}
              placeholder="Ex: Nosso horário de atendimento é de seg a sex, 8h às 18h. Retornaremos em breve!"
              className="h-11 rounded-lg bg-background border-border text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Se preenchida, o agente enviará esta mensagem quando receber contato fora do horário. Se vazia, o agente simplesmente não responderá.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
