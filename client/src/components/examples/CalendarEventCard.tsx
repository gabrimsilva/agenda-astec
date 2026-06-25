import { CalendarEventCard } from "../CalendarEventCard";

export default function CalendarEventCardExample() {
  const mockEvent = {
    id: "1",
    title: "Visita Técnica Preventiva",
    client: "Indústria ABC Ltda",
    location: "Rua das Flores, 123 - Porto Alegre/RS",
    startTime: "09:00",
    endTime: "11:30",
    technicianName: "Carlos Mendes",
    activityType: "Visita técnica (preventiva)",
    status: "planejado" as const,
    category: "efetivo" as const,
    color: "hsl(220 65% 50%)",
  };

  return (
    <div className="space-y-4 p-4">
      <CalendarEventCard 
        event={mockEvent}
        onClick={() => console.log("Event clicked:", mockEvent.id)}
      />
      <CalendarEventCard 
        event={{...mockEvent, status: "emExecucao"}}
        compact
      />
    </div>
  );
}
