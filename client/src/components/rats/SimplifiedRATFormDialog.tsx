import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import SignatureCanvas from "react-signature-canvas";
import html2pdf from "html2pdf.js";
import { RENNER_LOGO_BASE64 } from "@/lib/logo-base64";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Building2, 
  ClipboardList,
  Save,
  CheckCircle,
  Eye,
  Download,
  Camera,
  PenLine,
  X,
  Send,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Cloud
} from "lucide-react";
import type { Activity, Rat, Technician } from "@shared/schema";

interface PhotoItem {
  id: string;
  base64: string;
  description: string;
}

const simplifiedRatFormSchema = z.object({
  reportNumberManual: z.string().optional(),
  openingDate: z.string().optional(),
  clientNameEditable: z.string().optional(),
  contact: z.string().optional(),
  applicator: z.string().optional(),
  sector: z.string().optional(),
  obraName: z.string().optional(),
  segment: z.array(z.string()).default([]),
  activityPerformed: z.string().optional(),
  generalComments: z.string().optional(),
});

type SimplifiedRatFormData = z.infer<typeof simplifiedRatFormSchema>;

interface SimplifiedRATFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  existingRat?: Rat | null;
  onSuccess?: () => void;
}

const PhotoCardItem = memo(function PhotoCardItem({
  photo,
  onDescriptionChange,
  onRemove,
}: {
  photo: PhotoItem;
  onDescriptionChange: (id: string, description: string) => void;
  onRemove: (id: string) => void;
}) {
  const [localDescription, setLocalDescription] = useState(photo.description);

  useEffect(() => {
    setLocalDescription(photo.description);
  }, [photo.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalDescription(e.target.value);
    onDescriptionChange(photo.id, e.target.value);
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video">
        <img
          src={photo.base64}
          alt="Foto"
          className="w-full h-full object-cover"
        />
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={() => onRemove(photo.id)}
          data-testid={`button-remove-photo-${photo.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <CardContent className="p-2">
        <Input
          placeholder="Descrição da foto..."
          value={localDescription}
          onChange={handleChange}
          className="text-sm"
          data-testid={`input-photo-description-${photo.id}`}
        />
      </CardContent>
    </Card>
  );
});

const SEGMENTS = [
  { id: "powder", label: "Powder" },
  { id: "performance", label: "Performance" },
  { id: "protective", label: "Protective" },
  { id: "marine", label: "Marine" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pendente: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-200" },
  rascunho: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-200" },
  completa: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200" },
};

function generateSimplifiedRatHtml(
  rat: Rat,
  formData: SimplifiedRatFormData,
  photos: PhotoItem[],
  signature: string,
  signatureName: string,
  technician: Technician | null | undefined
): string {
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const isChecked = (arr: string[] | undefined, value: string) => {
    if (!arr) return false;
    return arr.some(v => v.toLowerCase() === value.toLowerCase());
  };

  const checkbox = (checked: boolean) => checked ? '☑' : '☐';
  const logoBase64 = RENNER_LOGO_BASE64;

  let photoGalleryHtml = '';
  if (photos.length > 0) {
    const photoItems = photos.filter(p => p.base64);
    const rows: PhotoItem[][] = [];
    for (let i = 0; i < photoItems.length; i += 2) {
      rows.push(photoItems.slice(i, i + 2));
    }
    photoGalleryHtml = rows.map(row => `
      <tr>
        ${row.map(photo => {
          const imgSrc = photo.base64.startsWith('data:') ? photo.base64 : `data:image/jpeg;base64,${photo.base64}`;
          return `<td style="width:50%; padding:6px; vertical-align:top; border:none; page-break-inside:avoid;">
            <div style="page-break-inside:avoid;">
              <img src="${imgSrc}" style="display:block; width:100%; max-height:280px; object-fit:contain; border:1px solid #ccc; border-radius:3px;" />
              ${photo.description ? `<p style="font-size:9pt; color:#333; margin:4px 0 0 0; text-align:center; word-wrap:break-word; overflow-wrap:break-word; word-break:normal;">${photo.description}</p>` : ''}
            </div>
          </td>`;
        }).join('')}
        ${row.length === 1 ? '<td style="width:50%; border:none;"></td>' : ''}
      </tr>`
    ).join('');
  }

  const techName = signatureName || technician?.name || 'Técnico Responsável';
  const sigSrc = signature
    ? (signature.startsWith('data:') ? signature : `data:image/png;base64,${signature}`)
    : '';

  const tdStyle = 'border: 1px solid #bbb; padding: 5px 8px; vertical-align: top; font-size: 9pt;';
  const sectionStyle = 'border: 1px solid #bbb; font-weight: bold; text-align: center; background-color: #f0f0f0; padding: 5px; font-size: 10pt;';
  const textSectionStyle = 'border: 1px solid #bbb; min-height: 80px; padding: 8px; white-space: pre-wrap; font-size: 9pt;';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Visita Simplificado - ${(rat as any).reportNumberManual || rat.reportNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: #000; background: #fff; }
    .page { max-width: 210mm; margin: 0 auto; padding: 10mm; background: #fff; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    .cb { margin-right: 20px; white-space: nowrap; }
    .photo-table { border-collapse: separate; border-spacing: 4px; width: 100%; }
    .sig-block { text-align: center; margin-top: 30px; }
    .sig-line { display: inline-block; border-top: 1px solid #000; min-width: 220px; padding-top: 4px; font-size: 9pt; margin-top: 6px; }
    .footer-block { text-align: center; margin-top: 18px; }
    .footer-ref { font-size: 7pt; color: #666; margin-top: 12px; padding-top: 5px; border-top: 1px solid #ccc; }
  </style>
</head>
<body>
  <div class="page">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
      <div style="background: #777; color: white; padding: 10px 25px; font-size: 13pt; font-weight: bold; border-radius: 3px;">RELATÓRIO DE VISITA SIMPLIFICADO</div>
      <img src="${logoBase64}" alt="Renner Coatings" style="height: 50px;" onerror="this.style.display='none'">
    </div>
    
    <table>
      <tr>
        <td style="${tdStyle} width:60%">Relatório nº: ${(rat as any).reportNumberManual || rat.reportNumber}</td>
        <td style="${tdStyle} width:40%">Data: ${formatDate((rat as any).openingDate || rat.openDate)}</td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="2" style="${sectionStyle}">DADOS CLIENTE</td></tr>
      <tr>
        <td style="${tdStyle} width:50%"><strong>Cliente:</strong> ${formData.clientNameEditable || rat.clientName || ''}</td>
        <td style="${tdStyle} width:50%"><strong>Contato:</strong> ${formData.contact || ''}</td>
      </tr>
      <tr>
        <td style="${tdStyle}"><strong>Aplicadora:</strong> ${formData.applicator || ''}</td>
        <td style="${tdStyle}"><strong>Setor:</strong> ${formData.sector || ''}</td>
      </tr>
      <tr>
        <td colspan="2" style="${tdStyle}"><strong>Obra:</strong> ${formData.obraName || ''}</td>
      </tr>
      <tr>
        <td colspan="2" style="${tdStyle}"><strong>Segmento:</strong>
          <span class="cb">${checkbox(isChecked(formData.segment, 'powder'))} Powder</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'performance'))} Performance</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'protective'))} Protective</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'marine'))} Marine</span>
        </td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="1" style="${sectionStyle}">RELATÓRIO DESCRITIVO</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>1- ATIVIDADE REALIZADA:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.activityPerformed || ''}</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>2- COMENTÁRIOS GERAIS:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.generalComments || ''}</td></tr>
    </table>
    
    ${photos.filter(p => p.base64).length > 0 ? `
    <div style="page-break-before: always;"></div>
    <table style="margin-bottom:8px;">
      <tr><td style="${sectionStyle}">RELATÓRIO FOTOGRÁFICO</td></tr>
    </table>
    <table class="photo-table">
      ${photoGalleryHtml}
    </table>
    ` : ''}
    
    <div style="page-break-inside: avoid; margin-top: 30px;">
      <div class="sig-block">
        ${sigSrc ? `<img src="${sigSrc}" style="max-width:240px; max-height:90px; display:block; margin:0 auto;" />` : ''}
        <div class="sig-line">${techName}</div>
      </div>
      <div class="footer-block">
        <p style="font-weight:bold; font-size:10pt; margin-bottom:6px;">Assistência Técnica</p>
        <img src="${logoBase64}" alt="Renner Coatings" style="height:38px; display:block; margin:0 auto 6px;" onerror="this.style.display='none'">
        <p style="font-size:8pt; line-height:1.5;">Renner Herrmann S.A.<br>Divisão Renner Coatings</p>
      </div>
      <div class="footer-ref">1.400 F4-Relatório de Assistência Técnica Simplificado</div>
    </div>
  </div>
</body>
</html>`;
}

export function SimplifiedRATFormDialog({
  open,
  onOpenChange,
  activity,
  existingRat,
  onSuccess,
}: SimplifiedRATFormDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dados");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [signature, setSignature] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const signatureRef = useRef<SignatureCanvas>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const { data: allRats = [] } = useQuery<Rat[]>({
    queryKey: ["/api/rats"],
    enabled: open && !existingRat && !!activity,
  });

  const lightExistingRat = existingRat || (activity ? [...allRats].filter((r) => r.activityId === activity.id).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] : null) || null;

  const { data: fullRatData, isLoading: isLoadingFullRat } = useQuery<Rat>({
    queryKey: ["/api/rats", lightExistingRat?.id],
    enabled: open && !!lightExistingRat?.id,
  });

  const resolvedExistingRat = fullRatData || lightExistingRat;

  const myTechnician = technicians.find((t) => t.userId === user?.id);

  const form = useForm<SimplifiedRatFormData>({
    resolver: zodResolver(simplifiedRatFormSchema),
    defaultValues: {
      reportNumberManual: "",
      openingDate: "",
      clientNameEditable: "",
      contact: "",
      applicator: "",
      sector: "",
      obraName: "",
      segment: [],
      activityPerformed: "",
      generalComments: "",
    },
  });

  useEffect(() => {
    if (open && resolvedExistingRat && resolvedExistingRat.formData !== null) {
      const formData = resolvedExistingRat.formData ? JSON.parse(resolvedExistingRat.formData) : {};
      form.reset({
        reportNumberManual: (resolvedExistingRat as any).reportNumberManual || "",
        openingDate: (resolvedExistingRat as any).openingDate 
          ? new Date((resolvedExistingRat as any).openingDate).toISOString().split("T")[0]
          : "",
        clientNameEditable: resolvedExistingRat.clientNameEditable || resolvedExistingRat.clientName || "",
        contact: formData.contact || "",
        applicator: formData.applicator || "",
        sector: formData.sector || "",
        obraName: formData.obraName || "",
        segment: formData.segment || [],
        activityPerformed: formData.activityPerformed || formData.objective || "",
        generalComments: formData.generalComments || formData.comments || "",
      });
      
      if (resolvedExistingRat.photoSections) {
        try {
          const sections = JSON.parse(resolvedExistingRat.photoSections);
          const allPhotos: PhotoItem[] = [];
          Object.values(sections).forEach((sectionPhotos: any) => {
            if (Array.isArray(sectionPhotos)) {
              allPhotos.push(...sectionPhotos);
            }
          });
          setPhotos(allPhotos);
        } catch (e) {
          setPhotos([]);
        }
      } else {
        setPhotos([]);
      }
      
      setSignature(resolvedExistingRat.technicianSignature || "");
      setSignatureName(resolvedExistingRat.technicianSignatureName || myTechnician?.name || "");
    } else if (open && !lightExistingRat && activity) {
      const activityDate = activity.scheduledDate 
        ? new Date(activity.scheduledDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      
      form.reset({
        reportNumberManual: "",
        openingDate: activityDate,
        clientNameEditable: activity.clientName || "",
        contact: "",
        applicator: "",
        sector: "",
        obraName: "",
        segment: [],
        activityPerformed: "",
        generalComments: "",
      });
      setPhotos([]);
      setSignature("");
      setSignatureName(myTechnician?.name || "");
    }
  }, [open, resolvedExistingRat, lightExistingRat, activity, form, myTechnician]);

  useEffect(() => {
    if (open) {
      setActiveTab("dados");
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/rats", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({ title: "RAT Simplificada criada com sucesso" });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar RAT",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/rats/${id}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      const isComplete = variables.data?.status === "completa";
      toast({ title: isComplete ? "RAT Simplificada concluída com sucesso" : "RAT Simplificada atualizada com sucesso" });
      onSuccess?.();
      if (isComplete) {
        onOpenChange(false);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar RAT",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isReadOnly = !!resolvedExistingRat?.sentAt;

  const autoSaveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/rats/${id}`, data);
    },
    onSuccess: () => {
      setLastAutoSave(new Date());
      setIsAutoSaving(false);
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
    },
    onError: () => {
      setIsAutoSaving(false);
    },
  });

  const performAutoSave = useCallback(() => {
    if (!resolvedExistingRat || isReadOnly) return;

    const formData = form.getValues();
    const photoSections = { section1: photos };
    const currentStatus = resolvedExistingRat.status || "pendente";

    const ratData: any = {
      clientNameEditable: formData.clientNameEditable,
      status: currentStatus === "pendente" ? "rascunho" : currentStatus,
      openingDate: formData.openingDate ? new Date(formData.openingDate + "T12:00:00").toISOString() : undefined,
      formData: JSON.stringify({
        contact: formData.contact,
        applicator: formData.applicator,
        sector: formData.sector,
        obraName: formData.obraName,
        segment: formData.segment,
        activityPerformed: formData.activityPerformed,
        generalComments: formData.generalComments,
      }),
      photoSections: JSON.stringify(photoSections),
      technicianSignature: signature || undefined,
      technicianSignatureName: signatureName || undefined,
      isSimplified: true,
    };

    setIsAutoSaving(true);
    autoSaveMutation.mutate({ id: resolvedExistingRat.id, data: ratData });
  }, [resolvedExistingRat, isReadOnly, form, photos, signature, signatureName, autoSaveMutation]);

  const triggerAutoSave = useCallback(() => {
    if (!resolvedExistingRat || isReadOnly || isInitialLoadRef.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);
  }, [resolvedExistingRat, isReadOnly, performAutoSave]);

  useEffect(() => {
    const subscription = form.watch(() => {
      triggerAutoSave();
    });
    return () => subscription.unsubscribe();
  }, [form, triggerAutoSave]);

  const photosJson = JSON.stringify(photos);
  useEffect(() => {
    triggerAutoSave();
  }, [photosJson, signature, signatureName]);

  useEffect(() => {
    if (open && resolvedExistingRat) {
      const timer = setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      isInitialLoadRef.current = true;
      setLastAutoSave(null);
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    }
  }, [open, resolvedExistingRat]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleSave = async (status: "rascunho" | "completa" = "rascunho") => {
    const formData = form.getValues();
    setIsSaving(true);

    try {
      const photoSections = { section1: photos };
      
      const ratData = {
        activityId: activity?.id || resolvedExistingRat?.activityId,
        reportNumberManual: formData.reportNumberManual || undefined,
        clientNameEditable: formData.clientNameEditable,
        status,
        openingDate: formData.openingDate ? new Date(formData.openingDate + "T12:00:00").toISOString() : undefined,
        formData: JSON.stringify({
          contact: formData.contact,
          applicator: formData.applicator,
          sector: formData.sector,
          obraName: formData.obraName,
          segment: formData.segment,
          activityPerformed: formData.activityPerformed,
          generalComments: formData.generalComments,
        }),
        photoSections: JSON.stringify(photoSections),
        technicianSignature: signature || undefined,
        technicianSignatureName: signatureName || undefined,
        isSimplified: true,
      };

      if (resolvedExistingRat) {
        await updateMutation.mutateAsync({ id: resolvedExistingRat.id, data: ratData });
      } else {
        await createMutation.mutateAsync(ratData);
      }
    } catch (error) {
      console.error("Erro ao salvar RAT:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!resolvedExistingRat) {
      toast({
        title: "Salve primeiro",
        description: "Por favor, salve a RAT antes de gerar o PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPdf(true);

    try {
      const formData = form.getValues();
      const html = generateSimplifiedRatHtml(
        resolvedExistingRat,
        formData,
        photos,
        signature,
        signatureName,
        myTechnician
      );

      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const opt = {
        margin: 0,
        filename: `RAT-Simplificada-${(resolvedExistingRat as any).reportNumberManual || resolvedExistingRat.reportNumber}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
      };

      await html2pdf().set(opt).from(container).save();
      document.body.removeChild(container);

      toast({ title: "PDF gerado com sucesso" });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setPhotos((prev) => [
          ...prev,
          { id: Date.now().toString() + Math.random(), base64, description: "" },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handlePhotoDescriptionChange = useCallback((id: string, description: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, description } : p))
    );
  }, []);

  const clearSignature = () => {
    signatureRef.current?.clear();
    setSignature("");
  };

  const saveSignature = () => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      setSignature(signatureRef.current.toDataURL());
      toast({ title: "Assinatura salva" });
    }
  };

  const currentStatus = resolvedExistingRat?.status || "pendente";
  const statusConfig = STATUS_COLORS[currentStatus] || STATUS_COLORS.pendente;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="text-muted-foreground/60 font-normal text-sm">Relatório de visita simplificada</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {isAutoSaving && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="indicator-auto-saving">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Salvando...</span>
                </div>
              )}
              {!isAutoSaving && lastAutoSave && resolvedExistingRat && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="indicator-auto-saved">
                  <Cloud className="h-3 w-3" />
                  <span className="hidden sm:inline">Salvo</span>
                </div>
              )}
              <Badge className={`${statusConfig.bg} ${statusConfig.text}`}>
                {currentStatus === "pendente" ? "Pendente" : 
                 currentStatus === "rascunho" ? "Rascunho" : "Completa"}
              </Badge>
            </div>
          </div>
          {activity && (
            <p className="text-sm text-muted-foreground">
              {activity.clientName} - {new Date(activity.scheduledDate).toLocaleDateString("pt-BR")}
            </p>
          )}
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-4 mt-2 shrink-0">
            <TabsTrigger value="dados" className="flex items-center gap-1">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Dados</span>
            </TabsTrigger>
            <TabsTrigger value="relatorio" className="flex items-center gap-1">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Relatório</span>
            </TabsTrigger>
            <TabsTrigger value="fotos" className="flex items-center gap-1">
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Fotos</span>
              {photos.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {photos.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="assinatura" className="flex items-center gap-1">
              <PenLine className="w-4 h-4" />
              <span className="hidden sm:inline">Assinatura</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            {lightExistingRat && isLoadingFullRat ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando dados...</span>
              </div>
            ) : (
            <Form {...form}>
              <form className="space-y-4 py-4">
                <TabsContent value="dados" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="reportNumberManual"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relatório nº</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: F2-001/26" {...field} data-testid="input-report-number" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="openingDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-date" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="clientNameEditable"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-client" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="contact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contato</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-contact" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="applicator"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aplicadora</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-applicator" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sector"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Setor</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-sector" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="obraName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Obra</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-obra" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="segment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Segmento</FormLabel>
                        <div className="flex flex-wrap gap-4">
                          {SEGMENTS.map((seg) => (
                            <div key={seg.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`segment-${seg.id}`}
                                checked={field.value?.includes(seg.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    field.onChange([...(field.value || []), seg.id]);
                                  } else {
                                    field.onChange((field.value || []).filter((v) => v !== seg.id));
                                  }
                                }}
                                data-testid={`checkbox-segment-${seg.id}`}
                              />
                              <label htmlFor={`segment-${seg.id}`} className="text-sm cursor-pointer">
                                {seg.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="relatorio" className="mt-0 space-y-4">
                  <FormField
                    control={form.control}
                    name="activityPerformed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>1- Atividade Realizada</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            className="min-h-[100px] sm:min-h-[150px]"
                            placeholder="Descreva a atividade realizada..."
                            data-testid="textarea-activity"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="generalComments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>2- Comentários Gerais</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            className="min-h-[100px] sm:min-h-[150px]"
                            placeholder="Adicione comentários gerais..."
                            data-testid="textarea-comments"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="fotos" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Fotos</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                      data-testid="button-add-photo"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Adicionar Foto
                    </Button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>

                  {photos.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma foto adicionada</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          Clique para adicionar
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {photos.map((photo) => (
                        <PhotoCardItem
                          key={photo.id}
                          photo={photo}
                          onDescriptionChange={handlePhotoDescriptionChange}
                          onRemove={handleRemovePhoto}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="assinatura" className="mt-0 space-y-4">
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <Input
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                      placeholder="Nome do técnico"
                      data-testid="input-signature-name"
                    />
                  </FormItem>

                  <div className="space-y-2">
                    <FormLabel>Assinatura</FormLabel>
                    <Card className="p-0 overflow-hidden">
                      <div className="bg-white">
                        <SignatureCanvas
                          ref={signatureRef}
                          canvasProps={{
                            className: "w-full h-40 border-b",
                            style: { touchAction: "none" },
                          }}
                          backgroundColor="white"
                        />
                      </div>
                      <div className="flex justify-end gap-2 p-2 bg-muted/30">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearSignature}
                          data-testid="button-clear-signature"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Limpar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={saveSignature}
                          data-testid="button-save-signature"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Salvar Assinatura
                        </Button>
                      </div>
                    </Card>

                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const base64 = ev.target?.result as string;
                                setSignature(base64);
                              };
                              reader.readAsDataURL(file);
                            }
                          };
                          input.click();
                        }}
                        data-testid="button-import-signature"
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Importar Assinatura
                      </Button>
                    </div>

                    {signature && (
                      <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-2">Assinatura salva:</p>
                        <img src={signature} alt="Assinatura" className="max-h-20 bg-white p-2 rounded border" />
                      </div>
                    )}
                  </div>
                </TabsContent>
              </form>
            </Form>
            )}
          </div>
        </Tabs>

        <div className="p-4 border-t shrink-0 flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave("rascunho")}
            disabled={isSaving}
            data-testid="button-save-draft"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar Rascunho
          </Button>
          {activeTab === "assinatura" && (
            <>
              <Button
                onClick={() => handleSave("completa")}
                disabled={isSaving}
                data-testid="button-complete"
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Concluir RAT
              </Button>
              {resolvedExistingRat && (
                <Button
                  variant="secondary"
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  data-testid="button-generate-pdf"
                >
                  {isGeneratingPdf ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  Gerar PDF
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
