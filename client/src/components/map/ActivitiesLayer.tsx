import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Calendar, Clock, MapPin, User, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import moment from "moment";
import "moment/locale/pt-br";

moment.locale("pt-br");

interface ActivityMarker {
  id: string;
  title: string;
  clientName: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  activityTypeName: string;
  technicianId: string;
  technicianName: string;
  technicianColor: string;
}

interface ActivitiesLayerProps {
  activities: ActivityMarker[];
  onActivityClick?: (activity: ActivityMarker) => void;
  onScheduleWithTechnician?: (technicianId: string, technicianName: string) => void;
}

const offsetOverlappingMarkers = (activities: ActivityMarker[]): (ActivityMarker & { offsetLat: number; offsetLng: number })[] => {
  const offset = 0.00008;
  const locationGroups = new Map<string, ActivityMarker[]>();
  
  activities.forEach(activity => {
    const key = `${activity.latitude.toFixed(5)},${activity.longitude.toFixed(5)}`;
    if (!locationGroups.has(key)) {
      locationGroups.set(key, []);
    }
    locationGroups.get(key)!.push(activity);
  });
  
  const result: (ActivityMarker & { offsetLat: number; offsetLng: number })[] = [];
  
  locationGroups.forEach((group) => {
    if (group.length === 1) {
      result.push({ ...group[0], offsetLat: group[0].latitude, offsetLng: group[0].longitude });
    } else {
      group.forEach((activity, index) => {
        const angle = (2 * Math.PI * index) / group.length;
        const radius = offset * Math.ceil(index / 6 + 1);
        result.push({
          ...activity,
          offsetLat: activity.latitude + radius * Math.cos(angle),
          offsetLng: activity.longitude + radius * Math.sin(angle),
        });
      });
    }
  });
  
  return result;
};

const createColoredIcon = (color: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 41" width="25" height="41">
      <path fill="${color}" stroke="#ffffff" stroke-width="1.5" d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 29 12 29s12-21.8 12-29c0-6.6-5.4-12-12-12z"/>
      <circle fill="#ffffff" cx="12" cy="12" r="5"/>
    </svg>
  `;
  
  return L.divIcon({
    html: `<div style="position: relative;">${svg}</div>`,
    className: "custom-marker-icon",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
};

const statusLabels: Record<string, string> = {
  planejado: "Planejado",
  aCaminho: "A Caminho",
  emExecucao: "Em Execução",
  concluido: "Concluído",
  reprovado: "Reprovado",
  cancelado: "Cancelado",
};

const statusColors: Record<string, string> = {
  planejado: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  aCaminho: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  emExecucao: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  concluido: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  reprovado: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  cancelado: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

export function ActivitiesLayer({ activities, onActivityClick, onScheduleWithTechnician }: ActivitiesLayerProps) {
  const offsetActivities = useMemo(() => offsetOverlappingMarkers(activities), [activities]);
  
  return (
    <>
      {offsetActivities.map((activity) => {
        const icon = createColoredIcon(activity.technicianColor || "#3b82f6");
        
        return (
          <Marker
            key={activity.id}
            position={[activity.offsetLat, activity.offsetLng]}
            icon={icon}
            eventHandlers={{
              click: () => onActivityClick?.(activity),
            }}
            data-testid={`marker-activity-${activity.id}`}
          >
            <Popup>
              <div className="min-w-[250px] p-1" data-testid={`popup-activity-${activity.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: activity.technicianColor || "#3b82f6" }}
                    />
                    <span className="font-semibold text-sm">{activity.technicianName}</span>
                  </div>
                  <Badge className={`text-xs ${statusColors[activity.status] || ""}`}>
                    {statusLabels[activity.status] || activity.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium">{activity.clientName}</span>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{activity.address}</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{moment(activity.scheduledDate).format("DD/MM/YYYY")}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{activity.scheduledTime}</span>
                    </div>
                  </div>

                  <Badge variant="outline" className="text-xs">
                    {activity.activityTypeName}
                  </Badge>
                </div>

                {onScheduleWithTechnician && (
                  <div className="mt-3 pt-2 border-t">
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => onScheduleWithTechnician(activity.technicianId, activity.technicianName)}
                      data-testid={`button-schedule-with-${activity.technicianId}`}
                    >
                      <Calendar className="h-4 w-4" />
                      Agendar com este técnico
                    </Button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
