import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import BottomNav from "@/components/BottomNav";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { SplashScreen } from "@/components/SplashScreen";
import { GPSTrackingProvider } from "@/hooks/useGPSTracking";
import { OneSignalProvider } from "@/hooks/useOneSignal";
import { FieldModeToggle } from "@/components/FieldModeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { PageTitleProvider, usePageTitle } from "@/hooks/usePageTitle";
import NotFound from "@/pages/not-found";
import Calendar from "@/pages/Calendar";
import Agenda from "@/pages/Agenda";
import Approvals from "@/pages/Approvals";
import MyAgenda from "@/pages/MyAgenda";
import MonthlyMatrix from "@/pages/MonthlyMatrix";
import Routes from "@/pages/Routes";
import Clients from "@/pages/Clients";
import CheckIn from "@/pages/CheckIn";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import RATs from "@/pages/RATs";
import Login from "@/pages/Login";
import GPSTest from "@/pages/GPSTest";
import IconGenerator from "@/pages/IconGenerator";
import MapaTV from "@/pages/MapaTV";
import { useAuth } from "@/hooks/useAuth";
import { useDbWarmup } from "@/hooks/useDbWarmup";
import { useLocation as useWouterLocation } from "wouter";
import { useEffect } from "react";

function HomeRedirect() {
  const { user } = useAuth();
  const [, setLocation] = useWouterLocation();

  useEffect(() => {
    if (user) {
      const redirectPath = user.role === "admin" ? "/relatorios" : "/minha-agenda";
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  return null;
}

function ProtectedRouter() {
  return (
    <ProtectedRoute>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/relatorios" component={Reports} />
        <Route path="/calendario" component={Calendar} />
        <Route path="/agenda" component={Agenda} />
        <Route path="/aprovacoes" component={Approvals} />
        <Route path="/minha-agenda" component={MyAgenda} />
        <Route path="/rats" component={RATs} />
        <Route path="/matriz-mensal" component={MonthlyMatrix} />
        <Route path="/rotas" component={Routes} />
        <Route path="/clientes" component={Clients} />
        <Route path="/teste-gps" component={GPSTest} />
        <Route path="/checkin" component={CheckIn} />
        <Route path="/perfil" component={Profile} />
        <Route path="/configuracoes" component={Settings} />
        <Route path="/gerar-icones" component={IconGenerator} />
        <Route component={NotFound} />
      </Switch>
    </ProtectedRoute>
  );
}

function PageHeader() {
  const { title, subtitle } = usePageTitle();
  
  return (
    <>
      {/* Desktop Header */}
      <header className="hidden md:flex items-center justify-between sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 p-3">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground leading-tight">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 p-3">
          <NotificationBell />
          <FieldModeToggle />
          <ThemeToggle />
        </div>
      </header>
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-3 sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <span className="font-bold text-base tracking-tight">{title || "ASTEC"}</span>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <FieldModeToggle />
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}

function MainLayout() {
  useDbWarmup();

  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <PageTitleProvider>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <PageHeader />
            <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6 min-w-0">
              <ProtectedRouter />
            </main>
            <BottomNav />
            <PWAInstallPrompt />
            <OfflineIndicator />
          </div>
        </div>
      </PageTitleProvider>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <OneSignalProvider>
              <GPSTrackingProvider>
                <SplashScreen />
                <Switch>
                  <Route path="/login" component={Login} />
                  <Route path="/mapa-tv" component={MapaTV} />
                  <Route>
                    {() => <MainLayout />}
                  </Route>
                </Switch>
                <Toaster />
              </GPSTrackingProvider>
            </OneSignalProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
