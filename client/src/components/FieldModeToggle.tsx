import { useGPSTracking } from "@/hooks/useGPSTracking";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, MapPinOff, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function FieldModeToggle() {
  const { user } = useAuth();
  const { isTracking, toggleTracking, gpsActive } = useGPSTracking();

  // Assistentes e admins veem o toggle de GPS
  if (user?.role !== "assistente" && user?.role !== "admin") {
    return null;
  }

  // Define a variante do botão baseado no estado
  let variant: "default" | "destructive" | "ghost" = "ghost";
  if (isTracking && gpsActive) {
    variant = "default"; // Verde - GPS funcionando
  } else if (isTracking && !gpsActive) {
    variant = "destructive"; // Vermelho - GPS desligado mas toggle ativo
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="button-field-mode-toggle"
          size="icon"
          variant={variant}
          onClick={toggleTracking}
          className="relative"
        >
          {!isTracking && <MapPinOff className="h-4 w-4" />}
          {isTracking && gpsActive && <MapPin className="h-4 w-4" />}
          {isTracking && !gpsActive && <AlertTriangle className="h-4 w-4" />}
          
          {isTracking && gpsActive && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          )}
          
          {isTracking && !gpsActive && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {!isTracking && (
          <>
            <p>Ativar Modo Campo</p>
            <p className="text-xs text-muted-foreground">
              Clique para começar rastreamento
            </p>
          </>
        )}
        {isTracking && gpsActive && (
          <>
            <p className="text-green-500 font-semibold">GPS Ativo</p>
            <p className="text-xs text-muted-foreground">
              Localização sendo enviada
            </p>
          </>
        )}
        {isTracking && !gpsActive && (
          <>
            <p className="text-red-500 font-semibold">GPS Desligado!</p>
            <p className="text-xs text-muted-foreground">
              Ative o GPS do dispositivo
            </p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
