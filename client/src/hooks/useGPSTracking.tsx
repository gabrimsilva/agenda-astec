import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Technician } from "@shared/schema";
import { io, Socket } from "socket.io-client";

interface GPSTrackingContextType {
  isTracking: boolean;
  toggleTracking: () => void;
  position: GeolocationPosition | null;
  error: string | null;
  gpsActive: boolean;
  socketConnected: boolean;
}

const GPSTrackingContext = createContext<GPSTrackingContextType | undefined>(undefined);

const GPS_TRACKING_KEY = "astec_gps_tracking";

// Production: 45 seconds (was 5 minutes) - faster detection while still battery-friendly
// Development: 10 seconds for faster testing
const GPS_INTERVAL_MS = process.env.NODE_ENV === "development" 
  ? 10 * 1000
  : 45 * 1000;

// Heartbeat timeout: 2 minutes (was 7 minutes)
// If no GPS update in 2 min, mark as inactive
const HEARTBEAT_TIMEOUT_MS = process.env.NODE_ENV === "development"
  ? 30 * 1000
  : 2 * 60 * 1000;

const MIN_DISTANCE_METERS = 100;

export function GPSTrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data: technicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    enabled: !!user,
  });

  const myTechnician = technicians?.find(t => t.userId === user?.id);
  
  const [isTracking, setIsTracking] = useState(() => {
    const saved = localStorage.getItem(GPS_TRACKING_KEY);
    return saved === "true";
  });
  
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const lastGpsUpdateRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactiveAlertSentRef = useRef<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const lastSentPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const isBackgroundRef = useRef<boolean>(false);
  const backgroundAlertShownRef = useRef<boolean>(false);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

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

  // Handle visibility change (app going to background)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      isBackgroundRef.current = isHidden;
      
      if (isHidden && isTracking) {
        // App went to background - pause heartbeat timer to avoid false alerts
        console.log("[GPS] App went to background - pausing heartbeat timer");
        // Reset the last update time so when we come back, we don't immediately timeout
        lastGpsUpdateRef.current = Date.now();
      } else if (!isHidden && isTracking) {
        // App came back to foreground
        console.log("[GPS] App returned to foreground");
        lastGpsUpdateRef.current = Date.now();
        backgroundAlertShownRef.current = false;
        inactiveAlertSentRef.current = false;
        
        // Try to get a fresh position immediately
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              console.log("[GPS] Got fresh position after returning from background");
              setPosition(pos);
              setGpsActive(true);
              sendLocation(pos);
              lastSendTimeRef.current = Date.now();
              lastSentPositionRef.current = { 
                lat: pos.coords.latitude, 
                lng: pos.coords.longitude 
              };
            },
            (err) => {
              console.warn("[GPS] Could not get position after background:", err.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isTracking]);

  const connectSocket = () => {
    const token = localStorage.getItem("astec_token");
    if (!token) {
      console.error("[GPS] No token found");
      return;
    }

    if (socketRef.current?.connected) {
      console.log("[GPS] Socket already connected");
      return;
    }

    console.log("[GPS] Connecting Socket.IO...");

    const socket = io({
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      console.log("[GPS] Socket.IO connected!");
      setSocketConnected(true);
      setError(null);
    });

    socket.on("connected", (data) => {
      console.log("[GPS] Server welcome:", data);
    });

    socket.on("disconnect", (reason) => {
      console.log("[GPS] Socket.IO disconnected:", reason);
      setSocketConnected(false);
      
      if (reason === "io server disconnect") {
        socket.connect();
      }
    });

    socket.on("connect_error", (err) => {
      console.error("[GPS] Socket.IO connection error:", err.message);
      setSocketConnected(false);
    });

    socket.on("error", (data) => {
      console.error("[GPS] Server error:", data);
    });

    socketRef.current = socket;
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      console.log("[GPS] Disconnecting Socket.IO...");
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    }
  };

  const sendLocation = (pos: GeolocationPosition) => {
    if (!myTechnician?.id) {
      console.error("[GPS] Technician not found!");
      return;
    }

    if (socketRef.current?.connected) {
      const locationData = {
        technicianId: myTechnician.id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
        battery: batteryLevel ?? null,
        gpsStatus: "ativo" as const,
        connectionStatus: "online" as const,
        deviceModel: navigator.userAgent,
      };
      
      console.log("[GPS] Sending location:", locationData.latitude, locationData.longitude);
      socketRef.current.emit("location_update", locationData);
    } else {
      console.warn("[GPS] Socket not connected, cannot send location");
    }
  };

  const sendInactiveStatus = async () => {
    if (!myTechnician?.id) return;

    // Always try REST API first as it's more reliable for status updates
    try {
      await apiRequest("PATCH", `/api/technicians/${myTechnician.id}/gps-status`, {
        gpsStatus: "inativo",
        connectionStatus: "offline",
      });
      console.log("[GPS] Inactive status sent via REST API");
    } catch (error: any) {
      console.error("[GPS] Failed to send inactive status via REST:", error);
    }

    // Also try socket if connected (for real-time update)
    if (position && socketRef.current?.connected) {
      const locationData = {
        technicianId: myTechnician.id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy != null ? Math.round(position.coords.accuracy) : null,
        battery: batteryLevel ?? null,
        gpsStatus: "inativo" as const,
        connectionStatus: "offline" as const,
        deviceModel: navigator.userAgent,
      };
      socketRef.current.emit("location_update", locationData);
    }
  };

  const startTracking = () => {
    if (!("geolocation" in navigator)) {
      toast({
        title: "Erro",
        description: "Seu dispositivo não suporta geolocalização",
        variant: "destructive",
      });
      return;
    }

    if (!myTechnician) {
      toast({
        title: "Aguarde",
        description: "Carregando dados do técnico...",
        variant: "destructive",
      });
      return;
    }

    connectSocket();

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: GPS_INTERVAL_MS,
    };

    const intervalMinutes = GPS_INTERVAL_MS / 60000;
    console.log(`[GPS] Starting watchPosition, throttling sends to every ${intervalMinutes} minute(s)`);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        console.log("[GPS] Position update:", pos.coords.latitude, pos.coords.longitude);
        setPosition(pos);
        setError(null);
        setGpsActive(true);
        lastGpsUpdateRef.current = Date.now();
        inactiveAlertSentRef.current = false;

        const now = Date.now();
        const timeSinceLastSend = now - lastSendTimeRef.current;
        const currentLat = pos.coords.latitude;
        const currentLng = pos.coords.longitude;

        let distanceMoved = 0;
        if (lastSentPositionRef.current) {
          distanceMoved = calculateDistance(
            lastSentPositionRef.current.lat,
            lastSentPositionRef.current.lng,
            currentLat,
            currentLng
          );
        }

        const shouldSend =
          lastSendTimeRef.current === 0 ||
          timeSinceLastSend >= GPS_INTERVAL_MS ||
          distanceMoved >= MIN_DISTANCE_METERS;

        if (shouldSend) {
          sendLocation(pos);
          lastSendTimeRef.current = now;
          lastSentPositionRef.current = { lat: currentLat, lng: currentLng };
        }
      },
      (err) => {
        console.error("[GPS] watchPosition error:", err);
        setGpsActive(false);
        setError(`GPS off: ${err.message}`);
        
        if (!inactiveAlertSentRef.current) {
          inactiveAlertSentRef.current = true;
          sendInactiveStatus();
          toast({
            title: "GPS Desligado ou Sem Permissão",
            description: "Ative o GPS e permita acesso à localização",
            variant: "destructive",
          });
        }
      },
      options
    );

    watchIdRef.current = watchId;

    heartbeatIntervalRef.current = setInterval(() => {
      // Skip heartbeat check if app is in background (iOS/Android suspend GPS in background)
      if (isBackgroundRef.current) {
        console.log("[GPS] Heartbeat skipped - app in background");
        return;
      }

      const timeSinceLastUpdate = Date.now() - lastGpsUpdateRef.current;

      if (timeSinceLastUpdate > HEARTBEAT_TIMEOUT_MS && !inactiveAlertSentRef.current) {
        const timeoutSec = Math.round(timeSinceLastUpdate / 1000);
        const expectedSec = Math.round(HEARTBEAT_TIMEOUT_MS / 1000);
        console.error(`[GPS] Heartbeat timeout! No update for ${timeoutSec}s (expected: <${expectedSec}s)`);
        setError(`GPS não responde há ${expectedSec} segundos`);
        setGpsActive(false);
        inactiveAlertSentRef.current = true;
        sendInactiveStatus();
        
        toast({
          title: "GPS Sem Sinal",
          description: "Verifique se o GPS está ativado e se há sinal no local. Mantenha o app aberto na tela.",
          variant: "destructive",
        });
      }
    }, 10000);

    const intervalSeconds = Math.round(GPS_INTERVAL_MS / 1000);
    const intervalText = intervalSeconds < 60 
      ? `${intervalSeconds} segundos` 
      : `${Math.round(intervalSeconds / 60)} minuto(s)`;
    toast({
      title: "Modo Campo Ativado",
      description: `Localização enviada a cada ${intervalText}. Mantenha o app aberto para melhor precisão.`,
    });
  };

  const stopTracking = () => {
    sendInactiveStatus();

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    lastSendTimeRef.current = 0;
    lastSentPositionRef.current = null;
    disconnectSocket();

    setError(null);
    setGpsActive(false);

    toast({
      title: "Modo Campo Desativado",
      description: "O envio de localização foi interrompido",
    });
  };

  const toggleTracking = () => {
    const newState = !isTracking;
    setIsTracking(newState);
    localStorage.setItem(GPS_TRACKING_KEY, newState.toString());

    if (newState) {
      startTracking();
    } else {
      stopTracking();
    }
  };

  useEffect(() => {
    if (isTracking && myTechnician && user?.role === "assistente") {
      startTracking();
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      disconnectSocket();
    };
  }, [myTechnician, user]);

  if (user?.role !== "assistente") {
    return (
      <GPSTrackingContext.Provider value={{
        isTracking: false,
        toggleTracking: () => {},
        position: null,
        error: null,
        gpsActive: false,
        socketConnected: false,
      }}>
        {children}
      </GPSTrackingContext.Provider>
    );
  }

  return (
    <GPSTrackingContext.Provider value={{
      isTracking,
      toggleTracking,
      position,
      error,
      gpsActive,
      socketConnected,
    }}>
      {children}
    </GPSTrackingContext.Provider>
  );
}

export function useGPSTracking() {
  const context = useContext(GPSTrackingContext);
  if (context === undefined) {
    throw new Error("useGPSTracking must be used within GPSTrackingProvider");
  }
  return context;
}
