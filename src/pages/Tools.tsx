import { Wrench, Plus, Globe, Database, MapPin, Webhook, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const mockTools = [
  { id: "1", name: "HTTP Request", slug: "http_request", category: "http", icon: Globe, tenants: 12, calls24h: 890, global: true },
  { id: "2", name: "Consulta SQL", slug: "db_query", category: "db_query", icon: Database, tenants: 8, calls24h: 342, global: true },
  { id: "3", name: "Consulta CEP", slug: "cep_lookup", category: "cep", icon: MapPin, tenants: 5, calls24h: 61, global: true },
  { id: "4", name: "Webhook Interno", slug: "internal_webhook", category: "webhook", icon: Webhook, tenants: 3, calls24h: 128, global: true },
];

export default function Tools() {
  const [search, setSearch] = useState("");

  const filtered = mockTools.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Catálogo de Tools</h2>
          <p className="text-sm text-muted-foreground">Ferramentas disponíveis para os agentes</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Tool
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar tool..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 bg-background pl-9" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((tool, i) => (
          <Card
            key={tool.id}
            className="border-border bg-card p-5 cursor-pointer hover:border-primary/30 transition-colors animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <tool.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{tool.name}</h3>
                <code className="font-mono text-xs text-muted-foreground">{tool.slug}</code>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{tool.category}</Badge>
              {tool.global && (
                <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[10px]">
                  Global
                </Badge>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{tool.tenants} tenants</span>
              <span className="font-mono">{tool.calls24h} calls/24h</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
