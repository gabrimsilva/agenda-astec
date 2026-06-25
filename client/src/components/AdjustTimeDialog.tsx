import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Clock, AlertCircle } from "lucide-react";

interface AdjustTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkInTime: Date | string | null;
  onConfirm: (adjustedCheckInTime: Date, adjustedCheckOutTime: Date) => void;
  isLoading?: boolean;
}

function formatTimeForInput(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTimeToDate(timeStr: string, baseDate: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function AdjustTimeDialog({
  open,
  onOpenChange,
  checkInTime,
  onConfirm,
  isLoading = false,
}: AdjustTimeDialogProps) {
  const { toast } = useToast();
  
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    
    const now = new Date();
    
    if (checkInTime) {
      const checkIn = new Date(checkInTime);
      setStartDate(formatDateForInput(checkIn));
      setStartTime(formatTimeForInput(checkIn));
    } else {
      setStartDate(formatDateForInput(now));
      setStartTime(formatTimeForInput(now));
    }
    
    setEndDate(formatDateForInput(now));
    setEndTime(formatTimeForInput(now));
    setValidationError(null);
  }, [open, checkInTime]);

  const validateAndConfirm = () => {
    if (!startDate || !startTime || !endDate || !endTime) {
      setValidationError("Por favor, preencha todos os campos de horário.");
      return;
    }

    const adjustedStart = new Date(`${startDate}T${startTime}:00`);
    const adjustedEnd = new Date(`${endDate}T${endTime}:00`);

    if (isNaN(adjustedStart.getTime()) || isNaN(adjustedEnd.getTime())) {
      setValidationError("Data ou horário inválido. Por favor, verifique os valores.");
      return;
    }

    if (adjustedEnd < adjustedStart) {
      setValidationError("O horário de término não pode ser anterior ao horário de início.");
      return;
    }

    const now = new Date();
    if (adjustedEnd > now) {
      setValidationError("O horário de término não pode ser no futuro.");
      return;
    }

    setValidationError(null);
    onConfirm(adjustedStart, adjustedEnd);
  };

  const handleCancel = () => {
    setValidationError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Ajustar Horário da Atividade
          </DialogTitle>
          <DialogDescription className="text-sm">
            Confirme ou ajuste os horários de início e término da atividade antes de finalizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Hora de Início</Label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Data</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-12 text-base"
                  data-testid="input-start-date"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Horário</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-12 text-base"
                  data-testid="input-start-time"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Hora de Término</Label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Data</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-12 text-base"
                  data-testid="input-end-date"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Horário</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-12 text-base"
                  data-testid="input-end-time"
                />
              </div>
            </div>
          </div>

          {validationError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="h-12 text-base w-full sm:w-auto"
            disabled={isLoading}
            data-testid="button-cancel-time-adjust"
          >
            Cancelar
          </Button>
          <Button
            onClick={validateAndConfirm}
            className="h-12 text-base w-full sm:w-auto"
            disabled={isLoading}
            data-testid="button-confirm-time-adjust"
          >
            {isLoading ? "Salvando..." : "Salvar e Concluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
