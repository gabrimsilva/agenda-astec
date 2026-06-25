import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Building2, MapPin, FileSpreadsheet, Pencil, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { Client } from "@shared/schema";
import { PREDEFINED_SEGMENTS } from "@/lib/constants";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { ImportClientsDialog } from "@/components/clients/ImportClientsDialog";
import { DeleteClientDialog } from "@/components/clients/DeleteClientDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GeocodeStatus {
  total: number;
  withCoordinates: number;
  withoutCoordinates: number;
}

interface ClientsResponse {
  clients: Client[];
  total: number;
}

export default function Clients() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<string>("");
  const [segment, setSegment] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Fetch geocode status
  const { data: geocodeStatus, refetch: refetchGeocodeStatus } = useQuery<GeocodeStatus>({
    queryKey: ["/api/clients/geocode-status"],
    queryFn: async () => {
      const token = localStorage.getItem("astec_token");
      const response = await fetch("/api/clients/geocode-status", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error("Falha ao carregar status de geocodificação");
      }
      return response.json();
    },
  });

  // Geocode batch mutation - processes 50 clients at a time
  const geocodeBatchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/clients/geocode-batch");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/clients"] });
      refetchGeocodeStatus();
      
      if (data.isComplete) {
        toast({
          title: "Geocodificação concluída!",
          description: `Todos os ${data.totalWithCoordinates} clientes possuem coordenadas.`,
        });
      } else {
        toast({
          title: `Lote processado: ${data.success}/${data.processed}`,
          description: `Restam ${data.remaining} clientes. Clique novamente para continuar.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro na geocodificação",
        description: error.message,
      });
    },
  });

  // Build query URL and key
  const buildQueryUrl = () => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search) params.append("search", search);
    if (region && region !== "all") params.append("region", region);
    if (segment && segment !== "all") params.append("segment", segment);
    if (activeFilter !== "all") params.append("active", activeFilter === "active" ? "true" : "false");
    
    return `/api/clients?${params.toString()}`;
  };

  // Fetch clients with filters
  const queryUrl = buildQueryUrl();
  const { data: clientsData, isLoading } = useQuery<ClientsResponse>({
    queryKey: ['/api/clients', { page, limit, search, region, segment, activeFilter }],
    queryFn: async () => {
      const token = localStorage.getItem("astec_token");
      const response = await fetch(queryUrl, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 0, // Force refetch on filter changes
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery<{ regions: string[]; segments: string[] }>({
    queryKey: ["/api/map/filters/options"],
  });

  const clients = clientsData?.clients || [];
  const total = clientsData?.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  // Debug logging
  console.log('[Clients Page] Query URL:', queryUrl);
  console.log('[Clients Page] Loading:', isLoading);
  console.log('[Clients Page] Data:', clientsData);
  console.log('[Clients Page] Clients array:', clients);
  console.log('[Clients Page] Total:', total);

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setClientFormOpen(true);
  };

  const handleDelete = (client: Client) => {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  };

  const handleNewClient = () => {
    setSelectedClient(null);
    setClientFormOpen(true);
  };

  return (
    <div className="h-full flex flex-col space-y-4 lg:space-y-6">
      <Card>
        <CardHeader className="p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-4">
            <div>
              <CardTitle className="text-base lg:text-lg">Clientes Cadastrados</CardTitle>
              <CardDescription className="text-xs lg:text-sm">
                {total} cliente{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {geocodeStatus && geocodeStatus.withoutCoordinates > 0 && (
                <Button
                  onClick={() => geocodeBatchMutation.mutate()}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 lg:gap-2"
                  disabled={geocodeBatchMutation.isPending}
                  data-testid="button-geocode-batch"
                >
                  {geocodeBatchMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 lg:h-4 lg:w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                  )}
                  <span className="text-xs lg:text-sm">
                    {geocodeBatchMutation.isPending 
                      ? "Geocodificando..." 
                      : `Geocodificar (${geocodeStatus.withoutCoordinates} pendentes)`}
                  </span>
                </Button>
              )}
              {geocodeStatus && geocodeStatus.withoutCoordinates === 0 && geocodeStatus.total > 0 && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="text-xs">Todos geocodificados</span>
                </Badge>
              )}
              <Button
                onClick={() => setImportDialogOpen(true)}
                variant="outline"
                size="sm"
                className="gap-1.5 lg:gap-2"
                data-testid="button-import"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                <span className="text-xs lg:text-sm">Importar Excel</span>
              </Button>
              <Button
                onClick={handleNewClient}
                size="sm"
                className="gap-1.5 lg:gap-2"
                data-testid="button-new-client"
              >
                <Plus className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                <span className="text-xs lg:text-sm">Novo Cliente</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 space-y-3 lg:space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 lg:left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 lg:h-4 lg:w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 lg:pl-9 h-8 lg:h-9 text-sm"
                data-testid="input-search"
              />
            </div>
            
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-8 lg:h-9 text-xs lg:text-sm" data-testid="select-region">
                <SelectValue placeholder="Todas as regiões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as regiões</SelectItem>
                {filterOptions?.regions?.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger className="h-8 lg:h-9 text-xs lg:text-sm" data-testid="select-segment">
                <SelectValue placeholder="Todos os segmentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os segmentos</SelectItem>
                {PREDEFINED_SEGMENTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="h-8 lg:h-9 text-xs lg:text-sm" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead>Negócio</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {client.companyName}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {client.cnpj || "-"}
                      </TableCell>
                      <TableCell>
                        {client.region ? (
                          <Badge variant="outline">{client.region}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {client.segment ? (
                          <Badge variant="secondary">{client.segment}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {client.contactName || "-"}
                          {client.contactPhone && (
                            <div className="text-muted-foreground">
                              {client.contactPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.active ? "default" : "secondary"}>
                          {client.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(client)}
                            data-testid={`button-edit-${client.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(client)}
                            data-testid={`button-delete-${client.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ClientFormDialog
        open={clientFormOpen}
        onOpenChange={setClientFormOpen}
        client={selectedClient}
      />
      
      {selectedClient && (
        <DeleteClientDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          client={selectedClient}
        />
      )}
      
      <ImportClientsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  );
}
