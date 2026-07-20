import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Calendar as BigCalendar, momentLocalizer, View, SlotInfo } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/pt-br";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { Users, Filter, Calendar as CalendarIcon, Plus, User as UserIcon, Building2, FileText, Clock, MapPin, X, Check, ChevronsUpDown, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertActivitySchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActivityRealtime } from "@/hooks/useActivityRealtime";
import { z } from "zod";
import type { Activity, User, ActivityType, Client, Technician } from "@shared/schema";
import { ActivityClientContact } from "@/components/activities/ActivityClientContact";
import { ActivityTypeSelector, DateTimeFields, DescriptionField } from "@/components/activities/ActivityFormFields";

moment.locale("pt-br");
const localizer = momentLocalizer(moment);

// Wrap BigCalendar with Drag and Drop HOC
const DragAndDropCalendar = withDragAndDrop(BigCalendar);

const messages = {
  allDay: "Dia inteiro",
  previous: "Anterior",
  next: "Próximo",
  today: "Hoje",
  month: "Mês",
  week: "Semana",
  day: "Dia",
  agenda: "Agenda",
  date: "Data",
  time: "Hora",
  event: "Evento",
  noEventsInRange: "Nenhuma atividade neste período",
  showMore: (total: number) => `+${total} mais`,
  tomorrow: "Amanhã",
  yesterday: "Ontem",
  work_week: "Semana de trabalho",
};

const formats = {
  weekdayFormat: (date: Date) => {
    const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return days[date.getDay()];
  },
  dayFormat: (date: Date, culture: string | undefined, localizer: any) =>
    localizer.format(date, 'DD', culture),
  monthHeaderFormat: (date: Date) => {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  },
};

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: Activity;
}

const formSchema = z.object({
  technicianId: z.string().min(1, "Técnico é obrigatório"),
  clientId: z.string().optional(),
  clientName: z.string().min(1, "Cliente é obrigatório"),
  siteId: z.string().optional().nullable(),
  activityTypeId: z.string().min(1, "Tipo de atividade é obrigatório"),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  scheduledDate: z.string().min(1, "Data é obrigatória"),
  startTime: z.string().min(1, "Hora inicial é obrigatória"),
  endTime: z.string().min(1, "Hora final é obrigatória"),
  isMultiDay: z.boolean().optional().default(false),
  endDate: z.string().optional().nullable(),
  status: z.enum(["planejado", "aCaminho", "emExecucao", "concluido", "reprovado", "cancelado"]).default("planejado"),
  notes: z.string().optional().nullable(),
  checkInTime: z.date().optional().nullable(),
  checkOutTime: z.date().optional().nullable(),
  checkInLatitude: z.string().optional().nullable(),
  checkInLongitude: z.string().optional().nullable(),
  checkOutLatitude: z.string().optional().nullable(),
  checkOutLongitude: z.string().optional().nullable(),
  actualDurationMinutes: z.number().optional().nullable(),
}).refine((data) => {
  if (data.isMultiDay) {
    if (!data.endDate) return false;
    return data.endDate >= data.scheduledDate;
  }
  return true;
}, {
  message: "Data final deve ser igual ou posterior à data inicial",
  path: ["endDate"],
});

export default function Calendar() {
  // Real-time updates for activities
  useActivityRealtime();
  
  // Detectar mobile e usar view "agenda" por padrão
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [view, setView] = useState<View>(isMobile ? "agenda" : "month");
  const [date, setDate] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<string>("my-calendar");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    date: Date;
  } | null>(null);
  const [lastSlotDate, setLastSlotDate] = useState<Date>(new Date());
  const isRightClickRef = useRef(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Ref para o container do calendário e altura dinâmica
  const calendarCardRef = useRef<HTMLDivElement>(null);
  const [calendarHeight, setCalendarHeight] = useState<number>(600);
  
  // Calcular altura dinâmica do calendário baseado no viewport
  useEffect(() => {
    const calculateHeight = () => {
      if (calendarCardRef.current) {
        const rect = calendarCardRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const availableHeight = viewportHeight - rect.top - 40;
        setCalendarHeight(Math.max(500, availableHeight));
      }
    };
    
    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    const timer = setTimeout(calculateHeight, 100);
    
    return () => {
      window.removeEventListener('resize', calculateHeight);
      clearTimeout(timer);
    };
  }, [view]);
  
  // Estado para busca de CEP via ViaCEP
  const [cepValue, setCepValue] = useState("");
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      scheduledDate: moment().format("YYYY-MM-DD"),
      startTime: "09:00",
      endTime: "10:00",
      isMultiDay: false,
      endDate: "",
      status: "planejado",
      technicianId: "",
      clientId: "",
      clientName: "",
      activityTypeId: "",
      address: "",
      city: "",
      state: "",
      country: "Brasil",
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

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activity-types"],
    queryFn: async () => {
      const response = await fetch(`/api/activity-types`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('astec_token')}`
        },
      });
      if (!response.ok) {
        console.error(`[Agenda] Failed to fetch activity types: ${response.status}`);
        return [];
      }
      const data = await response.json();
      console.log(`[Agenda] Loaded ${data.length} activity types`);
      return data;
    },
  });

  const getMonthRange = (currentDate: Date) => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  };

  const { start: monthStart, end: monthEnd } = getMonthRange(date);

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
      });
      const response = await fetch(`/api/activities?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('astec_token')}`
        },
      });
      if (!response.ok) throw new Error('Failed to fetch activities');
      return response.json();
    },
  });

  const { data: clientsResponse } = useQuery<{ clients: Client[] }>({
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

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      // Combine date and start time to create full timestamp ISO string
      const scheduledDateTime = `${data.scheduledDate}T${data.startTime}:00`;
      
      const payload: Record<string, any> = {
        technicianId: data.technicianId,
        clientId: data.clientId || null,
        clientName: data.clientName,
        activityTypeId: data.activityTypeId,
        title: data.title,
        description: data.description || "",
        address: data.address || "",
        numero: data.numero || "",
        bairro: data.bairro || "",
        city: data.city || "",
        state: data.state || "",
        country: data.country || "Brasil",
        scheduledDate: scheduledDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        status: "planejado" as const,
      };
      if (data.isMultiDay && data.endDate) {
        payload.endDate = data.endDate;
      }
      
      const response = await apiRequest("POST", "/api/activities", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Atividade criada",
        description: "A atividade foi criada com sucesso.",
      });
      setDialogOpen(false);
      form.reset();
      setCepValue("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (activityId: string) => {
      await apiRequest("POST", `/api/activities/${activityId}/delete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setViewDialogOpen(false);
      setSelectedActivity(null);
      toast({
        title: "Atividade excluída",
        description: "A atividade foi excluída com sucesso.",
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof formSchema> }) => {
      const scheduledDateTime = `${data.scheduledDate}T${data.startTime}:00`;
      
      const payload: Record<string, any> = {
        technicianId: data.technicianId,
        clientId: data.clientId || null,
        clientName: data.clientName,
        activityTypeId: data.activityTypeId,
        title: data.title,
        description: data.description || "",
        address: data.address || "",
        numero: data.numero || "",
        bairro: data.bairro || "",
        city: data.city || "",
        state: data.state || "",
        country: data.country || "Brasil",
        scheduledDate: scheduledDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        status: data.status,
      };
      if (data.isMultiDay && data.endDate) {
        payload.endDate = data.endDate;
      } else {
        payload.endDate = null;
      }
      
      const response = await apiRequest("PUT", `/api/activities/${id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Atividade atualizada",
        description: "A atividade foi atualizada com sucesso.",
      });
      setDialogOpen(false);
      setSelectedActivity(null);
      form.reset();
      setCepValue("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [isEditing, setIsEditing] = useState(false);

  // Mutation for drag and drop updates with optimistic updates
  const moveEventMutation = useMutation({
    mutationFn: async ({ activity, start, end }: { activity: Activity; start: Date; end: Date }) => {
      const newDate = moment(start).format("YYYY-MM-DD");
      const newStartTime = moment(start).format("HH:mm");
      const newEndTime = moment(end).format("HH:mm");
      const scheduledDateTime = `${newDate}T${newStartTime}:00`;
      
      const payload = {
        technicianId: activity.technicianId,
        clientId: activity.clientId,
        clientName: activity.clientName,
        activityTypeId: activity.activityTypeId,
        description: activity.description || "",
        address: activity.address,
        numero: activity.numero || "",
        bairro: activity.bairro || "",
        city: activity.city,
        state: activity.state,
        country: activity.country,
        scheduledDate: scheduledDateTime,
        startTime: newStartTime,
        endTime: newEndTime,
        status: activity.status,
      };
      
      const response = await apiRequest("PUT", `/api/activities/${activity.id}`, payload);
      return response.json();
    },
    onMutate: async ({ activity, start, end }) => {
      // Cancela queries pendentes
      await queryClient.cancelQueries({ queryKey: ["/api/activities"] });
      
      // Snapshot do valor anterior
      const previousActivities = queryClient.getQueryData<Activity[]>(["/api/activities"]);
      
      // Atualização otimista
      queryClient.setQueryData<Activity[]>(["/api/activities"], (old) => {
        if (!old) return old;
        
        const newDate = moment(start).format("YYYY-MM-DD");
        const newStartTime = moment(start).format("HH:mm");
        const newEndTime = moment(end).format("HH:mm");
        const scheduledDateTime = `${newDate}T${newStartTime}:00`;
        
        return old.map((a) =>
          a.id === activity.id
            ? {
                ...a,
                scheduledDate: new Date(scheduledDateTime),
                startTime: newStartTime,
                endTime: newEndTime,
              }
            : a
        );
      });
      
      return { previousActivities };
    },
    onError: (error: Error, variables, context) => {
      // Reverte para o estado anterior em caso de erro
      if (context?.previousActivities) {
        queryClient.setQueryData(["/api/activities"], context.previousActivities);
      }
      toast({
        title: "Erro ao mover atividade",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Refetch para garantir sincronização com o servidor
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (isEditing && selectedActivity) {
      updateMutation.mutate({ id: selectedActivity.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Buscar técnico associado ao usuário logado
  const userTechnician = useMemo(() => {
    if (!user) return null;
    return technicians.find(tech => tech.userId === user.id);
  }, [user, technicians]);

  const events = useMemo<CalendarEvent[]>(() => {
    let filtered = activities;

    if (selectedUser === "my-calendar") {
      // Filtrar apenas atividades do técnico do usuário logado
      if (userTechnician) {
        filtered = filtered.filter((a) => a.technicianId === userTechnician.id);
      }
      // Se não tem técnico associado (admin sem técnico), mostrar todas as atividades
    } else if (selectedUser !== "all") {
      // Filtrar por técnico específico
      filtered = filtered.filter((a) => a.technicianId === selectedUser);
    }

    return filtered.map((activity) => {
      const scheduledDate = activity.scheduledDate as any;
      const dateStr = typeof scheduledDate === 'string' 
        ? scheduledDate.split('T')[0] 
        : moment(scheduledDate).format('YYYY-MM-DD');
      
      const activityEndDate = (activity as any).endDate;
      const endDateStr = activityEndDate 
        ? (typeof activityEndDate === 'string' 
            ? activityEndDate.split('T')[0] 
            : moment(activityEndDate).format('YYYY-MM-DD'))
        : dateStr;

      // Use moment to parse dates with proper timezone handling
      // Parse the date string in local timezone, not UTC
      const startDateTime = moment(`${dateStr} ${activity.startTime}`, 'YYYY-MM-DD HH:mm').toDate();
      const endDateTime = moment(`${endDateStr} ${activity.endTime}`, 'YYYY-MM-DD HH:mm').toDate();

      return {
        id: activity.id,
        title: activity.clientName || "Sem cliente",
        start: startDateTime,
        end: endDateTime,
        allDay: dateStr !== endDateStr,
        resource: activity,
      };
    });
  }, [activities, selectedUser, userTechnician]);

  // Auto-preencher technicianId quando o dialog abre (para assistentes)
  // Garante que o técnico seja preenchido mesmo que userTechnician carregue depois
  useEffect(() => {
    if (dialogOpen && !isEditing && user?.role === "assistente" && userTechnician) {
      const currentTechnicianId = form.getValues("technicianId");
      if (!currentTechnicianId) {
        form.setValue("technicianId", userTechnician.id, { 
          shouldValidate: false,
          shouldDirty: false,
          shouldTouch: false
        });
      }
    }
  }, [dialogOpen, isEditing, user, userTechnician, form]);

  // Define handleOpenNewActivityModal first, before functions that use it
  const handleOpenNewActivityModal = useCallback((initialDate?: string) => {
    const selectedDate = initialDate || moment().format("YYYY-MM-DD");
    setIsEditing(false);
    setSelectedActivity(null);
    
    // Se o usuário é assistente e tem técnico associado, preencher automaticamente
    const defaultTechnicianId = (user?.role === "assistente" && userTechnician) 
      ? userTechnician.id 
      : "";
    
    form.reset({
      title: "",
      description: "",
      scheduledDate: selectedDate,
      startTime: "09:00",
      endTime: "10:00",
      isMultiDay: false,
      endDate: "",
      status: "planejado",
      technicianId: defaultTechnicianId,
      clientName: "",
      address: "",
      city: "",
      state: "",
      country: "Brasil",
      clientId: "",
      activityTypeId: "",
      numero: "",
      bairro: "",
    });
    setDialogOpen(true);
  }, [form, user, userTechnician]);

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    // Armazena a data do slot para uso posterior (context menu)
    setLastSlotDate(slotInfo.start);
    
    // Se foi clique direito, não abre o modal (deixa o context menu aparecer)
    if (isRightClickRef.current) {
      isRightClickRef.current = false;
      return;
    }
    
    // Abre modal diretamente apenas com clique esquerdo
    const selectedDate = moment(slotInfo.start).format("YYYY-MM-DD");
    handleOpenNewActivityModal(selectedDate);
  }, [handleOpenNewActivityModal]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // Marca que foi clique direito para prevenir handleSelectSlot de abrir modal
    isRightClickRef.current = true;
    
    // Verifica se clicou em uma célula do calendário
    const target = e.target as HTMLElement;
    const calendarElement = target.closest('.rbc-calendar');
    if (!calendarElement) return;
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Aguarda um tick para que onSelectSlot seja processado e atualize lastSlotDate
    setTimeout(() => {
      setContextMenu({
        x: mouseX,
        y: mouseY,
        date: lastSlotDate,
      });
    }, 0);
  }, [lastSlotDate]);

  const handleOpenModalFromContext = useCallback(() => {
    if (!contextMenu) return;
    
    const selectedDate = moment(contextMenu.date).format("YYYY-MM-DD");
    handleOpenNewActivityModal(selectedDate);
    setContextMenu(null);
  }, [contextMenu, handleOpenNewActivityModal]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedActivity(event.resource);
    setViewDialogOpen(true);
    requestAnimationFrame(() => {
      const dialogContent = document.querySelector('[data-testid="dialog-activity-detail"]');
      if (dialogContent) {
        dialogContent.scrollTop = 0;
      }
    });
  }, []);

  const handleEditActivity = useCallback(() => {
    if (!selectedActivity) return;
    
    const scheduledDate = selectedActivity.scheduledDate as any;
    const dateStr = typeof scheduledDate === 'string'
      ? scheduledDate.split('T')[0]
      : new Date(scheduledDate).toISOString().split('T')[0];
    
    const rawEndDate = (selectedActivity as any).endDate;
    const hasEndDate = !!rawEndDate;
    const endDateStr = hasEndDate
      ? (typeof rawEndDate === 'string' ? rawEndDate.split('T')[0] : new Date(rawEndDate).toISOString().split('T')[0])
      : "";
    form.reset({
      title: selectedActivity.title || "",
      clientName: selectedActivity.clientName || "",
      description: selectedActivity.description || "",
      scheduledDate: dateStr,
      startTime: selectedActivity.startTime,
      endTime: selectedActivity.endTime,
      isMultiDay: hasEndDate,
      endDate: endDateStr,
      status: selectedActivity.status,
      technicianId: selectedActivity.technicianId,
      clientId: selectedActivity.clientId || "",
      activityTypeId: selectedActivity.activityTypeId,
      address: selectedActivity.address || "",
      numero: selectedActivity.numero || "",
      bairro: selectedActivity.bairro || "",
      city: selectedActivity.city || "",
      state: selectedActivity.state || "",
      country: selectedActivity.country || "Brasil",
    });
    
    setIsEditing(true);
    setViewDialogOpen(false);
    setDialogOpen(true);
  }, [selectedActivity, form]);

  // Handler para quando usuário arrasta e solta atividade
  const onEventDrop = useCallback(({ event, start, end }: any) => {
    moveEventMutation.mutate({
      activity: event.resource,
      start,
      end,
    });
  }, [moveEventMutation]);

  // Handler para quando usuário redimensiona atividade
  const onEventResize = useCallback(({ event, start, end }: any) => {
    moveEventMutation.mutate({
      activity: event.resource,
      start,
      end,
    });
  }, [moveEventMutation]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    return {
      style: {
        backgroundColor: "hsl(var(--muted))",
        borderRadius: "4px",
        color: "hsl(var(--foreground))",
        border: "1px solid hsl(var(--border))",
        display: "block",
        padding: "2px 4px",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)",
      },
    };
  }, []);

  const CustomEvent = ({ event }: { event: CalendarEvent }) => {
    const activity = event.resource;
    
    // Tentar pegar do objeto activity primeiro (já vem do backend)
    const activityTypeName = activity.activityType?.name || null;
    const activityTypeFromArray = activityTypes.find((t) => t.id === activity.activityTypeId);
    const color = activityTypeFromArray?.color || activity.activityType?.color || "#3b82f6";

    return (
      <div 
        className="flex flex-col gap-0.5 h-full w-full"
        data-testid={`calendar-event-${activity.id}`}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-medium truncate">{event.title}</span>
        </div>
        {activityTypeName && (
          <span className="text-[9px] text-muted-foreground/70 pl-3.5 font-semibold">
            {activityTypeName}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/70 pl-3.5">
          {activity.startTime} ~ {activity.endTime}
        </span>
      </div>
    );
  };

  const technicianUsers = useMemo(() => {
    // Allow both admin and assistente roles to have agenda, but only active technicians
    return users.filter((u) => (u.role === "assistente" || u.role === "admin") && technicians.some((t) => t.userId === u.id && t.isActive !== false));
  }, [users, technicians]);

  // Map users to technicians for the filter
  const technicianOptions = useMemo(() => {
    return technicianUsers.map((user) => {
      const technician = technicians.find((t) => t.userId === user.id);
      return {
        userId: user.id,
        technicianId: technician?.id || "",
        name: user.name,
      };
    }).filter((opt) => opt.technicianId);
  }, [technicianUsers, technicians]);

  // Limpa context menu quando view ou date mudam
  useEffect(() => {
    setContextMenu(null);
  }, [view, date]);

  return (
    <>
      <style>{`
        .rbc-event {
          transition: all 0.2s ease-in-out !important;
          cursor: move !important;
          cursor: grab !important;
        }
        .rbc-event:hover {
          transform: translateY(-2px) scale(1.02) !important;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15) !important;
          z-index: 10 !important;
        }
        
        /* Cursor durante o arrasto */
        .rbc-addons-dnd-dragging .rbc-event {
          cursor: grabbing !important;
        }
        
        /* Estilo do evento enquanto está sendo arrastado */
        .rbc-addons-dnd-dragging {
          opacity: 0.7 !important;
          transform: scale(1.05) !important;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3), 0 4px 8px rgba(0, 0, 0, 0.2) !important;
          z-index: 1000 !important;
          transition: all 0.1s ease-out !important;
        }
        
        /* Feedback visual do slot de destino durante o arrasto */
        .rbc-addons-dnd-over {
          background-color: hsl(var(--primary) / 0.1) !important;
          border: 2px dashed hsl(var(--primary) / 0.4) !important;
          transition: all 0.2s ease-in-out !important;
        }
        
        /* Estilo da área de redimensionamento */
        .rbc-addons-dnd-resize-ns-anchor {
          cursor: ns-resize !important;
        }
        
        .rbc-addons-dnd-resize-ew-anchor {
          cursor: ew-resize !important;
        }
        
        /* Animação suave ao soltar */
        .rbc-event {
          will-change: transform, box-shadow !important;
        }
        
        /* Hover nos dias do calendário */
        .rbc-day-bg {
          transition: background-color 0.15s ease-in-out !important;
        }
        .rbc-day-bg:hover {
          background-color: hsl(var(--muted) / 0.5) !important;
        }
        .rbc-off-range-bg:hover {
          background-color: hsl(var(--muted) / 0.3) !important;
        }

        /* Customização da view Agenda (lista) */
        .rbc-agenda-view {
          padding: 0 !important;
        }
        .rbc-agenda-table {
          border-spacing: 0 !important;
        }
        .rbc-agenda-content {
          padding: 0 !important;
        }
        /* Reduz espaçamento entre atividades na listagem */
        .rbc-agenda-event-cell,
        .rbc-agenda-date-cell,
        .rbc-agenda-time-cell {
          padding: 6px 12px !important;
          line-height: 1.4 !important;
        }
        .rbc-agenda-event-cell {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
        
        /* Botão flutuante de adicionar */
        @keyframes popIn {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.1);
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
        }
        .add-button-float {
          animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        /* Otimizações para mobile/PWA */
        @media (max-width: 768px) {
          /* Reduzir padding do header do calendário */
          .rbc-toolbar {
            padding: 8px 4px !important;
            flex-wrap: wrap !important;
          }
          
          /* Reduzir tamanho dos textos */
          .rbc-toolbar-label {
            font-size: 14px !important;
            font-weight: 600 !important;
          }
          
          .rbc-btn-group button {
            padding: 4px 8px !important;
            font-size: 12px !important;
          }
          
          /* Otimizar células do calendário */
          .rbc-month-view .rbc-header {
            padding: 4px 2px !important;
            font-size: 11px !important;
          }
          
          .rbc-date-cell {
            padding: 2px !important;
            font-size: 12px !important;
          }
          
          /* Melhorar visualização de eventos */
          .rbc-event {
            padding: 2px 4px !important;
            font-size: 11px !important;
          }
          
          .rbc-event-label {
            font-size: 10px !important;
          }
          
          /* View Agenda (lista) mais compacta */
          .rbc-agenda-view table.rbc-agenda-table {
            font-size: 13px !important;
          }
          
          .rbc-agenda-date-cell,
          .rbc-agenda-time-cell {
            padding: 8px 6px !important;
            font-size: 12px !important;
          }
          
          .rbc-agenda-event-cell {
            padding: 8px 6px !important;
          }
          
          /* Aumentar área clicável dos botões */
          .rbc-btn-group button {
            min-height: 36px !important;
          }
        }
        
        /* Garantir que todas as semanas do mês sejam visíveis */
        .calendar-container {
          overflow: visible !important;
          display: flex;
          flex-direction: column;
        }
        
        .calendar-container .rbc-calendar {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .calendar-container .rbc-month-view {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .calendar-container .rbc-month-header {
          flex-shrink: 0;
        }
        
        .calendar-container .rbc-month-row {
          flex: 1;
          min-height: 0;
        }
      `}</style>
      <div className="flex flex-col" data-testid="page-calendar">
        <Card ref={calendarCardRef} className="flex flex-col" style={{ minHeight: `${calendarHeight}px` }}>
        <div className="p-2 border-b flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDate(moment(date).subtract(1, view === "day" ? "day" : view === "week" ? "week" : "month").toDate())}
              data-testid="button-nav-previous"
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDate(new Date())}
              data-testid="button-nav-today"
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDate(moment(date).add(1, view === "day" ? "day" : view === "week" ? "week" : "month").toDate())}
              data-testid="button-nav-next"
              title="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <CalendarIcon className="w-4 h-4 text-muted-foreground ml-1" />
            <h2 className="text-base font-semibold">
              {moment(date).format("MMMM YYYY")}
            </h2>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-[160px] h-8" data-testid="select-user-filter">
                <Users className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="my-calendar" data-testid="option-my-calendar">
                  Meu Calendário
                </SelectItem>
                {user?.role === "admin" && (
                  <>
                    <SelectItem value="all" data-testid="option-all-technicians">
                      Todos os Técnicos
                    </SelectItem>
                    {technicianOptions.map((opt) => (
                      <SelectItem key={opt.technicianId} value={opt.technicianId}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <Button
                variant={view === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("day")}
                data-testid="button-view-day"
              >
                Dia
              </Button>
              <Button
                variant={view === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("week")}
                data-testid="button-view-week"
              >
                Semana
              </Button>
              <Button
                variant={view === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("month")}
                data-testid="button-view-month"
              >
                Mês
              </Button>
            </div>
            
            <Button size="sm" onClick={() => handleOpenNewActivityModal()} data-testid="button-new-activity">
              <Plus className="w-4 h-4 mr-1" />
              Nova Atividade
            </Button>
          </div>
        </div>

        <div className="flex-1 p-2">
          <div 
            className="calendar-container h-full" 
            style={{ minHeight: `${calendarHeight - 60}px` }}
            onContextMenu={handleContextMenu}
          >
            <DragAndDropCalendar
              localizer={localizer}
              events={events as any}
              startAccessor={(event: any) => event.start}
              endAccessor={(event: any) => event.end}
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent as any}
              onDoubleClickEvent={handleSelectEvent as any}
              onEventDrop={onEventDrop}
              onEventResize={onEventResize}
              eventPropGetter={eventStyleGetter as any}
              components={{
                event: CustomEvent as any,
              }}
              messages={messages}
              formats={formats}
              culture="pt-BR"
              selectable
              popup
              showAllEvents={true}
              draggableAccessor={() => true}
              resizable
              drilldownView={null}
              style={{ height: "100%" }}
            />
          </div>
        </div>
      </Card>

      {/* Context Menu (clique direito) */}
      {contextMenu && (
        <>
          {/* Overlay para fechar ao clicar fora */}
          <div 
            className="fixed inset-0 z-40"
            onClick={handleCloseContextMenu}
            data-testid="overlay-close-context-menu"
          />
          
          {/* Menu de contexto */}
          <Card
            className="fixed z-50 p-1 min-w-[200px] shadow-lg"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
            data-testid="context-menu"
          >
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 hover-elevate"
              onClick={handleOpenModalFromContext}
              data-testid="context-menu-add-activity"
            >
              <Plus className="w-4 h-4" />
              Adicionar Atividade
            </Button>
          </Card>
        </>
      )}

      {/* Categorias - Oculto para assistente e admin */}
      {user?.role !== "assistente" && user?.role !== "admin" && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Categorias:</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge className="bg-emerald-500 hover:bg-emerald-600">
                Efetivo
              </Badge>
              <Badge className="bg-yellow-500 hover:bg-yellow-600">
                Adicional
              </Badge>
              <Badge className="bg-red-500 hover:bg-red-600">
                Perda
              </Badge>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Edite as informações da atividade" : "Crie uma nova atividade para um técnico"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Campo Técnico - Input desabilitado para assistentes, Select para admin */}
                {user?.role === "assistente" ? (
                  <div className="space-y-2">
                    <FormLabel>Técnico</FormLabel>
                    <Input
                      value={userTechnician?.name || "Carregando..."}
                      disabled
                      className="bg-muted"
                      data-testid="input-technician"
                    />
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="technicianId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Técnico</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-technician">
                              <SelectValue placeholder="Selecione um técnico" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {technicians.map((tech) => (
                              <SelectItem key={tech.id} value={tech.id}>
                                {tech.userId ? users.find(u => u.id === tech.userId)?.name : tech.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => {
                    const [open, setOpen] = useState(false);
                    
                    const handleSelectClient = async (clientName: string) => {
                      field.onChange(clientName);
                      setOpen(false);
                      
                      // Auto-preencher endereço quando cliente é selecionado
                      const selectedClient = clients.find(c => c.companyName === clientName);
                      if (selectedClient) {
                        form.setValue('clientId', selectedClient.id);
                        // Preencher endereço completo do cliente
                        form.setValue('address', selectedClient.address || '');
                        form.setValue('numero', selectedClient.numero || '');
                        form.setValue('bairro', selectedClient.bairro || '');
                        form.setValue('city', selectedClient.city || '');
                        form.setValue('state', selectedClient.state || '');
                        if (!form.getValues('country')) {
                          form.setValue('country', selectedClient.country || 'Brasil');
                        }
                      } else {
                        form.setValue('clientId', '');
                      }
                    };

                    return (
                      <FormItem className="flex flex-col relative">
                        <FormLabel>Cliente</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Digite para buscar cliente..."
                            value={field.value || ""}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              setOpen(true);
                            }}
                            onFocus={() => {
                              if (field.value && field.value.length > 0) {
                                setOpen(true);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => setOpen(false), 200);
                            }}
                            data-testid="input-client-name"
                          />
                        </FormControl>
                        {open && field.value && field.value.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 max-h-64 overflow-y-auto">
                            {clients.filter((client) => 
                              client.companyName.toLowerCase().includes((field.value || "").toLowerCase())
                            ).length === 0 ? (
                              <div className="p-4 text-sm text-muted-foreground text-center">
                                {field.value ? `Nenhum cliente encontrado para "${field.value}"` : 'Nenhum cliente cadastrado'}
                              </div>
                            ) : (
                              <div className="p-2">
                                {clients
                                  .filter((client) => 
                                    client.companyName.toLowerCase().includes((field.value || "").toLowerCase())
                                  )
                                  .map((client) => (
                                    <div
                                      key={client.id}
                                      className="px-3 py-2 hover:bg-accent rounded-sm cursor-pointer"
                                      onClick={() => handleSelectClient(client.companyName)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Check
                                          className={cn(
                                            "h-4 w-4 shrink-0",
                                            field.value === client.companyName ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col flex-1">
                                          <span className="font-medium">{client.companyName}</span>
                                          {client.address && (
                                            <span className="text-xs text-muted-foreground">
                                              {client.address}, {client.city}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              {/* Título */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
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

              {/* Tipo de Atividade */}
              <ActivityTypeSelector form={form} activityTypes={activityTypes} />

              {/* CEP com busca automática */}
              <div className="space-y-2">
                <FormLabel>CEP</FormLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder="00000-000"
                    value={cepValue}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, "");
                      if (value.length > 8) value = value.slice(0, 8);
                      if (value.length > 5) {
                        value = value.slice(0, 5) + "-" + value.slice(5);
                      }
                      setCepValue(value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCepSearch(cepValue);
                      }
                    }}
                    className="flex-1"
                    data-testid="input-cep"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCepSearch(cepValue)}
                    disabled={isLoadingCep || cepValue.replace(/\D/g, "").length !== 8}
                    data-testid="button-search-cep"
                  >
                    {isLoadingCep ? (
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

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço (Rua/Logradouro)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Rua das Flores" {...field} value={field.value || ""} data-testid="input-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número</FormLabel>
                      <FormControl>
                        <Input placeholder="123" {...field} value={field.value || ""} data-testid="input-numero" />
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
                        <Input placeholder="Centro" {...field} value={field.value || ""} data-testid="input-bairro" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="São Paulo" {...field} value={field.value || ""} data-testid="input-city" />
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
                        <Input placeholder="SP" {...field} value={field.value || ""} data-testid="input-state" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>País</FormLabel>
                      <FormControl>
                        <Input placeholder="Brasil" {...field} value={field.value || ""} data-testid="input-country" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DateTimeFields form={form} showMultiDay={true} />

              <DescriptionField form={form} />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setCepValue("");
                  }}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {isEditing 
                    ? (updateMutation.isPending ? "Salvando..." : "Salvar Alterações")
                    : (createMutation.isPending ? "Criando..." : "Criar Atividade")
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Activity Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-xl lg:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-activity-detail">
          <DialogHeader>
            <DialogTitle className="text-xl">Detalhes da Atividade</DialogTitle>
            <DialogDescription>
              Visualize as informações completas da atividade
            </DialogDescription>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-4">
              {/* Técnico e Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Técnico</p>
                    <p className="text-sm font-medium">
                      {technicians.find((t) => t.id === selectedActivity.technicianId)?.name || "N/A"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Cliente</p>
                    <p className="text-sm font-medium truncate">
                      {clients.find((c) => c.id === selectedActivity.clientId)?.companyName || "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tipo de Atividade - Destaque */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  {(() => {
                    const activityType = activityTypes.find((t) => t.id === selectedActivity.activityTypeId);
                    const color = activityType?.color || "#3b82f6";
                    return (
                      <>
                        <div 
                          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: color + '20' }}
                        >
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Tipo de Atividade</p>
                          <p className="text-base font-semibold">{activityType?.name || "N/A"}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Cliente */}
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Cliente</p>
                  <p className="text-base font-medium">{selectedActivity.clientName || "Não informado"}</p>
                </div>
              </div>

              {/* Contato do Cliente */}
              {(selectedActivity as any).client && ((selectedActivity as any).client.contactName || (selectedActivity as any).client.contactPhone || (selectedActivity as any).client.contactEmail) && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Informações de Contato</p>
                  <ActivityClientContact
                    contactName={(selectedActivity as any).client.contactName}
                    contactPhone={(selectedActivity as any).client.contactPhone}
                    contactEmail={(selectedActivity as any).client.contactEmail}
                    variant="expanded"
                  />
                </div>
              )}

              {/* Localização */}
              {(selectedActivity.address || selectedActivity.city || selectedActivity.state || selectedActivity.country) && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">Localização</p>
                  </div>
                  <div className="space-y-2">
                    {selectedActivity.address && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Endereço</p>
                        <p className="text-sm font-medium">{selectedActivity.address}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedActivity.city && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Cidade</p>
                          <p className="text-sm font-medium">{selectedActivity.city}</p>
                        </div>
                      )}
                      {selectedActivity.state && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Estado</p>
                          <p className="text-sm font-medium">{selectedActivity.state}</p>
                        </div>
                      )}
                    </div>
                    {selectedActivity.country && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">País</p>
                        <p className="text-sm font-medium">{selectedActivity.country}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Descrição */}
              {selectedActivity.description && (
                <div className="flex items-start gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                    <p className="text-sm text-muted-foreground">{selectedActivity.description}</p>
                  </div>
                </div>
              )}

              {/* Data e Horários */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Agendamento</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Data</p>
                    <p className="text-sm font-medium">
                      {new Date(selectedActivity.scheduledDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Início</p>
                    <p className="text-sm font-medium">{selectedActivity.startTime}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Fim</p>
                    <p className="text-sm font-medium">{selectedActivity.endTime}</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-sm font-medium text-muted-foreground">Status da Atividade</p>
                <Badge 
                  className="text-xs px-3 py-1 font-semibold"
                  style={{
                    backgroundColor: 
                      selectedActivity.status === "planejado" ? "#f4f4f5" :
                      selectedActivity.status === "aCaminho" ? "#fef3c7" :
                      selectedActivity.status === "emExecucao" ? "#dbeafe" :
                      selectedActivity.status === "concluido" ? "#d1fae5" :
                      selectedActivity.status === "reprovado" ? "#fee2e2" :
                      "#f3f4f6",
                    color:
                      selectedActivity.status === "planejado" ? "#71717a" :
                      selectedActivity.status === "aCaminho" ? "#f59e0b" :
                      selectedActivity.status === "emExecucao" ? "#3b82f6" :
                      selectedActivity.status === "concluido" ? "#10b981" :
                      selectedActivity.status === "reprovado" ? "#ef4444" :
                      "#6b7280",
                  }}
                >
                  {selectedActivity.status === "planejado" ? "Planejado" :
                   selectedActivity.status === "aCaminho" ? "A Caminho" :
                   selectedActivity.status === "emExecucao" ? "Em Execução" :
                   selectedActivity.status === "concluido" ? "Concluído" :
                   selectedActivity.status === "reprovado" ? "Reprovado" :
                   "Cancelado"}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4 flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (selectedActivity && confirm("Tem certeza que deseja excluir esta atividade?")) {
                  deleteMutation.mutate(selectedActivity.id);
                  setViewDialogOpen(false);
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-activity"
            >
              <X className="w-4 h-4 mr-2" />
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-initial"
                onClick={() => setViewDialogOpen(false)}
                data-testid="button-close-view"
              >
                Fechar
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-initial"
                onClick={handleEditActivity}
                data-testid="button-edit-activity"
              >
                Editar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}
