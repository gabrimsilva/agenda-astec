import { DailyRouteView } from "../DailyRouteView";
import { useState } from "react";

export default function DailyRouteViewExample() {
  const [stops, setStops] = useState<Array<{
    id: string;
    order: number;
    client: string;
    address: string;
    startTime: string;
    endTime: string;
    status: "pending" | "inProgress" | "completed";
    activityType: string;
  }>>([
    {
      id: "1",
      order: 1,
      client: "Indústria ABC Ltda",
      address: "Rua das Flores, 123 - Porto Alegre/RS",
      startTime: "09:00",
      endTime: "11:30",
      status: "pending",
      activityType: "Visita técnica preventiva",
    },
    {
      id: "2",
      order: 2,
      client: "Fábrica XYZ S/A",
      address: "Av. Central, 456 - Canoas/RS",
      startTime: "14:00",
      endTime: "16:00",
      status: "pending",
      activityType: "Visita técnica corretiva",
    },
  ]);

  const handleCheckIn = (stopId: string) => {
    setStops(stops.map(s => s.id === stopId ? { ...s, status: "inProgress" as const } : s));
    console.log("Iniciar atividade:", stopId);
  };

  const handleCheckOut = (stopId: string) => {
    setStops(stops.map(s => s.id === stopId ? { ...s, status: "completed" as const } : s));
    console.log("Concluir atividade:", stopId);
  };

  return (
    <div className="p-4 max-w-md">
      <DailyRouteView
        date="17 de Outubro, 2025"
        stops={stops}
        onStartRoute={() => console.log("Iniciando navegação")}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
      />
    </div>
  );
}
