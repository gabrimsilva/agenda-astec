import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Segment, Region } from "@shared/schema";

const segmentFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
});

const regionFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
});

type SegmentFormData = z.infer<typeof segmentFormSchema>;
type RegionFormData = z.infer<typeof regionFormSchema>;

export default function ClassificationsTab() {
  const { toast } = useToast();
  
  // Segment state
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [deleteSegmentDialogOpen, setDeleteSegmentDialogOpen] = useState(false);
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);

  // Region state
  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [deleteRegionDialogOpen, setDeleteRegionDialogOpen] = useState(false);
  const [regionToDelete, setRegionToDelete] = useState<Region | null>(null);

  // Fetch segments
  const { data: segments = [], isLoading: isLoadingSegments } = useQuery<Segment[]>({
    queryKey: ["/api/segments"],
  });

  // Fetch regions
  const { data: regions = [], isLoading: isLoadingRegions } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  // Segment form
  const segmentForm = useForm<SegmentFormData>({
    resolver: zodResolver(segmentFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Region form
  const regionForm = useForm<RegionFormData>({
    resolver: zodResolver(regionFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Save segment mutation
  const saveSegmentMutation = useMutation({
    mutationFn: async (data: SegmentFormData) => {
      if (selectedSegment) {
        return await apiRequest("PUT", `/api/segments/${selectedSegment.id}`, data);
      } else {
        return await apiRequest("POST", "/api/segments", { ...data, active: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/filters/options"] });
      toast({
        title: selectedSegment ? "Segmento atualizado" : "Segmento criado",
        description: `${segmentForm.getValues("name")} foi ${selectedSegment ? "atualizado" : "criado"} com sucesso.`,
      });
      setSegmentDialogOpen(false);
      segmentForm.reset();
      setSelectedSegment(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    },
  });

  // Delete segment mutation
  const deleteSegmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/segments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/filters/options"] });
      toast({
        title: "Segmento excluído",
        description: "O segmento foi excluído com sucesso.",
      });
      setDeleteSegmentDialogOpen(false);
      setSegmentToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error.message,
      });
    },
  });

  // Save region mutation
  const saveRegionMutation = useMutation({
    mutationFn: async (data: RegionFormData) => {
      if (selectedRegion) {
        return await apiRequest("PUT", `/api/regions/${selectedRegion.id}`, data);
      } else {
        return await apiRequest("POST", "/api/regions", { ...data, active: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/filters/options"] });
      toast({
        title: selectedRegion ? "Região atualizada" : "Região criada",
        description: `${regionForm.getValues("name")} foi ${selectedRegion ? "atualizada" : "criada"} com sucesso.`,
      });
      setRegionDialogOpen(false);
      regionForm.reset();
      setSelectedRegion(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    },
  });

  // Delete region mutation
  const deleteRegionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/regions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/filters/options"] });
      toast({
        title: "Região excluída",
        description: "A região foi excluída com sucesso.",
      });
      setDeleteRegionDialogOpen(false);
      setRegionToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error.message,
      });
    },
  });

  const handleNewSegment = () => {
    setSelectedSegment(null);
    segmentForm.reset({ name: "", description: "" });
    setSegmentDialogOpen(true);
  };

  const handleEditSegment = (segment: Segment) => {
    setSelectedSegment(segment);
    segmentForm.reset({
      name: segment.name,
      description: segment.description || "",
    });
    setSegmentDialogOpen(true);
  };

  const handleDeleteSegment = (segment: Segment) => {
    setSegmentToDelete(segment);
    setDeleteSegmentDialogOpen(true);
  };

  const handleNewRegion = () => {
    setSelectedRegion(null);
    regionForm.reset({ name: "", description: "" });
    setRegionDialogOpen(true);
  };

  const handleEditRegion = (region: Region) => {
    setSelectedRegion(region);
    regionForm.reset({
      name: region.name,
      description: region.description || "",
    });
    setRegionDialogOpen(true);
  };

  const handleDeleteRegion = (region: Region) => {
    setRegionToDelete(region);
    setDeleteRegionDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Segments Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Segmentos de Clientes</CardTitle>
              <CardDescription>
                {segments.length} segmento{segments.length !== 1 ? 's' : ''} cadastrado{segments.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button onClick={handleNewSegment} className="gap-2" data-testid="button-new-segment">
              <Plus className="h-4 w-4" />
              Novo Segmento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingSegments ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : segments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Nenhum segmento cadastrado
                    </TableCell>
                  </TableRow>
                ) : (
                  segments.map((segment) => (
                    <TableRow key={segment.id}>
                      <TableCell className="font-medium">{segment.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {segment.description || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditSegment(segment)}
                            data-testid={`button-edit-segment-${segment.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSegment(segment)}
                            data-testid={`button-delete-segment-${segment.id}`}
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
        </CardContent>
      </Card>

      {/* Regions Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Regiões de Atendimento</CardTitle>
              <CardDescription>
                {regions.length} região{regions.length !== 1 ? 'ões' : ''} cadastrada{regions.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button onClick={handleNewRegion} className="gap-2" data-testid="button-new-region">
              <Plus className="h-4 w-4" />
              Nova Região
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingRegions ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : regions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Nenhuma região cadastrada
                    </TableCell>
                  </TableRow>
                ) : (
                  regions.map((region) => (
                    <TableRow key={region.id}>
                      <TableCell className="font-medium">{region.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {region.description || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditRegion(region)}
                            data-testid={`button-edit-region-${region.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRegion(region)}
                            data-testid={`button-delete-region-${region.id}`}
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
        </CardContent>
      </Card>

      {/* Segment Dialog */}
      <Dialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen}>
        <DialogContent data-testid="dialog-segment-form">
          <DialogHeader>
            <DialogTitle>{selectedSegment ? "Editar Segmento" : "Novo Segmento"}</DialogTitle>
            <DialogDescription>
              {selectedSegment
                ? "Atualize as informações do segmento"
                : "Preencha as informações para cadastrar um novo segmento"}
            </DialogDescription>
          </DialogHeader>

          <Form {...segmentForm}>
            <form onSubmit={segmentForm.handleSubmit((data) => saveSegmentMutation.mutate(data))} className="space-y-4">
              <FormField
                control={segmentForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Automotivo, Industrial..." {...field} data-testid="input-segment-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={segmentForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input placeholder="Descrição opcional" {...field} data-testid="input-segment-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSegmentDialogOpen(false)}
                  data-testid="button-cancel-segment"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveSegmentMutation.isPending} data-testid="button-save-segment">
                  {saveSegmentMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Region Dialog */}
      <Dialog open={regionDialogOpen} onOpenChange={setRegionDialogOpen}>
        <DialogContent data-testid="dialog-region-form">
          <DialogHeader>
            <DialogTitle>{selectedRegion ? "Editar Região" : "Nova Região"}</DialogTitle>
            <DialogDescription>
              {selectedRegion
                ? "Atualize as informações da região"
                : "Preencha as informações para cadastrar uma nova região"}
            </DialogDescription>
          </DialogHeader>

          <Form {...regionForm}>
            <form onSubmit={regionForm.handleSubmit((data) => saveRegionMutation.mutate(data))} className="space-y-4">
              <FormField
                control={regionForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Norte, Sul, Centro..." {...field} data-testid="input-region-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={regionForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input placeholder="Descrição opcional" {...field} data-testid="input-region-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRegionDialogOpen(false)}
                  data-testid="button-cancel-region"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveRegionMutation.isPending} data-testid="button-save-region">
                  {saveRegionMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Segment Confirmation Dialog */}
      <Dialog open={deleteSegmentDialogOpen} onOpenChange={setDeleteSegmentDialogOpen}>
        <DialogContent data-testid="dialog-delete-segment">
          <DialogHeader>
            <DialogTitle>Excluir Segmento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o segmento "{segmentToDelete?.name}"?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteSegmentDialogOpen(false)}
              data-testid="button-cancel-delete-segment"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => segmentToDelete && deleteSegmentMutation.mutate(segmentToDelete.id)}
              disabled={deleteSegmentMutation.isPending}
              data-testid="button-confirm-delete-segment"
            >
              {deleteSegmentMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Region Confirmation Dialog */}
      <Dialog open={deleteRegionDialogOpen} onOpenChange={setDeleteRegionDialogOpen}>
        <DialogContent data-testid="dialog-delete-region">
          <DialogHeader>
            <DialogTitle>Excluir Região</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a região "{regionToDelete?.name}"?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteRegionDialogOpen(false)}
              data-testid="button-cancel-delete-region"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => regionToDelete && deleteRegionMutation.mutate(regionToDelete.id)}
              disabled={deleteRegionMutation.isPending}
              data-testid="button-confirm-delete-region"
            >
              {deleteRegionMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
