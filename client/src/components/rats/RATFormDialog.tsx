import { useState, useEffect, useRef, useCallback } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Building2, 
  Layers, 
  Package, 
  Paintbrush, 
  ClipboardList,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  Check,
  Eye,
  Download,
  Camera,
  PenLine,
  X,
  Send,
  Image as ImageIcon,
  Loader2,
  CloudOff,
  Cloud
} from "lucide-react";
import type { Activity, Rat, Technician } from "@shared/schema";

// Component categories
const COMPONENT_CATEGORIES = [
  { id: "componente_a", label: "Componente A" },
  { id: "componente_b", label: "Componente B" },
  { id: "componente_c", label: "Componente C" },
  { id: "diluente", label: "Diluente" },
  { id: "powder", label: "Powder" },
];

// Photo section type
interface PhotoItem {
  id: string;
  base64: string;
  description: string;
}

interface PhotoSections {
  section1: PhotoItem[];
  section2: PhotoItem[];
  section3: PhotoItem[];
  section4: PhotoItem[];
  section5: PhotoItem[];
  section6: PhotoItem[];
}

const ratFormSchema = z.object({
  // Header fields
  reportNumberManual: z.string().optional(),
  openingDate: z.string().optional(),
  closingDate: z.string().optional(),
  clientNameEditable: z.string().optional(),
  
  serviceType: z.array(z.string()).default([]),
  applicator: z.string().optional(),
  contact: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  sector: z.string().optional(),
  obraName: z.string().optional(),
  projectType: z.enum(["nova", "manutencao", ""]).optional(),
  segment: z.array(z.string()).default([]),
  
  // Surface fields
  substrate: z.string().optional(),
  initialGrade: z.string().optional(),
  surfacePrep: z.string().optional(),
  abrasiveType: z.string().optional(),
  roughness: z.string().optional(),
  aggressiveness: z.string().optional(),
  surfaceMaintenanceGrade: z.union([z.string(), z.number(), z.null()]).transform((val) => {
    if (val === null) return null;
    if (typeof val === 'string' && val !== '') return parseInt(val, 10);
    if (typeof val === 'number') return val;
    return null;
  }).optional(),
  
  product: z.object({
    description: z.string().optional(),
    color: z.string().optional(),
  }).optional(),
  components: z.array(z.object({
    code: z.string().optional(),
    batch: z.string().optional(),
    manufactureDate: z.string().optional(),
    expiryDate: z.string().optional(),
    category: z.string().optional(),
    technicalBulletin: z.string().optional(),
    recommendedThickness: z.string().optional(),
    complements: z.string().optional(),
  })).default([]),
  
  application: z.object({
    viscosity: z.string().optional(),
    totalThickness: z.string().optional(),
    primer: z.string().optional(),
    intermediate: z.string().optional(),
    finish: z.string().optional(),
    temperature: z.string().optional(),
    humidity: z.string().optional(),
    equipment: z.string().optional(),
    method: z.string().optional(),
    conditions: z.string().optional(),
  }).optional(),
  applicationNote: z.string().optional(),
  
  objective: z.string().optional(),
  participants: z.string().optional(),
  activitiesPerformed: z.string().optional(),
  comments: z.string().optional(),
  conclusion: z.string().optional(),
  referenceDocuments: z.string().optional(),
});

type RatFormData = z.infer<typeof ratFormSchema>;

interface RATFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  existingRat?: Rat | null;
  onSuccess?: () => void;
}

const SERVICE_TYPES = [
  { id: "exigencia", label: "Exigência" },
  { id: "corretiva", label: "Corretiva" },
  { id: "preventiva", label: "Preventiva" },
  { id: "teste", label: "Teste" },
  { id: "rc", label: "RC" },
  { id: "outros", label: "Outros" },
];

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

interface GenerateRatHtmlParams {
  rat: Rat;
  formData: RatFormData;
  components: Array<{ code: string; batch: string; manufactureDate: string; expiryDate: string; category: string; technicalBulletin: string; recommendedThickness: string; complements: string; }>;
  photoSections: PhotoSections;
  signature: string;
  signatureName: string;
  technician: Technician | null | undefined;
}

function generateRatHtmlLocal({ rat, formData, components, photoSections, signature, signatureName, technician }: GenerateRatHtmlParams): string {
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const isChecked = (arr: string[] | undefined, value: string) => {
    if (!arr) return false;
    return arr.some(v => v.toLowerCase() === value.toLowerCase());
  };

  const checkbox = (checked: boolean) => checked ? '☑' : '☐';
  const naValue = (val: string | undefined | null) => val || '<span style="color:#c00">N/A</span>';

  const logoBase64 = RENNER_LOGO_BASE64;

  const categoryLabels: Record<string, string> = {
    'componente_a': 'Componente A',
    'componente_b': 'Componente B', 
    'componente_c': 'Componente C',
    'A': 'Componente A',
    'B': 'Componente B', 
    'C': 'Componente C',
    'Componente A': 'Componente A',
    'Componente B': 'Componente B',
    'Componente C': 'Componente C',
    'diluente': 'Diluente',
    'Diluente': 'Diluente',
    'powder': 'Powder',
    'Powder': 'Powder'
  };

  const cellStyle = 'border: 1px solid #000; padding: 4px 6px; vertical-align: top; font-size: 9pt;';
  
  let componentRowsHtml = '';
  for (const comp of components) {
    if (!comp.code && !comp.batch) continue;
    const categoryLabel = categoryLabels[comp.category] || comp.category || 'Componente';
    componentRowsHtml += '<tr><td colspan="3" style="' + cellStyle + '"><strong>' + categoryLabel + ':</strong> ' + (comp.code || '') + '</td></tr>' +
      '<tr><td style="' + cellStyle + '">Lote: ' + (comp.batch || '') + '</td><td style="' + cellStyle + '">Fabricação: ' + (comp.manufactureDate || '') + '</td><td style="' + cellStyle + '">Validade: ' + (comp.expiryDate || '') + '</td></tr>';
    
    const thicknessLabel = (comp.category === 'diluente' || comp.category === 'Diluente') ? 'Diluição Recomendada' : 'Espessura Recomendada';
    if (comp.technicalBulletin || comp.recommendedThickness) {
      componentRowsHtml += '<tr><td style="' + cellStyle + '">Cód. Boletim Técnico: ' + (comp.technicalBulletin || naValue(null)) + '</td><td colspan="2" style="' + cellStyle + '">' + thicknessLabel + ': ' + (comp.recommendedThickness || naValue(null)) + '</td></tr>';
    }
    if (comp.complements) {
      componentRowsHtml += '<tr><td colspan="3" style="' + cellStyle + '">Complementos: ' + comp.complements + '</td></tr>';
    }
  }

  const sectionLabels: Record<string, string> = {
    section1: 'Superfície/Substrato',
    section2: 'Preparação',
    section3: 'Aplicação',
    section4: 'Resultado Final',
    section5: 'Defeitos/Problemas',
    section6: 'Outros'
  };

  let photoGalleryHtml = '';
  for (const [sectionKey, photos] of Object.entries(photoSections)) {
    if (Array.isArray(photos) && photos.length > 0) {
      const sectionTitle = sectionLabels[sectionKey] || sectionKey;
      let sectionHasPhotos = false;
      let sectionPhotosHtml = '';
      
      for (const photo of photos) {
        const photoData = photo?.base64;
        if (photo && photoData) {
          sectionHasPhotos = true;
          const imgSrc = photoData.startsWith('data:') ? photoData : `data:image/jpeg;base64,${photoData}`;
          sectionPhotosHtml += `<div style="text-align: center; margin-bottom: 10px; overflow: hidden;">
            <img src="${imgSrc}" style="display: block; margin: 0 auto; max-width: 100%; max-height: 400px; width: auto; height: auto; border: 1px solid #ccc; border-radius: 4px; object-fit: contain;" />
            ${photo.description ? `<p style="font-size: 10pt; color: #333; margin: 2px 0 0 0; font-weight: 500; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; max-width: 100%;">${photo.description}</p>` : ''}
          </div>`;
        }
      }
      
      if (sectionHasPhotos) {
        photoGalleryHtml += `<div style="margin-bottom: 6px;">
          <h4 style="font-size: 12pt; margin-bottom: 4px; color: #000; font-weight: bold;">${sectionTitle}</h4>
            ${sectionPhotosHtml}
        </div>`;
      }
    }
  }

  const techName = signatureName || technician?.name || 'Técnico Responsável';
  let signatureHtml = `<div class="signature-line">${techName}</div>`;
  if (signature) {
    const sigSrc = signature.startsWith('data:') ? signature : `data:image/png;base64,${signature}`;
    signatureHtml = `<div style="text-align: center; margin-top: 40px;">
      <div style="display: inline-block; text-align: center;">
        <img src="${sigSrc}" style="max-width: 280px; max-height: 100px; display: block; margin: 0 auto;" />
        <div style="border-top: 1px solid #000; width: 280px; margin: 5px auto 0; padding-top: 5px; font-size: 9pt;">
          ${techName}
        </div>
      </div>
    </div>`;
  }

  const application = formData.application || {};
  const product = formData.product || {};

  const tdStyle = 'border: 1px solid #000; padding: 4px 6px; vertical-align: top; font-size: 9pt;';
  const sectionStyle = 'border: 1px solid #000; font-weight: bold; text-align: center; background-color: #f0f0f0; padding: 5px; font-size: 10pt;';
  const subsectionStyle = 'border: 1px solid #000; font-weight: bold; text-align: center; background-color: #d9d9d9; padding: 4px; font-size: 9pt;';
  const textSectionStyle = 'border: 1px solid #000; min-height: 55px; padding: 5px; white-space: pre-wrap; font-size: 9pt;';
  const legendStyle = 'border: 1px solid #000; text-align: center; background-color: #f5f5f5; font-size: 8pt; padding: 3px;';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAT - ${(rat as any).reportNumberManual || rat.reportNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: #000; background: #fff; }
    .page { max-width: 210mm; margin: 0 auto; padding: 8mm; background: #fff; }
    .page-break { page-break-before: always; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 3px; }
    .cb { margin-right: 20px; white-space: nowrap; }
    .signature-line { border-top: 1px solid #000; width: 200px; margin: 40px auto 5px; text-align: center; padding-top: 5px; font-size: 9pt; }
    .company-footer { text-align: center; margin-top: 50px; padding: 20px; }
    .company-footer .title { font-weight: bold; font-size: 11pt; margin-bottom: 15px; }
    .company-footer .logo-small { height: 40px; margin: 10px 0; }
    .company-footer .info { font-size: 9pt; line-height: 1.6; }
    .company-footer a { color: #0066cc; text-decoration: underline; }
    .doc-footer { font-size: 7pt; color: #666; margin-top: 15px; padding-top: 5px; border-top: 1px solid #ccc; }
  </style>
</head>
<body>
  <div class="page">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div style="background: #777; color: white; padding: 10px 25px; font-size: 13pt; font-weight: bold; border-radius: 3px;">RELATÓRIO DE ASSISTÊNCIA TÉCNICA</div>
      <img src="${logoBase64}" alt="Renner Coatings" style="height: 50px;" onerror="this.style.display='none'">
    </div>
    
    <table>
      <tr>
        <td style="${tdStyle} width:50%">Relatório nº: ${(rat as any).reportNumberManual || rat.reportNumber}</td>
        <td style="${tdStyle} width:50%">Data abertura: ${formatDate((rat as any).openingDate || rat.openDate)}</td>
      </tr>
      <tr>
        <td colspan="2" style="${tdStyle} text-align:center; padding: 6px;">
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'exigencia'))} Exigência</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'corretiva'))} Corretiva</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'preventiva'))} Preventiva</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'teste'))} Teste</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'rc'))} RC</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'outros'))} Outros</span>
        </td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="4" style="${sectionStyle}">DADOS CLIENTE</td></tr>
      <tr>
        <td style="${tdStyle} width:15%">Cliente:</td>
        <td style="${tdStyle} width:35%">${rat.clientName || ''}</td>
        <td style="${tdStyle} width:15%">Aplicadora:</td>
        <td style="${tdStyle} width:35%">${formData.applicator || ''}</td>
      </tr>
      <tr>
        <td style="${tdStyle}">Obra:</td>
        <td style="${tdStyle}">${formData.obraName || ''}</td>
        <td style="${tdStyle}">Tipo de Obra:</td>
        <td style="${tdStyle}"><span class="cb">${checkbox(formData.projectType === 'manutencao')} Manutenção</span> <span class="cb">${checkbox(formData.projectType === 'nova')} Nova</span></td>
      </tr>
      <tr>
        <td style="${tdStyle}">Contato:</td>
        <td style="${tdStyle}">${formData.contact || ''}</td>
        <td style="${tdStyle}">E-mail:</td>
        <td style="${tdStyle}">${formData.email || ''}</td>
      </tr>
      <tr>
        <td style="${tdStyle}">Setor:</td>
        <td style="${tdStyle}">${formData.sector || ''}</td>
        <td style="${tdStyle}">Data de fechamento:</td>
        <td style="${tdStyle}">${formatDate((rat as any).closingDate || rat.closeDate)}</td>
      </tr>
      <tr>
        <td style="${tdStyle}">Segmento:</td>
        <td colspan="3" style="${tdStyle}">
          <span class="cb">${checkbox(isChecked(formData.segment, 'powder'))} Powder</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'performance'))} Performance</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'protective'))} Protective</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'marine'))} Marine</span>
        </td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="3" style="${sectionStyle}">DADOS TÉCNICOS</td></tr>
      <tr><td colspan="3" style="${subsectionStyle}">Superfície</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Substrato: ${formData.substrate || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Agressividade a que o revestimento / pintura será submetido: ${formData.aggressiveness || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Grau inicial da superfície: ${formData.initialGrade || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Manutenção (ASTM D610) 0 a 10: ${(rat as any).surfaceMaintenanceGrade != null ? `Grau ${(rat as any).surfaceMaintenanceGrade}` : (formData.surfaceMaintenanceGrade != null ? `Grau ${formData.surfaceMaintenanceGrade}` : 'Não Aplicável')}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Tipo de preparo de superfície: ${formData.surfacePrep || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Tipo de abrasivo: ${formData.abrasiveType || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Rugosidade: ${formData.roughness || ''}</td></tr>
      
      <tr><td colspan="3" style="${subsectionStyle}">Produto</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Produto / Descrição: ${product.description || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Cor: ${product.color || ''}</td></tr>
      ${componentRowsHtml}
    </table>
    
    <div class="doc-footer">1.400 F2 - Relatório de Assistência Técnica rev. 06 de 12/2025</div>
  </div>
  
  <div class="page page-break">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div style="background: #777; color: white; padding: 10px 25px; font-size: 13pt; font-weight: bold; border-radius: 3px;">RELATÓRIO DE ASSISTÊNCIA TÉCNICA</div>
      <img src="${logoBase64}" alt="Renner Coatings" style="height: 50px;" onerror="this.style.display='none'">
    </div>
    
    <table>
      <tr><td colspan="3" style="${subsectionStyle}">Características de aplicação</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Viscosidade de trabalho (s) /Diluição (%): ${application.viscosity || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Espessura seca total (E.F.S µm): ${application.totalThickness || ''}</td></tr>
      <tr>
        <td style="${tdStyle}">Primer: ${application.primer || ''}</td>
        <td style="${tdStyle}">Intermediário: ${application.intermediate || naValue(null)}</td>
        <td style="${tdStyle}">Acabamento: ${application.finish || ''}</td>
      </tr>
      <tr><td colspan="3" style="${tdStyle}">Temperatura (ºC): ${application.temperature || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">URA (%): ${application.humidity || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Superfície Aplicada/Peça: ${application.equipment || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Método de Aplicação: ${application.method || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Condições de aplicação: ${application.conditions || ''}</td></tr>
      <tr><td colspan="3" style="${tdStyle}">Observações Adicionais: ${(rat as any).applicationNote || formData.applicationNote || ''}</td></tr>
      <tr>
        <td colspan="3" style="${legendStyle} text-align:center;"><strong>Legenda</strong></td>
      </tr>
      <tr>
        <td style="${legendStyle}">N/A: Não Aplicável</td>
        <td style="${legendStyle}">FAB: Fabricação</td>
        <td style="${legendStyle}">VAL.: Validade</td>
      </tr>
    </table>
    
    <table>
      <tr><td style="${subsectionStyle}">Produto e informações técnicas:</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>1-OBJETIVO:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.objective || ''}</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>2- PARTICIPANTES:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.participants || ''}</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>3-ATIVIDADES REALIZADAS:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.activitiesPerformed || ''}</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>4- COMENTÁRIOS:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.comments || ''}</td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>5 – CONCLUSÃO:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.conclusion || ''}</td></tr>
    </table>
    
    ${photoGalleryHtml ? `<div style="page-break-before: always;"></div>` : ''}
    <table>
      <tr><td style="${tdStyle}"><strong>6 - RELATÓRIO FOTOGRÁFICO:</strong></td></tr>
      <tr><td style="${textSectionStyle}">
        ${photoGalleryHtml || '<em>Nenhuma foto anexada</em>'}
      </td></tr>
    </table>
    
    <table>
      <tr><td style="${tdStyle}"><strong>7 – DOCUMENTOS DE REFERÊNCIA:</strong></td></tr>
      <tr><td style="${textSectionStyle}">${formData.referenceDocuments || 'N/A'}</td></tr>
    </table>
    
    <div class="doc-footer">1.400 F2 - Relatório de Assistência Técnica rev. 06 de 12/2025</div>
  </div>
  
  <div class="page page-break">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div style="background: #777; color: white; padding: 10px 25px; font-size: 13pt; font-weight: bold; border-radius: 3px;">RELATÓRIO DE ASSISTÊNCIA TÉCNICA</div>
      <img src="${logoBase64}" alt="Renner Coatings" style="height: 50px;" onerror="this.style.display='none'">
    </div>
    
    ${signatureHtml}
    
    <div class="company-footer">
      <div class="title">Assistência Técnica</div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo-small" onerror="this.style.display='none'">
      <div class="info">
        <strong>Renner Herrmann S.A.</strong><br>
        Divisão Renner Coatings<br>
        Av. Juscelino Kubitschek de Oliveira, 12.453 - CIC<br>
        81.170-300 – Curitiba – PR – Brasil<br>
        <a href="https://www.rennercoatings.com">www.rennercoatings.com</a><br>
        <a href="https://www.renner.com.br">www.renner.com.br</a>
      </div>
    </div>
    
    <div class="doc-footer">1.400 F2 - Relatório de Assistência Técnica rev. 06 de 12/2025</div>
  </div>
</body>
</html>`;
}

export function RATFormDialog({ 
  open, 
  onOpenChange, 
  activity, 
  existingRat, 
  onSuccess 
}: RATFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("header");
  const [components, setComponents] = useState<Array<{ 
    code: string; 
    batch: string; 
    manufactureDate: string; 
    expiryDate: string;
    category: string;
    technicalBulletin: string;
    recommendedThickness: string;
    complements: string;
  }>>([]);
  
  // Signature state
  const signatureRef = useRef<SignatureCanvas>(null);
  const [signature, setSignature] = useState<string>("");
  const [signatureName, setSignatureName] = useState<string>("");
  
  // Photo sections state (6 sections as per spec)
  const [photoSections, setPhotoSections] = useState<PhotoSections>({
    section1: [],
    section2: [],
    section3: [],
    section4: [],
    section5: [],
    section6: [],
  });
  
  // Auto-save state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  const lastResetRatIdRef = useRef<string | null>(null);

  // Technician data for signature name
  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const { data: fullRatData, isLoading: isLoadingFullRat } = useQuery<Rat>({
    queryKey: ["/api/rats", existingRat?.id],
    enabled: open && !!existingRat?.id,
  });

  const resolvedRat = fullRatData || existingRat;
  
  const myTechnician = technicians.find((t) => t.userId === user?.id);

  const form = useForm<RatFormData>({
    resolver: zodResolver(ratFormSchema),
    defaultValues: {
      serviceType: [],
      segment: [],
      components: [],
      product: {},
      application: {},
    },
  });

  useEffect(() => {
    if (resolvedRat?.formData) {
      if (lastResetRatIdRef.current === resolvedRat.id) return;
      lastResetRatIdRef.current = resolvedRat.id;
      try {
        const formData = typeof resolvedRat.formData === 'string' 
          ? JSON.parse(resolvedRat.formData) 
          : resolvedRat.formData;
        
        form.reset({
          ...formData,
          reportNumberManual: (resolvedRat as any).reportNumberManual || formData.reportNumberManual || "",
          openingDate: (resolvedRat as any).openingDate 
            ? new Date((resolvedRat as any).openingDate).toISOString().split('T')[0]
            : formData.openingDate || (activity?.scheduledDate ? new Date(activity.scheduledDate).toISOString().split('T')[0] : ""),
          closingDate: (resolvedRat as any).closingDate 
            ? new Date((resolvedRat as any).closingDate).toISOString().split('T')[0]
            : formData.closingDate || "",
          clientNameEditable: (resolvedRat as any).clientNameEditable || formData.clientNameEditable || resolvedRat.clientName || "",
          projectType: (resolvedRat as any).projectType || formData.projectType || "",
          surfaceMaintenanceGrade: (resolvedRat as any).surfaceMaintenanceGrade ?? formData.surfaceMaintenanceGrade,
          applicationNote: (resolvedRat as any).applicationNote || formData.applicationNote || "",
        });
        
        if (formData.components) {
          setComponents(formData.components);
        }
        
        if ((resolvedRat as any).technicianSignature) {
          setSignature((resolvedRat as any).technicianSignature);
        }
        if ((resolvedRat as any).technicianSignatureName) {
          setSignatureName((resolvedRat as any).technicianSignatureName);
        }
        
        if ((resolvedRat as any).photoSections) {
          try {
            const rawSections = typeof (resolvedRat as any).photoSections === 'string'
              ? JSON.parse((resolvedRat as any).photoSections)
              : (resolvedRat as any).photoSections;
            
            const normalizedSections: PhotoSections = {
              section1: rawSections.section1 || rawSections.atividades || [],
              section2: rawSections.section2 || rawSections.comentario || [],
              section3: rawSections.section3 || rawSections.conclusao || [],
              section4: rawSections.section4 || rawSections.fotografico || [],
              section5: rawSections.section5 || [],
              section6: rawSections.section6 || [],
            };
            setPhotoSections(normalizedSections);
          } catch (e) {
            console.error("Error parsing photo sections:", e);
            setPhotoSections({
              section1: [],
              section2: [],
              section3: [],
              section4: [],
              section5: [],
              section6: [],
            });
          }
        } else {
          setPhotoSections({
            section1: [],
            section2: [],
            section3: [],
            section4: [],
            section5: [],
            section6: [],
          });
        }
      } catch (e) {
        console.error("Error parsing RAT formData:", e);
      }
    } else if (!existingRat) {
      form.reset({
        serviceType: [],
        segment: [],
        components: [],
        product: {},
        application: {},
        clientNameEditable: activity?.clientName || "",
        openingDate: activity?.scheduledDate ? new Date(activity.scheduledDate).toISOString().split('T')[0] : "",
      });
      setComponents([]);
      setSignature("");
      setSignatureName(myTechnician?.name || user?.name || "");
      setPhotoSections({
        section1: [],
        section2: [],
        section3: [],
        section4: [],
        section5: [],
        section6: [],
      });
    }
  }, [resolvedRat, existingRat, form, activity, myTechnician, user]);

  const createMutation = useMutation({
    mutationFn: async (data: { activityId: string; technicianId: string; formData: string; status: string }) => {
      return apiRequest("POST", "/api/rats", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({ title: "RAT criada com sucesso!", duration: 3000 });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao criar RAT", 
        description: error.message,
        variant: "destructive",
        duration: 5000
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Rat> }) => {
      return apiRequest("PUT", `/api/rats/${id}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({ title: "RAT atualizada com sucesso!", duration: 3000 });
      onSuccess?.();
      // Close dialog when completing (status = "completa")
      if (variables.data.status === "completa") {
        onOpenChange(false);
      }
    },
    onError: (error: any) => {
      console.error("Error updating RAT:", error);
      toast({ 
        title: "Erro ao atualizar RAT", 
        description: error.message || "Erro desconhecido",
        variant: "destructive",
        duration: 5000
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/rats/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({ title: "RAT marcada como completa!", duration: 3000 });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao completar RAT", 
        description: error.message,
        variant: "destructive",
        duration: 5000
      });
    },
  });

  const currentStatus = existingRat?.status || "pendente";
  const statusStyle = STATUS_COLORS[currentStatus] || STATUS_COLORS.pendente;
  const isReadOnly = !!existingRat?.sentAt; // Read-only when sent

  // Auto-save mutation (silent, no toast on success)
  const autoSaveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Rat> }) => {
      return apiRequest("PUT", `/api/rats/${id}`, data);
    },
    onSuccess: () => {
      setLastAutoSave(new Date());
      setIsAutoSaving(false);
      // Invalidate cache so reopening the form loads fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
    },
    onError: () => {
      setIsAutoSaving(false);
    },
  });

  // Auto-save function
  const performAutoSave = useCallback(() => {
    if (!existingRat || isReadOnly) return;
    
    const formValues = form.getValues();
    formValues.components = components;
    
    const formDataString = JSON.stringify(formValues);
    
    const ratData: any = {
      formData: formDataString,
      status: existingRat.status === "pendente" ? "rascunho" : existingRat.status,
      reportNumberManual: formValues.reportNumberManual || undefined,
      openingDate: formValues.openingDate ? new Date(formValues.openingDate) : undefined,
      clientNameEditable: formValues.clientNameEditable || undefined,
      projectType: formValues.projectType || undefined,
      closingDate: formValues.closingDate ? new Date(formValues.closingDate) : undefined,
      surfaceMaintenanceGrade: formValues.surfaceMaintenanceGrade ?? undefined,
      applicationNote: formValues.applicationNote || undefined,
      technicianSignature: signature || undefined,
      technicianSignatureName: signatureName || undefined,
      photoSections: JSON.stringify(photoSections),
    };
    
    setIsAutoSaving(true);
    autoSaveMutation.mutate({
      id: existingRat.id,
      data: ratData,
    });
  }, [existingRat, form, components, signature, signatureName, photoSections, autoSaveMutation]);

  // Debounced auto-save effect
  const triggerAutoSave = useCallback(() => {
    if (!existingRat || isReadOnly || isInitialLoadRef.current) return;
    
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Set new timer (3 seconds debounce)
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);
  }, [existingRat, currentStatus, performAutoSave]);

  // Watch form changes via subscription callback (not reactive state)
  useEffect(() => {
    const subscription = form.watch(() => {
      triggerAutoSave();
    });
    return () => subscription.unsubscribe();
  }, [form, triggerAutoSave]);
  
  // Watch components, signature, signatureName, photoSections changes
  const componentsJson = JSON.stringify(components);
  const photoSectionsJson = JSON.stringify(photoSections);
  
  useEffect(() => {
    triggerAutoSave();
  }, [componentsJson, signature, signatureName, photoSectionsJson]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Reset initial load flag when dialog opens with new data
  useEffect(() => {
    if (open) {
      isInitialLoadRef.current = true;
      lastResetRatIdRef.current = null;
      const timeout = setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [open, existingRat?.id]);

  const handleSave = (status: "rascunho" | "completa") => {
    const formValues = form.getValues();
    formValues.components = components;
    
    const formDataString = JSON.stringify(formValues);
    
    // Build the full data object with new fields
    const ratData: any = {
      formData: formDataString,
      status: status,
      reportNumberManual: formValues.reportNumberManual || undefined,
      openingDate: formValues.openingDate ? new Date(formValues.openingDate) : undefined,
      clientNameEditable: formValues.clientNameEditable || undefined,
      projectType: formValues.projectType || undefined,
      closingDate: formValues.closingDate ? new Date(formValues.closingDate) : undefined,
      surfaceMaintenanceGrade: formValues.surfaceMaintenanceGrade ?? undefined,
      applicationNote: formValues.applicationNote || undefined,
      technicianSignature: signature || undefined,
      technicianSignatureName: signatureName || undefined,
      photoSections: JSON.stringify(photoSections),
    };
    
    if (existingRat) {
      updateMutation.mutate({
        id: existingRat.id,
        data: ratData,
      });
    } else if (activity) {
      createMutation.mutate({
        activityId: activity.id,
        technicianId: activity.technicianId,
        ...ratData,
      });
    }
  };

  const handleComplete = () => {
    if (existingRat) {
      handleSave("completa");
    }
  };

  const addComponent = () => {
    setComponents([...components, { 
      code: "", 
      batch: "", 
      manufactureDate: "", 
      expiryDate: "",
      category: "",
      technicalBulletin: "",
      recommendedThickness: "",
      complements: ""
    }]);
  };
  
  // Photo handling functions
  const handleAddPhoto = async (section: keyof PhotoSections) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Não usar capture para permitir escolher entre câmera e galeria no mobile
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const newPhoto: PhotoItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          base64,
          description: ""
        };
        
        setPhotoSections(prev => ({
          ...prev,
          [section]: [...prev[section], newPhoto]
        }));
      };
      reader.readAsDataURL(file);
    };
    
    input.click();
  };
  
  const handleUpdatePhotoDescription = (section: keyof PhotoSections, photoId: string, description: string) => {
    setPhotoSections(prev => ({
      ...prev,
      [section]: prev[section].map(photo => 
        photo.id === photoId ? { ...photo, description } : photo
      )
    }));
  };
  
  const handleRemovePhoto = (section: keyof PhotoSections, photoId: string) => {
    setPhotoSections(prev => ({
      ...prev,
      [section]: prev[section].filter(photo => photo.id !== photoId)
    }));
  };
  
  // Signature handling
  const clearSignature = () => {
    signatureRef.current?.clear();
    setSignature("");
  };
  
  const saveSignature = () => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      const dataUrl = signatureRef.current.toDataURL("image/png");
      setSignature(dataUrl);
    }
  };

  const handleSignatureImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setSignature(base64);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const removeComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, field: string, value: string) => {
    const newComponents = [...components];
    (newComponents[index] as any)[field] = value;
    setComponents(newComponents);
  };

  const handlePreview = async () => {
    if (existingRat) {
      try {
        const token = localStorage.getItem('astec_token');
        // Navigate directly to preview URL (works on iOS/PWA)
        const previewUrl = `/api/rats/${existingRat.id}/preview?token=${encodeURIComponent(token || '')}`;
        
        // Use location.href for iOS compatibility
        window.location.href = previewUrl;
      } catch (error) {
        toast({
          title: "Erro ao carregar visualização",
          description: "Não foi possível gerar a visualização da RAT.",
          variant: "destructive",
          duration: 5000
        });
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (!existingRat) return;
    
    try {
      toast({
        title: "Gerando PDF...",
        description: "Por favor aguarde...",
        duration: 8000
      });
      
      const fileName = `RAT-${existingRat.reportNumberManual || existingRat.reportNumber}.pdf`;
      const token = localStorage.getItem('astec_token');
      
      // Try server-side generation first (Puppeteer - higher quality)
      let pdfBlob: Blob | null = null;
      
      try {
        const response = await fetch(`/api/rats/${existingRat.id}/pdf`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          pdfBlob = await response.blob();
        } else {
          console.log('Server PDF generation failed, trying client-side fallback');
        }
      } catch (serverError) {
        console.log('Server PDF not available, using client-side generation:', serverError);
      }
      
      // Fallback to client-side generation if server fails
      if (!pdfBlob) {
        const formData = form.getValues();
        const html = generateRatHtmlLocal({
          rat: existingRat,
          formData,
          components,
          photoSections,
          signature,
          signatureName,
          technician: myTechnician
        });
        
        // Create hidden iframe to render the complete HTML document
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '0';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          throw new Error('Could not access iframe document');
        }
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const bodyElement = iframeDoc.body;
        
        const opt = {
          margin: [5, 5, 5, 5] as [number, number, number, number],
          filename: fileName,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { 
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false
          },
          jsPDF: { 
            unit: 'mm' as const, 
            format: 'a4', 
            orientation: 'portrait' as const 
          },
          pagebreak: { mode: ['css', 'legacy'], before: '.page-break' }
        };
        
        pdfBlob = await (html2pdf().set(opt).from(bodyElement).outputPdf('blob') as Promise<Blob>);
        document.body.removeChild(iframe);
        
        toast({
          title: "Aviso",
          description: "PDF gerado com qualidade reduzida. Para melhor qualidade, tente novamente mais tarde.",
          duration: 5000
        });
      }
      
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                    (window.navigator as any).standalone === true;
      
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      
      // For iOS PWA: use Web Share API
      if (isIOS && isPWA && navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: fileName,
          });
          toast({
            title: "PDF compartilhado!",
            description: "Selecione 'Salvar em Arquivos' para guardar o PDF.",
            duration: 4000
          });
          return;
        } catch (shareError: any) {
          if (shareError.name !== 'AbortError') {
            console.log('Share failed, using fallback:', shareError);
          }
        }
      }
      
      // For iOS Safari (not PWA): open directly
      if (isIOS && !isPWA) {
        const url = URL.createObjectURL(pdfBlob);
        window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      }
      
      // For desktop and Android: download via link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      toast({
        title: "PDF gerado com sucesso!",
        description: `Arquivo ${fileName} salvo.`,
        duration: 4000
      });
      
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: error.message || "Não foi possível gerar o PDF. Tente novamente.",
        variant: "destructive",
        duration: 5000
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] sm:h-auto sm:max-h-[90vh] p-0 overflow-hidden w-[95vw] sm:w-auto flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <DialogTitle>
                {existingRat ? (existingRat as any).reportNumberManual || existingRat.reportNumber : "Nova RAT"}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {isAutoSaving && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="indicator-auto-saving">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Salvando...</span>
                </div>
              )}
              {!isAutoSaving && lastAutoSave && existingRat && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="indicator-auto-saved">
                  <Cloud className="h-3 w-3" />
                  <span className="hidden sm:inline">Salvo</span>
                </div>
              )}
              <Badge className={`${statusStyle.bg} ${statusStyle.text}`} data-testid="badge-rat-status">
                {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
              </Badge>
            </div>
          </div>
          {activity && (
            <div className="text-sm text-muted-foreground mt-1">
              Cliente: <span className="font-medium">{activity.clientName}</span>
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          {existingRat && isLoadingFullRat ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando dados...</span>
            </div>
          ) : (
          <Form {...form}>
            <form className="p-3 sm:p-6 space-y-4 sm:space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex flex-wrap gap-1 mb-4 h-auto">
                  <TabsTrigger value="header" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-header">
                    <ClipboardList className="h-3 w-3" />
                    <span className="hidden md:inline">Cabeçalho</span>
                  </TabsTrigger>
                  <TabsTrigger value="client" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-client">
                    <Building2 className="h-3 w-3" />
                    <span className="hidden md:inline">Cliente</span>
                  </TabsTrigger>
                  <TabsTrigger value="surface" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-surface">
                    <Layers className="h-3 w-3" />
                    <span className="hidden md:inline">Superfície</span>
                  </TabsTrigger>
                  <TabsTrigger value="product" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-product">
                    <Package className="h-3 w-3" />
                    <span className="hidden md:inline">Produto</span>
                  </TabsTrigger>
                  <TabsTrigger value="application" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-application">
                    <Paintbrush className="h-3 w-3" />
                    <span className="hidden md:inline">Aplicação</span>
                  </TabsTrigger>
                  <TabsTrigger value="report" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-report">
                    <FileText className="h-3 w-3" />
                    <span className="hidden md:inline">Relatório</span>
                  </TabsTrigger>
                  <TabsTrigger value="signature" className="text-xs gap-1 flex-1 min-w-[40px] px-2" data-testid="tab-signature">
                    <PenLine className="h-3 w-3" />
                    <span className="hidden md:inline">Assinatura</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="header" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Dados do Relatório</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                        <FormField
                          control={form.control}
                          name="reportNumberManual"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nº do Relatório *</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="Ex: RAT-001"
                                  disabled={isReadOnly}
                                  data-testid="input-report-number-manual"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="openingDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data de Abertura</FormLabel>
                              <FormControl>
                                <Input 
                                  type="date"
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-opening-date"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="closingDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data de Fechamento *</FormLabel>
                              <FormControl>
                                <Input 
                                  type="date"
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-closing-date"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Tipo de Atendimento</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
                        name="serviceType"
                        render={({ field }) => (
                          <FormItem>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {SERVICE_TYPES.map((type) => (
                                <div key={type.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={type.id}
                                    checked={field.value?.includes(type.id)}
                                    onCheckedChange={(checked) => {
                                      const newValue = checked
                                        ? [...(field.value || []), type.id]
                                        : (field.value || []).filter((v) => v !== type.id);
                                      field.onChange(newValue);
                                    }}
                                    disabled={isReadOnly}
                                    data-testid={`checkbox-service-${type.id}`}
                                  />
                                  <label htmlFor={type.id} className="text-sm">
                                    {type.label}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="client" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Dados do Cliente</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="clientNameEditable"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cliente *</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Nome do cliente"
                                disabled={isReadOnly}
                                data-testid="input-client-name-editable"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* Obra: Nome digitável + Tipo (Nova/Manutenção) */}
                      <div className="space-y-2">
                        <FormLabel>Obra</FormLabel>
                        <div className="grid grid-cols-2 gap-2">
                          <FormField
                            control={form.control}
                            name="obraName"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="Nome da obra (ex: VALE)"
                                    disabled={isReadOnly}
                                    data-testid="input-obra-name"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="projectType"
                            render={({ field }) => (
                              <FormItem>
                                <Select
                                  value={field.value || ""}
                                  onValueChange={field.onChange}
                                  disabled={isReadOnly}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="select-project-type">
                                      <SelectValue placeholder="Tipo" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="nova">Nova</SelectItem>
                                    <SelectItem value="manutencao">Manutenção</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="applicator"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Aplicadora</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-applicator"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="contact"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contato</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-contact"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>E-mail</FormLabel>
                              <FormControl>
                                <Input 
                                  type="email" 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-email"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="sector"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Setor</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-sector"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <Separator />
                      <FormField
                        control={form.control}
                        name="segment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Segmento</FormLabel>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {SEGMENTS.map((seg) => (
                                <div key={seg.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`segment-${seg.id}`}
                                    checked={field.value?.includes(seg.id)}
                                    onCheckedChange={(checked) => {
                                      const newValue = checked
                                        ? [...(field.value || []), seg.id]
                                        : (field.value || []).filter((v) => v !== seg.id);
                                      field.onChange(newValue);
                                    }}
                                    disabled={isReadOnly}
                                    data-testid={`checkbox-segment-${seg.id}`}
                                  />
                                  <label htmlFor={`segment-${seg.id}`} className="text-sm">
                                    {seg.label}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="surface" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Dados Técnicos - Superfície</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="substrate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Substrato</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-substrate"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="initialGrade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Grau Inicial da Superfície</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-initial-grade"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="surfacePrep"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo Preparo Superfície</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-surface-prep"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="abrasiveType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo Abrasivo</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-abrasive-type"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="roughness"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Rugosidade</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-roughness"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="aggressiveness"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Agressividade a que o Revestimento/Pintura será Submetido</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-aggressiveness"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <Separator />
                      
                      <FormField
                        control={form.control}
                        name="surfaceMaintenanceGrade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Manutenção (ASTM D610)</FormLabel>
                            <Select
                              value={field.value === null || field.value === undefined ? "na" : field.value.toString()}
                              onValueChange={(val) => field.onChange(val === "na" ? null : parseInt(val))}
                              disabled={isReadOnly}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-maintenance-grade">
                                  <SelectValue placeholder="Selecione o grau (0-10) ou N/A" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="na">N/A (Não Aplicável)</SelectItem>
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((grade) => (
                                  <SelectItem key={grade} value={grade.toString()}>
                                    Grau {grade} {grade === 10 ? "(Excelente)" : grade === 0 ? "(Falha Total)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              ASTM D610: Grau de deterioração da pintura (0 = falha total, 10 = excelente)
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="product" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Dados Técnicos - Produto</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="product.description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Produto / Descrição</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-product-description"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="product.color"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cor</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-product-color"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <FormLabel>Componentes do Produto</FormLabel>
                        {!isReadOnly && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addComponent}
                            data-testid="button-add-component"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar
                          </Button>
                        )}
                      </div>

                      {components.map((component, index) => (
                        <Card key={index} className="p-3">
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                                <Select
                                  value={component.category || ""}
                                  onValueChange={(val) => updateComponent(index, "category", val)}
                                  disabled={isReadOnly}
                                >
                                  <SelectTrigger data-testid={`select-component-category-${index}`}>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Componente A">Componente A</SelectItem>
                                    <SelectItem value="Componente B">Componente B</SelectItem>
                                    <SelectItem value="Componente C">Componente C</SelectItem>
                                    <SelectItem value="Diluente">Diluente</SelectItem>
                                    <SelectItem value="Powder">Powder</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Código</label>
                                <Input
                                  placeholder="Ex: ABC-123"
                                  value={component.code}
                                  onChange={(e) => updateComponent(index, "code", e.target.value)}
                                  disabled={isReadOnly}
                                  data-testid={`input-component-code-${index}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Lote</label>
                                <Input
                                  placeholder="Nº do lote"
                                  value={component.batch}
                                  onChange={(e) => updateComponent(index, "batch", e.target.value)}
                                  disabled={isReadOnly}
                                  data-testid={`input-component-batch-${index}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Fabricação</label>
                                <Input
                                  type="date"
                                  value={component.manufactureDate}
                                  onChange={(e) => updateComponent(index, "manufactureDate", e.target.value)}
                                  disabled={isReadOnly}
                                  data-testid={`input-component-manufacture-${index}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Validade</label>
                                <div className="flex gap-1">
                                  <Input
                                    type="date"
                                    value={component.expiryDate}
                                    onChange={(e) => updateComponent(index, "expiryDate", e.target.value)}
                                    disabled={isReadOnly}
                                    className="flex-1"
                                    data-testid={`input-component-expiry-${index}`}
                                  />
                                  {!isReadOnly && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeComponent(index)}
                                      data-testid={`button-remove-component-${index}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                              <Input
                                placeholder="Código do Boletim Técnico"
                                value={component.technicalBulletin || ""}
                                onChange={(e) => updateComponent(index, "technicalBulletin", e.target.value)}
                                disabled={isReadOnly}
                                data-testid={`input-component-bulletin-${index}`}
                              />
                              <Input
                                placeholder={component.category === "Diluente" ? "Diluição Recomendada" : "Espessura Recomendada"}
                                value={component.recommendedThickness || ""}
                                onChange={(e) => updateComponent(index, "recommendedThickness", e.target.value)}
                                disabled={isReadOnly}
                                data-testid={`input-component-thickness-${index}`}
                              />
                            </div>
                            <Textarea
                              placeholder="Complementos (observações adicionais)"
                              value={component.complements || ""}
                              onChange={(e) => updateComponent(index, "complements", e.target.value)}
                              disabled={isReadOnly}
                              rows={2}
                              className="mt-2"
                              data-testid={`textarea-component-complements-${index}`}
                            />
                          </div>
                        </Card>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="application" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Características de Aplicação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="application.viscosity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Viscosidade / Diluição</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-viscosity"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="application.totalThickness"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Espessura Seca Total (µm)</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-total-thickness"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="application.primer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primer (µm)</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-primer"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="application.intermediate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Intermediário (µm)</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-intermediate"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="application.finish"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Acabamento (µm)</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-finish"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="application.temperature"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Temperatura (°C)</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-temperature"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="application.humidity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>URA (%)</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-humidity"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="application.equipment"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Superfície Aplicada/Peça</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-equipment"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="application.method"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Método de Aplicação</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isReadOnly}
                                  data-testid="input-method"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="application.conditions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Condições de Aplicação</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={3}
                                disabled={isReadOnly}
                                data-testid="textarea-conditions"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      
                      <Separator />
                      
                      <FormField
                        control={form.control}
                        name="applicationNote"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Observações Adicionais *</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={4}
                                placeholder="Observações relevantes sobre a aplicação..."
                                disabled={isReadOnly}
                                data-testid="textarea-application-note"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="report" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Relatório Descritivo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="objective"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>1 - Objetivo</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={3}
                                disabled={isReadOnly}
                                placeholder="Descreva o objetivo da visita técnica..."
                                data-testid="textarea-objective"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="participants"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>2 - Participantes</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={2}
                                disabled={isReadOnly}
                                placeholder="Liste os participantes da visita..."
                                data-testid="textarea-participants"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="activitiesPerformed"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>3 - Atividades Realizadas</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={4}
                                disabled={isReadOnly}
                                placeholder="Descreva as atividades realizadas durante a visita..."
                                data-testid="textarea-activities-performed"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="comments"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>4 - Comentários</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={3}
                                disabled={isReadOnly}
                                placeholder="Comentários adicionais..."
                                data-testid="textarea-comments"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="conclusion"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>5 - Conclusão</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={3}
                                disabled={isReadOnly}
                                placeholder="Conclusões da visita técnica..."
                                data-testid="textarea-conclusion"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="referenceDocuments"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>7 - Documentos de Referência</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={2}
                                disabled={isReadOnly}
                                placeholder="Liste documentos de referência utilizados..."
                                data-testid="textarea-reference-documents"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Relatório Fotográfico
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Adicione fotos organizadas por seção (máx. 6 seções)
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {Object.entries(photoSections).map(([sectionKey, photos]) => (
                        <div key={sectionKey} className="border rounded-lg p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              {sectionKey === 'section1' ? 'Superfície/Substrato' :
                               sectionKey === 'section2' ? 'Preparação' :
                               sectionKey === 'section3' ? 'Aplicação' :
                               sectionKey === 'section4' ? 'Resultado Final' :
                               sectionKey === 'section5' ? 'Defeitos/Problemas' :
                               'Outros'}
                            </span>
                            {!isReadOnly && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddPhoto(sectionKey as keyof PhotoSections)}
                                data-testid={`button-add-photo-${sectionKey}`}
                              >
                                <Camera className="h-4 w-4 mr-1" />
                                Adicionar Foto
                              </Button>
                            )}
                          </div>
                          
                          {photos.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                              {photos.map((photo: PhotoItem) => (
                                <div key={photo.id} className="relative border rounded overflow-hidden group">
                                  <img 
                                    src={photo.base64} 
                                    alt="Foto do relatório"
                                    className="w-full h-24 object-cover"
                                  />
                                  <div className="p-1.5 space-y-1">
                                    <textarea
                                      placeholder="Descrição da foto"
                                      value={photo.description}
                                      onChange={(e) => handleUpdatePhotoDescription(
                                        sectionKey as keyof PhotoSections,
                                        photo.id,
                                        e.target.value
                                      )}
                                      disabled={isReadOnly}
                                      className="w-full text-xs border rounded px-2 py-1 resize-none min-h-[40px]"
                                      rows={2}
                                      data-testid={`input-photo-description-${photo.id}`}
                                    />
                                    {!isReadOnly && (
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        className="w-full h-6 text-xs"
                                        onClick={() => handleRemovePhoto(
                                          sectionKey as keyof PhotoSections,
                                          photo.id
                                        )}
                                        data-testid={`button-remove-photo-${photo.id}`}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Remover
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Nenhuma foto nesta seção
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="signature" className="space-y-4 overflow-y-auto max-h-[calc(70vh-180px)]">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <PenLine className="h-4 w-4" />
                        Assinatura do Técnico
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Assine digitalmente para finalizar o relatório
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <FormLabel>Nome do Técnico *</FormLabel>
                        <Input
                          value={signatureName}
                          onChange={(e) => setSignatureName(e.target.value)}
                          placeholder="Nome completo do técnico"
                          disabled={isReadOnly}
                          data-testid="input-signature-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <FormLabel>Assinatura Digital *</FormLabel>
                        {signature ? (
                          <div className="border rounded-lg p-4 bg-white">
                            <img 
                              src={signature} 
                              alt="Assinatura do técnico"
                              className="max-h-32 mx-auto"
                            />
                            {!isReadOnly && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2 w-full"
                                onClick={clearSignature}
                                data-testid="button-clear-signature"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Limpar Assinatura
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div 
                              className="border rounded-lg bg-white overflow-hidden"
                              style={{ touchAction: 'none' }}
                              data-testid="container-signature-canvas"
                            >
                              <SignatureCanvas
                                ref={signatureRef}
                                canvasProps={{
                                  style: { width: '100%', height: '180px' }
                                }}
                                backgroundColor="white"
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={clearSignature}
                                data-testid="button-clear-signature-canvas"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Limpar
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={saveSignature}
                                data-testid="button-save-signature"
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Salvar Assinatura
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleSignatureImageUpload}
                                data-testid="button-upload-signature"
                              >
                                <ImageIcon className="h-4 w-4 mr-1" />
                                Carregar Imagem
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Desenhe sua assinatura acima ou carregue uma imagem de assinatura existente
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </form>
          </Form>
          )}
        </ScrollArea>

        <div className="px-3 sm:px-6 py-3 border-t bg-background shrink-0">
          {activeTab === "signature" && existingRat && (
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreview}
                data-testid="button-preview"
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                data-testid="button-download-pdf"
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar PDF
              </Button>
            </div>
          )}
          
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSave("rascunho")}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-draft"
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
              {activeTab === "signature" && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleComplete}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-complete"
                  className="flex-1"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Completar
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
