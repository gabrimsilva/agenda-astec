import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, Navigation, ListChecks, FileText, Clock, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Activity } from "@shared/schema";

interface NextActivity {
  id: string;
  clientName: string;
  title: string;
  startTime?: string;
  address?: string;
}

interface NextStepPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completedActivity: Activity | null;
  nextActivities: NextActivity[];
  hasPendingRat: boolean;
  onSelectNextActivity: (activityId: string) => void;
  onEndJourney: () => void;
  onReturnToBase: () => void;
  onOpenRatForm: (simplified?: boolean) => void;
  onDismissRat?: () => void;
  isLoading?: boolean;
  baseName?: string;
  isHomeOffice?: boolean;
}

type ActionType = "next_activity" | "end_journey" | "return_base" | null;

export function NextStepPanel({
  open,
  onOpenChange,
  completedActivity,
  nextActivities,
  hasPendingRat,
  onSelectNextActivity,
  onEndJourney,
  onReturnToBase,
  onOpenRatForm,
  onDismissRat,
  isLoading = false,
  baseName,
  isHomeOffice = false,
}: NextStepPanelProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType>(null);
  const [selectedNextActivityId, setSelectedNextActivityId] = useState<string | null>(null);
  const [ratDismissed, setRatDismissed] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedAction(null);
      setSelectedNextActivityId(null);
      setRatDismissed(false);
    }
  }, [open]);

  const handleRatDismiss = () => {
    // Criar RAT pendente no backend antes de dispensar
    if (onDismissRat) {
      onDismissRat();
    }
    setRatDismissed(true);
  };

  const handleConfirm = () => {
    if (hasPendingRat && !ratDismissed) {
      handleRatDismiss();
    }
    if (selectedAction === "next_activity" && selectedNextActivityId) {
      onSelectNextActivity(selectedNextActivityId);
    } else if (selectedAction === "end_journey") {
      onEndJourney();
    } else if (selectedAction === "return_base") {
      onReturnToBase();
    }
  };

  const handleRatClick = (simplified: boolean = false) => {
    onOpenChange(false);
    onOpenRatForm(simplified);
  };

  const hasNextActivities = nextActivities.length > 0;

  // Prevent closing dialog when RAT is pending and not dismissed
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasPendingRat && !ratDismissed) {
      // Prevent closing if RAT is pending and not dismissed
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="next-step-panel" onPointerDownOutside={(e) => hasPendingRat && !ratDismissed && e.preventDefault()} onEscapeKeyDown={(e) => hasPendingRat && !ratDismissed && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Próximo Passo
          </DialogTitle>
          <DialogDescription>
            {completedActivity?.clientName ? (
              <>Atividade em <strong>{completedActivity.clientName}</strong> concluída. O que deseja fazer agora?</>
            ) : (
              "Atividade concluída. O que deseja fazer agora?"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mensagem de confirmação quando RAT foi adiada */}
          {ratDismissed && (
            <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    RAT adiada. Você poderá preenchê-la depois acessando a atividade concluída.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Opções da RAT - só aparecem se não foram adiadas */}
          {hasPendingRat && !ratDismissed && (
            <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-orange-700 dark:text-orange-300">
                      RAT Obrigatória
                    </p>
                    <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
                      Como o trabalho foi realizado, é obrigatório preencher o Relatório de Assistência Técnica.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleRatClick(false)}
                        data-testid="button-fill-rat"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Preencher RAT Completa
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRatClick(true)}
                        className="w-fit"
                        data-testid="button-fill-rat-simplified"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        RAT Simplificada
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRatDismiss}
                        className="w-fit text-muted-foreground"
                        data-testid="button-rat-later"
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Deixar para depois
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Opções de próximo passo */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Escolha uma opção:</p>

            {hasNextActivities && (
              <Card 
                className={cn(
                  "cursor-pointer transition-all border-2",
                  selectedAction === "next_activity" 
                    ? "border-primary bg-primary/5" 
                    : "hover:border-primary/50"
                )}
                onClick={() => setSelectedAction("next_activity")}
                data-testid="option-next-activity"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Navigation className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Ir para próxima atividade</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Selecione a próxima atividade do dia
                      </p>
                      
                      {selectedAction === "next_activity" && (
                        <div className="space-y-2">
                          {nextActivities.map((activity) => (
                            <div
                              key={activity.id}
                              className={cn(
                                "p-3 rounded-md border cursor-pointer transition-all",
                                selectedNextActivityId === activity.id
                                  ? "border-primary bg-primary/10"
                                  : "hover:bg-muted"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNextActivityId(activity.id);
                              }}
                              data-testid={`select-next-activity-${activity.id}`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-sm">{activity.clientName}</p>
                                  <p className="text-xs text-muted-foreground">{activity.title}</p>
                                </div>
                                {activity.startTime && (
                                  <Badge variant="outline" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {activity.startTime}
                                  </Badge>
                                )}
                              </div>
                              {activity.address && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{activity.address}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isHomeOffice && (
            <Card 
              className={cn(
                "cursor-pointer transition-all border-2",
                selectedAction === "return_base" 
                  ? "border-primary bg-primary/5" 
                  : "hover:border-primary/50"
              )}
              onClick={() => setSelectedAction("return_base")}
              data-testid="option-return-base"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Home className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Retornar à base</p>
                    <p className="text-sm text-muted-foreground">
                      {baseName 
                        ? `Voltar para ${baseName} e registrar o tempo de retorno`
                        : "Voltar para a base e registrar o tempo de retorno"
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            <Card 
              className={cn(
                "cursor-pointer transition-all border-2",
                selectedAction === "end_journey" 
                  ? "border-primary bg-primary/5" 
                  : "hover:border-primary/50"
              )}
              onClick={() => setSelectedAction("end_journey")}
              data-testid="option-end-journey"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <ListChecks className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div>
                    <p className="font-medium">Encerrar jornada</p>
                    <p className="text-sm text-muted-foreground">
                      Finalizar atividade do dia (retorno ao hotel)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {(!hasPendingRat || ratDismissed) && (
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            data-testid="button-close-next-step"
          >
            Fechar
          </Button>
          )}
          <Button
            onClick={handleConfirm}
            disabled={!selectedAction || (selectedAction === "next_activity" && !selectedNextActivityId) || isLoading}
            data-testid="button-confirm-next-step"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              "Continuar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
