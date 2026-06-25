import { ApprovalCard } from "../ApprovalCard";

export default function ApprovalCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <ApprovalCard
        id="1"
        technicianName="Carlos Mendes"
        activityTitle="Visita Técnica Preventiva"
        client="Indústria ABC Ltda"
        date="15/10/2025"
        duration="2h 30min"
        activityType="Visita técnica (preventiva)"
        category="efetivo"
        status="pendente"
        onApprove={() => console.log("Aprovado")}
        onReject={() => console.log("Rejeitado")}
        onEdit={() => console.log("Editar")}
      />
      <ApprovalCard
        id="2"
        technicianName="Ana Paula Santos"
        activityTitle="Aguardando liberação de acesso"
        client="Fábrica XYZ S/A"
        date="15/10/2025"
        duration="1h 15min"
        activityType="Aguardar cliente"
        category="perda"
        status="pendente"
        onApprove={() => console.log("Aprovado")}
        onReject={() => console.log("Rejeitado")}
        onEdit={() => console.log("Editar")}
      />
    </div>
  );
}
