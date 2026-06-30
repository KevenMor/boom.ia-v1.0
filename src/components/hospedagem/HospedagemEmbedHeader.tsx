import { HospedagemSubNav } from "@/components/hospedagem/HospedagemSubNav";

export function HospedagemEmbedHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white dark:border-border dark:bg-background">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-3 sm:px-6 lg:px-8">
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-muted-foreground">
          Reservas
        </p>
        <HospedagemSubNav />
      </div>
    </header>
  );
}
