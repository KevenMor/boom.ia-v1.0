import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCheck, Plus, Trash2 } from "lucide-react";

export interface AssignRule {
  label: string;
  assignee_id: number | null;
  team_id: number | null;
}

interface Props {
  initialRules?: AssignRule[];
  defaultAssigneeId?: number | null;
  defaultTeamId?: number | null;
  onChange: (rules: AssignRule[], defaultAssigneeId: number | null, defaultTeamId: number | null) => void;
  compact?: boolean;
}

export function ChatwootAssignRules({ initialRules = [], defaultAssigneeId = null, defaultTeamId = null, onChange, compact = false }: Props) {
  const [rules, setRules] = useState<AssignRule[]>(initialRules);
  const [defAssignee, setDefAssignee] = useState<number | null>(defaultAssigneeId);
  const [defTeam, setDefTeam] = useState<number | null>(defaultTeamId);

  const emit = (newRules: AssignRule[], da: number | null, dt: number | null) => {
    onChange(newRules, da, dt);
  };

  const addRule = () => {
    const updated = [...rules, { label: "", assignee_id: null, team_id: null }];
    setRules(updated);
    emit(updated, defAssignee, defTeam);
  };

  const removeRule = (idx: number) => {
    const updated = rules.filter((_, i) => i !== idx);
    setRules(updated);
    emit(updated, defAssignee, defTeam);
  };

  const updateRule = (idx: number, field: keyof AssignRule, value: string) => {
    const updated = [...rules];
    if (field === "label") {
      updated[idx] = { ...updated[idx], label: value };
    } else {
      updated[idx] = { ...updated[idx], [field]: value ? Number(value) : null };
    }
    setRules(updated);
    emit(updated, defAssignee, defTeam);
  };

  const h = compact ? "h-9" : "h-11 rounded-lg";
  const labelCls = compact
    ? "text-xs font-medium uppercase tracking-wider text-muted-foreground"
    : "text-sm font-medium text-muted-foreground";
  const hintCls = compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground";

  return (
    <div className={`rounded-${compact ? "lg" : "xl"} border ${compact ? "border-border bg-muted/20 p-4" : "border-primary/20 bg-primary/5 p-5"} space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserCheck className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-primary`} />
          Configuração de Atribuição
        </div>
      </div>

      {/* Default / Fallback */}
      <div className="space-y-2">
        <p className={`${hintCls} font-medium`}>Padrão (fallback — usado quando nenhuma regra específica corresponde)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className={labelCls}>Assignee ID padrão</Label>
            <Input
              type="number"
              placeholder="15"
              value={defAssignee ?? ""}
              className={`${h} bg-background font-mono text-sm border-border`}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setDefAssignee(v);
                emit(rules, v, defTeam);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Team ID padrão</Label>
            <Input
              type="number"
              placeholder="3"
              value={defTeam ?? ""}
              className={`${h} bg-background font-mono text-sm border-border`}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setDefTeam(v);
                emit(rules, defAssignee, v);
              }}
            />
          </div>
        </div>
      </div>

      {/* Rules list */}
      {rules.length > 0 && (
        <div className="space-y-3">
          <p className={`${hintCls} font-medium`}>Regras por unidade / situação</p>
          {rules.map((rule, idx) => (
            <div key={idx} className="rounded-lg border border-border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ex: Unidade Centro, Agendamento Zona Sul..."
                  value={rule.label}
                  className={`${h} flex-1 text-sm`}
                  onChange={(e) => updateRule(idx, "label", e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeRule(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={`${labelCls} text-[10px]`}>Assignee ID</Label>
                  <Input
                    type="number"
                    placeholder="15"
                    value={rule.assignee_id ?? ""}
                    className={`${h} bg-background font-mono text-sm`}
                    onChange={(e) => updateRule(idx, "assignee_id", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={`${labelCls} text-[10px]`}>Team ID</Label>
                  <Input
                    type="number"
                    placeholder="3"
                    value={rule.team_id ?? ""}
                    className={`${h} bg-background font-mono text-sm`}
                    onChange={(e) => updateRule(idx, "team_id", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRule}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar Regra
      </Button>

      <p className={`${hintCls} italic`}>
        💡 O dispatcher envia o campo "reason" ao acionar a tool. O handler busca a regra cuja descrição melhor combina e usa o assignee/team correspondente. Se nenhuma combinar, usa o padrão.
      </p>
    </div>
  );
}
