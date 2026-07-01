import { useState, useEffect, useCallback } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, Database, CheckCircle2, LogOut, Search, Download } from "lucide-react";

interface DatasulImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HOSTS = [
  { value: "erp.renner.com.br", label: "Produção (erp.renner.com.br)" },
  { value: "erp-homol.renner.com.br", label: "Homologação (erp-homol)" },
  { value: "erp-desenv.renner.com.br", label: "Desenvolvimento (erp-desenv)" },
];

interface DatasulSession {
  token: string;
  host: string;
  total: number | null;
  grupo: string | null;
}

interface DatasulClient {
  "cod-emitente"?: string;
  "nome-emit"?: string;
  "nome-abrev"?: string;
  "nom-fantasia"?: string;
  cgc?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  "e-mail"?: string;
}

interface DatasulMeta {
  total: number | null;
  pagina: number;
  tamPag: number;
  paginas: number | null;
  grupo: string | null;
}

const PAGE_SIZE = 50;

export function DatasulImportDialog({ open, onOpenChange }: DatasulImportDialogProps) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(HOSTS[0].value);
  const [grupo, setGrupo] = useState("71");
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<DatasulSession | null>(null);

  // Listagem
  const [clientes, setClientes] = useState<DatasulClient[]>([]);
  const [meta, setMeta] = useState<DatasulMeta | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  const astecToken = () => localStorage.getItem("astec_token");

  const handleLogin = async () => {
    if (!username || !password) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Informe usuário e senha do Datasul.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const t = astecToken();
      const res = await fetch("/api/datasul/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ username, password, host, grupo }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Não foi possível conectar ao Datasul.");
      }

      setSession({ token: data.token, host: data.host, total: data.total ?? null, grupo: data.grupo ?? null });
      setPassword("");
      setPage(1);
      setSearch("");
      setSearchInput("");
      toast({
        title: "Conectado ao Datasul",
        description: data.total != null
          ? `Conexão validada. ${data.total} clientes no escopo.`
          : "Conexão validada com sucesso.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Falha no login", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClientes = useCallback(
    async (sess: DatasulSession, pageNum: number, busca: string) => {
      setListLoading(true);
      try {
        const t = astecToken();
        const qs = new URLSearchParams({
          pagina: String(pageNum),
          tamanho: String(PAGE_SIZE),
          host: sess.host,
        });
        if (sess.grupo) qs.append("grupo", sess.grupo);
        if (busca) qs.append("busca", busca);

        const res = await fetch(`/api/datasul/clientes?${qs.toString()}`, {
          headers: {
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
            "x-datasul-auth": sess.token,
          },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Erro ao listar clientes.");
        }
        setClientes(data.clientes || []);
        setMeta(data.meta || null);
      } catch (error: any) {
        toast({ variant: "destructive", title: "Erro ao listar clientes", description: error.message });
        setClientes([]);
      } finally {
        setListLoading(false);
      }
    },
    [toast]
  );

  // Busca a lista quando conecta ou muda página/busca
  useEffect(() => {
    if (session) {
      fetchClientes(session, page, search);
    }
  }, [session, page, search, fetchClientes]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim().toUpperCase());
  };

  const handleImport = async () => {
    if (!session) return;
    setImporting(true);
    try {
      const t = astecToken();
      const res = await fetch("/api/datasul/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
          "x-datasul-auth": session.token,
        },
        body: JSON.stringify({ host: session.host, grupo: session.grupo }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao importar.");
      }
      invalidateClients();
      toast({
        title: "Importação concluída",
        description: `${data.created} novo(s), ${data.updated} atualizado(s) de ${data.processed} processado(s).`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro na importação", description: error.message });
    } finally {
      setImporting(false);
    }
  };

  const invalidateClients = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/clients"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["/api/clients/geocode-status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/map/clients"], refetchType: "all" });
  };

  // Importa uma lista de clientes (resultados da busca ou linha única).
  const importList = async (list: DatasulClient[]) => {
    if (!list.length) return;
    setImporting(true);
    try {
      const t = astecToken();
      const res = await fetch("/api/datasul/import-clientes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
          "x-datasul-auth": session?.token || "",
        },
        body: JSON.stringify({ clientes: list }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao importar.");
      }
      invalidateClients();
      toast({
        title: "Importado",
        description: `${data.created} novo(s), ${data.updated} atualizado(s).`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro na importação", description: error.message });
    } finally {
      setImporting(false);
    }
  };

  const handleDisconnect = () => {
    setSession(null);
    setUsername("");
    setPassword("");
    setClientes([]);
    setMeta(null);
    setPage(1);
    setSearch("");
    setSearchInput("");
  };

  const handleClose = (value: boolean) => {
    if (!value) setPassword("");
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={session ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-md"}
        data-testid="dialog-datasul-import"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Importar do Datasul
          </DialogTitle>
          <DialogDescription>
            {session
              ? "Clientes do ERP (Datasul). Use a busca para localizar por nome, CNPJ ou código."
              : "Entre com seu login do Datasul (mesmo do ERP) para conectar."}
          </DialogDescription>
        </DialogHeader>

        {!session ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="datasul-host">Ambiente</Label>
              <Select value={host} onValueChange={setHost}>
                <SelectTrigger id="datasul-host" data-testid="select-datasul-host">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOSTS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="datasul-grupo">Grupo de clientes (cod-gr-cli)</Label>
              <Input
                id="datasul-grupo"
                inputMode="numeric"
                placeholder="Ex.: 71 (Coatings) ou 88 (Alumínio)"
                value={grupo}
                onChange={(e) => setGrupo(e.target.value.replace(/\D/g, ""))}
                data-testid="input-datasul-grupo"
              />
              <p className="text-xs text-muted-foreground">
                Filtra a fábrica. 803 Coatings = 71, 881 Alumínio = 88. Deixe vazio para o escopo padrão do usuário.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="datasul-user">Usuário Datasul</Label>
              <Input
                id="datasul-user"
                autoComplete="off"
                placeholder="usuário do ERP"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-datasul-user"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="datasul-pass">Senha</Label>
              <Input
                id="datasul-pass"
                type="password"
                autoComplete="off"
                placeholder="senha do ERP"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                data-testid="input-datasul-pass"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Barra de status + busca */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-foreground font-medium">{session.host}</span>
                {session.grupo && <span>· grupo {session.grupo}</span>}
                {meta?.total != null && <span>· {meta.total} clientes</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 w-64"
                    placeholder="Nome, CNPJ ou código"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    data-testid="input-datasul-search"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleSearch} data-testid="button-datasul-search">
                  Buscar
                </Button>
                {clientes.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => importList(clientes)}
                    disabled={importing}
                    data-testid="button-datasul-import-results"
                  >
                    {importing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-1">Importar resultados</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Tabela */}
            <div className="rounded-md border max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-40">CNPJ</TableHead>
                    <TableHead className="w-44">Cidade/UF</TableHead>
                    <TableHead className="w-24 text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : clientes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        Nenhum cliente encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    clientes.map((c, idx) => (
                      <TableRow key={`${c["cod-emitente"]}-${idx}`} data-testid={`row-datasul-${c["cod-emitente"]}`}>
                        <TableCell className="font-mono text-xs">{c["cod-emitente"]}</TableCell>
                        <TableCell>
                          <div className="font-medium">{c["nome-emit"] || c["nome-abrev"]}</div>
                          {c["nom-fantasia"] && (
                            <div className="text-xs text-muted-foreground">{c["nom-fantasia"]}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{c.cgc}</TableCell>
                        <TableCell className="text-sm">
                          {[c.cidade, c.estado].filter(Boolean).join("/")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => importList([c])}
                            disabled={importing}
                            data-testid={`button-import-one-${c["cod-emitente"]}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Página {meta?.pagina ?? page}
                {meta?.total != null ? ` · ${meta.total}+ no escopo` : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={listLoading || page <= 1}
                  data-testid="button-datasul-prev"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={listLoading || clientes.length < PAGE_SIZE}
                  data-testid="button-datasul-next"
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!session ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} data-testid="button-datasul-cancel">
                Cancelar
              </Button>
              <Button onClick={handleLogin} disabled={isLoading} data-testid="button-datasul-login">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  "Conectar"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleDisconnect} data-testid="button-datasul-disconnect">
                <LogOut className="mr-2 h-4 w-4" />
                Desconectar
              </Button>
              <Button onClick={handleImport} disabled={importing} data-testid="button-datasul-import">
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Importar listagem
                    {meta?.total != null ? ` (${meta.total})` : ""}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
