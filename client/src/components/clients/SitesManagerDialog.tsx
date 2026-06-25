import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, MapPin, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Client, ClientSite } from "@shared/schema";
import { SiteFormDialog } from "./SiteFormDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SitesManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
}

export function SitesManagerDialog({ open, onOpenChange, client }: SitesManagerDialogProps) {
  const [siteFormOpen, setSiteFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<ClientSite | null>(null);
  const { toast } = useToast();

  const { data: sites = [], isLoading } = useQuery<ClientSite[]>({
    queryKey: ["/api/clients", client.id, "sites"],
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      await apiRequest("DELETE", `/api/sites/${siteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", client.id, "sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/clients"] });
      toast({
        title: "Site excluído",
        description: "O site foi excluído com sucesso.",
      });
      setDeleteDialogOpen(false);
      setSelectedSite(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error.message,
      });
    },
  });

  const handleNewSite = () => {
    setSelectedSite(null);
    setSiteFormOpen(true);
  };

  const handleEditSite = (site: ClientSite) => {
    setSelectedSite(site);
    setSiteFormOpen(true);
  };

  const handleDeleteSite = (site: ClientSite) => {
    setSelectedSite(site);
    setDeleteDialogOpen(true);
  };

  const openInMaps = (site: ClientSite) => {
    if (site.latitude && site.longitude) {
      window.open(`https://www.google.com/maps?q=${site.latitude},${site.longitude}`, '_blank');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh]" data-testid="dialog-sites-manager">
          <DialogHeader>
            <DialogTitle>Gerenciar Sites - {client.companyName}</DialogTitle>
            <DialogDescription>
              Cadastre e gerencie os endereços e localizações do cliente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  {sites.length} site{sites.length !== 1 ? 's' : ''} cadastrado{sites.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button
                onClick={handleNewSite}
                className="gap-2"
                data-testid="button-new-site"
              >
                <Plus className="h-4 w-4" />
                Novo Site
              </Button>
            </div>

            {isLoading ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">Carregando sites...</p>
                </CardContent>
              </Card>
            ) : sites.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center">
                    <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Nenhum site cadastrado
                    </p>
                    <Button onClick={handleNewSite} variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Primeiro Site
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Site</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Coordenadas</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => (
                      <TableRow key={site.id} data-testid={`row-site-${site.id}`}>
                        <TableCell className="font-medium">
                          {site.siteName}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {site.address}
                        </TableCell>
                        <TableCell>
                          {site.city}, {site.state}
                        </TableCell>
                        <TableCell>
                          {site.latitude && site.longitude ? (
                            <Badge variant="outline" className="gap-1 font-mono text-xs">
                              <MapPin className="h-3 w-3" />
                              {Number(site.latitude).toFixed(4)}, {Number(site.longitude).toFixed(4)}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Sem GPS</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {site.latitude && site.longitude && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openInMaps(site)}
                                data-testid={`button-open-maps-${site.id}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditSite(site)}
                              data-testid={`button-edit-site-${site.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteSite(site)}
                              data-testid={`button-delete-site-${site.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SiteFormDialog
        open={siteFormOpen}
        onOpenChange={setSiteFormOpen}
        client={client}
        site={selectedSite}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-site">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Site</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o site <strong>{selectedSite?.siteName}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedSite && deleteMutation.mutate(selectedSite.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
