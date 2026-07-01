import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchTechnicians, createTechnician, createUserAndTechnician, updateTechnician, deleteTechnician } from "@/lib/api/technicians";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, UserIcon, Phone, Mail, MapPin, Users as UsersIcon, Car, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Technician, User } from "@shared/schema";
import { deleteUser } from "@/lib/api/users";

// Base schema with common fields
const baseFormSchema = z.object({
  // Technician fields
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  team: z.string().min(1, "Equipe é obrigatória"),
  baseCity: z.string().min(1, "Cidade base é obrigatória"),
  color: z.string().default("#3b82f6"),
  avatarUrl: z.string().optional(),
  vehicleInfo: z.string().optional(),
  licenseNumber: z.string().optional(),
  workHoursPerDay: z.coerce.number().min(1).max(24).default(8),
  datasulUsername: z.string().optional(),
  // Base address fields (home office)
  baseCep: z.string().optional(),
  baseAddress: z.string().optional(),
  baseNumero: z.string().optional(),
  baseBairro: z.string().optional(),
  baseCity2: z.string().optional(),
  baseState: z.string().optional(),
  baseLatitude: z.preprocess((val) => val === "" ? null : val, z.coerce.number().optional().nullable()),
  baseLongitude: z.preprocess((val) => val === "" ? null : val, z.coerce.number().optional().nullable()),
});

// Schema for creating new user - password and role are required
const createFormSchema = baseFormSchema.extend({
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["admin", "assistente"]),
});

// Schema for editing user - password and role are optional, empty password means "don't change"
const editFormSchema = baseFormSchema.extend({
  password: z.union([
    z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    z.literal("")
  ]).optional().transform(val => val === "" ? undefined : val),
  role: z.enum(["admin", "assistente"]).optional(),
});

type FormValues = z.infer<typeof createFormSchema>;

export default function TechniciansTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  const { data: technicians, isLoading } = useQuery({
    queryKey: ["/api/technicians"],
    queryFn: fetchTechnicians,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Filter users with role "assistente"
  const assistenteUsers = users.filter((u) => u.role === "assistente");

  const createMutation = useMutation({
    mutationFn: createUserAndTechnician,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário criado", description: "Usuário e acesso criados com sucesso" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormValues> }) => updateTechnician(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário atualizado", description: "Usuário atualizado com sucesso" });
      setDialogOpen(false);
      setEditingTechnician(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Check if it's a technician ID or user ID
      const tech = technicians?.find((t) => t.id === id);
      if (tech) {
        // It's a technician - delete via technician endpoint
        await deleteTechnician(id);
      } else {
        // It's an orphaned user - delete via user endpoint
        await deleteUser(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário removido", description: "Usuário removido com sucesso" });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      password: "",
      role: "assistente",
      name: "",
      email: "",
      phone: "",
      team: "",
      baseCity: "",
      color: "#3b82f6",
      avatarUrl: "",
      vehicleInfo: "",
      licenseNumber: "",
      workHoursPerDay: 8,
      datasulUsername: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    if (editingTechnician) {
      updateMutation.mutate({ id: editingTechnician.id, data: values });
    } else {
      // When creating, validate that password and role are provided
      if (!values.password || !values.role) {
        toast({ 
          title: "Erro", 
          description: "Senha e perfil são obrigatórios ao criar um novo usuário",
          variant: "destructive" 
        });
        return;
      }
      createMutation.mutate(values);
    }
  };

  const handleEdit = (technician: Technician) => {
    setEditingTechnician(technician);
    const user = users.find((u) => u.id === technician.userId);
    
    // Converter coordenadas com validação de NaN
    const latitude = technician.baseLatitude ? parseFloat(technician.baseLatitude) : null;
    const longitude = technician.baseLongitude ? parseFloat(technician.baseLongitude) : null;
    
    form.reset({
      password: "", // Optional when editing
      role: user?.role || "assistente",
      name: technician.name,
      email: technician.email,
      phone: technician.phone,
      team: technician.team,
      baseCity: technician.baseCity,
      color: technician.color,
      avatarUrl: technician.avatarUrl || "",
      vehicleInfo: technician.vehicleInfo || "",
      licenseNumber: technician.licenseNumber || "",
      workHoursPerDay: technician.workHoursPerDay || 8,
      datasulUsername: user?.datasulUsername || "",
      baseCep: (technician as any).baseCep || "",
      baseAddress: technician.baseAddress || "",
      baseNumero: technician.baseNumero || "",
      baseBairro: technician.baseBairro || "",
      baseCity2: "",
      baseState: technician.baseState || "",
      baseLatitude: latitude !== null && !isNaN(latitude) ? latitude : null,
      baseLongitude: longitude !== null && !isNaN(longitude) ? longitude : null,
    });
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingTechnician(null);
    form.reset({
      password: "",
      role: "assistente",
      name: "",
      email: "",
      phone: "",
      team: "",
      baseCity: "",
      color: "#3b82f6",
      avatarUrl: "",
      vehicleInfo: "",
      licenseNumber: "",
      workHoursPerDay: 8,
      datasulUsername: "",
      baseCep: "",
      baseAddress: "",
      baseNumero: "",
      baseBairro: "",
      baseCity2: "",
      baseState: "",
      baseLatitude: null,
      baseLongitude: null,
    });
    setDialogOpen(true);
  };

  const handleFetchCep = async () => {
    const cep = form.getValues("baseCep")?.replace(/\D/g, "");
    
    if (!cep || cep.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "Digite um CEP válido com 8 dígitos",
        variant: "destructive",
      });
      return;
    }

    setIsFetchingCep(true);
    try {
      const response = await fetch(`/api/cep/${cep}`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          description: "Verifique o CEP e tente novamente",
          variant: "destructive",
        });
        return;
      }

      form.setValue("baseAddress", data.logradouro || "");
      form.setValue("baseBairro", data.bairro || "");
      form.setValue("baseCity2", data.localidade || "");
      form.setValue("baseState", data.uf || "");
      
      if (data.localidade && data.uf) {
        form.setValue("baseCity", `${data.localidade}/${data.uf}`);
      }

      toast({
        title: "Endereço encontrado",
        description: `${data.logradouro || ""}, ${data.bairro || ""} - ${data.localidade || ""}/${data.uf || ""}`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao buscar CEP",
        description: "Não foi possível consultar o CEP. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingCep(false);
    }
  };

  const handleGeocodeBaseAddress = async () => {
    const baseAddress = form.getValues("baseAddress");
    const baseNumero = form.getValues("baseNumero");
    const baseBairro = form.getValues("baseBairro");
    const baseCity = form.getValues("baseCity");
    const baseState = form.getValues("baseState");

    if (!baseAddress && !baseCity) {
      toast({
        title: "Erro",
        description: "Preencha pelo menos o endereço ou cidade base antes de buscar coordenadas",
        variant: "destructive",
      });
      return;
    }

    setIsGeocoding(true);
    try {
      const response = await apiRequest("POST", "/api/geocode", {
        address: baseAddress || "",
        numero: baseNumero || "",
        bairro: baseBairro || "",
        city: baseCity || "",
        state: baseState || "",
        country: "Brasil",
      });

      const result = await response.json();

      if (result.found) {
        form.setValue("baseLatitude", result.latitude);
        form.setValue("baseLongitude", result.longitude);
        toast({
          title: "Sucesso",
          description: `Coordenadas encontradas: ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`,
        });
      } else {
        toast({
          title: "Não encontrado",
          description: "Não foi possível encontrar coordenadas para este endereço. Verifique os dados e tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao buscar coordenadas",
        variant: "destructive",
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Usuários</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie os usuários e técnicos do sistema
          </p>
        </div>
        <Button onClick={handleAdd} data-testid="button-add-technician">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Usuário
        </Button>
      </div>

      <div className="grid gap-4">
        {users && users.length > 0 ? (
          users.map((user) => {
            const tech = technicians?.find((t) => t.userId === user.id);
            return (
              <Card key={user.id} data-testid={`card-user-${user.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: tech?.color || "#6b7280" }}
                      >
                        <UserIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{tech?.name || user.name || user.email}</CardTitle>
                        <CardDescription>
                          {user.email} • {user.role}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {tech && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(tech)}
                          data-testid={`button-edit-technician-${tech.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(tech?.id || user.id)}
                        data-testid={`button-delete-user-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {tech && (
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span>{tech.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        <span>{tech.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <UsersIcon className="w-4 h-4" />
                        <span>{tech.team}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{tech.baseCity}</span>
                      </div>
                      {tech.vehicleInfo && (
                        <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                          <Car className="w-4 h-4" />
                          <span>{tech.vehicleInfo} {tech.licenseNumber ? `• ${tech.licenseNumber}` : ""}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">
                Nenhum usuário cadastrado. Clique em "Adicionar Usuário" para começar.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent key={editingTechnician?.id ?? "new"} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTechnician ? "Editar Usuário" : "Adicionar Usuário"}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do assistente técnico
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                <h3 className="font-medium text-sm">Dados de Acesso ao Sistema</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Senha {!editingTechnician && "*"}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            {...field} 
                            data-testid="input-password" 
                            placeholder={editingTechnician ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres"} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Perfil de Acesso *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="assistente">Assistente</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="datasulUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perfil Datasul</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="usuário do Datasul (ex.: gmsilva)"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-datasul-username"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Login do Datasul associado a este usuário. Ao entrar via Datasul com esse usuário,
                      o sistema aplica o perfil de acesso definido acima.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm mb-4">Dados do Técnico</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="(11) 99999-9999" data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="team"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipe *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Equipe Sul" data-testid="input-team" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="baseCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade Base *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Porto Alegre/RS" data-testid="input-base-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cor</FormLabel>
                      <FormControl>
                        <Input type="color" {...field} data-testid="input-color" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm mb-4">Endereço da Base (Home Office)</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure o endereço da base do técnico para permitir agendamento de atividades em home office
                </p>
              </div>

              <div className="flex gap-2 mb-4">
                <FormField
                  control={form.control}
                  name="baseCep"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Ex: 01310-100" 
                          data-testid="input-base-cep"
                          maxLength={9}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={handleFetchCep}
                    disabled={isFetchingCep}
                    data-testid="button-fetch-cep"
                  >
                    {isFetchingCep ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-2">Buscar</span>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="baseAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endereço</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Rua das Flores" data-testid="input-base-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="baseNumero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: 123" data-testid="input-base-numero" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="baseBairro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Centro" data-testid="input-base-bairro" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="baseState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado (UF)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: RS" data-testid="input-base-state" maxLength={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="baseLatitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          value={field.value ?? ""} 
                          placeholder="-30.0346" 
                          data-testid="input-base-latitude" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="baseLongitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          value={field.value ?? ""} 
                          placeholder="-51.2177" 
                          data-testid="input-base-longitude" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGeocodeBaseAddress}
                  disabled={isGeocoding}
                  data-testid="button-geocode-base"
                >
                  {isGeocoding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4 mr-2" />
                      Buscar coordenadas automaticamente
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Preencha o endereço e clique para buscar coordenadas
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {editingTechnician ? "Atualizar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
