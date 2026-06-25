import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Client, insertClientSchema, Region } from "@shared/schema";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Search, Loader2, CheckCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREDEFINED_SEGMENTS } from "@/lib/constants";

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

const clientFormSchema = insertClientSchema.extend({
  companyName: z.string().min(1, "Nome da empresa é obrigatório"),
});

type ClientFormData = z.infer<typeof clientFormSchema>;

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

export function ClientFormDialog({ open, onOpenChange, client }: ClientFormDialogProps) {
  const { toast } = useToast();
  const isEditing = !!client;
  const [cep, setCep] = useState("");
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepFound, setCepFound] = useState(false);

  // Função para buscar endereço pelo CEP usando ViaCEP
  const searchCep = async (cepValue: string) => {
    const cleanCep = cepValue.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      toast({
        variant: "destructive",
        title: "CEP inválido",
        description: "Digite um CEP com 8 dígitos",
      });
      return;
    }

    setIsSearchingCep(true);
    setCepFound(false);

    try {
      const response = await fetch(`/api/cep/${cleanCep}`);
      const data: ViaCepResponse = await response.json();

      if (data.erro) {
        toast({
          variant: "destructive",
          title: "CEP não encontrado",
          description: "Verifique o CEP digitado e tente novamente",
        });
        return;
      }

      // Preenche os campos do formulário
      form.setValue("address", data.logradouro || "");
      form.setValue("bairro", data.bairro || "");
      form.setValue("city", data.localidade || "");
      form.setValue("state", data.uf || "");
      form.setValue("country", "Brasil");

      setCepFound(true);
      toast({
        title: "Endereço encontrado",
        description: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao buscar CEP",
        description: "Não foi possível buscar o endereço. Tente novamente.",
      });
    } finally {
      setIsSearchingCep(false);
    }
  };

  // Formata o CEP enquanto digita
  const handleCepChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    if (cleanValue.length <= 8) {
      // Formata como 00000-000
      if (cleanValue.length > 5) {
        setCep(`${cleanValue.slice(0, 5)}-${cleanValue.slice(5)}`);
      } else {
        setCep(cleanValue);
      }
      setCepFound(false);
    }
  };

  // Busca automática quando o CEP tiver 8 dígitos
  useEffect(() => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8 && !isSearchingCep && !cepFound) {
      searchCep(cleanCep);
    }
  }, [cep]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      companyName: "",
      cnpj: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      internalCode: "",
      segment: "",
      region: "",
      address: "",
      numero: "",
      bairro: "",
      city: "",
      state: "",
      country: "Brasil",
      responsibleUserId: undefined,
      teamId: "",
      notes: "",
      active: true,
    },
  });

  // Reset form when client changes
  useEffect(() => {
    if (client) {
      form.reset({
        companyName: client.companyName,
        cnpj: client.cnpj || "",
        contactName: client.contactName || "",
        contactEmail: client.contactEmail || "",
        contactPhone: client.contactPhone || "",
        internalCode: client.internalCode || "",
        segment: client.segment || "",
        region: client.region || "",
        address: client.address || "",
        numero: client.numero || "",
        bairro: client.bairro || "",
        city: client.city || "",
        state: client.state || "",
        country: client.country || "Brasil",
        responsibleUserId: client.responsibleUserId || undefined,
        teamId: client.teamId || "",
        notes: client.notes || "",
        active: client.active,
      });
      // Reset CEP state for editing
      setCep("");
      setCepFound(false);
    } else {
      form.reset({
        companyName: "",
        cnpj: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        internalCode: "",
        segment: "",
        region: "",
        address: "",
        numero: "",
        bairro: "",
        city: "",
        state: "",
        country: "Brasil",
        responsibleUserId: undefined,
        teamId: "",
        notes: "",
        active: true,
      });
      // Reset CEP state for new client
      setCep("");
      setCepFound(false);
    }
  }, [client, form]);

  // Fetch regions from Classifications tab
  const { data: regions = [], isLoading: isLoadingRegions } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      // Automatically geocode address if available
      let clientData = { ...data };
      
      if (data.address || data.city) {
        try {
          const response = await apiRequest("POST", "/api/geocode", {
            address: data.address,
            numero: data.numero,
            bairro: data.bairro,
            city: data.city,
            state: data.state,
            country: data.country,
          });
          
          const geocodeResult = await response.json() as {
            latitude: number;
            longitude: number;
            displayName: string;
            found: boolean;
          };
          
          if (geocodeResult.found) {
            clientData = {
              ...clientData,
              latitude: geocodeResult.latitude.toString(),
              longitude: geocodeResult.longitude.toString(),
            };
            console.log(`Geocoding sucesso: ${geocodeResult.displayName}`);
          } else {
            console.warn("Não foi possível obter coordenadas para o endereço");
          }
        } catch (error) {
          console.warn("Erro ao buscar coordenadas, salvando sem geocoding:", error);
        }
      }
      
      if (isEditing) {
        return await apiRequest("PUT", `/api/clients/${client.id}`, clientData);
      } else {
        return await apiRequest("POST", "/api/clients", clientData);
      }
    },
    onSuccess: () => {
      // Invalidar todas as queries relacionadas a clientes
      queryClient.invalidateQueries({ 
        queryKey: ["/api/clients"],
        refetchType: 'all'
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/map/clients"],
        refetchType: 'all'
      });
      
      toast({
        title: isEditing ? "Cliente atualizado" : "Cliente criado",
        description: `${form.getValues("companyName")} foi ${isEditing ? "atualizado" : "criado"} com sucesso.`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    },
  });

  const onSubmit = (data: ClientFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-client-form">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informações do cliente"
              : "Preencha as informações para cadastrar um novo cliente"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Informações Básicas */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Informações Básicas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Empresa *</FormLabel>
                      <FormControl>
                        <Input placeholder="Razão Social" {...field} data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ</FormLabel>
                      <FormControl>
                        <Input placeholder="00.000.000/0000-00" {...field} value={field.value || ""} data-testid="input-cnpj" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Classificação */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Classificação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Região</FormLabel>
                      <FormControl>
                        <Input 
                          list="regions-list"
                          placeholder={isLoadingRegions ? "Carregando regiões..." : "Digite ou selecione a região"} 
                          disabled={isLoadingRegions}
                          {...field} 
                          value={field.value || ""} 
                          data-testid="input-region" 
                        />
                      </FormControl>
                      <datalist id="regions-list">
                        {regions.filter(r => r.active).map(region => (
                          <option key={region.id} value={region.name} />
                        ))}
                      </datalist>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="segment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Segmento</FormLabel>
                      <Select
                        value={field.value || ""}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-segment">
                            <SelectValue placeholder="Selecione o segmento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PREDEFINED_SEGMENTS.map((seg) => (
                            <SelectItem key={seg} value={seg}>
                              {seg}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Contato */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Contato</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Contato</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do responsável" {...field} value={field.value || ""} data-testid="input-contact-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone do Contato</FormLabel>
                      <FormControl>
                        <Input placeholder="(00) 00000-0000" {...field} value={field.value || ""} data-testid="input-contact-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email do Contato</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contato@empresa.com" {...field} value={field.value || ""} data-testid="input-contact-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Endereço</h3>
              
              {/* Campo de busca por CEP */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <FormLabel className="text-sm">CEP</FormLabel>
                  <div className="flex gap-2 mt-1.5">
                    <div className="relative flex-1">
                      <Input
                        placeholder="00000-000"
                        value={cep}
                        onChange={(e) => handleCepChange(e.target.value)}
                        maxLength={9}
                        data-testid="input-cep"
                        className={cepFound ? "border-green-500 pr-8" : ""}
                      />
                      {cepFound && (
                        <CheckCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => searchCep(cep)}
                      disabled={isSearchingCep || cep.replace(/\D/g, "").length !== 8}
                      data-testid="button-search-cep"
                    >
                      {isSearchingCep ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Digite o CEP para preencher automaticamente
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endereço</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da rua/avenida" {...field} value={field.value || ""} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número</FormLabel>
                      <FormControl>
                        <Input placeholder="Número" {...field} value={field.value || ""} data-testid="input-numero" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bairro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input placeholder="Bairro" {...field} value={field.value || ""} data-testid="input-bairro" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="Cidade" {...field} value={field.value || ""} data-testid="input-city" />
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
                      <FormLabel>Estado</FormLabel>
                      <FormControl>
                        <Input placeholder="UF" {...field} value={field.value || ""} data-testid="input-state" maxLength={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

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
                {saveMutation.isPending ? "Salvando..." : isEditing ? "Atualizar" : "Criar Cliente"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
