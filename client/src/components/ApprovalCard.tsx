import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Edit2, Clock, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ApprovalCardProps {
  id: string;
  technicianName: string;
  activityTitle: string;
  client: string;
  date: string;
  duration: string;
  activityType: string;
  category: "efetivo" | "adicional" | "perda";
  status: "pendente" | "aprovado" | "rejeitado";
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
}

const categoryColors = {
  efetivo: "bg-activity-efetivo1/20 text-activity-efetivo1",
  adicional: "bg-activity-adicional1/20 text-activity-adicional1",
  perda: "bg-activity-perda1/20 text-activity-perda1",
};

const categoryLabels = {
  efetivo: "Trabalho Efetivo",
  adicional: "Trabalho Adicional",
  perda: "Perda",
};

export function ApprovalCard({
  id,
  technicianName,
  activityTitle,
  client,
  date,
  duration,
  activityType,
  category,
  status,
  onApprove,
  onReject,
  onEdit,
}: ApprovalCardProps) {
  const initials = technicianName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card data-testid={`card-approval-${id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{technicianName}</p>
              <p className="text-sm text-muted-foreground">{date}</p>
            </div>
          </div>
          <Badge variant="outline" className={categoryColors[category]}>
            {categoryLabels[category]}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 pb-4">
        <div>
          <h4 className="font-medium">{activityTitle}</h4>
          <p className="text-sm text-muted-foreground mt-1">{client}</p>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{duration}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{activityType}</span>
          </div>
        </div>
      </CardContent>

      {status === "pendente" && (
        <CardFooter className="flex gap-2 pt-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onEdit}
            data-testid={`button-edit-${id}`}
          >
            <Edit2 className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onReject}
            data-testid={`button-reject-${id}`}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Devolver
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onApprove}
            data-testid={`button-approve-${id}`}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Aprovar
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
