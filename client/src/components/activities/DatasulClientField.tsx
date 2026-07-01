import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Search, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DatasulClientResult {
  codEmitente?: string;
  nome: string;
  cidade?: string;
  estado?: string;
  cnpj?: string;
}

interface BaseOption {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}

interface DatasulClientFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectClient: (client: DatasulClientResult) => void;
  baseOption?: BaseOption | null;
  placeholder?: string;
  grupo?: string;
}

const DATASUL_GRUPO_PADRAO = "71"; // Coatings

/**
 * Campo de cliente com busca AO VIVO na API do Datasul (ERP).
 * Usa o token Datasul guardado na sessão no login (sessionStorage).
 */
export function DatasulClientField({
  value,
  onChangeText,
  onSelectClient,
  baseOption,
  placeholder = "Digite para buscar cliente no Datasul...",
  grupo = DATASUL_GRUPO_PADRAO,
}: DatasulClientFieldProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DatasulClientResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const datasulToken = () => sessionStorage.getItem("astec_datasul_token");
  const datasulHost = () => sessionStorage.getItem("astec_datasul_host") || "erp.renner.com.br";

  useEffect(() => {
    if (!open) return;
    const term = (value || "").trim();
    if (term.length < 3) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const token = datasulToken();
      if (!token) {
        setError("Sessão do Datasul indisponível. Faça login via Datasul para buscar clientes.");
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const astecToken = localStorage.getItem("astec_token");
        const qs = new URLSearchParams({
          pagina: "1",
          tamanho: "20",
          host: datasulHost(),
          busca: term.toUpperCase(),
        });
        if (grupo) qs.append("grupo", grupo);
        const res = await fetch(`/api/datasul/clientes?${qs.toString()}`, {
          headers: {
            ...(astecToken ? { Authorization: `Bearer ${astecToken}` } : {}),
            "x-datasul-auth": token,
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erro ao buscar no Datasul");
        const mapped: DatasulClientResult[] = (data.clientes || []).map((c: any) => ({
          codEmitente: c["cod-emitente"],
          nome: c["nome-emit"] || c["nome-abrev"] || "",
          cidade: c["cidade"] || "",
          estado: c["estado"] || "",
          cnpj: c["cgc"] || "",
        }));
        setResults(mapped);
      } catch (e: any) {
        setError(e.message || "Erro ao buscar no Datasul");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, open, grupo]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={value || ""}
          onChange={(e) => {
            onChangeText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          data-testid="input-client-search"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 max-h-72 overflow-y-auto">
          <div className="p-2 space-y-1">
            {baseOption && (
              <div
                className="px-3 py-2 hover:bg-accent rounded-sm cursor-pointer border-b mb-1"
                onMouseDown={(e) => e.preventDefault()}
                onClick={baseOption.onSelect}
                data-testid="option-base-home-office"
              >
                <div className="flex items-center gap-2">
                  <Check className={cn("h-4 w-4 shrink-0", baseOption.selected ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="font-medium">{baseOption.label}</span>
                    {baseOption.description && (
                      <span className="text-xs text-muted-foreground">{baseOption.description}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && <div className="px-3 py-3 text-sm text-destructive">{error}</div>}

            {!error && !loading && (value || "").trim().length >= 3 && results.length === 0 && (
              <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                Nenhum cliente encontrado no Datasul para "{value}".
              </div>
            )}

            {!error && (value || "").trim().length < 3 && !baseOption && (
              <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                Digite ao menos 3 caracteres para buscar no Datasul.
              </div>
            )}

            {results.map((c, idx) => (
              <div
                key={`${c.codEmitente}-${idx}`}
                className="px-3 py-2 hover:bg-accent rounded-sm cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectClient(c);
                  setOpen(false);
                }}
                data-testid={`option-datasul-client-${c.codEmitente}`}
              >
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div className="flex flex-col">
                    <span className="font-medium leading-tight">{c.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {[c.cidade, c.estado].filter(Boolean).join("/")}
                      {c.cnpj ? ` · ${c.cnpj}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
