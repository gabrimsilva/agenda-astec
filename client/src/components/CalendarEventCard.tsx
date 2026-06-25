import { Clock, MapPin, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  id: string;
  title: string;
  client: string;
  location: string;
  startTime: string;
  endTime: string;
  technicianName?: string;
  activityType: string;
  status: "planejado" | "emExecucao" | "concluido" | "reprovado" | "cancelado";
  category: "efetivo" | "adicional" | "perda";
  color: string;
}

interface CalendarEventCardProps {
  event: CalendarEvent;
  compact?: boolean;
  onClick?: () => void;
}

const statusLabels = {
  planejado: "Planejado",
  emExecucao: "Em Execução",
  concluido: "Concluído",
  reprovado: "Reprovado",
  cancelado: "Cancelado",
};

const statusColors = {
  planejado: "bg-status-planejado",
  emExecucao: "bg-status-emExecucao",
  concluido: "bg-status-concluido",
  reprovado: "bg-status-reprovado",
  cancelado: "bg-status-cancelado",
};

export function CalendarEventCard({ event, compact = false, onClick }: CalendarEventCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border-l-4 hover-elevate active-elevate-2 cursor-pointer",
        compact ? "p-2" : "p-3"
      )}
      style={{ borderLeftColor: event.color }}
      onClick={onClick}
      data-testid={`card-event-${event.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className={cn("font-medium", compact ? "text-sm" : "text-sm md:text-base")}>
            {event.title}
          </h4>
          <p className="text-xs text-muted-foreground truncate">{event.client}</p>
        </div>
        <Badge 
          variant="outline" 
          className={cn("text-xs shrink-0", statusColors[event.status])}
        >
          {statusLabels[event.status]}
        </Badge>
      </div>
      
      {!compact && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{event.startTime} - {event.endTime}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{event.location}</span>
          </div>
          {event.technicianName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{event.technicianName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
