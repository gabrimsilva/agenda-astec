import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Search, MapPin, Clock, X, Calendar, Wifi, Home, MapPinned, CalendarRange, ChevronDown, ChevronUp, Route } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  locationSource: string;
  closestActivity?: ActivityWithDistance | null;
  allActivities?: ActivityWithDistance[];
  totalActivitiesInPeriod?: number;
}

type LocationSource = "gps" | "base" | "activity";

interface NearbyTechniciansPanelProps {
  onClose: () => void;
  onTechnicianSelect?: (technicianId: string, lat: number, lng: number) => void;
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
  dateRange?: { start: string; end: string };
}

export function NearbyTechniciansPanel({ onClose, onTechnicianSelect, onLocationSearched, dateRange: externalDateRange }: NearbyTechniciansPanelProps) {
  const [searchAddress, setSearchAddress] = useState("");
  const [searchCep, setSearchCep] = useState("");
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [locationSource, setLocationSource] = useState<LocationSource>("gps");
  const [enhancedResults, setEnhancedResults] = useState<EnhancedNearbyTechnician[]>([]);
  const [isSearchingEnhanced, setIsSearchingEnhanced] = useState(false);
  
  // Estados para filtro de período - usar formatação local para evitar problemas de fuso horário
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

  // Formatar CEP
  const formatCep = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCep(e.target.value);
    setSearchCep(formatted);
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
    string
  >({
    mutationFn: async (address: string) => {
      const response = await apiRequest("POST", "/api/geocode", { address });
      return await response.json();
    },
    onSuccess: (data) => {
      if (!data.found) {
        toast({
          title: "Endereço não encontrado",
          description: "Não foi possível localizar este endereço. Tente ser mais específico.",
          variant: "destructive",
        });
        setSearchedLocation(null);
        onLocationSearched?.(null);
      } else {
        const location = {
          lat: data.latitude,
          lng: data.longitude,
          address: data.address || data.displayName, // Use 'road' if available, fallback to displayName
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


  const handleSearch = () => {
    if (!searchAddress.trim()) {
      toast({
        title: "Digite um endereço",
        description: "Por favor, digite um endereço para buscar técnicos próximos.",
        variant: "destructive",
      });
      return;
    }
    geocodeMutation.mutate(searchAddress);
  };

  const handleClear = () => {
    setSearchAddress("");
    setSearchCep("");
    setSearchedLocation(null);
    setEnhancedResults([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Buscar endereço por CEP usando ViaCEP
  const handleCepSearch = async () => {
    const cepNumbers = searchCep.replace(/\D/g, "");
    if (cepNumbers.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "Por favor, digite um CEP válido com 8 dígitos.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/cep/${cepNumbers}`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          description: "O CEP informado não foi encontrado.",
          variant: "destructive",
        });
        return;
      }

      // Construir endereço completo para geocodificação
      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade}, ${data.uf}, Brasil`;
      setSearchAddress(fullAddress);
      
      // Geocodificar o endereço
      geocodeMutation.mutate(fullAddress);
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: "Ocorreu um erro ao consultar o CEP.",
        variant: "destructive",
      });
    }
  };

  // Buscar técnicos próximos com busca avançada (POST)
  const handleEnhancedSearch = async () => {
    if (!searchedLocation) {
      toast({
        title: "Localização não definida",
        description: "Por favor, busque um endereço ou CEP primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingEnhanced(true);
    try {
      // Usar período definido localmente
      const effectiveDateRange = periodStartDate && periodEndDate
        ? { start: periodStartDate, end: periodEndDate }
        : undefined;
        
      const response = await apiRequest("POST", "/api/technicians/nearby/search", {
        destinationLat: searchedLocation.lat,
        destinationLng: searchedLocation.lng,
        locationSource,
        dateRange: effectiveDateRange,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao buscar técnicos");
      }

      const data = await response.json();
      const technicians = data.technicians || [];
      setEnhancedResults(technicians);

      if (technicians.length === 0) {
        toast({
          title: "Nenhum técnico encontrado",
          description: "Não foram encontrados técnicos com os critérios especificados.",
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
        {/* CEP Search */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Buscar por CEP</label>
          <div className="flex gap-2">
            <Input
              placeholder="00000-000"
              value={searchCep}
              onChange={handleCepChange}
              maxLength={9}
              disabled={geocodeMutation.isPending}
              data-testid="input-search-cep"
            />
            <Button
              onClick={handleCepSearch}
              disabled={geocodeMutation.isPending || searchCep.replace(/\D/g, "").length !== 8}
              data-testid="button-search-cep"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 border-t" />
          <span>ou</span>
          <div className="flex-1 border-t" />
        </div>

        {/* Address Search */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Buscar por Endereço</label>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Av. Paulista, 1000, São Paulo"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={geocodeMutation.isPending}
              data-testid="input-search-address"
            />
            <Button
              onClick={handleSearch}
              disabled={geocodeMutation.isPending || !searchAddress.trim()}
              data-testid="button-search-address"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {searchedLocation && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              {searchedLocation.address}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-auto p-1"
                data-testid="button-clear-search"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Advanced Filters - Mais compacto */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filtros Avançados</h4>
          
          {/* Location Source - Layout mais compacto */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Localização do técnico:</label>
            <RadioGroup
              value={locationSource}
              onValueChange={(value) => setLocationSource(value as LocationSource)}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="gps" id="source-gps" data-testid="radio-source-gps" className="h-3.5 w-3.5" />
                <Label htmlFor="source-gps" className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Wifi className="h-3.5 w-3.5" />
                  GPS em tempo real
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="base" id="source-base" data-testid="radio-source-base" className="h-3.5 w-3.5" />
                <Label htmlFor="source-base" className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Home className="h-3.5 w-3.5" />
                  Base do técnico
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="activity" id="source-activity" data-testid="radio-source-activity" className="h-3.5 w-3.5" />
                <Label htmlFor="source-activity" className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <MapPinned className="h-3.5 w-3.5" />
                  Atividade agendada
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Period Date Range Filter */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />
              Período para busca (atividades):
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
              Usado para localizar técnicos pela atividade mais próxima do endereço pesquisado no período
            </p>
          </div>

          {/* Enhanced Search Button */}
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
                Buscar com Filtros
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Loading State */}
        {geocodeMutation.isPending && (
          <div className="text-center py-4">
            <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-xs text-muted-foreground mt-2">Geocodificando endereço...</p>
          </div>
        )}

        {/* Search Results - Compacto */}
        {enhancedResults.length > 0 && (
          <div className="space-y-2">
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                Busca Avançada: {enhancedResults.length} técnico(s)
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
              const locationSourceLabel = {
                gps: "GPS",
                base: "Base",
                activity: "Atividade",
              }[tech.locationSource] || tech.locationSource;

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
                      
                      {/* Closest Activity Highlight - Compacto */}
                      {tech.closestActivity && (
                        <div className="mt-1.5 p-1.5 bg-primary/5 border border-primary/20 rounded">
                          <p className="text-[10px] font-medium text-primary mb-0.5">
                            Atividade mais próxima do endereço pesquisado:
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
                                <span>{tech.closestActivity.distanceKm} km</span>
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

                      {/* Non-activity mode display */}
                      {!tech.closestActivity && (
                        <>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>{tech.distanceKm.toFixed(1)} km</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>~{tech.estimatedTimeMin} min</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {tech.location.description}
                          </p>
                        </>
                      )}

                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs gap-1">
                          {locationSourceLabel}
                        </Badge>
                        {tech.baseCity && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Home className="h-3 w-3" />
                            {tech.baseCity}
                          </Badge>
                        )}
                      </div>

                      {/* Other Activities Accordion */}
                      {hasMultipleActivities && (
                        <Collapsible className="mt-3">
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-between h-auto py-2 px-2 text-xs"
                              data-testid={`button-view-all-activities-${tech.id}`}
                            >
                              <span className="flex items-center gap-1">
                                <CalendarRange className="h-3 w-3" />
                                Ver todas as {tech.allActivities?.length} atividades no período
                              </span>
                              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            {otherActivities.map((activity, index) => (
                              <div
                                key={activity.id}
                                className="p-2 bg-muted/50 rounded-md text-xs"
                                data-testid={`activity-item-${tech.id}-${index}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium">{activity.clientName}</p>
                                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
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
                                      <p className="text-muted-foreground mt-1">
                                        <MapPin className="h-3 w-3 inline mr-1" />
                                        {activity.address}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right text-muted-foreground">
                                    <p className="font-medium">{activity.distanceKm} km</p>
                                    <p>~{activity.estimatedTimeMin} min</p>
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
                            searchedLocation.lng
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

        {/* Initial State - Preenche espaço disponível */}
        {!searchedLocation && !geocodeMutation.isPending && enhancedResults.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <Search className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground mb-3">
              Digite um CEP ou endereço para encontrar os técnicos mais próximos.
            </p>
            <div className="text-[10px] text-muted-foreground/70 space-y-1">
              <p>• Use GPS para localização em tempo real</p>
              <p>• Use Base para cidade cadastrada</p>
              <p>• Use Atividade para próximos compromissos</p>
            </div>
          </div>
        )}

        {/* Espaço vazio com dicas quando há resultados mas sem atividade destacada */}
        {searchedLocation && enhancedResults.length === 0 && !geocodeMutation.isPending && !isSearchingEnhanced && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              Endereço localizado. Clique em "Buscar com Filtros" para encontrar técnicos.
            </p>
          </div>
        )}
      </div>

      {/* Footer fixo com timestamp */}
      <div className="p-2 border-t bg-muted/30 flex-shrink-0">
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Atualizado: {new Date().toLocaleTimeString('pt-BR')}</span>
        </div>
      </div>
    </Card>
  );
}
