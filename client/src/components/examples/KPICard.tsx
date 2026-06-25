import { KPICard } from "../KPICard";
import { Clock, CheckCircle, AlertTriangle } from "lucide-react";

export default function KPICardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      <KPICard
        title="Trabalho Efetivo"
        value="68%"
        subtitle="do total de horas"
        trend={{ value: 5, isPositive: true }}
        icon={<CheckCircle className="h-4 w-4" />}
      />
      <KPICard
        title="Horas Planejadas"
        value="156h"
        subtitle="este mês"
        icon={<Clock className="h-4 w-4" />}
      />
      <KPICard
        title="Taxa de Perda"
        value="12%"
        subtitle="do total"
        trend={{ value: 3, isPositive: false }}
        icon={<AlertTriangle className="h-4 w-4" />}
      />
    </div>
  );
}
