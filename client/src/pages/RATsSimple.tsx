import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Calendar, User, Download, Trash2, Eye, Filter, Edit, Upload } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RATFormDialog } from "@/components/rats/RATFormDialog";
import { SimplifiedRATFormDialog } from "@/components/rats/SimplifiedRATFormDialog";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pendente: { label: "Pendente", bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-200", border: "border-l-yellow-500" },
  rascunho: { label: "Rascunho", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-200", border: "border-l-orange-500" },
  completa: { label: "Concluída", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200", border: "border-l-blue-500" },
};

const SENT_STYLE = {
  bg: "bg-green-100 dark:bg-green-900/30",
  text: "text-green-800 dark:text-green-200",
  border: "border-l-green-500"
};

export default function RATsSimple() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  
  const [rats, setRats] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sentFilter, setSentFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  const [selectedRat, setSelectedRat] = useState<any | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [simplifiedFormDialogOpen, setSimplifiedFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ratToDelete, setRatToDelete] = useState<any | null>(null);
  
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const fetchData = () => {
    const token = localStorage.getItem('astec_token');
    
    Promise.all([
      fetch('/api/rats', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }).then(res => res.json()),
      fetch('/api/activities', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }).then(res => res.json()),
      fetch('/api/technicians', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }).then(res => res.json())
    ])
      .then(([ratsData, activitiesData, techsData]) => {
        setRats(ratsData);
        setActivities(activitiesData);
        setTechnicians(techsData);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenRat = (rat: any) => {
    const activity = activities.find(a => a.id === rat.activityId);
    
    if (rat.isSimplified) {
      setSelectedRat(rat);
      setSelectedActivity(activity || null);
      setSimplifiedFormDialogOpen(true);
    } else {
      setSelectedRat(rat);
      setSelectedActivity(activity || null);
      setFormDialogOpen(true);
    }
  };

  const handleDownloadPdf = async (rat: any) => {
    try {
      const token = localStorage.getItem('astec_token');
      const reportNumber = rat.reportNumberManual || rat.reportNumber;
      const fileName = `RAT-${reportNumber}.pdf`;

      toast({
        title: "Gerando PDF...",
        description: "Por favor aguarde...",
        duration: 5000
      });

      const endpoint = rat.hasPdf 
        ? `/api/rats/${rat.id}/download-imported-pdf`
        : `/api/rats/${rat.id}/pdf`;

      const response = await fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Erro ao gerar PDF");
      }

      const pdfBlob = await response.blob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({
        title: "PDF baixado!",
        description: fileName,
        duration: 3000
      });
    } catch (error: any) {
      toast({
        title: "Erro ao baixar PDF",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePreview = async (rat: any) => {
    try {
      const token = localStorage.getItem('astec_token');
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

  const handleDeleteClick = (rat: any) => {
    setRatToDelete(rat);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ratToDelete) return;

    try {
      const token = localStorage.getItem('astec_token');
      const response = await fetch(`/api/rats/${ratToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao excluir RAT');
      }

      toast({
        title: "RAT excluída",
        description: "A RAT foi excluída com sucesso.",
      });

      fetchData();
      setDeleteDialogOpen(false);
      setRatToDelete(null);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUploadPdfToRat = (rat: any) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const token = localStorage.getItem('astec_token');
          const formData = new FormData();
          formData.append("pdf", file);

          toast({
            title: "Importando PDF...",
            description: "Por favor aguarde...",
            duration: 5000
          });

          const response = await fetch(`/api/rats/${rat.id}/pdf`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });

          if (!response.ok) {
            throw new Error("Erro ao fazer upload do PDF");
          }

          toast({
            title: "PDF importado!",
            description: "O PDF foi anexado à RAT com sucesso.",
          });

          fetchData();
        } catch (error: any) {
          toast({
            title: "Erro ao importar PDF",
            description: error.message,
            variant: "destructive",
          });
        }
      }
    };
    input.click();
  };

  const filteredRats = useMemo(() => {
    let filtered = rats;

    if (isAdmin && technicianFilter !== "all") {
      filtered = filtered.filter(r => r.technicianId === technicianFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    if (sentFilter === "sent") {
      filtered = filtered.filter(r => r.sentAt);
    } else if (sentFilter === "not_sent") {
      filtered = filtered.filter(r => !r.sentAt);
    }

    if (typeFilter === "simplificada") {
      filtered = filtered.filter(r => r.isSimplified === true);
    } else if (typeFilter === "completa") {
      filtered = filtered.filter(r => !r.isSimplified && !r.hasPdf);
    } else if (typeFilter === "pdf") {
      filtered = filtered.filter(r => r.hasPdf);
    }

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      filtered = filtered.filter(r => {
        const ratDate = new Date(r.openDate || r.createdAt);
        return ratDate >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      filtered = filtered.filter(r => {
        const ratDate = new Date(r.openDate || r.createdAt);
        return ratDate <= end;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.clientName?.toLowerCase().includes(query) ||
        r.reportNumber.toLowerCase().includes(query) ||
        (r.reportNumberManual || "").toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rats, statusFilter, sentFilter, typeFilter, technicianFilter, searchQuery, startDate, endDate, isAdmin]);

  const statusCounts = useMemo(() => {
    return rats.reduce((acc, rat) => {
      acc[rat.status] = (acc[rat.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [rats]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 max-w-6xl space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-64"></div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 max-w-6xl">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-600">Erro ao carregar RATs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Tentar Novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">RAT</h1>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {filteredRats.length} RAT
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all ${
              statusFilter === status
                ? "ring-2 ring-primary shadow-lg"
                : "hover:shadow-md"
            }`}
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
          >
            <CardContent className="p-6 text-center">
              <div className={`text-4xl font-bold mb-2 ${config.text}`}>
                {statusCounts[status] || 0}
              </div>
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {config.label}
              </div>
              {statusFilter === status && (
                <div className="text-xs text-primary font-semibold mt-2">✓ Selecionado</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Buscar por cliente ou número..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-3"
            />
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon">
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
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <SelectItem key={status} value={status}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Envio</label>
                <Select value={sentFilter} onValueChange={setSentFilter}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os técnicos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os técnicos</SelectItem>
                      {technicians.map(tech => (
                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
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
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Data Final</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* RAT Cards */}
      <div className="space-y-3">
        {filteredRats.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhuma RAT encontrada.
            </CardContent>
          </Card>
        ) : (
          filteredRats.map((rat) => {
            const tech = technicians.find(t => t.id === rat.technicianId);
            const statusConfig = rat.sentAt ? SENT_STYLE : STATUS_CONFIG[rat.status];
            
            return (
              <Card key={rat.id} className={`border-l-4 ${statusConfig?.border} hover:shadow-md transition-shadow`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-lg">{rat.reportNumber}</span>
                        {rat.reportNumberManual && (
                          <Badge variant="outline">{rat.reportNumberManual}</Badge>
                        )}
                        <Badge className={`${statusConfig?.bg} ${statusConfig?.text}`}>
                          {rat.sentAt ? "Enviada" : STATUS_CONFIG[rat.status]?.label}
                        </Badge>
                        {rat.isSimplified && (
                          <Badge variant="outline">Simplificada</Badge>
                        )}
                        {rat.hasPdf && (
                          <Badge variant="outline" className="gap-1">
                            <FileText className="h-3 w-3" /> PDF
                          </Badge>
                        )}
                      </div>
                      <div className="font-semibold">{rat.clientName}</div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(rat.openDate || rat.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                        {tech && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {tech.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!rat.hasPdf && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenRat(rat)}
                            title="Editar/Visualizar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePreview(rat)}
                            title="Visualizar Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadPdf(rat)}
                        title="Baixar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {!rat.hasPdf && !rat.sentAt && rat.status === 'pendente' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleUploadPdfToRat(rat)}
                          title="Importar PDF"
                        >
                          <Upload className="h-4 w-4 text-purple-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(rat)}
                        title="Excluir"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      <RATFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) {
            setSelectedRat(null);
            setSelectedActivity(null);
            fetchData();
          }
        }}
        rat={selectedRat}
        activity={selectedActivity}
      />

      <SimplifiedRATFormDialog
        open={simplifiedFormDialogOpen}
        onOpenChange={(open) => {
          setSimplifiedFormDialogOpen(open);
          if (!open) {
            setSelectedRat(null);
            setSelectedActivity(null);
            fetchData();
          }
        }}
        rat={selectedRat}
        activity={selectedActivity}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a RAT {ratToDelete?.reportNumber}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
