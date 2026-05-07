import { useEffect } from "react";
import { CircleDollarSign } from "lucide-react";
import { HospedagemSubNav } from "@/components/hospedagem/HospedagemSubNav";
import { useTenantContext } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";

const col = "mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8";
const stitchCard =
  "rounded-xl border border-[#ccc3d8] bg-white p-5 shadow-sm dark:border-border dark:bg-card sm:p-6";

export default function LodgingPricingPage() {
  const { selectedTenantId, scopedTenantDisplayName } = useTenantContext();

  useEffect(() => {
    document.title = "Valores — Gestão de reservas | Boom IA";
    return () => {
      document.title = "Boom IA — Plataforma de Agentes";
    };
  }, []);

  return (
    <div className="-mx-4 flex min-h-[calc(100dvh-6rem)] flex-1 flex-col bg-[#f8f9ff] dark:bg-background md:-mx-6">
      <div className={cn(col, "pb-12 pt-6 md:pt-8")}>
        <header className="mb-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#630ed4]">Gestão de reservas</p>
          <div className="mt-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0b1c30] dark:text-foreground sm:text-3xl">
              Valores e tarifas
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4a4455] dark:text-muted-foreground">
              Tabela de preços por <strong className="font-medium text-foreground/90">categoria de hospedagem</strong>,{" "}
              <strong className="font-medium text-foreground/90">número de pessoas</strong> e{" "}
              <strong className="font-medium text-foreground/90">diárias ou pacotes</strong>, com vigência. Os dados
              estruturados aqui alimentam consultas confiáveis para a IA e para o time comercial.
            </p>
            {scopedTenantDisplayName ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Tenant: <span className="font-medium text-foreground/80">{scopedTenantDisplayName}</span>
              </p>
            ) : null}
          </div>
          <HospedagemSubNav />
        </header>

        {!selectedTenantId ? (
          <div className={cn(stitchCard, "mt-8 text-sm text-muted-foreground")}>
            Selecione um tenant para gerir valores de hospedagem.
          </div>
        ) : (
          <section
            className={cn(
              stitchCard,
              "mt-8 flex flex-col gap-4 border-[#6314d926] bg-[#faf8ff] dark:border-border dark:bg-muted/20 sm:flex-row sm:items-start sm:gap-6"
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#7c3aed]/15 text-[#630ed4] dark:bg-[#7c3aed]/25 dark:text-[#c4b5fd]">
              <CircleDollarSign className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-base font-semibold text-[#0b1c30] dark:text-foreground">Cadastro em construção</h2>
              <p className="text-sm leading-relaxed text-[#4a4455] dark:text-muted-foreground">
                O modelo de dados e o editor da grade (importação a partir dos PDFs, vigência e vínculo com as categorias
                de <span className="font-medium text-foreground/80">Estoque de quartos</span>) serão adicionados na
                sequência. Este menu já deixa o fluxo da gestão de reservas completo na navegação.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
