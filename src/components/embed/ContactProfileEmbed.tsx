import { useEffect } from "react";
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
  useEffect(() => {
    setActiveEmbedCrm({ embedKey, accountId });
    return () => setActiveEmbedCrm(null);
  }, [embedKey, accountId]);

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
