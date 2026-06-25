import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ActivityDistributionChartProps {
  data: Array<{
    name: string;
    efetivo: number;
    adicional: number;
    perda: number;
  }>;
  title?: string;
}

export function ActivityDistributionChart({ data, title = "Distribuição de Atividades" }: ActivityDistributionChartProps) {
  return (
    <Card data-testid="card-activity-distribution">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis 
              dataKey="name" 
              className="text-xs"
              tick={{ fill: "hsl(var(--foreground))" }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: "hsl(var(--foreground))" }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
              }}
            />
            <Legend />
            <Bar dataKey="efetivo" fill="hsl(220 65% 50%)" name="Trabalho Efetivo" />
            <Bar dataKey="adicional" fill="hsl(160 55% 45%)" name="Trabalho Adicional" />
            <Bar dataKey="perda" fill="hsl(25 80% 55%)" name="Perda" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
