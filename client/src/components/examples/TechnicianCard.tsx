import { TechnicianCard } from "../TechnicianCard";

export default function TechnicianCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <TechnicianCard
        id="1"
        name="Carlos Mendes"
        email="carlos.mendes@renner.com.br"
        phone="(51) 99999-1234"
        team="Equipe Sul"
        baseCity="Porto Alegre/RS"
        color="hsl(220 65% 50%)"
      />
      <TechnicianCard
        id="2"
        name="Ana Paula Santos"
        email="ana.santos@renner.com.br"
        phone="(11) 98888-5678"
        team="Equipe Sudeste"
        baseCity="São Paulo/SP"
        color="hsl(160 55% 45%)"
      />
    </div>
  );
}
