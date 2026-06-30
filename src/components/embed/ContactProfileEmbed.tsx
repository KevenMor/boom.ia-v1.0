import { useLayoutEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmbedCrmProvider } from "@/contexts/EmbedCrmContext";
import { setActiveEmbedCrm } from "@/lib/api-client";
import ContactProfilePage from "@/pages/ContactProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

interface Props {
  contactId: string;
  embedKey: string;
  accountId: string;
}

export function ContactProfileEmbed({ contactId, embedKey, accountId }: Props) {
  const creds = useMemo(() => ({ embedKey, accountId }), [embedKey, accountId]);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setActiveEmbedCrm(creds);
    setReady(true);
    return () => {
      setActiveEmbedCrm(null);
      setReady(false);
    };
  }, [creds]);

  if (!ready) {
    return (
      <div className="ds-chatwoot min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando cadastro" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <EmbedCrmProvider embedKey={embedKey} accountId={accountId}>
          <MemoryRouter initialEntries={[`/clients/${contactId}`]}>
            <Routes>
              <Route path="/clients/:contactId" element={<ContactProfilePage />} />
            </Routes>
          </MemoryRouter>
        </EmbedCrmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
