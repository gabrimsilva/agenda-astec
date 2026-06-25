import { useEffect, useState, useRef, useLayoutEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import polyline from "@mapbox/polyline";
import { io, Socket } from "socket.io-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Users, Building2, Activity, Battery, Clock, Wifi, WifiOff, Navigation, Calendar, List, Map } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClientsClusterLayer } from "@/components/map/ClientsClusterLayer";
import { FiltersDrawer } from "@/components/map/FiltersDrawer";
import { MapResizeHandler } from "@/components/map/MapResizeHandler";
import { RouteCalculator } from "@/components/map/RouteCalculator";
import { NearbyTechniciansPanel } from "@/components/map/NearbyTechniciansPanel";
import { QuickScheduleDialog } from "@/components/map/QuickScheduleDialog";
import { TechnicianFilter } from "@/components/map/TechnicianFilter";
import { ActivitiesLayer } from "@/components/map/ActivitiesLayer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { PREDEFINED_SEGMENTS } from "@/lib/constants";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import moment from "moment";

// Fix para os ícones padrão do Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Ícone customizado para técnicos ativos (azul)
const technicianActiveIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Ícone customizado para técnicos inativos (cinza)
const technicianInactiveIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Ícone customizado para origem da rota (vermelho)
const routeOriginIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Ícone customizado para localização pesquisada (laranja)
const searchedLocationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
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
  androidVersion: string | null;
  appVersion: string | null;
}

interface ClientSite {
  id: string;
  siteName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface MapClient {
  id: string;
  companyName: string;
  segment: string | null;
  group: string | null;
  sites: ClientSite[];
}

interface FilterOptions {
  groups: string[];
  segments: string[];
}

// Componente helper para centralizar o mapa automaticamente
function MapCenterController({ location }: { location: { lat: number; lng: number } | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (location) {
      map.flyTo([location.lat, location.lng], 15, {
        duration: 1.5,
      });
    }
  }, [location, map]);
  
  return null;
}

// MOBILE FIX: Componente para forçar recalcular tamanho do mapa (corrige tarja preta)
function MapSizeInvalidator() {
  const map = useMap();
  
  useLayoutEffect(() => {
    // Force map to recalculate size after mounting (fixes black bar on mobile)
    // Multiple attempts with different delays to ensure it works
    const timers = [50, 100, 200, 500].map(delay => 
      setTimeout(() => {
        map.invalidateSize({ pan: false });
      }, delay)
    );
    
    // Also invalidate on window resize (mobile orientation change)
    const handleResize = () => {
      map.invalidateSize({ pan: false });
    };
    
    // Handle visibility change (when user switches tabs/apps on mobile)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(() => {
          map.invalidateSize({ pan: false });
        }, 100);
      }
    };
    
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [map]);
  
  return null;
}

export default function Routes() {
  const isMobile = useIsMobile();
  // Centro do mapa em Curitiba
  const defaultCenter: [number, number] = [-25.4284, -49.2733];
  const defaultZoom = 12;
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"technicians" | "clients">("technicians");
  const [selectedClients, setSelectedClients] = useState<string[]>([]); // IDs dos clientes selecionados
  const [routePanelOpen, setRoutePanelOpen] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState<string | null>(null); // Geometry polyline da rota otimizada
  const [routeOrigin, setRouteOrigin] = useState<{ lat: number; lng: number; name: string } | null>(null); // Origem da rota
  const [nearbyPanelOpen, setNearbyPanelOpen] = useState(false); // Controla o painel de técnicos próximos
  const [drawerOpen, setDrawerOpen] = useState(false); // Controla o drawer de filtros (clients tab)
  const [searchedLocation, setSearchedLocation] = useState<{ 
    lat: number; 
    lng: number; 
    address: string;
    displayName?: string;
    numero?: string;
    bairro?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  } | null>(null); // Localização do endereço pesquisado com componentes
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false); // Controla o dialog de agendamento
  const [selectedScheduleData, setSelectedScheduleData] = useState<{
    technicianId: string;
    technicianName: string;
    address?: string;
    numero?: string;
    bairro?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    latitude: number;
    longitude: number;
  } | null>(null); // Dados do técnico e endereço selecionados para agendamento
  
  // Filtro de técnicos para o mapa
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);
  const [showActivities, setShowActivities] = useState(true); // Mostrar atividades no mapa
  const [viewMode, setViewMode] = useState<"map" | "list">("map"); // Modo de visualização: mapa ou lista
  const [activityDateRange, setActivityDateRange] = useState<{ start: string; end: string }>(() => {
    const today = new Date();
    return {
      start: today.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0],
    };
  });
  
  // CSS-FIRST APPROACH: Map height controlled by flexbox
  // No refs or explicit calculations needed - Leaflet adapts to container
  
  // Carregar filtros salvos do localStorage
  const loadSavedFilters = () => {
    try {
      const saved = localStorage.getItem("astec_map_filters");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Erro ao carregar filtros salvos:", error);
    }
    return { group: "", segment: "", search: "" };
  };
  
  const [filters, setFilters] = useState(loadSavedFilters);
  
  // Salvar filtros no localStorage quando mudarem
  useEffect(() => {
    localStorage.setItem("astec_map_filters", JSON.stringify(filters));
  }, [filters]);

  // Buscar técnicos com GPS
  const { data: technicians = [], isLoading: loadingTechs } = useQuery<TechnicianStatus[]>({
    queryKey: ["/api/technicians/status"],
  });

  // Buscar clientes com seus sites (com filtros)
  const { data: clients = [], isLoading: loadingClients } = useQuery<MapClient[]>({
    queryKey: ["/api/map/clients", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.group && filters.group !== "all") params.append("group", filters.group);
      if (filters.segment && filters.segment !== "all") params.append("segment", filters.segment);
      if (filters.search) params.append("search", filters.search);
      
      const response = await fetch(`/api/map/clients?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('astec_token')}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch clients');
      return response.json();
    },
  });

  // Buscar opções de filtros (grupos e negócios únicos)
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/map/filters/options"],
  });

  // Buscar atividades para o mapa (filtradas por técnicos e período)
  interface MapActivity {
    id: string;
    title: string;
    clientName: string;
    address: string;
    latitude: number;
    longitude: number;
    scheduledDate: string;
    scheduledTime: string;
    status: string;
    activityTypeName: string;
    technicianId: string;
    technicianName: string;
    technicianColor: string;
  }

  const { data: mapActivities = [], isLoading: loadingActivities } = useQuery<MapActivity[]>({
    queryKey: ["/api/map/activities", selectedTechnicianIds, activityDateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedTechnicianIds.length > 0) {
        params.append("technicianIds", selectedTechnicianIds.join(","));
      }
      params.append("startDate", activityDateRange.start);
      params.append("endDate", activityDateRange.end);
      
      const response = await fetch(`/api/map/activities?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('astec_token')}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch map activities');
      return response.json();
    },
    enabled: showActivities,
  });

  // Preparar lista de técnicos para o filtro
  const technicianOptions = technicians.map(t => ({
    id: t.technicianId,
    name: t.name,
    color: t.color,
    team: t.team,
    baseCity: null as string | null, // Será preenchido do endpoint de técnicos
  }));

  // Socket.IO para atualizações em tempo real
  useEffect(() => {
    const token = localStorage.getItem("astec_token");
    
    if (!token) {
      console.warn("[Socket.IO] Token não encontrado.");
      setWsConnected(false);
      return;
    }

    console.log("[Socket.IO] Conectando ao servidor GPS...");

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
      console.log("[Socket.IO] Conectado ao servidor GPS!");
      setWsConnected(true);
    });

    socket.on("connected", (data) => {
      console.log("[Socket.IO] Boas-vindas:", data);
    });

    socket.on("location_update", (data) => {
      console.log("[Socket.IO] Atualização de localização recebida:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/status"] });
      setLastUpdate(new Date());
    });

    socket.on("error", (data) => {
      console.error("[Socket.IO] Erro do servidor:", data);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Desconectado:", reason);
      setWsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket.IO] Erro de conexão:", err.message);
      setWsConnected(false);
    });

    return () => {
      console.log("[Socket.IO] Desconectando...");
      socket.disconnect();
    };
  }, []);

  // Atualizar timestamp quando dados mudam
  useEffect(() => {
    if (technicians.length > 0 || clients.length > 0) {
      setLastUpdate(new Date());
    }
  }, [technicians, clients]);

  const techniciansWithLocation = useMemo(() => {
    const seen = new Set<string>();
    return technicians.filter((t) => {
      if (!t.lastLocation?.latitude || !t.lastLocation?.longitude) return false;
      const lat = parseFloat(t.lastLocation.latitude);
      const lng = parseFloat(t.lastLocation.longitude);
      if (isNaN(lat) || isNaN(lng)) return false;
      if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return false;
      if (selectedTechnicianIds.length > 0 && !selectedTechnicianIds.includes(t.technicianId)) return false;
      if (seen.has(t.technicianId)) return false;
      seen.add(t.technicianId);
      return true;
    });
  }, [technicians, selectedTechnicianIds]);

  // Transformar clientes em sites com localização válida
  const sitesWithLocation = clients.flatMap(client => 
    client.sites
      .filter(site => site.latitude && site.longitude)
      .map(site => ({
        ...site,
        latitude: site.latitude!,
        longitude: site.longitude!,
        clientName: client.companyName,
        clientSegment: client.segment,
        clientGroup: client.group,
      }))
  );

  // Contar técnicos online e com GPS ativo
  const techniciansOnline = technicians.filter((t) => t.status === "online").length;
  const techniciansWithActiveGPS = technicians.filter((t) => t.gpsStatus === "ativo").length;
  const techniciansWithInactiveGPS = technicians.filter((t) => t.gpsStatus === "inativo").length;

  const handleFiltersChange = (newFilters: { group: string; segment: string; search: string }) => {
    setFilters(newFilters);
  };

  // Lógica de seleção de clientes
  const handleSiteClick = (site: any) => {
    setSelectedClients((prev) => {
      if (prev.includes(site.id)) {
        // Se já está selecionado, remove
        return prev.filter((id) => id !== site.id);
      } else {
        // Se não está selecionado, adiciona
        return [...prev, site.id];
      }
    });
    
    // Abrir painel de rotas automaticamente ao selecionar primeiro cliente
    if (selectedClients.length === 0) {
      setRoutePanelOpen(true);
    }
  };

  const handleRemoveSite = (siteId: string) => {
    setSelectedClients((prev) => prev.filter((id) => id !== siteId));
  };

  const handleClearSelection = () => {
    setSelectedClients([]);
    setRouteGeometry(null); // Limpar rota ao limpar seleção
  };

  const handleCloseRoutePanel = () => {
    setRoutePanelOpen(false);
    setRouteGeometry(null); // Limpar rota ao fechar painel
    setRouteOrigin(null); // Limpar origem ao fechar painel
  };

  const handleRouteCalculated = (route: any, origin?: { lat: number; lng: number; name: string }) => {
    if (route && route.trips && route.trips[0]?.geometry) {
      setRouteGeometry(route.trips[0].geometry);
      setRouteOrigin(origin || null);
    } else {
      setRouteGeometry(null);
      setRouteOrigin(null);
    }
  };

  // Converter IDs selecionados em sites completos
  const selectedSitesData = sitesWithLocation.filter((site) => selectedClients.includes(site.id));

  // Decodificar geometria da rota para coordenadas Leaflet
  const routeCoordinates = routeGeometry 
    ? polyline.decode(routeGeometry).map(([lat, lng]: [number, number]) => [lat, lng] as [number, number])
    : [];

  // CSS-FIRST APPROACH: Map height is now controlled by flexbox (flex-1 + min-h-0)
  // No explicit height calculation needed - Leaflet adapts to container size
  // MapSizeInvalidator handles Leaflet's invalidateSize() after mount and resize

  return (
    <div className="flex flex-col gap-2 h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "technicians" | "clients")} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-fit grid-cols-2" data-testid="map-tabs">
          <TabsTrigger value="technicians" data-testid="tab-technicians">
            <Users className="h-4 w-4 mr-2" />
            Colaboradores
          </TabsTrigger>
          <TabsTrigger value="clients" data-testid="tab-clients">
            <Building2 className="h-4 w-4 mr-2" />
            Clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="technicians" className="flex-1 mt-2 data-[state=active]:flex data-[state=active]:flex-col min-h-0">
          {/* Barra de filtros para técnicos e atividades */}
          <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-muted/50 rounded-lg">
            <TechnicianFilter
              technicians={technicianOptions}
              selectedTechnicianIds={selectedTechnicianIds}
              onSelectionChange={setSelectedTechnicianIds}
              disabled={loadingTechs}
            />
            
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={activityDateRange.start}
                onChange={(e) => setActivityDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="h-8 w-auto"
                data-testid="input-activity-start-date"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                value={activityDateRange.end}
                onChange={(e) => setActivityDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="h-8 w-auto"
                data-testid="input-activity-end-date"
              />
            </div>

            <Button
              variant={showActivities ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowActivities(!showActivities)}
              className="gap-2"
              data-testid="button-toggle-activities"
            >
              <Calendar className="h-4 w-4" />
              {showActivities ? "Ocultar" : "Mostrar"} Atividades
              {showActivities && mapActivities.length > 0 && (
                <Badge variant="default" className="ml-1">
                  {mapActivities.length}
                </Badge>
              )}
            </Button>

            <Button
              variant={viewMode === "list" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setViewMode(viewMode === "map" ? "list" : "map")}
              className="gap-2"
              data-testid="button-toggle-view-mode"
            >
              {viewMode === "map" ? (
                <>
                  <List className="h-4 w-4" />
                  Ver Lista GPS
                </>
              ) : (
                <>
                  <Map className="h-4 w-4" />
                  Ver Mapa
                </>
              )}
            </Button>

            <div className="h-6 w-px bg-border mx-1" />

            <Button
              variant={nearbyPanelOpen ? "secondary" : "outline"}
              size="sm"
              onClick={() => setNearbyPanelOpen(!nearbyPanelOpen)}
              data-testid="button-toggle-nearby-panel"
              className="gap-2"
            >
              <MapPin className="h-4 w-4" />
              Encontrar Técnico Próximo
            </Button>

            <Badge variant="outline" className="gap-1 text-xs" data-testid="status-technicians">
              <Users className="h-3 w-3" />
              {techniciansOnline}/{technicians.length} online
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs" data-testid="status-gps-active">
              <Navigation className="h-3 w-3 text-green-500" />
              {techniciansWithActiveGPS} GPS Ativo
            </Badge>
            {techniciansWithInactiveGPS > 0 && (
              <Badge variant="secondary" className="gap-1 text-xs" data-testid="status-gps-inactive">
                <Navigation className="h-3 w-3 text-muted-foreground" />
                {techniciansWithInactiveGPS} GPS Inativo
              </Badge>
            )}

            {selectedTechnicianIds.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                {selectedTechnicianIds.length} técnico(s) selecionado(s)
              </Badge>
            )}
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <div className="flex-1 min-h-[350px] md:min-h-[500px] rounded-lg border relative">
              {loadingTechs ? (
                <div className="h-full w-full flex items-center justify-center bg-muted">
                  <div className="text-center">
                    <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  </div>
                </div>
              ) : viewMode === "list" ? (
                /* Lista de técnicos com GPS */
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3" data-testid="gps-technicians-list">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-sm">Lista de Técnicos GPS</h3>
                      <Badge variant="outline" className="gap-1">
                        {technicians.length} técnico(s)
                      </Badge>
                    </div>
                    
                    {technicians.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhum técnico encontrado</p>
                      </div>
                    ) : (
                      technicians
                        .filter(tech => 
                          selectedTechnicianIds.length === 0 || 
                          selectedTechnicianIds.includes(tech.technicianId)
                        )
                        .map((tech) => {
                          const hasLocation = tech.lastLocation !== null;
                          const isGpsActive = tech.gpsStatus === "ativo";
                          
                          // Usar cidade do GPS (já vem do backend via geocodificação reversa)
                          const gpsCity = tech.lastLocation?.city;
                          const displayLocation = gpsCity || (hasLocation ? "Buscando localização..." : "Sem localização GPS");
                          
                          return (
                            <Card 
                              key={tech.technicianId} 
                              className="p-3 hover-elevate"
                              data-testid={`gps-list-item-${tech.technicianId}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div
                                      className="h-3 w-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: tech.color || "#3b82f6" }}
                                    />
                                    <p className="font-semibold text-sm truncate">{tech.name}</p>
                                    {tech.team && (
                                      <Badge variant="outline" className="text-xs flex-shrink-0">
                                        {tech.team}
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{displayLocation}</span>
                                  </div>
                                  
                                  {hasLocation && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3 flex-shrink-0" />
                                      <span>Última atualização: {moment(tech.lastLocation!.updatedAt).fromNow()}</span>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                  <Badge 
                                    variant={isGpsActive ? "default" : "secondary"} 
                                    className="gap-1 text-xs"
                                    data-testid={`gps-status-${tech.technicianId}`}
                                  >
                                    <Navigation className="h-3 w-3" />
                                    {isGpsActive ? "GPS Ativo" : "GPS Inativo"}
                                  </Badge>
                                  
                                  <Badge 
                                    variant={tech.status === "online" ? "default" : "outline"} 
                                    className="gap-1 text-xs"
                                  >
                                    {tech.status === "online" ? (
                                      <Wifi className="h-3 w-3" />
                                    ) : (
                                      <WifiOff className="h-3 w-3" />
                                    )}
                                    {tech.status === "online" ? "Online" : "Offline"}
                                  </Badge>
                                  
                                  {tech.battery !== null && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Battery className="h-3 w-3" />
                                      <span>{tech.battery}%</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          );
                        })
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <MapContainer
                  center={defaultCenter}
                  zoom={defaultZoom}
                  className="h-full w-full"
                  zoomControl={true}
                  data-testid="map-container-technicians"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {/* Marcadores de Técnicos */}
                  {techniciansWithLocation.map((tech) => {
                    const lat = parseFloat(tech.lastLocation!.latitude);
                    const lng = parseFloat(tech.lastLocation!.longitude);

                    // Escolher ícone baseado no status do GPS
                    const markerIcon = tech.gpsStatus === "ativo" ? technicianActiveIcon : technicianInactiveIcon;
                    
                    return (
                      <Marker
                        key={tech.technicianId}
                        position={[lat, lng]}
                        icon={markerIcon}
                        data-testid={`marker-technician-${tech.technicianId}`}
                      >
                        <Popup>
                          <div className="p-2 w-[230px] max-w-[230px]" data-testid={`popup-technician-${tech.technicianId}`}>
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
                              <span className="text-xs">
                                {tech.status === "online" ? "Online" : "Offline"}
                              </span>
                            </div>

                            {tech.battery !== null && (
                              <div className="flex items-center gap-2 mb-1">
                                <Battery className="h-3 w-3 shrink-0" />
                                <span className="text-xs">Bateria: {tech.battery}%</span>
                              </div>
                            )}

                            {tech.lastLocation?.address && (
                              <p className="text-xs text-muted-foreground mt-2 break-words">
                                <MapPin className="h-3 w-3 inline mr-1 shrink-0" />
                                {tech.lastLocation.address}
                              </p>
                            )}

                            <p className="text-xs text-muted-foreground mt-2">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {moment(tech.lastLocation!.updatedAt).fromNow()}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {/* Marcadores de Atividades coloridos por técnico */}
                  {showActivities && mapActivities.length > 0 && (
                    <ActivitiesLayer
                      activities={mapActivities}
                      onScheduleWithTechnician={(technicianId, technicianName) => {
                        if (searchedLocation) {
                          setSelectedScheduleData({
                            technicianId,
                            technicianName,
                            address: searchedLocation.address || "",
                            numero: searchedLocation.numero,
                            bairro: searchedLocation.bairro,
                            city: searchedLocation.city,
                            state: searchedLocation.state,
                            postcode: searchedLocation.postcode,
                            country: searchedLocation.country,
                            latitude: searchedLocation.lat,
                            longitude: searchedLocation.lng,
                          });
                          setScheduleDialogOpen(true);
                        }
                      }}
                    />
                  )}

                  {/* Marcador da localização pesquisada */}
                  {searchedLocation && (
                    <Marker
                      position={[searchedLocation.lat, searchedLocation.lng]}
                      icon={searchedLocationIcon}
                      data-testid="searched-location-marker"
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold text-orange-600">📍 Endereço Pesquisado</p>
                          <p className="text-xs mt-2">{searchedLocation.address}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                  
                  {/* Controlador para centralizar mapa automaticamente */}
                  <MapCenterController location={searchedLocation} />
                  
                  {/* MOBILE FIX: Force map to recalculate size (fixes black bar) */}
                  <MapSizeInvalidator />
                </MapContainer>
              )}
            </div>

            {/* Painel lateral de técnicos próximos - responsivo para notebooks 14" */}
            {nearbyPanelOpen && (
              <div className="w-80 lg:w-96 xl:w-[420px] flex-shrink-0 min-w-[280px] flex flex-col h-full min-h-0" data-testid="nearby-technicians-panel-container">
                <NearbyTechniciansPanel
                  onClose={() => {
                    setNearbyPanelOpen(false);
                    setSearchedLocation(null); // Limpa o marcador ao fechar o painel
                  }}
                  onLocationSearched={(location) => setSearchedLocation(location)}
                  dateRange={activityDateRange}
                  onTechnicianSelect={(technicianId, lat, lng) => {
                    // Find technician data from the technicians list
                    const tech = technicians.find(t => t.technicianId === technicianId);
                    if (tech && searchedLocation) {
                      setSelectedScheduleData({
                        technicianId,
                        technicianName: tech.name,
                        address: searchedLocation.address || searchedLocation.displayName || "",
                        numero: searchedLocation.numero,
                        bairro: searchedLocation.bairro,
                        city: searchedLocation.city,
                        state: searchedLocation.state,
                        postcode: searchedLocation.postcode,
                        country: searchedLocation.country,
                        latitude: searchedLocation.lat || lat,
                        longitude: searchedLocation.lng || lng,
                      });
                      setScheduleDialogOpen(true);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Card de estatísticas/legenda */}
          <Card className="p-4 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm" data-testid="count-technicians">
                    Técnicos GPS ({techniciansWithLocation.length})
                  </span>
                </div>
                {showActivities && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm" data-testid="count-activities">
                      Atividades ({mapActivities.length})
                    </span>
                  </div>
                )}
                {/* Legenda de cores dos técnicos selecionados */}
                {selectedTechnicianIds.length > 0 && selectedTechnicianIds.length <= 5 && (
                  <div className="flex items-center gap-3 border-l pl-4">
                    {selectedTechnicianIds.map(id => {
                      const tech = technicians.find(t => t.technicianId === id);
                      if (!tech) return null;
                      return (
                        <div key={id} className="flex items-center gap-1">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: tech.color || "#3b82f6" }}
                          />
                          <span className="text-xs text-muted-foreground">{tech.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span data-testid="last-update">
                  Atualizado: {moment(lastUpdate).format("HH:mm:ss")}
                </span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="flex-1 mt-2 data-[state=active]:flex data-[state=active]:flex-col min-h-0">
          {/* Barra de filtros para clientes */}
          <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-muted/50 rounded-lg">
            <Button
              variant={routePanelOpen ? "secondary" : "outline"}
              size="sm"
              onClick={() => setRoutePanelOpen(!routePanelOpen)}
              data-testid="button-toggle-route-panel"
              className="gap-2"
            >
              <Navigation className="h-4 w-4" />
              Calcular Rota
              {selectedClients.length > 0 && (
                <Badge variant="default" className="ml-1">
                  {selectedClients.length}
                </Badge>
              )}
            </Button>
            <FiltersDrawer
              onFiltersChange={handleFiltersChange}
              availableGroups={filterOptions?.groups || []}
              availableSegments={[...PREDEFINED_SEGMENTS]}
              currentFilters={filters}
              onOpenChange={setDrawerOpen}
            />

            <div className="h-6 w-px bg-border mx-1" />

            <Badge variant="outline" className="gap-1 text-xs" data-testid="status-clients-technicians">
              <Users className="h-3 w-3" />
              {techniciansOnline}/{technicians.length} online
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs" data-testid="status-clients-gps-active">
              <Navigation className="h-3 w-3 text-green-500" />
              {techniciansWithActiveGPS} GPS Ativo
            </Badge>
            {techniciansWithInactiveGPS > 0 && (
              <Badge variant="secondary" className="gap-1 text-xs" data-testid="status-clients-gps-inactive">
                <Navigation className="h-3 w-3 text-muted-foreground" />
                {techniciansWithInactiveGPS} GPS Inativo
              </Badge>
            )}
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <div 
              className="flex-1 min-h-[350px] md:min-h-[500px] rounded-lg border transition-all duration-300 relative"
              style={{
                marginRight: drawerOpen ? '450px' : '0px'
              }}
            >
            {loadingClients ? (
              <div className="h-full w-full flex items-center justify-center bg-muted">
                <div className="text-center">
                  <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Carregando mapa...</p>
                </div>
              </div>
            ) : (
              <MapContainer
                center={defaultCenter}
                zoom={12}
                className="h-full w-full"
                zoomControl={true}
                data-testid="map-container-clients"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Rota otimizada (Polyline) */}
                {routeCoordinates.length > 0 && (
                  <Polyline
                    positions={routeCoordinates}
                    pathOptions={{
                      color: '#2563eb',
                      weight: 4,
                      opacity: 0.7,
                    }}
                    data-testid="route-polyline"
                  />
                )}

                {/* Marcador de origem da rota (Técnico) */}
                {routeOrigin && (
                  <Marker
                    position={[routeOrigin.lat, routeOrigin.lng]}
                    icon={routeOriginIcon}
                    data-testid="route-origin-marker"
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold text-red-600">📍 Ponto de Partida</p>
                        <p className="font-medium">{routeOrigin.name}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Clusters de Clientes */}
                <ClientsClusterLayer 
                  sites={sitesWithLocation} 
                  onSiteClick={handleSiteClick}
                  selectedSiteIds={selectedClients}
                />
                
                {/* Handler para corrigir bug do mapa quando drawer abre/fecha */}
                <MapResizeHandler trigger={drawerOpen} />
                
                {/* MOBILE FIX: Force map to recalculate size (fixes black bar) */}
                <MapSizeInvalidator />
              </MapContainer>
            )}
            </div>

            {/* Painel lateral de rotas */}
            {routePanelOpen && (
              <div className="w-96 flex-shrink-0" data-testid="route-calculator-panel">
                <RouteCalculator
                  selectedSites={selectedSitesData}
                  onRemoveSite={handleRemoveSite}
                  onClearAll={handleClearSelection}
                  onClose={handleCloseRoutePanel}
                  onRouteCalculated={handleRouteCalculated}
                />
              </div>
            )}
          </div>

          {/* Card de estatísticas/legenda */}
          <Card className="p-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm" data-testid="count-sites">
                    Sites ({sitesWithLocation.length})
                  </span>
                </div>
                {filters.group && filters.group !== "all" && (
                  <Badge variant="secondary">Grupo: {filters.group}</Badge>
                )}
                {filters.segment && filters.segment !== "all" && (
                  <Badge variant="secondary">Segmento: {filters.segment}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span data-testid="last-update-clients">
                  Atualizado: {moment(lastUpdate).format("HH:mm:ss")}
                </span>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Schedule Dialog */}
      {selectedScheduleData && (
        <QuickScheduleDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          technicianId={selectedScheduleData.technicianId}
          technicianName={selectedScheduleData.technicianName}
          address={selectedScheduleData.address}
          numero={selectedScheduleData.numero}
          bairro={selectedScheduleData.bairro}
          city={selectedScheduleData.city}
          state={selectedScheduleData.state}
          postcode={selectedScheduleData.postcode}
          country={selectedScheduleData.country}
          latitude={selectedScheduleData.latitude}
          longitude={selectedScheduleData.longitude}
        />
      )}
    </div>
  );
}
