/** Overlay + painel quase página para modais de ocorrência (criar / editar). */
export const occurrenceModalOverlayClassName =
  "bg-background/50 backdrop-blur-md supports-[backdrop-filter]:bg-background/40";

/** Sobrepõe o DialogContent padrão (centrado, max-w-lg) por um painel largo e alto. */
export const occurrenceModalContentClassName = [
  "!flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0",
  "rounded-xl border bg-card text-card-foreground shadow-2xl",
  "sm:h-[min(calc(100dvh-2rem),58rem)] sm:max-h-[min(calc(100dvh-2rem),58rem)] sm:w-[min(calc(100vw-2rem),80rem)] md:max-w-7xl",
].join(" ");
