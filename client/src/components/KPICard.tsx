import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

type KPIAccent = "brand" | "info" | "success" | "warn" | "insight" | "critical";

// Paleta do RDS (Renner Design System) usada pelo credito.rennercoatings.com
const ACCENTS: Record<KPIAccent, string> = {
  brand: "#E11D48",
  info: "#2563EB",
  success: "#10B981",
  warn: "#F59E0B",
  insight: "#7C3AED",
  critical: "#DC2626",
};

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  accent?: KPIAccent;
}

export function KPICard({ title, value, subtitle, trend, icon, accent = "brand" }: KPICardProps) {
  const color = ACCENTS[accent];

  return (
    <Card
      data-testid={`card-kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="relative overflow-hidden hover-elevate"
    >
      {/* Barra de acento colorida à esquerda (assinatura visual do RDS) */}
      <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: color }} />

      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground line-clamp-2">
          {title}
        </CardTitle>
        {icon && (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1A`, color }}
          >
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div
          className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums"
          data-testid={`text-kpi-value-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {value}
        </div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-1.5 md:gap-2 mt-1 flex-wrap">
            {trend && (
              <div className={cn(
                "flex items-center text-xs font-medium",
                trend.isPositive ? "text-success" : "text-destructive"
              )}>
                {trend.isPositive ? (
                  <ArrowUp className="h-3 w-3 mr-0.5" />
                ) : (
                  <ArrowDown className="h-3 w-3 mr-0.5" />
                )}
                {Math.abs(trend.value)}%
              </div>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
