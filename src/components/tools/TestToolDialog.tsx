import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import type { Tool } from "@/types/database";

interface Props {
  tool: Tool | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generateExample(tool: Tool | null): string {
  const params = tool?.function_def?.parameters as any;
  if (!params?.properties) {
    if (tool?.tool_type === "web_scraper") return JSON.stringify({ url: "https://example.com" }, null, 2);
    return "{}";
  }
  const example: Record<string, any> = {};
  for (const [key, schema] of Object.entries(params.properties) as [string, any][]) {
    if (schema.type === "string") example[key] = schema.example || `exemplo_${key}`;
    else if (schema.type === "number" || schema.type === "integer") example[key] = schema.example || 1;
    else if (schema.type === "boolean") example[key] = true;
    else example[key] = null;
  }
  return JSON.stringify(example, null, 2);
}

export function TestToolDialog({ tool, open, onOpenChange }: Props) {
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-fill example when tool changes
  const handleOpenChange = (o: boolean) => {
    if (o && tool) {
      setArgs(generateExample(tool));
      setResult(null);
      setError(null);
    }
    onOpenChange(o);
  };

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

      // Get the Nexus auth token from the current session
      const { data: { session } } = await nexusDb.auth.getSession();
      const nexusToken = session?.access_token;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      };
      if (nexusToken) {
        headers["x-nexus-auth"] = nexusToken;
      }

      const resp = await fetch(`${supabaseUrl}/functions/v1/test-tool`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tool_id: tool.id, tool_name: tool.name, args: parsedArgs }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError([data.error, data.detail].filter(Boolean).join(" — ") || `HTTP ${resp.status}`);
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              <ScrollArea className="mt-1 max-h-[60vh] rounded-md border bg-muted p-3">
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
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Fechar</Button>
          <Button onClick={handleTest} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
