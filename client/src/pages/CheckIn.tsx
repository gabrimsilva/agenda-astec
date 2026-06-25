import { useState } from "react";
import { MapPin, Clock, Camera, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function CheckIn() {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const { toast } = useToast();

  const handleCheckIn = () => {
    setIsCheckedIn(true);
    toast({
      title: "Atividade iniciada",
      description: "Localização e horário registrados com sucesso.",
    });
  };

  const handleCheckOut = () => {
    setIsCheckedIn(false);
    toast({
      title: "Atividade concluída",
      description: "Atividade finalizada com sucesso.",
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Atual</CardTitle>
          <CardDescription>
            {isCheckedIn ? "Você está em atividade" : "Nenhuma atividade em andamento"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {isCheckedIn ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">
                  {isCheckedIn ? "Em Atividade" : "Disponível"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isCheckedIn ? "Cliente ABC - Sede" : "Aguardando início"}
                </p>
              </div>
            </div>
            <Badge variant={isCheckedIn ? "default" : "secondary"}>
              {isCheckedIn ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          {isCheckedIn && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Iniciado às:</span>
                <span className="font-medium">09:00</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Local:</span>
                <span className="font-medium">Rua Example, 123</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!isCheckedIn ? (
        <div className="space-y-3">
          <Button 
            className="w-full" 
            size="lg" 
            onClick={handleCheckIn}
            data-testid="button-checkin"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Iniciar Atividade
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Inicia o registro de tempo e localização da atividade
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full" 
            size="lg"
            data-testid="button-take-photo"
          >
            <Camera className="h-5 w-5 mr-2" />
            Tirar Foto
          </Button>
          <Button 
            variant="destructive" 
            className="w-full" 
            size="lg" 
            onClick={handleCheckOut}
            data-testid="button-checkout"
          >
            <XCircle className="h-5 w-5 mr-2" />
            Concluir Atividade
          </Button>
        </div>
      )}
    </div>
  );
}
