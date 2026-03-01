import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Clock, Bell, BellOff, MessageSquare } from "lucide-react";

interface Props {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  intervals: number[];
  setIntervals: (v: number[]) => void;
  quietStart: string;
  setQuietStart: (v: string) => void;
  quietEnd: string;
  setQuietEnd: (v: string) => void;
  followupPrompt: string;
  setFollowupPrompt: (v: string) => void;
}

export function FollowUpConfigSection({
  enabled, setEnabled,
  intervals, setIntervals,
  quietStart, setQuietStart,
  quietEnd, setQuietEnd,
  followupPrompt, setFollowupPrompt,
}: Props) {
  const addInterval = () => {
    const last = intervals[intervals.length - 1] || 10;
    setIntervals([...intervals, Math.round(last * 1.5)]);
  };

  const removeInterval = (idx: number) => {
    if (intervals.length <= 1) return;
    setIntervals(intervals.filter((_, i) => i !== idx));
  };

  const updateInterval = (idx: number, val: number) => {
    const next = [...intervals];
    next[idx] = Math.max(1, val);
    setIntervals(next);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Follow-up Automático</h4>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2">
          {/* Follow-up Prompt */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground">Prompt de Follow-up</Label>
            </div>
            <Textarea
              value={followupPrompt}
              onChange={(e) => setFollowupPrompt(e.target.value)}
              rows={4}
              placeholder="Deixe vazio para usar o prompt padrão. Use {attempt} e {max_attempts} como variáveis."
              className="rounded-lg bg-background border-border text-sm resize-none"
            />
            <p className="text-[10px] text-muted-foreground">
              Variáveis disponíveis: <code className="text-primary">{"{attempt}"}</code> (tentativa atual), <code className="text-primary">{"{max_attempts}"}</code> (total).
              O agente receberá todo o histórico da conversa para contextualizar.
            </p>
          </div>

          {/* Intervals */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Intervalos entre follow-ups (minutos)</Label>
            <div className="flex flex-wrap gap-2">
              {intervals.map((val, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <Badge variant="outline" className="flex items-center gap-1 px-2 py-1.5 font-mono text-xs">
                    <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={val}
                      onChange={(e) => updateInterval(idx, Number(e.target.value))}
                      className="h-6 w-14 border-0 bg-transparent p-0 text-center font-mono text-xs focus-visible:ring-0"
                    />
                    <span className="text-[10px] text-muted-foreground">min</span>
                    {intervals.length > 1 && (
                      <button type="button" onClick={() => removeInterval(idx)} className="ml-0.5 text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={addInterval}>
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Cada intervalo representa um follow-up. Total de follow-ups: {intervals.length}.
              Exemplo: [{intervals.join(", ")}] min → follow-ups em{" "}
              {intervals.map((_, i) => {
                const cumulative = intervals.slice(0, i + 1).reduce((a, b) => a + b, 0);
                return `${cumulative}min`;
              }).join(", ")}
              {" "}após a última resposta do agente
            </p>
          </div>

          {/* Quiet hours */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground">Horário de silêncio</Label>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="h-10 w-28 rounded-lg bg-background border-border font-mono text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="h-10 w-28 rounded-lg bg-background border-border font-mono text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {quietStart && quietEnd
                ? `Nenhum follow-up será enviado entre ${quietStart} e ${quietEnd}`
                : "Deixe vazio para enviar a qualquer hora"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}