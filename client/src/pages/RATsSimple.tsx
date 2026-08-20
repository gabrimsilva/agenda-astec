import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Pendente", bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-200" },
  rascunho: { label: "Rascunho", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-200" },
  completa: { label: "Concluída", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200" },
};

export default function RATsSimple() {
  const [rats, setRats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const token = localStorage.getItem('astec_token');
    
    fetch('/api/rats', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        setRats(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filteredRats = rats
    .filter(rat => statusFilter === "all" || rat.status === statusFilter)
    .filter(rat => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        rat.clientName?.toLowerCase().includes(query) ||
        rat.reportNumber.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const statusCounts = rats.reduce((acc, rat) => {
    acc[rat.status] = (acc[rat.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="container mx-auto p-4 max-w-6xl">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-64"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>)}
          </div>
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
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">RATs</h1>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {filteredRats.length} RAT{filteredRats.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all ${
              statusFilter === status
                ? "ring-2 ring-primary shadow-lg scale-105"
                : "hover:shadow-md"
            }`}
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
          >
            <CardContent className="p-6 text-center">
              <div className="text-4xl font-bold mb-2">{statusCounts[status] || 0}</div>
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

      {/* Search */}
      <div className="flex gap-4">
        <Input
          placeholder="Buscar por cliente ou número..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <SelectItem key={status} value={status}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filteredRats.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma RAT encontrada.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Número</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Cliente</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Data</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Enviado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRats.map((rat) => (
                    <tr key={rat.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm">{rat.reportNumber}</td>
                      <td className="px-4 py-3 text-sm">{rat.clientName}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${STATUS_CONFIG[rat.status]?.bg} ${STATUS_CONFIG[rat.status]?.text}`}>
                          {STATUS_CONFIG[rat.status]?.label || rat.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(rat.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        {rat.sentAt ? (
                          <Badge className="bg-green-100 text-green-800">
                            ✓ Enviado
                          </Badge>
                        ) : (
                          <Badge variant="outline">Não enviado</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
