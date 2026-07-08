import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Clock, History, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface RescheduleHistory {
  id: string;
  activityId: string;
  previousDate: string;
  newDate: string;
  previousStartTime?: string;
  previousEndTime?: string;
  newStartTime?: string;
  newEndTime?: string;
  reason: string;
  rescheduledBy?: string;
  rescheduledByName?: string;
  rescheduledAt: string;
  rescheduleNumber: number;
}

interface RescheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { newDate: string; newEndDate?: string; newStartTime: string; newEndTime: string; reason: string }) => Promise<void>;
  activityId?: string;
  activityName?: string;
  clientName?: string;
  currentDate?: Date;
  currentStartTime?: string;
  currentEndTime?: string;
  rescheduleCount?: number;
  isLoading?: boolean;
  isMultiDay?: boolean;
  endDate?: Date;
}

export function RescheduleModal({
  open,
  onOpenChange,
  onConfirm,
  activityId,
  activityName,
  clientName,
  currentDate,
  currentStartTime,
  currentEndTime,
  rescheduleCount = 0,
  isLoading = false,
  isMultiDay = false,
  endDate,
}: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(currentDate);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | undefined>(endDate);
  const [startTime, setStartTime] = useState(currentStartTime || "08:00");
  const [endTime, setEndTime] = useState(currentEndTime || "17:00");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const seriesDurationDays = (() => {
    if (!currentDate || !endDate) return 0;
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  })();

  const { data: rescheduleHistory } = useQuery<RescheduleHistory[]>({
    queryKey: ['/api/activities', activityId, 'reschedules'],
    enabled: open && !!activityId && rescheduleCount > 0,
  });

  useEffect(() => {
    if (open) {
      setSelectedDate(currentDate);
      setSelectedEndDate(endDate);
      setStartTime(currentStartTime || "08:00");
      setEndTime(currentEndTime || "17:00");
      setReason("");
      setHistoryOpen(false);
    }
  }, [open, currentDate, currentStartTime, currentEndTime, endDate]);

  const handleConfirm = async () => {
    if (!selectedDate || !reason.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Format dates as YYYY-MM-DD strings (not ISO with timezone conversion)
      const newDateStr = format(selectedDate, "yyyy-MM-dd");
      const newEndDateStr = selectedEndDate ? format(selectedEndDate, "yyyy-MM-dd") : undefined;
      
      await onConfirm({
        newDate: newDateStr,
        newEndDate: newEndDateStr,
        newStartTime: startTime,
        newEndTime: endTime,
        reason: reason.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao reagendar atividade:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSeriesEndValid = !isMultiDay || (selectedEndDate && selectedDate && selectedEndDate >= selectedDate);
  const isValid = selectedDate && reason.trim().length > 0 && isSeriesEndValid;

  const formatDateRange = () => {
    if (!currentDate || !endDate) return "";
    return `${format(currentDate, "dd/MM")} a ${format(endDate, "dd/MM/yyyy")}`;
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="reschedule-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Reagendar Atividade
          </DialogTitle>
          <DialogDescription>
            {activityName && <span className="font-medium">{activityName}</span>}
            {clientName && <span className="text-muted-foreground"> - {clientName}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {rescheduleCount > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm cursor-pointer hover-elevate">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 flex-shrink-0" />
                    <span>Esta atividade já foi reagendada {rescheduleCount}x</span>
                  </div>
                  {historyOpen ? (
                    <ChevronUp className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {rescheduleHistory && rescheduleHistory.length > 0 ? (
                  rescheduleHistory.map((item) => {
                    const rescheduledAtDate = item.rescheduledAt ? new Date(item.rescheduledAt) : null;
                    const previousDateParsed = item.previousDate ? new Date(item.previousDate + "T00:00:00Z") : null;
                    const newDateParsed = item.newDate ? new Date(item.newDate + "T00:00:00Z") : null;
                    
                    return (
                    <div
                      key={item.id}
                      className="p-2 rounded-md bg-muted/50 text-xs space-y-1 border border-border"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-muted-foreground">
                          Reagendamento #{item.rescheduleNumber}
                        </span>
                        <span className="text-muted-foreground">
                          {rescheduledAtDate && !isNaN(rescheduledAtDate.getTime()) 
                            ? format(rescheduledAtDate, "dd/MM/yy HH:mm")
                            : "-"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>
                          {previousDateParsed && !isNaN(previousDateParsed.getTime())
                            ? format(previousDateParsed, "dd/MM", { locale: ptBR })
                            : "-"}
                        </span>
                        {item.previousStartTime && <span className="text-xs">({item.previousStartTime})</span>}
                        <span>→</span>
                        <span className="text-foreground font-medium">
                          {newDateParsed && !isNaN(newDateParsed.getTime())
                            ? format(newDateParsed, "dd/MM", { locale: ptBR })
                            : "-"}
                        </span>
                        {item.newStartTime && <span className="text-xs">({item.newStartTime})</span>}
                      </div>
                      <div className="text-muted-foreground italic">
                        "{item.reason}"
                      </div>
                      {item.rescheduledByName && (
                        <div className="text-muted-foreground text-[10px]">
                          Por: {item.rescheduledByName}
                        </div>
                      )}
                    </div>
                  );})
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    Carregando histórico...
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {isMultiDay && endDate && currentDate && (
            <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
              <p>Série: <strong>{formatDateRange()}</strong></p>
              <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                Toda a série será movida para a nova data.
              </p>
            </div>
          )}

          {!isMultiDay && currentDate && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <div className="text-muted-foreground mb-1">Data atual:</div>
              <div className="font-medium">
                {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                {currentStartTime && currentEndTime && (
                  <span className="text-muted-foreground ml-2">
                    {currentStartTime} - {currentEndTime}
                  </span>
                )}
              </div>
            </div>
          )}

          {isMultiDay ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newStartDate">Nova Data Início</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="newStartDate"
                    type="date"
                    value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        const newStart = new Date(e.target.value + "T12:00:00");
                        setSelectedDate(newStart);
                        const newEnd = new Date(newStart);
                        newEnd.setDate(newEnd.getDate() + seriesDurationDays);
                        setSelectedEndDate(newEnd);
                      } else {
                        setSelectedDate(undefined);
                        setSelectedEndDate(undefined);
                      }
                    }}
                    min={format(new Date(), "yyyy-MM-dd")}
                    className="pl-10"
                    data-testid="input-select-date"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEndDate">Nova Data Fim</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="newEndDate"
                    type="date"
                    value={selectedEndDate ? format(selectedEndDate, "yyyy-MM-dd") : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedEndDate(new Date(e.target.value + "T12:00:00"));
                      } else {
                        setSelectedEndDate(undefined);
                      }
                    }}
                    min={selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")}
                    className="pl-10"
                    data-testid="input-select-end-date"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="newDate">Nova Data</Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newDate"
                  type="date"
                  value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(new Date(e.target.value + "T12:00:00"));
                    } else {
                      setSelectedDate(undefined);
                    }
                  }}
                  min={format(new Date(), "yyyy-MM-dd")}
                  className="pl-10"
                  data-testid="input-select-date"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Hora Início</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="pl-9"
                  data-testid="input-start-time"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Hora Fim</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="pl-9"
                  data-testid="input-end-time"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo do Reagendamento *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Informe o motivo do reagendamento..."
              className="min-h-[80px]"
              data-testid="input-reason"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting || isLoading}
            data-testid="button-confirm-reschedule"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarDays className="w-4 h-4" />
            )}
            {isSubmitting ? "Reagendando..." : "Confirmar Reagendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
