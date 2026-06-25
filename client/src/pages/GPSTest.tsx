import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Power, Navigation, Wifi, WifiOff, Battery, MapPin } from "lucide-react";
import type { Technician } from "@shared/schema";

export default function GPSTest() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data: technicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    enabled: !!user,
  });

  const myTechnician = technicians?.find(t => t.userId === user?.id);
  const [isTracking, setIsTracking] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastGpsUpdateRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactiveAlertSentRef = useRef<boolean>(false); // Previne múltiplos alerts

  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }
  }, []);

  const connectWebSocket = () => {
    const token = localStorage.getItem("astec_token");
    if (!token) {
      setError("Token não encontrado. Faça login novamente.");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/locations?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        setError(null);
        toast({
          title: "WebSocket Conectado",
          description: "Pronto para enviar coordenadas GPS",
        });
      };

      ws.onerror = (event) => {
        setWsConnected(false);
        setError("Erro na conexão WebSocket");
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (isTracking) {
          setError("Conexão WebSocket fechada");
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setError("Erro ao conectar WebSocket: " + (err as Error).message);
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
    }
  };

  const sendLocation = (pos: GeolocationPosition) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!myTechnician?.id) {
      setError("Técnico não encontrado. Verifique se sua conta tem um técnico associado.");
      return;
    }

    const message = {
      type: "location_update",
      data: {
        technicianId: myTechnician.id,
        latitude: pos.coords.latitude.toString(),
        longitude: pos.coords.longitude.toString(),
        accuracy: Math.round(pos.coords.accuracy),
        battery: batteryLevel,
        gpsStatus: "ativo" as const,
        connectionStatus: "online" as const,
        deviceModel: navigator.userAgent,
      }
    };

    wsRef.current.send(JSON.stringify(message));
    setLastUpdate(new Date());
  };

  const sendInactiveStatus = async () => {
    if (!myTechnician?.id) {
      return;
    }

    // Se temos posição E WebSocket aberto, usar WebSocket
    if (position && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: "location_update",
        data: {
          technicianId: myTechnician.id,
          latitude: position.coords.latitude.toString(),
          longitude: position.coords.longitude.toString(),
          accuracy: Math.round(position.coords.accuracy),
          battery: batteryLevel,
          gpsStatus: "inativo" as const,
          connectionStatus: "offline" as const,
          deviceModel: navigator.userAgent,
        }
      };

      wsRef.current.send(JSON.stringify(message));
    } else {
      // Fallback: usar API REST quando GPS nunca obteve posição ou WebSocket fechado
      try {
        await apiRequest("PATCH", `/api/technicians/${myTechnician.id}/gps-status`, {
          gpsStatus: "inativo",
          connectionStatus: "offline",
        });
      } catch (error: any) {
        console.error("Erro ao enviar status inativo via API:", error);
        
        // Mostrar toast de erro se falhar
        if (error.message?.includes("403") || error.message?.includes("Unauthorized")) {
          toast({
            title: "Erro de Autorização",
            description: "Você não tem permissão para atualizar este status GPS",
            variant: "destructive",
          });
        } else if (error.message?.includes("404")) {
          toast({
            title: "Sem Localização Prévia",
            description: "É necessário obter uma localização GPS válida primeiro",
            variant: "destructive",
          });
        }
      }
    }
  };

  const startTracking = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocalização não suportada neste dispositivo");
      toast({
        title: "Erro",
        description: "Seu dispositivo não suporta geolocalização",
        variant: "destructive",
      });
      return;
    }

    connectWebSocket();

    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(pos);
        setError(null);
        lastGpsUpdateRef.current = Date.now(); // Atualiza timestamp
        inactiveAlertSentRef.current = false; // Reseta flag quando GPS volta a funcionar
        sendLocation(pos);
      },
      (err) => {
        setError(`Erro GPS: ${err.message}`);
        
        // Envia status inativo quando GPS falha
        sendInactiveStatus();
        
        toast({
          title: "Erro de GPS",
          description: err.message,
          variant: "destructive",
        });
      },
      options
    );

    watchIdRef.current = watchId;
    setIsTracking(true);
    lastGpsUpdateRef.current = Date.now(); // Inicializa timestamp
    inactiveAlertSentRef.current = false; // Reseta flag ao iniciar

    // Heartbeat: detecta quando GPS para de enviar atualizações (ex: GPS desligado)
    heartbeatIntervalRef.current = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastGpsUpdateRef.current;
      const GPS_TIMEOUT = 30000; // 30 segundos sem atualização = GPS inativo

      // Só dispara UMA VEZ quando detectar inatividade
      if (timeSinceLastUpdate > GPS_TIMEOUT && !inactiveAlertSentRef.current) {
        console.log("[GPS Heartbeat] Timeout detectado! Última atualização há", Math.round(timeSinceLastUpdate / 1000), "segundos");
        setError("GPS sem resposta há mais de 30 segundos");
        inactiveAlertSentRef.current = true; // Marca como enviado
        sendInactiveStatus();
        
        toast({
          title: "GPS Inativo Detectado",
          description: "O GPS parou de responder. Verifique se está ativado.",
          variant: "destructive",
        });
      }
    }, 10000); // Verifica a cada 10 segundos

    toast({
      title: "Rastreamento Iniciado",
      description: "Sua localização está sendo enviada em tempo real",
    });
  };

  const stopTracking = () => {
    // Envia status inativo antes de parar
    sendInactiveStatus();
    
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Para o heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Aguarda um pouco para garantir que a mensagem foi enviada
    setTimeout(() => {
      disconnectWebSocket();
    }, 100);
    
    setIsTracking(false);
    setError(null);

    toast({
      title: "Rastreamento Parado",
      description: "O envio de localização foi interrompido",
    });
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      disconnectWebSocket();
    };
  }, []);

  const formatCoordinate = (value: number, isLat: boolean) => {
    const direction = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "O");
    return `${Math.abs(value).toFixed(6)}° ${direction}`;
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Status do Rastreamento</CardTitle>
              <CardDescription>
                {isTracking ? "Enviando localização em tempo real" : "Rastreamento desativado"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant={wsConnected ? "default" : "secondary"} className="gap-1">
                {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {wsConnected ? "Conectado" : "Desconectado"}
              </Badge>
              <Badge variant={isTracking ? "default" : "secondary"} className="gap-1">
                <Navigation className="w-3 h-3" />
                {isTracking ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {!isTracking ? (
              <Button
                onClick={startTracking}
                className="flex-1 gap-2"
                size="lg"
                data-testid="button-start-tracking"
              >
                <Power className="w-4 h-4" />
                Iniciar Rastreamento
              </Button>
            ) : (
              <Button
                onClick={stopTracking}
                variant="destructive"
                className="flex-1 gap-2"
                size="lg"
                data-testid="button-stop-tracking"
              >
                <Power className="w-4 h-4" />
                Parar Rastreamento
              </Button>
            )}
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm" data-testid="text-error">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {position && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Localização Atual
            </CardTitle>
            <CardDescription>
              Última atualização: {lastUpdate?.toLocaleTimeString("pt-BR")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Latitude</div>
                <div className="text-lg font-mono" data-testid="text-latitude">
                  {formatCoordinate(position.coords.latitude, true)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Longitude</div>
                <div className="text-lg font-mono" data-testid="text-longitude">
                  {formatCoordinate(position.coords.longitude, false)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Precisão</div>
                <div className="text-lg font-mono" data-testid="text-accuracy">
                  ±{Math.round(position.coords.accuracy)}m
                </div>
              </div>
              {batteryLevel !== null && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Bateria</div>
                  <div className="text-lg font-mono flex items-center gap-2" data-testid="text-battery">
                    <Battery className="w-4 h-4" />
                    {batteryLevel}%
                  </div>
                </div>
              )}
            </div>

            {position.coords.speed !== null && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Velocidade</div>
                <div className="text-lg font-mono">
                  {(position.coords.speed * 3.6).toFixed(1)} km/h
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-2">Links Rápidos</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  data-testid="button-google-maps"
                >
                  <a
                    href={`https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver no Google Maps
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  data-testid="button-view-map"
                >
                  <a href="/rotas" target="_blank">
                    Ver no Mapa ASTEC
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Instruções</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Permita o acesso à localização quando solicitado pelo navegador</p>
          <p>2. Clique em "Iniciar Rastreamento" para começar</p>
          <p>3. Sua localização será enviada automaticamente via WebSocket</p>
          <p>4. Abra a página "Mapa & Rotas" para ver sua posição no mapa em tempo real</p>
          <p>5. Para melhores resultados, use em um dispositivo com GPS (celular/tablet)</p>
        </CardContent>
      </Card>
    </div>
  );
}
