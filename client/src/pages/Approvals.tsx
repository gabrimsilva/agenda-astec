import { useState } from "react";
import { ApprovalCard } from "@/components/ApprovalCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function Approvals() {
  const [approvals, setApprovals] = useState<Array<{
    id: string;
    technicianName: string;
    activityTitle: string;
    client: string;
    date: string;
    duration: string;
    activityType: string;
    category: "efetivo" | "adicional" | "perda";
    status: "pendente" | "aprovado" | "rejeitado";
  }>>([
    {
      id: "1",
      technicianName: "Carlos Mendes",
      activityTitle: "Visita Técnica Preventiva",
      client: "Indústria ABC Ltda",
      date: "15/10/2025",
      duration: "2h 30min",
      activityType: "Visita técnica (preventiva)",
      category: "efetivo",
      status: "pendente",
    },
    {
      id: "2",
      technicianName: "Ana Paula Santos",
      activityTitle: "Aguardando liberação de acesso",
      client: "Fábrica XYZ S/A",
      date: "15/10/2025",
      duration: "1h 15min",
      activityType: "Aguardar cliente",
      category: "perda",
      status: "pendente",
    },
    {
      id: "3",
      technicianName: "João Silva",
      activityTitle: "Suporte Técnico Remoto",
      client: "Empresa DEF",
      date: "15/10/2025",
      duration: "45min",
      activityType: "Suporte à distância",
      category: "adicional",
      status: "pendente",
    },
  ]);

  const handleApprove = (id: string) => {
    setApprovals(approvals.map(a => 
      a.id === id ? { ...a, status: "aprovado" as const } : a
    ));
    console.log("Aprovado:", id);
  };

  const handleReject = (id: string) => {
    setApprovals(approvals.map(a => 
      a.id === id ? { ...a, status: "rejeitado" as const } : a
    ));
    console.log("Rejeitado:", id);
  };

  const handleEdit = (id: string) => {
    console.log("Editar:", id);
  };

  const pendingCount = approvals.filter(a => a.status === "pendente").length;

  return (
    <div className="space-y-6" data-testid="page-approvals">
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pendentes
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Aprovadas</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Devolvidas</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {approvals.filter(a => a.status === "pendente").length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma aprovação pendente</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {approvals
                .filter(a => a.status === "pendente")
                .map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    {...approval}
                    onApprove={() => handleApprove(approval.id)}
                    onReject={() => handleReject(approval.id)}
                    onEdit={() => handleEdit(approval.id)}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma atividade aprovada ainda</p>
          </div>
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma atividade devolvida</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
