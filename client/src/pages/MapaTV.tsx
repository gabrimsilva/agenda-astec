import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, 
  MapPin, 
  Navigation, 
  Wifi, 
  WifiOff, 
  Battery, 
  Search,
  Clock,
  Route,
  Target,
  RefreshCw,
  Maximize2,
  Calendar,
  Filter,
  Building2,
  ArrowLeft
} from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// CSS para escurecer levemente o mapa claro (meio-termo)
const mapStyles = `
  .leaflet-tile-pane {
    filter: brightness(0.85) saturate(0.9);
  }
`;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const technicianActiveIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [49, 49]
});

const technicianInactiveIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [49, 49]
});

const technicianEnRouteIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [49, 49]
});

const technicianBusyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [49, 49]
});

const searchedLocationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [35, 57],
  iconAnchor: [17, 57],
  popupAnchor: [1, -45],
  shadowSize: [57, 57]
});

interface TechnicianStatus {
  technicianId: string;
  name: string;
  email: string;
  team: string | null;
  color: string | null;
  baseCity: string | null;
  baseAddress: string | null;
  status: string;
  gpsStatus: string;
  currentActivityStatus: string | null;
  lastLocation: {
    latitude: string;
    longitude: string;
    accuracy: number | null;
    address: string | null;
    city: string | null;
    updatedAt: Date;
  } | null;
  battery: number | null;
  device: string | null;
}

interface TechnicianWithDistance extends TechnicianStatus {
  distanceKm: number;
  estimatedMinutes: number | null;
}

interface Activity {
  id: string;
  title: string;
  scheduledDate: string;
  scheduledTime?: string;
  startTime?: string;
  endTime?: string;
  status: string;
  technicianId: string;
  clientName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  activityTypeName?: string;
  technicianName?: string;
  technicianColor?: string;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function AutoFitBounds({ technicians, searchLocation }: { 
  technicians: TechnicianStatus[]; 
  searchLocation: { lat: number; lng: number } | null 
}) {
  const map = useMap();
  
  const coordsHash = useMemo(() => {
    return technicians
      .filter(t => t.lastLocation?.latitude && t.lastLocation?.longitude)
      .map(t => `${t.technicianId}:${t.lastLocation!.latitude},${t.lastLocation!.longitude}`)
      .join('|');
  }, [technicians]);
  
  useEffect(() => {
    const points: [number, number][] = [];
    
    technicians.forEach(tech => {
      if (tech.lastLocation?.latitude && tech.lastLocation?.longitude) {
        points.push([
          parseFloat(tech.lastLocation.latitude),
          parseFloat(tech.lastLocation.longitude)
        ]);
      }
    });
    
    if (searchLocation) {
      points.push([searchLocation.lat, searchLocation.lng]);
    }
    
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true, duration: 1 });
    }
  }, [coordsHash, searchLocation, map, technicians]);
  
  return null;
}

function MapSizeInvalidator() {
  const map = useMap();
  
  useEffect(() => {
    const timers = [50, 100, 200, 500].map(delay => 
      setTimeout(() => {
        map.invalidateSize({ pan: false });
      }, delay)
    );
    
    const handleResize = () => {
      map.invalidateSize({ pan: false });
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);
  
  return null;
}

function FlyToTechnician({ technicianId, technicians }: { 
  technicianId: string | null; 
  technicians: TechnicianStatus[] 
}) {
  const map = useMap();
  
  useEffect(() => {
    if (!technicianId) return;
    
    const tech = technicians.find(t => t.technicianId === technicianId);
    if (!tech?.lastLocation?.latitude || !tech?.lastLocation?.longitude) return;
    
    const lat = parseFloat(tech.lastLocation.latitude);
    const lng = parseFloat(tech.lastLocation.longitude);
    
    if (isNaN(lat) || isNaN(lng)) return;
    
    map.flyTo([lat, lng], 15, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [technicianId, technicians, map]);
  
  return null;
}

export default function MapaTV() {
  const [, navigate] = useLocation();
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [cepInput, setCepInput] = useState("");
  const [searchLocation, setSearchLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Tab and filter states
  const [activeTab, setActiveTab] = useState<"technicians" | "activities">("technicians");
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [activityTechnicianFilter, setActivityTechnicianFilter] = useState<string>("all");
  const [activityStartDate, setActivityStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [activityEndDate, setActivityEndDate] = useState<string>(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  });

  const { data: technicians = [], isLoading } = useQuery<TechnicianStatus[]>({
    queryKey: ["/api/technicians/status"],
    refetchInterval: 30000,
  });
  
  const activitiesQueryUrl = `/api/map/activities?startDate=${activityStartDate}&endDate=${activityEndDate}`;
  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/map/activities", activityStartDate, activityEndDate],
    queryFn: async () => {
      const token = localStorage.getItem("astec_token");
      const res = await fetch(activitiesQueryUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch activities");
      return res.json();
    },
    enabled: activeTab === "activities",
    refetchInterval: 30000,
  });

  useEffect(() => {
    const token = localStorage.getItem("astec_token");
    
    if (!token) {
      console.warn("[MapaTV] Token não encontrado.");
      setWsConnected(false);
      return;
    }

    console.log("[MapaTV] Conectando ao Socket.IO...");

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
      console.log("[MapaTV] Socket.IO conectado!");
      setWsConnected(true);
    });

    socket.on("location_update", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/status"] });
      setLastUpdate(new Date());
    });

    socket.on("disconnect", (reason) => {
      console.log("[MapaTV] Socket.IO desconectado:", reason);
      setWsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[MapaTV] Erro de conexão:", err.message);
      setWsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      console.log("[MapaTV] Desconectando Socket.IO...");
      socket.disconnect();
    };
  }, []);

  const techniciansWithLocation = useMemo(() => {
    const seen = new Set<string>();
    return technicians.filter(t => {
      if (!t.lastLocation?.latitude || !t.lastLocation?.longitude) return false;
      const lat = parseFloat(t.lastLocation.latitude);
      const lng = parseFloat(t.lastLocation.longitude);
      if (isNaN(lat) || isNaN(lng)) return false;
      if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return false;
      if (seen.has(t.technicianId)) return false;
      seen.add(t.technicianId);
      return true;
    });
  }, [technicians]);
  
  // Filtered technicians based on selected filter
  const filteredTechnicians = useMemo(() => {
    if (technicianFilter === "all") return techniciansWithLocation;
    
    return techniciansWithLocation.filter(t => {
      switch (technicianFilter) {
        case "online":
          return t.gpsStatus === "ativo" && t.status === "online" && !t.currentActivityStatus;
        case "enRoute":
          return t.currentActivityStatus === "aCaminho";
        case "inActivity":
          return t.currentActivityStatus === "emExecucao";
        case "offline":
          return t.gpsStatus !== "ativo" || t.status !== "online";
        default:
          return true;
      }
    });
  }, [techniciansWithLocation, technicianFilter]);
  
  // Filtered activities based on filters
  const filteredActivities = useMemo(() => {
    let filtered = activities;
    
    if (activityTechnicianFilter !== "all") {
      filtered = filtered.filter(a => a.technicianId === activityTechnicianFilter);
    }
    
    return filtered.sort((a, b) => {
      const timeA = a.scheduledTime || a.startTime || '00:00';
      const timeB = b.scheduledTime || b.startTime || '00:00';
      const dateA = new Date(`${a.scheduledDate}T${timeA}`);
      const dateB = new Date(`${b.scheduledDate}T${timeB}`);
      return dateA.getTime() - dateB.getTime();
    });
  }, [activities, activityTechnicianFilter]);

  const techniciansWithDistance = useMemo((): TechnicianWithDistance[] => {
    if (!searchLocation) {
      return filteredTechnicians.map(t => ({
        ...t,
        distanceKm: 0,
        estimatedMinutes: null
      }));
    }

    return filteredTechnicians
      .map(t => {
        const lat = parseFloat(t.lastLocation!.latitude);
        const lng = parseFloat(t.lastLocation!.longitude);
        const distanceKm = calculateDistance(searchLocation.lat, searchLocation.lng, lat, lng);
        const estimatedMinutes = Math.round(distanceKm * 2);
        
        return {
          ...t,
          distanceKm,
          estimatedMinutes
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [filteredTechnicians, searchLocation]);

  const searchByCep = useCallback(async () => {
    if (!cepInput || cepInput.length < 8) return;
    
    setIsSearching(true);
    try {
      const cleanCep = cepInput.replace(/\D/g, "");
      const viaCepResponse = await fetch(`/api/cep/${cleanCep}`);
      const viaCepData = await viaCepResponse.json();
      
      if (viaCepData.erro) {
        console.error("CEP não encontrado");
        setIsSearching(false);
        return;
      }

      const address = viaCepData.logradouro || "";
      const bairro = viaCepData.bairro || "";
      const city = viaCepData.localidade || "";
      const state = viaCepData.uf || "";
      const fullAddress = [address, bairro, city, state].filter(Boolean).join(", ");
      
      const token = localStorage.getItem("astec_token");
      const geocodeResponse = await fetch("/api/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ address, bairro, city, state, country: "Brasil" })
      });
      
      const geocodeData = await geocodeResponse.json();
      
      if (geocodeData.latitude && geocodeData.longitude) {
        setSearchLocation({ 
          lat: geocodeData.latitude, 
          lng: geocodeData.longitude, 
          address: fullAddress 
        });
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsSearching(false);
    }
  }, [cepInput]);

  const clearSearch = useCallback(() => {
    setSearchLocation(null);
    setCepInput("");
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const getTechnicianIcon = (tech: TechnicianStatus) => {
    if (tech.gpsStatus !== "ativo") return technicianInactiveIcon;
    if (tech.currentActivityStatus === "emExecucao") return technicianBusyIcon;
    if (tech.currentActivityStatus === "aCaminho") return technicianEnRouteIcon;
    if (tech.status === "online") return technicianActiveIcon;
    return technicianInactiveIcon;
  };

  const getTechnicianStatusLabel = (tech: TechnicianStatus) => {
    if (tech.gpsStatus !== "ativo") return { label: "GPS Inativo", color: "bg-gray-500" };
    if (tech.currentActivityStatus === "emExecucao") return { label: "Em atividade", color: "bg-orange-500" };
    if (tech.currentActivityStatus === "aCaminho") return { label: "Em rota", color: "bg-blue-500" };
    if (tech.status === "online") return { label: "Disponível", color: "bg-green-500" };
    return { label: "Offline", color: "bg-gray-500" };
  };

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return "—";
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl flex items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin" />
          Carregando Mapa TV...
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-screen w-screen bg-gray-900 flex overflow-hidden"
      data-testid="mapa-tv-container"
    >
      <style>{mapStyles}</style>
      <div className="flex-1 relative">
        <MapContainer
          center={[-23.5505, -46.6333]}
          zoom={10}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            className="map-tiles-muted"
          />
          
          <MapSizeInvalidator />
          <AutoFitBounds technicians={techniciansWithLocation} searchLocation={searchLocation} />
          <FlyToTechnician technicianId={selectedTechnicianId} technicians={techniciansWithLocation} />

          {searchLocation && (
            <Marker
              position={[searchLocation.lat, searchLocation.lng]}
              icon={searchedLocationIcon}
              data-testid="marker-search-location"
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-red-500" />
                    <p className="font-semibold">Local Pesquisado</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{searchLocation.address}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {techniciansWithLocation.map((tech) => {
            const lat = parseFloat(tech.lastLocation!.latitude);
            const lng = parseFloat(tech.lastLocation!.longitude);
            const markerIcon = getTechnicianIcon(tech);
            
            return (
              <Marker
                key={tech.technicianId}
                position={[lat, lng]}
                icon={markerIcon}
                data-testid={`marker-technician-${tech.technicianId}`}
              >
                <Popup>
                  <div className="p-2 w-[240px] max-w-[240px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-blue-500 shrink-0" />
                      <p className="font-semibold text-sm truncate">{tech.name}</p>
                    </div>
                    
                    {tech.team && (
                      <p className="text-xs text-muted-foreground mb-1 truncate">
                        Equipe: {tech.team}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={tech.gpsStatus === "ativo" ? "default" : "secondary"} className="text-xs gap-1">
                        <Navigation className="h-3 w-3" />
                        {tech.gpsStatus === "ativo" ? "GPS Ativo" : "GPS Inativo"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-1">
                      {tech.status === "online" ? (
                        <Wifi className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-gray-400 shrink-0" />
                      )}
                      <span className="text-sm">
                        {tech.status === "online" ? "Online" : "Offline"}
                      </span>
                    </div>

                    {tech.battery !== null && (
                      <div className="flex items-center gap-2 mb-1">
                        <Battery className="h-3 w-3 shrink-0" />
                        <span className="text-sm">{tech.battery}%</span>
                      </div>
                    )}

                    {tech.baseCity && (
                      <p className="text-xs text-muted-foreground mt-2 break-words">
                        <MapPin className="h-3 w-3 inline mr-1 shrink-0" />
                        Base: {tech.baseCity}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        <div className="absolute top-4 left-4 z-[1000] flex items-center gap-4">
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-white text-lg font-medium">
              {wsConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-3">
            <Clock className="h-5 w-5 text-gray-400" />
            <span className="text-white text-lg">
              Última atualização: {formatLastUpdate(lastUpdate)}
            </span>
          </div>

          <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-400" />
            <span className="text-white text-lg">
              {techniciansWithLocation.length} técnicos ativos
            </span>
          </div>
        </div>

        <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="bg-gray-800/90 backdrop-blur-sm border-gray-600 hover:bg-gray-700"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="bg-gray-800/90 backdrop-blur-sm border-gray-600 hover:bg-gray-700"
            onClick={toggleFullscreen}
            data-testid="button-fullscreen"
          >
            <Maximize2 className="h-5 w-5 text-white" />
          </Button>
        </div>
      </div>

      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-red-400" />
            Buscar por CEP
          </h2>
          
          <div className="flex gap-2">
            <Input
              placeholder="00000-000"
              value={cepInput}
              onChange={(e) => setCepInput(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 text-lg"
              onKeyDown={(e) => e.key === 'Enter' && searchByCep()}
              data-testid="input-cep"
            />
            <Button 
              onClick={searchByCep} 
              disabled={isSearching || cepInput.length < 8}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-search-cep"
            >
              {isSearching ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {searchLocation && (
            <div className="mt-3 p-3 bg-gray-700 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white text-sm font-medium flex items-center gap-1">
                    <Target className="h-4 w-4 text-red-400" />
                    Local encontrado
                  </p>
                  <p className="text-gray-300 text-xs mt-1">{searchLocation.address}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-white h-6 px-2"
                  data-testid="button-clear-search"
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tabs for Technicians and Activities */}
        <div className="p-4 border-b border-gray-700">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "technicians" | "activities")}>
            <TabsList className="grid w-full grid-cols-2 bg-gray-700">
              <TabsTrigger value="technicians" className="data-[state=active]:bg-blue-600 text-white">
                <Users className="h-4 w-4 mr-2" />
                Técnicos
              </TabsTrigger>
              <TabsTrigger value="activities" className="data-[state=active]:bg-blue-600 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                Atividades
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Filters Section */}
        <div className="p-4 border-b border-gray-700">
          {activeTab === "technicians" ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-gray-300 text-sm">Filtrar por status</span>
              </div>
              <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="Todos os técnicos" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="all" className="text-white hover:bg-gray-600">Todos</SelectItem>
                  <SelectItem value="online" className="text-white hover:bg-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      Disponível
                    </div>
                  </SelectItem>
                  <SelectItem value="enRoute" className="text-white hover:bg-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Em rota
                    </div>
                  </SelectItem>
                  <SelectItem value="inActivity" className="text-white hover:bg-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      Em atividade
                    </div>
                  </SelectItem>
                  <SelectItem value="offline" className="text-white hover:bg-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-500" />
                      Offline
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {searchLocation && (
                <p className="text-gray-400 text-xs mt-2">
                  Ordenados do mais próximo ao mais distante
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-gray-300 text-sm">Filtros</span>
              </div>
              
              <Select value={activityTechnicianFilter} onValueChange={setActivityTechnicianFilter}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="Todos os técnicos" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="all" className="text-white hover:bg-gray-600">Todos os técnicos</SelectItem>
                  {technicians.map(tech => (
                    <SelectItem key={tech.technicianId} value={tech.technicianId} className="text-white hover:bg-gray-600">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: tech.color || '#6b7280' }}
                        />
                        {tech.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Data início</label>
                  <Input
                    type="date"
                    value={activityStartDate}
                    onChange={(e) => setActivityStartDate(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Data fim</label>
                  <Input
                    type="date"
                    value={activityEndDate}
                    onChange={(e) => setActivityEndDate(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {activeTab === "technicians" ? (
              <>
                {techniciansWithDistance.map((tech, index) => {
                  const statusInfo = getTechnicianStatusLabel(tech);
                  const isSelected = selectedTechnicianId === tech.technicianId;
                  const hasLocation = tech.lastLocation?.latitude && tech.lastLocation?.longitude;
                  
                  return (
                    <div
                      key={tech.technicianId}
                      className={`rounded-lg p-3 transition-all duration-300 ${
                        isSelected 
                          ? 'bg-blue-600/30 ring-2 ring-blue-500' 
                          : 'bg-gray-700/50 hover:bg-gray-700'
                      } ${hasLocation ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
                      onClick={() => {
                        if (hasLocation) {
                          setSelectedTechnicianId(isSelected ? null : tech.technicianId);
                        }
                      }}
                      data-testid={`card-technician-${tech.technicianId}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {searchLocation && (
                            <div className="text-2xl font-bold text-gray-400 w-8">
                              {index + 1}
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium text-base">{tech.name}</p>
                            {tech.team && (
                              <p className="text-gray-400 text-sm">{tech.team}</p>
                            )}
                          </div>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${statusInfo.color}`} />
                      </div>

                      {searchLocation && tech.distanceKm > 0 && (
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1 text-gray-300">
                            <Route className="h-4 w-4 text-blue-400" />
                            <span>{tech.distanceKm.toFixed(1)} km</span>
                          </div>
                          {tech.estimatedMinutes && (
                            <div className="flex items-center gap-1 text-gray-300">
                              <Clock className="h-4 w-4 text-orange-400" />
                              <span>~{tech.estimatedMinutes} min</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${tech.gpsStatus === 'ativo' ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400'}`}
                        >
                          {tech.gpsStatus === 'ativo' ? 'GPS Ativo' : 'GPS Inativo'}
                        </Badge>
                        {tech.battery !== null && (
                          <Badge variant="outline" className="text-xs border-gray-500 text-gray-400">
                            <Battery className="h-3 w-3 mr-1" />
                            {tech.battery}%
                          </Badge>
                        )}
                      </div>

                      {tech.baseCity && (
                        <p className="text-gray-500 text-xs mt-2">
                          Base: {tech.baseCity}
                        </p>
                      )}
                    </div>
                  );
                })}

                {techniciansWithDistance.length === 0 && (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 text-lg">Nenhum técnico encontrado</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {filteredActivities.map((activity) => {
                  const techColor = activity.technicianColor || '#6b7280';
                  const activityDate = new Date(activity.scheduledDate);
                  const isToday = activityDate.toDateString() === new Date().toDateString();
                  const isTomorrow = activityDate.toDateString() === new Date(Date.now() + 86400000).toDateString();
                  
                  const dateLabel = isToday ? "Hoje" : isTomorrow ? "Amanhã" : activityDate.toLocaleDateString("pt-BR", { weekday: 'short', day: '2-digit', month: '2-digit' });
                  
                  return (
                    <div
                      key={activity.id}
                      className="bg-gray-700/50 rounded-lg p-3 hover:bg-gray-700 transition-colors border-l-4"
                      style={{ borderLeftColor: techColor }}
                      data-testid={`card-activity-${activity.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            <p className="text-white font-medium text-base">
                              {activity.clientName || "Cliente não definido"}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: techColor }}
                            />
                            <span className="text-gray-300 text-sm">
                              {activity.technicianName || "Técnico não definido"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex items-center gap-1 text-gray-300">
                          <Calendar className="h-4 w-4 text-blue-400" />
                          <span>{dateLabel}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-300">
                          <Clock className="h-4 w-4 text-orange-400" />
                          <span>{activity.scheduledTime || activity.startTime || '--:--'}</span>
                        </div>
                      </div>

                      {activity.activityTypeName && (
                        <Badge 
                          variant="outline" 
                          className="mt-2 text-xs border-gray-500 text-gray-300"
                        >
                          {activity.activityTypeName}
                        </Badge>
                      )}
                    </div>
                  );
                })}

                {filteredActivities.length === 0 && (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 text-lg">Nenhuma atividade encontrada</p>
                    <p className="text-gray-500 text-sm mt-1">Ajuste os filtros para ver mais atividades</p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-gray-700 bg-gray-800/80">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-300">Disponível</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-300">Em rota</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-gray-300">Em atividade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              <span className="text-gray-300">Offline</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
