import { MonthlyMatrixView } from "../MonthlyMatrixView";

export default function MonthlyMatrixViewExample() {
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
  ];

  return (
    <div className="p-4">
      <MonthlyMatrixView
        month="Outubro"
        year="2025"
        technicians={mockTechnicians}
      />
    </div>
  );
}
