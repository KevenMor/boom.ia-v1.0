import { ArrowRight, Sparkles } from "lucide-react";

export function BannerCard() {
  return (
    <div
      className="mesh-gradient overflow-hidden border-0 shadow-lg"
      style={{ borderRadius: 16 }}
    >
      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h4 className="mb-2 text-lg font-semibold text-white heading-serif">
              Boom IA — Painel de Controle
            </h4>
            <p className="mb-3 text-white/80 text-[12px] leading-relaxed max-w-sm">
              Acompanhe o consumo de tokens, custos, latência e performance dos agentes em tempo real.
            </p>
            <a
              href="/agents"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white underline underline-offset-2 hover:no-underline"
            >
              Ver Agentes <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="hidden sm:flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Sparkles className="h-10 w-10 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
