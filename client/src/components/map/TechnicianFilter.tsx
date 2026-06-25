import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Users, ChevronDown, Search, X } from "lucide-react";

interface TechnicianOption {
  id: string;
  name: string;
  color: string | null;
  team: string | null;
  baseCity: string | null;
}

interface TechnicianFilterProps {
  technicians: TechnicianOption[];
  selectedTechnicianIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  disabled?: boolean;
}

export function TechnicianFilter({
  technicians,
  selectedTechnicianIds,
  onSelectionChange,
  disabled = false,
}: TechnicianFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTechnicians = technicians.filter((tech) =>
    tech.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tech.team && tech.team.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (tech.baseCity && tech.baseCity.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleToggle = (techId: string) => {
    if (selectedTechnicianIds.includes(techId)) {
      onSelectionChange(selectedTechnicianIds.filter((id) => id !== techId));
    } else {
      onSelectionChange([...selectedTechnicianIds, techId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedTechnicianIds.length === technicians.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(technicians.map((t) => t.id));
    }
  };

  const handleClearSelection = () => {
    onSelectionChange([]);
  };

  const allSelected = selectedTechnicianIds.length === technicians.length;
  const someSelected = selectedTechnicianIds.length > 0 && selectedTechnicianIds.length < technicians.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
          data-testid="button-technician-filter"
        >
          <Users className="h-4 w-4" />
          Técnicos
          {selectedTechnicianIds.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {selectedTechnicianIds.length}/{technicians.length}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar técnico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8"
              data-testid="input-search-technician"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="text-xs h-7"
              data-testid="button-select-all-technicians"
            >
              {allSelected ? "Desmarcar Todos" : "Selecionar Todos"}
            </Button>
            {selectedTechnicianIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="text-xs h-7 text-destructive"
                data-testid="button-clear-technician-selection"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-2 space-y-1">
            {filteredTechnicians.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum técnico encontrado
              </p>
            ) : (
              filteredTechnicians.map((tech) => (
                <div
                  key={tech.id}
                  className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => handleToggle(tech.id)}
                  data-testid={`technician-filter-item-${tech.id}`}
                >
                  <Checkbox
                    checked={selectedTechnicianIds.includes(tech.id)}
                    onCheckedChange={() => handleToggle(tech.id)}
                    data-testid={`checkbox-technician-${tech.id}`}
                  />
                  <div
                    className="h-4 w-4 rounded-full flex-shrink-0 border border-border"
                    style={{ backgroundColor: tech.color || "#3b82f6" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tech.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {tech.team && <span>{tech.team}</span>}
                      {tech.baseCity && (
                        <>
                          {tech.team && <span>•</span>}
                          <span>{tech.baseCity}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
