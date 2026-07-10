import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { fetchActivityTypes, createActivityType, updateActivityType, deleteActivityType, toggleRequiresTravel } from "@/lib/api/activityTypes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Palette, FolderPlus, ChevronDown, ChevronRight, Eye, EyeOff, X, Route, Navigation2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { ActivityType } from "@shared/schema";
import { ACTIVITY_CATEGORIZATIONS, ACTIVITY_LOCATIONS } from "@shared/schema";

// Standardized colors by category
const categoryColorPalette = {
  efetivo: ["#22c55e"], // Verde padrão
  adicional: ["#eab308"], // Amarelo padrão
  perda: ["#dc2626"], // Vermelho padrão
};

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  category: z.enum(["efetivo", "adicional", "perda"]),
  color: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  displayOrder: z.number().default(0),
  isActive: z.boolean().default(true),
  parentId: z.string().optional().nullable(),
  requiresRat: z.boolean().default(false),
  requiresTravel: z.boolean().default(true),
  categorization: z.string().optional().nullable(),
  locations: z.array(z.string()).optional().default([]),
});

type FormValues = z.infer<typeof formSchema>;

const categoryBadges = {
  efetivo: { label: "Efetivo", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" },
  adicional: { label: "Adicional", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" },
  perda: { label: "Perda", className: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400" },
};

// Editor de "Local de Realização": apresenta as opções fixas para o admin selecionar/remover
function LocationsEditor({
  value,
  onChange,
  idPrefix = "",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  idPrefix?: string;
}) {
  const toggle = (label: string) => {
    if (value.includes(label)) {
      onChange(value.filter((v) => v !== label));
    } else {
      onChange([...value, label]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIVITY_LOCATIONS.map((opt) => {
        const selected = value.includes(opt.label);
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => toggle(opt.label)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors ${
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground hover:bg-muted"
            }`}
            data-testid={`${idPrefix}location-option-${opt.value}`}
            aria-pressed={selected}
          >
            {opt.label}
            {selected && <X className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}

export default function ActivitiesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parentDialogOpen, setParentDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [parentCategory, setParentCategory] = useState<"efetivo" | "adicional" | "perda">("efetivo");
  const [parentRequiresRat, setParentRequiresRat] = useState(false);
  const [parentRequiresTravel, setParentRequiresTravel] = useState(true);
  const [parentCategorization, setParentCategorization] = useState<string | null>(null);
  const [parentLocations, setParentLocations] = useState<string[]>([]);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  const { data: types, isLoading } = useQuery({
    queryKey: ["/api/activity-types"],
    queryFn: fetchActivityTypes,
  });

  const createMutation = useMutation({
    mutationFn: createActivityType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-types"] });
      toast({ title: "Tipo criado", description: "Tipo de atividade criado com sucesso" });
      setDialogOpen(false);
      setParentDialogOpen(false);
      setParentName("");
    },
    onError: (error: any) => {
      const errorMessage = error?.message?.includes("DOCTYPE") 
        ? "Erro ao conectar com o servidor. Verifique sua conexão e tente novamente."
        : error?.message || "Erro ao criar tipo de atividade";
      toast({ title: "Erro ao criar", description: errorMessage, variant: "destructive" });
    },
  });

  const handleCreateParentCategory = () => {
    if (!parentName.trim()) return;
    createMutation.mutate({
      name: parentName.trim(),
      category: parentCategory,
      color: categoryColorPalette[parentCategory][0],
      isActive: true,
      parentId: null,
      requiresRat: parentRequiresRat,
      requiresTravel: parentRequiresTravel,
      categorization: parentCategorization,
      locations: parentLocations,
    });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormValues> }) => updateActivityType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-types"] });
      toast({ title: "Tipo atualizado", description: "Tipo de atividade atualizado com sucesso" });
      setDialogOpen(false);
      setEditingType(null);
    },
    onError: (error: any) => {
      const errorMessage = error?.message?.includes("DOCTYPE") 
        ? "Erro ao conectar com o servidor. Verifique sua conexão e tente novamente."
        : error?.message || "Erro ao atualizar tipo de atividade";
      toast({ title: "Erro ao atualizar", description: errorMessage, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteActivityType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-types"] });
      toast({ title: "Tipo removido", description: "Tipo de atividade removido com sucesso" });
      setDeleteId(null);
    },
    onError: (error: any) => {
      const errorMessage = error?.message?.includes("DOCTYPE") 
        ? "Erro ao conectar com o servidor. Verifique sua conexão e tente novamente."
        : error?.message || "Erro ao remover tipo de atividade";
      toast({ title: "Erro ao remover", description: errorMessage, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => 
      updateActivityType(id, { isActive }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-types"] });
      if (!variables.isActive) {
        setShowInactive(true);
      }
      toast({ 
        title: variables.isActive ? "Tipo ativado" : "Tipo desativado", 
        description: variables.isActive 
          ? "Tipo de atividade disponível para agendamento" 
          : "Tipo de atividade removido das opções de agendamento" 
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message?.includes("DOCTYPE") 
        ? "Erro ao conectar com o servidor. Verifique sua conexão e tente novamente."
        : error?.message || "Erro ao atualizar status do tipo de atividade";
      toast({ title: "Erro ao atualizar", description: errorMessage, variant: "destructive" });
    },
  });

  const toggleRequiresTravelMutation = useMutation({
    mutationFn: ({ id, requiresTravel }: { id: string; requiresTravel: boolean }) => 
      toggleRequiresTravel(id, requiresTravel),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-types"] });
      toast({ 
        title: variables.requiresTravel ? "Trajeto ativado" : "Trajeto desativado", 
        description: variables.requiresTravel 
          ? "Atividades deste tipo calcularão trajeto (IDA/VOLTA)" 
          : "Atividades deste tipo não calcularão trajeto (apenas iniciar e concluir)" 
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message?.includes("DOCTYPE") 
        ? "Erro ao conectar com o servidor. Verifique sua conexão e tente novamente."
        : error?.message || "Erro ao atualizar configuração de trajeto";
      toast({ title: "Erro ao atualizar trajeto", description: errorMessage, variant: "destructive" });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      category: "efetivo",
      color: "#22c55e",
      icon: "",
      description: "",
      displayOrder: 0,
      isActive: true,
      parentId: null,
      requiresRat: false,
      requiresTravel: true,
      categorization: null,
      locations: [],
    },
  });

  const watchParentId = form.watch("parentId");

  // Filtrar apenas categorias principais (sem parentId) para o dropdown
  const mainCategories = types?.filter((t: any) => !t.parentId) || [];

  // Organiza tipos por hierarquia: principais primeiro, depois subcategorias
  const allSubTypes = types?.filter((t: any) => t.parentId) || [];

  const getTypesWithHierarchy = (category: string) => {
    if (!types) return [];
    const mainTypes = types.filter((t: any) => t.category === category && !t.parentId);
    
    const result: { type: ActivityType; isChild: boolean; parentName?: string }[] = [];
    const activeMain = mainTypes.filter(t => t.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const inactiveMain = mainTypes.filter(t => t.isActive === false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    
    const sortedMain = [...activeMain, ...inactiveMain];
    
    sortedMain.forEach((main) => {
      if (!showInactive && main.isActive === false) return;
      result.push({ type: main, isChild: false });
      const activeSubs = allSubTypes.filter((sub: any) => sub.parentId === main.id && sub.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const inactiveSubs = allSubTypes.filter((sub: any) => sub.parentId === main.id && sub.isActive === false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const sortedSubs = [...activeSubs, ...(showInactive ? inactiveSubs : [])];
      sortedSubs.forEach((sub: any) => {
        result.push({ type: sub, isChild: true, parentName: main.name });
      });
    });
    return result;
  };
  
  const inactiveCount = types?.filter(t => t.isActive === false).length || 0;

  const getChildCount = (parentId: string) => {
    return types?.filter((t: any) => t.parentId === parentId).length || 0;
  };

  const toggleCollapse = (parentId: string) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const renderTypeRow = (type: ActivityType, isChild: boolean = false) => {
    if (isChild && collapsedParents.has((type as any).parentId)) return null;
    const childCount = !isChild ? getChildCount(type.id) : 0;
    const isCollapsed = collapsedParents.has(type.id);
    const hasChildren = childCount > 0;

    return (
    <div
      key={type.id}
      className={`flex items-start justify-between p-3 rounded-lg border bg-card hover-elevate ${!type.isActive ? 'opacity-60' : ''} ${isChild ? 'ml-8' : ''}`}
      data-testid={`activity-type-${type.id}`}
    >
      <div className="flex items-start gap-3 flex-1">
        {!isChild && hasChildren && (
          <button
            type="button"
            className="mt-2 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => toggleCollapse(type.id)}
            data-testid={`button-toggle-${type.id}`}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        )}
        {isChild && (
          <div 
            className="w-1 h-8 rounded-full flex-shrink-0" 
            style={{ backgroundColor: type.color }} 
          />
        )}
        <div 
          className={`${isChild ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center flex-shrink-0`}
          style={{ backgroundColor: type.color + '20', color: type.color }}
        >
          <div className={`${isChild ? 'w-2 h-2' : 'w-3 h-3'} rounded-full`} style={{ backgroundColor: type.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-medium ${isChild ? 'text-sm' : 'text-base'}`}>{type.name}</span>
            {isChild && <Badge variant="outline" className="text-xs">Subcategoria</Badge>}
            {!isChild && hasChildren && isCollapsed && (
              <Badge variant="secondary" className="text-xs">{childCount} {childCount === 1 ? 'subcategoria' : 'subcategorias'}</Badge>
            )}
            {(type as any).requiresRat && (
              <Badge variant="secondary" className="text-xs">RAT</Badge>
            )}
            {(type as any).requiresTravel === false && (
              <Badge variant="outline" className="text-xs">Sem trajeto</Badge>
            )}
            {!type.isActive && (
              <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Switch
          checked={type.isActive !== false}
          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: type.id, isActive: checked })}
          data-testid={`switch-active-${type.id}`}
        />
        <Button 
          size="icon" 
          variant={type.requiresTravel === false ? "secondary" : "ghost"}
          title={type.requiresTravel === false ? "Clique para ativar cálculo de trajeto" : "Clique para desativar cálculo de trajeto"}
          onClick={() => toggleRequiresTravelMutation.mutate({ id: type.id, requiresTravel: !(type.requiresTravel ?? true) })}
          data-testid={`button-toggle-requires-travel-${type.id}`}
        >
          <Route className="w-4 h-4" />
        </Button>
        <Button 
          size="icon" 
          variant="ghost" 
          onClick={() => handleEdit(type)} 
          data-testid={`button-edit-${type.id}`}
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button 
          size="icon" 
          variant="ghost" 
          onClick={() => setDeleteId(type.id)} 
          data-testid={`button-delete-${type.id}`}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
  };

  const onSubmit = (values: FormValues) => {
    let category = values.category;
    let requiresRat = values.requiresRat;
    let requiresTravel = values.requiresTravel;
    let categorization = values.categorization;
    let locations = values.locations;
    if (values.parentId) {
      const parent = types?.find((t: any) => t.id === values.parentId);
      if (parent) {
        category = parent.category as "efetivo" | "adicional" | "perda";
        requiresRat = !!(parent as any).requiresRat;
        requiresTravel = (parent as any).requiresTravel ?? true;
        // Categorização é herdada da categoria pai (assim como o Requer RAT)
        categorization = (parent as any).categorization ?? null;
        // Local de realização também é herdado da categoria pai
        locations = (parent as any).locations ?? [];
      }
    }
    
    const dataToSubmit: any = {
      ...values,
      category,
      requiresRat,
      requiresTravel,
      categorization,
      locations,
      color: categoryColorPalette[category][0],
    };
    
    if (editingType) {
      updateMutation.mutate({ id: editingType.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const handleEdit = (type: ActivityType) => {
    setEditingType(type);
    form.reset({
      name: type.name,
      category: type.category,
      color: type.color,
      icon: type.icon || "",
      description: type.description || "",
      displayOrder: type.displayOrder || 0,
      isActive: type.isActive ?? true,
      parentId: (type as any).parentId || null,
      requiresRat: (type as any).requiresRat ?? false,
      requiresTravel: (type as any).requiresTravel ?? true,
      categorization: (type as any).categorization || null,
      locations: (type as any).locations || [],
    });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingType(null);
    form.reset({
      name: "",
      category: "efetivo",
      icon: "",
      description: "",
      displayOrder: 0,
      isActive: true,
      parentId: null,
      requiresRat: false,
      requiresTravel: true,
      categorization: null,
      locations: [],
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="tab-activities">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Tipos de Atividades</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os tipos de atividades e suas categorias
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {inactiveCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowInactive(!showInactive)}
              data-testid="button-toggle-inactive"
            >
              {showInactive ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showInactive ? "Ocultar inativos" : `Mostrar inativos (${inactiveCount})`}
            </Button>
          )}
          <Dialog open={parentDialogOpen} onOpenChange={(open) => { setParentDialogOpen(open); if (!open) { setParentName(""); setParentCategory("efetivo"); setParentRequiresRat(false); setParentRequiresTravel(true); setParentCategorization(null); setParentLocations([]); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-new-parent-category">
                <FolderPlus className="w-4 h-4 mr-2" />
                Nova Categoria
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Nova Categoria Pai</DialogTitle>
                <DialogDescription>
                  Crie uma categoria principal para agrupar subcategorias
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome</label>
                  <Input
                    placeholder="Ex: Visitas técnicas"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    data-testid="input-parent-category-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria de atividade</label>
                  <Select value={parentCategory} onValueChange={(v) => setParentCategory(v as "efetivo" | "adicional" | "perda")}>
                    <SelectTrigger data-testid="select-parent-category-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efetivo">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Efetivo
                        </span>
                      </SelectItem>
                      <SelectItem value="adicional">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Adicional
                        </span>
                      </SelectItem>
                      <SelectItem value="perda">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Perda
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categorização da Atividade</label>
                  <Select
                    value={parentCategorization || "_none"}
                    onValueChange={(v) => setParentCategorization(v === "_none" ? null : v)}
                  >
                    <SelectTrigger data-testid="select-parent-categorization">
                      <SelectValue placeholder="Selecione uma categorização" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">
                        <span className="text-muted-foreground">Nenhuma</span>
                      </SelectItem>
                      {ACTIVITY_CATEGORIZATIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} data-testid={`option-parent-categorization-${opt.value}`}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Local de Realização</label>
                  <p className="text-xs text-muted-foreground">
                    Selecione os locais onde este tipo de atividade pode ser realizado
                  </p>
                  <LocationsEditor
                    value={parentLocations}
                    onChange={setParentLocations}
                    idPrefix="parent-"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Requer RAT</p>
                    <p className="text-xs text-muted-foreground">
                      Atividades deste tipo exigirão preenchimento de RAT ao concluir
                    </p>
                  </div>
                  <Switch
                    checked={parentRequiresRat}
                    onCheckedChange={setParentRequiresRat}
                    data-testid="switch-parent-requires-rat"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Requer cálculo de trajeto</p>
                    <p className="text-xs text-muted-foreground">
                      Quando desativado, a atividade é apenas iniciada e concluída (sem IDA/VOLTA)
                    </p>
                  </div>
                  <Switch
                    checked={parentRequiresTravel}
                    onCheckedChange={setParentRequiresTravel}
                    data-testid="switch-parent-requires-travel"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateParentCategory}
                  disabled={!parentName.trim() || createMutation.isPending}
                  data-testid="button-create-parent-category"
                >
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} data-testid="button-new-activity-type">
                <Plus className="w-4 h-4 mr-2" />
                Nova Atividade
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingType && !(editingType as any).parentId ? "Editar Categoria" : editingType ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
              <DialogDescription>
                {editingType && !(editingType as any).parentId
                  ? "Edite o nome da categoria principal"
                  : "Defina o nome e categoria da atividade"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!(editingType && !(editingType as any).parentId) && (
                  <FormField
                    control={form.control}
                    name="parentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria Pai (Opcional)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "_none" ? null : value)} 
                          value={field.value || "_none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-parent-category">
                              <SelectValue placeholder="Selecione uma categoria pai" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">
                              <span className="text-muted-foreground">Nenhuma (Categoria Principal)</span>
                            </SelectItem>
                            {mainCategories
                              .filter((cat: any) => cat.id !== editingType?.id)
                              .map((cat: any) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-2.5 h-2.5 rounded-full" 
                                      style={{ backgroundColor: cat.color }} 
                                    />
                                    <span>{cat.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Se preenchido, este tipo será uma subcategoria do tipo selecionado
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editingType && !(editingType as any).parentId ? "Nome da Categoria" : "Subcategoria"}</FormLabel>
                      <FormControl>
                        <Input placeholder={editingType && !(editingType as any).parentId ? "Ex: Visitas técnicas" : "Ex: Instalação"} {...field} data-testid="input-activity-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!watchParentId ? (
                  <FormField
                    control={form.control}
                    name="categorization"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categorização da Atividade</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "_none" ? null : value)}
                          value={field.value || "_none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-activity-categorization">
                              <SelectValue placeholder="Selecione uma categorização" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">
                              <span className="text-muted-foreground">Nenhuma</span>
                            </SelectItem>
                            {ACTIVITY_CATEGORIZATIONS.map((opt) => (
                              <SelectItem
                                key={opt.value}
                                value={opt.value}
                                data-testid={`option-categorization-${opt.value}`}
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="rounded-lg border p-3 opacity-60">
                    <p className="text-sm font-medium">Categorização da Atividade</p>
                    <p className="text-xs text-muted-foreground">
                      Herdado da categoria pai: {
                        ACTIVITY_CATEGORIZATIONS.find(
                          (opt) => opt.value === (types?.find((t: any) => t.id === watchParentId) as any)?.categorization
                        )?.label ?? "Nenhuma"
                      }
                    </p>
                  </div>
                )}
                {!watchParentId ? (
                  <FormField
                    control={form.control}
                    name="locations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Local de Realização</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Selecione os locais onde este tipo de atividade pode ser realizado
                        </p>
                        <LocationsEditor
                          value={field.value || []}
                          onChange={field.onChange}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="rounded-lg border p-3 opacity-60">
                    <p className="text-sm font-medium">Local de Realização</p>
                    <p className="text-xs text-muted-foreground mb-2">Herdado da categoria pai</p>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const parentLocs = ((types?.find((t: any) => t.id === watchParentId) as any)?.locations as string[]) || [];
                        if (parentLocs.length === 0) {
                          return <span className="text-xs text-muted-foreground">Nenhum</span>;
                        }
                        return parentLocs.map((loc) => (
                          <span key={loc} className="inline-flex items-center rounded-full border bg-muted px-3 py-1 text-sm">
                            {loc}
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                )}
                {!watchParentId ? (
                  <FormField
                    control={form.control}
                    name="requiresRat"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Requer RAT</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Atividades deste tipo exigirão preenchimento de RAT ao concluir
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-requires-rat"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="flex items-center justify-between rounded-lg border p-3 opacity-60">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Requer RAT</p>
                      <p className="text-xs text-muted-foreground">
                        Herdado da categoria pai
                      </p>
                    </div>
                    <Switch
                      checked={!!(types?.find((t: any) => t.id === watchParentId) as any)?.requiresRat}
                      disabled
                      data-testid="switch-requires-rat-inherited"
                    />
                  </div>
                )}
                {!watchParentId ? (
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Requer cálculo de trajeto</p>
                      <p className="text-xs text-muted-foreground">
                        {form.getValues().requiresTravel === false 
                          ? "✓ Desativado: sem IDA/VOLTA" 
                          : "✓ Ativado: com cálculo de IDA/VOLTA"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      <Route className="w-3 h-3 mr-1" />
                      {form.getValues().requiresTravel === false ? "Sem trajeto" : "Com trajeto"}
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border p-3 opacity-60">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Requer cálculo de trajeto</p>
                      <p className="text-xs text-muted-foreground">
                        Herdado da categoria pai
                      </p>
                    </div>
                    <Switch
                      checked={(types?.find((t: any) => t.id === watchParentId) as any)?.requiresTravel ?? true}
                      disabled
                      data-testid="switch-requires-travel-inherited"
                    />
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-activity">
                    {editingType ? "Atualizar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : types && types.length > 0 ? (
          <>
            {/* Efetivo Group */}
            {getTypesWithHierarchy('efetivo').length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <CardTitle className="text-lg">Efetivo</CardTitle>
                    <Badge variant="secondary" className="ml-2">
                      {getTypesWithHierarchy('efetivo').length} {getTypesWithHierarchy('efetivo').length === 1 ? 'tipo' : 'tipos'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {getTypesWithHierarchy('efetivo').map(({ type, isChild }) => 
                      renderTypeRow(type, isChild)
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Adicional Group */}
            {getTypesWithHierarchy('adicional').length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <CardTitle className="text-lg">Adicional</CardTitle>
                    <Badge variant="secondary" className="ml-2">
                      {getTypesWithHierarchy('adicional').length} {getTypesWithHierarchy('adicional').length === 1 ? 'tipo' : 'tipos'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {getTypesWithHierarchy('adicional').map(({ type, isChild }) => 
                      renderTypeRow(type, isChild)
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tempo não produtivo Group */}
            {getTypesWithHierarchy('perda').length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <CardTitle className="text-lg">Tempo não produtivo</CardTitle>
                    <Badge variant="secondary" className="ml-2">
                      {getTypesWithHierarchy('perda').length} {getTypesWithHierarchy('perda').length === 1 ? 'tipo' : 'tipos'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {getTypesWithHierarchy('perda').map(({ type, isChild }) => 
                      renderTypeRow(type, isChild)
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

          </>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Palette className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-3">Nenhum tipo de atividade cadastrado</p>
              <Button onClick={handleNew} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Tipo
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este tipo de atividade? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
