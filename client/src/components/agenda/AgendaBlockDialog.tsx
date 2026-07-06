import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plane, CalendarClock, Loader2 } from "lucide-react";
import type { Technician } from "@shared/schema";
import moment from "moment";

interface AgendaBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando admin, permite escolher o técnico. Assistente cria sempre para si. */
  technicians?: Technician[];
  allowTechnicianSelect?: boolean;
  defaultTechnicianId?: string;
  defaultDate?: string; // YYYY-MM-DD
}

type BlockType = "ferias" | "compromisso";

export function AgendaBlockDialog({
  open,
  onOpenChange,
  technicians = [],
  allowTechnicianSelect = false,
  defaultTechnicianId,
  defaultDate,
}: AgendaBlockDialogProps) {
  const { toast } = useToast();
  const today = defaultDate || moment().format("YYYY-MM-DD");

  const [blockType, setBlockType] = useState<BlockType>("compromisso");
  const [technicianId, setTechnicianId] = useState<string>(defaultTechnicianId || "");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setBlockType("compromisso");
      setTechnicianId(defaultTechnicianId || "");
      setStartDate(today);
      setEndDate(today);
      setDate(today);
      setStartTime("08:00");
      setEndTime("12:00");
      setDescription("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        blockType,
        description: description.trim() || undefined,
      };
      // Técnico: admin no calendário escolhe; na Minha Agenda usa o próprio
      // (defaultTechnicianId). Assistente é forçado no servidor.
      const effectiveTechId = allowTechnicianSelect ? technicianId : defaultTechnicianId || "";
      if (allowTechnicianSelect && !technicianId) throw new Error("Selecione o técnico.");
      if (effectiveTechId) payload.technicianId = effectiveTechId;

      if (blockType === "ferias") {
        if (!startDate || !endDate) throw new Error("Informe início e fim das férias.");
        if (endDate < startDate) throw new Error("A data final deve ser igual ou depois da inicial.");
        // Use moment to parse local date and convert to UTC ISO string
        payload.startDate = moment(startDate, 'YYYY-MM-DD').startOf('day').toISOString();
        payload.endDate = moment(endDate, 'YYYY-MM-DD').endOf('day').toISOString();
      } else {
        if (!date) throw new Error("Informe a data do compromisso.");
        if (endTime <= startTime) throw new Error("O horário de término deve ser depois do início.");
        // Use moment to parse local date and convert to UTC ISO string
        payload.startDate = moment(date, 'YYYY-MM-DD').startOf('day').toISOString();
        payload.endDate = moment(date, 'YYYY-MM-DD').endOf('day').toISOString();
        payload.startTime = startTime;
        payload.endTime = endTime;
      }

      return apiRequest("POST", "/api/agenda-blocks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda-blocks"], refetchType: "all" });
      toast({
        title: "Agenda bloqueada",
        description:
          blockType === "ferias"
            ? "Período de férias registrado."
            : "Compromisso registrado na agenda.",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao bloquear agenda", description: error.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-agenda-block">
        <DialogHeader>
          <DialogTitle>Bloquear Agenda</DialogTitle>
          <DialogDescription>
            Reserve um período para férias ou um compromisso pessoal. Não entra em relatórios nem
            cálculos — apenas ocupa a agenda e sinaliza indisponibilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={blockType === "compromisso" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setBlockType("compromisso")}
              data-testid="button-block-type-compromisso"
            >
              <CalendarClock className="h-4 w-4" />
              Compromisso
            </Button>
            <Button
              type="button"
              variant={blockType === "ferias" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setBlockType("ferias")}
              data-testid="button-block-type-ferias"
            >
              <Plane className="h-4 w-4" />
              Férias
            </Button>
          </div>

          {/* Técnico (admin) */}
          {allowTechnicianSelect && (
            <div className="space-y-2">
              <Label>Técnico</Label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger data-testid="select-block-technician">
                  <SelectValue placeholder="Selecione o técnico" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {blockType === "ferias" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="block-start">Início</Label>
                <Input
                  id="block-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-block-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-end">Fim</Label>
                <Input
                  id="block-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-block-end-date"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="block-date">Data</Label>
                <Input
                  id="block-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="input-block-date"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="block-start-time">Início</Label>
                  <Input
                    id="block-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    data-testid="input-block-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="block-end-time">Término</Label>
                  <Input
                    id="block-end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    data-testid="input-block-end-time"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="block-desc">Descrição (opcional)</Label>
            <Textarea
              id="block-desc"
              placeholder={blockType === "ferias" ? "Ex.: Férias" : "Ex.: Médico, assunto pessoal"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="input-block-description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-block-cancel">
            Cancelar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            data-testid="button-block-save"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Bloquear"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
