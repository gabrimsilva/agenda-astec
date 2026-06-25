import { MonthlyMatrixView } from "@/components/MonthlyMatrixView";
import { Button } from "@/components/ui/button";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

export default function MonthlyMatrix() {
  const mockTechnicians = [
    {
      id: "1",
      name: "Carlos Mendes",
      color: "hsl(220 65% 50%)",
      days: Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        activities: i % 5 === 0 ? ["Visita técnica", "Treinamento"] : i % 3 === 0 ? ["Preventiva"] : [],
        marker: i === 0 ? "F" as const : i % 6 === 0 ? "S" as const : undefined,
        totalHours: i % 5 === 0 ? 8 : i % 3 === 0 ? 4 : 0,
      })),
    },
    {
      id: "2",
      name: "Ana Paula Santos",
      color: "hsl(160 55% 45%)",
      days: Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        activities: i % 4 === 0 ? ["Corretiva"] : [],
        marker: i === 14 ? "FE" as const : undefined,
        totalHours: i % 4 === 0 ? 6 : 0,
      })),
    },
    {
      id: "3",
      name: "João Silva",
      color: "hsl(210 60% 55%)",
      days: Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        activities: i % 6 === 0 ? ["Suporte remoto"] : [],
        marker: i === 24 ? "H" as const : undefined,
        totalHours: i % 6 === 0 ? 3 : 0,
      })),
    },
  ];

  return (
    <div className="space-y-6" data-testid="page-monthly-matrix">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="icon">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button data-testid="button-export-matrix">
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      <MonthlyMatrixView
        month="Outubro"
        year="2025"
        technicians={mockTechnicians}
      />
    </div>
  );
}
