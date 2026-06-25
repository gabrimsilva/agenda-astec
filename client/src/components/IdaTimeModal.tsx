import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Navigation, Clock, Car, Bike, Bus, Plane, Footprints, Plus, Trash2 } from "lucide-react";
import { randomId } from "@/lib/utils";

interface IdaTimeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { minutesReported: number; gpsEtaMinutes?: number; transportType?: string; segments?: TransportSegment[] }) => Promise<void>;
  activityName?: string;
  clientName?: string;
  gpsEtaMinutes?: number | null;
  isLoading?: boolean;
}

interface TransportSegment {
  id: string;
  type: string;
  hours: number;
  minutesPart: number;
}

const TRANSPORT_OPTIONS = [
  { value: "carro", label: "Carro", icon: Car },
  { value: "moto", label: "Moto", icon: Bike },
  { value: "aviao", label: "Avião", icon: Plane },
  { value: "onibus", label: "Ônibus", icon: Bus },
  { value: "a_pe", label: "A pé", icon: Footprints },
];

const getTransportLabel = (value: string) => {
  const option = TRANSPORT_OPTIONS.find(o => o.value === value);
  return option?.label || value;
};

const getTransportIcon = (value: string) => {
  const option = TRANSPORT_OPTIONS.find(o => o.value === value);
  return option?.icon || Car;
};

const segmentToMinutes = (s: TransportSegment) => (s.hours || 0) * 60 + (s.minutesPart || 0);

const minutesToHM = (total: number) => ({
  hours: Math.floor(total / 60),
  minutesPart: total % 60,
});

const formatDuration = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
};

export function IdaTimeModal({
  open,
  onOpenChange,
  onConfirm,
  activityName,
  clientName,
  gpsEtaMinutes,
  isLoading = false,
}: IdaTimeModalProps) {
  const [segments, setSegments] = useState<TransportSegment[]>([
    { id: randomId(), type: "carro", hours: 0, minutesPart: 0 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (gpsEtaMinutes) {
        const { hours, minutesPart } = minutesToHM(Math.round(gpsEtaMinutes));
        setSegments([{ id: randomId(), type: "carro", hours, minutesPart }]);
      } else {
        setSegments([{ id: randomId(), type: "carro", hours: 0, minutesPart: 0 }]);
      }
    }
  }, [open, gpsEtaMinutes]);

  const totalMinutes = segments.reduce((sum, s) => sum + segmentToMinutes(s), 0);

  const addSegment = () => {
    setSegments([...segments, { id: randomId(), type: "carro", hours: 0, minutesPart: 0 }]);
  };

  const removeSegment = (id: string) => {
    if (segments.length > 1) {
      setSegments(segments.filter(s => s.id !== id));
    }
  };

  const updateSegmentType = (id: string, value: string) => {
    setSegments(segments.map(s => s.id === id ? { ...s, type: value } : s));
  };

  const updateSegmentHours = (id: string, value: string) => {
    const parsed = parseInt(value, 10);
    setSegments(segments.map(s => s.id === id ? { ...s, hours: isNaN(parsed) ? 0 : Math.max(0, parsed) } : s));
  };

  const updateSegmentMins = (id: string, value: string) => {
    const parsed = parseInt(value, 10);
    const clamped = isNaN(parsed) ? 0 : Math.min(59, Math.max(0, parsed));
    setSegments(segments.map(s => s.id === id ? { ...s, minutesPart: clamped } : s));
  };

  const handleConfirm = async () => {
    if (totalMinutes < 0) return;
    
    setIsSubmitting(true);
    try {
      const mainTransportType = segments.length > 0 ? segments[0].type : "carro";
      
      await onConfirm({
        minutesReported: totalMinutes,
        gpsEtaMinutes: gpsEtaMinutes || undefined,
        transportType: mainTransportType,
        segments: segments.filter(s => segmentToMinutes(s) > 0).map(s => ({
          id: s.id,
          type: s.type,
          minutes: segmentToMinutes(s),
        })),
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao registrar tempo de IDA:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = totalMinutes >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="ida-time-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Tempo de Deslocamento (IDA)
          </DialogTitle>
          <DialogDescription>
            {clientName ? (
              <>Registre quanto tempo levou para chegar até <strong>{clientName}</strong></>
            ) : (
              "Registre quanto tempo levou para chegar até o local da atividade"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {gpsEtaMinutes && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Tempo estimado pelo GPS: <strong>{formatDuration(Math.round(gpsEtaMinutes))}</strong>
              </span>
            </div>
          )}

          <div className="space-y-3">
            <Label>Segmentos de transporte</Label>
            
            {segments.map((segment, index) => {
              const Icon = getTransportIcon(segment.type);
              return (
                <div key={segment.id} className="p-3 bg-muted/50 rounded-md space-y-2">
                  <Select 
                    value={segment.type} 
                    onValueChange={(value) => updateSegmentType(segment.id, value)}
                  >
                    <SelectTrigger data-testid={`select-transport-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <option.icon className="h-4 w-4" />
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        type="number"
                        min="0"
                        value={segment.hours || ""}
                        onChange={(e) => updateSegmentHours(segment.id, e.target.value)}
                        placeholder="0"
                        className="text-center"
                        data-testid={`input-hours-${index}`}
                      />
                      <span className="text-sm text-muted-foreground shrink-0">h</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={segment.minutesPart || ""}
                        onChange={(e) => updateSegmentMins(segment.id, e.target.value)}
                        placeholder="0"
                        className="text-center"
                        data-testid={`input-minutes-${index}`}
                      />
                      <span className="text-sm text-muted-foreground shrink-0">min</span>
                    </div>
                    {segments.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSegment(segment.id)}
                        className="text-destructive hover:text-destructive shrink-0"
                        data-testid={`button-remove-segment-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSegment}
              className="w-full gap-2"
              data-testid="button-add-segment"
            >
              <Plus className="h-4 w-4" />
              Adicionar outro transporte
            </Button>
          </div>

          {segments.length > 1 && (
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-md border border-primary/20">
              <span className="text-sm font-medium">Tempo total:</span>
              <span className="text-lg font-bold text-primary">{formatDuration(totalMinutes)}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {gpsEtaMinutes 
              ? "O tempo do GPS é uma sugestão. Ajuste conforme o tempo real gasto."
              : "Adicione os segmentos de transporte utilizados no deslocamento."
            }
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
            data-testid="button-cancel-ida"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting || isLoading}
            data-testid="button-confirm-ida"
          >
            {isSubmitting || isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando...
              </>
            ) : (
              "Iniciar Atividade"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
