import {
  Calendar,
  Users,
  Settings,
  FileText,
  Clock,
  LogOut,
  UserCircle,
  FileBarChart,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
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
  useSidebar,
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
    title: "RATs",
    url: "/rats",
    icon: FileText,
  },
  {
    title: "Painel TV",
    url: "/painel-tv",
    icon: LayoutDashboard,
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

// Botão circular flutuante para recolher/expandir o menu (padrão do crédito)
function SidebarCollapseButton() {
  const { toggleSidebar, state } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={state === "collapsed" ? "Expandir menu" : "Recolher menu"}
      title={state === "collapsed" ? "Expandir menu" : "Recolher menu"}
      className="absolute top-16 -right-3 z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-background text-foreground shadow-md transition hover:bg-accent md:flex"
      data-testid="button-collapse-sidebar"
    >
      {state === "collapsed" ? (
        <ChevronRight className="h-3.5 w-3.5" />
      ) : (
        <ChevronLeft className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

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
    <Sidebar collapsible="icon">
      <SidebarCollapseButton />
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-md" style={{ backgroundColor: '#E11D48' }}>
            <img src="/renner-logo.png" alt="Renner" className="h-8 w-8 object-contain p-1" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <h2 className="text-lg font-semibold">ASTEC</h2>
            <p className="text-xs text-sidebar-foreground/60">Sistema de Agenda</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
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
      <SidebarFooter className="p-4 space-y-4 group-data-[collapsible=icon]:p-2">
        {user && (
          <>
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <Avatar>
                <AvatarImage src={user.avatarUrl || userTechnician?.avatarUrl || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold" data-testid="text-user-initials">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-medium truncate" data-testid="text-user-name">
                  {user.name}
                </p>
                <p className="text-xs text-sidebar-foreground/60 capitalize" data-testid="text-user-role">
                  {user.role}
                </p>
              </div>
            </div>

            {userTechnician && (
              <div className="text-xs space-y-1 px-2 py-2 rounded-md bg-sidebar-accent group-data-[collapsible=icon]:hidden" data-testid="info-technician">
                <p className="text-sidebar-foreground/70">Equipe: {userTechnician.team}</p>
                <p className="text-sidebar-foreground/70">Base: {userTechnician.baseCity}</p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full group-data-[collapsible=icon]:px-0"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2 group-data-[collapsible=icon]:mr-0" />
              <span className="group-data-[collapsible=icon]:hidden">Sair</span>
            </Button>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
