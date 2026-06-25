import { useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileText, Clock, XCircle } from "lucide-react";

interface RATConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  onConfirm: (action: "now" | "later" | "skip") => void;
}

export function RATConfirmDialog({
  open,
  onOpenChange,
  clientName,
  onConfirm,
}: RATConfirmDialogProps) {
  const hasConfirmedRef = useRef(false);

  // Reset the confirmed flag when dialog opens
  useEffect(() => {
    if (open) {
      hasConfirmedRef.current = false;
    }
  }, [open]);

  const handleConfirm = (action: "now" | "later" | "skip") => {
    hasConfirmedRef.current = true;
    onConfirm(action);
  };

  // Handle dialog close - treat as "later" if closed without explicit action
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !hasConfirmedRef.current) {
      // Dialog is closing without button click - treat as "later" (create pending RAT)
      onConfirm("later");
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <AlertDialogTitle>Criar RAT?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-2">
            <p>
              Você concluiu a visita em <span className="font-medium">{clientName}</span>.
            </p>
            <p>
              Deseja criar um Relatório de Assistência Técnica (RAT) para esta visita?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={() => handleConfirm("now")}
            className="flex items-center justify-center gap-2 w-full"
            data-testid="button-rat-now"
          >
            <FileText className="h-4 w-4" />
            Preencher Agora
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={() => handleConfirm("later")}
            className="flex items-center justify-center gap-2 w-full mt-0"
            data-testid="button-rat-later"
          >
            <Clock className="h-4 w-4" />
            Deixar para Depois
          </AlertDialogCancel>
          <Button
            variant="ghost"
            onClick={() => handleConfirm("skip")}
            className="flex items-center justify-center gap-2 text-muted-foreground w-full"
            data-testid="button-rat-skip"
          >
            <XCircle className="h-4 w-4" />
            Não criar RAT para esta visita
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
