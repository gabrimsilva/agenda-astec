import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Client, ClientSite, insertClientSiteSchema } from "@shared/schema";
import { z } from "zod";
import { useEffect } from "react";
import { MapPin, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const siteFormSchema = insertClientSiteSchema.extend({
  siteName: z.string().min(1, "Nome do site é obrigatório"),
  address: z.string().min(1, "Endereço é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().min(1, "Estado é obrigatório"),
});

type SiteFormData = z.infer<typeof siteFormSchema>;

interface SiteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  site?: ClientSite | null;
}

export function SiteFormDialog({ open, onOpenChange, client, site }: SiteFormDialogProps) {
  const { toast } = useToast();
  const isEditing = !!site;
  const [mapsUrl, setMapsUrl] = useState("");
  const [parsingUrl, setParsingUrl] = useState(false);

  const form = useForm<SiteFormData>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: {
      clientId: client.id,
      siteName: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      latitude: undefined,
      longitude: undefined,
      accessRequirements: "",
    },
  });

  useEffect(() => {
    if (site) {
      form.reset({
        clientId: site.clientId,
        siteName: site.siteName,
        address: site.address,
        city: site.city,
        state: site.state,
        zipCode: site.zipCode || "",
        latitude: site.latitude || undefined,
        longitude: site.longitude || undefined,
        accessRequirements: site.accessRequirements || "",
      });
    } else {
      form.reset({
        clientId: client.id,
        siteName: "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        latitude: undefined,
        longitude: undefined,
        accessRequirements: "",
      });
    }
  }, [site, client.id, form]);

  const parseMapsMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/geo/parse-maps-url", { url });
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.latitude && data.longitude) {
        form.setValue("latitude", data.latitude.toString());
        form.setValue("longitude", data.longitude.toString());
        if (data.address) form.setValue("address", data.address);
        if (data.city) form.setValue("city", data.city);
        if (data.state) form.setValue("state", data.state);
        if (data.zipCode) form.setValue("zipCode", data.zipCode);
        
        toast({
          title: "Coordenadas extraídas",
          description: `Localização: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`,
        });
      }
      setMapsUrl("");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao extrair coordenadas",
        description: error.message,
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SiteFormData) => {
      if (isEditing) {
        return await apiRequest("PUT", `/api/sites/${site.id}`, data);
      } else {
        return await apiRequest("POST", `/api/clients/${client.id}/sites`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", client.id, "sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/map/clients"] });
      toast({
        title: isEditing ? "Site atualizado" : "Site criado",
        description: `${form.getValues("siteName")} foi ${isEditing ? "atualizado" : "criado"} com sucesso.`,
      });
      onOpenChange(false);
      form.reset();
      setMapsUrl("");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    },
  });

  const handleParseUrl = () => {
    if (mapsUrl.trim()) {
      parseMapsMutation.mutate(mapsUrl.trim());
    }
  };

  const onSubmit = (data: SiteFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-site-form">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Site" : "Novo Site"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informações do site"
              : "Preencha as informações do novo endereço"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Parse Google Maps URL */}
            <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4" />
                Importar de URL do Google Maps
              </div>
              <p className="text-xs text-muted-foreground">
                Cole o link do Google Maps para preencher automaticamente o endereço e coordenadas
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://maps.google.com/..."
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  data-testid="input-maps-url"
                />
                <Button
                  type="button"
                  onClick={handleParseUrl}
                  disabled={!mapsUrl.trim() || parseMapsMutation.isPending}
                  data-testid="button-parse-url"
                >
                  {parseMapsMutation.isPending ? "Extraindo..." : "Extrair"}
                </Button>
              </div>
            </div>

            {/* Site Name */}
            <FormField
              control={form.control}
              name="siteName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Site *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Matriz, Filial Centro, etc." {...field} data-testid="input-site-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Address */}
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço *</FormLabel>
                  <FormControl>
                    <Input placeholder="Rua, número, complemento" {...field} data-testid="input-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* City, State, ZIP */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade *</FormLabel>
                    <FormControl>
                      <Input placeholder="São Paulo" {...field} data-testid="input-city" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado *</FormLabel>
                    <FormControl>
                      <Input placeholder="SP" {...field} data-testid="input-state" maxLength={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input placeholder="00000-000" {...field} value={field.value || ""} data-testid="input-zip" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input placeholder="-23.550520" {...field} value={field.value || ""} data-testid="input-latitude" />
                    </FormControl>
                    <FormDescription>Coordenada de latitude (GPS)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input placeholder="-46.633308" {...field} value={field.value || ""} data-testid="input-longitude" />
                    </FormControl>
                    <FormDescription>Coordenada de longitude (GPS)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.watch("latitude") && form.watch("longitude") && (
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  Coordenadas GPS configuradas
                </span>
                <Badge variant="outline" className="ml-auto">
                  {Number(form.watch("latitude")).toFixed(6)}, {Number(form.watch("longitude")).toFixed(6)}
                </Badge>
              </div>
            )}

            {/* Access Requirements */}
            <FormField
              control={form.control}
              name="accessRequirements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requisitos de Acesso</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informações sobre horário de visita, documentação necessária, etc."
                      className="min-h-[60px]"
                      {...field}
                      value={field.value || ""}
                      data-testid="input-access-requirements"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? "Salvando..." : isEditing ? "Atualizar" : "Criar Site"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
