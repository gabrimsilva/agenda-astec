import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface DayActivity {
  day: number;
  activities: string[];
  marker?: "F" | "FE" | "S" | "D" | "P" | "H";
  totalHours: number;
}

interface TechnicianRow {
  id: string;
  name: string;
  color: string;
  days: DayActivity[];
}

interface MonthlyMatrixViewProps {
  month: string;
  year: string;
  technicians: TechnicianRow[];
}

const markerColors = {
  F: "bg-dayMarker-feriado",
  FE: "bg-dayMarker-ferias",
  S: "bg-dayMarker-weekend",
  D: "bg-dayMarker-weekend",
  P: "bg-dayMarker-ponte",
  H: "bg-dayMarker-homeOffice",
};

const markerLabels = {
  F: "Feriado",
  FE: "Férias",
  S: "Sábado",
  D: "Domingo",
  P: "Ponte",
  H: "Home Office",
};

export function MonthlyMatrixView({ month, year, technicians }: MonthlyMatrixViewProps) {
  const daysInMonth = 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <Card data-testid="card-monthly-matrix">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Matriz Mensal - {month}/{year}</span>
          <div className="flex gap-2">
            {Object.entries(markerLabels).map(([key, label]) => (
              <Badge
                key={key}
                variant="outline"
                className={cn("text-xs", markerColors[key as keyof typeof markerColors])}
              >
                {key}: {label}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-max">
          <div className="grid gap-px bg-border" style={{ gridTemplateColumns: `200px repeat(${daysInMonth}, minmax(60px, 1fr)) 80px` }}>
            <div className="bg-card p-2 font-semibold sticky left-0 z-10">Técnico</div>
            {days.map((day) => (
              <div key={day} className="bg-card p-2 text-center text-sm font-medium">
                {day}
              </div>
            ))}
            <div className="bg-card p-2 text-center font-semibold">Total</div>

            {technicians.map((tech) => {
              const initials = tech.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const totalHours = tech.days.reduce((sum, day) => sum + day.totalHours, 0);
              
              return (
                <>
                  <div className="bg-card p-2 flex items-center gap-2 sticky left-0 z-10" key={`${tech.id}-name`}>
                    <Avatar className="h-6 w-6" style={{ borderColor: tech.color, borderWidth: 1 }}>
                      <AvatarFallback style={{ backgroundColor: tech.color + "20", color: tech.color, fontSize: "10px" }}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">{tech.name}</span>
                  </div>
                  
                  {tech.days.map((dayData) => (
                    <div
                      key={`${tech.id}-day-${dayData.day}`}
                      className={cn(
                        "bg-card p-1 text-xs min-h-12 hover-elevate cursor-pointer relative",
                        dayData.marker && markerColors[dayData.marker]
                      )}
                      data-testid={`cell-${tech.id}-day-${dayData.day}`}
                    >
                      {dayData.marker && (
                        <Badge variant="outline" className="absolute top-1 right-1 h-4 px-1 text-[10px]">
                          {dayData.marker}
                        </Badge>
                      )}
                      <div className="space-y-0.5 mt-4">
                        {dayData.activities.slice(0, 2).map((activity, idx) => (
                          <div key={idx} className="truncate" title={activity}>
                            {activity}
                          </div>
                        ))}
                        {dayData.activities.length > 2 && (
                          <div className="text-muted-foreground">+{dayData.activities.length - 2}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="bg-card p-2 text-center font-semibold" key={`${tech.id}-total`}>
                    {totalHours}h
                  </div>
                </>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
