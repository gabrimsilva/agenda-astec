import { useState } from "react";
import { TechnicianCard } from "@/components/TechnicianCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

export default function Technicians() {
  const [searchQuery, setSearchQuery] = useState("");

  const technicians = [
    {
      id: "1",
      name: "Carlos Mendes",
      email: "carlos.mendes@renner.com.br",
      phone: "(51) 99999-1234",
      team: "Equipe Sul",
      baseCity: "Porto Alegre/RS",
      color: "hsl(220 65% 50%)",
    },
    {
      id: "2",
      name: "Ana Paula Santos",
      email: "ana.santos@renner.com.br",
      phone: "(11) 98888-5678",
      team: "Equipe Sudeste",
      baseCity: "São Paulo/SP",
      color: "hsl(160 55% 45%)",
    },
    {
      id: "3",
      name: "João Silva",
      email: "joao.silva@renner.com.br",
      phone: "(21) 97777-9012",
      team: "Equipe Sudeste",
      baseCity: "Rio de Janeiro/RJ",
      color: "hsl(210 60% 55%)",
    },
    {
      id: "4",
      name: "Maria Lima",
      email: "maria.lima@renner.com.br",
      phone: "(85) 96666-3456",
      team: "Equipe Nordeste",
      baseCity: "Fortaleza/CE",
      color: "hsl(230 70% 48%)",
    },
  ];

  const filteredTechnicians = technicians.filter((tech) =>
    tech.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tech.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tech.baseCity.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 lg:space-y-6" data-testid="page-technicians">
      <div className="flex justify-end">
        <Button size="sm" data-testid="button-add-technician">
          <Plus className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-1.5 lg:mr-2" />
          <span className="text-xs lg:text-sm">Adicionar Técnico</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, equipe ou cidade..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="input-search-technician"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        {filteredTechnicians.map((tech) => (
          <TechnicianCard key={tech.id} {...tech} />
        ))}
      </div>

      {filteredTechnicians.length === 0 && (
        <div className="text-center py-8 lg:py-12">
          <p className="text-sm text-muted-foreground">Nenhum técnico encontrado</p>
        </div>
      )}
    </div>
  );
}
