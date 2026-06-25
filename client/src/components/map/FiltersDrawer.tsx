import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Filter, X, Search } from "lucide-react";

interface FiltersDrawerProps {
  onFiltersChange: (filters: {
    group: string;
    segment: string;
    search: string;
  }) => void;
  availableGroups: string[];
  availableSegments: string[];
  currentFilters?: {
    group: string;
    segment: string;
    search: string;
  };
  onOpenChange?: (open: boolean) => void;
}

export function FiltersDrawer({
  onFiltersChange,
  availableGroups,
  availableSegments,
  currentFilters,
  onOpenChange,
}: FiltersDrawerProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  const [group, setGroup] = useState<string>(currentFilters?.group || "");
  const [segment, setSegment] = useState<string>(currentFilters?.segment || "");
  const [search, setSearch] = useState<string>(currentFilters?.search || "");
  
  // Sincronizar com filtros externos quando mudarem
  useEffect(() => {
    if (currentFilters) {
      setGroup(currentFilters.group || "");
      setSegment(currentFilters.segment || "");
      setSearch(currentFilters.search || "");
    }
  }, [currentFilters]);

  const handleApplyFilters = () => {
    onFiltersChange({ group, segment, search });
    handleOpenChange(false);
  };

  const handleClearFilters = () => {
    setGroup("");
    setSegment("");
    setSearch("");
    onFiltersChange({ group: "", segment: "", search: "" });
  };

  const activeFiltersCount = [group, segment, search].filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 relative"
          data-testid="button-filters"
        >
          <Filter className="h-4 w-4" />
          Filtros
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              data-testid="filters-count-badge"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filtrar Clientes</SheetTitle>
          <SheetDescription>
            Refine a visualização do mapa aplicando filtros
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Busca */}
          <div className="space-y-2">
            <Label htmlFor="search-input">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search-input"
                data-testid="input-search"
                placeholder="Nome do cliente ou endereço..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Grupo */}
          <div className="space-y-2">
            <Label htmlFor="group-select">Grupo de Clientes</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id="group-select" data-testid="select-group">
                <SelectValue placeholder="Todos os grupos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-item-group-all">Todos os grupos</SelectItem>
                {availableGroups.map((g) => (
                  <SelectItem key={g} value={g} data-testid={`select-item-group-${g.toLowerCase().replace(/\s+/g, '-')}`}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Segmento */}
          <div className="space-y-2">
            <Label htmlFor="segment-select">Segmento</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger id="segment-select" data-testid="select-segment">
                <SelectValue placeholder="Todos os segmentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-item-segment-all">Todos os segmentos</SelectItem>
                {availableSegments.map((s) => (
                  <SelectItem key={s} value={s} data-testid={`select-item-segment-${s.toLowerCase().replace(/\s+/g, '-')}`}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters */}
          {activeFiltersCount > 0 && (
            <div className="space-y-2">
              <Label>Filtros Ativos</Label>
              <div className="flex flex-wrap gap-2">
                {group && group !== "all" && (
                  <Badge variant="secondary" className="gap-1">
                    Grupo: {group}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setGroup("")}
                    />
                  </Badge>
                )}
                {segment && segment !== "all" && (
                  <Badge variant="secondary" className="gap-1">
                    Segmento: {segment}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setSegment("")}
                    />
                  </Badge>
                )}
                {search && (
                  <Badge variant="secondary" className="gap-1">
                    Busca: {search}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setSearch("")}
                    />
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleApplyFilters}
              className="flex-1"
              data-testid="button-apply-filters"
            >
              Aplicar Filtros
            </Button>
            <Button
              variant="outline"
              onClick={handleClearFilters}
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
