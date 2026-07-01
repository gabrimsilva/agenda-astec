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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Filter, Calendar as CalendarIcon, Plus, User as UserIcon, Building2, FileText, Clock, MapPin, X, Search, BarChart3, Copy, CheckCircle, Edit, Check, ChevronsUpDown, Loader2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
import { ActivityTypeSelector, DateTimeFields, DescriptionField, ActivityLocationSelector, getActivityTypeLocations } from "@/components/activities/ActivityFormFields";
import { RescheduleModal } from "@/components/RescheduleModal";
import { DatasulClientField } from "@/components/activities/DatasulClientField";

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
  start: Date;
  end: Date;
  resource?: Activity;
  isGhost?: boolean; // For rescheduled activities ghost events
  ghostInfo?: {
    newDate: string;
    newStartTime: string;
    reason: string;
  };
  isBlock?: boolean; // Bloqueio de agenda (férias / compromisso)
  blockInfo?: {
    blockType: "ferias" | "compromisso";
    description: string | null;
    technicianId: string;
    startTime?: string | null;
    endTime?: string | null;
    startDateStr?: string;
    endDateStr?: string;
  };
}

interface RescheduleGhost {
  id: string;
  activityId: string;
  previousDate: string;
  previousStartTime: string;
  previousEndTime: string;
  newDate: string;
  newStartTime: string;
  newEndTime: string;
  reason: string;
  rescheduleNumber: number;
  activityTitle: string;
  activityClientName: string;
  activityTechnicianId: string;
  activityStatus: string;
}

const formSchema = z.object({
  technicianId: z.string().min(1, "Técnico é obrigatório"),
  clientId: z.string().optional(),
  clientName: z.string().min(1, "Cliente é obrigatório"),
  siteId: z.string().optional().nullable(),
  activityTypeId: z.string().min(1, "Tipo de atividade é obrigatório"),
  location: z.string().optional().nullable(),
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
  
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<string>("my-calendar");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [dragRescheduleData, setDragRescheduleData] = useState<{ activity: Activity; start: Date; end: Date } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    date: Date;
    event?: CalendarEvent;
  } | null>(null);
  const [lastSlotDate, setLastSlotDate] = useState<Date>(new Date());
  const isRightClickRef = useRef(false);
  
  // Estado para hora atual (atualizado a cada minuto) - para indicador de hora atual
  const [currentTime, setCurrentTime] = useState(new Date());
  const timeScrollRef = useRef<boolean>(false); // Flag para evitar múltiplos scrolls
  
  // Estado para tooltip ativo (ID da atividade + posição)
  const [activeTooltipEventId, setActiveTooltipEventId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number; showBelow?: boolean } | null>(null);
  const tooltipOpenedAtRef = useRef<number>(0);
  
  // Filtros avançados
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [periodFilter, setPeriodFilter] = useState<string>("todos");
  const [showFilters, setShowFilters] = useState(false);
  
  // Atualizar hora atual a cada minuto para mover o indicador de tempo
  useEffect(() => {
    // Atualizar imediatamente
    setCurrentTime(new Date());
    
    // Configurar intervalo para atualizar a cada minuto
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // 60 segundos
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Scroll automático para a hora atual quando entrar na visão semanal/dia
  const scrollToCurrentTime = useCallback(() => {
    // Retorna um ID do timeout para cancelamento se necessário
    const timeoutId = setTimeout(() => {
      const timeContent = document.querySelector('.rbc-time-content');
      if (!timeContent) return;
      
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      // Calcular posição: cada hora tem slots de 30min
      // O calendário começa às 00:00 e vai até 23:59
      // Altura de cada slot é aproximadamente ~40px (depende do CSS)
      const timeSlots = timeContent.querySelectorAll('.rbc-timeslot-group');
      if (timeSlots.length === 0) return;
      
      // Calcular altura total e posição proporcional
      const totalHeight = timeContent.scrollHeight;
      const hoursInDay = 24;
      const currentTimeInHours = hours + (minutes / 60);
      const scrollPosition = (currentTimeInHours / hoursInDay) * totalHeight;
      
      // Centralizar a linha de hora atual na viewport
      const containerHeight = timeContent.clientHeight;
      const targetScroll = Math.max(0, scrollPosition - (containerHeight / 2));
      
      timeContent.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }, 100);
    
    return timeoutId;
  }, []);
  
  // Executar scroll quando mudar para visão semanal/dia ou quando mudar a data
  useEffect(() => {
    let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let resetTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    if (view === 'week' || view === 'day') {
      // Verificar se a semana/dia atual contém o dia de hoje
      const today = new Date();
      const startOfWeek = moment(date).startOf('week').toDate();
      const endOfWeek = moment(date).endOf('week').toDate();
      
      const isCurrentWeek = today >= startOfWeek && today <= endOfWeek;
      const isToday = view === 'day' && moment(date).isSame(today, 'day');
      
      if (isCurrentWeek || isToday) {
        // Delay para garantir que o calendário foi renderizado
        if (!timeScrollRef.current) {
          timeScrollRef.current = true;
          scrollTimeoutId = scrollToCurrentTime();
          // Reset flag após animação
          resetTimeoutId = setTimeout(() => {
            timeScrollRef.current = false;
          }, 1000);
        }
      }
    }
    
    // Cleanup: cancelar timeouts pendentes ao desmontar ou mudar dependências
    return () => {
      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
      if (resetTimeoutId) clearTimeout(resetTimeoutId);
    };
  }, [view, date, scrollToCurrentTime]);
  
  // Handler para o botão "Hoje" - navegar e fazer scroll
  const handleTodayClick = useCallback(() => {
    // Reset a flag para permitir novo scroll
    timeScrollRef.current = false;
    setDate(new Date());
    // Se estiver na visão semanal/dia, fazer scroll para hora atual
    if (view === 'week' || view === 'day') {
      // Delay para garantir que a navegação foi aplicada
      setTimeout(() => {
        scrollToCurrentTime();
      }, 150);
    }
  }, [view, scrollToCurrentTime]);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Estado para busca de CEP via ViaCEP
  const [cepValue, setCepValue] = useState("");
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      clientName: "",
      description: "",
      scheduledDate: moment().format("YYYY-MM-DD"),
      startTime: "09:00",
      endTime: "10:00",
      status: "planejado",
      technicianId: "",
      clientId: "",
      activityTypeId: "",
      address: "",
      numero: "",
      bairro: "",
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
        description: `${data.logradouro} - ${data.localidade}/${data.uf}`,
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
    staleTime: 0, // Sempre considera dados como "stale" para forçar refetch ao mudar de mês
  });

  // Fetch reschedule ghost events for the calendar
  const { data: rescheduleGhosts = [] } = useQuery<RescheduleGhost[]>({
    queryKey: ["/api/reschedules/calendar-ghosts", monthStart.toISOString(), monthEnd.toISOString(), selectedUser],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
      });
      if (selectedUser && selectedUser !== "all" && selectedUser !== "my-calendar") {
        params.append("technicianId", selectedUser);
      }
      const response = await fetch(`/api/reschedules/calendar-ghosts?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('astec_token')}`
        },
      });
      if (!response.ok) throw new Error('Failed to fetch reschedule ghosts');
      return response.json();
    },
    staleTime: 0,
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

  // Bloqueios de agenda (férias / compromissos) do mês visível
  const { data: agendaBlocks = [] } = useQuery<any[]>({
    queryKey: ["/api/agenda-blocks", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
      });
      const response = await fetch(`/api/agenda-blocks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("astec_token")}` },
      });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 0,
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      // Combine date and start time to create full timestamp ISO string
      const scheduledDateTime = `${data.scheduledDate}T${data.startTime}:00`;
      
      // Para atividades multi-dia, criar endDate timestamp
      const endDateTime = data.isMultiDay && data.endDate 
        ? `${data.endDate}T${data.endTime}:00` 
        : null;
      
      const payload = {
        technicianId: data.technicianId,
        clientId: data.clientId || null,
        clientName: data.clientName,
        siteId: data.siteId || null,
        activityTypeId: data.activityTypeId,
        title: data.title,
        description: data.description || "",
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        country: data.country || null,
        scheduledDate: scheduledDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        endDate: endDateTime,
        location: data.location || null,
        status: "planejado" as const,
      };

      // Cria via fetch para detectar bloqueio de agenda (409 AGENDA_BLOCK).
      const token = localStorage.getItem("astec_token");
      const postActivity = async (body: any) =>
        fetch("/api/activities", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });

      // Bloqueio de agenda (férias / compromisso): bloqueio rígido — o servidor
      // barra e o front apenas exibe o aviso, sem opção de forçar.
      const response = await postActivity(payload);
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.error || "Erro ao criar atividade");
      }
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
      if (error.message === "__CANCELLED__") return; // usuário cancelou no aviso de bloqueio
      toast({
        title: "Erro ao criar atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (activityId: string) => {
      await apiRequest("DELETE", `/api/activities/${activityId}`);
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

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { newDate: string; newStartTime: string; newEndTime: string; reason: string } }) => {
      const res = await apiRequest("POST", `/api/activities/${id}/reschedule`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reschedules/calendar-ghosts"] });
      setRescheduleModalOpen(false);
      setViewDialogOpen(false);
      setSelectedActivity(null);
      setDragRescheduleData(null);
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof formSchema> }) => {
      const scheduledDateTime = `${data.scheduledDate}T${data.startTime}:00`;
      
      // Para atividades multi-dia, criar endDate timestamp
      const endDateTime = data.isMultiDay && data.endDate 
        ? `${data.endDate}T${data.endTime}:00` 
        : null;
      
      const payload = {
        technicianId: data.technicianId,
        clientId: data.clientId || null,
        clientName: data.clientName,
        siteId: data.siteId || null,
        activityTypeId: data.activityTypeId,
        title: data.title,
        description: data.description || "",
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        country: data.country || null,
        scheduledDate: scheduledDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        endDate: endDateTime,
        location: data.location || null,
        status: data.status,
      };
      
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
        clientId: activity.clientId || null,
        clientName: activity.clientName,
        siteId: activity.siteId || null,
        activityTypeId: activity.activityTypeId,
        description: activity.description || "",
        address: activity.address || null,
        city: activity.city || null,
        state: activity.state || null,
        country: activity.country || null,
        scheduledDate: scheduledDateTime,
        startTime: newStartTime,
        endTime: newEndTime,
        location: (activity as any).location ?? null,
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
                scheduledDate: new Date(scheduledDateTime) as any,
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
    // "Executado em" é obrigatório quando o tipo de atividade possui locais configurados
    const locs = getActivityTypeLocations(activityTypes, data.activityTypeId);
    if (locs.length > 0 && !(data.location && data.location.trim())) {
      form.setError("location", { type: "manual", message: "Local de execução é obrigatório" });
      return;
    }
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

  // Cálculo de métricas de produtividade
  const productivityMetrics = useMemo(() => {
    let filteredActivities = activities;
    
    // Aplicar os mesmos filtros que nos eventos
    if (selectedUser === "my-calendar") {
      if (userTechnician) {
        filteredActivities = filteredActivities.filter((a) => a.technicianId === userTechnician.id);
      } else {
        filteredActivities = [];
      }
    } else if (selectedUser !== "all") {
      filteredActivities = filteredActivities.filter((a) => a.technicianId === selectedUser);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredActivities = filteredActivities.filter((activity) => {
        const clientNameMatch = (activity.clientName || "").toLowerCase().includes(query);
        const descriptionMatch = (activity.description || "").toLowerCase().includes(query);
        const client = clients.find((c) => c.id === activity.clientId);
        const clientMatch = client?.companyName.toLowerCase().includes(query) || false;
        return clientNameMatch || descriptionMatch || clientMatch;
      });
    }

    if (statusFilter !== "todos") {
      filteredActivities = filteredActivities.filter((a) => a.status === statusFilter);
    }

    if (typeFilter !== "todos") {
      filteredActivities = filteredActivities.filter((a) => a.activityTypeId === typeFilter);
    }

    if (periodFilter !== "todos") {
      const now = moment();
      filteredActivities = filteredActivities.filter((activity) => {
        const activityDate = moment(activity.scheduledDate);
        switch (periodFilter) {
          case "hoje":
            return activityDate.isSame(now, "day");
          case "semana":
            return activityDate.isSame(now, "week");
          case "mes":
            return activityDate.isSame(now, "month");
          default:
            return true;
        }
      });
    }

    // Calcular total de horas por categoria
    const hoursByCategory: Record<string, number> = {
      Efetivo: 0,
      Adicional: 0,
      Perda: 0,
    };

    // Contador por status
    const countByStatus: Record<string, number> = {
      planejado: 0,
      emExecucao: 0,
      concluido: 0,
      reprovado: 0,
      cancelado: 0,
    };

    filteredActivities.forEach((activity) => {
      // Calcular duração em horas
      const [startHour, startMin] = activity.startTime.split(":").map(Number);
      const [endHour, endMin] = activity.endTime.split(":").map(Number);
      const durationHours = (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60;

      // Encontrar categoria do tipo de atividade
      const activityType = activityTypes.find((t) => t.id === activity.activityTypeId);
      const category = activityType?.category || "Efetivo";
      
      if (hoursByCategory[category] !== undefined) {
        hoursByCategory[category] += durationHours;
      }

      // Contar por status
      if (countByStatus[activity.status] !== undefined) {
        countByStatus[activity.status]++;
      }
    });

    const totalActivities = filteredActivities.length;
    const completedActivities = countByStatus.concluido;
    const completionPercentage = totalActivities > 0 
      ? Math.round((completedActivities / totalActivities) * 100) 
      : 0;

    return {
      hoursByCategory,
      countByStatus,
      totalActivities,
      completedActivities,
      completionPercentage,
    };
  }, [activities, selectedUser, userTechnician, searchQuery, statusFilter, typeFilter, periodFilter, clients, activityTypes]);

  const events = useMemo<CalendarEvent[]>(() => {
    let filtered = activities;

    if (selectedUser === "my-calendar") {
      // Filtrar apenas atividades do técnico do usuário logado
      if (userTechnician) {
        filtered = filtered.filter((a) => a.technicianId === userTechnician.id);
      } else {
        filtered = [];
      }
    } else if (selectedUser !== "all") {
      // Filtrar por técnico específico
      filtered = filtered.filter((a) => a.technicianId === selectedUser);
    }

    // Filtro de busca rápida (cliente, descrição)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((activity) => {
        const clientNameMatch = (activity.clientName || "").toLowerCase().includes(query);
        const descriptionMatch = (activity.description || "").toLowerCase().includes(query);
        const client = clients.find((c) => c.id === activity.clientId);
        const clientMatch = client?.companyName.toLowerCase().includes(query) || false;
        return clientNameMatch || descriptionMatch || clientMatch;
      });
    }

    // Filtro por status
    if (statusFilter !== "todos") {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }

    // Filtro por tipo de atividade
    if (typeFilter !== "todos") {
      filtered = filtered.filter((a) => a.activityTypeId === typeFilter);
    }

    // Filtro por período
    if (periodFilter !== "todos") {
      const now = moment();
      filtered = filtered.filter((activity) => {
        const activityDate = moment(activity.scheduledDate);
        switch (periodFilter) {
          case "hoje":
            return activityDate.isSame(now, "day");
          case "semana":
            return activityDate.isSame(now, "week");
          case "mes":
            return activityDate.isSame(now, "month");
          default:
            return true;
        }
      });
    }

    const regularEvents = filtered.map((activity) => {
      // scheduledDate, startTime, endTime come as strings from API
      const scheduledDate = activity.scheduledDate as any;
      const dateStr = typeof scheduledDate === 'string' 
        ? scheduledDate.split('T')[0] 
        : new Date(scheduledDate).toISOString().split('T')[0];
      
      // Para atividades multi-dia, usar endDate para a data final
      const activityEndDate = (activity as any).endDate;
      const endDateStr = activityEndDate 
        ? (typeof activityEndDate === 'string' 
            ? activityEndDate.split('T')[0] 
            : new Date(activityEndDate).toISOString().split('T')[0])
        : dateStr;
      
      const startDateTime = new Date(`${dateStr}T${activity.startTime}`);
      const endDateTime = new Date(`${endDateStr}T${activity.endTime}`);

      return {
        id: activity.id,
        start: startDateTime,
        end: endDateTime,
        resource: activity,
        allDay: dateStr !== endDateStr, // Marcar como allDay para eventos multi-dia
      };
    });

    // Create ghost events from reschedule history
    let ghostEvents: CalendarEvent[] = [];
    if (rescheduleGhosts.length > 0) {
      // Filter ghosts by selected user if needed
      let filteredGhosts = rescheduleGhosts;
      if (selectedUser === "my-calendar" && userTechnician) {
        filteredGhosts = rescheduleGhosts.filter(g => g.activityTechnicianId === userTechnician.id);
      } else if (selectedUser !== "all" && selectedUser !== "my-calendar") {
        filteredGhosts = rescheduleGhosts.filter(g => g.activityTechnicianId === selectedUser);
      }

      ghostEvents = filteredGhosts.map((ghost) => {
        const previousDateStr = typeof ghost.previousDate === 'string'
          ? ghost.previousDate.split('T')[0]
          : new Date(ghost.previousDate).toISOString().split('T')[0];
        const newDateStr = typeof ghost.newDate === 'string'
          ? ghost.newDate.split('T')[0]
          : new Date(ghost.newDate).toISOString().split('T')[0];

        const startDateTime = new Date(`${previousDateStr}T${ghost.previousStartTime}`);
        const endDateTime = new Date(`${previousDateStr}T${ghost.previousEndTime}`);

        // Create a "ghost" activity for display purposes
        const ghostActivity: Activity = {
          id: `ghost-${ghost.id}`,
          technicianId: ghost.activityTechnicianId,
          clientId: null,
          clientName: ghost.activityClientName,
          title: ghost.activityTitle,
          description: `Reagendado para ${newDateStr} - ${ghost.reason}`,
          activityTypeId: "",
          scheduledDate: new Date(previousDateStr),
          startTime: ghost.previousStartTime,
          endTime: ghost.previousEndTime,
          status: "cancelado" as any, // Ghost events show as cancelled style
          rescheduleCount: 0,
          address: null,
          city: null,
          state: null,
          country: null,
          notes: null,
          checkInTime: null,
          checkOutTime: null,
          checkInLatitude: null,
          checkInLongitude: null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          actualDurationMinutes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Activity;

        return {
          id: `ghost-${ghost.id}`,
          start: startDateTime,
          end: endDateTime,
          resource: ghostActivity,
          isGhost: true,
          ghostInfo: {
            newDate: newDateStr,
            newStartTime: ghost.newStartTime,
            reason: ghost.reason,
          },
        };
      });
    }

    // Bloqueios de agenda (férias / compromisso) como eventos visuais
    let blockEvents: CalendarEvent[] = [];
    {
      let fb = agendaBlocks;
      if (selectedUser === "my-calendar" && userTechnician) {
        fb = agendaBlocks.filter((b) => b.technicianId === userTechnician.id);
      } else if (selectedUser !== "all" && selectedUser !== "my-calendar") {
        fb = agendaBlocks.filter((b) => b.technicianId === selectedUser);
      }
      blockEvents = fb.map((b) => {
        const sDateStr = String(b.startDate).split("T")[0];
        const eDateStr = String(b.endDate).split("T")[0];
        let start: Date;
        let end: Date;
        let allDay: boolean;
        if (b.blockType === "compromisso" && b.startTime && b.endTime) {
          start = new Date(`${sDateStr}T${b.startTime}`);
          end = new Date(`${sDateStr}T${b.endTime}`);
          allDay = false;
        } else {
          start = new Date(`${sDateStr}T00:00:00`);
          const endExcl = new Date(`${eDateStr}T00:00:00`);
          endExcl.setDate(endExcl.getDate() + 1); // fim exclusivo p/ react-big-calendar
          end = endExcl;
          allDay = true;
        }
        return {
          id: `block-${b.id}`,
          start,
          end,
          allDay,
          isBlock: true,
          blockInfo: {
            blockType: b.blockType,
            description: b.description ?? null,
            technicianId: b.technicianId,
            startTime: b.startTime ?? null,
            endTime: b.endTime ?? null,
            startDateStr: sDateStr,
            endDateStr: eDateStr,
          },
        } as CalendarEvent;
      });
    }

    return [...regularEvents, ...ghostEvents, ...blockEvents];
  }, [activities, rescheduleGhosts, agendaBlocks, selectedUser, userTechnician, searchQuery, statusFilter, typeFilter, periodFilter, clients]);

  // Helper para encontrar próximo horário disponível (definido ANTES dos useEffects)
  const findNextAvailableSlot = useCallback((technicianId: string, date: string) => {
    // Horário padrão: 08:00-17:00
    const defaultStart = "08:00";
    const defaultEnd = "17:00";
    
    if (!technicianId) return { start: defaultStart, end: defaultEnd, date };
    
    // Buscar atividades do técnico nessa data
    const technicianActivities = activities.filter((a) => {
      const activityDate = moment(a.scheduledDate).format("YYYY-MM-DD");
      return a.technicianId === technicianId && activityDate === date;
    });
    
    if (technicianActivities.length === 0) {
      return { start: defaultStart, end: defaultEnd, date };
    }
    
    // Ordenar atividades por horário de início
    const sorted = technicianActivities.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    // Encontrar último horário de fim
    const lastActivity = sorted[sorted.length - 1];
    const lastEndTime = lastActivity.endTime;
    
    // Sugerir próximo slot após a última atividade
    const [lastHour, lastMin] = lastEndTime.split(":").map(Number);
    const nextStartHour = lastHour;
    const nextStartMin = lastMin;
    
    // Adicionar 1 hora ao horário de fim da última atividade
    const nextStart = `${String(nextStartHour).padStart(2, "0")}:${String(nextStartMin).padStart(2, "0")}`;
    const nextEndHour = nextStartHour + 1;
    const nextEnd = `${String(nextEndHour).padStart(2, "0")}:${String(nextStartMin).padStart(2, "0")}`;
    
    // Verificar se está dentro do horário comercial (até 18:00)
    if (nextEndHour > 18) {
      // Se passar das 18h, avançar para próximo dia útil (segunda a sexta)
      let nextDate = moment(date).add(1, 'day');
      
      // Pular fins de semana
      while (nextDate.day() === 0 || nextDate.day() === 6) {
        nextDate = nextDate.add(1, 'day');
      }
      
      return { 
        start: defaultStart, 
        end: defaultEnd,
        date: nextDate.format("YYYY-MM-DD")
      };
    }
    
    return { start: nextStart, end: nextEnd, date };
  }, [activities]);

  // Auto-preencher técnico quando o dialog abre (para assistentes)
  useEffect(() => {
    if (dialogOpen && !isEditing && user?.role === "assistente" && userTechnician) {
      // Usar setTimeout para garantir que o Select está montado
      setTimeout(() => {
        form.setValue("technicianId", userTechnician.id);
      }, 0);
    }
  }, [dialogOpen, isEditing, user, userTechnician, form]);

  // Recalcular horários quando técnico ou data mudam (apenas em modo criação, não edição)
  useEffect(() => {
    if (!dialogOpen || isEditing) return;
    
    const subscription = form.watch((value, { name }) => {
      // Só recalcular quando técnico ou data mudam
      if (name === "technicianId" || name === "scheduledDate") {
        const technicianId = value.technicianId;
        const scheduledDate = value.scheduledDate;
        
        if (technicianId && scheduledDate) {
          const slot = findNextAvailableSlot(technicianId, scheduledDate);
          // Atualizar todos os campos: data, horário início e fim
          if (slot.date !== scheduledDate) {
            form.setValue("scheduledDate", slot.date, { shouldValidate: false });
          }
          form.setValue("startTime", slot.start, { shouldValidate: false });
          form.setValue("endTime", slot.end, { shouldValidate: false });
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, [dialogOpen, isEditing, form, findNextAvailableSlot]);

  // Define handleOpenNewActivityModal first, before functions that use it
  const handleOpenNewActivityModal = useCallback((initialDate?: string) => {
    const selectedDate = initialDate || moment().format("YYYY-MM-DD");
    setIsEditing(false);
    setSelectedActivity(null);
    
    // Auto-preencher técnico se o usuário logado for assistente
    const defaultTechnicianId = user?.role === "assistente" && userTechnician 
      ? userTechnician.id 
      : "";
    
    // Encontrar próximo horário disponível (se houver técnico selecionado)
    const availableSlot = defaultTechnicianId
      ? findNextAvailableSlot(defaultTechnicianId, selectedDate)
      : { start: "08:00", end: "17:00", date: selectedDate };
    
    form.reset({
      title: "",
      clientName: "",
      description: "",
      scheduledDate: availableSlot.date,
      startTime: availableSlot.start,
      endTime: availableSlot.end,
      isMultiDay: false,
      endDate: "",
      status: "planejado",
      technicianId: defaultTechnicianId,
      clientId: "",
      activityTypeId: "",
      address: "",
      city: "",
      state: "",
      country: "Brasil",
    });
    setDialogOpen(true);
  }, [form, user, userTechnician, findNextAvailableSlot]);

  // Navegação por teclado (movido para depois de handleOpenNewActivityModal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver em um input, textarea ou dialog
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.hasAttribute("contenteditable") ||
        dialogOpen ||
        viewDialogOpen
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          handleOpenNewActivityModal();
          break;
        
        case "/":
          e.preventDefault();
          setShowFilters(true);
          setTimeout(() => {
            const searchInput = document.querySelector('[data-testid="input-search-activities"]') as HTMLInputElement;
            searchInput?.focus();
          }, 100);
          break;
        
        case "arrowleft":
          e.preventDefault();
          setDate((prevDate) => moment(prevDate).subtract(1, view === "month" ? "month" : view === "week" ? "week" : "day").toDate());
          break;
        
        case "arrowright":
          e.preventDefault();
          setDate((prevDate) => moment(prevDate).add(1, view === "month" ? "month" : view === "week" ? "week" : "day").toDate());
          break;
        
        case "t":
          e.preventDefault();
          handleTodayClick();
          break;
        
        case "f":
          e.preventDefault();
          setShowFilters((prev) => !prev);
          break;
        
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogOpen, viewDialogOpen, view, handleOpenNewActivityModal, handleTodayClick]);

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
    e.stopPropagation();
    
    // Marca que foi clique direito para prevenir handleSelectSlot de abrir modal
    isRightClickRef.current = true;
    
    const target = e.target as HTMLElement;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Tentar encontrar o evento clicado procurando pelo elemento pai com classe do evento
    const eventElement = target.closest('.rbc-event');
    
    if (eventElement) {
      // Clicou em um evento - procurar qual evento foi
      const eventClientName = eventElement.querySelector('.text-xs')?.textContent || '';
      const clickedEvent = events.find((evt) => evt.resource.clientName === eventClientName);
      
      if (clickedEvent) {
        // Abrir context menu para evento existente
        setTimeout(() => {
          setContextMenu({
            x: mouseX,
            y: mouseY,
            date: clickedEvent.start,
            event: clickedEvent,
          });
        }, 0);
        return;
      }
    }
    
    // Se não clicou em evento, é célula vazia - context menu normal
    const calendarElement = target.closest('.rbc-calendar');
    if (!calendarElement) return;
    
    // Aguarda um tick para que onSelectSlot seja processado e atualize lastSlotDate
    setTimeout(() => {
      setContextMenu({
        x: mouseX,
        y: mouseY,
        date: lastSlotDate,
      });
    }, 0);
  }, [lastSlotDate, events]);

  const handleOpenModalFromContext = useCallback(() => {
    if (!contextMenu) return;
    
    const selectedDate = moment(contextMenu.date).format("YYYY-MM-DD");
    handleOpenNewActivityModal(selectedDate);
    setContextMenu(null);
  }, [contextMenu, handleOpenNewActivityModal]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handler para clique simples - não faz nada, CustomEvent gerencia o click
  const handleSelectEvent = useCallback(() => {
    // Não fazer nada - o click é gerenciado pelo CustomEvent
  }, []);

  // Handler para duplicar atividade
  const handleDuplicateActivity = useCallback((activity: Activity, targetDate?: string) => {
    // Se targetDate for fornecido (clique direito em outra data), usa ele, senão usa a data original
    const scheduledDate = targetDate ? targetDate : (activity.scheduledDate as any);
    const dateStr = typeof scheduledDate === 'string'
      ? scheduledDate.split('T')[0]
      : new Date(scheduledDate).toISOString().split('T')[0];
    
    // Se targetDate for fornecido, usar horários inteligentes
    const technicianId = activity.technicianId;
    const availableSlot = targetDate && technicianId
      ? findNextAvailableSlot(technicianId, dateStr)
      : { start: activity.startTime, end: activity.endTime, date: dateStr };
    
    form.reset({
      title: activity.title ? `${activity.title} (Cópia)` : "",
      clientName: `${activity.clientName || "Cliente"} (Cópia)`,
      description: activity.description || "",
      scheduledDate: availableSlot.date,
      startTime: availableSlot.start,
      endTime: availableSlot.end,
      isMultiDay: false,
      endDate: "",
      status: "planejado",
      technicianId: activity.technicianId,
      clientId: activity.clientId || "",
      activityTypeId: activity.activityTypeId,
      location: (activity as any).location ?? null,
      address: activity.address || "",
      city: activity.city || "",
      state: activity.state || "",
      country: activity.country || "Brasil",
    });
    
    setIsEditing(false);
    setSelectedActivity(null);
    setContextMenu(null);
    setDialogOpen(true);
  }, [form, findNextAvailableSlot]);

  // Handler para marcar como concluído
  const markAsCompletedMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const activity = activities.find((a) => a.id === activityId);
      if (!activity) throw new Error("Atividade não encontrada");
      
      const scheduledDateTime = typeof activity.scheduledDate === 'string'
        ? activity.scheduledDate
        : new Date(activity.scheduledDate).toISOString();
      
      const payload = {
        technicianId: activity.technicianId,
        clientId: activity.clientId || null,
        clientName: activity.clientName,
        siteId: activity.siteId || null,
        activityTypeId: activity.activityTypeId,
        description: activity.description || "",
        address: activity.address || null,
        city: activity.city || null,
        state: activity.state || null,
        country: activity.country || null,
        scheduledDate: scheduledDateTime,
        startTime: activity.startTime,
        endTime: activity.endTime,
        location: (activity as any).location ?? null,
        status: "concluido" as const,
      };
      
      const response = await apiRequest("PUT", `/api/activities/${activityId}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Atividade concluída",
        description: "A atividade foi marcada como concluída.",
      });
      setContextMenu(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao concluir atividade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditActivity = useCallback(() => {
    if (!selectedActivity) return;
    
    const scheduledDate = selectedActivity.scheduledDate as any;
    const dateStr = typeof scheduledDate === 'string'
      ? scheduledDate.split('T')[0]
      : new Date(scheduledDate).toISOString().split('T')[0];
    
    const hasEndDate = !!(selectedActivity as any).endDate;
    const endDateValue = hasEndDate ? moment((selectedActivity as any).endDate).format("YYYY-MM-DD") : "";
    
    form.reset({
      title: selectedActivity.title || "",
      clientName: selectedActivity.clientName || "",
      description: selectedActivity.description || "",
      scheduledDate: dateStr,
      startTime: selectedActivity.startTime,
      endTime: selectedActivity.endTime,
      isMultiDay: hasEndDate,
      endDate: endDateValue,
      status: selectedActivity.status,
      technicianId: selectedActivity.technicianId,
      clientId: selectedActivity.clientId || "",
      activityTypeId: selectedActivity.activityTypeId,
      location: (selectedActivity as any).location ?? null,
      address: selectedActivity.address || "",
      city: selectedActivity.city || "",
      state: selectedActivity.state || "",
      country: selectedActivity.country || "Brasil",
    });
    
    setIsEditing(true);
    setViewDialogOpen(false);
    setDialogOpen(true);
  }, [selectedActivity, form]);

  const onEventDrop = useCallback(({ event, start, end }: any) => {
    if (event.isBlock || event.isGhost) return; // bloqueios/ghosts não movem
    const activity = event.resource as Activity;
    const oldDate = activity.scheduledDate ? moment(activity.scheduledDate).format("YYYY-MM-DD") : null;
    const newDate = moment(start).format("YYYY-MM-DD");
    
    if (oldDate !== newDate) {
      setDragRescheduleData({ activity, start, end });
      setSelectedActivity(activity);
      setRescheduleModalOpen(true);
    } else {
      moveEventMutation.mutate({ activity, start, end });
    }
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
    // Bloqueios de agenda (férias / compromisso)
    if (event.isBlock) {
      const ferias = event.blockInfo?.blockType === "ferias";
      return {
        style: {
          backgroundColor: ferias ? "hsl(280 60% 55%)" : "hsl(300 65% 58%)",
          borderRadius: "4px",
          color: "white",
          border: "none",
          display: "block",
          padding: "2px 4px",
          opacity: 0.92,
          cursor: "default",
        },
      };
    }
    // Ghost events (rescheduled activities) have different styling
    if (event.isGhost) {
      return {
        style: {
          backgroundColor: "hsl(var(--muted))",
          borderRadius: "4px",
          color: "hsl(var(--muted-foreground))",
          border: "2px dashed hsl(var(--border))",
          display: "block",
          padding: "2px 4px",
          opacity: 0.6,
          textDecoration: "line-through",
          cursor: "default",
        },
      };
    }
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

  const CustomEvent = ({ event, className, style, ...rest }: any) => {
    const eventRef = useRef<HTMLDivElement>(null);
    const activity = event.resource;
    const isGhost = event.isGhost === true;

    // Bloqueio de agenda (férias / compromisso) — chip simples, sem interação.
    if (event.isBlock) {
      const info = event.blockInfo;
      const ferias = info?.blockType === "ferias";
      const label = ferias ? "Férias" : "Indisponível";
      const desc = info?.description;
      const tech = technicians.find((t) => t.id === info?.technicianId);
      const timeStr =
        !ferias && info?.startTime && info?.endTime ? `${info.startTime}–${info.endTime}` : "";
      const periodStr =
        ferias && info?.startDateStr && info?.endDateStr
          ? `${moment(info.startDateStr).format("DD/MM")}–${moment(info.endDateStr).format("DD/MM/YYYY")}`
          : "";
      const title = [
        `${tech ? tech.name + " — " : ""}${label}`,
        ferias ? periodStr : timeStr,
        desc || "",
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <div
          className={className}
          style={style}
          data-testid={`calendar-block-${event.id}`}
          title={title}
        >
          <span style={{ fontWeight: 600 }}>{ferias ? "✈ " : "⛔ "}{label}</span>
          {timeStr ? <span style={{ opacity: 0.95 }}> {timeStr}</span> : null}
          {desc ? <span style={{ opacity: 0.9 }}> · {desc}</span> : null}
        </div>
      );
    }

    const activityType = activityTypes.find((t) => t.id === activity.activityTypeId);
    const color = activityType?.color || "#3b82f6";
    const technician = technicians.find((t) => t.id === activity.technicianId);
    const ghostEventId = isGhost ? `ghost-${event.id}` : null;
    const tooltipId = isGhost ? ghostEventId! : activity.id;
    const isTooltipOpen = activeTooltipEventId === tooltipId;

    const handleEventClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (eventRef.current) {
        const rect = eventRef.current.getBoundingClientRect();
        const tooltipHeight = 400; // altura estimada do tooltip
        const minTopSpace = 80; // espaço mínimo para header/navbar
        
        // Verificar se há espaço acima (considerando altura do tooltip + espaço para navbar)
        const hasSpaceAbove = rect.top > tooltipHeight + minTopSpace;
        
        const position = {
          x: rect.left + rect.width / 2,
          y: hasSpaceAbove ? rect.top - 10 : rect.bottom + 10,
          showBelow: !hasSpaceAbove
        };
        
        if (isTooltipOpen) {
          setActiveTooltipEventId(null);
          setTooltipPosition(null);
        } else {
          tooltipOpenedAtRef.current = Date.now();
          setTooltipPosition(position);
          setActiveTooltipEventId(tooltipId);
        }
      }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        date: event.start,
        event: event,
      });
      setActiveTooltipEventId(null);
    };

    const handleViewDetails = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedActivity(activity);
      setViewDialogOpen(true);
      setActiveTooltipEventId(null);
    };

    const getStatusLabel = (status: string) => {
      switch (status) {
        case "planejado": return "Planejado";
        case "aCaminho": return "A Caminho";
        case "emExecucao": return "Em Execução";
        case "concluido": return "Concluído";
        case "reprovado": return "Reprovado";
        case "cancelado": return "Cancelado";
        default: return status;
      }
    };

    const getStatusColor = (status: string) => {
      switch (status) {
        case "planejado": return { text: "#71717a", bg: "#f4f4f5" };
        case "aCaminho": return { text: "#f59e0b", bg: "#fef3c7" };
        case "emExecucao": return { text: "#3b82f6", bg: "#dbeafe" };
        case "concluido": return { text: "#10b981", bg: "#d1fae5" };
        case "reprovado": return { text: "#ef4444", bg: "#fee2e2" };
        case "cancelado": return { text: "#6b7280", bg: "#f3f4f6" };
        default: return { text: "#71717a", bg: "#f4f4f5" };
      }
    };

    return (
      <>
        <div 
          ref={eventRef}
          className={cn(className, "flex flex-col overflow-visible cursor-pointer pl-1.5 py-0.5")}
          style={{
            ...style,
            borderLeft: `2px solid ${getStatusColor(activity.status).text}`
          }}
          onClick={handleEventClick}
          onContextMenu={handleContextMenu}
          {...rest}
          data-testid={`calendar-event-${activity.id}`}
        >
          {isGhost ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">REAGENDADO</span>
              </div>
              <span className="text-[11px] truncate leading-tight line-through opacity-70">{activity.clientName || "Sem cliente"}</span>
              <span className="text-[10px] text-muted-foreground/60 pl-0 leading-tight">
                → {event.ghostInfo?.newDate} {event.ghostInfo?.newStartTime}
              </span>
              {event.ghostInfo?.reason && (
                <span className="text-[9px] text-muted-foreground/50 pl-0 leading-tight italic truncate">
                  "{event.ghostInfo.reason}"
                </span>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <div
                  className="w-1 h-1 rounded-full flex-shrink-0 opacity-60"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] font-medium truncate leading-tight">{activity.clientName || "Sem cliente"}</span>
              </div>
              {activity.title && (
                <span className="text-[10px] text-muted-foreground/80 pl-2 leading-tight truncate font-medium">
                  {activity.title}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/70 pl-2 leading-tight">
                {activity.startTime}~{activity.endTime}
              </span>
              {(view === "week" || view === "day") && activity.description && (
                <span className="text-[10px] text-muted-foreground/60 pl-2 leading-tight line-clamp-2 mt-0.5">
                  {activity.description}
                </span>
              )}
            </>
          )}
        </div>

        {/* Tooltip para evento fantasma (reagendamento) */}
        {isGhost && isTooltipOpen && tooltipPosition && createPortal(
          <div
            className="fixed w-72 p-3 shadow-xl border bg-popover text-popover-foreground rounded-lg animate-in fade-in-0 zoom-in-95 z-[9999]"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: tooltipPosition.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
            data-testid={`tooltip-ghost-${activity.id}`}
            data-tooltip-portal
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-3 py-2 rounded-md text-sm font-semibold text-center mb-3 -mx-3 -mt-3"
              style={{ backgroundColor: '#fff7ed', color: '#ea580c', borderLeft: '4px solid #ea580c' }}
            >
              Atividade Reagendada
            </div>
            <div className="space-y-2.5 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium truncate">{activity.clientName || "Não informado"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Técnico</p>
                <p className="font-medium truncate">{technician?.name || "N/A"}</p>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Horário Original</p>
                </div>
                <p className="text-xs font-medium line-through opacity-70">
                  {activity.date} {activity.startTime} - {activity.endTime}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarIcon className="w-3.5 h-3.5 text-orange-500" />
                  <p className="text-xs text-muted-foreground">Reagendado para</p>
                </div>
                <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                  {event.ghostInfo?.newDate} {event.ghostInfo?.newStartTime}
                </p>
              </div>
              {event.ghostInfo?.reason && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Justificativa</p>
                  <p className="text-xs italic bg-muted/50 rounded-md p-2">
                    {event.ghostInfo.reason}
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* Tooltip compacto com informações básicas */}
        {!isGhost && isTooltipOpen && tooltipPosition && createPortal(
          <div
            className="fixed w-72 p-3 shadow-xl border bg-popover text-popover-foreground rounded-lg animate-in fade-in-0 zoom-in-95 z-[9999]"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: tooltipPosition.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
            data-testid={`tooltip-activity-${activity.id}`}
            data-tooltip-portal
            onClick={(e) => e.stopPropagation()}
          >
            {/* Status - DESTAQUE PRINCIPAL */}
            <div 
              className="px-3 py-2 rounded-md text-sm font-semibold text-center mb-3 -mx-3 -mt-3"
              style={{ 
                backgroundColor: getStatusColor(activity.status).bg,
                color: getStatusColor(activity.status).text,
                borderLeft: `4px solid ${getStatusColor(activity.status).text}`
              }}
            >
              {getStatusLabel(activity.status)}
            </div>

            {/* Informações básicas */}
            <div className="space-y-2 text-sm">
              {/* Cliente */}
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium truncate">{activity.clientName || "Não informado"}</p>
              </div>

              {/* Técnico */}
              <div>
                <p className="text-xs text-muted-foreground">Técnico</p>
                <p className="font-medium truncate">{technician?.name || "N/A"}</p>
              </div>

              {/* Contato do Cliente */}
              {(activity as any).client && ((activity as any).client.contactName || (activity as any).client.contactPhone || (activity as any).client.contactEmail) && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1.5">Contato</p>
                  <ActivityClientContact
                    contactName={(activity as any).client.contactName}
                    contactPhone={(activity as any).client.contactPhone}
                    contactEmail={(activity as any).client.contactEmail}
                    variant="compact"
                  />
                </div>
              )}

              {/* Endereço */}
              {(activity.address || activity.city) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Endereço</p>
                  </div>
                  <p className="text-xs font-medium truncate">
                    {activity.address && `${activity.address}`}
                    {activity.city && ` - ${activity.city}`}
                    {activity.state && `/${activity.state}`}
                  </p>
                </div>
              )}

              {/* Horário */}
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium">{activity.startTime} - {activity.endTime}</span>
              </div>

              {/* Descrição (limitada) */}
              {activity.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                  <p className="text-xs">
                    {activity.description.length > 80 
                      ? `${activity.description.substring(0, 80)}...` 
                      : activity.description}
                  </p>
                </div>
              )}

              {/* Tipo de Atividade - DISCRETO */}
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <p className="text-xs text-muted-foreground">{activityType?.name || "N/A"}</p>
                </div>
              </div>

              {/* Botão para ver detalhes */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={handleViewDetails}
                data-testid="button-view-details-tooltip"
              >
                Ver Detalhes Completos
              </Button>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  };

  const technicianUsers = useMemo(() => {
    // Allow both admin and assistente roles to have agenda
    return users.filter((u) => u.role === "assistente" || u.role === "admin");
  }, [users]);

  // Map users to technicians for the filter
  const technicianOptions = useMemo(() => {
    return technicianUsers.map((user) => {
      const technician = technicians.find((t) => t.userId === user.id);
      return {
        userId: user.id,
        technicianId: technician?.id || "",
        name: user.name,
      };
    }).filter((opt) => opt.technicianId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [technicianUsers, technicians]);

  // Limpa context menu e tooltip quando view ou date mudam
  useEffect(() => {
    setContextMenu(null);
    setActiveTooltipEventId(null);
  }, [view, date]);

  // Fechar tooltip quando modal é aberto
  useEffect(() => {
    if (dialogOpen || viewDialogOpen) {
      setActiveTooltipEventId(null);
      setTooltipPosition(null);
    }
  }, [dialogOpen, viewDialogOpen]);

  // Listener de click-outside para fechar tooltip
  useEffect(() => {
    if (!activeTooltipEventId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const now = Date.now();
      const timeSinceOpen = now - tooltipOpenedAtRef.current;
      
      // Não fechar se tooltip foi aberto há menos de 200ms
      if (timeSinceOpen < 200) return;
      
      const target = e.target as HTMLElement;
      
      // Não fechar se clicar dentro do tooltip
      if (target.closest('[data-tooltip-portal]')) return;
      
      // Fechar tooltip
      setActiveTooltipEventId(null);
    };

    // Adiciona listener imediatamente (proteção é via timestamp)
    document.addEventListener('click', handleClickOutside, true);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [activeTooltipEventId]);

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
          background-color: hsl(var(--primary) / 0.15) !important;
          border: 2px dashed hsl(var(--primary) / 0.5) !important;
          transition: all 0.2s ease-in-out !important;
          animation: pulseSlot 1.5s ease-in-out infinite !important;
        }
        
        /* Pulse animation para slot de destino */
        @keyframes pulseSlot {
          0%, 100% {
            background-color: hsl(var(--primary) / 0.1);
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4);
          }
          50% {
            background-color: hsl(var(--primary) / 0.2);
            box-shadow: 0 0 8px 2px hsl(var(--primary) / 0.3);
          }
        }
        
        /* Estilo da área de redimensionamento - Melhorado */
        .rbc-addons-dnd-resize-ns-anchor {
          cursor: ns-resize !important;
          background-color: hsl(var(--primary) / 0.1) !important;
          transition: background-color 0.2s ease-in-out !important;
        }
        
        .rbc-addons-dnd-resize-ns-anchor:hover {
          background-color: hsl(var(--primary) / 0.3) !important;
        }
        
        .rbc-addons-dnd-resize-ew-anchor {
          cursor: ew-resize !important;
          background-color: hsl(var(--primary) / 0.1) !important;
          transition: background-color 0.2s ease-in-out !important;
        }
        
        .rbc-addons-dnd-resize-ew-anchor:hover {
          background-color: hsl(var(--primary) / 0.3) !important;
        }
        
        /* Indicator visual durante resize */
        .rbc-addons-dnd-resizing {
          opacity: 0.8 !important;
          outline: 2px solid hsl(var(--primary)) !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 12px hsl(var(--primary) / 0.4) !important;
        }
        
        /* Animação suave ao soltar */
        .rbc-event {
          will-change: transform, box-shadow !important;
        }
        
        /* Ripple effect ao soltar evento */
        @keyframes ripple {
          0% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0.6),
                        0 0 0 0 hsl(var(--primary) / 0.4),
                        0 0 0 0 hsl(var(--primary) / 0.2);
          }
          100% {
            box-shadow: 0 0 0 8px hsl(var(--primary) / 0),
                        0 0 0 16px hsl(var(--primary) / 0),
                        0 0 0 24px hsl(var(--primary) / 0);
          }
        }
        
        /* Aplicar ripple temporariamente ao soltar */
        .rbc-event.event-dropped {
          animation: ripple 0.6s ease-out !important;
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
        
        /* ========================================
         * LINHA INDICADORA DE HORA ATUAL (Estilo Outlook)
         * Exibe uma linha horizontal na posição do horário atual
         * na visão semanal/dia do calendário
         * ======================================== */
        
        /* Container do indicador de hora atual */
        .rbc-current-time-indicator {
          position: absolute !important;
          z-index: 100 !important;
          left: 0 !important;
          right: 0 !important;
          height: 2px !important;
          background-color: hsl(var(--primary)) !important;
          pointer-events: none !important;
        }
        
        /* Bolinha no início da linha (estilo Outlook) */
        .rbc-current-time-indicator::before {
          content: '' !important;
          position: absolute !important;
          left: -5px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          width: 10px !important;
          height: 10px !important;
          border-radius: 50% !important;
          background-color: hsl(var(--primary)) !important;
          box-shadow: 0 0 4px hsl(var(--primary) / 0.6) !important;
        }
        
        /* Efeito de brilho sutil na linha */
        .rbc-current-time-indicator::after {
          content: '' !important;
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          top: -1px !important;
          height: 4px !important;
          background: linear-gradient(
            180deg,
            hsl(var(--primary) / 0.3),
            transparent
          ) !important;
          pointer-events: none !important;
        }
        
        /* Destacar o dia atual na coluna */
        .rbc-day-slot.rbc-today {
          background-color: hsl(var(--primary) / 0.03) !important;
        }
        
        /* Destacar header do dia atual */
        .rbc-header.rbc-today {
          background-color: hsl(var(--primary) / 0.1) !important;
          color: hsl(var(--primary)) !important;
          font-weight: 600 !important;
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
        
        /* Tooltips são renderizados via portal (createPortal no body), então o mês
         * NÃO precisa de overflow visível — isso só causava a grade estourar na
         * visão "Todos os técnicos". A visão de agenda pode manter overflow visível. */
        .rbc-agenda-view {
          overflow: visible !important;
        }
        
        /* Container principal do calendário */
        .calendar-container {
          display: flex;
          flex-direction: column;
          overflow: hidden !important;
        }
        
        .calendar-container .rbc-calendar {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        
        /* =============================================
         * VISÃO DE TEMPO (SEMANA/DIA) - STICKY HEADER
         * O calendário tem altura fixa, scroll interno
         * ============================================= */
        
        /* Container da visão de tempo - tem altura fixa */
        .calendar-container .rbc-time-view {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }
        
        /* Header com os dias - STICKY para ficar no topo quando rola */
        .calendar-container .rbc-time-header {
          position: sticky !important;
          top: 0 !important;
          z-index: 200 !important;
          background: hsl(var(--background)) !important;
          border-bottom: 2px solid hsl(var(--border)) !important;
          flex-shrink: 0 !important;
        }
        
        .calendar-container .rbc-time-header-content {
          background: hsl(var(--background)) !important;
        }
        
        .calendar-container .rbc-time-header .rbc-header {
          background: hsl(var(--background)) !important;
          font-weight: 600 !important;
        }
        
        .calendar-container .rbc-time-header .rbc-time-header-gutter {
          background: hsl(var(--background)) !important;
        }
        
        /* Área de conteúdo com scroll - ÚNICA área que rola */
        .calendar-container .rbc-time-content {
          flex: 1 1 auto !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          min-height: 0 !important;
          overscroll-behavior: contain !important;
        }
        
        /* Scrollbar estilizada para visibilidade */
        .calendar-container .rbc-time-content::-webkit-scrollbar {
          width: 10px !important;
        }
        
        .calendar-container .rbc-time-content::-webkit-scrollbar-track {
          background: hsl(var(--muted) / 0.3) !important;
          border-radius: 5px !important;
        }
        
        .calendar-container .rbc-time-content::-webkit-scrollbar-thumb {
          background: hsl(var(--primary) / 0.5) !important;
          border-radius: 5px !important;
        }
        
        .calendar-container .rbc-time-content::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.8) !important;
        }
        
        /* Gutter dos horários */
        .calendar-container .rbc-time-content > .rbc-time-gutter {
          background: hsl(var(--background)) !important;
        }
        
        /* =============================================
         * VISÃO DE MÊS - estrutura original
         * ============================================= */
        
        .calendar-container .rbc-month-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        
        .calendar-container .rbc-month-header {
          flex-shrink: 0;
        }
        
        .calendar-container .rbc-month-row {
          flex: 1;
          min-height: 0;
          overflow: hidden !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        /* Garante que as linhas internas (datas e eventos) nunca estourem a largura,
         * mesmo na visão "Todos os técnicos" com muitos eventos por dia. */
        .calendar-container .rbc-month-row .rbc-row-bg,
        .calendar-container .rbc-month-row .rbc-row-content,
        .calendar-container .rbc-month-row .rbc-row {
          width: 100% !important;
          max-width: 100% !important;
        }
        
        /* =============================================
         * RESPONSIVIDADE MOBILE
         * ============================================= */
        
        @media (max-width: 640px) {
          /* Reduzir fonte dos headers de dia */
          .rbc-header {
            font-size: 10px !important;
            padding: 4px 2px !important;
          }
          
          /* Ajustar coluna de horários */
          .rbc-time-gutter {
            width: 40px !important;
            min-width: 40px !important;
          }
          
          .rbc-time-gutter .rbc-timeslot-group {
            min-height: 40px !important;
          }
          
          .rbc-label {
            font-size: 9px !important;
            padding: 0 2px !important;
          }
          
          /* Eventos menores em mobile */
          .rbc-event {
            font-size: 9px !important;
            padding: 1px 2px !important;
          }
          
          /* Células do mês mais compactas */
          .rbc-month-view .rbc-date-cell {
            padding: 2px !important;
            font-size: 11px !important;
          }
          
          /* Header do mês compacto */
          .rbc-month-header .rbc-header {
            padding: 4px 2px !important;
          }
          
          /* Reduzir altura mínima das linhas do mês */
          .rbc-month-row {
            min-height: 60px !important;
          }
          
          /* Botão de more events menor */
          .rbc-show-more {
            font-size: 9px !important;
            padding: 1px 3px !important;
          }
        }
        
        @media (max-width: 480px) {
          /* Ainda mais compacto em telas muito pequenas */
          .rbc-header {
            font-size: 9px !important;
          }
          
          .rbc-time-gutter {
            width: 35px !important;
            min-width: 35px !important;
          }
          
          .rbc-label {
            font-size: 8px !important;
          }
          
          .rbc-event {
            font-size: 8px !important;
          }
        }
      `}</style>
      <div className="flex flex-col h-full gap-4 pb-20 md:pb-6" data-testid="page-calendar">

        {/* Filtros Avançados */}
        {showFilters && (
          <Card className="p-4 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Campo de Busca */}
              <div className="lg:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Buscar por título, cliente ou descrição..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-activities"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filtro de Status */}
              <div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status-filter">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="planejado">Planejado</SelectItem>
                    <SelectItem value="emExecucao">Em Execução</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="reprovado">Reprovado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro de Tipo de Atividade */}
              <div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger data-testid="select-type-filter">
                    <SelectValue placeholder="Tipo de atividade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    {activityTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro de Período */}
              <div>
                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                  <SelectTrigger data-testid="select-period-filter">
                    <SelectValue placeholder="Filtrar por período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os períodos</SelectItem>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="semana">Esta Semana</SelectItem>
                    <SelectItem value="mes">Este Mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Botão para limpar todos os filtros */}
              {(searchQuery || statusFilter !== "todos" || typeFilter !== "todos" || periodFilter !== "todos") && (
                <div className="lg:col-span-4 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("todos");
                      setTypeFilter("todos");
                      setPeriodFilter("todos");
                    }}
                    data-testid="button-clear-all-filters"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Limpar Filtros
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Card de Resumo de Produtividade */}
        {(showFilters || periodFilter !== "todos") && (
          <Card className="p-4 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Resumo de Produtividade</h3>
              <Badge variant="outline" className="ml-auto">
                {productivityMetrics.totalActivities} {productivityMetrics.totalActivities === 1 ? "atividade" : "atividades"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Horas por Categoria */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Horas por Categoria</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <span className="text-sm font-medium">Efetivo</span>
                    <span className="text-lg font-bold text-green-700 dark:text-green-400">
                      {productivityMetrics.hoursByCategory.Efetivo.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                    <span className="text-sm font-medium">Adicional</span>
                    <span className="text-lg font-bold text-yellow-700 dark:text-yellow-400">
                      {productivityMetrics.hoursByCategory.Adicional.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                    <span className="text-sm font-medium">Perda</span>
                    <span className="text-lg font-bold text-red-700 dark:text-red-400">
                      {productivityMetrics.hoursByCategory.Perda.toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>

              {/* Contador por Status */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Por Status</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Planejado</span>
                    <Badge variant="secondary">{productivityMetrics.countByStatus.planejado}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Em Execução</span>
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200">
                      {productivityMetrics.countByStatus.emExecucao}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Concluído</span>
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 border-green-200">
                      {productivityMetrics.countByStatus.concluido}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Reprovado</span>
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200">
                      {productivityMetrics.countByStatus.reprovado}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Cancelado</span>
                    <Badge variant="outline">{productivityMetrics.countByStatus.cancelado}</Badge>
                  </div>
                </div>
              </div>

              {/* Percentual de Conclusão */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Taxa de Conclusão</p>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-muted/20"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 56}`}
                        strokeDashoffset={`${2 * Math.PI * 56 * (1 - productivityMetrics.completionPercentage / 100)}`}
                        className="text-green-500 transition-all duration-500"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold">{productivityMetrics.completionPercentage}%</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {productivityMetrics.completedActivities} de {productivityMetrics.totalActivities} concluídas
                  </p>
                </div>
              </div>

              {/* Total de Horas */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Geral</p>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="text-center">
                    <Clock className="w-12 h-12 mx-auto mb-2 text-primary" />
                    <p className="text-4xl font-bold text-primary">
                      {(productivityMetrics.hoursByCategory.Efetivo + 
                        productivityMetrics.hoursByCategory.Adicional + 
                        productivityMetrics.hoursByCategory.Perda).toFixed(1)}
                    </p>
                    <p className="text-sm text-muted-foreground">horas totais</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="flex flex-col flex-1 min-h-0">
        <div className="p-2 border-b flex flex-wrap gap-2 items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDate(moment(date).subtract(1, view === "day" ? "day" : view === "week" ? "week" : "month").toDate())}
              data-testid="button-nav-previous"
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={handleTodayClick}
              data-testid="button-nav-today"
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDate(moment(date).add(1, view === "day" ? "day" : view === "week" ? "week" : "month").toDate())}
              data-testid="button-nav-next"
              title="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <h2 className="text-sm sm:text-base font-semibold ml-1 sm:ml-2 whitespace-nowrap">
              {moment(date).format("MMM YYYY")}
            </h2>
          </div>

          <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              className="h-8 px-2"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Filtros</span>
              {(searchQuery || statusFilter !== "todos" || typeFilter !== "todos" || periodFilter !== "todos") && (
                <Badge variant="secondary" className="ml-1 px-1 py-0 text-xs">
                  {[searchQuery, statusFilter !== "todos", typeFilter !== "todos", periodFilter !== "todos"].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-auto min-w-[100px] sm:w-[160px] h-8" data-testid="select-user-filter">
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

            <div className="flex gap-0.5">
              <Button
                variant={view === "day" ? "default" : "outline"}
                size="sm"
                className="h-8 px-2"
                onClick={() => setView("day")}
                data-testid="button-view-day"
              >
                <span className="hidden sm:inline">Dia</span>
                <span className="sm:hidden">D</span>
              </Button>
              <Button
                variant={view === "week" ? "default" : "outline"}
                size="sm"
                className="h-8 px-2"
                onClick={() => setView("week")}
                data-testid="button-view-week"
              >
                <span className="hidden sm:inline">Semana</span>
                <span className="sm:hidden">S</span>
              </Button>
              <Button
                variant={view === "month" ? "default" : "outline"}
                size="sm"
                className="h-8 px-2"
                onClick={() => setView("month")}
                data-testid="button-view-month"
              >
                <span className="hidden sm:inline">Mês</span>
                <span className="sm:hidden">M</span>
              </Button>
            </div>
            
            <Button size="sm" className="h-8 px-2" onClick={() => handleOpenNewActivityModal()} data-testid="button-new-activity">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Nova Atividade</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 p-2 min-h-0 overflow-hidden">
          <div 
            className="calendar-container h-full" 
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
              popupOffset={{ x: 0, y: 5 }}
              draggableAccessor={(event: any) => !event.isBlock && !event.isGhost}
              resizable
              drilldownView={null}
              style={{ height: "100%" }}
              getNow={() => currentTime}
              scrollToTime={currentTime}
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
            className="fixed z-50 p-1 min-w-[220px] shadow-lg"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
            data-testid="context-menu"
          >
            {contextMenu.event ? (
              // Menu para evento existente
              <>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 hover-elevate"
                  onClick={() => {
                    if (contextMenu.event) {
                      setSelectedActivity(contextMenu.event.resource);
                      setViewDialogOpen(true);
                      setContextMenu(null);
                    }
                  }}
                  data-testid="context-menu-view-activity"
                >
                  <FileText className="w-4 h-4" />
                  Ver Detalhes
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 hover-elevate"
                  onClick={() => {
                    if (contextMenu.event) {
                      const targetDate = moment(contextMenu.date).format("YYYY-MM-DD");
                      handleDuplicateActivity(contextMenu.event.resource, targetDate);
                    }
                  }}
                  data-testid="context-menu-duplicate"
                >
                  <Copy className="w-4 h-4" />
                  Duplicar Atividade
                </Button>
                {contextMenu.event.resource.status !== "concluido" && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 hover-elevate"
                    onClick={() => {
                      if (contextMenu.event && confirm("Marcar esta atividade como concluída?")) {
                        markAsCompletedMutation.mutate(contextMenu.event.resource.id);
                      }
                    }}
                    data-testid="context-menu-mark-completed"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Marcar como Concluído
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 hover-elevate"
                  onClick={() => {
                    if (contextMenu.event) {
                      setSelectedActivity(contextMenu.event.resource);
                      handleEditActivity();
                      setContextMenu(null);
                    }
                  }}
                  data-testid="context-menu-edit"
                >
                  <Edit className="w-4 h-4" />
                  Editar Atividade
                </Button>
                <div className="h-px bg-border my-1" />
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 hover-elevate text-destructive"
                  onClick={() => {
                    if (contextMenu.event && confirm("Tem certeza que deseja excluir esta atividade?")) {
                      deleteMutation.mutate(contextMenu.event.resource.id);
                      setContextMenu(null);
                    }
                  }}
                  data-testid="context-menu-delete"
                >
                  <X className="w-4 h-4" />
                  Excluir Atividade
                </Button>
              </>
            ) : (
              // Menu para célula vazia
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 hover-elevate"
                onClick={handleOpenModalFromContext}
                data-testid="context-menu-add-activity"
              >
                <Plus className="w-4 h-4" />
                Adicionar Atividade
              </Button>
            )}
          </Card>
        </>
      )}

      {/* Legenda e Atalhos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Atalhos:</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">N</kbd> Nova
              </Badge>
              <Badge variant="outline" className="gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">/</kbd> Buscar
              </Badge>
              <Badge variant="outline" className="gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">←</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted rounded">→</kbd> Navegar
              </Badge>
              <Badge variant="outline" className="gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">T</kbd> Hoje
              </Badge>
              <Badge variant="outline" className="gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">F</kbd> Filtros
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Edite as informações da atividade" : "Crie uma nova atividade para um técnico"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              {/* Técnico */}
              <FormField
                control={form.control}
                name="technicianId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Técnico *</FormLabel>
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

              {/* Cliente */}
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => {
                  const selectedTechnicianId = form.watch("technicianId");
                  const selectedTechnician = selectedTechnicianId
                    ? technicians.find((t) => t.id === selectedTechnicianId)
                    : null;

                  const handleBaseSelect = () => {
                    if (!selectedTechnician) return;
                    if (
                      !selectedTechnician.baseAddress ||
                      !selectedTechnician.baseCity ||
                      !selectedTechnician.baseLatitude ||
                      !selectedTechnician.baseLongitude ||
                      isNaN(parseFloat(selectedTechnician.baseLatitude)) ||
                      isNaN(parseFloat(selectedTechnician.baseLongitude))
                    ) {
                      return;
                    }
                    form.setValue("clientId", undefined);
                    form.setValue("clientName", "Base do técnico (Home office)");
                    form.setValue("address", selectedTechnician.baseAddress);
                    form.setValue("numero", "");
                    form.setValue("bairro", "");
                    form.setValue("city", selectedTechnician.baseCity);
                    form.setValue("state", selectedTechnician.baseState || "");
                  };

                  const canShowBase =
                    selectedTechnician &&
                    selectedTechnician.baseAddress &&
                    selectedTechnician.baseCity &&
                    selectedTechnician.baseLatitude &&
                    !isNaN(parseFloat(selectedTechnician.baseLatitude)) &&
                    selectedTechnician.baseLongitude &&
                    !isNaN(parseFloat(selectedTechnician.baseLongitude));

                  return (
                    <FormItem className="flex flex-col relative">
                      <FormLabel>Cliente *</FormLabel>
                      <FormControl>
                        <DatasulClientField
                          value={field.value || ""}
                          onChangeText={(text) => {
                            field.onChange(text);
                            form.setValue("clientId", "");
                          }}
                          onSelectClient={(c) => {
                            field.onChange(c.nome);
                            form.setValue("clientId", "");
                            form.setValue("address", "");
                            form.setValue("numero", "");
                            form.setValue("bairro", "");
                            form.setValue("city", c.cidade || "");
                            form.setValue("state", c.estado || "");
                          }}
                          baseOption={
                            canShowBase
                              ? {
                                  label: "Base do técnico (Home office)",
                                  description: `${selectedTechnician?.baseAddress}, ${selectedTechnician?.baseCity}`,
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

              {/* CEP removido - manter apenas cidade e estado */}

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
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedActivity?.title || "Detalhes da Atividade"}
            </DialogTitle>
            <DialogDescription>
              Visualize as informações completas da atividade
            </DialogDescription>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-5">
              {/* Técnico e Cliente */}
              <div className="grid grid-cols-2 gap-4">
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

              {/* Local de Realização */}
              {(selectedActivity as any).location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Executado em:</p>
                    <p className="text-base font-medium">{(selectedActivity as any).location}</p>
                  </div>
                </div>
              )}

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
                    <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-3 gap-4">
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
          <DialogFooter className="mt-4 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setViewDialogOpen(false)}
              data-testid="button-close-view"
            >
              Fechar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedActivity && confirm("Tem certeza que deseja excluir esta atividade?")) {
                  deleteMutation.mutate(selectedActivity.id);
                  setViewDialogOpen(false);
                }
              }}
              data-testid="button-delete-activity"
            >
              Excluir
            </Button>
            {selectedActivity?.status === "planejado" && (
              <Button
                variant="secondary"
                onClick={() => setRescheduleModalOpen(true)}
                data-testid="button-reschedule-activity"
              >
                <CalendarIcon className="w-4 h-4 mr-2" />
                Reagendar
              </Button>
            )}
            <Button
              onClick={handleEditActivity}
              data-testid="button-edit-activity"
            >
              Editar Atividade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RescheduleModal
        open={rescheduleModalOpen}
        onOpenChange={(open) => {
          setRescheduleModalOpen(open);
          if (!open) setDragRescheduleData(null);
        }}
        onConfirm={async (data) => {
          if (selectedActivity) {
            await rescheduleMutation.mutateAsync({ id: selectedActivity.id, data });
            setDragRescheduleData(null);
          }
        }}
        activityId={selectedActivity?.id}
        activityName={selectedActivity?.title || ""}
        clientName={selectedActivity?.clientName || ""}
        currentDate={dragRescheduleData ? dragRescheduleData.start : (selectedActivity?.scheduledDate ? new Date(selectedActivity.scheduledDate) : undefined)}
        currentStartTime={dragRescheduleData ? moment(dragRescheduleData.start).format("HH:mm") : selectedActivity?.startTime}
        currentEndTime={dragRescheduleData ? moment(dragRescheduleData.end).format("HH:mm") : selectedActivity?.endTime}
        rescheduleCount={(selectedActivity as any)?.rescheduleCount || 0}
        isLoading={rescheduleMutation.isPending}
      />
      </div>
    </>
  );
}
