import { BoomIaLogo } from "@/components/brand/BoomIaLogo";
import { cn } from "@/lib/utils";

interface AppLoadingScreenProps {
  message?: string;
  className?: string;
}

export function AppLoadingScreen({
  message = "Preparando seu workspace…",
  className,
}: AppLoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6",
        className,
      )}
    >
      <BoomIaLogo className="opacity-90" />
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
