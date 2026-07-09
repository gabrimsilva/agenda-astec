import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { RATFormDialog } from "@/components/rats/RATFormDialog";
import { SimplifiedRATFormDialog } from "@/components/rats/SimplifiedRATFormDialog";
import { 
  FileText, 
  Search, 
  Calendar, 
  Building2, 
  Clock, 
  Eye, 
  Edit, 
  Trash2,
  Filter,
  ChevronDown,
  AlertCircle,
  User,
  Upload,
  FileUp,
  X,
  ClipboardList
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Rat, Activity, Technician, ActivityType } from "@shared/schema";
import moment from "moment";
import "moment/locale/pt-br";

moment.locale("pt-br");

const STATUS_CONFIG: Record<string, { 
  label: string; 
  bg: string; 
  text: string;
  border: string;
}> = {
  pendente: { 
    label: "Pendente", 
    bg: "bg-yellow-100 dark:bg-yellow-900/30", 
    text: "text-yellow-800 dark:text-yellow-200",
    border: "border-l-yellow-500"
  },
  rascunho: { 
    label: "Rascunho", 
    bg: "bg-orange-100 dark:bg-orange-900/30", 
    text: "text-orange-800 dark:text-orange-200",
    border: "border-l-orange-500"
  },
  completa: { 
    label: "Completa", 
    bg: "bg-blue-100 dark:bg-blue-900/30", 
    text: "text-blue-800 dark:text-blue-200",
    border: "border-l-blue-500"
  },
};

// Color for sent RATs (when sentAt is set)
const SENT_STYLE = {
  bg: "bg-green-100 dark:bg-green-900/30",
  text: "text-green-800 dark:text-green-200",
  border: "border-l-green-500"
};

export default function RATs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sentFilter, setSentFilter] = useState<string>("all"); // "all" | "sent" | "not_sent"
  const [typeFilter, setTypeFilter] = useState<string>("all"); // "all" | "completa" | "simplificada" | "pdf"
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [displayPage, setDisplayPage] = useState(1);
  
  // Period filter - default to last 3 months
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedRat, setSelectedRat] = useState<Rat | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ratToDelete, setRatToDelete] = useState<Rat | null>(null);
  
  // PDF import dialog state
  const [choiceDialogOpen, setChoiceDialogOpen] = useState(false);
  const [choiceActivity, setChoiceActivity] = useState<Activity | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfRatName, setPdfRatName] = useState("");
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  
  // Simplified RAT dialog state
  const [simplifiedFormDialogOpen, setSimplifiedFormDialogOpen] = useState(false);
  const [simplifiedActivity, setSimplifiedActivity] = useState<Activity | null>(null);
  const [simplifiedRat, setSimplifiedRat] = useState<Rat | null>(null);
  
  // Hide-on-scroll state for mobile PWA
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const rafId = useRef<number | null>(null);
  const isTouching = useRef(false);
  const isUsingPointer = useRef(false);
  const lastTouchEndTime = useRef(0);

  const { data: rats = [], isPending: ratsPending, isError: ratsError, isFetching: ratsRetrying, error: ratsErrorObj, refetch: refetchRats } = useQuery<Rat[]>({
    queryKey: ["/api/rats"],
    staleTime: 60 * 60 * 1000, // 1 hora - cache muito mais agressivo
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      // Se retornar 503 (aquecendo), retry com delay. Senão, não retry
      if (error?.status === 503 && failureCount < 5) {
        return true;
      }
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => {
      // Backoff: 2s, 4s, 8s, 16s, 32s
      return Math.min(2000 * Math.pow(2, attemptIndex), 60000);
    },
  });

  // Fetch activities with date range to include older activities
  const activitiesQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return `/api/activities?${params.toString()}`;
  }, [startDate, endDate]);
  
  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: [activitiesQueryUrl],
    staleTime: 60 * 60 * 1000, // 1 hora - cache muito mais agressivo
    retry: (failureCount, error: any) => {
      if (error?.status === 503 && failureCount < 5) return true;
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => Math.min(2000 * Math.pow(2, attemptIndex), 60000),
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    staleTime: 60 * 60 * 1000, // 1 hora - cache muito mais agressivo
    retry: (failureCount, error: any) => {
      if (error?.status === 503 && failureCount < 5) return true;
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => Math.min(2000 * Math.pow(2, attemptIndex), 60000),
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/activity-types"],
    staleTime: 60 * 60 * 1000, // 1 hora - cache muito mais agressivo
  });

  const myTechnician = useMemo(() => {
    return technicians.find((t) => t.userId === user?.id);
  }, [technicians, user?.id]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/rats/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({ title: "RAT excluída com sucesso" });
      setDeleteDialogOpen(false);
      setRatToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir RAT",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle sent status mutation
  const toggleSentMutation = useMutation({
    mutationFn: async ({ id, isSent }: { id: string; isSent: boolean }) => {
      return apiRequest("PUT", `/api/rats/${id}`, {
        sentAt: isSent ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // PDF upload mutation
  const uploadPdfMutation = useMutation({
    mutationFn: async ({ ratId, file }: { ratId: string; file: File }) => {
      const formData = new FormData();
      formData.append("pdf", file);
      
      const token = localStorage.getItem("astec_token");
      const response = await fetch(`/api/rats/${ratId}/pdf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao fazer upload do PDF");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({
        title: "PDF importado",
        description: "O PDF foi importado com sucesso.",
      });
      setChoiceDialogOpen(false);
      setChoiceActivity(null);
      setUploadingPdf(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao importar PDF",
        description: error.message,
        variant: "destructive",
      });
      setUploadingPdf(false);
      setChoiceDialogOpen(false);
      setChoiceActivity(null);
    },
  });

  const baseFilteredRats = useMemo(() => {
    let filtered = rats;

    // Filter by technician (admin only)
    if (isAdmin && technicianFilter !== "all") {
      filtered = filtered.filter((rat) => rat.technicianId === technicianFilter);
    }

    // Filter by sent status
    if (sentFilter === "sent") {
      filtered = filtered.filter((rat) => rat.sentAt);
    } else if (sentFilter === "not_sent") {
      filtered = filtered.filter((rat) => !rat.sentAt);
    }

    // Filter by type (completa/simplificada/pdf)
    if (typeFilter === "simplificada") {
      filtered = filtered.filter((rat) => (rat as any).isSimplified === true);
    } else if (typeFilter === "completa") {
      filtered = filtered.filter((rat) => !(rat as any).isSimplified && !rat.importedPdfUrl);
    } else if (typeFilter === "pdf") {
      filtered = filtered.filter((rat) => !!rat.importedPdfUrl);
    }

    // Filter by date range (using openDate which represents the activity/visit date)
    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      filtered = filtered.filter((rat) => {
        const ratDateStr = rat.openDate || rat.createdAt;
        const ratDate = new Date(ratDateStr);
        // Compare only dates, not times
        const ratDateOnly = new Date(ratDate.getFullYear(), ratDate.getMonth(), ratDate.getDate());
        const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        return ratDateOnly >= startDateOnly;
      });
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      filtered = filtered.filter((rat) => {
        const ratDateStr = rat.openDate || rat.createdAt;
        const ratDate = new Date(ratDateStr);
        // Compare only dates, not times
        const ratDateOnly = new Date(ratDate.getFullYear(), ratDate.getMonth(), ratDate.getDate());
        const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        return ratDateOnly <= endDateOnly;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (rat) =>
          rat.clientName?.toLowerCase().includes(query) ||
          rat.reportNumber.toLowerCase().includes(query) ||
          ((rat as any).reportNumberManual || "").toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [rats, sentFilter, typeFilter, searchQuery, technicianFilter, isAdmin, startDate, endDate]);

  const filteredRats = useMemo(() => {
    let filtered = baseFilteredRats;

    if (statusFilter !== "all") {
      filtered = filtered.filter((rat) => rat.status === statusFilter);
    }

    return [...filtered].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [baseFilteredRats, statusFilter]);

  // Reset display page whenever the filtered list changes (new filter applied)
  const PAGE_SIZE = 50;
  useEffect(() => {
    setDisplayPage(1);
  }, [statusFilter, sentFilter, typeFilter, searchQuery, technicianFilter, startDate, endDate]);

  const ratsToShow = filteredRats.slice(0, displayPage * PAGE_SIZE);
  const hasMoreRats = filteredRats.length > displayPage * PAGE_SIZE;

  // Activities without RAT (completed activities that don't have a RAT associated)
  // Only show activities that REQUIRE RAT (visitas técnicas)
  const typesRequiringRat = [
    "Visita técnica (corretiva ou RCs)",
    "Visitas técnicas (Preventiva ou teste)",
    "Preventivas",
    "Visitas técnicas ",
    "Teste",
    "Reclamação"
  ];
  
  const activitiesWithoutRat = useMemo(() => {
    const ratActivityIds = new Set(rats.map(r => r.activityId));
    
    return activities
      .filter((activity) => {
        // Only completed activities with work completed
        if (activity.status !== "concluido" || activity.workCompleted !== true) {
          return false;
        }
        // Only activities from this technician
        if (myTechnician && activity.technicianId !== myTechnician.id && user?.role !== "admin") {
          return false;
        }
        // Only activity types that require RAT (visitas técnicas)
        const activityType = activityTypes.find(at => at.id === activity.activityTypeId);
        if (!activityType || !typesRequiringRat.includes(activityType.name)) {
          return false;
        }
        // Exclude activities that already have a RAT
        return !ratActivityIds.has(activity.id);
      })
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  }, [activities, rats, myTechnician, user?.role, activityTypes]);

  const filteredActivitiesWithoutRat = useMemo(() => {
    if (isAdmin && technicianFilter !== "all") {
      return activitiesWithoutRat.filter((a) => a.technicianId === technicianFilter);
    }
    return activitiesWithoutRat;
  }, [activitiesWithoutRat, isAdmin, technicianFilter]);

  const statusCounts = useMemo(() => {
    const counts = baseFilteredRats.reduce((acc, rat) => {
      acc[rat.status] = (acc[rat.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return counts;
  }, [baseFilteredRats]);

  // MOBILE FIX: Track input modality (touch vs pointer) for hybrid devices
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      isTouching.current = true;
      isUsingPointer.current = false;
    };

    const handleTouchEnd = () => {
      isTouching.current = false;
      lastTouchEndTime.current = Date.now();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        isUsingPointer.current = true;
      }
    };

    const handleWheel = () => {
      isUsingPointer.current = true;
      lastTouchEndTime.current = 0;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const scrollKeys = ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '];
      if (scrollKeys.includes(e.key)) {
        isUsingPointer.current = true;
        lastTouchEndTime.current = 0;
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

  // Hide-on-scroll effect for mobile PWA
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (ticking.current) return;

      rafId.current = window.requestAnimationFrame(() => {
        const currentScrollY = container.scrollTop;
        const scrollDiff = currentScrollY - lastScrollY.current;
        const THRESHOLD = 10;

        // If user is actively touching, allow immediate response
        if (isTouching.current) {
          if (scrollDiff > THRESHOLD) {
            setIsHeaderVisible(false);
          } else if (scrollDiff < -THRESHOLD) {
            setIsHeaderVisible(true);
          }
        } else if (isUsingPointer.current) {
          // For mouse/trackpad: respond to any scroll
          if (scrollDiff > THRESHOLD) {
            setIsHeaderVisible(false);
          } else if (scrollDiff < -THRESHOLD) {
            setIsHeaderVisible(true);
          }
        } else {
          // For touch momentum: only show header if at top or significant upward scroll
          const timeSinceTouchEnd = Date.now() - lastTouchEndTime.current;
          const isMomentumScroll = timeSinceTouchEnd < 500;

          if (!isMomentumScroll) {
            if (scrollDiff > THRESHOLD) {
              setIsHeaderVisible(false);
            } else if (scrollDiff < -THRESHOLD) {
              setIsHeaderVisible(true);
            }
          } else {
            // During momentum: only show if scrolled to top
            if (currentScrollY <= 10) {
              setIsHeaderVisible(true);
            }
          }
        }

        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
      ticking.current = true;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const handleOpenRat = (rat: Rat) => {
    const activity = activities.find((a) => a.id === rat.activityId);
    
    // Check if RAT is simplified to open correct dialog
    if ((rat as any).isSimplified) {
      setSimplifiedRat(rat);
      setSimplifiedActivity(activity || null);
      setSimplifiedFormDialogOpen(true);
    } else {
      setSelectedRat(rat);
      setSelectedActivity(activity || null);
      setFormDialogOpen(true);
    }
  };

  const handleCreateRatFromActivity = (activity: Activity) => {
    // Open choice dialog for manual vs PDF
    setChoiceActivity(activity);
    setChoiceDialogOpen(true);
  };

  const handleChooseManual = () => {
    if (choiceActivity) {
      setSelectedRat(null);
      setSelectedActivity(choiceActivity);
      setFormDialogOpen(true);
      setChoiceDialogOpen(false);
      setChoiceActivity(null);
    }
  };

  const handleChoosePdf = () => {
    pdfInputRef.current?.click();
  };

  const handleChooseSimplified = () => {
    if (choiceActivity) {
      setSimplifiedRat(null);
      setSimplifiedActivity(choiceActivity);
      setSimplifiedFormDialogOpen(true);
      setChoiceDialogOpen(false);
      setChoiceActivity(null);
    }
  };

  const handleOpenSimplifiedFromPending = (rat: Rat) => {
    const activity = activities.find((a) => a.id === rat.activityId);
    setSimplifiedRat(rat);
    setSimplifiedActivity(activity || null);
    setSimplifiedFormDialogOpen(true);
  };

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !choiceActivity) {
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
      return;
    }
    
    if (file.type !== "application/pdf") {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo PDF.",
        variant: "destructive",
      });
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
      return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O PDF deve ter no máximo 5MB.",
        variant: "destructive",
      });
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
      return;
    }
    
    // Store the file and show name input dialog
    setPendingPdfFile(file);
    setPdfRatName("");
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
  };

  const handleConfirmPdfImport = async () => {
    if (!pendingPdfFile || !choiceActivity) return;
    
    setUploadingPdf(true);
    
    try {
      const token = localStorage.getItem("astec_token");
      const createResponse = await fetch("/api/rats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          activityId: choiceActivity.id,
          reportNumberManual: pdfRatName.trim() || undefined,
        }),
      });
      
      if (!createResponse.ok) {
        const data = await createResponse.json();
        throw new Error(data.error || "Erro ao criar RAT");
      }
      
      const newRat = await createResponse.json();
      
      // Now upload the PDF
      const formData = new FormData();
      formData.append("pdf", pendingPdfFile);
      
      const uploadResponse = await fetch(`/api/rats/${newRat.id}/pdf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        const data = await uploadResponse.json();
        await fetch(`/api/rats/${newRat.id}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        throw new Error(data.error || "Erro ao fazer upload do PDF");
      }

      await fetch(`/api/rats/${newRat.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: "completa" }),
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
      toast({
        title: "PDF importado",
        description: "O PDF foi importado com sucesso.",
      });
      setChoiceDialogOpen(false);
      setChoiceActivity(null);
      setPendingPdfFile(null);
      setPdfRatName("");
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleCancelPdfImport = () => {
    setPendingPdfFile(null);
    setPdfRatName("");
  };

  const handleUploadPdfToExistingRat = (rat: Rat) => {
    setSelectedRat(rat);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        uploadPdfMutation.mutate({ ratId: rat.id, file });
      }
    };
    input.click();
  };

  const handleViewPdf = async (rat: Rat) => {
    try {
      const token = localStorage.getItem("astec_token");
      const fileName = (rat as any).importedPdfFilename || `RAT-${(rat as any).reportNumberManual || rat.reportNumber}.pdf`;
      
      toast({
        title: "Carregando PDF...",
        description: "Por favor aguarde...",
        duration: 5000
      });
      
      // Fetch the PDF as blob
      const endpoint = rat.importedPdfUrl 
        ? `/api/rats/${rat.id}/download-imported-pdf`
        : `/api/rats/${rat.id}/pdf`;
      
      const response = await fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (!response.ok) {
        throw new Error("Erro ao carregar PDF");
      }
      
      const pdfBlob = await response.blob();
      
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
          } else {
            return; // User cancelled
          }
        }
      }
      
      // For iOS Safari (not PWA) or other browsers: open in new tab
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
    } catch (error: any) {
      toast({
        title: "Erro ao abrir PDF",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async (rat: Rat) => {
    try {
      const token = localStorage.getItem("astec_token");
      const reportNumber = (rat as any).reportNumberManual || rat.reportNumber;
      const fileName = `RAT-${reportNumber}.pdf`;

      toast({
        title: "Gerando PDF...",
        description: "Por favor aguarde...",
        duration: 5000,
      });

      const response = await fetch(`/api/rats/${rat.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Erro ao gerar PDF");
      }

      const pdfBlob = await response.blob();
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPWA =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });

      if (
        isIOS &&
        isPWA &&
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: fileName });
          toast({
            title: "PDF compartilhado!",
            description: "Selecione 'Salvar em Arquivos' para guardar o PDF.",
            duration: 4000,
          });
          return;
        } catch (shareError: any) {
          if (shareError.name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      toast({
        title: "Erro ao baixar PDF",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (rat: Rat) => {
    setRatToDelete(rat);
    setDeleteDialogOpen(true);
  };

  const handlePreview = async (rat: Rat) => {
    try {
      const token = localStorage.getItem('astec_token');
      // Navigate directly to preview URL (works on iOS/PWA)
      const previewUrl = `/api/rats/${rat.id}/preview?token=${encodeURIComponent(token || '')}`;
      window.open(previewUrl, '_blank');
    } catch (error) {
      toast({
        title: "Erro ao carregar visualização",
        description: "Não foi possível gerar a visualização da RAT.",
        variant: "destructive",
      });
    }
  };

  if (ratsPending) {
    return (
      <div className="container mx-auto p-4 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full pb-20 md:pb-6">
      <div className="container mx-auto px-4 max-w-4xl w-full flex flex-col flex-1 min-h-0">
        {/* Header fixo no topo (não rola junto com a lista) */}
        <div className="shrink-0 z-50 bg-background pt-4 pb-4 -mx-4 px-4 border-b shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4 pt-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <h1 className="text-lg sm:text-xl font-semibold truncate">RAT</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {ratsRetrying && !ratsError && (
                <span className="text-xs text-muted-foreground animate-pulse">Atualizando...</span>
              )}
              {ratsError && !ratsRetrying && (
                <Button size="sm" variant="outline" onClick={() => refetchRats()} data-testid="button-retry-rats">
                  <AlertCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                  Recarregar
                </Button>
              )}
              <Badge variant="outline" className="text-sm" data-testid="badge-total-rats">
                {baseFilteredRats.length} RAT
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <Card
                key={status}
                className={`cursor-pointer transition-all duration-200 border-2 ${
                  statusFilter === status 
                    ? "ring-2 ring-primary border-primary shadow-md scale-105" 
                    : "border-muted hover:border-primary/50 hover:shadow-sm"
                }`}
                onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                data-testid={`card-status-${status}`}
              >
                <CardContent className="p-4 text-center">
                  <div className={`text-3xl font-bold ${config.text} mb-2`}>
                    {statusCounts[status] || 0}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {config.label}
                  </div>
                  {statusFilter === status && (
                    <div className="text-[10px] text-primary font-semibold mt-2">
                      ✓ Selecionado
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Barra de busca e filtros */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente ou número..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-rats"
                />
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-toggle-filters">
                  <Filter className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-3">
              <Card className="p-4">
                <div className={`grid gap-4 ${isAdmin ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger data-testid="select-status-filter">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                          <SelectItem key={status} value={status}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Envio</label>
                    <Select value={sentFilter} onValueChange={setSentFilter}>
                      <SelectTrigger data-testid="select-sent-filter">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="sent">Enviadas</SelectItem>
                        <SelectItem value="not_sent">Não enviadas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Tipo</label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger data-testid="select-type-filter">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="completa">Completa</SelectItem>
                        <SelectItem value="simplificada">Simplificada</SelectItem>
                        <SelectItem value="pdf">PDF Importado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Técnico</label>
                      <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                        <SelectTrigger data-testid="select-technician-filter">
                          <SelectValue placeholder="Todos os técnicos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os técnicos</SelectItem>
                          {technicians.map((tech) => (
                            <SelectItem key={tech.id} value={tech.id}>
                              {tech.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Data Inicial</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Data Final</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Área rolável: somente a lista rola, o header acima fica fixo */}
        <div className="flex-1 min-h-0 overflow-auto -mx-4 px-4 pt-4">
        {/* Erro ao carregar RATs */}
        {ratsError && !ratsRetrying && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Erro ao carregar relatórios</p>
                    <p className="text-xs text-muted-foreground">
                      {ratsErrorObj instanceof Error ? ratsErrorObj.message : "Verifique sua conexão e tente novamente."}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => refetchRats()} data-testid="button-retry-rats-banner">
                  Recarregar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Atividades sem RAT */}
        {filteredActivitiesWithoutRat.length > 0 && (
          <Card className="mb-4 border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-base">Atividades sem RAT</CardTitle>
                </div>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                  {filteredActivitiesWithoutRat.length} pendente{filteredActivitiesWithoutRat.length > 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-sm text-muted-foreground mb-3">
                Atividades concluídas que ainda não possuem relatório. Clique para criar a RAT.
              </p>
              <div className="space-y-2">
                {filteredActivitiesWithoutRat.slice(0, 5).map((activity) => (
                  <Card 
                    key={activity.id}
                    className="p-3 hover-elevate cursor-pointer"
                    onClick={() => handleCreateRatFromActivity(activity)}
                    data-testid={`card-activity-no-rat-${activity.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium truncate">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{activity.clientName || "Cliente"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          <span>{moment(activity.scheduledDate).format("DD/MM/YYYY")}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0">
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Criar RAT
                      </Button>
                    </div>
                  </Card>
                ))}
                {filteredActivitiesWithoutRat.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{filteredActivitiesWithoutRat.length - 5} atividades adicionais
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de RATs */}
        {ratsError && rats.length === 0 && !ratsRetrying ? (
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Erro ao carregar relatórios</h3>
            <p className="text-muted-foreground mb-2">
              {ratsErrorObj instanceof Error ? ratsErrorObj.message : "Não foi possível carregar os relatórios."}
            </p>
            <p className="text-xs text-muted-foreground mb-4">Verifique sua conexão e tente novamente.</p>
            <Button variant="outline" onClick={() => refetchRats()} data-testid="button-retry-rats-empty">
              Tentar novamente
            </Button>
          </Card>
        ) : ratsPending ? (
          <Card className="p-8 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando relatórios...</p>
          </Card>
        ) : filteredRats.length === 0 ? (
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum relatório encontrado</h3>
            <p className="text-muted-foreground">
              {statusFilter !== "all" || typeFilter !== "all" || searchQuery
                ? "Tente ajustar os filtros de busca."
                : "Os relatórios serão criados automaticamente após concluir atividades."}
            </p>
          </Card>
        ) : (
          <div className="space-y-3 pb-4">
            {ratsToShow.map((rat) => {
              const isSent = !!rat.sentAt;
              // Use green colors when sent, otherwise use status-based colors
              const displayStyle = isSent ? SENT_STYLE : (STATUS_CONFIG[rat.status] || STATUS_CONFIG.pendente);
              const statusConfig = STATUS_CONFIG[rat.status] || STATUS_CONFIG.pendente;
              const activity = activities.find((a) => a.id === rat.activityId);
              const ratTechnician = technicians.find((t) => t.id === rat.technicianId);
              
              const hasImportedPdf = !!rat.importedPdfUrl;
              
              return (
                <Card
                  key={rat.id}
                  className={`border-l-4 ${displayStyle.border} ${hasImportedPdf ? '' : 'hover-elevate cursor-pointer'}`}
                  onClick={hasImportedPdf ? undefined : () => handleOpenRat(rat)}
                  data-testid={`card-rat-${rat.id}`}
                >
                  <CardContent className="p-4">
                    {/* Row 1: Header with badges and action buttons */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0 pt-1">
                        <span className="font-mono text-sm font-medium text-primary">
                          {(rat as any).reportNumberManual || rat.reportNumber}
                        </span>
                        <Badge className={`${statusConfig.bg} ${statusConfig.text} text-xs`}>
                          {statusConfig.label}
                        </Badge>
                        {isSent && (
                          <Badge className={`${SENT_STYLE.bg} ${SENT_STYLE.text} text-xs`}>
                            Enviada
                          </Badge>
                        )}
                        {(rat as any).isSimplified ? (
                          <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">
                            <ClipboardList className="h-3 w-3 mr-1" />
                            Simplificada
                          </Badge>
                        ) : rat.importedPdfUrl ? (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
                            <FileUp className="h-3 w-3 mr-1" />
                            PDF
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">
                            <FileText className="h-3 w-3 mr-1" />
                            Completa
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {/* View PDF button for imported PDFs */}
                        {rat.importedPdfUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewPdf(rat);
                            }}
                            title="Ver PDF importado"
                            data-testid={`button-view-pdf-${rat.id}`}
                          >
                            <Download className="h-4 w-4 text-purple-600" />
                          </Button>
                        )}
                        {/* Upload PDF button for RATs without PDF */}
                        {!rat.importedPdfUrl && !isSent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUploadPdfToExistingRat(rat);
                            }}
                            title="Importar PDF"
                            data-testid={`button-upload-pdf-${rat.id}`}
                          >
                            <FileUp className="h-4 w-4 text-purple-600" />
                          </Button>
                        )}
                        {/* Simplified RAT button for pending RATs */}
                        {rat.status === "pendente" && !rat.importedPdfUrl && !(rat as any).isSimplified && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSimplifiedFromPending(rat);
                            }}
                            title="Preencher RAT Simplificada"
                            data-testid={`button-simplified-rat-${rat.id}`}
                          >
                            <ClipboardList className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {/* Download PDF button for manually created RATs (Completa/Simplificada) */}
                        {!rat.importedPdfUrl && rat.status === "completa" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadPdf(rat);
                            }}
                            title="Baixar PDF"
                            data-testid={`button-download-pdf-${rat.id}`}
                          >
                            <Download className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        {/* Preview button for manually created RATs */}
                        {!rat.importedPdfUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreview(rat);
                            }}
                            data-testid={`button-preview-${rat.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {isSent ? (
                          <div className="w-9 h-9" /> 
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(rat);
                            }}
                            data-testid={`button-delete-${rat.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Row 2: Client name */}
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{rat.clientName || "Cliente não identificado"}</span>
                    </div>
                    
                    {/* Row 3: Metadata */}
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{moment(rat.openDate).format("DD/MM/YYYY")}</span>
                      </div>
                      {isAdmin && ratTechnician && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{ratTechnician.name}</span>
                        </div>
                      )}
                      {rat.sentAt && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Enviada: {moment(rat.sentAt).format("DD/MM HH:mm")}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Row 4: RAT enviada checkbox */}
                    {/* For imported PDFs: always show, marks as completa + sent */}
                    {/* For manual RATs: only show when status is completa */}
                    {(hasImportedPdf || rat.status === "completa") && (
                      <div 
                        className="flex items-center gap-2 mt-3 pt-3 border-t"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          id={`sent-${rat.id}`}
                          checked={isSent}
                          onCheckedChange={(checked) => {
                            if (hasImportedPdf) {
                              // For imported PDFs: set status to completa when marking as sent, keep completa when unmarking
                              if (checked) {
                                apiRequest("PUT", `/api/rats/${rat.id}`, { 
                                  status: "completa", 
                                  sentAt: new Date().toISOString() 
                                }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/rats"] }));
                              } else {
                                // Keep status as completa, just remove sentAt
                                apiRequest("PUT", `/api/rats/${rat.id}`, { 
                                  sentAt: null 
                                }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/rats"] }));
                              }
                            } else {
                              toggleSentMutation.mutate({ id: rat.id, isSent: !!checked });
                            }
                          }}
                          data-testid={`checkbox-sent-${rat.id}`}
                        />
                        <label 
                          htmlFor={`sent-${rat.id}`}
                          className="text-sm cursor-pointer select-none"
                        >
                          RAT enviada
                        </label>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Carregar mais / contador */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Exibindo {ratsToShow.length} de {filteredRats.length} RATs
              </p>
              {hasMoreRats && (
                <Button
                  variant="outline"
                  onClick={() => setDisplayPage((p) => p + 1)}
                  data-testid="button-load-more-rats"
                >
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Carregar mais ({filteredRats.length - ratsToShow.length} restantes)
                </Button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      <RATFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) {
            setSelectedRat(null);
            setSelectedActivity(null);
          }
        }}
        activity={selectedActivity}
        existingRat={selectedRat}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
        }}
      />

      <SimplifiedRATFormDialog
        open={simplifiedFormDialogOpen}
        onOpenChange={(open) => {
          setSimplifiedFormDialogOpen(open);
          if (!open) {
            setSimplifiedRat(null);
            setSimplifiedActivity(null);
          }
        }}
        activity={simplifiedActivity}
        existingRat={simplifiedRat}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/rats"] });
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir RAT?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o relatório{" "}
              <span className="font-medium">{(ratToDelete as any)?.reportNumberManual || ratToDelete?.reportNumber}</span>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => ratToDelete && deleteMutation.mutate(ratToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de escolha: Manual vs PDF */}
      <AlertDialog open={choiceDialogOpen} onOpenChange={(open) => {
        setChoiceDialogOpen(open);
        if (!open) {
          setChoiceActivity(null);
          setPendingPdfFile(null);
          setPdfRatName("");
        }
      }}>
        <AlertDialogContent className="max-w-md">
          {!pendingPdfFile ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Como deseja criar a RAT?</AlertDialogTitle>
                <AlertDialogDescription>
                  {choiceActivity && (
                    <span className="block mt-2">
                      <span className="font-medium">{choiceActivity.clientName}</span>
                      <br />
                      <span className="text-xs">{moment(choiceActivity.scheduledDate).format("DD/MM/YYYY")}</span>
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button
                  onClick={handleChooseManual}
                  className="h-auto py-4 flex items-center gap-3 justify-start"
                  variant="outline"
                  data-testid="button-choose-manual"
                >
                  <Edit className="h-5 w-5 text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">Preencher Manualmente</div>
                    <div className="text-xs text-muted-foreground font-normal">
                      Criar RAT usando o formulário completo
                    </div>
                  </div>
                </Button>
                <Button
                  onClick={handleChooseSimplified}
                  className="h-auto py-4 flex items-center gap-3 justify-start"
                  variant="outline"
                  data-testid="button-choose-simplified"
                >
                  <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">RAT Simplificada</div>
                    <div className="text-xs text-muted-foreground font-normal">
                      Relatório de visita com campos essenciais
                    </div>
                  </div>
                </Button>
                <Button
                  onClick={handleChoosePdf}
                  disabled={uploadingPdf || uploadPdfMutation.isPending}
                  className="h-auto py-4 flex items-center gap-3 justify-start"
                  variant="outline"
                  data-testid="button-choose-pdf"
                >
                  <Upload className="h-5 w-5 text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">
                      {uploadingPdf || uploadPdfMutation.isPending ? "Importando..." : "Importar PDF"}
                    </div>
                    <div className="text-xs text-muted-foreground font-normal">
                      Fazer upload de uma RAT já preenchida em PDF
                    </div>
                  </div>
                </Button>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-choice">Cancelar</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Identificar RAT</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block mt-2">
                    Arquivo: <span className="font-medium">{pendingPdfFile.name}</span>
                  </span>
                  <span className="block mt-1 text-xs">
                    Digite o número ou identificador da RAT (opcional)
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Ex: RAT-2025-001, F2-123, etc."
                  value={pdfRatName}
                  onChange={(e) => setPdfRatName(e.target.value)}
                  data-testid="input-pdf-rat-name"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Se não informar, será gerado um número automático.
                </p>
              </div>
              <AlertDialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancelPdfImport}
                  data-testid="button-back-choice"
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleConfirmPdfImport}
                  disabled={uploadingPdf}
                  data-testid="button-confirm-pdf-import"
                >
                  {uploadingPdf ? "Importando..." : "Importar PDF"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for PDF upload */}
      <input
        type="file"
        ref={pdfInputRef}
        accept="application/pdf"
        onChange={handlePdfFileChange}
        className="hidden"
        data-testid="input-pdf-file"
      />
    </div>
  );
}
