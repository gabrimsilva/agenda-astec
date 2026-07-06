import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Clock, User } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface QuickScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicianId: string;
  technicianName: string;
  address?: string;
  numero?: string;
  bairro?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

const quickScheduleSchema = z.object({
  clientName: z.string().min(1, "Digite o nome do local/cliente"),
  clientId: z.string().optional(), // Cliente é opcional neste fluxo
  activityTypeId: z.string().min(1, "Selecione o tipo de atividade"),
  date: z.string().min(1, "Selecione a data"),
  startTime: z.string().min(1, "Selecione o horário de início"),
  endTime: z.string().min(1, "Selecione o horário de término"),
  description: z.string().optional(),
});

type QuickScheduleForm = z.infer<typeof quickScheduleSchema>;

export function QuickScheduleDialog({
  open,
  onOpenChange,
  technicianId,
  technicianName,
  address,
  numero,
  bairro,
  city,
  state,
  postcode,
  country,
  latitude,
  longitude,
}: QuickScheduleDialogProps) {
  const { toast } = useToast();

  // Fetch activity types
  const { data: activityTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/activity-types"],
    enabled: open,
  });

  // Form setup
  const form = useForm<QuickScheduleForm>({
    resolver: zodResolver(quickScheduleSchema),
    defaultValues: {
      clientName: "",
      clientId: "",
      activityTypeId: "",
      date: new Date().toISOString().split("T")[0], // Today's date
      startTime: "09:00",
      endTime: "10:00",
      description: "",
    },
  });

  // Create activity mutation
  const createActivityMutation = useMutation({
    mutationFn: async (data: QuickScheduleForm) => {
      // Combine date and start time to create full timestamp ISO string (prevent timezone issues)
      const scheduledDateTime = `${data.date}T${data.startTime}:00`;
      
      // Use searched location address components (always from geocoding in this flow)
      const payload = {
        technicianId,
        clientId: data.clientId || null, // Can be null if no client selected
        clientName: data.clientName, // Use the manually entered name
        activityTypeId: data.activityTypeId,
        scheduledDate: scheduledDateTime,
        startTime: data.startTime,
        endTime: data.endTime,
        description: data.description || "",
        // Always use the searched location address from geocoding
        address: address || "",
        numero: numero || "",
        bairro: bairro || "",
        city: city || "",
        state: state || "",
        country: country || "Brasil",
        status: "planejado",
      };

      return apiRequest("POST", "/api/activities", payload);
    },
    onSuccess: () => {
      toast({
        title: "Atividade agendada!",
        description: `Visita agendada para ${technicianName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao agendar",
        description: error.message || "Ocorreu um erro ao criar a atividade.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: QuickScheduleForm) => {
    createActivityMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[550px] max-h-[90vh] overflow-hidden flex flex-col p-0" data-testid="dialog-quick-schedule">
        <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <DialogTitle className="text-base">Agendar Visita</DialogTitle>
          <DialogDescription className="text-xs">
            Agendar nova atividade para <strong>{technicianName}</strong>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 space-y-3">
              {/* Technician (read-only display) */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Técnico</p>
                  <p className="text-xs text-muted-foreground truncate">{technicianName}</p>
                </div>
              </div>

              {/* Address (read-only display) */}
              {(address || city) && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-muted">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium mb-0.5">Endereço pesquisado</p>
                    <div className="text-[11px] text-muted-foreground space-y-0">
                      {address && (
                        <p className="truncate">
                          {address}{numero ? `, ${numero}` : ""}
                        </p>
                      )}
                      {(bairro || city || state) && (
                        <p className="truncate">
                          {[bairro, city, state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {postcode && <p>CEP: {postcode}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Client/Location Name */}
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nome do Local/Cliente</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Shopping Palladium, Loja ABC, etc."
                        className="h-8 text-sm"
                        data-testid="input-client-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Activity type selection */}
              <FormField
                control={form.control}
                name="activityTypeId"
                render={({ field }) => {
                  const selectedType = activityTypes.find(t => t.id === field.value);
                  return (
                    <FormItem>
                      <FormLabel className="text-xs">Tipo de Atividade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-sm" data-testid="select-activity-type">
                            <SelectValue placeholder="Selecione o tipo">
                              {selectedType && (
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: selectedType.color }}
                                  />
                                  <span className="text-sm">{selectedType.name}</span>
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-w-[calc(100vw-2rem)]">
                          {activityTypes.filter((t: any) => t.isActive !== false).map((type: any) => (
                            <SelectItem key={type.id} value={type.id} className="whitespace-normal">
                              <div className="flex items-start gap-2">
                                <div
                                  className="h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1"
                                  style={{ backgroundColor: type.color }}
                                />
                                <span className="text-sm text-left">{type.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Date */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Data</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="date"
                          className="pl-8 h-8 text-sm"
                          {...field}
                          data-testid="input-date"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Início</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            type="time"
                            className="pl-8 h-8 text-sm"
                            {...field}
                            data-testid="input-start-time"
                          />
                        </div>
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
                      <FormLabel className="text-xs">Término</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            type="time"
                            className="pl-8 h-8 text-sm"
                            {...field}
                            data-testid="input-end-time"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Description (optional) */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Descrição (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Detalhes adicionais sobre a visita"
                        className="min-h-[60px] text-sm resize-none"
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="px-4 py-3 border-t flex-shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={createActivityMutation.isPending}
                data-testid="button-cancel-schedule"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createActivityMutation.isPending}
                data-testid="button-confirm-schedule"
              >
                {createActivityMutation.isPending ? "Agendando..." : "Agendar Visita"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
