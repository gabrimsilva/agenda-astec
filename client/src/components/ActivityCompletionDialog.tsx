import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ClipboardList, Clock, CheckCircle2 } from "lucide-react";

type StepType = "question" | "rat_choice" | "execution" | "justification";

interface ActivityCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: {
    workCompleted: boolean;
    justification?: string;
    executionMinutes?: number;
    lostMinutes?: number;
    ratChoice?: "completa" | "simplificada" | "later";
  }) => void;
  onOpenRatForm?: (type: "completa" | "simplificada") => void;
  isLoading?: boolean;
  clientName?: string;
  checkInTime?: string | null;
  requiresRat?: boolean;
  initialStep?: StepType;
  ratCompleted?: boolean;
  ratType?: "completa" | "simplificada" | null;
}

export function ActivityCompletionDialog({
  open,
  onOpenChange,
  onConfirm,
  onOpenRatForm,
  isLoading = false,
  clientName,
  checkInTime,
  requiresRat = false,
  initialStep,
  ratCompleted = false,
  ratType = null,
}: ActivityCompletionDialogProps) {
  const [step, setStep] = useState<StepType>("question");
  const [justification, setJustification] = useState("");
  const [executionHours, setExecutionHours] = useState<string>("");
  const [executionMins, setExecutionMins] = useState<string>("");
  const [lostHours, setLostHours] = useState<string>("");
  const [lostMins, setLostMins] = useState<string>("");
  const [ratChoice, setRatChoice] = useState<"completa" | "simplificada" | "later" | null>(null);
  
  const getDefaultExecutionMinutes = () => {
    if (checkInTime) {
      const checkIn = new Date(checkInTime);
      const now = new Date();
      const diff = Math.round((now.getTime() - checkIn.getTime()) / 60000);
      return Math.max(0, diff);
    }
    return 0;
  };

  const minutesToHM = (total: number) => ({
    h: Math.floor(total / 60).toString(),
    m: (total % 60).toString(),
  });

  const resetState = () => {
    setStep("question");
    setJustification("");
    setExecutionHours("");
    setExecutionMins("");
    setLostHours("");
    setLostMins("");
    setRatChoice(null);
  };

  useEffect(() => {
    if (open) {
      if (initialStep) {
        setStep(initialStep);
        if (initialStep === "execution") {
          const defaultMin = getDefaultExecutionMinutes();
          if (defaultMin > 0) {
            const { h, m } = minutesToHM(defaultMin);
            setExecutionHours(h);
            setExecutionMins(m);
          }
        }
      } else {
        resetState();
      }
    } else {
      resetState();
    }
  }, [open, initialStep]);

  const handleYes = () => {
    if (requiresRat) {
      setStep("rat_choice");
    } else {
      const defaultMin = getDefaultExecutionMinutes();
      if (defaultMin > 0) {
        const { h, m } = minutesToHM(defaultMin);
        setExecutionHours(h);
        setExecutionMins(m);
      }
      setStep("execution");
    }
  };

  const handleNo = () => {
    const defaultMin = getDefaultExecutionMinutes();
    if (defaultMin > 0) {
      const { h, m } = minutesToHM(defaultMin);
      setLostHours(h);
      setLostMins(m);
    }
    setStep("justification");
  };

  const handleRatChoiceNext = () => {
    if ((ratChoice === "completa" || ratChoice === "simplificada") && onOpenRatForm) {
      onOpenRatForm(ratChoice);
      return;
    }
    const defaultMin = getDefaultExecutionMinutes();
    if (defaultMin > 0) {
      const { h, m } = minutesToHM(defaultMin);
      setExecutionHours(h);
      setExecutionMins(m);
    }
    setStep("execution");
  };

  const handleExecutionSubmit = () => {
    const totalMin = (parseInt(executionHours, 10) || 0) * 60 + (parseInt(executionMins, 10) || 0);
    onConfirm({
      workCompleted: true,
      executionMinutes: totalMin >= 0 ? totalMin : undefined,
      ratChoice: ratType || ratChoice || undefined,
    });
  };

  const handleJustificationSubmit = () => {
    const totalLost = (parseInt(lostHours, 10) || 0) * 60 + (parseInt(lostMins, 10) || 0);
    onConfirm({
      workCompleted: false,
      justification: justification.trim(),
      lostMinutes: totalLost >= 0 ? totalLost : undefined,
    });
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins}min`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        {step === "question" && (
          <>
            <DialogHeader>
              <DialogTitle>A atividade foi realizada?</DialogTitle>
              <DialogDescription>
                {clientName ? `Confirme se o serviço em ${clientName} foi executado.` : "Confirme se o serviço foi executado com sucesso."}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={handleYes}
                className="w-full"
                size="lg"
                data-testid="button-work-completed-yes"
              >
                Sim, foi realizada
              </Button>
              <Button
                onClick={handleNo}
                variant="destructive"
                className="w-full"
                size="lg"
                data-testid="button-work-completed-no"
              >
                Não foi realizada
              </Button>
            </div>
          </>
        )}

        {step === "rat_choice" && (
          <>
            <DialogHeader>
              <DialogTitle>Relatório de Assistência Técnica</DialogTitle>
              <DialogDescription>
                Esta atividade requer um relatório técnico. Escolha o tipo de RAT.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex flex-col gap-3 pt-4">
              <Card
                className={`cursor-pointer border-2 toggle-elevate ${
                  ratChoice === "completa" ? "border-primary bg-primary/5 toggle-elevated" : ""
                }`}
                onClick={() => setRatChoice("completa")}
                data-testid="option-rat-completa"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">RAT Completa</p>
                      <p className="text-sm text-muted-foreground">
                        Formulário completo com dados técnicos, fotos e assinatura.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 toggle-elevate ${
                  ratChoice === "simplificada" ? "border-primary bg-primary/5 toggle-elevated" : ""
                }`}
                onClick={() => setRatChoice("simplificada")}
                data-testid="option-rat-simplificada"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">RAT Simplificada</p>
                      <p className="text-sm text-muted-foreground">
                        Formulário resumido com informações essenciais.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 toggle-elevate ${
                  ratChoice === "later" ? "border-primary bg-primary/5 toggle-elevated" : ""
                }`}
                onClick={() => setRatChoice("later")}
                data-testid="option-rat-later"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Deixar para depois</p>
                      <p className="text-sm text-muted-foreground">
                        Uma RAT pendente será criada automaticamente.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                onClick={handleRatChoiceNext}
                disabled={!ratChoice}
                className="w-full"
                data-testid="button-rat-choice-next"
              >
                Continuar
              </Button>
              <Button
                variant="outline"
                onClick={() => { setStep("question"); setRatChoice(null); }}
                className="w-full"
                data-testid="button-rat-choice-back"
              >
                Voltar
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "execution" && (
          <>
            <DialogHeader>
              <DialogTitle>Tempo de Execução</DialogTitle>
              <DialogDescription>
                Confirme o tempo que você levou para executar o serviço no cliente.
              </DialogDescription>
            </DialogHeader>

            {ratCompleted && ratType && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-300">
                  RAT {ratType === "completa" ? "Completa" : "Simplificada"} preenchida com sucesso
                </span>
              </div>
            )}
            
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Tempo de execução</Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      type="number"
                      min="0"
                      value={executionHours}
                      onChange={(e) => setExecutionHours(e.target.value)}
                      placeholder="0"
                      className="text-center text-lg font-semibold"
                      data-testid="input-execution-hours"
                      autoFocus
                    />
                    <span className="text-sm text-muted-foreground shrink-0">h</span>
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={executionMins}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setExecutionMins(isNaN(v) ? "" : Math.min(59, Math.max(0, v)).toString());
                      }}
                      placeholder="0"
                      className="text-center text-lg font-semibold"
                      data-testid="input-execution-time"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">min</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Tempo calculado automaticamente: {formatTime(getDefaultExecutionMinutes())}
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                onClick={handleExecutionSubmit}
                disabled={isLoading}
                className="w-full"
                data-testid="button-execution-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Confirmar e Concluir"
                )}
              </Button>
              {!ratCompleted && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (requiresRat) {
                      setStep("rat_choice");
                    } else {
                      setStep("question");
                    }
                  }}
                  disabled={isLoading}
                  className="w-full"
                  data-testid="button-execution-back"
                >
                  Voltar
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === "justification" && (
          <>
            <DialogHeader>
              <DialogTitle>Atividade Não Realizada</DialogTitle>
              <DialogDescription>
                Informe o motivo e o tempo não produtivo.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Tempo não produtivo</Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      type="number"
                      min="0"
                      value={lostHours}
                      onChange={(e) => setLostHours(e.target.value)}
                      placeholder="0"
                      className="text-center text-lg font-semibold"
                      data-testid="input-lost-hours"
                      autoFocus
                    />
                    <span className="text-sm text-muted-foreground shrink-0">h</span>
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={lostMins}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setLostMins(isNaN(v) ? "" : Math.min(59, Math.max(0, v)).toString());
                      }}
                      placeholder="0"
                      className="text-center text-lg font-semibold"
                      data-testid="input-lost-minutes"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">min</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Tempo calculado: {formatTime(getDefaultExecutionMinutes())} &mdash; será registrado como perda
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="justification-text">Justificativa *</Label>
                <Textarea
                  id="justification-text"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Ex: Cliente não estava no local, tentei contato mas não atendeu..."
                  className="min-h-[100px]"
                  data-testid="input-justification"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                onClick={handleJustificationSubmit}
                disabled={!justification.trim() || isLoading}
                className="w-full"
                data-testid="button-justification-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("question")}
                disabled={isLoading}
                className="w-full"
                data-testid="button-justification-back"
              >
                Voltar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
