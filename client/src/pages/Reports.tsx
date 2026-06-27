import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Clock, 
  TrendingUp, 
  AlertCircle, 
  FileBarChart,
  Download,
  Bot,
  Calendar,
  List,
  Car,
  Navigation,
  Timer,
  CalendarClock,
  RefreshCw,
  HelpCircle,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip as RechartsTooltip, PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { Tooltip as RadixTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import ExcelJS from "exceljs";

interface TimeBreakdownData {
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };
  totals: {
    efetivo: number;
    adicional: number;
    perda: number;
  };
  percentages: {
    efetivo: number;
    adicional: number;
    perda: number;
  };
  totalMinutes: number;
  breakdown: Array<{
    name: string;
    category: string;
    color: string;
    icon: string | null;
    minutes: number;
    entries: number;
    isAutomatic: boolean;
    justifications?: Array<{
      date: string;
      minutes: number;
      text: string;
    }>;
  }>;
  breakdownByTechnician?: Array<{
    technicianId: string;
    technicianName: string;
    activityName: string;
    category: string;
    color: string;
    icon: string | null;
    minutes: number;
    entries: number;
    isAutomatic: boolean;
  }>;
  technicianSummary?: Array<{
    technicianId: string;
    technicianName: string;
    efetivo: number;
    adicional: number;
    perda: number;
    total: number;
  }>;
  entries: Array<any>;
}

export default function Reports() {
  const currentDate = new Date();
  const { user } = useAuth();
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>("all");
  
  // Data filters - default to current month
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(1); // First day of current month
    return date.toISOString().split('T')[0];
  };
  
  const getDefaultEndDate = () => {
    const date = new Date();
    return date.toISOString().split('T')[0];
  };
  
  const [startDate, setStartDate] = useState<string>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<string>(getDefaultEndDate());
  const { toast } = useToast();
  
  // Filtros da aba Detalhamento (independentes da aba Resumo)
  const [detailStartDate, setDetailStartDate] = useState<string>(getDefaultStartDate());
  const [detailEndDate, setDetailEndDate] = useState<string>(getDefaultEndDate());
  const [detailTechnicianId, setDetailTechnicianId] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  
  // Hide-on-scroll state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const rafId = useRef<number | null>(null);
  const isTouching = useRef(false); // Track active touch state
  const isUsingPointer = useRef(false); // Track if last input was pointer (mouse/trackpad)
  const lastTouchEndTime = useRef(0); // Track when last touch ended (for momentum detection)

  const isAssistente = user?.role === "assistente";

  // MOBILE FIX: Track input modality (touch vs pointer) for hybrid devices
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      isTouching.current = true;
      isUsingPointer.current = false; // Touch input detected
    };

    const handleTouchEnd = () => {
      isTouching.current = false;
      lastTouchEndTime.current = Date.now(); // Record when touch ended for momentum detection
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        isUsingPointer.current = true; // Mouse/trackpad input detected
      }
    };

    const handleWheel = () => {
      isUsingPointer.current = true; // Wheel scroll = mouse/trackpad
      lastTouchEndTime.current = 0; // Clear momentum flag (not touch momentum)
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Detect keyboard scrolling keys
      const scrollKeys = ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '];
      if (scrollKeys.includes(e.key)) {
        isUsingPointer.current = true; // Treat keyboard as deliberate input
        lastTouchEndTime.current = 0; // Clear momentum flag (not touch momentum)
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('pointerdown', handlePointerDown, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('keydown', handleKeyDown, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Hide-on-scroll effect with HYBRID touch-gated logic (works on both mobile and desktop)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Throttle using requestAnimationFrame
      if (!ticking.current) {
        rafId.current = window.requestAnimationFrame(() => {
          const currentScrollY = container.scrollTop;
          const scrollThreshold = 50; // Minimum scroll to trigger hide
          const dampingThreshold = 10; // Minimum delta to prevent jitter

          if (currentScrollY < scrollThreshold) {
            // Always show header when near top
            setIsHeaderVisible(true);
          } else {
            const scrollDelta = currentScrollY - lastScrollY.current;
            
            // HYBRID LOGIC: Works for touch, pointer, keyboard, and hybrid devices
            if (scrollDelta > dampingThreshold) {
              // Scrolling down significantly - always hide
              setIsHeaderVisible(false);
            } else if (scrollDelta < -dampingThreshold) {
              // Scrolling up significantly - show if NOT mobile momentum scroll
              const isPointerScroll = isUsingPointer.current;
              const isMobileActiveScroll = isTouching.current;
              
              // Detect mobile momentum: touch ended recently (< 2s) and pointer not used
              const timeSinceTouchEnd = Date.now() - lastTouchEndTime.current;
              const isMobileMomentum = !isPointerScroll && timeSinceTouchEnd < 2000 && timeSinceTouchEnd > 0;
              
              // Show header for: pointer, active touch, or keyboard (NOT momentum)
              if (isPointerScroll || isMobileActiveScroll || !isMobileMomentum) {
                setIsHeaderVisible(true);
              }
              // Otherwise: mobile momentum scroll detected - keep header hidden
            }
            // If delta is within damping threshold, keep current state (no change)
          }

          lastScrollY.current = currentScrollY;
          rafId.current = null;
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      // Cancel pending animation frame on cleanup
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  // Fetch technicians for filter (uses default fetcher with JWT token)
  // Only fetch if admin - assistentes don't need to see the list
  const { data: technicians = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/technicians"],
    enabled: !isAssistente,
  });

  // Fetch time breakdown report (uses default fetcher with JWT token)
  const queryParams = new URLSearchParams({
    startDate: startDate,
    endDate: endDate,
  });
  
  // Only add technicianId if admin and not "all"
  // For assistentes, the backend middleware will automatically filter their data
  if (!isAssistente && selectedTechnicianId !== "all") {
    queryParams.append("technicianId", selectedTechnicianId);
  }
  
  const { data: report, isLoading } = useQuery<TimeBreakdownData>({
    queryKey: [`/api/reports/time-breakdown?${queryParams.toString()}`],
  });

  // Query separada para aba Detalhamento
  const detailQueryParams = new URLSearchParams({
    startDate: detailStartDate,
    endDate: detailEndDate,
  });
  if (!isAssistente && detailTechnicianId !== "all") {
    detailQueryParams.append("technicianId", detailTechnicianId);
  }
  
  const { data: detailReport, isLoading: isLoadingDetail } = useQuery<TimeBreakdownData>({
    queryKey: [`/api/reports/time-breakdown?${detailQueryParams.toString()}`],
  });

  // Query para estatísticas de reagendamentos
  const rescheduleQueryParams = new URLSearchParams();
  rescheduleQueryParams.append("startDate", startDate);
  rescheduleQueryParams.append("endDate", endDate);
  if (!isAssistente && selectedTechnicianId !== "all") {
    rescheduleQueryParams.append("technicianId", selectedTechnicianId);
  }

  const { data: rescheduleStats } = useQuery<{
    totalReschedules: number;
    activitiesRescheduled: number;
    activitiesWithMultipleReschedules: number;
    reasonBreakdown: Array<{ reason: string; count: number }>;
    reschedules: Array<{
      id: string;
      activityId: string;
      activityTitle: string;
      clientName: string;
      technicianName: string;
      previousDate: string;
      newDate: string;
      reason: string;
      rescheduledAt: string;
      rescheduleNumber: number;
      rescheduledByName: string;
    }>;
  }>({
    queryKey: [`/api/reports/reschedule-stats?${rescheduleQueryParams.toString()}`],
  });

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Formato HH:MM:SS (segundos sempre 00, pois o sistema controla minutos)
  const formatHoursClock = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  };

  // Paleta usada no gráfico de pizza (tela e Excel)
  const PIE_PALETTE = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#8b5cf6", "#14b8a6", "#f43f5e"];

  // Gera o gráfico de pizza como imagem PNG (base64) para embutir no Excel
  const generatePieImageBase64 = (
    data: Array<{ location: string; minutes: number; percentage: number }>,
    colors: string[] = PIE_PALETTE
  ): string | null => {
    if (typeof document === "undefined" || !data || data.length === 0) return null;
    const total = data.reduce((s, d) => s + d.minutes, 0);
    if (total <= 0) return null;

    const W = 640;
    const H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const cx = 180;
    const cy = 180;
    const r = 150;
    let start = -Math.PI / 2;

    data.forEach((d, i) => {
      const slice = (d.minutes / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (d.percentage >= 6) {
        const mid = start + slice / 2;
        const lx = cx + Math.cos(mid) * r * 0.6;
        const ly = cy + Math.sin(mid) * r * 0.6;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${d.percentage.toFixed(1)}%`, lx, ly);
      }
      start += slice;
    });

    // Legenda à direita
    let ly = 70;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    data.forEach((d, i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(380, ly - 8, 16, 16);
      ctx.fillStyle = "#111827";
      ctx.font = "14px Arial";
      ctx.fillText(`${d.location} — ${d.percentage.toFixed(1)}%`, 404, ly);
      ly += 28;
    });

    return canvas.toDataURL("image/png").split(",")[1];
  };

  // Relatório por Local de Realização (categoria × local)
  const locationQueryParams = new URLSearchParams({ startDate, endDate });
  if (!isAssistente && selectedTechnicianId !== "all") {
    locationQueryParams.append("technicianId", selectedTechnicianId);
  }
  const { data: locationReport, isLoading: isLoadingLocation } = useQuery<{
    period: { startDate: string; endDate: string };
    categories: Array<{ category: string; totalMinutes: number; locations: Array<{ location: string; minutes: number }> }>;
    byLocation: Array<{ location: string; minutes: number; percentage: number }>;
    byCategorization: Array<{ categorization: string; minutes: number; percentage: number }>;
    grandTotalMinutes: number;
    technicianSummary: Array<{ technicianId: string; technicianName: string; total: number }>;
  }>({
    queryKey: [`/api/reports/location-breakdown?${locationQueryParams.toString()}`],
  });

  const handleExportExcel = async () => {
    if (!report) {
      toast({
        title: "Erro",
        description: "Nenhum dado disponível para exportar",
        variant: "destructive",
      });
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      
      // ===== ABA 1: RESUMO COM GRÁFICO DE PIZZA =====
      const summarySheet = workbook.addWorksheet("Resumo", {
        views: [{ state: "frozen", xSplit: 0, ySplit: 1 }]
      });

      // Título principal
      summarySheet.mergeCells("A1:F1");
      const titleCell = summarySheet.getCell("A1");
      titleCell.value = "RELATÓRIO DE HORAS - ASTEC";
      titleCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4788" } };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      summarySheet.getRow(1).height = 30;

      // Informações do período
      const formatDateBR = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('pt-BR');
      };
      const techName = isAssistente 
        ? user?.name || "Meus Dados"
        : (selectedTechnicianId === "all" ? "Todos os Técnicos" : technicians.find(t => t.id === selectedTechnicianId)?.name || "");
      
      summarySheet.getCell("A3").value = "Período:";
      summarySheet.getCell("B3").value = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;
      summarySheet.getCell("A4").value = "Técnico:";
      summarySheet.getCell("B4").value = techName;
      
      summarySheet.getCell("A3").font = { bold: true };
      summarySheet.getCell("A4").font = { bold: true };

      // Tabela de resumo
      summarySheet.getCell("A6").value = "RESUMO POR CATEGORIA";
      summarySheet.mergeCells("A6:E6");
      summarySheet.getCell("A6").font = { size: 14, bold: true };
      summarySheet.getCell("A6").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
      summarySheet.getCell("A6").alignment = { horizontal: "center" };

      // Cabeçalhos da tabela
      const headerRow = summarySheet.getRow(7);
      headerRow.values = ["Categoria", "Horas", "Minutos", "Percentual", ""];
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };
      headerRow.height = 25;

      // Dados das categorias com cores
      const categories = [
        { label: "Trabalho Efetivo", key: "efetivo", color: "FF92D050" },
        { label: "Trabalho Adicional", key: "adicional", color: "FFFFC000" },
        { label: "Tempo Não Produtivo", key: "perda", color: "FFFF6B6B" },
      ];

      categories.forEach((cat, idx) => {
        const row = summarySheet.getRow(8 + idx);
        const minutes = report.totals[cat.key as keyof typeof report.totals];
        row.values = [
          cat.label,
          formatMinutes(minutes),
          minutes,
          `${report.percentages[cat.key as keyof typeof report.percentages].toFixed(1)}%`,
          ""
        ];
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cat.color } };
        row.getCell(1).font = { bold: true };
        row.alignment = { vertical: "middle" };
        row.height = 22;
      });

      // Linha de total
      const totalRow = summarySheet.getRow(11);
      totalRow.values = ["TOTAL", formatMinutes(report.totalMinutes), report.totalMinutes, "100%", ""];
      totalRow.font = { bold: true, size: 12 };
      totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      totalRow.alignment = { horizontal: "center", vertical: "middle" };
      totalRow.height = 25;

      // Bordas na tabela
      for (let row = 7; row <= 11; row++) {
        for (let col = 1; col <= 4; col++) {
          const cell = summarySheet.getRow(row).getCell(col);
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
          };
        }
      }

      // Ajustar larguras das colunas
      summarySheet.getColumn(1).width = 25;
      summarySheet.getColumn(2).width = 15;
      summarySheet.getColumn(3).width = 15;
      summarySheet.getColumn(4).width = 15;
      summarySheet.getColumn(5).width = 2;

      // ===== NOVA SEÇÃO: RESUMO POR TÉCNICO =====
      if (report.technicianSummary && report.technicianSummary.length > 1) {
        let techSummaryRow = 14;
        
        summarySheet.getCell(`A${techSummaryRow}`).value = "RESUMO POR TÉCNICO";
        summarySheet.mergeCells(`A${techSummaryRow}:F${techSummaryRow}`);
        summarySheet.getCell(`A${techSummaryRow}`).font = { size: 14, bold: true };
        summarySheet.getCell(`A${techSummaryRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
        summarySheet.getCell(`A${techSummaryRow}`).alignment = { horizontal: "center" };
        techSummaryRow++;

        // Cabeçalhos da tabela de técnicos
        const techHeaderRow = summarySheet.getRow(techSummaryRow);
        techHeaderRow.values = ["Técnico", "Efetivo", "Adicional", "Perda", "Total", "% do Total"];
        techHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        techHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        techHeaderRow.alignment = { horizontal: "center", vertical: "middle" };
        techHeaderRow.height = 25;
        techSummaryRow++;

        // Dados por técnico
        report.technicianSummary.forEach((tech) => {
          const row = summarySheet.getRow(techSummaryRow);
          const percentage = report.totalMinutes > 0 ? ((tech.total / report.totalMinutes) * 100).toFixed(1) : "0.0";
          row.values = [
            tech.technicianName,
            formatMinutes(tech.efetivo),
            formatMinutes(tech.adicional),
            formatMinutes(tech.perda),
            formatMinutes(tech.total),
            `${percentage}%`
          ];
          row.alignment = { vertical: "middle" };
          row.height = 22;
          
          // Bordas
          for (let col = 1; col <= 6; col++) {
            row.getCell(col).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" }
            };
          }
          
          // Cores nas células de categoria
          row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } }; // Verde claro
          row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; // Amarelo claro
          row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } }; // Vermelho claro
          
          techSummaryRow++;
        });

        // Linha de total
        const techTotalRow = summarySheet.getRow(techSummaryRow);
        techTotalRow.values = [
          "TOTAL",
          formatMinutes(report.totals.efetivo),
          formatMinutes(report.totals.adicional),
          formatMinutes(report.totals.perda),
          formatMinutes(report.totalMinutes),
          "100%"
        ];
        techTotalRow.font = { bold: true, size: 11 };
        techTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
        techTotalRow.alignment = { horizontal: "center", vertical: "middle" };
        techTotalRow.height = 25;
        
        for (let col = 1; col <= 6; col++) {
          techTotalRow.getCell(col).border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
          };
        }
      }

      // ===== ABA 2: DETALHAMENTO DE REGISTROS (com Tipo IDA/VOLTA/EXECUÇÃO) =====
      const detailSheet = workbook.addWorksheet("Detalhamento");

      const detailColCount = isAssistente ? 6 : 8;

      // Título
      detailSheet.mergeCells(`A1:${String.fromCharCode(64 + detailColCount)}1`);
      const detailTitle = detailSheet.getCell("A1");
      detailTitle.value = "DETALHAMENTO DE REGISTROS";
      detailTitle.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
      detailTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4788" } };
      detailTitle.alignment = { vertical: "middle", horizontal: "center" };
      detailSheet.getRow(1).height = 25;

      const detailTechName = isAssistente 
        ? user?.name || "Meus Dados"
        : (detailTechnicianId === "all" 
          ? (selectedTechnicianId === "all" ? "Todos os Técnicos" : technicians.find(t => t.id === selectedTechnicianId)?.name || "")
          : technicians.find(t => t.id === detailTechnicianId)?.name || "");
      
      const formatDateBRDetail = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('pt-BR');
      };

      detailSheet.getCell("A2").value = "Período:";
      detailSheet.getCell("B2").value = `${formatDateBRDetail(detailStartDate || startDate)} a ${formatDateBRDetail(detailEndDate || endDate)}`;
      detailSheet.getCell("A2").font = { bold: true };
      
      detailSheet.getCell("A3").value = "Técnico:";
      detailSheet.getCell("B3").value = detailTechName;
      detailSheet.getCell("A3").font = { bold: true };

      let detailFilterInfo = [];
      if (filterCategory !== "all") detailFilterInfo.push(`Categoria: ${filterCategory === "efetivo" ? "Efetivo" : filterCategory === "adicional" ? "Adicional" : "Perda"}`);
      if (filterType !== "all") detailFilterInfo.push(`Tipo: ${filterType === "timer" ? "Execução" : filterType === "ida_travel" ? "IDA" : filterType === "volta_travel" ? "VOLTA" : "Manual"}`);
      if (filterOrigin !== "all") detailFilterInfo.push(`Origem: ${filterOrigin}`);
      if (detailFilterInfo.length > 0) {
        detailSheet.getCell("A4").value = "Filtros:";
        detailSheet.getCell("B4").value = detailFilterInfo.join(" | ");
        detailSheet.getCell("A4").font = { bold: true };
      }

      const categoryColorsExcel: Record<string, string> = {
        efetivo: "FF92D050",
        adicional: "FFFFC000",
        perda: "FFFF6B6B",
      };

      const categoryLabelsExcel: Record<string, string> = {
        efetivo: "Efetivo",
        adicional: "Adicional",
        perda: "Perda",
      };

      const sourceLabelsExcel: Record<string, string> = {
        timer: "Execução",
        ida_travel: "IDA",
        volta_travel: "VOLTA",
        manual: "Manual",
      };

      const detailTableStartRow = detailFilterInfo.length > 0 ? 6 : 5;
      const detailHeaderRow = detailSheet.getRow(detailTableStartRow);
      if (isAssistente) {
        detailHeaderRow.values = ["Data", "Tipo", "Origem", "Horas", "Minutos", "Observações"];
      } else {
        detailHeaderRow.values = ["Data", "Técnico", "Tipo", "Categoria", "Origem", "Horas", "Minutos", "Observações"];
      }
      detailHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      detailHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      detailHeaderRow.alignment = { horizontal: "center", vertical: "middle" };
      detailHeaderRow.height = 25;
      
      for (let col = 1; col <= detailColCount; col++) {
        detailHeaderRow.getCell(col).border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" }
        };
      }

      let currentRow = detailTableStartRow + 1;
      const tableStartRow = detailTableStartRow;

      const detailData = detailReport || report;
      const sortedEntries = (detailData.entries || [])
        .filter((entry: any) => {
          if (filterCategory !== "all" && entry.category !== filterCategory) return false;
          if (filterType !== "all" && entry.source !== filterType) return false;
          if (filterOrigin !== "all" && entry.activityName !== filterOrigin) return false;
          return true;
        })
        .sort((a: any, b: any) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());

      sortedEntries.forEach((entry: any) => {
        const row = detailSheet.getRow(currentRow);
        const entryDate = new Date(entry.workDate).toLocaleDateString('pt-BR');
        const typeLabel = sourceLabelsExcel[entry.source] || entry.source;
        const catLabel = categoryLabelsExcel[entry.category] || entry.category;

        if (isAssistente) {
          row.values = [
            entryDate,
            typeLabel,
            entry.activityName || "-",
            formatMinutes(entry.minutes),
            entry.minutes,
            entry.notes || "-"
          ];
        } else {
          row.values = [
            entryDate,
            entry.technicianName || "-",
            typeLabel,
            catLabel,
            entry.activityName || "-",
            formatMinutes(entry.minutes),
            entry.minutes,
            entry.notes || "-"
          ];
        }
        row.alignment = { vertical: "middle" };

        const catColIdx = 4;
        const catColor = categoryColorsExcel[entry.category];
        if (!isAssistente && catColor) {
          row.getCell(catColIdx).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: catColor }
          };
          row.getCell(catColIdx).font = { bold: true };
        }

        for (let col = 1; col <= detailColCount; col++) {
          row.getCell(col).border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
          };
        }
        currentRow++;
      });

      if (currentRow > 4) {
        detailSheet.autoFilter = {
          from: { row: tableStartRow, column: 1 },
          to: { row: currentRow - 1, column: detailColCount }
        };
      }

      if (isAssistente) {
        detailSheet.getColumn(1).width = 14;
        detailSheet.getColumn(2).width = 16;
        detailSheet.getColumn(3).width = 45;
        detailSheet.getColumn(4).width = 12;
        detailSheet.getColumn(5).width = 12;
        detailSheet.getColumn(6).width = 40;
      } else {
        detailSheet.getColumn(1).width = 14;
        detailSheet.getColumn(2).width = 25;
        detailSheet.getColumn(3).width = 14;
        detailSheet.getColumn(4).width = 16;
        detailSheet.getColumn(5).width = 45;
        detailSheet.getColumn(6).width = 12;
        detailSheet.getColumn(7).width = 12;
        detailSheet.getColumn(8).width = 40;
      }

      // ===== ABA: POR LOCAL DA REALIZAÇÃO =====
      if (locationReport && locationReport.grandTotalMinutes > 0) {
        const locSheet = workbook.addWorksheet("Por Local");
        locSheet.getColumn(1).width = 30;
        locSheet.getColumn(2).width = 14;
        locSheet.getColumn(3).width = 10;

        locSheet.mergeCells("A1:C1");
        const locTitle = locSheet.getCell("A1");
        locTitle.value = "RESUMO DE HORAS";
        locTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        locTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4788" } };
        locTitle.alignment = { horizontal: "center", vertical: "middle" };
        locSheet.getRow(1).height = 24;
        locSheet.getCell("A2").value = "Período:";
        locSheet.getCell("B2").value = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;
        locSheet.getCell("A2").font = { bold: true };
        locSheet.getCell("A3").value = "Técnico:";
        locSheet.getCell("B3").value = techName;
        locSheet.getCell("A3").font = { bold: true };

        const SOFT = { efetivo: "FFBBF7D0", adicional: "FFFDE68A", perda: "FFFECACA", total: "FFDDD6FE", header: "FFE7E6E6" };
        const PIE_COL = 4; // coluna E
        const PIE_W = 440, PIE_H = 250, PIE_ROWS = 14;

        let rowNum = 5;

        const renderBlock = (
          title: string,
          firstColLabel: string,
          rows: Array<{ label: string; hours: string; pct: string; fill?: string; bold?: boolean; indent?: boolean }>,
          pieBase64: string | null,
        ) => {
          const titleRow = rowNum++;
          locSheet.mergeCells(`A${titleRow}:C${titleRow}`);
          const tc = locSheet.getCell(`A${titleRow}`);
          tc.value = title;
          tc.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
          tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4788" } };
          tc.alignment = { horizontal: "center", vertical: "middle" };

          const headerRow = locSheet.getRow(rowNum++);
          headerRow.getCell(1).value = firstColLabel;
          headerRow.getCell(2).value = "Horas";
          headerRow.getCell(3).value = "%";
          headerRow.font = { bold: true };
          for (let c = 1; c <= 3; c++) headerRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT.header } };
          headerRow.getCell(2).alignment = { horizontal: "right" };
          headerRow.getCell(3).alignment = { horizontal: "right" };

          for (const row of rows) {
            const r = locSheet.getRow(rowNum++);
            r.getCell(1).value = row.indent ? `    ${row.label}` : row.label;
            r.getCell(2).value = row.hours;
            r.getCell(3).value = row.pct;
            if (row.bold) r.font = { bold: true };
            if (row.fill) for (let c = 1; c <= 3; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.fill } };
            r.getCell(2).alignment = { horizontal: "right" };
            r.getCell(3).alignment = { horizontal: "right" };
          }
          const dataEnd = rowNum - 1;
          for (let r = titleRow + 1; r <= dataEnd; r++) {
            for (let c = 1; c <= 3; c++) {
              locSheet.getRow(r).getCell(c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
            }
          }

          if (pieBase64) {
            const imgId = workbook.addImage({ base64: pieBase64, extension: "png" });
            locSheet.addImage(imgId, { tl: { col: PIE_COL, row: titleRow - 1 }, ext: { width: PIE_W, height: PIE_H } });
          }

          rowNum = Math.max(dataEnd, titleRow + PIE_ROWS) + 2;
        };

        const pct = (m: number) => `${(locationReport.grandTotalMinutes > 0 ? (m / locationReport.grandTotalMinutes) * 100 : 0).toFixed(1)}%`;

        // Bloco 1: Categoria de Tempo
        if (report) {
          const catTimeRows = [
            { label: "Efetivo", hours: formatHoursClock(report.totals.efetivo), pct: pct(report.totals.efetivo), fill: SOFT.efetivo, bold: true },
            { label: "Adicional", hours: formatHoursClock(report.totals.adicional), pct: pct(report.totals.adicional), fill: SOFT.adicional, bold: true },
            { label: "Perda", hours: formatHoursClock(report.totals.perda), pct: pct(report.totals.perda), fill: SOFT.perda, bold: true },
            { label: "TOTAL", hours: formatHoursClock(report.totalMinutes), pct: "100,0%", fill: SOFT.total, bold: true },
          ];
          const catTimePie = generatePieImageBase64(
            [
              { location: "Efetivo", minutes: report.totals.efetivo, percentage: report.percentages.efetivo },
              { location: "Adicional", minutes: report.totals.adicional, percentage: report.percentages.adicional },
              { location: "Perda", minutes: report.totals.perda, percentage: report.percentages.perda },
            ],
            ["#22c55e", "#eab308", "#ef4444"]
          );
          renderBlock("HORAS POR CATEGORIA DE TEMPO", "Categoria", catTimeRows, catTimePie);
        }

        // Bloco 2: Categorização da Atividade
        {
          const rows: Array<{ label: string; hours: string; pct: string; fill?: string; bold?: boolean; indent?: boolean }> =
            locationReport.byCategorization.map((c) => ({ label: c.categorization, hours: formatHoursClock(c.minutes), pct: `${c.percentage.toFixed(1)}%` }));
          rows.push({ label: "TOTAL", hours: formatHoursClock(locationReport.grandTotalMinutes), pct: "100,0%", fill: SOFT.total, bold: true });
          const pie = generatePieImageBase64(locationReport.byCategorization.map((c) => ({ location: c.categorization, minutes: c.minutes, percentage: c.percentage })));
          renderBlock("HORAS POR CATEGORIZAÇÃO DA ATIVIDADE", "Categorização", rows, pie);
        }

        // Bloco 3: Local de Realização
        {
          const softByCat: Record<string, string> = { efetivo: SOFT.efetivo, adicional: SOFT.adicional, perda: SOFT.perda };
          const catLabels: Record<string, string> = { efetivo: "Efetivo", adicional: "Adicional", perda: "Perda" };
          const rows: Array<{ label: string; hours: string; pct: string; fill?: string; bold?: boolean; indent?: boolean }> = [];
          for (const cat of locationReport.categories) {
            rows.push({ label: catLabels[cat.category] || cat.category, hours: formatHoursClock(cat.totalMinutes), pct: pct(cat.totalMinutes), fill: softByCat[cat.category], bold: true });
            for (const loc of cat.locations) {
              rows.push({ label: loc.location, hours: formatHoursClock(loc.minutes), pct: pct(loc.minutes), indent: true });
            }
          }
          rows.push({ label: "TOTAL", hours: formatHoursClock(locationReport.grandTotalMinutes), pct: "100,0%", fill: SOFT.total, bold: true });
          for (const loc of locationReport.byLocation) {
            rows.push({ label: loc.location, hours: formatHoursClock(loc.minutes), pct: `${loc.percentage.toFixed(1)}%`, indent: true });
          }
          const pie = generatePieImageBase64(locationReport.byLocation);
          renderBlock("HORAS POR LOCAL DA REALIZAÇÃO", "Local da Realização", rows, pie);
        }
      }

      // Gerar arquivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = `Relatorio_Horas_${startDate}_${endDate}_${techName.replace(/\s+/g, "_")}.xlsx`;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `Relatório exportado como ${filename}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar o relatório",
        variant: "destructive",
      });
    }
  };

  const months = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - i);

  const categoryInfo = {
    efetivo: {
      title: "Trabalho Efetivo",
      icon: TrendingUp,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950/30",
      borderColor: "border-green-200 dark:border-green-800",
      accent: "#10B981",
    },
    adicional: {
      title: "Trabalho Adicional",
      icon: Clock,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
      borderColor: "border-yellow-200 dark:border-yellow-800",
      accent: "#F59E0B",
    },
    perda: {
      title: "Tempo Não Produtivo",
      icon: AlertCircle,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-50 dark:bg-red-950/30",
      borderColor: "border-red-200 dark:border-red-800",
      accent: "#DC2626",
    },
  };

  return (
    <div 
      ref={scrollContainerRef}
      className="flex flex-col h-full overflow-auto -m-4 md:-m-6 md:-mb-6 -mb-20"
      data-testid="reports-content"
    >
      {/* Sticky Header with hide-on-scroll */}
      <div 
        className={`
          sticky top-0 z-10 bg-background border-b
          transition-transform duration-300 ease-in-out
          ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}
        `}
        data-testid="reports-header"
      >
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Relatórios</h1>
            </div>
            <Button variant="outline" size="sm" data-testid="button-export" onClick={handleExportExcel} disabled={!report || isLoading}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6">
          <Tabs defaultValue="resumo" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="resumo" data-testid="tab-resumo">
                <FileBarChart className="h-4 w-4 mr-2" />
                Resumo
              </TabsTrigger>
              <TabsTrigger value="detalhamento" data-testid="tab-detalhamento">
                <List className="h-4 w-4 mr-2" />
                Detalhamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="resumo">
          {/* Filtros do Resumo */}
          <div className={`grid grid-cols-1 gap-3 mb-6 ${isAssistente ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
            {!isAssistente && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Técnico</label>
                <Select value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                  <SelectTrigger data-testid="select-technician">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Técnicos</SelectItem>
                    {technicians.map((tech: any) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Data Início
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Data Fim
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>

          {!isAssistente && (isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-4 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : report ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["efetivo", "adicional", "perda"] as const).map((category) => {
                const info = categoryInfo[category];
                const Icon = info.icon;
                const categoryBreakdown = report.breakdown.filter((b) => b.category === category);

                return (
                  <Card
                    key={category}
                    className="relative overflow-hidden hover-elevate"
                    data-testid={`card-category-${category}`}
                  >
                    <div className="absolute left-0 top-0 h-full w-1.5" style={{ backgroundColor: info.accent }} />
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${info.accent}1A`, color: info.accent }}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{info.title}</span>
                        </div>
                        <Badge
                          className="text-xs border-transparent"
                          style={{ backgroundColor: `${info.accent}1A`, color: info.accent }}
                          data-testid={`percentage-${category}`}
                        >
                          {report.percentages[category].toFixed(1)}%
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <div className="text-3xl font-bold tabular-nums" style={{ color: info.accent }} data-testid={`total-${category}`}>
                          {formatMinutes(report.totals[category])}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {report.totals[category]} minutos
                        </div>
                      </div>

                      {/* Activity Breakdown */}
                      {categoryBreakdown.length > 0 && (
                        <div className="space-y-2 pt-3 border-t">
                          <div className="text-xs font-medium text-muted-foreground">
                            Detalhamento:
                          </div>
                          <div className={`space-y-2 ${categoryBreakdown.length > 4 ? 'max-h-32 overflow-y-auto pr-1' : ''}`}>
                            {categoryBreakdown.map((activity, idx) => (
                              <div key={idx} className="space-y-1">
                                <div
                                  className="flex justify-between items-center text-sm gap-2"
                                  data-testid={`activity-${category}-${idx}`}
                                >
                                  <div className="flex items-center gap-1.5 truncate flex-1">
                                    {activity.isAutomatic && (
                                      <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" data-testid={`icon-automatic-${idx}`} />
                                    )}
                                    <span className="truncate">{activity.name}</span>
                                  </div>
                                  <span className="font-medium ml-2 flex-shrink-0">
                                    {formatMinutes(activity.minutes)}
                                  </span>
                                </div>
                                
                                {/* Display justifications for perda category */}
                                {activity.justifications && activity.justifications.length > 0 && (
                                  <div className="ml-5 space-y-1 mt-1" data-testid={`justifications-${category}-${idx}`}>
                                    {activity.justifications.map((just, jIdx) => (
                                      <div 
                                        key={jIdx}
                                        className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md"
                                        data-testid={`justification-${category}-${idx}-${jIdx}`}
                                      >
                                        <div className="font-medium text-destructive mb-0.5">
                                          {new Date(just.date).toLocaleDateString('pt-BR')} ({just.minutes} min)
                                        </div>
                                        <div className="italic">"{just.text}"</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Total Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Resumo Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">Total de Horas no Período</span>
                  <span className="text-2xl font-bold" data-testid="total-hours">
                    {formatMinutes(report.totalMinutes)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {new Date(startDate + 'T12:00:00').toLocaleDateString('pt-BR')} a {new Date(endDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                  {selectedTechnicianId !== "all" &&
                    technicians.length > 0 &&
                    ` - ${technicians.find((t: any) => t.id === selectedTechnicianId)?.name}`}
                </div>
              </CardContent>
            </Card>

            {/* Reschedule Statistics Card */}
            {rescheduleStats && rescheduleStats.totalReschedules > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RefreshCw className="h-5 w-5 text-amber-500" />
                    Reagendamentos no Período
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600" data-testid="total-reschedules">
                        {rescheduleStats.totalReschedules}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        Total de Reagendamentos
                        <RadixTooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                            Número total de vezes que atividades foram reagendadas no período. Se uma mesma atividade foi reagendada 2 vezes, conta como 2.
                          </TooltipContent>
                        </RadixTooltip>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600" data-testid="activities-rescheduled">
                        {rescheduleStats.activitiesRescheduled}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        Atividades Afetadas
                        <RadixTooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                            Quantas atividades diferentes foram reagendadas. Conta cada atividade uma única vez, independente de quantas vezes foi reagendada.
                          </TooltipContent>
                        </RadixTooltip>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600" data-testid="multiple-reschedules">
                        {rescheduleStats.activitiesWithMultipleReschedules}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        Múltiplos Reagend.
                        <RadixTooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                            Atividades que foram reagendadas mais de uma vez, indicando dificuldade em manter a agenda planejada.
                          </TooltipContent>
                        </RadixTooltip>
                      </div>
                    </div>
                  </div>
                  
                  {rescheduleStats.reasonBreakdown.length > 0 && (
                    <div className="border-t pt-3 mt-2">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Motivos:</div>
                      <div className="flex flex-wrap gap-2">
                        {rescheduleStats.reasonBreakdown.map((r, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {r.reason}: {r.count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {rescheduleStats.reschedules.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Detalhes dos Reagendamentos:</div>
                      <div className="space-y-2">
                        {rescheduleStats.reschedules.map((r) => (
                          <div key={r.id} className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-medium">{r.activityTitle || 'Atividade'}</span>
                              <Badge variant="outline" className="text-xs">
                                #{r.rescheduleNumber}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.clientName && <span>{r.clientName} | </span>}
                              {r.technicianName && <span>{r.technicianName}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <span className="text-red-500 line-through">
                                {new Date(r.previousDate).toLocaleDateString('pt-BR')}
                              </span>
                              <span>→</span>
                              <span className="text-green-600 font-medium">
                                {new Date(r.newDate).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Motivo:</span> {r.reason || 'Não informado'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Por {r.rescheduledByName || 'Sistema'} em {new Date(r.rescheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">Nenhum dado encontrado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ajuste os filtros de data ou adicione lançamentos de tempo
              </p>
            </CardContent>
          </Card>
        ))}

            {/* ===== Distribuição por Local de Realização e Categorização ===== */}
            {(() => {
              const catMeta: Record<string, { label: string; color: string }> = {
                efetivo: { label: "Efetivo", color: "#BBF7D0" },
                adicional: { label: "Adicional", color: "#FDE68A" },
                perda: { label: "Perda", color: "#FECACA" },
              };
              const palette = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#8b5cf6", "#14b8a6", "#f43f5e"];
              const pieData = (locationReport?.byLocation || []).map((l) => ({ name: l.location, value: l.minutes, percentage: l.percentage }));
              const pieDataCat = (locationReport?.byCategorization || []).map((c) => ({ name: c.categorization, value: c.minutes, percentage: c.percentage }));
              if (isLoadingLocation || !locationReport || locationReport.grandTotalMinutes === 0) return null;
              return (
                <div className="mt-6 space-y-6">
                  {!isAssistente && report && (
                  <div className="grid grid-cols-1 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Agregação de Valor</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={320}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Trabalho Efetivo", value: report.totals.efetivo },
                                { name: "Trabalho Adicional", value: report.totals.adicional },
                                { name: "Tempo Não Produtivo", value: report.totals.perda },
                              ]}
                              cx="50%" cy="50%" nameKey="name" dataKey="value" outerRadius={110}
                              label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`}
                            >
                              <Cell fill="#22c55e" />
                              <Cell fill="#eab308" />
                              <Cell fill="#ef4444" />
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => formatHoursClock(value)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                  )}

                  {!isAssistente && (
                  <div className="grid grid-cols-1 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">% por Tipo de Atividade</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={320}>
                          <PieChart>
                            <Pie data={pieDataCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={(entry: any) => `${entry.name}: ${entry.percentage.toFixed(1)}%`}>
                              {pieDataCat.map((_, i) => (<Cell key={i} fill={palette[i % palette.length]} />))}
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => formatHoursClock(value)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                  )}

                  <div className="grid grid-cols-1 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">% por Local da Realização</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={320}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={(entry: any) => `${entry.name}: ${entry.percentage.toFixed(1)}%`}>
                              {pieData.map((_, i) => (<Cell key={i} fill={palette[i % palette.length]} />))}
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => formatHoursClock(value)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              );
            })()}
            </TabsContent>

            <TabsContent value="detalhamento">
              {/* Filtros do Detalhamento */}
              <div className={`grid grid-cols-1 gap-3 mb-4 ${isAssistente ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                {!isAssistente && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Técnico</label>
                    <Select value={detailTechnicianId} onValueChange={setDetailTechnicianId}>
                      <SelectTrigger data-testid="select-technician-detail">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Técnicos</SelectItem>
                        {technicians.map((tech: any) => (
                          <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Data Início
                  </label>
                  <Input
                    type="date"
                    value={detailStartDate}
                    onChange={(e) => setDetailStartDate(e.target.value)}
                    data-testid="input-detail-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Data Fim
                  </label>
                  <Input
                    type="date"
                    value={detailEndDate}
                    onChange={(e) => setDetailEndDate(e.target.value)}
                    data-testid="input-detail-end-date"
                  />
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <List className="h-5 w-5" />
                    Detalhamento de Registros
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Filtros adicionais */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                      <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger data-testid="filter-category" className="h-9">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="efetivo">Efetivo</SelectItem>
                          <SelectItem value="adicional">Adicional</SelectItem>
                          <SelectItem value="perda">Perda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger data-testid="filter-type" className="h-9">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="timer">Execução</SelectItem>
                          <SelectItem value="ida_travel">IDA</SelectItem>
                          <SelectItem value="volta_travel">VOLTA</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Origem</label>
                      <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                        <SelectTrigger data-testid="filter-origin" className="h-9">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {detailReport?.entries && Array.from(new Set(detailReport.entries.map((e: any) => e.activityName))).filter(Boolean).map((name: string) => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-9 w-full"
                        onClick={() => {
                          setFilterCategory("all");
                          setFilterType("all");
                          setFilterOrigin("all");
                        }}
                        data-testid="button-clear-filters"
                      >
                        Limpar Filtros
                      </Button>
                    </div>
                  </div>

                  {isLoadingDetail ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : detailReport?.entries && detailReport.entries.length > 0 ? (() => {
                    const filteredEntries = detailReport.entries
                      .filter((entry: any) => {
                        if (filterCategory !== "all" && entry.category !== filterCategory) return false;
                        if (filterType !== "all" && entry.source !== filterType) return false;
                        if (filterOrigin !== "all" && entry.activityName !== filterOrigin) return false;
                        return true;
                      })
                      .sort((a: any, b: any) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());
                    
                    const filteredTotal = filteredEntries.reduce((sum: number, e: any) => sum + e.minutes, 0);
                    
                    return (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            {!isAssistente && <TableHead>Técnico</TableHead>}
                            <TableHead>Tipo</TableHead>
                            {!isAssistente && <TableHead>Categoria</TableHead>}
                            <TableHead>Origem</TableHead>
                            <TableHead className="text-right">Tempo</TableHead>
                            <TableHead>Observações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredEntries.length > 0 ? filteredEntries
                            .map((entry: any, idx: number) => {
                              const sourceLabels: Record<string, { label: string; icon: any }> = {
                                timer: { label: "Execução", icon: Timer },
                                ida_travel: { label: "IDA", icon: Navigation },
                                volta_travel: { label: "VOLTA", icon: Car },
                                manual: { label: "Manual", icon: Clock },
                              };
                              const sourceInfo = sourceLabels[entry.source] || { label: entry.source, icon: Clock };
                              const SourceIcon = sourceInfo.icon;
                              
                              const categoryColors: Record<string, string> = {
                                efetivo: "bg-green-100 text-green-800 border-green-300",
                                adicional: "bg-amber-100 text-amber-800 border-amber-300",
                                perda: "bg-red-100 text-red-800 border-red-300",
                              };
                              
                              return (
                                <TableRow key={entry.id || idx} data-testid={`entry-row-${idx}`}>
                                  <TableCell className="font-medium whitespace-nowrap">
                                    {new Date(entry.workDate).toLocaleDateString('pt-BR')}
                                  </TableCell>
                                  {!isAssistente && (
                                  <TableCell className="text-sm">
                                    {entry.technicianName || "-"}
                                  </TableCell>
                                  )}
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      <SourceIcon className="h-4 w-4 text-muted-foreground" />
                                      <span>{sourceInfo.label}</span>
                                    </div>
                                  </TableCell>
                                  {!isAssistente && (
                                  <TableCell>
                                    <Badge 
                                      variant="outline" 
                                      className={`${categoryColors[entry.category] || ""}`}
                                    >
                                      {entry.category === "efetivo" ? "Efetivo" : 
                                       entry.category === "adicional" ? "Adicional" : 
                                       entry.category === "perda" ? "Perda" : entry.category}
                                    </Badge>
                                  </TableCell>
                                  )}
                                  <TableCell>
                                    <span className="text-sm">{entry.activityName || "-"}</span>
                                  </TableCell>
                                  <TableCell className="text-right font-semibold whitespace-nowrap">
                                    {formatMinutes(entry.minutes)}
                                  </TableCell>
                                  <TableCell className="max-w-xs">
                                    <span className="text-sm text-muted-foreground truncate block" title={entry.notes || ""}>
                                      {entry.notes || "-"}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            }) : (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                  Nenhum registro encontrado com os filtros selecionados
                                </TableCell>
                              </TableRow>
                            )}
                        </TableBody>
                      </Table>
                      
                      <div className="mt-4 pt-4 border-t flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          Registros: {filteredEntries.length} de {detailReport.entries.length}
                        </span>
                        <span className="font-semibold">
                          Total filtrado: {formatMinutes(filteredTotal)}
                        </span>
                      </div>
                    </div>
                    );
                  })() : (
                    <div className="py-8 text-center">
                      <List className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Nenhum registro detalhado encontrado</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
      </div>
    </div>
  );
}
