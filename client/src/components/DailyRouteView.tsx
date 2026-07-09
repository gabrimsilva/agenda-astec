import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, CheckCircle, ChevronDown, Trash2, Pencil, FileText, Home, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ActivityClientContact } from "@/components/activities/ActivityClientContact";
import { useState } from "react";
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

const statusLabels = {
  planejado: "Planejado",
  aCaminho: "A Caminho",
  emExecucao: "Em Execução",
  concluido: "Concluído",
  concluidoSemSucesso: "Não Realizado",
  reprovado: "Reprovado",
  cancelado: "Cancelado",
};

const statusColors = {
  planejado: "bg-status-planejado",
  aCaminho: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200",
  emExecucao: "bg-status-emExecucao",
  concluido: "bg-status-concluido",
  concluidoSemSucesso: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200",
  reprovado: "bg-status-reprovado",
  cancelado: "bg-status-cancelado",
};

const statusBorderColors = {
  planejado: "#71717a",
  aCaminho: "#f59e0b",
  emExecucao: "#3b82f6",
  concluido: "#10b981",
  concluidoSemSucesso: "#f97316",
  reprovado: "#ef4444",
  cancelado: "#6b7280",
};

// Labels para meios de transporte
const transportModeLabels: Record<string, string> = {
  carro: "Carro",
  aviao: "Avião",
  onibus: "Ônibus",
  outro: "Outro",
  nenhum: "Sem deslocamento",
};

interface TimeSegment {
  type: "ida" | "execucao" | "volta";
  minutes: number;
  transportMode?: string;
}

interface RouteStop {
  id: string;
  order: number;
  client: string;
  title?: string; // Título da atividade
  description?: string | null; // Descrição da atividade
  address: string;
  startTime: string;
  endTime: string;
  status: "pending" | "inProgress" | "completed";
  statusLabel: "planejado" | "aCaminho" | "emExecucao" | "concluido" | "concluidoSemSucesso" | "reprovado" | "cancelado";
  activityType: string;
  activityTypeColor?: string;
  workCompleted?: boolean | null;
  clientContact?: {
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  };
  hideNavigation?: boolean; // Hide navigation button for "adicional" activities and home office
  isHomeOffice?: boolean; // True for "Base do técnico (Home office)" activities
  ratStatus?: string; // RAT status: pendente, rascunho, completa
  ratSentAt?: string | null; // When the RAT was sent
  // Campos de etapas de tempo
  navigationStartTime?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  transportMode?: string | null;
  isMultiDay?: boolean;
  endDate?: string | null;
  actualTravelMinutes?: number | null;
  actualDurationMinutes?: number | null;
  actualReturnMinutes?: number | null;
  nextActivityTravelMinutes?: number | null; // Tempo de IDA da próxima atividade (= VOLTA desta)
  isLastActivity?: boolean; // Se é a última atividade do dia
  skipTravel?: boolean; // Tipo configurado SEM cálculo de trajeto (sem IDA/VOLTA)
}

interface DailyRouteViewProps {
  date: string;
  stops: RouteStop[];
  onStartRoute?: () => void;
  onStartSingleNavigation?: (stopId: string) => void;
  onCheckIn?: (stopId: string) => void;
  onCheckOut?: (stopId: string) => void;
  onOpenIdaModal?: (stopId: string) => void; // V3: Abrir modal de tempo de IDA quando status é "aCaminho"
  onRegisterReturn?: (stopId: string) => void; // V3: Registrar tempo de volta para atividades concluídas
  onEdit?: (stopId: string) => void;
  onDelete?: (stopId: string) => void;
  onReschedule?: (stopId: string) => void;
  isDeleting?: boolean;
}

export function DailyRouteView({ date, stops, onStartSingleNavigation, onCheckIn, onCheckOut, onOpenIdaModal, onRegisterReturn, onEdit, onDelete, onReschedule, isDeleting }: DailyRouteViewProps) {
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stopToDelete, setStopToDelete] = useState<string | null>(null);
  const completedStops = stops.filter((s) => s.status === "completed").length;
  const totalStops = stops.length;

  const toggleExpand = (stopId: string) => {
    setExpandedStopId(expandedStopId === stopId ? null : stopId);
  };

  const handleDeleteClick = (stopId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setStopToDelete(stopId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (stopToDelete && onDelete) {
      onDelete(stopToDelete);
      setDeleteDialogOpen(false);
      setStopToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setStopToDelete(null);
  };

  return (
    <div className="space-y-4" data-testid="view-daily-route">
      {/* Header compacto */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Rota do Dia</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{date}</p>
            </div>
            <Badge variant="outline" className="text-sm">
              {completedStops}/{totalStops} concluídos
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Lista de atividades com animações */}
      <div className="space-y-3">
        {stops.map((stop, index) => {
          const isExpanded = expandedStopId === stop.id;
          
          return (
            <motion.div
              key={stop.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Card
                className={cn(
                  "relative overflow-visible transition-all duration-200 pl-0",
                  stop.status === "completed" && "opacity-60",
                  isExpanded && "ring-2 ring-primary/20"
                )}
                style={{
                  borderLeft: `3px solid ${statusBorderColors[stop.statusLabel]}`
                }}
                data-testid={`card-stop-${stop.id}`}
              >
                <CardContent className="p-0 pl-1">
                  {/* Header clicável */}
                  <button
                    onClick={() => toggleExpand(stop.id)}
                    className="w-full p-4 text-left hover-elevate transition-all duration-200"
                    data-testid={`button-toggle-${stop.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold shrink-0 transition-transform duration-200",
                        stop.status === "completed" ? "bg-success text-white" : 
                        stop.status === "inProgress" ? "bg-warning text-white" : 
                        "bg-muted text-muted-foreground",
                        isExpanded && "scale-110"
                      )}>
                        {stop.status === "completed" ? <CheckCircle className="h-4 w-4" /> : stop.order}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge 
                                variant="outline" 
                                className={cn("text-xs font-semibold shrink-0", statusColors[stop.statusLabel])}
                                data-testid={`badge-status-${stop.id}`}
                              >
                                {statusLabels[stop.statusLabel]}
                              </Badge>
                              {stop.status === "completed" && stop.ratStatus && (
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-xs font-medium shrink-0 flex items-center gap-1",
                                    stop.ratStatus === "pendente" && "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
                                    stop.ratStatus === "rascunho" && "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
                                    stop.ratStatus === "completa" && !stop.ratSentAt && "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
                                    stop.ratSentAt && "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                                  )}
                                  data-testid={`badge-rat-${stop.id}`}
                                >
                                  <FileText className="h-3 w-3" />
                                  RAT {stop.ratStatus === "pendente" ? "Pendente" : 
                                       stop.ratStatus === "rascunho" ? "Rascunho" : 
                                       stop.ratStatus === "completa" ? "Completa" : "Enviada"}
                                </Badge>
                              )}
                            </div>
                            {stop.title && (
                              <p className="text-sm font-medium text-primary mt-1">{stop.title}</p>
                            )}
                            <h4 className="font-semibold text-base mt-0.5">Cliente: {stop.client}</h4>
                          </div>
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                          </motion.div>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>{stop.startTime} - {stop.endTime}</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Botão Iniciar Deslocamento - Substitui o passo de navegação */}
                  {stop.status === "pending" && stop.statusLabel !== "aCaminho" && !stop.hideNavigation && (
                    <div className="px-4 pb-3">
                      <Button 
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartSingleNavigation?.(stop.id);
                        }}
                        data-testid={`button-start-displacement-${stop.id}`}
                      >
                        <Navigation className="h-4 w-4" />
                        Iniciar Deslocamento
                      </Button>
                    </div>
                  )}

                  {/* Botão Cheguei no Local - Sempre visível (fora do expandível) */}
                  {stop.statusLabel === "aCaminho" && (
                    <div className="px-4 pb-3">
                      <Button 
                        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenIdaModal?.(stop.id);
                        }}
                        data-testid={`button-arrived-${stop.id}`}
                      >
                        <MapPin className="h-4 w-4" />
                        Cheguei no Local
                      </Button>
                    </div>
                  )}

                  {/* Botão Iniciar Atividade - Para atividades que não precisam de navegação (home office, adicional) */}
                  {stop.hideNavigation && !stop.isHomeOffice && stop.status === "pending" && stop.statusLabel === "planejado" && (
                    <div className="px-4 pb-3">
                      <Button 
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCheckIn?.(stop.id);
                        }}
                        data-testid={`button-start-activity-adicional-${stop.id}`}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Iniciar Atividade
                      </Button>
                    </div>
                  )}

                  {/* Botão Iniciar Atividade - Home office: pular IDA, check-in direto */}
                  {stop.isHomeOffice && stop.status === "pending" && stop.statusLabel === "planejado" && (
                    <div className="px-4 pb-3">
                      <Button 
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCheckIn?.(stop.id);
                        }}
                        data-testid={`button-start-activity-homeoffice-${stop.id}`}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Iniciar Atividade
                      </Button>
                    </div>
                  )}

                  {/* Conteúdo expansível */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-2 border-t space-y-3">
                          {/* Endereço */}
                          <div className="flex items-start gap-2 text-sm">
                            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                            <span className="flex-1 text-muted-foreground">{stop.address}</span>
                          </div>

                          {/* Contato do Cliente */}
                          {stop.clientContact && (stop.clientContact.contactName || stop.clientContact.contactPhone || stop.clientContact.contactEmail) && (
                            <div className="pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-2">Contato</p>
                              <ActivityClientContact
                                contactName={stop.clientContact.contactName}
                                contactPhone={stop.clientContact.contactPhone}
                                contactEmail={stop.clientContact.contactEmail}
                                variant="compact"
                              />
                            </div>
                          )}
                          
                          {/* Descrição (limitada a 80 caracteres) */}
                          {stop.description && (
                            <div className="pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                              <p className="text-sm">
                                {stop.description.length > 80 
                                  ? `${stop.description.substring(0, 80)}...` 
                                  : stop.description}
                              </p>
                            </div>
                          )}
                          
                          {/* Tipo de Atividade - DISCRETO */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ 
                                backgroundColor: stop.activityTypeColor || '#3b82f6',
                                opacity: 0.6
                              }}
                            />
                            <span>{stop.activityType}</span>
                          </div>
                          
                          {/* Multi-dia badge */}
                          {stop.isMultiDay && stop.endDate && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
                                Multi-dia: até {new Date(stop.endDate).toLocaleDateString('pt-BR')}
                              </Badge>
                            </div>
                          )}
                          
                          {/* Etapas de Tempo - para atividades concluídas */}
                          {stop.status === "completed" && (stop.navigationStartTime || stop.checkInTime || stop.checkOutTime) && (
                            <div className="pt-2 border-t">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Etapas de tempo</p>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                {/* Ida - Para avião: não contabilizar tempo real de deslocamento, usar tempo agendado como adicional */}
                                {stop.transportMode === "aviao" ? (
                                  // Avião: mostrar tempo agendado de voo como "adicional"
                                  <div className="bg-purple-100 dark:bg-purple-900/50 rounded-lg p-2 border border-purple-200 dark:border-purple-700">
                                    <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold">VOO</div>
                                    <div className="text-base font-bold text-purple-800 dark:text-purple-200">
                                      Adicional
                                    </div>
                                    <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">
                                      Tempo agendado
                                    </div>
                                  </div>
                                ) : (
                                  // Outros meios de transporte: mostrar tempo de ida
                                  (stop.actualTravelMinutes !== null && stop.actualTravelMinutes !== undefined && stop.actualTravelMinutes >= 0) ? (
                                    <div className="bg-amber-100 dark:bg-amber-900/50 rounded-lg p-2 border border-amber-300 dark:border-amber-600">
                                      <div className="text-xs text-amber-700 dark:text-amber-300 font-semibold">IDA</div>
                                      <div className="text-base font-bold text-amber-800 dark:text-amber-200">
                                        {stop.actualTravelMinutes}min
                                      </div>
                                    </div>
                                  ) : stop.navigationStartTime && stop.checkInTime ? (
                                    <div className="bg-amber-100 dark:bg-amber-900/50 rounded-lg p-2 border border-amber-300 dark:border-amber-600">
                                      <div className="text-xs text-amber-700 dark:text-amber-300 font-semibold">IDA</div>
                                      <div className="text-base font-bold text-amber-800 dark:text-amber-200">
                                        {Math.round((new Date(stop.checkInTime).getTime() - new Date(stop.navigationStartTime).getTime()) / 60000)}min
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                                      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">IDA</div>
                                      <div className="text-base font-bold text-gray-400 dark:text-gray-500">-</div>
                                    </div>
                                  )
                                )}
                                
                                {/* Execução */}
                                {stop.checkInTime && stop.checkOutTime ? (
                                  stop.workCompleted === false ? (
                                    <div className="bg-red-100 dark:bg-red-900/50 rounded-lg p-2 border border-red-300 dark:border-red-600">
                                      <div className="text-xs text-red-700 dark:text-red-300 font-semibold">PERDA</div>
                                      <div className="text-base font-bold text-red-800 dark:text-red-200">
                                        {stop.actualDurationMinutes !== null && stop.actualDurationMinutes !== undefined 
                                          ? `${stop.actualDurationMinutes}min`
                                          : `${Math.round((new Date(stop.checkOutTime).getTime() - new Date(stop.checkInTime).getTime()) / 60000)}min`
                                        }
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-blue-100 dark:bg-blue-900/50 rounded-lg p-2 border border-blue-300 dark:border-blue-600">
                                      <div className="text-xs text-blue-700 dark:text-blue-300 font-semibold">EXECUÇÃO</div>
                                      <div className="text-base font-bold text-blue-800 dark:text-blue-200">
                                        {stop.actualDurationMinutes !== null && stop.actualDurationMinutes !== undefined 
                                          ? `${stop.actualDurationMinutes}min`
                                          : `${Math.round((new Date(stop.checkOutTime).getTime() - new Date(stop.checkInTime).getTime()) / 60000)}min`
                                        }
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">EXECUÇÃO</div>
                                    <div className="text-base font-bold text-gray-400 dark:text-gray-500">-</div>
                                  </div>
                                )}
                                
                                {/* Volta */}
                                {(() => {
                                  // Prioridade: 1. actualReturnMinutes (volta à base registrada)
                                  //             2. nextActivityTravelMinutes (IDA da próxima atividade = VOLTA desta)
                                  const returnMinutes = stop.actualReturnMinutes ?? stop.nextActivityTravelMinutes;
                                  const isNextActivity = (stop.actualReturnMinutes === null || stop.actualReturnMinutes === undefined) && stop.nextActivityTravelMinutes;
                                  
                                  if (returnMinutes !== null && returnMinutes !== undefined && returnMinutes >= 0) {
                                    return (
                                      <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-2 border border-green-300 dark:border-green-600">
                                        <div className="text-xs text-green-700 dark:text-green-300 font-semibold">
                                          {isNextActivity ? "PRÓXIMA" : "VOLTA"}
                                        </div>
                                        <div className="text-base font-bold text-green-800 dark:text-green-200">
                                          {returnMinutes}min
                                        </div>
                                        {isNextActivity && (
                                          <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                                            → próx. visita
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  
                                  // Home office ou tipo sem trajeto: sem VOLTA, mostra traço
                                  if (stop.isHomeOffice || stop.skipTravel) {
                                    return (
                                      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">VOLTA</div>
                                        <div className="text-base font-bold text-gray-400 dark:text-gray-500">-</div>
                                      </div>
                                    );
                                  }
                                  
                                  // Card clicável para registrar volta quando não tem tempo registrado
                                  if (onRegisterReturn) {
                                    return (
                                      <div 
                                        className="bg-primary/10 dark:bg-primary/20 rounded-lg p-2 border-2 border-dashed border-primary cursor-pointer hover:bg-primary/20 dark:hover:bg-primary/30 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onRegisterReturn(stop.id);
                                        }}
                                        data-testid={`card-register-return-${stop.id}`}
                                      >
                                        <div className="text-xs text-primary font-semibold">VOLTA</div>
                                        <div className="text-sm font-bold text-primary flex items-center gap-1">
                                          <Home className="h-3 w-3" />
                                          Registrar
                                        </div>
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                                      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">VOLTA</div>
                                      <div className="text-base font-bold text-gray-400 dark:text-gray-500">-</div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                          
                          {/* Botões de ação */}
                          <div className="space-y-2 pt-2">
                            {/* Botão Editar - apenas para atividades não concluídas/canceladas */}
                            {stop.statusLabel !== "concluido" && stop.statusLabel !== "concluidoSemSucesso" && stop.statusLabel !== "cancelado" && onEdit && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                              >
                                <Button 
                                  className="w-full gap-2"
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(stop.id);
                                  }}
                                  data-testid={`button-edit-${stop.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Editar Atividade
                                </Button>
                              </motion.div>
                            )}

                            {/* Botão Reagendar - apenas para atividades planejadas */}
                            {stop.statusLabel === "planejado" && onReschedule && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.07 }}
                              >
                                <Button 
                                  className="w-full gap-2"
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onReschedule(stop.id);
                                  }}
                                  data-testid={`button-reschedule-${stop.id}`}
                                >
                                  <CalendarDays className="h-4 w-4" />
                                  Reagendar
                                </Button>
                              </motion.div>
                            )}
                            
                            {/* Botão Concluir Atividade */}
                            {stop.status === "inProgress" && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                              >
                                <Button 
                                  className="w-full"
                                  size="sm"
                                  onClick={() => onCheckOut?.(stop.id)}
                                  data-testid={`button-checkout-${stop.id}`}
                                >
                                  Concluir Atividade
                                </Button>
                              </motion.div>
                            )}
                            
                            {/* Botão Excluir - apenas para atividades não concluídas/canceladas */}
                            {stop.statusLabel !== "concluido" && stop.statusLabel !== "concluidoSemSucesso" && stop.statusLabel !== "cancelado" && onDelete && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                              >
                                <Button 
                                  className="w-full gap-2"
                                  size="sm"
                                  variant="destructive"
                                  onClick={(e) => handleDeleteClick(stop.id, e)}
                                  disabled={isDeleting}
                                  data-testid={`button-delete-${stop.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {isDeleting ? "Excluindo..." : "Excluir Atividade"}
                                </Button>
                              </motion.div>
                            )}
                            
                            {/* Botão Registrar Volta - para última atividade concluída sem volta registrada (não home office) */}
                            {(stop.statusLabel === "concluido" || stop.statusLabel === "concluidoSemSucesso") && 
                             stop.isLastActivity && 
                             !stop.isHomeOffice &&
                             !stop.skipTravel &&
                             (stop.actualReturnMinutes === null || stop.actualReturnMinutes === undefined) && 
                             onRegisterReturn && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                              >
                                <Button 
                                  className="w-full gap-2"
                                  size="sm"
                                  variant="default"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRegisterReturn(stop.id);
                                  }}
                                  data-testid={`button-register-return-${stop.id}`}
                                >
                                  <Home className="h-4 w-4" />
                                  Registrar Volta à Base
                                </Button>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta atividade? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel} data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
