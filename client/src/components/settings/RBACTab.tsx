import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, User } from "lucide-react";

const rbacRoles = [
  {
    title: "Administrador",
    icon: Shield,
    description: "Acesso total ao sistema",
    permissions: [
      "Gerenciar usuários e técnicos",
      "Criar e editar tipos de atividades",
      "Visualizar e editar todas as agendas",
      "Aprovar ou rejeitar atividades",
      "Acessar configurações do sistema",
      "Gerar relatórios e KPIs",
      "Gerenciar clientes e locais",
      "Gerenciar marcadores de calendário",
    ],
  },
  {
    title: "Técnico",
    icon: User,
    description: "Acesso limitado à própria agenda",
    permissions: [
      "Visualizar apenas própria agenda",
      "Executar atividades atribuídas",
      "Fazer check-in e check-out",
      "Visualizar rotas do dia",
      "Adicionar notas e anexos nas atividades",
      "Atualizar perfil pessoal",
    ],
  },
];

export default function RBACTab() {
  return (
    <div className="space-y-6" data-testid="tab-rbac">
      <div>
        <h2 className="text-2xl font-semibold">Controle de Acesso (RBAC)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Permissões e níveis de acesso por função no sistema
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {rbacRoles.map((role) => (
          <Card key={role.title} className="hover-elevate">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <role.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{role.title}</CardTitle>
                  <CardDescription>{role.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {role.permissions.map((permission, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    <span className="text-muted-foreground">{permission}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
