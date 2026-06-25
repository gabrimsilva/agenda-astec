import { ActivityDistributionChart } from "../ActivityDistributionChart";

export default function ActivityDistributionChartExample() {
  const mockData = [
    { name: "Carlos M.", efetivo: 68, adicional: 20, perda: 12 },
    { name: "Ana P.", efetivo: 72, adicional: 18, perda: 10 },
    { name: "João S.", efetivo: 65, adicional: 22, perda: 13 },
    { name: "Maria L.", efetivo: 70, adicional: 19, perda: 11 },
  ];

  return (
    <div className="p-4">
      <ActivityDistributionChart data={mockData} title="Distribuição por Técnico (%)" />
    </div>
  );
}
