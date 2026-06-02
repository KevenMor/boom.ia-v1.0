import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { callAPI } from "@/lib/api-client";
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
    if (tool?.tool_type === "rag_search") return JSON.stringify({ pergunta: "como funciona o tratamento para bruxismo?" }, null, 2);
    if (tool?.tool_type === "suite_gallery_query")
      return JSON.stringify({ nome: "LOFT", contexto: "piscinas (quando o fio for sobre área molhada)" }, null, 2);
    if (tool?.tool_type === "artaxnet_availability" || tool?.tool_type === "omnibees_availability")
      return JSON.stringify(
        { check_in: "2026-06-10", check_out: "2026-06-15", adults: 2, children: 0 },
        null,
        2
      );
    return "{}";
  }
  const example: Record<string, any> = {};
  for (const [key, schema] of Object.entries(params.properties) as [string, any][]) {
    const k = key.toLowerCase();
    if (schema.type === "string") {
      if (key === "pergunta" || key === "query") example[key] = "como funciona o tratamento para bruxismo?";
      else if (k === "check_in" || k === "checkin") example[key] = "2026-06-10";
      else if (k === "check_out" || k === "checkout") example[key] = "2026-06-15";
      else if (k === "coupon") example[key] = "";
      else example[key] = schema.example || `exemplo_${key}`;
    } else if (schema.type === "number" || schema.type === "integer") {
      if (k === "adults") example[key] = 2;
      else if (k === "children" || k === "kids") example[key] = 0;
      else example[key] = schema.example ?? 1;
    } else if (schema.type === "boolean") example[key] = true;
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

      const data = await callAPI<{ result?: { error?: string; detail?: string } | unknown; error?: string; detail?: string }>("/tools/test", {
        body: { tool_id: tool.id, tool_name: tool.name, args: parsedArgs },
        headers: nexusToken ? { "x-nexus-auth": nexusToken } : {},
      });

      const err = data.error || (data.result as any)?.error;
      const errDetail = data.detail || (data.result as any)?.detail;
      if (err) {
        setError([err, errDetail].filter(Boolean).join(" — ") || "Erro desconhecido");
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
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden sm:w-full">
        <DialogHeader className="min-w-0 shrink-0 pr-8 text-left">
          <DialogTitle className="space-y-1.5 text-left text-lg font-semibold leading-snug tracking-normal">
            <span className="flex items-center gap-2">
              <Play className="h-4 w-4 shrink-0" aria-hidden />
              Testar Tool
            </span>
            {tool?.name ? (
              <span className="block break-all font-mono text-sm font-normal leading-relaxed text-primary">
                {tool.name}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
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
              className="mt-1 min-h-[7rem] font-mono text-xs leading-relaxed"
              rows={6}
              placeholder='{"check_in": "2026-06-10", "check_out": "2026-06-15", "adults": 2, "children": 0}'
            />
          </div>

          {result && (
            <div>
              <Label className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle2 className="h-3 w-3" /> Resultado
              </Label>
              <div className="mt-1 max-h-64 overflow-y-auto rounded-md border bg-muted p-3">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">{result}</pre>
              </div>
            </div>
          )}

          {error && (
            <div>
              <Label className="flex items-center gap-1 text-xs text-destructive">
                <XCircle className="h-3 w-3" /> Erro
              </Label>
              <ScrollArea className="mt-1 max-h-48 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">{error}</pre>
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
