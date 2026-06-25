import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Home, Clock, Car, Plane, Footprints, Ship, MapPin, Navigation, Pencil } from "lucide-react";
import { SiGooglemaps, SiWaze } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

interface ReturnBaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { minutesReported: number; gpsEtaMinutes?: number; transportType?: string; baseId?: string }) => Promise<void>;
  baseName?: string;
  baseAddress?: string;
  baseCity?: string;
  baseState?: string;
  gpsEtaMinutes?: number | null;
  isLoading?: boolean;
}

const TRANSPORT_OPTIONS = [
  { value: "carro", label: "Carro", icon: Car },
  { value: "taxi_uber", label: "Táxi / Uber", icon: Car },
  { value: "aviao", label: "Avião", icon: Plane },
  { value: "barco", label: "Barco / Balsa", icon: Ship },
  { value: "a_pe", label: "A pé", icon: Footprints },
];

export function ReturnBaseModal({
  open,
  onOpenChange,
  onConfirm,
  baseName,
  baseAddress,
  baseCity,
  baseState,
  gpsEtaMinutes,
  isLoading = false,
}: ReturnBaseModalProps) {
  const { toast } = useToast();
  const [hoursReported, setHoursReported] = useState<string>("");
  const [minsReported, setMinsReported] = useState<string>("");
  const [transportType, setTransportType] = useState<string>("carro");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [destinationAddress, setDestinationAddress] = useState("");
  const [useManualAddress, setUseManualAddress] = useState(false);
  const [manualCep, setManualCep] = useState("");
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const fullBaseAddress = [baseAddress, baseCity, baseState].filter(Boolean).join(", ");

  useEffect(() => {
    if (open) {
      if (gpsEtaMinutes) {
        const total = Math.round(gpsEtaMinutes);
        setHoursReported(Math.floor(total / 60).toString());
        setMinsReported((total % 60).toString());
      } else {
        setHoursReported("");
        setMinsReported("");
      }
      setDestinationAddress(fullBaseAddress);
      setUseManualAddress(false);
      setManualCep("");
    }
  }, [open, gpsEtaMinutes, fullBaseAddress]);

  const formatCep = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 5) return cleaned;
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 8)}`;
  };

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

      const address = [data.logradouro, data.bairro, data.localidade, data.uf]
        .filter(Boolean).join(", ");
      setDestinationAddress(address);
      toast({
        title: "Endereço encontrado!",
        description: address,
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
  };

  const handleNavigateToBase = async (app: "google" | "waze" | "apple") => {
    if (!destinationAddress.trim()) {
      toast({
        title: "Endereço não informado",
        description: "Informe o endereço de destino para navegação.",
        variant: "destructive",
      });
      return;
    }

    setIsNavigating(true);
    try {
      const geocodeResponse = await apiRequest("POST", "/api/geocode", {
        address: destinationAddress.trim(),
      });
      const geocodeData = await geocodeResponse.json();

      if (!geocodeData.found || !geocodeData.latitude || !geocodeData.longitude) {
        throw new Error("Não foi possível encontrar o endereço");
      }

      const lat = geocodeData.latitude;
      const lng = geocodeData.longitude;
      const isiOS = isIOS();
      let url = "";

      if (app === "google") {
        url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      } else if (app === "waze") {
        url = isiOS
          ? `waze://?ll=${lat},${lng}&navigate=yes`
          : `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
      } else if (app === "apple") {
        url = isiOS
          ? `maps://?daddr=${lat},${lng}`
          : `http://maps.apple.com/?daddr=${lat},${lng}`;
      }

      if (isiOS) {
        window.location.href = url;
      } else {
        window.open(url, "_blank");
      }

      toast({
        title: "Navegação iniciada",
        description: `Abrindo ${app === "google" ? "Google Maps" : app === "waze" ? "Waze" : "Apple Maps"}...`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao iniciar navegação",
        description: error.message || "Não foi possível geocodificar o endereço.",
        variant: "destructive",
      });
    } finally {
      setIsNavigating(false);
    }
  };

  const totalMinutes = (parseInt(hoursReported, 10) || 0) * 60 + (parseInt(minsReported, 10) || 0);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  };

  const handleConfirm = async () => {
    if (totalMinutes < 0) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm({
        minutesReported: totalMinutes,
        gpsEtaMinutes: gpsEtaMinutes || undefined,
        transportType,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao registrar retorno à base:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = totalMinutes >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto" data-testid="return-base-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Retorno à Base
          </DialogTitle>
          <DialogDescription>
            {baseName ? (
              <>Registre o tempo de retorno à <strong>{baseName}</strong> e navegue até o destino</>
            ) : (
              "Registre o tempo de retorno à base e navegue até o destino"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Destino
              </Label>
              {fullBaseAddress && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (useManualAddress) {
                      setDestinationAddress(fullBaseAddress);
                      setUseManualAddress(false);
                      setManualCep("");
                    } else {
                      setUseManualAddress(true);
                    }
                  }}
                  data-testid="button-toggle-manual-address"
                >
                  {useManualAddress ? (
                    <>
                      <Home className="h-4 w-4" />
                      Usar base
                    </>
                  ) : (
                    <>
                      <Pencil className="h-4 w-4" />
                      Alterar
                    </>
                  )}
                </Button>
              )}
            </div>

            {!useManualAddress && destinationAddress ? (
              <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-md">
                <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm" data-testid="text-base-address">{destinationAddress}</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Buscar por CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00000-000"
                      value={manualCep}
                      onChange={(e) => setManualCep(formatCep(e.target.value))}
                      maxLength={9}
                      className="w-32 flex-shrink-0"
                      data-testid="input-return-cep"
                    />
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => searchByCep(manualCep)}
                      disabled={isSearchingCep || manualCep.replace(/\D/g, "").length !== 8}
                      data-testid="button-search-return-cep"
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

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Endereço completo</Label>
                  <Input
                    placeholder="Digite ou busque por CEP..."
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    data-testid="input-return-address"
                  />
                </div>
              </div>
            )}

            {destinationAddress && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => handleNavigateToBase("google")}
                  disabled={isNavigating}
                  data-testid="button-nav-google"
                >
                  {isNavigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <SiGooglemaps className="h-4 w-4" />}
                  Google
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleNavigateToBase("waze")}
                  disabled={isNavigating}
                  data-testid="button-nav-waze"
                >
                  {isNavigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <SiWaze className="h-4 w-4" />}
                  Waze
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleNavigateToBase("apple")}
                  disabled={isNavigating}
                  data-testid="button-nav-apple"
                >
                  {isNavigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                  Apple
                </Button>
              </div>
            )}
          </div>

          {gpsEtaMinutes && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Tempo estimado pelo GPS: <strong>{formatDuration(Math.round(gpsEtaMinutes))}</strong>
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tempo real de retorno</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 flex-1">
                <Input
                  type="number"
                  min="0"
                  value={hoursReported}
                  onChange={(e) => setHoursReported(e.target.value)}
                  placeholder="0"
                  className="text-center text-lg"
                  data-testid="input-return-hours"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground shrink-0">h</span>
              </div>
              <div className="flex items-center gap-1 flex-1">
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={minsReported}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setMinsReported(isNaN(v) ? "" : Math.min(59, Math.max(0, v)).toString());
                  }}
                  placeholder="0"
                  className="text-center text-lg"
                  data-testid="input-return-minutes"
                />
                <span className="text-sm text-muted-foreground shrink-0">min</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {gpsEtaMinutes 
                ? "O tempo do GPS é uma sugestão. Ajuste conforme o tempo real gasto."
                : "Informe quanto tempo levou para retornar à base."
              }
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transportType">Tipo de transporte</Label>
            <Select value={transportType} onValueChange={setTransportType}>
              <SelectTrigger id="transportType" data-testid="select-return-transport-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <option.icon className="h-4 w-4" />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
            data-testid="button-cancel-return"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting || isLoading}
            data-testid="button-confirm-return"
          >
            {isSubmitting || isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar Retorno"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
