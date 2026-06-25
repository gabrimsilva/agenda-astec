import { AppSidebar } from "../AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider } from "@/hooks/useAuth";

export default function AppSidebarExample() {
  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <AuthProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex-1 p-8">
            <h2 className="text-2xl font-bold">Sidebar Navigation</h2>
            <p className="text-muted-foreground mt-2">
              This sidebar adapts based on user role (Admin, Gestor, Assistente, Comercial)
            </p>
          </div>
        </div>
      </SidebarProvider>
    </AuthProvider>
  );
}
