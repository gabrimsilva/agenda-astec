import {
  Calendar,
  Users,
  Building2,
  Settings,
  FileText,
  MapPin,
  Clock,
  LogOut,
  Navigation,
  UserCircle,
  FileBarChart,
  Monitor,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Technician } from "@shared/schema";

// Menu items organized by role with proper ordering
// Admin items
const adminMenuItems = [
  {
    title: "Relatórios",
    url: "/relatorios",
    icon: FileBarChart,
  },
  {
    title: "Minha Agenda",
    url: "/minha-agenda",
    icon: Clock,
  },
  {
    title: "Calendário",
    url: "/calendario",
    icon: Calendar,
  },
  {
    title: "Clientes",
    url: "/clientes",
    icon: Building2,
  },
  {
    title: "RATs",
    url: "/rats",
    icon: FileText,
  },
  {
    title: "Mapa & Rotas",
    url: "/rotas",
    icon: MapPin,
  },
  {
    title: "Mapa TV",
    url: "/mapa-tv",
    icon: Monitor,
  },
  {
    title: "Perfil",
    url: "/perfil",
    icon: UserCircle,
  },
  {
    title: "Configurações",
    url: "/configuracoes",
    icon: Settings,
  },
];

// Assistente items
const assistenteMenuItems = [
  {
    title: "Relatórios",
    url: "/relatorios",
    icon: FileBarChart,
  },
  {
    title: "Minha Agenda",
    url: "/minha-agenda",
    icon: Clock,
  },
  {
    title: "Calendário",
    url: "/agenda",
    icon: Calendar,
  },
  {
    title: "RATs",
    url: "/rats",
    icon: FileText,
  },
  {
    title: "Perfil",
    url: "/perfil",
    icon: UserCircle,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const { data: technicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    enabled: !!user,
  });

  const userTechnician = technicians?.find((tech) => tech.userId === user?.id);

  // Get menu items based on user role
  const menuItems = user?.role === "admin" ? adminMenuItems : assistenteMenuItems;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-md" style={{ backgroundColor: '#d31527' }}>
            <img src="/renner-logo.png" alt="Renner" className="h-8 w-8 object-contain p-1" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">ASTEC</h2>
            <p className="text-xs text-muted-foreground">Sistema de Agenda</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <a href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        {user && (
          <>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={user.avatarUrl || userTechnician?.avatarUrl || ""} />
                <AvatarFallback data-testid="text-user-initials">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-user-name">
                  {user.name}
                </p>
                <p className="text-xs text-muted-foreground capitalize" data-testid="text-user-role">
                  {user.role}
                </p>
              </div>
            </div>

            {userTechnician && (
              <div className="text-xs space-y-1 px-2 py-2 rounded-md bg-muted" data-testid="info-technician">
                <p className="text-muted-foreground">Equipe: {userTechnician.team}</p>
                <p className="text-muted-foreground">Base: {userTechnician.baseCity}</p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
