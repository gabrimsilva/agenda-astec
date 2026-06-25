import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { queryClient, apiUpload } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface ImportClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportClientsDialog({ open, onOpenChange }: ImportClientsDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);
    
    // Parse Excel file for preview
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        setPreview(jsonData.slice(0, 5)); // Show first 5 rows
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erro ao ler arquivo",
          description: "Não foi possível processar o arquivo Excel",
        });
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Nenhum arquivo selecionado");
      
      // Parse Excel to JSON
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            const formData = new FormData();
            formData.append("file", file);
            formData.append("data", JSON.stringify(jsonData));
            
            // Use centralized apiUpload helper for consistent auth and error handling
            const response = await apiUpload("POST", "/api/clients/import", formData);
            const result = await response.json();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.readAsArrayBuffer(file);
      });
    },
    onSuccess: (data: any) => {
      setResult(data);
      queryClient.invalidateQueries({ 
        queryKey: ["/api/clients"],
        refetchType: 'all'
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/map/clients"],
        refetchType: 'all'
      });
      const parts = [];
      if (data.imported > 0) parts.push(`${data.imported} novo(s)`);
      if (data.updated > 0) parts.push(`${data.updated} atualizado(s)`);
      toast({
        title: "Importação concluída",
        description: parts.length > 0 ? `Clientes: ${parts.join(', ')}` : "Nenhum cliente processado",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description: error.message,
      });
    },
  });

  const handleImport = () => {
    importMutation.mutate();
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const template = [
      {
        "Nome da Empresa": "Exemplo Empresa Ltda",
        "CNPJ": "12.345.678/0001-90",
        "Região": "COSTE/NORTE",
        "Segmento": "POWDER",
        "Nome do Contato": "João Silva",
        "Telefone do Contato": "(11) 98765-4321",
        "Email do Contato": "joao@exemplo.com",
        "CEP": "01310-100",
        "Endereço": "Av. Paulista",
        "Número": "1000",
        "Bairro": "Bela Vista",
        "Cidade": "São Paulo",
        "Estado": "SP",
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(template);
    
    // Ajustar largura das colunas
    ws['!cols'] = [
      { wch: 25 }, // Nome da Empresa
      { wch: 20 }, // CNPJ
      { wch: 15 }, // Região
      { wch: 15 }, // Segmento
      { wch: 20 }, // Nome do Contato
      { wch: 18 }, // Telefone do Contato
      { wch: 25 }, // Email do Contato
      { wch: 12 }, // CEP
      { wch: 25 }, // Endereço
      { wch: 10 }, // Número
      { wch: 18 }, // Bairro
      { wch: 18 }, // Cidade
      { wch: 5 },  // Estado
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo_importacao_clientes.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-import-clients">
        <DialogHeader>
          <DialogTitle>Importar Clientes via Excel</DialogTitle>
          <DialogDescription>
            Faça upload de uma planilha Excel (.xlsx) com os dados dos clientes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Download */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Modelo de Importação</p>
                    <p className="text-sm text-muted-foreground">
                      Baixe o modelo com as colunas corretas
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  data-testid="button-download-template"
                >
                  Baixar Modelo
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <div className="space-y-2">
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center w-full h-32 px-4 transition border-2 border-dashed rounded-lg appearance-none cursor-pointer hover:border-primary/50 focus:outline-none"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                <p className="mb-2 text-sm">
                  <span className="font-semibold">Clique para fazer upload</span> ou arraste e solte
                </p>
                <p className="text-xs text-muted-foreground">Arquivo Excel (.xlsx)</p>
              </div>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-file-upload"
              />
            </label>
            {file && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileSpreadsheet className="h-5 w-5" />
                <span className="text-sm font-medium">{file.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {(file.size / 1024).toFixed(1)} KB
                </Badge>
              </div>
            )}
          </div>

          {/* Preview */}
          {preview.length > 0 && !result && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Pré-visualização (primeiras 5 linhas)</h4>
              <div className="rounded-md border max-h-60 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(preview[0]).slice(0, 4).map((key) => (
                        <TableHead key={key} className="text-xs">{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, idx) => (
                      <TableRow key={idx}>
                        {Object.values(row).slice(0, 4).map((val: any, i) => (
                          <TableCell key={i} className="text-xs">{val?.toString() || "-"}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Import Progress */}
          {importMutation.isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importando clientes...</span>
                <span className="text-muted-foreground">Processando</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          )}

          {/* Result */}
          {result && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <h4 className="font-medium">Importação Concluída</h4>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-green-600">{result.imported}</span>
                    <span className="text-sm text-muted-foreground">Clientes importados</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold">{result.total}</span>
                    <span className="text-sm text-muted-foreground">Total processado</span>
                  </div>
                  {result.invalidRows && result.invalidRows.length > 0 && (
                    <div className="flex flex-col">
                      <span className="text-2xl font-bold text-orange-600">{result.invalidRows.length}</span>
                      <span className="text-sm text-muted-foreground">Linhas com erro</span>
                    </div>
                  )}
                </div>

                {result.invalidRows && result.invalidRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      Erros encontrados
                    </div>
                    <div className="max-h-40 overflow-auto space-y-2">
                      {result.invalidRows.map((error: any, idx: number) => (
                        <div key={idx} className="text-sm p-2 bg-orange-50 dark:bg-orange-950/20 rounded border border-orange-200 dark:border-orange-900">
                          <span className="font-medium">Linha {error.row}:</span> {error.errors.join(", ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-close"
          >
            {result ? "Fechar" : "Cancelar"}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              data-testid="button-import"
            >
              {importMutation.isPending ? "Importando..." : "Importar Clientes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
