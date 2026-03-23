import { useState } from "react";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactPackages } from "@/hooks/useContacts";
import { PackageCard } from "./PackageCard";
import { CreatePackageDialog } from "./CreatePackageDialog";
import type { ContactPackage } from "@/types/database";

interface Props {
  contactId: string;
}

export function ContactPackagesTab({ contactId }: Props) {
  const { data: packages, isLoading } = useContactPackages(contactId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContactPackage | null>(null);

  const handleEdit = (pkg: ContactPackage) => {
    setEditing(pkg);
    setDialogOpen(true);
  };

  const handleOpenNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {packages?.length ? `${packages.length} pacote(s)` : "Nenhum pacote"}
        </p>
        <Button size="sm" onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Pacote
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : packages && packages.length > 0 ? (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} contactId={contactId} onEdit={handleEdit} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
          <Package className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum pacote ou serviço cadastrado</p>
          <Button variant="outline" size="sm" onClick={handleOpenNew}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Pacote
          </Button>
        </div>
      )}

      <CreatePackageDialog
        contactId={contactId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}
