import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatasulClientField, DatasulClientResult } from "@/components/activities/DatasulClientField";
import { Separator } from "@/components/ui/separator";
import { Search, MapPin, Clock, X, Calendar, CalendarRange, ChevronDown, Route, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ActivityWithDistance {
  id: string;
  scheduledDate: string;
  formattedDate: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientId: string | null;
  address: string;
  city: string;
  activityType: string;
  status: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  estimatedTimeMin: number;
}

interface EnhancedNearbyTechnician {
  id: string;
  name: string;
  email: string;
  team: string | null;
  color: string | null;
  baseCity: string | null;
  distanceKm: number;
  estimatedTimeMin: number;
  location: {
    latitude: number;
    longitude: number;
    description: string;
  };
  closestActivity?: ActivityWithDistance | null;
  allActivities?: ActivityWithDistance[];
  totalActivitiesInPeriod?: number;
}

interface NearbyTechniciansPanelProps {
  onClose: () => void;
  onTechnicianSelect?: (technicianId: string, lat: number, lng: number, selectedClient?: DatasulClientResult | null) => void;
  onLocationSearched?: (location: { 
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
  } | null) => void;
  onActivitySelected?: (activity: ActivityWithDistance | null) => void;
  dateRange?: { start: string; end: string };
}

export function NearbyTechniciansPanel({ onClose, onTechnicianSelect, onLocationSearched, onActivitySelected, dateRange: externalDateRange }: NearbyTechniciansPanelProps) {
  const [clientSearchText, setClientSearchText] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<DatasulClientResult | null>(null);
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
  } | null>(null);
  const [enhancedResults, setEnhancedResults] = useState<EnhancedNearbyTechnician[]>([]);
  const [isSearchingEnhanced, setIsSearchingEnhanced] = useState(false);
  
  // Estado para modo de busca
  const [searchMode, setSearchMode] = useState<"activity" | "base">("activity");
  
  // Estados para filtro de período
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const today = getLocalDateString();
  const [periodStartDate, setPeriodStartDate] = useState<string>(externalDateRange?.start || today);
  const [periodEndDate, setPeriodEndDate] = useState<string>(externalDateRange?.end || today);
  
  // Sincronizar com prop externa quando ela mudar
  useEffect(() => {
    if (externalDateRange?.start) {
      setPeriodStartDate(externalDateRange.start);
    }
    if (externalDateRange?.end) {
      setPeriodEndDate(externalDateRange.end);
    }
  }, [externalDateRange?.start, externalDateRange?.end]);
  
  const { toast } = useToast();

  const handleClientSelect = (client: DatasulClientResult) => {
    setSelectedClient(client);
    setClientSearchText(client.nome); // Atualiza o texto quando seleciona
    
    // Montar endereço: tenta com cidade/estado primeiro (mais confiável)
    // O fallback será apenas a cidade, estado
    const primaryAddress = [client.cidade, client.estado].filter(Boolean).join(", ");
    
    // Se a primeira falhar, tenta com estado apenas
    const fallbackAddress = client.estado || "Brasil";
    
    console.log("[Geocode] Tentando geocodificar:", primaryAddress);
    
    // Chamar geocode para trazer coordenadas (com fallback)
    geocodeMutation.mutate({ address: primaryAddress, fallbackAddress });
  };

  // Geocode mutation
  const geocodeMutation = useMutation<
    { 
      latitude: number; 
      longitude: number; 
      displayName: string; 
      found: boolean;
      address?: string;
      numero?: string;
      bairro?: string;
      city?: string;
      state?: string;
      postcode?: string;
      country?: string;
    },
    Error,
    { address: string; fallbackAddress: string }
  >({
    mutationFn: async ({ address, fallbackAddress }) => {
      console.log("[Geocode] Primeira tentativa:", address);
      let response = await apiRequest("POST", "/api/geocode", { address });
      let data = await response.json();
      
      // Se não encontrou, tenta fallback (só cidade + estado)
      if (!data.found && fallbackAddress) {
        console.log("[Geocode] Primeira falhou, tentando fallback:", fallbackAddress);
        response = await apiRequest("POST", "/api/geocode", { address: fallbackAddress });
        data = await response.json();
      }
      
      return data;
    },
    onSuccess: (data) => {
      if (!data.found) {
        toast({
          title: "Endereço não encontrado",
          description: "Não foi possível localizar o cliente. Tente novamente.",
          variant: "destructive",
        });
        setSearchedLocation(null);
        onLocationSearched?.(null);
      } else {
        const location = {
          lat: data.latitude,
          lng: data.longitude,
          address: data.address || data.displayName,
          displayName: data.displayName,
          numero: data.numero,
          bairro: data.bairro,
          city: data.city,
          state: data.state,
          postcode: data.postcode,
          country: data.country,
        };
        setSearchedLocation(location);
        onLocationSearched?.(location);
      }
    },
    onError: () => {
      toast({
        title: "Erro ao buscar endereço",
        description: "Ocorreu um erro ao geocodificar o endereço.",
        variant: "destructive",
      });
    },
  });

  const handleClear = () => {
    setClientSearchText("");
    setSelectedClient(null);
    setSearchedLocation(null);
    setEnhancedResults([]);
    onLocationSearched?.(null);
  };

  // Buscar técnicos próximos com base em atividades agendadas OU base do técnico
  const handleEnhancedSearch = async () => {
    if (!searchedLocation) {
      toast({
        title: "Localização não definida",
        description: "Por favor, selecione um cliente primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingEnhanced(true);
    try {
      const effectiveDateRange = (searchMode === "activity" && periodStartDate && periodEndDate)
        ? { start: periodStartDate, end: periodEndDate }
        : undefined;
        
      const response = await apiRequest("POST", "/api/technicians/nearby/search", {
        destinationLat: searchedLocation.lat,
        destinationLng: searchedLocation.lng,
        locationSource: searchMode, // "activity" ou "base"
        dateRange: effectiveDateRange, // Apenas para "activity"
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao buscar técnicos");
      }

      const data = await response.json();
      const technicians = data.technicians || [];
      setEnhancedResults(technicians);

      if (technicians.length === 0) {
        const message = searchMode === "activity"
          ? "Não foram encontrados técnicos com atividades agendadas próximas neste período."
          : "Não foram encontrados técnicos com base próxima.";
        toast({
          title: "Nenhum técnico encontrado",
          description: message,
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro na busca",
        description: error.message || "Não foi possível realizar a busca.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingEnhanced(false);
    }
  };

  return (
    <Card className="h-full flex flex-col" data-testid="nearby-technicians-panel">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Encontrar Técnico Próximo</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-close-nearby-panel"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Cliente Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Cliente *</label>
          <p className="text-xs text-muted-foreground mb-2">Busca em grupos 71 (Coatings) e 88 (Alumínio)</p>
          <DatasulClientField
            value={clientSearchText}
            onChangeText={setClientSearchText}
            onSelectClient={handleClientSelect}
            placeholder="Selecione um cliente..."
          />
          
          {selectedClient && (
            <div className="p-2 bg-primary/5 border border-primary/20 rounded space-y-1">
              <p className="text-xs font-medium text-primary">{selectedClient.nome}</p>
              {selectedClient.cnpj && (
                <p className="text-xs text-muted-foreground">CNPJ: {selectedClient.cnpj}</p>
              )}
              {(selectedClient.cidade || selectedClient.estado) && (
                <p className="text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  {selectedClient.cidade}, {selectedClient.estado}
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="w-full mt-2 h-auto py-1 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Limpar seleção
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Search Mode Selection */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Search className="h-3 w-3" />
            Modo de busca:
          </label>
          <Tabs value={searchMode} onValueChange={(val) => setSearchMode(val as "activity" | "base")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activity" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                Atividades
              </TabsTrigger>
              <TabsTrigger value="base" className="text-xs gap-1">
                <Home className="h-3 w-3" />
                Base
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {searchMode === "activity"
              ? "Encontra técnicos com atividades agendadas próximas"
              : "Encontra técnicos com base (local registrado) próxima"
            }
          </p>
        </div>

        {/* Period Date Range Filter - Only for Activity Mode */}
        {searchMode === "activity" && (
          <>
            <Separator />
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarRange className="h-3 w-3" />
                Período para busca de atividades:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">Início</label>
                  <Input
                    type="date"
                    value={periodStartDate}
                    onChange={(e) => setPeriodStartDate(e.target.value)}
                    data-testid="input-period-start"
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">Fim</label>
                  <Input
                    type="date"
                    value={periodEndDate}
                    onChange={(e) => setPeriodEndDate(e.target.value)}
                    min={periodStartDate}
                    data-testid="input-period-end"
                    className="text-xs h-8"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Busca técnicos com atividades agendadas neste período próximas ao cliente
              </p>
            </div>
          </>
        )}

        <Separator />
        <Button
          onClick={handleEnhancedSearch}
          disabled={!searchedLocation || isSearchingEnhanced}
          className="w-full h-9"
          data-testid="button-enhanced-search"
        >
          {isSearchingEnhanced ? (
            <>
              <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full mr-2" />
              Buscando...
            </>
          ) : (
            <>
              <Search className="h-3.5 w-3.5 mr-2" />
              {searchMode === "activity" ? "Buscar Técnicos com Atividades" : "Buscar Técnicos por Base"}
            </>
          )}
        </Button>

        <Separator />

        {/* Loading State */}
        {geocodeMutation.isPending && (
          <div className="text-center py-4">
            <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-xs text-muted-foreground mt-2">Localizando cliente...</p>
          </div>
        )}

        {/* Search Results */}
        {enhancedResults.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                {enhancedResults.length} técnico(s) encontrado(s)
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEnhancedResults([])}
                className="gap-1 h-6 px-2"
                data-testid="button-clear-enhanced-results"
              >
                <X className="h-3 w-3" />
                <span className="text-[10px]">Limpar</span>
              </Button>
            </div>
            {enhancedResults.map((tech) => {
              const hasMultipleActivities = tech.allActivities && tech.allActivities.length > 1;
              const otherActivities = tech.allActivities?.slice(1) || [];

              return (
                <Card key={tech.id} className="p-2 hover-elevate" data-testid={`card-enhanced-technician-${tech.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <div
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tech.color || "#3b82f6" }}
                        />
                        <p className="font-semibold text-xs truncate">{tech.name}</p>
                        {tech.totalActivitiesInPeriod && tech.totalActivitiesInPeriod > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {tech.totalActivitiesInPeriod} atividade(s)
                          </Badge>
                        )}
                      </div>
                      
                      {/* Closest Activity Highlight */}
                      {tech.closestActivity && (
                        <div 
                          className="mt-1.5 p-1.5 bg-primary/5 border border-primary/20 rounded cursor-pointer hover:bg-primary/10 transition-colors"
                          onClick={() => onActivitySelected?.(tech.closestActivity)}
                        >
                          <p className="text-[10px] font-medium text-primary mb-0.5">
                            🎯 Atividade mais próxima:
                          </p>
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium truncate">{tech.closestActivity.clientName}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                              <div className="flex items-center gap-0.5">
                                <Calendar className="h-2.5 w-2.5" />
                                <span>{tech.closestActivity.formattedDate}</span>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                <span>{tech.closestActivity.startTime}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                              <div className="flex items-center gap-0.5">
                                <Route className="h-2.5 w-2.5" />
                                <span>{tech.closestActivity.distanceKm.toFixed(1)} km</span>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                <span>~{tech.closestActivity.estimatedTimeMin} min</span>
                              </div>
                            </div>
                            {tech.closestActivity.address && (
                              <p className="text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 inline mr-1" />
                                {tech.closestActivity.address}
                                {tech.closestActivity.city && `, ${tech.closestActivity.city}`}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Other Activities Accordion - Auto Open if Multiple */}
                      {hasMultipleActivities && (
                        <Collapsible className="mt-3" defaultOpen={otherActivities.length > 0}>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-between h-auto py-2 px-2 text-xs bg-muted/40 hover:bg-muted/60"
                              data-testid={`button-view-all-activities-${tech.id}`}
                            >
                              <span className="flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Outras {otherActivities.length} atividade(s)
                              </span>
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            {otherActivities.map((activity, index) => (
                              <div
                                key={activity.id}
                                className="p-2 bg-muted/50 rounded-md text-xs cursor-pointer hover:bg-muted/80 transition-colors border border-muted"
                                onClick={() => onActivitySelected?.(activity)}
                                data-testid={`activity-item-${tech.id}-${index}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium">{activity.clientName}</p>
                                    <div className="flex items-center gap-2 text-muted-foreground mt-1 flex-wrap">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {activity.formattedDate}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {activity.startTime}
                                      </span>
                                    </div>
                                    {activity.address && (
                                      <p className="text-muted-foreground mt-1 text-[10px]">
                                        <MapPin className="h-3 w-3 inline mr-1" />
                                        {activity.address}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right text-muted-foreground flex-shrink-0">
                                    <p className="font-medium text-[10px]">{activity.distanceKm.toFixed(1)} km</p>
                                    <p className="text-[10px]">~{activity.estimatedTimeMin} min</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        if (onTechnicianSelect && searchedLocation) {
                          onTechnicianSelect(
                            tech.id,
                            searchedLocation.lat,
                            searchedLocation.lng,
                            selectedClient
                          );
                        }
                      }}
                      data-testid={`button-enhanced-schedule-${tech.id}`}
                    >
                      <Calendar className="h-4 w-4" />
                      Agendar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Initial State */}
        {!selectedClient && !geocodeMutation.isPending && enhancedResults.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <MapPin className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground mb-3">
              Selecione um cliente para encontrar os técnicos mais próximos com atividades agendadas.
            </p>
          </div>
        )}

        {/* State when location found but no search yet */}
        {selectedClient && searchedLocation && enhancedResults.length === 0 && !geocodeMutation.isPending && !isSearchingEnhanced && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              Cliente localizado. Clique em "Buscar Técnicos Próximos" para continuar.
            </p>
          </div>
        )}
      </div>

      {/* Footer fixo */}
      <div className="p-2 border-t bg-muted/30 flex-shrink-0">
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Atualizado: {new Date().toLocaleTimeString('pt-BR')}</span>
        </div>
      </div>
    </Card>
  );
}
