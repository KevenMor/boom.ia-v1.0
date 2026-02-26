import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tool } from "@/types/database";

interface Props {
  tool: Tool | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestToolDialog({ tool, open, onOpenChange }: Props) {
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    if (!tool) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        setError("JSON de argumentos inválido");
        setLoading(false);
        return;
      }

      const nexusUrl = "https://boomsolution-supabase.kgn6uc.easypanel.host";
      const nexusKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

      const resp = await fetch(`${nexusUrl}/functions/v1/test-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": nexusKey,
        },
        body: JSON.stringify({ tool_id: tool.id, args: parsedArgs }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || `HTTP ${resp.status}`);
      } else {
        setResult(JSON.stringify(data.result, null, 2));
      }
    } catch (e: any) {
      setError(e.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  const params = tool?.function_def?.parameters as any;
  const properties = params?.properties ? Object.keys(params.properties) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Testar Tool: <span className="font-mono text-primary">{tool?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {properties.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Parâmetros esperados</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {properties.map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px] font-mono">{p}</Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="test-args">Argumentos (JSON)</Label>
            <Textarea
              id="test-args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="font-mono text-xs mt-1"
              rows={4}
              placeholder='{"query": "exemplo"}'
            />
          </div>

          {result && (
            <div>
              <Label className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle2 className="h-3 w-3" /> Resultado
              </Label>
              <ScrollArea className="mt-1 max-h-48 rounded-md border bg-muted p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">{result}</pre>
              </ScrollArea>
            </div>
          )}

          {error && (
            <div>
              <Label className="flex items-center gap-1 text-xs text-destructive">
                <XCircle className="h-3 w-3" /> Erro
              </Label>
              <ScrollArea className="mt-1 max-h-48 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">{error}</pre>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={handleTest} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
