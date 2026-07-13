import { Home, Calendar, Clock, MapPin, User, CheckCircle, Users, Navigation, FileBarChart, FileText } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  // Menu items based on role (matching AppSidebar)
  const getMenuItems = () => {
    if (user?.role === "assistente") {
      // Técnico: Minha Agenda, Calendário, RATs, Relatórios, Perfil
      return [
        { icon: Clock, label: "Minha Agenda", path: "/minha-agenda" },
        { icon: Calendar, label: "Calendário", path: "/calendario" },
        { icon: FileText, label: "RATs", path: "/rats" },
        { icon: FileBarChart, label: "Relatórios", path: "/relatorios" },
        { icon: User, label: "Perfil", path: "/perfil" },
      ];
    }

    // Admin: Relatórios, Minha Agenda, RATs, Rotas, Perfil
    return [
      { icon: FileBarChart, label: "Relatórios", path: "/" },
      { icon: Clock, label: "Minha Agenda", path: "/minha-agenda" },
      { icon: FileText, label: "RATs", path: "/rats" },
      { icon: MapPin, label: "Rotas", path: "/rotas" },
      { icon: User, label: "Perfil", path: "/perfil" },
    ];
  };

  const menuItems = getMenuItems();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-14 px-2">
        {menuItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;

          return (
            <Link key={item.path} href={item.path}>
              <button
                data-testid={`nav-${item.label.toLowerCase()}`}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 min-w-[60px] h-full rounded-lg transition-colors",
                  "hover-elevate active-elevate-2",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
