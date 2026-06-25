import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Mail } from "lucide-react";

interface TechnicianCardProps {
  id: string;
  name: string;
  email: string;
  phone: string;
  team: string;
  baseCity: string;
  avatarUrl?: string;
  color: string;
}

export function TechnicianCard({
  id,
  name,
  email,
  phone,
  team,
  baseCity,
  avatarUrl,
  color,
}: TechnicianCardProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card className="hover-elevate cursor-pointer" data-testid={`card-technician-${id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12" style={{ borderColor: color, borderWidth: 2 }}>
            <AvatarImage src={avatarUrl} />
            <AvatarFallback style={{ backgroundColor: color + "20", color }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{name}</h3>
            <Badge variant="outline" className="mt-1 text-xs">
              {team}
            </Badge>
            
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{baseCity}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{phone}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="truncate">{email}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
