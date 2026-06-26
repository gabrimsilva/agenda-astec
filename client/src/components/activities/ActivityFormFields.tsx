import { useState, useRef, useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityType, Client, Technician } from "@shared/schema";

interface ActivityTypeSelectorProps {
  form: UseFormReturn<any>;
  activityTypes: ActivityType[];
  fieldName?: string;
}

export function ActivityTypeSelector({
  form,
  activityTypes,
  fieldName = "activityTypeId",
}: ActivityTypeSelectorProps) {
  // Lista única (sem cores e sem separação por categoria efetivo/adicional/perda).
  // Mantém apenas a relação categoria principal > subcategoria por indentação.
  const activeTypes = activityTypes.filter((t) => t.isActive !== false);
  const mainTypes = activeTypes
    .filter((t) => !(t as any).parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const childTypes = activeTypes.filter((t) => (t as any).parentId);

  const orderedTypes: { type: ActivityType; isChild: boolean }[] = [];
  mainTypes.forEach((main) => {
    orderedTypes.push({ type: main, isChild: false });
    childTypes
      .filter((child) => (child as any).parentId === main.id)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .forEach((child) => orderedTypes.push({ type: child, isChild: true }));
  });
  // Subcategorias órfãs (cujo pai não existe ou está inativo)
  childTypes
    .filter((child) => !mainTypes.find((main) => main.id === (child as any).parentId))
    .forEach((orphan) => orderedTypes.push({ type: orphan, isChild: false }));

  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => {
        const selectedType = activityTypes.find((t) => t.id === field.value);
        const parentType = selectedType && (selectedType as any).parentId
          ? activityTypes.find((t) => t.id === (selectedType as any).parentId)
          : null;

        return (
          <FormItem>
            <FormLabel>Tipo de Atividade *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid="select-activity-type">
                  <SelectValue placeholder="Selecione um tipo">
                    {selectedType
                      ? (parentType ? `${parentType.name} > ${selectedType.name}` : selectedType.name)
                      : null}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                {orderedTypes.map(({ type, isChild }) => (
                  <SelectItem
                    key={type.id}
                    value={type.id}
                    data-testid={`option-type-${type.id}`}
                    className={cn("whitespace-normal", isChild ? "pl-8" : "pl-4")}
                  >
                    <span className="text-left break-words">{isChild ? `└ ${type.name}` : type.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

interface ActivityLocationSelectorProps {
  form: UseFormReturn<any>;
  activityTypes: ActivityType[];
  typeFieldName?: string;
  fieldName?: string;
}

// Dropdown de "Local de Realização" exibido abaixo do Tipo de Atividade.
// Lista os locais definidos no tipo selecionado; subcategorias puxam da categoria pai.
export function ActivityLocationSelector({
  form,
  activityTypes,
  typeFieldName = "activityTypeId",
  fieldName = "location",
}: ActivityLocationSelectorProps) {
  const selectedTypeId = form.watch(typeFieldName);
  const selectedType = activityTypes.find((t) => t.id === selectedTypeId);
  // Subcategorias herdam os locais da categoria pai
  const sourceType = selectedType && (selectedType as any).parentId
    ? activityTypes.find((t) => t.id === (selectedType as any).parentId) ?? selectedType
    : selectedType;
  const locations: string[] = ((sourceType as any)?.locations as string[]) || [];
  const currentValue = form.watch(fieldName);

  // Limpa o local selecionado quando o tipo muda e o valor atual não está mais disponível
  useEffect(() => {
    if (currentValue && !locations.includes(currentValue)) {
      form.setValue(fieldName, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypeId]);

  if (!selectedType || locations.length === 0) return null;

  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Executado em:</FormLabel>
          <Select onValueChange={field.onChange} value={field.value || undefined}>
            <FormControl>
              <SelectTrigger data-testid="select-activity-location">
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc} data-testid={`option-location-${loc}`}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface ClientSearchFieldProps {
  form: UseFormReturn<any>;
  clients: Client[];
  technician?: Technician | null;
  onClientSelect: (client: Client) => void;
  onBaseSelect?: () => void;
  isLoading?: boolean;
}

export function ClientSearchField({
  form,
  clients,
  technician,
  onClientSelect,
  onBaseSelect,
  isLoading = false,
}: ClientSearchFieldProps) {
  const [open, setOpen] = useState(false);

  const hasValidBase =
    technician &&
    technician.baseAddress &&
    technician.baseCity &&
    technician.baseLatitude &&
    !isNaN(parseFloat(technician.baseLatitude)) &&
    technician.baseLongitude &&
    !isNaN(parseFloat(technician.baseLongitude));

  return (
    <FormField
      control={form.control}
      name="clientName"
      render={({ field }) => {
        const showBaseOption =
          hasValidBase &&
          (!field.value ||
            "Base do técnico (Home office)"
              .toLowerCase()
              .includes(field.value.toLowerCase()));

        const filteredClients = clients.filter((client) =>
          client.companyName
            .toLowerCase()
            .includes((field.value || "").toLowerCase())
        );

        return (
          <FormItem className="flex flex-col relative">
            <FormLabel>Cliente *</FormLabel>
            <FormControl>
              <Input
                placeholder="Digite para buscar cliente..."
                value={field.value || ""}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                data-testid="input-client-search"
              />
            </FormControl>
            {open && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 max-h-64 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Carregando clientes...
                  </div>
                ) : (
                  <div className="p-2">
                    {showBaseOption && onBaseSelect && (
                      <div
                        className="px-3 py-2 hover:bg-accent rounded-sm cursor-pointer border-b mb-2"
                        onClick={() => {
                          onBaseSelect();
                          setOpen(false);
                        }}
                        data-testid="option-base-home-office"
                      >
                        <div className="flex items-center gap-2">
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0",
                              field.value === "Base do técnico (Home office)"
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">
                              Base do técnico (Home office)
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {technician?.baseAddress}, {technician?.baseCity}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {filteredClients.length === 0 && !showBaseOption ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        {field.value
                          ? `Nenhum cliente encontrado para "${field.value}"`
                          : "Nenhum cliente cadastrado"}
                      </div>
                    ) : (
                      filteredClients.map((client) => (
                        <div
                          key={client.id}
                          className="px-3 py-2 hover:bg-accent rounded-sm cursor-pointer"
                          onClick={() => {
                            onClientSelect(client);
                            setOpen(false);
                          }}
                          data-testid={`option-client-${client.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                field.value === client.companyName
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col flex-1">
                              <span className="font-medium">
                                {client.companyName}
                              </span>
                              {client.address && (
                                <span className="text-xs text-muted-foreground">
                                  {client.address}, {client.city}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

interface CepSearchFieldProps {
  cepValue: string;
  onCepChange: (value: string) => void;
  onCepSearch: (cep: string) => void;
  isLoading?: boolean;
}

export function CepSearchField({
  cepValue,
  onCepChange,
  onCepSearch,
  isLoading = false,
}: CepSearchFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length > 5) {
      value = value.slice(0, 5) + "-" + value.slice(5);
    }
    onCepChange(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCepSearch(cepValue);
    }
  };

  return (
    <div className="space-y-2">
      <FormLabel>CEP</FormLabel>
      <div className="flex gap-2">
        <Input
          placeholder="00000-000"
          value={cepValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="flex-1"
          data-testid="input-cep"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => onCepSearch(cepValue)}
          disabled={isLoading || cepValue.replace(/\D/g, "").length !== 8}
          data-testid="button-search-cep"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Digite o CEP e clique na lupa para preencher o endereço automaticamente
      </p>
    </div>
  );
}

interface AddressFieldsProps {
  form: UseFormReturn<any>;
  showNumero?: boolean;
  showBairro?: boolean;
}

export function AddressFields({
  form,
  showNumero = true,
  showBairro = true,
}: AddressFieldsProps) {
  return (
    <>
      <div className={`grid ${showNumero ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço</FormLabel>
              <FormControl>
                <Input
                  placeholder="Logradouro"
                  {...field}
                  value={field.value || ""}
                  data-testid="input-address"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showNumero && (
          <FormField
            control={form.control}
            name="numero"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número</FormLabel>
                <FormControl>
                  <Input
                    placeholder="123"
                    {...field}
                    value={field.value || ""}
                    data-testid="input-numero"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <div className={`grid ${showBairro ? "grid-cols-3" : "grid-cols-2"} gap-4`}>
        {showBairro && (
          <FormField
            control={form.control}
            name="bairro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bairro</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Centro"
                    {...field}
                    value={field.value || ""}
                    data-testid="input-bairro"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cidade</FormLabel>
              <FormControl>
                <Input
                  placeholder="São Paulo"
                  {...field}
                  value={field.value || ""}
                  data-testid="input-city"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <FormControl>
                <Input
                  placeholder="SP"
                  {...field}
                  value={field.value || ""}
                  data-testid="input-state"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

interface DateTimeFieldsProps {
  form: UseFormReturn<any>;
  showMultiDay?: boolean;
}

export function DateTimeFields({
  form,
  showMultiDay = true,
}: DateTimeFieldsProps) {
  const isMultiDay = form.watch("isMultiDay");
  const endTimeManuallyEdited = useRef(false);

  const addOneHour = (time: string): string => {
    const [h, m] = time.split(":").map(Number);
    const totalMin = h * 60 + m + 60;
    const newH = Math.min(Math.floor(totalMin / 60), 23);
    const newM = totalMin % 60;
    return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
  };

  const handleStartTimeChange = (value: string, fieldOnChange: (...event: any[]) => void) => {
    fieldOnChange(value);
    if (!endTimeManuallyEdited.current && value) {
      const suggested = addOneHour(value);
      form.setValue("endTime", suggested, { shouldValidate: false });
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField
          control={form.control}
          name="scheduledDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isMultiDay ? "Data Início *" : "Data *"}</FormLabel>
              <FormControl>
                <Input type="date" {...field} data-testid="input-date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isMultiDay && (
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Fim *</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    value={field.value || ""}
                    data-testid="input-end-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-3 sm:contents">
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Início *</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    onChange={(e) => handleStartTimeChange(e.target.value, field.onChange)}
                    data-testid="input-start-time"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fim *</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    onChange={(e) => {
                      endTimeManuallyEdited.current = true;
                      field.onChange(e);
                    }}
                    data-testid="input-end-time"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {showMultiDay && (
        <FormField
          control={form.control}
          name="isMultiDay"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="checkbox-multi-day"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="cursor-pointer">
                  Atividade de múltiplos dias
                </FormLabel>
                <p className="text-xs text-muted-foreground">
                  Marque se a visita vai durar mais de um dia
                </p>
              </div>
            </FormItem>
          )}
        />
      )}
    </>
  );
}

interface DescriptionFieldProps {
  form: UseFormReturn<any>;
}

export function DescriptionField({ form }: DescriptionFieldProps) {
  return (
    <FormField
      control={form.control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Descrição (opcional)</FormLabel>
          <FormControl>
            <Textarea
              placeholder="Descreva os detalhes da atividade..."
              {...field}
              value={field.value || ""}
              data-testid="input-description"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
