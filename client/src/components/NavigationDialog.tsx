import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import {
  Navigation,
  MapPin,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { SiGooglemaps, SiWaze } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Detecta se está em iOS (incluindo PWA)
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

interface Activity {
  id: string;
  clientName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  startTime: string;
  latitude?: string | null;
  longitude?: string | null;
}

interface NavigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: Activity[];
  technicianId?: string;
  preSelectedActivityId?: string;
  selectedDate?: string;
}

export function NavigationDialog({ 
  open, 
  onOpenChange, 
  activities,
  technicianId,
  preSelectedActivityId,
  selectedDate
}: NavigationDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isTracking } = useGPSTracking();
  const [gpsStatus, setGpsStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [manualCep, setManualCep] = useState("");
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [useManualAddress, setUseManualAddress] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false); // Controla se mostra todas ou só a pré-selecionada

  // Formatar CEP com máscara (00000-000)
  const formatCep = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 5) return cleaned;
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 8)}`;
  };

  // Buscar endereço por CEP
  const searchByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "Por favor, insira um CEP com 8 dígitos.",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingCep(true);
    try {
      const response = await fetch(`/api/cep/${cleanCep}`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          description: "Verifique o CEP e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      // Montar endereço completo
      const fullAddress = [
        data.logradouro,
        data.bairro,
        data.localidade,
        data.uf,
      ].filter(Boolean).join(", ");

      setManualAddress(fullAddress);
      toast({
        title: "Endereço encontrado!",
        description: fullAddress,
      });
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast({
        title: "Erro ao buscar CEP",
        description: "Tente novamente ou digite o endereço manualmente.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingCep(false);
    }
  }

  // Pré-selecionar atividade quando dialog abre
  useEffect(() => {
    if (!open) return;

    if (preSelectedActivityId) {
      setSelectedActivityIds([preSelectedActivityId]);
      setShowAllActivities(false); // Começa mostrando apenas a pré-selecionada
    } else {
      setSelectedActivityIds([]);
      setShowAllActivities(true); // Sem pré-seleção, mostra todas
    }
  }, [open, preSelectedActivityId]);

  // Detectar GPS automaticamente quando dialog abre
  useEffect(() => {
    if (!open) return;

    setGpsStatus("checking");
    // Reseta o modo manual ao (re)abrir para não herdar estado de uma falha anterior de GPS
    setUseManualAddress(false);
    
    if (!navigator.geolocation) {
      setGpsStatus("unavailable");
      setUseManualAddress(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsStatus("available");
        // GPS funcionou: garante que estamos no modo GPS (habilita os botões de navegação)
        setUseManualAddress(false);
        toast({
          title: "GPS detectado!",
          description: "Sua localização atual será usada como ponto de partida.",
        });
      },
      (error) => {
        console.error("GPS error:", error);
        setGpsStatus("unavailable");
        setUseManualAddress(true);
        toast({
          title: "GPS não disponível",
          description: "Por favor, insira seu endereço de partida manualmente.",
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [open, toast]);

  const handleActivityToggle = (activityId: string) => {
    setSelectedActivityIds(prev => 
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    );
  };

  const handleNavigate = async (app: "google" | "waze" | "apple") => {
    // Validar origem
    const hasOrigin = currentLocation || manualAddress.trim();
    if (!hasOrigin) {
      toast({
        title: "Erro",
        description: "Por favor, forneça um ponto de partida (GPS ou endereço manual).",
        variant: "destructive",
      });
      return;
    }

    // Validar destinos
    if (selectedActivityIds.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos 1 atividade para incluir na rota.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Preparar origem
      let origin: { latitude: string; longitude: string; name: string } | null = null;
      
      if (useManualAddress && manualAddress.trim()) {
        // Geocodificar endereço manual
        const geocodeResponse = await apiRequest("POST", "/api/geocode", {
          address: manualAddress.trim(),
        });
        const geocodeData = await geocodeResponse.json();
        
        if (!geocodeData.found || !geocodeData.latitude || !geocodeData.longitude) {
          throw new Error("Não foi possível geocodificar o endereço fornecido");
        }
        
        origin = {
          latitude: geocodeData.latitude.toString(),
          longitude: geocodeData.longitude.toString(),
          name: "Ponto de Partida",
        };
      } else if (currentLocation) {
        origin = {
          latitude: currentLocation.lat.toString(),
          longitude: currentLocation.lng.toString(),
          name: "Minha Localização",
        };
      }

      if (!origin) {
        throw new Error("Não foi possível determinar o ponto de partida");
      }

      // Preparar waypoints (atividades selecionadas)
      const selectedActivities = activities.filter(a => selectedActivityIds.includes(a.id));
      
      // Geocodificar atividades que não têm coordenadas (ou usar coordenadas existentes)
      const waypointsWithCoords = await Promise.all(
        selectedActivities.map(async (activity) => {
          const fullAddress = [activity.address, activity.city, activity.state].filter(Boolean).join(", ");
          
          // Se a atividade já tem coordenadas salvas, usar diretamente (sem geocodificar)
          if (activity.latitude && activity.longitude && 
              parseFloat(activity.latitude) !== 0 && parseFloat(activity.longitude) !== 0) {
            console.log(`Usando coordenadas existentes para: ${activity.clientName || fullAddress}`);
            return {
              latitude: activity.latitude.toString(),
              longitude: activity.longitude.toString(),
              name: activity.clientName || "Cliente",
              fullAddress,
            };
          }
          
          // Tentar geocodificar o endereço com parâmetros separados para melhor precisão
          try {
            const geocodeResponse = await apiRequest("POST", "/api/geocode", {
              address: activity.address || "",
              city: activity.city || "",
              state: activity.state || "",
              country: "Brasil",
            });
            const geocodeData = await geocodeResponse.json();
            
            if (!geocodeData.found || !geocodeData.latitude || !geocodeData.longitude) {
              console.warn(`Falha ao geocodificar: ${fullAddress}`);
              return null;
            }
            
            return {
              latitude: geocodeData.latitude.toString(),
              longitude: geocodeData.longitude.toString(),
              name: activity.clientName || "Cliente",
              fullAddress,
            };
          } catch (error) {
            console.error(`Erro ao geocodificar ${fullAddress}:`, error);
            return null;
          }
        })
      );

      // Filtrar waypoints que foram geocodificados com sucesso
      const validWaypoints = waypointsWithCoords.filter((wp): wp is NonNullable<typeof wp> => wp !== null);
      
      if (validWaypoints.length === 0) {
        throw new Error("Nenhum destino pôde ser geocodificado. Verifique os endereços das atividades.");
      }

      if (validWaypoints.length < selectedActivities.length) {
        toast({
          title: "Aviso",
          description: `${selectedActivities.length - validWaypoints.length} atividade(s) não pôde(ram) ser geocodificada(s).`,
        });
      }

      // Chamar API OSRM para otimizar rota
      const routeResponse = await apiRequest("POST", "/api/routes/optimize", {
        origin,
        waypoints: validWaypoints,
      });
      const routeData = await routeResponse.json();

      if (!routeData.trips || routeData.trips.length === 0) {
        throw new Error("Não foi possível calcular a rota otimizada");
      }

      // Backend retorna waypoints JÁ na ordem otimizada
      // Cada waypoint tem waypoint_index que aponta para o índice em allWaypoints (origin + validWaypoints)
      // Como origin está em índice 0 de allWaypoints, os destinos começam em índice 1
      // Para mapear de volta para validWaypoints, usamos waypoint_index - 1
      const optimizedWaypoints = routeData.waypoints
        .filter((wp: any) => wp.waypoint_index !== 0) // Remover origem (waypoint_index = 0)
        .map((wp: any) => {
          // waypoint_index aponta para allWaypoints = [origin, ...validWaypoints]
          // Então waypoint_index 1 = validWaypoints[0], waypoint_index 2 = validWaypoints[1], etc
          const validWaypointsIndex = wp.waypoint_index - 1;
          return validWaypoints[validWaypointsIndex];
        });

      // Validar se há waypoints otimizados
      if (optimizedWaypoints.length === 0) {
        throw new Error("Rota otimizada não retornou destinos válidos");
      }

      // NOTE: Tempo de deslocamento NÃO é mais contabilizado aqui na navegação.
      // O tempo de deslocamento é contabilizado automaticamente no CHECKOUT,
      // onde perguntamos ao técnico se o trabalho foi realizado:
      // - SIM → categoria "adicional" (deslocamento produtivo)
      // - NÃO → categoria "perda" (deslocamento improdutivo) + justificativa obrigatória

      // Construir URL do app de navegação com rota otimizada
      let url = "";
      const isiOS = isIOS();
      
      if (app === "google") {
        // Google Maps suporta múltiplos waypoints
        const originStr = `${origin.latitude},${origin.longitude}`;
        const waypointsEncoded = optimizedWaypoints.slice(0, -1) // Todos menos o último
          .map((wp: any) => encodeURIComponent(`${wp.latitude},${wp.longitude}`))
          .join("|");
        const destination = encodeURIComponent(`${optimizedWaypoints[optimizedWaypoints.length - 1].latitude},${optimizedWaypoints[optimizedWaypoints.length - 1].longitude}`);
        
        // Google Maps funciona com HTTPS em iOS e Android
        url = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destination}${waypointsEncoded ? `&waypoints=${waypointsEncoded}` : ""}&travelmode=driving`;
      } else if (app === "waze") {
        const firstDest = optimizedWaypoints[0];
        
        if (isiOS) {
          // iOS: usar deep link waze:// para abrir o app diretamente
          url = `waze://?ll=${firstDest.latitude},${firstDest.longitude}&navigate=yes`;
        } else {
          // Android: URL universal funciona
          url = `https://www.waze.com/ul?ll=${firstDest.latitude},${firstDest.longitude}&navigate=yes`;
        }
        
        if (optimizedWaypoints.length > 1) {
          toast({
            title: "Aviso: Waze",
            description: "Waze não suporta múltiplos destinos. Abrindo apenas o primeiro.",
          });
        }
      } else if (app === "apple") {
        const firstDest = optimizedWaypoints[0];
        
        if (isiOS) {
          // iOS: usar deep link maps:// para abrir nativamente
          url = `maps://?daddr=${firstDest.latitude},${firstDest.longitude}`;
        } else {
          // Android/outros: URL web
          url = `http://maps.apple.com/?daddr=${firstDest.latitude},${firstDest.longitude}`;
        }
        
        if (optimizedWaypoints.length > 1) {
          toast({
            title: "Aviso: Apple Maps",
            description: "Apple Maps tem suporte limitado. Abrindo apenas o primeiro destino.",
          });
        }
      }

      // Calcular tempo total de deslocamento em minutos (OSRM retorna em segundos)
      const totalTravelDurationSeconds = routeData.trips?.[0]?.duration || 0;
      const totalTravelMinutes = Math.round(totalTravelDurationSeconds / 60);
      
      // Para múltiplas atividades, dividir proporcionalmente
      // Para uma única atividade, usar o tempo total
      const travelMinutesPerActivity = selectedActivityIds.length > 1 
        ? Math.round(totalTravelMinutes / selectedActivityIds.length)
        : totalTravelMinutes;
      
      console.log(`🚗 Tempo total de deslocamento: ${totalTravelMinutes}min, por atividade: ${travelMinutesPerActivity}min`);
      
      // V3: Iniciar navegação via endpoint específico que registra tempo estimado e muda status
      try {
        await Promise.all(
          selectedActivityIds.map(async (activityId) => {
            const response = await apiRequest("POST", `/api/activities/${activityId}/navigation/start`, {
              gpsEtaMinutes: travelMinutesPerActivity,
              date: selectedDate,
            });
            if (!response.ok) {
              console.warn(`Erro ao iniciar navegação para atividade ${activityId}`);
            }
          })
        );
        console.log(`V3: Navegação iniciada para ${selectedActivityIds.length} atividade(s) com ETA ${travelMinutesPerActivity}min`);
        queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity-day-statuses/all"] });
      } catch (error) {
        console.error("Erro ao iniciar navegação:", error);
      }

      toast({
        title: "Rota calculada!",
        description: `${optimizedWaypoints.length} parada(s) otimizada(s). Abrindo ${app === "google" ? "Google Maps" : app === "waze" ? "Waze" : "Apple Maps"}...`,
      });

      // iOS PWA: usar window.location.href para deep links funcionarem
      // Android/Desktop: usar window.open para não sair da página
      if (isiOS) {
        window.location.href = url;
      } else {
        window.open(url, "_blank");
      }
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao calcular rota",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Navegação
          </DialogTitle>
          <DialogDescription>
            Calcule sua rota otimizada para as atividades do dia
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {/* Status do GPS */}
          <div className="rounded-lg border p-2.5">
            <Label className="text-sm font-semibold mb-1.5 block">
              Ponto de Partida
            </Label>
            
            {gpsStatus === "checking" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Detectando sua localização...
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGpsStatus("unavailable");
                    setUseManualAddress(true);
                  }}
                  className="w-full"
                  data-testid="button-use-manual-address"
                >
                  Usar endereço manual
                </Button>
              </div>
            )}
            
            {gpsStatus === "available" && !useManualAddress && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  GPS disponível - Localização atual detectada
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUseManualAddress(true)}
                  className="w-full"
                >
                  Usar endereço manual
                </Button>
              </div>
            )}
            
            {(gpsStatus === "unavailable" || useManualAddress) && (
              <div className="space-y-3">
                {gpsStatus === "unavailable" && (
                  <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                    <AlertCircle className="h-4 w-4" />
                    GPS não disponível
                  </div>
                )}
                
                {/* Campo de busca por CEP */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Buscar por CEP
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00000-000"
                      value={manualCep}
                      onChange={(e) => setManualCep(formatCep(e.target.value))}
                      maxLength={9}
                      className="w-32 flex-shrink-0"
                      data-testid="input-manual-cep"
                    />
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => searchByCep(manualCep)}
                      disabled={isSearchingCep || manualCep.replace(/\D/g, "").length !== 8}
                      data-testid="button-search-cep"
                    >
                      {isSearchingCep ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4" />
                      )}
                      <span className="ml-1">Buscar</span>
                    </Button>
                  </div>
                </div>

                {/* Campo de endereço completo */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Endereço completo
                  </Label>
                  <Input
                    placeholder="Digite ou busque por CEP..."
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    data-testid="input-manual-address"
                  />
                </div>
                
                {gpsStatus === "available" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUseManualAddress(false);
                      setManualCep("");
                      setManualAddress("");
                    }}
                    className="w-full"
                    data-testid="button-use-gps"
                  >
                    Usar GPS
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Lista de Atividades */}
          <div className="rounded-lg border p-2.5">
            <Label className="text-sm font-semibold mb-2 block">
              Paradas (Atividades do Dia)
            </Label>
            
            {activities.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                Nenhuma atividade agendada para hoje
              </div>
            ) : (
              <>
                {/* Determinar quais atividades mostrar */}
                {(() => {
                  const activitiesToShow = showAllActivities || !preSelectedActivityId
                    ? activities
                    : activities.filter(a => a.id === preSelectedActivityId);
                  
                  return (
                    <ScrollArea className="max-h-32 lg:max-h-48">
                      <div className="space-y-2 pr-2">
                        {activitiesToShow.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-start gap-2 p-2 rounded-md border hover-elevate"
                          >
                            <Checkbox
                              checked={selectedActivityIds.includes(activity.id)}
                              onCheckedChange={() => handleActivityToggle(activity.id)}
                              data-testid={`checkbox-activity-${activity.id}`}
                              className="mt-0.5 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {activity.clientName || "Cliente"}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {[activity.address, activity.city, activity.state]
                                  .filter(Boolean)
                                  .join(", ") || "Sem endereço"}
                              </p>
                              <Badge variant="outline" className="text-xs mt-1">
                                {activity.startTime}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  );
                })()}
                
                {/* Botão para incluir outras atividades */}
                {preSelectedActivityId && !showAllActivities && activities.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => setShowAllActivities(true)}
                    data-testid="button-add-more-activities"
                  >
                    + Incluir outras atividades na rota
                  </Button>
                )}
                
                {selectedActivityIds.length > 0 && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    {selectedActivityIds.length} {selectedActivityIds.length === 1 ? "parada selecionada" : "paradas selecionadas"}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Botões de Navegação */}
          <div className="space-y-2 flex-shrink-0">
            <Label className="text-sm font-semibold">Abrir em:</Label>
            <div className="grid gap-2">
              <Button
                className="w-full justify-start gap-2 h-10"
                variant="outline"
                onClick={() => handleNavigate("google")}
                disabled={!((currentLocation && !useManualAddress) || (useManualAddress && manualAddress.trim())) || selectedActivityIds.length === 0}
                data-testid="button-navigate-google"
              >
                <SiGooglemaps className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Google Maps</span>
                <ExternalLink className="h-3 w-3 ml-auto flex-shrink-0" />
              </Button>
              <Button
                className="w-full justify-start gap-2 h-10"
                variant="outline"
                onClick={() => handleNavigate("waze")}
                disabled={!((currentLocation && !useManualAddress) || (useManualAddress && manualAddress.trim())) || selectedActivityIds.length === 0}
                data-testid="button-navigate-waze"
              >
                <SiWaze className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Waze</span>
                <ExternalLink className="h-3 w-3 ml-auto flex-shrink-0" />
              </Button>
              <Button
                className="w-full justify-start gap-2 h-10"
                variant="outline"
                onClick={() => handleNavigate("apple")}
                disabled={!((currentLocation && !useManualAddress) || (useManualAddress && manualAddress.trim())) || selectedActivityIds.length === 0}
                data-testid="button-navigate-apple"
              >
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Apple Maps</span>
                <ExternalLink className="h-3 w-3 ml-auto flex-shrink-0" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
