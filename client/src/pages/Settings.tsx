import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActivitiesTab from "@/components/settings/ActivitiesTab";
import TechniciansTab from "@/components/settings/TechniciansTab";
import ClassificationsTab from "@/components/settings/ClassificationsTab";
import RBACTab from "@/components/settings/RBACTab";

export default function Settings() {
  return (
    <div className="space-y-4 lg:space-y-6" data-testid="page-settings">
      <Tabs defaultValue="atividades" className="space-y-4 lg:space-y-6">
        <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-4 md:grid-cols-4 h-auto">
          <TabsTrigger value="atividades" className="text-xs lg:text-sm py-1.5 lg:py-2" data-testid="tab-trigger-atividades">
            Atividades
          </TabsTrigger>
          <TabsTrigger value="classificacoes" className="text-xs lg:text-sm py-1.5 lg:py-2" data-testid="tab-trigger-classificacoes">
            Classificações
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="text-xs lg:text-sm py-1.5 lg:py-2" data-testid="tab-trigger-usuarios">
            Usuários
          </TabsTrigger>
          <TabsTrigger value="rbac" className="text-xs lg:text-sm py-1.5 lg:py-2" data-testid="tab-trigger-rbac">
            RBAC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atividades" className="space-y-4 lg:space-y-6">
          <ActivitiesTab />
        </TabsContent>

        <TabsContent value="classificacoes" className="space-y-4 lg:space-y-6">
          <ClassificationsTab />
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-4 lg:space-y-6">
          <TechniciansTab />
        </TabsContent>

        <TabsContent value="rbac" className="space-y-4 lg:space-y-6">
          <RBACTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
