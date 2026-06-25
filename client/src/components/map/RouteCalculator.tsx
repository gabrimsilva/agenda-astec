import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Navigation,
  MapPin,
  Clock,
  Route,
  X,
  Trash2,
  ArrowRight,
  ExternalLink,
  Zap,
  User,
  MapPinned,
  AlertCircle,
} from "lucide-react";
import { SiGooglemaps, SiWaze } from "react-icons/si";
import type { Technician, TechnicianLocation } from "@shared/schema";

interface ClientSite {
  id: string;
  siteName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  clientName: string;
  clientSegment?: string | null;
  clientGroup?: string | null;
}

interface RouteCalculatorProps {
  selectedSites: ClientSite[];
  onRemoveSite: (siteId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onRouteCalculated?: (route: OptimizedRoute | null, origin?: { lat: number; lng: number; name: string }) => void;
}

interface RouteSegment {
  distance: number;
  duration: number;
  steps: Array<{
    maneuver: { type: string; modifier?: string };
    name: string;
    distance: number;
    duration: number;
  }>;
}

interface OptimizedRoute {
  waypoints: Array<{ waypoint_index: number; trips_index: number; location: [number, number] }>;
  trips: Array<{
    legs: RouteSegment[];
    distance: number;
    duration: number;
  }>;
}

export function RouteCalculator({ selectedSites, onRemoveSite, onClearAll, onClose, onRouteCalculated }: RouteCalculatorProps) {
  const [calculatedRoute, setCalculatedRoute] = useState<OptimizedRoute | null>(null);
  const [optimizedSites, setOptimizedSites] = useState<ClientSite[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>("");
  const { toast } = useToast();

  // Buscar lista de técnicos
  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  // Buscar localização GPS do técnico selecionado
  const { data: technicianLocation, isError: isLocationError } = useQuery<TechnicianLocation | null>({
    queryKey: ["/api/technicians", selectedTechnicianId, "last-location"],
    enabled: !!selectedTechnicianId,
    retry: false,
  });

  const calculateRouteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTechnicianId) {
        throw new Error("Selecione um técnico como ponto de partida");
      }

      if (!technicianLocation) {
        throw new Error("Técnico não possui localização GPS disponível");
      }

      if (selectedSites.length < 1) {
        throw new Error("Selecione pelo menos 1 cliente como destino");
      }

      // Origem: localização do técnico
      const origin = {
        latitude: parseFloat(technicianLocation.latitude),
        longitude: parseFloat(technicianLocation.longitude),
        name: "Ponto de Partida (Técnico)",
      };

      // Destinos: clientes selecionados
      const destinations = selectedSites.map((site) => ({
        latitude: site.latitude,
        longitude: site.longitude,
        name: site.clientName,
      }));

      const response = await apiRequest("POST", "/api/routes/optimize", { 
        origin,
        waypoints: destinations,
      });
      return await response.json();
    },
    onSuccess: (data: OptimizedRoute) => {
      setCalculatedRoute(data);
      
      // Reordenar sites de acordo com a otimização
      // O primeiro waypoint (índice 0) é sempre a origem (técnico), então pulamos ele
      // waypoint_index representa o índice original no array de waypoints enviado ao OSRM
      // Como enviamos [origem, destino1, destino2, ...], precisamos:
      // 1. Pular waypoints com waypoint_index === 0 (origem)
      // 2. Para os demais, usar waypoint_index - 1 para indexar em selectedSites
      const reorderedSites = data.waypoints
        .filter(wp => wp.waypoint_index > 0) // Filtrar origem (índice 0)
        .map(wp => selectedSites[wp.waypoint_index - 1]); // Mapear de volta aos sites originais
      setOptimizedSites(reorderedSites);
      
      // Preparar dados da origem para o mapa
      const originData = technicianLocation ? {
        lat: parseFloat(technicianLocation.latitude),
        lng: parseFloat(technicianLocation.longitude),
        name: technicians.find(t => t.id === selectedTechnicianId)?.name || "Técnico",
      } : undefined;
      
      // Notificar o componente pai com rota E origem
      if (onRouteCalculated) {
        onRouteCalculated(data, originData);
      }
      
      toast({
        title: "Rota otimizada calculada!",
        description: `Rota de ${selectedSites.length} destinos calculada a partir da localização do técnico.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao calcular rota",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openInGoogleMaps = () => {
    // Usar ordem otimizada se disponível, caso contrário usar ordem original
    const sitesToUse = optimizedSites.length > 0 ? optimizedSites : selectedSites;
    if (sitesToUse.length === 0) return;

    const waypoints = sitesToUse
      .map((site) => `${site.latitude},${site.longitude}`)
      .join("/");

    window.open(`https://www.google.com/maps/dir/${waypoints}`, "_blank");
  };

  const openInWaze = () => {
    // Waze não suporta múltiplos waypoints via deep link, usar primeiro da rota otimizada
    const sitesToUse = optimizedSites.length > 0 ? optimizedSites : selectedSites;
    if (sitesToUse.length === 0) return;

    const firstSite = sitesToUse[0];
    window.open(
      `https://www.waze.com/ul?ll=${firstSite.latitude},${firstSite.longitude}&navigate=yes`,
      "_blank"
    );
    
    // Avisar usuário se há múltiplos waypoints
    if (sitesToUse.length > 1) {
      toast({
        title: "Aviso: Waze",
        description: `Waze não suporta múltiplos destinos via link. Abrindo apenas o primeiro destino (${firstSite.clientName}).`,
        variant: "default",
      });
    }
  };

  const openInAppleMaps = () => {
    // Apple Maps também tem limitações com múltiplos waypoints, usar primeiro da rota otimizada
    const sitesToUse = optimizedSites.length > 0 ? optimizedSites : selectedSites;
    if (sitesToUse.length === 0) return;

    const firstSite = sitesToUse[0];
    window.open(
      `http://maps.apple.com/?daddr=${firstSite.latitude},${firstSite.longitude}`,
      "_blank"
    );
    
    // Avisar usuário se há múltiplos waypoints
    if (sitesToUse.length > 1) {
      toast({
        title: "Aviso: Apple Maps",
        description: `Apple Maps tem suporte limitado para múltiplos destinos via link. Abrindo apenas o primeiro destino (${firstSite.clientName}).`,
        variant: "default",
      });
    }
  };

  const formatDistance = (meters: number) => {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters.toFixed(0)} m`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  const totalDistance = calculatedRoute?.trips[0]?.distance || 0;
  const totalDuration = calculatedRoute?.trips[0]?.duration || 0;

  return (
    <Card className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Calculadora de Rotas</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-route-panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecione clientes no mapa para criar uma rota otimizada
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {selectedSites.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhum cliente selecionado</p>
              <p className="text-xs mt-1">Clique nos marcadores azuis no mapa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Selected Sites List */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" data-testid="badge-selected-count">
                    {selectedSites.length} {selectedSites.length === 1 ? "cliente" : "clientes"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearAll}
                  data-testid="button-clear-selection"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Limpar
                </Button>
              </div>

              <ScrollArea className="h-[150px]">
                <div className="space-y-2">
                  {(optimizedSites.length > 0 ? optimizedSites : selectedSites).map((site, index) => (
                    <div
                      key={site.id}
                      className="flex items-start gap-3 p-2 rounded-md hover-elevate active-elevate-2 border"
                      data-testid={`selected-site-${site.id}`}
                    >
                      <Badge 
                        variant={optimizedSites.length > 0 ? "default" : "outline"} 
                        className="flex-shrink-0"
                      >
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{site.clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {site.address}, {site.city} - {site.state}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => onRemoveSite(site.id)}
                        data-testid={`button-remove-site-${site.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <Separator />

            {/* Technician Origin Selector */}
            <div className="p-4">
              <label className="text-sm font-semibold mb-2 flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-primary" />
                Ponto de Partida (Técnico)
              </label>
              <Select 
                value={selectedTechnicianId} 
                onValueChange={setSelectedTechnicianId}
                disabled={technicians.length === 0}
              >
                <SelectTrigger data-testid="select-technician-origin">
                  <SelectValue placeholder="Selecione o técnico..." />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        {tech.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* GPS Status Indicator */}
              {selectedTechnicianId && (
                <div className="mt-2">
                  {technicianLocation ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      GPS disponível - {new Date(technicianLocation.updatedAt).toLocaleString('pt-BR')}
                    </div>
                  ) : isLocationError ? (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      GPS não disponível para este técnico
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      Buscando localização...
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Calculate Route Button */}
            <div className="p-4">
              <Button
                className="w-full gap-2"
                onClick={() => calculateRouteMutation.mutate()}
                disabled={!selectedTechnicianId || !technicianLocation || selectedSites.length < 1 || calculateRouteMutation.isPending}
                data-testid="button-calculate-route"
              >
                <Zap className="h-4 w-4" />
                {calculateRouteMutation.isPending
                  ? "Calculando..."
                  : "Otimizar Rota"}
              </Button>
              {!selectedTechnicianId && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Selecione um técnico como ponto de partida
                </p>
              )}
              {selectedTechnicianId && !technicianLocation && (
                <p className="text-xs text-destructive mt-2 text-center">
                  Técnico sem localização GPS disponível
                </p>
              )}
            </div>

            {/* Route Summary */}
            {calculatedRoute && (
              <>
                <Separator />
                <div className="p-4 bg-muted/30">
                  <h4 className="font-semibold text-sm mb-3">Resumo da Rota</h4>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <Card className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Navigation className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Distância</span>
                      </div>
                      <p className="font-bold" data-testid="text-total-distance">
                        {formatDistance(totalDistance)}
                      </p>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Tempo Estimado</span>
                      </div>
                      <p className="font-bold" data-testid="text-total-duration">
                        {formatDuration(totalDuration)}
                      </p>
                    </Card>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold mb-2">Abrir navegação em:</p>
                    <div className="grid gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={openInGoogleMaps}
                        data-testid="button-open-google-maps"
                      >
                        <SiGooglemaps className="h-4 w-4" />
                        <span>Google Maps</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={openInWaze}
                        data-testid="button-open-waze"
                      >
                        <SiWaze className="h-4 w-4" />
                        <span>Waze</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={openInAppleMaps}
                        data-testid="button-open-apple-maps"
                      >
                        <MapPin className="h-4 w-4" />
                        <span>Apple Maps</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
