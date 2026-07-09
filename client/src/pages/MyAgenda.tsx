import { DailyRouteView } from "@/components/DailyRouteView";
import { NavigationDialog } from "@/components/NavigationDialog";
import { ActivityClientContact } from "@/components/activities/ActivityClientContact";
import { ActivityTypeSelector, AddressFields, DateTimeFields, DescriptionField, CepSearchField, ActivityLocationSelector, getActivityTypeLocations } from "@/components/activities/ActivityFormFields";
import { RATFormDialog } from "@/components/rats/RATFormDialog";
import { SimplifiedRATFormDialog } from "@/components/rats/SimplifiedRATFormDialog";
import { RATConfirmDialog } from "@/components/rats/RATConfirmDialog";
import { ActivityCompletionDialog } from "@/components/ActivityCompletionDialog";
import { IdaTimeModal } from "@/components/IdaTimeModal";
import { NextStepPanel } from "@/components/NextStepPanel";
import { ReturnBaseModal } from "@/components/ReturnBaseModal";
import { RescheduleModal } from "@/components/RescheduleModal";
import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight, Plus, Building2, Clock, MapPin, FileText, ChevronsUpDown, Check, X, Search, Loader2, ChevronDown, Ban, Plane, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActivityRealtime } from "@/hooks/useActivityRealtime";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Activity, Technician, ActivityType, Client, Rat } from "@shared/schema";
import moment from "moment";
import "moment/locale/pt-br";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgendaBlockDialog } from "@/components/agenda/AgendaBlockDialog";
import { DatasulClientField } from "@/components/activities/DatasulClientField";
import type { AgendaBlock } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

moment.locale("pt-br");

const formSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1, "Cliente é obrigatório"),
  activityTypeId: z.string().min(1, "Tipo de atividade é obrigatório"),
  location: z.string().optional().nullable(),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  latitude: z.preprocess((val) => val === "" ? null : val, z.coerce.number().optional().nullable()),
  longitude: z.preprocess((val) => val === "" ? null : val, z.coerce.number().optional().nullable()),
  scheduledDate: z.string().min(1, "Data é obrigatória"),
  isMultiDay: z.boolean().optional().default(false), // Atividade multi-dia
  endDate: z.string().optional().nullable(), // Data final para atividades multi-dia
  startTime: z.string().min(1, "Hora inicial é obrigatória"),
  endTime: z.string().min(1, "Hora final é obrigatória"),
  transportMode: z.string().optional().nullable(), // carro, aviao, onibus, outro, nenhum
  notes: z.string().optional().nullable(),
}).refine((data) => {
  // Se isMultiDay é true, endDate é obrigatório e deve ser >= scheduledDate
  if (data.isMultiDay) {
    if (!data.endDate) return false;
    return data.endDate >= data.scheduledDate;
  }
  return true;
}, {
  message: "Data final é obrigatória e deve ser igual ou posterior à data inicial",
  path: ["endDate"],
});

const TRANSPORT_MODES = [
  { value: "carro", label: "Carro" },
  { value: "aviao", label: "Avião" },
  { value: "onibus", label: "Ônibus" },
  { value: "outro", label: "Outro" },
  { value: "nenhum", label: "Sem deslocamento" },
];

export default function MyAgenda() {
  // Real-time updates for activities
  useActivityRealtime();
  
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0); // 0 = semana atual, -1 = semana passada, 1 = próxima semana
  const [selectedDate, setSelectedDate] = useState(moment()); // Data selecionada para visualização detalhada
  const [navigationDialogOpen, setNavigationDialogOpen] = useState(false);
  const [selectedActivityForNav, setSelectedActivityForNav] = useState<string | null>(null); // ID da atividade selecionada para navegação individual
  const [newActivityDialogOpen, setNewActivityDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  
  // Estados para o fluxo de conclusão de atividade
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [activityBeingCompleted, setActivityBeingCompleted] = useState<string | null>(null);
  const [isCompletingActivity, setIsCompletingActivity] = useState(false);
  
  // Estados para edição de atividade
  const [editActivityDialogOpen, setEditActivityDialogOpen] = useState(false);
  const [activityBeingEdited, setActivityBeingEdited] = useState<string | null>(null);
  const [editCepValue, setEditCepValue] = useState("");
  const [isLoadingEditCep, setIsLoadingEditCep] = useState(false);
  const [editClientSearchOpen, setEditClientSearchOpen] = useState(false);
  
  // Estados para RAT (Relatório de Assistência Técnica)
  const [ratConfirmDialogOpen, setRatConfirmDialogOpen] = useState(false);
  const [ratFormDialogOpen, setRatFormDialogOpen] = useState(false);
  const [simplifiedRatFormDialogOpen, setSimplifiedRatFormDialogOpen] = useState(false);
  const [activityForRat, setActivityForRat] = useState<Activity | null>(null);
  
  // Estados para fluxo "conclusão → RAT → voltar para tempo de execução"
  const [pendingCompletionAfterRat, setPendingCompletionAfterRat] = useState(false);
  const [completionRatType, setCompletionRatType] = useState<"completa" | "simplificada" | null>(null);
  const [completionRatDone, setCompletionRatDone] = useState(false);
  const [completionDialogInitialStep, setCompletionDialogInitialStep] = useState<"execution" | "rat_choice" | undefined>(undefined);
  
  // Estados para fluxo V3 (IDA, próximo passo, retorno à base)
  const [idaTimeModalOpen, setIdaTimeModalOpen] = useState(false);
  const [activityForIda, setActivityForIda] = useState<Activity | null>(null);
  const [nextStepPanelOpen, setNextStepPanelOpen] = useState(false);
  const [completedActivityForNextStep, setCompletedActivityForNextStep] = useState<Activity | null>(null);
  const [ratChoiceAlreadyMade, setRatChoiceAlreadyMade] = useState(false);
  const [returnBaseModalOpen, setReturnBaseModalOpen] = useState(false);
  const [isEndJourneyFlow, setIsEndJourneyFlow] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [activityToReschedule, setActivityToReschedule] = useState<Activity | null>(null);
  
  // Estado para busca de CEP via ViaCEP
  const [cepValue, setCepValue] = useState("");
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  // Buscar dados do usuário logado e seu perfil de técnico
  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const { data: allActivities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    queryFn: async () => apiRequest("/api/activities", { method: "GET" }).then(r => r.json()),
    refetchInterval: 3000, // Auto-refresh every 3 seconds for faster updates
    staleTime: 0, // Always consider data stale
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activity-types"],
  });

  const { data: clientsResponse, isLoading: isLoadingClients } = useQuery<{ clients: Client[] }>({
    queryKey: ["/api/clients", { limit: 10000 }],
    queryFn: async () => {
      const response = await fetch("/api/clients?limit=10000", {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('astec_token')}`
        },
      });
      if (!response.ok) throw new Error('Failed to fetch clients');
      return response.json();
    },
  });

  const clients = clientsResponse?.clients || [];
  
  // Query para buscar RATs do técnico (para mostrar badge de RAT pendente)
  const { data: rats = [] } = useQuery<Rat[]>({
    queryKey: ["/api/rats"],
    enabled: !!user,
  });

  // Buscar day statuses cancelados para todas as atividades multi-dia
  const multiDayActivityIds = useMemo(() => 
    allActivities.filter(a => !!(a as any).endDate).map(a => a.id),
    [allActivities]
  );
  
  const { data: allDayStatuses = [] } = useQuery<{ activityId: string; date: string; status: string; startTime?: string; endTime?: string; checkInTime?: string; checkOutTime?: string; workCompleted?: boolean; actualDurationMinutes?: number }[]>({
    queryKey: ["/api/activity-day-statuses/all", multiDayActivityIds.join(",")],
    queryFn: async () => {
      if (multiDayActivityIds.length === 0) return [];
      const results: any[] = [];
      for (const actId of multiDayActivityIds) {
        try {
          const res = await fetch(`/api/activities/${actId}/day-status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('astec_token')}` },
          });
          if (res.ok) {
            const statuses = await res.json();
            statuses.forEach((s: any) => {
              results.push({
                activityId: s.activityId,
                date: s.date,
                status: s.status,
                startTime: s.startTime,
                endTime: s.endTime,
                checkInTime: s.checkInTime,
                checkOutTime: s.checkOutTime,
                workCompleted: s.workCompleted,
                actualDurationMinutes: s.actualDurationMinutes,
              });
            });
          }
        } catch {}
      }
      return results;
    },
    enabled: multiDayActivityIds.length > 0,
    staleTime: 5000,
  });

  const { data: allTimeRecords = [] } = useQuery<{ activityId: string; recordType: string; minutesReported: number; finishedAt: string }[]>({
    queryKey: ["/api/activity-time-records/bulk", multiDayActivityIds.join(",")],
    queryFn: async () => {
      if (multiDayActivityIds.length === 0) return [];
      const res = await fetch(`/api/activity-time-records/bulk?activityIds=${multiDayActivityIds.join(",")}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('astec_token')}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: multiDayActivityIds.length > 0,
    staleTime: 5000,
  });

  const timeRecordsByDayMap = useMemo(() => {
    const map = new Map<string, { ida?: number; retorno?: number }>();
    allTimeRecords.forEach(r => {
      const dateStr = r.finishedAt ? moment.utc(r.finishedAt).format("YYYY-MM-DD") : null;
      if (!dateStr) return;
      const key = `${r.activityId}_${dateStr}`;
      const existing = map.get(key) || {};
      if (r.recordType === "ida") existing.ida = r.minutesReported;
      if (r.recordType === "retorno_base") existing.retorno = r.minutesReported;
      map.set(key, existing);
    });
    return map;
  }, [allTimeRecords]);

  const cancelledDayKeys = useMemo(() => {
    const set = new Set<string>();
    allDayStatuses.forEach(d => {
      if (d.status === "cancelado") {
        const dateStr = moment.utc(d.date).format("YYYY-MM-DD");
        set.add(`${d.activityId}_${dateStr}`);
      }
    });
    return set;
  }, [allDayStatuses]);

  const dayStatusMap = useMemo(() => {
    // Em caso de múltiplos registros para o mesmo dia (duplicatas legadas),
    // mantém o mais avançado para que um dia concluído não seja ofuscado por um "emExecucao".
    const rank = (s: typeof allDayStatuses[0]) => {
      switch (s.status) {
        case "concluido": return 4;
        case "cancelado": return 3;
        case "emExecucao": return 2;
        case "aCaminho": return 1;
        default: return 0;
      }
    };
    const map = new Map<string, typeof allDayStatuses[0]>();
    allDayStatuses.forEach(d => {
      const dateStr = moment.utc(d.date).format("YYYY-MM-DD");
      const key = `${d.activityId}_${dateStr}`;
      const existing = map.get(key);
      if (!existing || rank(d) >= rank(existing)) {
        map.set(key, d);
      }
    });
    return map;
  }, [allDayStatuses]);
  
  // Map de activityId -> RAT status para lookup rápido
  const activityRatMap = useMemo(() => {
    const map = new Map<string, Rat>();
    rats.forEach((rat) => {
      map.set(rat.activityId, rat);
    });
    return map;
  }, [rats]);

  const myTechnician = useMemo(() => {
    return technicians.find((t) => t.userId === user?.id);
  }, [technicians, user?.id]);

  // Bloqueios de agenda (férias / compromissos) do técnico logado
  const { data: myAgendaBlocks = [] } = useQuery<AgendaBlock[]>({
    queryKey: ["/api/agenda-blocks", "tech", myTechnician?.id],
    queryFn: async () => {
      if (!myTechnician) return [];
      const token = localStorage.getItem("astec_token");
      const res = await fetch(`/api/agenda-blocks?technicianId=${myTechnician.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!myTechnician,
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/agenda-blocks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-blocks"], refetchType: "all" });
      toast({ title: "Bloqueio removido" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro ao remover", description: e.message }),
  });


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      clientName: "",
      activityTypeId: "",
      description: "",
      address: "",
      city: "",
      state: "",
      latitude: null,
      longitude: null,
      scheduledDate: selectedDate.format("YYYY-MM-DD"),
      isMultiDay: false,
      endDate: "",
      startTime: "09:00",
      endTime: "10:00",
      transportMode: "carro",
      notes: "",
    },
  });

  // Form para editar atividade
  const editForm = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      clientName: "",
      activityTypeId: "",
      description: "",
      address: "",
      city: "",
      state: "",
      latitude: null,
      longitude: null,
      scheduledDate: "",
      isMultiDay: false,
      endDate: "",
      startTime: "09:00",
      endTime: "10:00",
      transportMode: "carro",
      notes: "",
    },
  });

  // Função para buscar endereço via ViaCEP
  const handleCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "O CEP deve ter 8 dígitos",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoadingCep(true);
    try {
      const response = await fetch(`/api/cep/${cleanCep}`);
      const data = await response.json();
      
      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          description: "Verifique o CEP informado",
          variant: "destructive",
        });
        return;
      }
      
      // Preencher campos automaticamente
      form.setValue("address", data.logradouro || "");
      form.setValue("bairro", data.bairro || "");
      form.setValue("city", data.localidade || "");
      form.setValue("state", data.uf || "");
      
      toast({
        title: "Endereço encontrado!",
        description: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`,
      });
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCep(false);
    }
  };

  // Filtrar apenas atividades do técnico logado
  const activities = useMemo(() => {
    if (!myTechnician) return [];
    return allActivities.filter(activity => activity.technicianId === myTechnician.id);
  }, [allActivities, myTechnician]);

  // Calcular início e fim da semana selecionada
  const currentWeek = useMemo(() => {
    const start = moment().add(selectedWeekOffset, 'weeks').startOf('week');
    const end = moment(start).endOf('week');
    return { start, end };
  }, [selectedWeekOffset]);

  // Atualizar selectedDate quando a semana muda para garantir que a data selecionada
  // esteja sempre dentro da semana visível
  useEffect(() => {
    const isSelectedDateInCurrentWeek = selectedDate.isBetween(
      currentWeek.start, 
      currentWeek.end, 
      'day', 
      '[]'
    );
    
    if (!isSelectedDateInCurrentWeek) {
      // Se a semana contém hoje, seleciona hoje; caso contrário, seleciona segunda-feira
      const today = moment();
      if (today.isBetween(currentWeek.start, currentWeek.end, 'day', '[]')) {
        setSelectedDate(today);
      } else {
        // Seleciona segunda-feira da semana (index 1, pois domingo é 0)
        setSelectedDate(moment(currentWeek.start).add(1, 'day'));
      }
    }
  }, [currentWeek.start.format('YYYY-MM-DD'), currentWeek.end.format('YYYY-MM-DD')]);

  // Filtrar atividades do dia selecionado (incluindo multi-dia, excluindo dias cancelados/reagendados)
  const selectedDateStr = selectedDate.format("YYYY-MM-DD");
  const selectedDateActivities = useMemo(() => {
    return activities
      .filter((activity) => {
        const activityStartDate = moment(activity.scheduledDate).format("YYYY-MM-DD");
        const activityEndDate = (activity as any).endDate 
          ? moment((activity as any).endDate).format("YYYY-MM-DD") 
          : activityStartDate;
        
        // Atividade está no dia se: startDate <= selectedDate <= endDate
        if (selectedDateStr < activityStartDate || selectedDateStr > activityEndDate) return false;

        // Para atividades multi-dia, verificar se este dia foi cancelado (reagendado)
        if ((activity as any).endDate) {
          const dayKey = `${activity.id}_${selectedDateStr}`;
          if (cancelledDayKeys.has(dayKey)) return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        const isMultiDayA = !!(a as any).endDate;
        const isMultiDayB = !!(b as any).endDate;
        const dayKeyA = `${a.id}_${selectedDateStr}`;
        const dayKeyB = `${b.id}_${selectedDateStr}`;
        const dayStatusA = isMultiDayA ? dayStatusMap.get(dayKeyA) : null;
        const dayStatusB = isMultiDayB ? dayStatusMap.get(dayKeyB) : null;
        const timeA = (isMultiDayA && dayStatusA?.startTime) ? dayStatusA.startTime : (a.startTime || "00:00");
        const timeB = (isMultiDayB && dayStatusB?.startTime) ? dayStatusB.startTime : (b.startTime || "00:00");
        return timeA.localeCompare(timeB);
      });
  }, [activities, selectedDateStr, cancelledDayKeys, dayStatusMap]);

  // Bloqueios (férias/compromisso) que abrangem o dia selecionado
  const selectedDateBlocks = useMemo(() => {
    return myAgendaBlocks.filter((b) => {
      const s = moment(b.startDate).format("YYYY-MM-DD");
      const e = moment(b.endDate).format("YYYY-MM-DD");
      return selectedDateStr >= s && selectedDateStr <= e;
    });
  }, [myAgendaBlocks, selectedDateStr]);

  // Converter atividades para o formato do DailyRouteView
  const stops = useMemo(() => {
    const baseStops = selectedDateActivities.map((activity, index) => {
      const activityType = activityTypes.find((at) => at.id === activity.activityTypeId);
      
      // Para atividades multi-dia, usar o status do dia específico
      const isMultiDay = !!(activity as any).endDate;
      const dayKey = `${activity.id}_${selectedDateStr}`;
      const dayStatus = isMultiDay ? dayStatusMap.get(dayKey) : null;
      
      // Determinar statusLabel: usar dayStatus para multi-dia, activity.status para single-day
      let statusLabel: "planejado" | "aCaminho" | "emExecucao" | "concluido" | "concluidoSemSucesso" | "reprovado" | "cancelado";
      if (isMultiDay && dayStatus) {
        if (dayStatus.status === "concluido" && dayStatus.workCompleted === false) {
          statusLabel = "concluidoSemSucesso";
        } else if (dayStatus.status === "emExecucao") {
          statusLabel = "emExecucao";
        } else if (dayStatus.status === "concluido") {
          statusLabel = "concluido";
        } else if (dayStatus.status === "aCaminho") {
          statusLabel = "aCaminho";
        } else {
          statusLabel = "planejado";
        }
      } else if (isMultiDay && !dayStatus) {
        statusLabel = "planejado";
      } else if (activity.status === "concluido" && activity.workCompleted === false) {
        statusLabel = "concluidoSemSucesso";
      } else {
        statusLabel = activity.status as typeof statusLabel;
      }
      
      // Check if activity is "adicional" category or home office (base)
      const isAdicional = activityType?.category === "adicional";
      const isHomeOffice = activity.clientName === "Base do técnico (Home office)";
      // Tipo configurado para NÃO calcular trajeto: pula IDA/VOLTA (só inicia e conclui)
      const skipTravel = (activityType as any)?.requiresTravel === false;
      
      // Lista de tipos de atividade que requerem RAT
      const typesRequiringRat = [
        "Visita técnica (corretiva ou RCs)",
        "Visitas técnicas (Preventiva ou teste)"
      ];
      const requiresRat = activityType && typesRequiringRat.includes(activityType.name);
      
      // Check for RAT status
      const rat = activityRatMap.get(activity.id);
      // Se a atividade está concluída, requer RAT e não tem RAT, mostrar como "pendente"
      let ratStatus: string | undefined;
      let ratSentAt: string | null | undefined;
      if (rat) {
        ratStatus = rat.status as string;
        ratSentAt = rat.sentAt ? String(rat.sentAt) : null;
      } else if (activity.status === "concluido" && activity.workCompleted === true && requiresRat) {
        ratStatus = "pendente";
      }
      
      // Para multi-dia, derivar status e tempos do dayStatus
      const effectiveStatus = isMultiDay 
        ? (statusLabel === "concluido" || statusLabel === "concluidoSemSucesso" ? "completed" : statusLabel === "emExecucao" ? "inProgress" : "pending")
        : (activity.status === "concluido" ? "completed" : activity.status === "emExecucao" ? "inProgress" : "pending");
      
      const effectiveCheckInTime = isMultiDay && dayStatus?.checkInTime 
        ? String(dayStatus.checkInTime) 
        : activity.checkInTime ? String(activity.checkInTime) : null;
      
      const effectiveCheckOutTime = isMultiDay && dayStatus?.checkOutTime
        ? String(dayStatus.checkOutTime)
        : activity.checkOutTime ? String(activity.checkOutTime) : null;
      
      const effectiveWorkCompleted = isMultiDay && dayStatus
        ? dayStatus.workCompleted ?? null
        : activity.workCompleted;
      
      const effectiveStartTime = (isMultiDay && dayStatus?.startTime) ? dayStatus.startTime : (activity.startTime || "00:00");
      const effectiveEndTime = (isMultiDay && dayStatus?.endTime) ? dayStatus.endTime : (activity.endTime || "00:00");

      return {
        id: activity.id,
        order: index + 1,
        client: activity.clientName || "Cliente",
        title: activity.title || undefined,
        description: activity.description || null,
        address: [activity.address, activity.city, activity.state].filter(Boolean).join(", ") || "Sem endereço",
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        status: effectiveStatus as "pending" | "inProgress" | "completed",
        statusLabel,
        activityType: activityType?.name || "Atividade",
        activityTypeColor: activityType?.color || "#3b82f6",
        workCompleted: effectiveWorkCompleted,
        clientContact: (activity as any).client ? {
          contactName: (activity as any).client.contactName,
          contactPhone: (activity as any).client.contactPhone,
          contactEmail: (activity as any).client.contactEmail,
        } : undefined,
        hideNavigation: isAdicional || isHomeOffice || skipTravel,
        isHomeOffice,
        skipTravel,
        ratStatus,
        ratSentAt,
        navigationStartTime: activity.navigationStartTime ? String(activity.navigationStartTime) : null,
        checkInTime: effectiveCheckInTime,
        checkOutTime: effectiveCheckOutTime,
        transportMode: (activity as any).transportMode || null,
        isMultiDay,
        endDate: (activity as any).endDate ? String((activity as any).endDate) : null,
        actualTravelMinutes: (() => {
          if (isMultiDay) {
            const dayTimeKey = `${activity.id}_${selectedDateStr}`;
            const dayTimeRec = timeRecordsByDayMap.get(dayTimeKey);
            if (dayTimeRec?.ida != null) return dayTimeRec.ida;
          }
          return (activity as any).actualTravelMinutes ?? null;
        })(),
        actualDurationMinutes: isMultiDay && dayStatus?.actualDurationMinutes != null 
          ? dayStatus.actualDurationMinutes 
          : (activity as any).actualDurationMinutes ?? null,
        actualReturnMinutes: (() => {
          if (isMultiDay) {
            const dayTimeKey = `${activity.id}_${selectedDateStr}`;
            const dayTimeRec = timeRecordsByDayMap.get(dayTimeKey);
            if (dayTimeRec?.retorno != null) return dayTimeRec.retorno;
          }
          return (activity as any).actualReturnMinutes ?? null;
        })(),
        nextActivityTravelMinutes: null as number | null,
        isLastActivity: false,
      };
    });
    
    // Calcular nextActivityTravelMinutes: tempo de IDA da próxima atividade = tempo de VOLTA desta
    return baseStops.map((stop, index) => {
      const isLast = index === baseStops.length - 1;
      const nextStop = baseStops[index + 1];
      
      return {
        ...stop,
        isLastActivity: isLast,
        nextActivityTravelMinutes: nextStop?.actualTravelMinutes || null,
      };
    });
  }, [selectedDateActivities, activityTypes, activityRatMap, dayStatusMap, selectedDateStr, timeRecordsByDayMap]);

  // Calcular porcentagem de atividades efetivas da semana
  const weekStats = useMemo(() => {
    const startOfWeek = moment().startOf("week");
    const endOfWeek = moment().endOf("week");

    const weekActivities = activities.filter((activity) => {
      const activityDate = moment(activity.scheduledDate);
      return activityDate.isBetween(startOfWeek, endOfWeek, null, "[]");
    });

    const efetivosCount = weekActivities.filter((activity) => {
      const activityType = activityTypes.find((at) => at.id === activity.activityTypeId);
      return activityType?.category === "efetivo";
    }).length;

    const total = weekActivities.length;
    const percentage = total > 0 ? Math.round((efetivosCount / total) * 100) : 0;

    return { percentage, total };
  }, [activities, activityTypes]);

  // Gerar dias da semana selecionada (incluindo atividades multi-dia)
  const weekDays = useMemo(() => {
    const days = [];
    
    for (let i = 0; i < 7; i++) {
      const day = moment(currentWeek.start).add(i, "days");
      const dayStr = day.format("YYYY-MM-DD");
      
      // Incluir atividades que começam no dia OU que são multi-dia e abrangem este dia
      const dayActivities = activities.filter(a => {
        const activityStartDate = moment(a.scheduledDate).format("YYYY-MM-DD");
        const activityEndDate = (a as any).endDate 
          ? moment((a as any).endDate).format("YYYY-MM-DD") 
          : activityStartDate;
        
        if (dayStr < activityStartDate || dayStr > activityEndDate) return false;
        
        // Filtrar dias cancelados (reagendados) de atividades multi-dia
        if ((a as any).endDate) {
          const dayKey = `${a.id}_${dayStr}`;
          if (cancelledDayKeys.has(dayKey)) return false;
        }
        
        return true;
      });
      
      days.push({
        date: day,
        name: day.format("ddd").charAt(0).toUpperCase() + day.format("ddd").slice(1),
        number: day.format("D"),
        isCurrent: day.isSame(moment(), "day"),
        isSelected: day.isSame(selectedDate, "day"),
        activitiesCount: dayActivities.length,
      });
    }
    
    return days;
  }, [currentWeek, activities, selectedDate, cancelledDayKeys]);

  // Mutation para criar nova atividade
  const createActivityMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (!myTechnician) throw new Error("Técnico não encontrado");
      
      // Combinar scheduledDate e startTime em um timestamp ISO
      const scheduledDateTime = `${data.scheduledDate}T${data.startTime}:00`;
      
      // Para atividades multi-dia, criar endDate timestamp
      const endDateTime = data.isMultiDay && data.endDate 
        ? `${data.endDate}T${data.endTime}:00` 
        : null;
      
      const activityData = {
        technicianId: myTechnician.id,
        clientId: data.clientId,
        clientName: data.clientName,
        activityTypeId: data.activityTypeId,
        location: data.location || null,
        title: data.title,
        description: data.description || "",
        address: data.address,
        numero: data.numero || "",
        bairro: data.bairro || "",
        city: data.city,
        state: data.state,
        country: "Brasil",
        latitude: data.latitude,
        longitude: data.longitude,
        scheduledDate: scheduledDateTime,
        endDate: endDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        transportMode: data.transportMode || "carro",
        status: "planejado" as const,
        notes: data.notes,
      };
      
      const response = await apiRequest("POST", "/api/activities", activityData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setNewActivityDialogOpen(false);
      form.reset();
      setCepValue("");
      toast({
        title: "Atividade criada",
        description: "A atividade foi criada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para check-in
  const checkInMutation = useMutation({
    mutationFn: async (activityId: string) => {
      // Get GPS position with timeout to avoid blocking
      const position = await Promise.race([
        new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 30000,
          });
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);
      
      const response = await apiRequest("POST", `/api/activities/${activityId}/checkin`, {
        latitude: position?.coords?.latitude,
        longitude: position?.coords?.longitude,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });

  // Mutation para checkout
  const checkOutMutation = useMutation({
    mutationFn: async (params: {
      activityId: string;
      workCompleted?: boolean;
      travelJustification?: string;
      actualTravelMinutes?: number | null;
      adjustedCheckInTime?: string;
      adjustedCheckOutTime?: string;
      executionMinutes?: number;
      lostMinutes?: number;
    }) => {
      // Get GPS position with timeout to avoid blocking
      const position = await Promise.race([
        new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 30000,
          });
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);
      
      const response = await apiRequest("POST", `/api/activities/${params.activityId}/checkout`, {
        latitude: position?.coords?.latitude,
        longitude: position?.coords?.longitude,
        workCompleted: params.workCompleted,
        travelJustification: params.travelJustification,
        actualTravelMinutes: params.actualTravelMinutes,
        adjustedCheckInTime: params.adjustedCheckInTime,
        adjustedCheckOutTime: params.adjustedCheckOutTime,
        executionMinutes: params.executionMinutes,
        lostMinutes: params.lostMinutes,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao concluir atividade");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });

  // Mutation para excluir atividade
  const deleteActivityMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const response = await apiRequest("POST", `/api/activities/${activityId}/delete`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Atividade excluída",
        description: "A atividade foi excluída com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para reagendar atividade
  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { newDate: string; newEndDate?: string; newStartTime: string; newEndTime: string; reason: string } }) => {
      const res = await apiRequest("POST", `/api/activities/${id}/reschedule`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setRescheduleModalOpen(false);
      setActivityToReschedule(null);
      toast({
        title: "Atividade reagendada",
        description: "A atividade foi reagendada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reagendar atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  // Mutation para atualizar atividade
  const updateActivityMutation = useMutation({
    mutationFn: async ({ activityId, data }: { activityId: string; data: z.infer<typeof formSchema> }) => {
      const scheduledDateTime = `${data.scheduledDate}T${data.startTime}:00`;
      
      // Para atividades multi-dia, criar endDate timestamp
      const endDateTime = data.isMultiDay && data.endDate 
        ? `${data.endDate}T${data.endTime}:00` 
        : null;
      
      const activityData = {
        clientId: data.clientId,
        clientName: data.clientName,
        activityTypeId: data.activityTypeId,
        title: data.title,
        description: data.description || "",
        address: data.address,
        numero: data.numero || "",
        bairro: data.bairro || "",
        city: data.city,
        state: data.state,
        location: data.location || null,
        latitude: data.latitude,
        longitude: data.longitude,
        scheduledDate: scheduledDateTime,
        endDate: endDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        transportMode: data.transportMode || "carro",
        notes: data.notes,
      };
      
      // Envia via fetch para tratar bloqueio de agenda (409 AGENDA_BLOCK).
      const token = localStorage.getItem("astec_token");
      const putActivity = async (body: any) =>
        fetch(`/api/activities/${activityId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });

      // Bloqueio de agenda (férias / compromisso): bloqueio rígido na edição.
      const response = await putActivity(activityData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.error || "Erro ao atualizar atividade");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setEditActivityDialogOpen(false);
      setActivityBeingEdited(null);
      editForm.reset();
      setEditCepValue("");
      toast({
        title: "Atividade atualizada",
        description: "A atividade foi atualizada com sucesso",
      });
    },
    onError: (error: Error) => {
      if (error.message === "__CANCELLED__") return; // usuário cancelou no aviso de bloqueio
      toast({
        title: "Erro ao atualizar atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // V3: Mutation para iniciar navegação
  const startNavigationMutation = useMutation({
    mutationFn: async ({ activityId, gpsEtaMinutes }: { activityId: string; gpsEtaMinutes?: number }) => {
      const response = await apiRequest("POST", `/api/activities/${activityId}/navigation/start`, {
        gpsEtaMinutes,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao iniciar navegação");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Deslocamento iniciado",
        description: "Você iniciou o deslocamento com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao iniciar deslocamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // V3: Mutation para registrar tempo de IDA
  const recordIdaMutation = useMutation({
    mutationFn: async (params: { activityId: string; minutesReported: number; gpsEtaMinutes?: number; transportType?: string }) => {
      const response = await apiRequest("POST", `/api/activities/${params.activityId}/travel/ida`, {
        minutesReported: params.minutesReported,
        gpsEtaMinutes: params.gpsEtaMinutes,
        transportType: params.transportType,
        date: selectedDate.format("YYYY-MM-DD"),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao registrar tempo de IDA");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-time-records/bulk"] });
    },
  });

  // V3: Mutation para registrar retorno à base
  const recordReturnBaseMutation = useMutation({
    mutationFn: async (params: { activityId: string; minutesReported: number; gpsEtaMinutes?: number; transportType?: string }) => {
      const response = await apiRequest("POST", `/api/activities/${params.activityId}/travel/return-base`, {
        minutesReported: params.minutesReported,
        gpsEtaMinutes: params.gpsEtaMinutes,
        transportType: params.transportType,
        date: selectedDate.format("YYYY-MM-DD"),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao registrar retorno à base");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-time-records/bulk"] });
    },
  });

  // V3: Mutation para selecionar próximo passo
  const selectNextStepMutation = useMutation({
    mutationFn: async (params: { activityId: string; action: string; nextActivityId?: string }) => {
      const response = await apiRequest("POST", `/api/activities/${params.activityId}/next-step`, {
        action: params.action,
        nextActivityId: params.nextActivityId,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao selecionar próximo passo");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });

  // Handler para abrir modal de nova atividade
  const handleOpenNewActivityModal = () => {
    form.reset({
      title: "",
      clientName: "",
      activityTypeId: "",
      description: "",
      address: "",
      city: "",
      state: "",
      latitude: null,
      longitude: null,
      scheduledDate: selectedDate.format("YYYY-MM-DD"),
      startTime: "09:00",
      endTime: "10:00",
      transportMode: "carro",
      notes: "",
    });
    setNewActivityDialogOpen(true);
  };

  // Handler para selecionar cliente
  const handleClientSelect = (client: Client) => {
    // Converter coordenadas com validação de NaN
    const latitude = client.latitude ? parseFloat(client.latitude) : null;
    const longitude = client.longitude ? parseFloat(client.longitude) : null;
    
    form.setValue("clientId", client.id);
    form.setValue("clientName", client.companyName);
    form.setValue("address", client.address || "");
    form.setValue("numero", client.numero || "");
    form.setValue("bairro", client.bairro || "");
    form.setValue("city", client.city || "");
    form.setValue("state", client.state || "");
    form.setValue("latitude", latitude !== null && !isNaN(latitude) ? latitude : null);
    form.setValue("longitude", longitude !== null && !isNaN(longitude) ? longitude : null);
    setClientSearchOpen(false);
    setClientSearchQuery(""); // Limpar busca ao selecionar
  };

  // Handler para selecionar base do técnico (Home office)
  const handleBaseSelect = () => {
    if (!myTechnician) return;
    
    // Converter coordenadas com validação de NaN
    const latitude = myTechnician.baseLatitude ? parseFloat(myTechnician.baseLatitude) : null;
    const longitude = myTechnician.baseLongitude ? parseFloat(myTechnician.baseLongitude) : null;
    
    form.setValue("clientId", undefined); // Não tem clientId quando é base
    form.setValue("clientName", "Base do técnico (Home office)");
    form.setValue("address", myTechnician.baseAddress || "");
    form.setValue("numero", myTechnician.baseNumero || "");
    form.setValue("bairro", myTechnician.baseBairro || "");
    form.setValue("city", myTechnician.baseCity || "");
    form.setValue("state", myTechnician.baseState || "");
    form.setValue("latitude", latitude !== null && !isNaN(latitude) ? latitude : null);
    form.setValue("longitude", longitude !== null && !isNaN(longitude) ? longitude : null);
    setClientSearchOpen(false);
    setClientSearchQuery("");
  };

  // Handler para criar atividade
  const onSubmitActivity = async (data: z.infer<typeof formSchema>) => {
    const locs = getActivityTypeLocations(activityTypes, data.activityTypeId);
    if (locs.length > 0 && !(data.location && data.location.trim())) {
      form.setError("location", { type: "manual", message: "Local de execução é obrigatório" });
      return;
    }
    await createActivityMutation.mutateAsync(data);
  };

  const handleCheckIn = async (stopId: string) => {
    try {
      const activity = allActivities.find(a => a.id === stopId);
      const isMultiDay = activity && !!(activity as any).endDate;
      
      if (isMultiDay) {
        // Multi-day: check-in individual por dia via day-status endpoint
        const dayDate = selectedDate.format("YYYY-MM-DD");
        const position = await Promise.race([
          new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false, timeout: 5000, maximumAge: 30000,
            });
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]).catch(() => null);
        
        const response = await apiRequest("POST", `/api/activities/${stopId}/day-status/${dayDate}/check-in`, {
          latitude: position?.coords?.latitude,
          longitude: position?.coords?.longitude,
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Erro ao iniciar dia da atividade");
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
      } else {
        await checkInMutation.mutateAsync(stopId);
      }
      
      toast({
        title: "Atividade iniciada",
        description: isMultiDay ? `Dia ${selectedDate.format("DD/MM")} iniciado` : "Status atualizado para 'Em Execução'",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao iniciar atividade",
        description: error?.message || "Não foi possível iniciar a atividade",
        variant: "destructive",
      });
    }
  };

  const handleCheckOut = (stopId: string) => {
    setPendingCompletionAfterRat(false);
    setCompletionRatType(null);
    setCompletionRatDone(false);
    setCompletionDialogInitialStep(undefined);
    // Armazenar a atividade que está sendo concluída
    setActivityBeingCompleted(stopId);
    // Abrir o novo modal de conclusão com tempo de deslocamento
    setCompletionDialogOpen(true);
  };

  // Handler chamado quando o dialog de conclusão pede para abrir formulário de RAT
  const handleOpenRatFromCompletion = (type: "completa" | "simplificada") => {
    const activity = allActivities.find(a => a.id === activityBeingCompleted);
    if (!activity) return;
    
    setCompletionDialogOpen(false);
    setPendingCompletionAfterRat(true);
    setCompletionRatType(type);
    
    const updatedActivity = { ...activity, workCompleted: true };
    setActivityForRat(updatedActivity);
    
    if (type === "completa") {
      setRatFormDialogOpen(true);
    } else {
      setSimplifiedRatFormDialogOpen(true);
    }
  };

  // Handler chamado quando a RAT é concluída/fechada e precisa voltar para tempo de execução
  const handleRatClosedReturnToCompletion = () => {
    if (!pendingCompletionAfterRat) return;
    
    if (completionRatDone) {
      setCompletionDialogInitialStep("execution");
      setCompletionDialogOpen(true);
    } else {
      setCompletionRatType(null);
      setPendingCompletionAfterRat(false);
      setCompletionRatDone(false);
      setCompletionDialogInitialStep("rat_choice");
      setCompletionDialogOpen(true);
    }
  };

  // Handler para o novo modal de conclusão
  const handleCompletionConfirm = async (data: {
    workCompleted: boolean;
    justification?: string;
    executionMinutes?: number;
    lostMinutes?: number;
    ratChoice?: "completa" | "simplificada" | "later";
  }) => {
    if (!activityBeingCompleted) return;
    
    const activity = allActivities.find(a => a.id === activityBeingCompleted);
    const isMultiDay = activity && !!(activity as any).endDate;
    
    setIsCompletingActivity(true);
    try {
      if (isMultiDay) {
        // Multi-day: checkout individual por dia via day-status endpoint
        const dayDate = selectedDate.format("YYYY-MM-DD");
        const position = await Promise.race([
          new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false, timeout: 5000, maximumAge: 30000,
            });
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]).catch(() => null);
        
        const response = await apiRequest("POST", `/api/activities/${activityBeingCompleted}/day-status/${dayDate}/check-out`, {
          latitude: position?.coords?.latitude,
          longitude: position?.coords?.longitude,
          workCompleted: data.workCompleted,
          justification: data.justification,
          lostMinutes: data.lostMinutes,
          executionMinutes: data.executionMinutes,
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Erro ao concluir dia da atividade");
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
      } else {
        // Single-day: checkout normal
        await checkOutMutation.mutateAsync({
          activityId: activityBeingCompleted,
          workCompleted: data.workCompleted,
          travelJustification: data.justification,
          executionMinutes: data.executionMinutes,
          lostMinutes: data.lostMinutes,
        });
      }
      
      toast({
        title: data.workCompleted 
          ? (isMultiDay ? `Dia ${selectedDate.format("DD/MM")} concluído` : "Atividade concluída")
          : (isMultiDay ? `Dia ${selectedDate.format("DD/MM")} finalizado` : "Atividade finalizada"),
        description: data.workCompleted 
          ? "Trabalho realizado com sucesso!" 
          : "Registrado como não realizado.",
      });
      
      setCompletionDialogOpen(false);
      setRatChoiceAlreadyMade(true);
      setPendingCompletionAfterRat(false);
      setCompletionRatType(null);
      setCompletionRatDone(false);
      setCompletionDialogInitialStep(undefined);
      
      // Invalidar day statuses para atualizar a UI
      if (isMultiDay) {
        queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
      }
      
      if (data.ratChoice === "later" && activity) {
        handleDismissRat();
      }
      
      if (activity) {
        handleOpenNextStepPanel({
          ...activity,
          workCompleted: data.workCompleted,
        });
      }
      
      setActivityBeingCompleted(null);
    } catch (error: any) {
      toast({
        title: "Erro ao concluir atividade",
        description: error.message || "Não foi possível concluir a atividade",
        variant: "destructive",
      });
    } finally {
      setIsCompletingActivity(false);
    }
  };

  // Função para lidar com a resposta do modal de RAT
  const handleRatConfirm = async (action: "now" | "later" | "skip") => {
    setRatConfirmDialogOpen(false);
    
    if (action === "now" && activityForRat) {
      // Abre o formulário de RAT
      setRatFormDialogOpen(true);
    } else if (action === "later" && activityForRat && myTechnician) {
      // Cria RAT pendente automaticamente
      try {
        await apiRequest("POST", "/api/rats", {
          activityId: activityForRat.id,
          technicianId: myTechnician.id,
          status: "pendente",
          formData: JSON.stringify({}),
        });
        
        toast({
          title: "RAT pendente criada",
          description: "Você pode preencher o relatório depois na seção de RATs.",
        });
        
        queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      } catch (error: any) {
        console.error("Error creating pending RAT:", error);
      }
      
      setActivityForRat(null);
    } else if (action === "skip") {
      // Não criar RAT - apenas fechar
      toast({
        title: "RAT não criada",
        description: "A visita foi concluída sem relatório técnico.",
      });
      setActivityForRat(null);
    }
  };

  // Handler para quando o usuário clica em "Deixar para depois" no NextStepPanel
  // A RAT já foi criada automaticamente pelo backend no checkout, então só precisa invalidar o cache
  const handleDismissRat = async () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
  };

  // V3: Handler para abrir modal de IDA quando status é "aCaminho"
  const handleOpenIdaModal = (activityId: string) => {
    const activity = allActivities.find(a => a.id === activityId);
    if (activity) {
      setActivityForIda(activity);
      setIdaTimeModalOpen(true);
    }
  };

  // V3: Handler para confirmar tempo de IDA
  const handleIdaConfirm = async (data: { minutesReported: number; gpsEtaMinutes?: number; transportType?: string }) => {
    if (!activityForIda) return;
    
    try {
      await recordIdaMutation.mutateAsync({
        activityId: activityForIda.id,
        ...data,
      });
      
      toast({
        title: "Atividade iniciada",
        description: `Tempo de deslocamento registrado: ${data.minutesReported} minutos`,
      });
      
      setIdaTimeModalOpen(false);
      setActivityForIda(null);
    } catch (error: any) {
      toast({
        title: "Erro ao registrar tempo de IDA",
        description: error.message || "Não foi possível registrar o tempo de deslocamento",
        variant: "destructive",
      });
      throw error;
    }
  };

  // V3: Handler para abrir painel de próximo passo após conclusão
  const handleOpenNextStepPanel = (activity: Activity) => {
    const isHomeOfficeActivity = activity.clientName === "Base do técnico (Home office)";
    const noTravelType = activityTypes.find((at) => at.id === activity.activityTypeId) as any;
    // Sem trajeto (ou home office): não há próximo passo/encerrar jornada — só conclui (tempo de execução já registrado).
    if (isHomeOfficeActivity || noTravelType?.requiresTravel === false) {
      setCompletedActivityForNextStep(null);
      setNextStepPanelOpen(false);
      return;
    }
    setCompletedActivityForNextStep(activity);
    setNextStepPanelOpen(true);
  };

  // V3: Handler para selecionar próxima atividade
  const handleSelectNextActivity = async (nextActivityId: string) => {
    if (!completedActivityForNextStep) return;
    
    try {
      await selectNextStepMutation.mutateAsync({
        activityId: completedActivityForNextStep.id,
        action: "next_activity",
        nextActivityId,
      });
      
      setNextStepPanelOpen(false);
      setCompletedActivityForNextStep(null);
      
      // Iniciar navegação para a próxima atividade
      const nextActivity = allActivities.find(a => a.id === nextActivityId);
      if (nextActivity) {
        setSelectedActivityForNav(nextActivityId);
        setNavigationDialogOpen(true);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao selecionar próxima atividade",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // V3: Handler para encerrar jornada - agora abre modal de VOLTA primeiro
  const handleEndJourney = async () => {
    if (!completedActivityForNextStep) return;
    
    const isHomeOfficeActivity = completedActivityForNextStep.clientName === "Base do técnico (Home office)";
    const noTravelType = activityTypes.find((at) => at.id === completedActivityForNextStep.activityTypeId) as any;
    const skipReturn = isHomeOfficeActivity || noTravelType?.requiresTravel === false;
    
    if (skipReturn) {
      setNextStepPanelOpen(false);
      await finalizeEndJourney();
      return;
    }
    
    setIsEndJourneyFlow(true);
    setNextStepPanelOpen(false);
    setReturnBaseModalOpen(true);
  };
  
  // V3: Finaliza a jornada após registrar tempo de VOLTA
  const finalizeEndJourney = async () => {
    if (!completedActivityForNextStep) return;
    
    try {
      await selectNextStepMutation.mutateAsync({
        activityId: completedActivityForNextStep.id,
        action: "end_journey",
      });
      
      toast({
        title: "Jornada encerrada",
        description: "Suas atividades do dia foram finalizadas.",
      });
      
      setCompletedActivityForNextStep(null);
    } catch (error: any) {
      toast({
        title: "Erro ao encerrar jornada",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // V3: Handler para abrir modal de retorno à base (via NextStepPanel)
  const handleOpenReturnBaseModal = async () => {
    const isHomeOfficeActivity = completedActivityForNextStep?.clientName === "Base do técnico (Home office)";
    const noTravelType = activityTypes.find((at) => at.id === completedActivityForNextStep?.activityTypeId) as any;
    const skipReturn = isHomeOfficeActivity || noTravelType?.requiresTravel === false;
    
    if (skipReturn) {
      setNextStepPanelOpen(false);
      try {
        await selectNextStepMutation.mutateAsync({
          activityId: completedActivityForNextStep!.id,
          action: "return_base",
        });
        toast({
          title: "Retorno registrado",
          description: "Atividade finalizada.",
        });
        setCompletedActivityForNextStep(null);
      } catch (error: any) {
        toast({
          title: "Erro ao registrar retorno",
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }
    
    setIsEndJourneyFlow(false);
    setNextStepPanelOpen(false);
    setReturnBaseModalOpen(true);
  };

  // V3: Handler para registrar volta diretamente do card da atividade
  const handleDirectRegisterReturn = (activityId: string) => {
    const activity = allActivities.find(a => a.id === activityId);
    if (activity) {
      setCompletedActivityForNextStep(activity);
      setReturnBaseModalOpen(true);
    }
  };

  // V3: Handler para confirmar retorno à base
  const handleReturnBaseConfirm = async (data: { minutesReported: number; gpsEtaMinutes?: number; transportType?: string }) => {
    if (!completedActivityForNextStep) return;
    
    try {
      await recordReturnBaseMutation.mutateAsync({
        activityId: completedActivityForNextStep.id,
        ...data,
      });
      
      toast({
        title: "Tempo de retorno registrado",
        description: `Tempo de volta: ${data.minutesReported} minutos`,
      });
      
      setReturnBaseModalOpen(false);
      
      // Se é fluxo de encerrar jornada, finalizar após registrar tempo de VOLTA
      if (isEndJourneyFlow) {
        setIsEndJourneyFlow(false);
        await finalizeEndJourney();
      } else {
        setCompletedActivityForNextStep(null);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao registrar tempo de retorno",
        description: error.message || "Não foi possível registrar o tempo de retorno",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleStartRoute = () => {
    setSelectedActivityForNav(null); // Limpar seleção individual
    setNavigationDialogOpen(true);
  };

  // Iniciar deslocamento (substitui navegação - apenas registra tempo e pula para cheguei)
  const handleStartSingleNavigation = (activityId: string) => {
    startNavigationMutation.mutate({ activityId });
  };

  // Handler para excluir atividade
  const handleDelete = async (activityId: string) => {
    await deleteActivityMutation.mutateAsync(activityId);
  };

  // Handler para abrir modal de reagendamento
  const handleReschedule = (activityId: string) => {
    const activity = allActivities.find(a => a.id === activityId);
    if (!activity) return;
    setActivityToReschedule(activity);
    setRescheduleModalOpen(true);
  };

  const isRescheduleMultiDay = !!(activityToReschedule && (activityToReschedule as any).endDate);

  // Handler para abrir modal de edição
  const handleEdit = (activityId: string) => {
    const activity = allActivities.find(a => a.id === activityId);
    if (!activity) return;
    
    // Converter coordenadas com validação de NaN
    const latitude = activity.latitude ? parseFloat(activity.latitude) : null;
    const longitude = activity.longitude ? parseFloat(activity.longitude) : null;
    
    // Verificar se é atividade multi-dia
    const hasEndDate = !!(activity as any).endDate;
    const endDateValue = hasEndDate ? moment((activity as any).endDate).format("YYYY-MM-DD") : "";
    
    // Para multi-dia, buscar horários do dia selecionado (se houver override)
    let effectiveStartTime = activity.startTime || "09:00";
    let effectiveEndTime = activity.endTime || "10:00";
    if (hasEndDate) {
      const dayKey = `${activityId}_${selectedDateStr}`;
      const dayStatus = dayStatusMap.get(dayKey);
      if (dayStatus?.startTime) effectiveStartTime = dayStatus.startTime;
      if (dayStatus?.endTime) effectiveEndTime = dayStatus.endTime;
    }

    setActivityBeingEdited(activityId);
    editForm.reset({
      title: activity.title || "",
      clientId: activity.clientId || undefined,
      clientName: activity.clientName || "",
      activityTypeId: activity.activityTypeId || "",
      location: (activity as any).location || null,
      description: activity.description || "",
      address: activity.address || "",
      numero: activity.numero || "",
      bairro: activity.bairro || "",
      city: activity.city || "",
      state: activity.state || "",
      latitude: latitude !== null && !isNaN(latitude) ? latitude : null,
      longitude: longitude !== null && !isNaN(longitude) ? longitude : null,
      scheduledDate: moment(activity.scheduledDate).format("YYYY-MM-DD"),
      isMultiDay: hasEndDate,
      endDate: endDateValue,
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      transportMode: (activity as any).transportMode || "carro",
      notes: activity.notes || "",
    });
    setEditActivityDialogOpen(true);
  };

  // Handler para buscar CEP no formulário de edição
  const handleEditCepSearch = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "O CEP deve ter 8 dígitos",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoadingEditCep(true);
    try {
      const response = await fetch(`/api/cep/${cleanCep}`);
      const data = await response.json();
      
      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          description: "Verifique o CEP informado",
          variant: "destructive",
        });
        return;
      }
      
      editForm.setValue("address", data.logradouro || "");
      editForm.setValue("bairro", data.bairro || "");
      editForm.setValue("city", data.localidade || "");
      editForm.setValue("state", data.uf || "");
      
      toast({
        title: "Endereço encontrado!",
        description: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`,
      });
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsLoadingEditCep(false);
    }
  };

  // Handler para selecionar cliente no formulário de edição
  const handleEditClientSelect = (client: Client) => {
    const latitude = client.latitude ? parseFloat(client.latitude) : null;
    const longitude = client.longitude ? parseFloat(client.longitude) : null;
    
    editForm.setValue("clientId", client.id);
    editForm.setValue("clientName", client.companyName);
    editForm.setValue("address", client.address || "");
    editForm.setValue("numero", client.numero || "");
    editForm.setValue("bairro", client.bairro || "");
    editForm.setValue("city", client.city || "");
    editForm.setValue("state", client.state || "");
    editForm.setValue("latitude", latitude !== null && !isNaN(latitude) ? latitude : null);
    editForm.setValue("longitude", longitude !== null && !isNaN(longitude) ? longitude : null);
    setEditClientSearchOpen(false);
  };

  // Handler para selecionar base do técnico no formulário de edição
  const handleEditBaseSelect = () => {
    if (!myTechnician) return;
    
    const latitude = myTechnician.baseLatitude ? parseFloat(myTechnician.baseLatitude) : null;
    const longitude = myTechnician.baseLongitude ? parseFloat(myTechnician.baseLongitude) : null;
    
    editForm.setValue("clientId", undefined);
    editForm.setValue("clientName", "Base do técnico (Home office)");
    editForm.setValue("address", myTechnician.baseAddress || "");
    editForm.setValue("numero", myTechnician.baseNumero || "");
    editForm.setValue("bairro", myTechnician.baseBairro || "");
    editForm.setValue("city", myTechnician.baseCity || "");
    editForm.setValue("state", myTechnician.baseState || "");
    editForm.setValue("latitude", latitude !== null && !isNaN(latitude) ? latitude : null);
    editForm.setValue("longitude", longitude !== null && !isNaN(longitude) ? longitude : null);
    setEditClientSearchOpen(false);
  };

  // Handler para submit do formulário de edição
  const onSubmitEditActivity = async (data: z.infer<typeof formSchema>) => {
    if (!activityBeingEdited) return;

    const locs = getActivityTypeLocations(activityTypes, data.activityTypeId);
    if (locs.length > 0 && !(data.location && data.location.trim())) {
      editForm.setError("location", { type: "manual", message: "Local de execução é obrigatório" });
      return;
    }

    const activity = allActivities.find(a => a.id === activityBeingEdited);
    const isMultiDay = activity && !!(activity as any).endDate;
    
    // Para multi-dia: salvar horários por dia via day-status, mas manter os dados base iguais
    if (isMultiDay) {
      // Salvar horários do dia selecionado via day-status endpoint
      try {
        const token = localStorage.getItem('astec_token');
        const dayRes = await fetch(`/api/activities/${activityBeingEdited}/day-status/${selectedDateStr}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            startTime: data.startTime,
            endTime: data.endTime,
          }),
        });
        if (!dayRes.ok) {
          const errorData = await dayRes.json();
          throw new Error(errorData.error || 'Erro ao salvar horário do dia');
        }
      } catch (error: any) {
        if (error.message?.includes('Conflito')) {
          toast({
            title: "Conflito de horário",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        throw error;
      }
      
      // Salvar demais dados da atividade (sem alterar startTime/endTime base)
      const activityData = {
        clientId: data.clientId,
        clientName: data.clientName,
        activityTypeId: data.activityTypeId,
        title: data.title,
        description: data.description || "",
        address: data.address,
        numero: data.numero || "",
        bairro: data.bairro || "",
        city: data.city,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
        location: data.location || null,
        transportMode: data.transportMode || "carro",
        notes: data.notes,
      };
      
      try {
        await apiRequest("PUT", `/api/activities/${activityBeingEdited}`, { ...activityData, ignoreBlock: true });
        queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
        setEditActivityDialogOpen(false);
        setActivityBeingEdited(null);
        editForm.reset();
        setEditCepValue("");
        toast({
          title: "Atividade atualizada",
          description: "O horário deste dia e dados da atividade foram atualizados",
        });
      } catch (error: any) {
        toast({
          title: "Erro ao atualizar atividade",
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }
    
    await updateActivityMutation.mutateAsync({ activityId: activityBeingEdited, data });
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6" data-testid="page-my-agenda">
      {/* Header */}
      <div className="flex items-center justify-end gap-2">
        <Button
          size="default"
          variant="outline"
          className="gap-2"
          onClick={() => setBlockDialogOpen(true)}
          data-testid="button-block-agenda"
        >
          <Ban className="h-4 w-4" />
          Bloquear Agenda
        </Button>
        <Button 
          size="default" 
          className="gap-2"
          onClick={handleOpenNewActivityModal}
          data-testid="button-new-activity"
        >
          <Plus className="h-4 w-4" />
          Nova Atividade
        </Button>
      </div>

      {/* Navegação de Semanas */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedWeekOffset(prev => prev - 1)}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-2 flex-1 justify-center">
              <Calendar className="h-4 w-4" />
              <span className="font-medium text-sm">
                {currentWeek.start.format("DD/MM")} - {currentWeek.end.format("DD/MM")}
              </span>
              {selectedWeekOffset === 0 && (
                <Badge variant="secondary" className="text-xs">Atual</Badge>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedWeekOffset(prev => prev + 1)}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Grid de Dias da Semana */}
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day) => (
              <button
                key={day.date.format("YYYY-MM-DD")}
                onClick={() => setSelectedDate(day.date)}
                className={`
                  relative text-center p-2 rounded-lg text-xs transition-all
                  hover-elevate active-elevate-2
                  ${day.isSelected 
                    ? "bg-primary text-primary-foreground" 
                    : day.isCurrent
                    ? "bg-primary/20 text-primary border-2 border-primary"
                    : "bg-muted"
                  }
                `}
                data-testid={`day-${day.date.format("YYYY-MM-DD")}`}
              >
                <div className="font-semibold">{day.name}</div>
                <div className="text-base mt-1">{day.number}</div>
                {day.activitiesCount > 0 && (
                  <div className={`
                    absolute -top-1 -right-1 h-5 w-5 rounded-full text-[10px] font-bold 
                    flex items-center justify-center
                    ${day.isSelected ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}
                  `}>
                    {day.activitiesCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bloqueios do dia (férias / compromissos) */}
      {selectedDateBlocks.length > 0 && (
        <div className="space-y-2">
          {selectedDateBlocks.map((block) => (
            <Card key={block.id} className="border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20">
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {block.blockType === "ferias" ? (
                    <Plane className="h-5 w-5 text-purple-600 shrink-0" />
                  ) : (
                    <Ban className="h-5 w-5 text-purple-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-purple-800 dark:text-purple-200">
                      {block.blockType === "ferias" ? "Férias" : "Compromisso pessoal"}
                      {block.blockType === "compromisso" && block.startTime && (
                        <span className="ml-2 text-sm font-normal">
                          {block.startTime}–{block.endTime}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {block.blockType === "ferias"
                        ? `${moment(block.startDate).format("DD/MM")} a ${moment(block.endDate).format("DD/MM/YYYY")}`
                        : block.description || "Indisponível"}
                      {block.blockType === "ferias" && block.description ? ` · ${block.description}` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteBlockMutation.mutate(block.id)}
                  disabled={deleteBlockMutation.isPending}
                  data-testid={`button-delete-block-${block.id}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visualização do Dia Selecionado */}
      <DailyRouteView
        date={selectedDate.format("D [de] MMMM, YYYY")}
        stops={stops}
        onStartSingleNavigation={handleStartSingleNavigation}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onOpenIdaModal={handleOpenIdaModal}
        onRegisterReturn={handleDirectRegisterReturn}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReschedule={handleReschedule}
        isDeleting={deleteActivityMutation.isPending}
      />

      {/* Dialog de Navegação */}
      <NavigationDialog
        open={navigationDialogOpen}
        onOpenChange={(open) => {
          setNavigationDialogOpen(open);
          if (!open) {
            setSelectedActivityForNav(null);
          }
        }}
        activities={selectedDateActivities}
        technicianId={myTechnician?.id}
        preSelectedActivityId={selectedActivityForNav || undefined}
        selectedDate={selectedDate.format("YYYY-MM-DD")}
      />

      {/* Dialog de Nova Atividade */}
      <AgendaBlockDialog
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        defaultTechnicianId={myTechnician?.id}
        defaultDate={selectedDate.format("YYYY-MM-DD")}
      />

      <Dialog open={newActivityDialogOpen} onOpenChange={(open) => {
        setNewActivityDialogOpen(open);
        if (!open) {
          setCepValue("");
          form.reset();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nova Atividade</DialogTitle>
            <DialogDescription>
              Crie uma nova atividade para o dia {selectedDate.format("DD/MM/YYYY")}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitActivity)} className="space-y-4">
              {/* Título */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Título da atividade"
                        {...field}
                        data-testid="input-activity-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Técnico (somente leitura) */}
              <div className="space-y-2">
                <FormLabel>Técnico</FormLabel>
                <Input
                  value={myTechnician?.name || "Carregando..."}
                  disabled
                  className="bg-muted"
                  data-testid="input-technician"
                />
              </div>

              {/* Cliente - Busca ao vivo no Datasul */}
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => {
                  const canBase =
                    myTechnician &&
                    myTechnician.baseAddress &&
                    myTechnician.baseCity &&
                    myTechnician.baseLatitude &&
                    !isNaN(parseFloat(myTechnician.baseLatitude)) &&
                    myTechnician.baseLongitude &&
                    !isNaN(parseFloat(myTechnician.baseLongitude));
                  return (
                    <FormItem className="flex flex-col relative">
                      <FormLabel>Cliente *</FormLabel>
                      <FormControl>
                        <DatasulClientField
                          value={field.value || ""}
                          onChangeText={(text) => {
                            field.onChange(text);
                            form.setValue("clientId", undefined);
                          }}
                          onSelectClient={(c) => {
                            field.onChange(c.nome);
                            form.setValue("clientId", undefined);
                            form.setValue("address", "");
                            form.setValue("numero", "");
                            form.setValue("bairro", "");
                            form.setValue("city", c.cidade || "");
                            form.setValue("state", c.estado || "");
                            form.setValue("latitude", null);
                            form.setValue("longitude", null);
                          }}
                          baseOption={
                            canBase
                              ? {
                                  label: "Base do técnico (Home office)",
                                  description: `${myTechnician?.baseAddress}, ${myTechnician?.baseCity}`,
                                  selected: field.value === "Base do técnico (Home office)",
                                  onSelect: handleBaseSelect,
                                }
                              : null
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Informações de contato do cliente selecionado */}
              {(() => {
                const clientId = form.watch('clientId');
                const selectedClient = clients.find(c => c.id === clientId);
                
                if (selectedClient && (selectedClient.contactName || selectedClient.contactPhone || selectedClient.contactEmail)) {
                  return (
                    <div className="rounded-md border border-border p-3 bg-muted/30 relative">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => {
                          form.setValue('clientName', '');
                          form.setValue('clientId', '');
                          form.setValue('address', '');
                          form.setValue('numero', '');
                          form.setValue('bairro', '');
                          form.setValue('city', '');
                          form.setValue('state', '');
                        }}
                        data-testid="button-clear-client"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Informações de Contato</p>
                      <ActivityClientContact
                        contactName={selectedClient.contactName}
                        contactPhone={selectedClient.contactPhone}
                        contactEmail={selectedClient.contactEmail}
                        variant="compact"
                      />
                    </div>
                  );
                }
                return null;
              })()}

              {/* Cidade e Estado */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="São Paulo"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-city"
                        />
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
                        <Input
                          placeholder="SP"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-state"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Tipo de Atividade */}
              <ActivityTypeSelector form={form} activityTypes={activityTypes} />

              {/* Local de Realização (puxado do tipo de atividade) */}
              <ActivityLocationSelector form={form} activityTypes={activityTypes} />

              {/* Data e Horários + Multi-dia */}
              <DateTimeFields form={form} showMultiDay={true} />

              {/* Descrição */}
              <DescriptionField form={form} />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewActivityDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createActivityMutation.isPending}
                  data-testid="button-submit"
                >
                  {createActivityMutation.isPending ? "Criando..." : "Criar Atividade"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição de Atividade */}
      <Dialog open={editActivityDialogOpen} onOpenChange={(open) => {
        setEditActivityDialogOpen(open);
        if (!open) {
          setEditCepValue("");
          setActivityBeingEdited(null);
          editForm.reset();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Editar Atividade</DialogTitle>
            <DialogDescription>
              {activityBeingEdited && !!(allActivities.find(a => a.id === activityBeingEdited) as any)?.endDate
                ? `Horários editados aplicam-se apenas ao dia ${selectedDate.format("DD/MM/YYYY")}`
                : "Atualize as informações da atividade"
              }
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEditActivity)} className="space-y-4">
              {/* Título */}
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Título da atividade"
                        {...field}
                        data-testid="edit-input-activity-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Técnico (somente leitura) */}
              <div className="space-y-2">
                <FormLabel>Técnico</FormLabel>
                <Input
                  value={myTechnician?.name || "Carregando..."}
                  disabled
                  className="bg-muted"
                  data-testid="edit-input-technician"
                />
              </div>

              {/* Cliente - Campo com Autocomplete */}
              <FormField
                control={editForm.control}
                name="clientName"
                render={({ field }) => {
                  const canBase =
                    myTechnician &&
                    myTechnician.baseAddress &&
                    myTechnician.baseCity &&
                    myTechnician.baseLatitude &&
                    !isNaN(parseFloat(myTechnician.baseLatitude)) &&
                    myTechnician.baseLongitude &&
                    !isNaN(parseFloat(myTechnician.baseLongitude));
                  return (
                    <FormItem className="flex flex-col relative">
                      <FormLabel>Cliente *</FormLabel>
                      <FormControl>
                        <DatasulClientField
                          value={field.value || ""}
                          onChangeText={(text) => {
                            field.onChange(text);
                            editForm.setValue("clientId", undefined);
                          }}
                          onSelectClient={(c) => {
                            field.onChange(c.nome);
                            editForm.setValue("clientId", undefined);
                            editForm.setValue("address", "");
                            editForm.setValue("numero", "");
                            editForm.setValue("bairro", "");
                            editForm.setValue("city", c.cidade || "");
                            editForm.setValue("state", c.estado || "");
                            editForm.setValue("latitude", null);
                            editForm.setValue("longitude", null);
                          }}
                          baseOption={
                            canBase
                              ? {
                                  label: "Base do técnico (Home office)",
                                  description: `${myTechnician?.baseAddress}, ${myTechnician?.baseCity}`,
                                  selected: field.value === "Base do técnico (Home office)",
                                  onSelect: handleEditBaseSelect,
                                }
                              : null
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* CEP com busca automática */}
              <div className="space-y-2">
                <FormLabel>CEP</FormLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder="00000-000"
                    value={editCepValue}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, "");
                      if (value.length > 8) value = value.slice(0, 8);
                      if (value.length > 5) {
                        value = value.slice(0, 5) + "-" + value.slice(5);
                      }
                      setEditCepValue(value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleEditCepSearch(editCepValue);
                      }
                    }}
                    className="flex-1"
                    data-testid="edit-input-cep"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleEditCepSearch(editCepValue)}
                    disabled={isLoadingEditCep || editCepValue.replace(/\D/g, "").length !== 8}
                    data-testid="edit-button-search-cep"
                  >
                    {isLoadingEditCep ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite o CEP e clique na lupa para preencher o endereço automaticamente
                </p>
              </div>

              {/* Endereço */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endereço</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Logradouro"
                          {...field}
                          value={field.value || ""}
                          data-testid="edit-input-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123"
                          {...field}
                          value={field.value || ""}
                          data-testid="edit-input-numero"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={editForm.control}
                  name="bairro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Centro"
                          {...field}
                          value={field.value || ""}
                          data-testid="edit-input-bairro"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="São Paulo"
                          {...field}
                          value={field.value || ""}
                          data-testid="edit-input-city"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="SP"
                          {...field}
                          value={field.value || ""}
                          data-testid="edit-input-state"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Tipo de Atividade */}
              <ActivityTypeSelector form={editForm} activityTypes={activityTypes} />

              {/* Local de Realização (puxado do tipo de atividade) */}
              <ActivityLocationSelector form={editForm} activityTypes={activityTypes} />

              {/* Data e Horários */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField
                  control={editForm.control}
                  name="scheduledDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editForm.watch("isMultiDay") ? "Data Início *" : "Data *"}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="edit-input-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {editForm.watch("isMultiDay") && (
                  <FormField
                    control={editForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Fim *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            value={field.value || ""} 
                            data-testid="edit-input-end-date" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-2 gap-3 sm:contents">
                  <FormField
                    control={editForm.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Início *</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="edit-input-start-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fim *</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="edit-input-end-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Atividade Multi-dia */}
              <FormField
                control={editForm.control}
                name="isMultiDay"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="edit-checkbox-multi-day"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="cursor-pointer">Atividade de múltiplos dias</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Marque se a visita vai durar mais de um dia
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {/* Descrição */}
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva os detalhes da atividade..."
                        {...field}
                        value={field.value || ""}
                        data-testid="edit-input-description"
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
                  onClick={() => setEditActivityDialogOpen(false)}
                  data-testid="edit-button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateActivityMutation.isPending}
                  data-testid="edit-button-submit"
                >
                  {updateActivityMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal de conclusão de atividade com tempo de deslocamento */}
      <ActivityCompletionDialog
        open={completionDialogOpen}
        onOpenChange={(open) => {
          setCompletionDialogOpen(open);
          if (!open) {
            if (!pendingCompletionAfterRat) {
              setActivityBeingCompleted(null);
            }
            setPendingCompletionAfterRat(false);
            setCompletionRatType(null);
            setCompletionRatDone(false);
            setCompletionDialogInitialStep(undefined);
          }
        }}
        onConfirm={handleCompletionConfirm}
        onOpenRatForm={handleOpenRatFromCompletion}
        isLoading={isCompletingActivity}
        clientName={allActivities.find(a => a.id === activityBeingCompleted)?.clientName || undefined}
        checkInTime={allActivities.find(a => a.id === activityBeingCompleted)?.checkInTime ? String(allActivities.find(a => a.id === activityBeingCompleted)?.checkInTime) : null}
        requiresRat={(() => {
          if (!activityBeingCompleted) return false;
          const act = allActivities.find(a => a.id === activityBeingCompleted);
          if (!act) return false;
          const actType = activityTypes.find((at: any) => at.id === act.activityTypeId);
          if (!actType) return false;
          let requires = !!(actType as any).requiresRat;
          if (!requires && (actType as any).parentId) {
            const parentType = activityTypes.find((at: any) => at.id === (actType as any).parentId);
            if (parentType && (parentType as any).requiresRat) requires = true;
          }
          if (!requires) return false;
          if (activityRatMap.has(act.id)) return false;
          const isMultiDay = !!(act as any).endDate;
          if (isMultiDay) {
            // Para atividades multi-dia, RAT só deve aparecer no último dia
            // endDate vem como timestamp UTC, precisa comparar sem timezone
            const endDate = moment((act as any).endDate).format("YYYY-MM-DD");
            const currentDay = selectedDate.format("YYYY-MM-DD");
            // Só permitir RAT se for exatamente o último dia
            if (currentDay !== endDate) return false;
          }
          return true;
        })()}
        initialStep={completionDialogInitialStep}
        ratCompleted={completionDialogInitialStep === "execution" && completionRatDone}
        ratType={completionRatType}
      />

      {/* Modal de confirmação de RAT */}
      <RATConfirmDialog
        open={ratConfirmDialogOpen}
        onOpenChange={setRatConfirmDialogOpen}
        clientName={activityForRat?.clientName || "Cliente"}
        onConfirm={handleRatConfirm}
      />

      {/* Modal do formulário de RAT */}
      <RATFormDialog
        open={ratFormDialogOpen}
        onOpenChange={(open) => {
          setRatFormDialogOpen(open);
          if (!open) {
            setActivityForRat(null);
            handleRatClosedReturnToCompletion();
          }
        }}
        activity={activityForRat}
        onSuccess={() => {
          setCompletionRatDone(true);
          setRatFormDialogOpen(false);
          setActivityForRat(null);
        }}
      />

      <SimplifiedRATFormDialog
        open={simplifiedRatFormDialogOpen}
        onOpenChange={(open) => {
          setSimplifiedRatFormDialogOpen(open);
          if (!open) {
            setActivityForRat(null);
            handleRatClosedReturnToCompletion();
          }
        }}
        activity={activityForRat}
        onSuccess={() => {
          setCompletionRatDone(true);
          setSimplifiedRatFormDialogOpen(false);
          setActivityForRat(null);
        }}
      />

      {/* V3: Modal de tempo de IDA */}
      <IdaTimeModal
        open={idaTimeModalOpen}
        onOpenChange={(open) => {
          setIdaTimeModalOpen(open);
          if (!open) {
            setActivityForIda(null);
          }
        }}
        onConfirm={handleIdaConfirm}
        activityName={activityForIda?.title || undefined}
        clientName={activityForIda?.clientName || undefined}
        gpsEtaMinutes={(activityForIda as any)?.navigationEtaMinutes}
        isLoading={recordIdaMutation.isPending}
      />

      {/* V3: Painel de próximo passo */}
      <NextStepPanel
        open={nextStepPanelOpen}
        onOpenChange={(open) => {
          setNextStepPanelOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
            setCompletedActivityForNextStep(null);
            setRatChoiceAlreadyMade(false);
          }
        }}
        completedActivity={completedActivityForNextStep}
        nextActivities={selectedDateActivities
          .filter(a => {
            if (a.id === completedActivityForNextStep?.id) return false;
            if (a.clientName === "Base do técnico (Home office)") return false;
            const isMultiDay = !!(a as any).endDate;
            if (isMultiDay) {
              const dayKey = `${a.id}_${selectedDate.format("YYYY-MM-DD")}`;
              const dayStatus = dayStatusMap.get(dayKey);
              if (dayStatus && dayStatus.status === "concluido") return false;
              return a.status !== "concluido";
            }
            return a.status === "planejado" || a.status === "aCaminho";
          })
          .map(a => ({
            id: a.id,
            clientName: a.clientName || "",
            title: a.title || "",
            startTime: a.startTime || undefined,
            address: a.address || undefined,
          }))}
        hasPendingRat={(() => {
          if (!completedActivityForNextStep || completedActivityForNextStep.workCompleted !== true) return false;
          if (ratChoiceAlreadyMade) return false;
          const actType = activityTypes.find((at: any) => at.id === completedActivityForNextStep.activityTypeId);
          if (!actType) return false;
          let requiresRat = !!(actType as any).requiresRat;
          if (!requiresRat && (actType as any).parentId) {
            const parentType = activityTypes.find((at: any) => at.id === (actType as any).parentId);
            if (parentType && (parentType as any).requiresRat) requiresRat = true;
          }
          if (!requiresRat) return false;
          return !activityRatMap.has(completedActivityForNextStep.id);
        })()}
        onSelectNextActivity={handleSelectNextActivity}
        onEndJourney={handleEndJourney}
        onReturnToBase={handleOpenReturnBaseModal}
        onOpenRatForm={(simplified) => {
          if (completedActivityForNextStep) {
            setActivityForRat(completedActivityForNextStep);
            if (simplified) {
              setSimplifiedRatFormDialogOpen(true);
            } else {
              setRatFormDialogOpen(true);
            }
          }
        }}
        onDismissRat={handleDismissRat}
        isLoading={selectNextStepMutation.isPending}
        baseName={myTechnician?.baseAddress && myTechnician?.baseCity 
          ? `${myTechnician.baseAddress}, ${myTechnician.baseCity}` 
          : myTechnician?.baseCity || undefined}
        isHomeOffice={completedActivityForNextStep?.clientName === "Base do técnico (Home office)"}
      />

      {/* V3: Modal de retorno à base */}
      <ReturnBaseModal
        open={returnBaseModalOpen}
        onOpenChange={(open) => {
          setReturnBaseModalOpen(open);
          if (!open) {
            setIsEndJourneyFlow(false);
            if (!nextStepPanelOpen) {
              setCompletedActivityForNextStep(null);
            }
          }
        }}
        onConfirm={handleReturnBaseConfirm}
        baseName={myTechnician?.baseAddress 
          ? `${myTechnician.baseAddress}${myTechnician.baseCity ? `, ${myTechnician.baseCity}` : ''}`
          : "Home Office"}
        baseAddress={myTechnician?.baseAddress || ""}
        baseCity={myTechnician?.baseCity || ""}
        baseState={myTechnician?.baseState || ""}
        isLoading={recordReturnBaseMutation.isPending}
      />

      {/* Modal de reagendamento */}
      <RescheduleModal
        open={rescheduleModalOpen}
        onOpenChange={setRescheduleModalOpen}
        onConfirm={async (data) => {
          if (activityToReschedule) {
            await rescheduleMutation.mutateAsync({ id: activityToReschedule.id, data });
          }
        }}
        activityId={activityToReschedule?.id}
        activityName={activityToReschedule?.title || ""}
        clientName={activityToReschedule?.clientName || ""}
        currentDate={activityToReschedule?.scheduledDate ? new Date(activityToReschedule.scheduledDate) : undefined}
        currentStartTime={activityToReschedule?.startTime}
        currentEndTime={activityToReschedule?.endTime}
        rescheduleCount={(activityToReschedule as any)?.rescheduleCount || 0}
        isLoading={rescheduleMutation.isPending}
        isMultiDay={isRescheduleMultiDay}
        endDate={isRescheduleMultiDay ? new Date((activityToReschedule as any).endDate) : undefined}
      />
    </div>
  );
}
