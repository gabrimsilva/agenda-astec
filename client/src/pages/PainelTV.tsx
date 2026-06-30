import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Users,
  MapPin,
  Clock,
  RefreshCw,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Wifi,
  WifiOff,
  Building2,
  CalendarClock,
} from "lucide-react";

// ============================================================================
// Painel TV — Dashboard de campo em formato de tabela
//
// Substitui a ideia do mapa (descartada por imprecisão do GPS) por uma visão
// "bater o olho": mostra, por técnico, onde ele está (cliente/atividade),
// cidade/UF e a próxima visita do dia. Pensado para uma TV em modo tela cheia.
// Reaproveita os mesmos endpoints do Mapa TV:
//   - GET /api/technicians/status  (status + base + última localização)
//   - GET /api/map/activities      (atividades do dia, com cliente/cidade)
// ============================================================================

interface TechnicianStatus {
  technicianId: string;
  name: string;
  team: string | null;
  color: string | null;
  baseCity: string | null;
  status: string; // online | offline
  gpsStatus: string; // ativo | inativo
  currentActivityStatus: string | null; // emExecucao | aCaminho | null
  lastLocation: {
    city: string | null;
    address: string | null;
    updatedAt: Date;
  } | null;
}

interface Activity {
  id: string;
  title: string;
  scheduledDate: string;
  scheduledTime?: string;
  endTime?: string;
  status: string; // planejado | aCaminho | emExecucao | concluido | reprovado | cancelado
  technicianId: string;
  clientName?: string;
  address?: string;
  activityTypeName?: string;
  clientCity?: string | null;
  clientState?: string | null;
}

type StatusKey = "emExecucao" | "aCaminho" | "scheduled" | "online" | "offline";

const STATUS_META: Record<StatusKey, { label: string; dot: string; text: string; rank: number }> = {
  emExecucao: { label: "Em atividade", dot: "bg-orange-500", text: "text-orange-300", rank: 0 },
  aCaminho: { label: "Em rota", dot: "bg-blue-500", text: "text-blue-300", rank: 1 },
  scheduled: { label: "Em horário", dot: "bg-amber-400", text: "text-amber-300", rank: 2 },
  online: { label: "Disponível", dot: "bg-emerald-500", text: "text-emerald-300", rank: 3 },
  offline: { label: "Offline", dot: "bg-slate-500", text: "text-slate-400", rank: 4 },
};

function toMinutes(value?: string | null): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function formatTime(value?: string | null): string {
  if (!value) return "";
  // scheduledTime vem como "HH:MM" (startTime)
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  return value;
}

export default function PainelTV() {
  const [, navigate] = useLocation();
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Data "hoje" derivada do relógio (vira o dia automaticamente à meia-noite,
  // mesmo com o painel aberto direto na TV). Como é string, a query só refaz
  // quando o dia realmente muda.
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const activitiesQueryUrl = `/api/map/activities?startDate=${today}&endDate=${today}&resolveCity=1`;

  const { data: technicians = [], isLoading } = useQuery<TechnicianStatus[]>({
    queryKey: ["/api/technicians/status"],
    refetchInterval: 30000,
    refetchIntervalInBackground: true, // continua atualizando mesmo sem foco (TV/kiosk)
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/map/activities", today],
    queryFn: async () => {
      const token = localStorage.getItem("astec_token");
      const res = await fetch(activitiesQueryUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch activities");
      return res.json();
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true, // continua atualizando mesmo sem foco (TV/kiosk)
  });

  // Relógio (atualiza a cada segundo)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Socket.IO para refresh em tempo real
  useEffect(() => {
    const token = localStorage.getItem("astec_token");
    if (!token) {
      setWsConnected(false);
      return;
    }

    const socket = io({
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => setWsConnected(true));
    socket.on("disconnect", () => setWsConnected(false));
    socket.on("connect_error", () => setWsConnected(false));

    socket.on("location_update", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/status"] });
      setLastUpdate(new Date());
    });
    socket.on("activity_update", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/activities", today] });
      setLastUpdate(new Date());
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [today]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Monta linhas: por técnico, junta atividades do dia
  const rows = useMemo(() => {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const isRealClient = (name?: string) =>
      !!name && name.trim() !== "" && name !== "Cliente Desconhecido";

    // Nome a exibir na coluna "Cliente atual": mesmo valor do campo "Cliente"
    // da atividade (já inclui "Base do técnico (Home office)" quando aplicável).
    const displayName = (a: Activity) =>
      isRealClient(a.clientName) ? (a.clientName as string) : a.clientName || a.title || "—";

    return technicians
      .map((tech) => {
        const techActivities = activities
          .filter((a) => a.technicianId === tech.technicianId)
          .filter((a) => a.status !== "cancelado" && a.status !== "reprovado");

        // 1) Atividade atual por check-in real (GPS/status)
        let current =
          techActivities.find((a) => a.status === "emExecucao") ||
          techActivities.find((a) => a.status === "aCaminho") ||
          null;
        let bySchedule = false;

        // 2) Sem check-in, usa a AGENDA: atividade cuja janela de horário
        //    (início~fim) contém o horário atual. Respeita o agendamento.
        if (!current) {
          current =
            techActivities.find((a) => {
              if (a.status === "concluido") return false;
              const start = toMinutes(a.scheduledTime);
              const end = toMinutes(a.endTime);
              if (start === null) return false;
              const effectiveEnd = end !== null && end > start ? end : start + 60;
              return nowMinutes >= start && nowMinutes <= effectiveEnd;
            }) || null;
          if (current) bySchedule = true;
        }

        // Próxima visita / pendência: atividades planejadas (não concluídas) que
        // não sejam a atual. Prioriza as que ainda vão começar; se todas já
        // passaram do horário, mostra a mais antiga pendente (em atraso) para
        // que o agendamento não desapareça do painel.
        const pending = techActivities
          .filter((a) => a.status === "planejado" && a.id !== current?.id)
          .sort((a, b) => (toMinutes(a.scheduledTime) ?? 0) - (toMinutes(b.scheduledTime) ?? 0));

        const nextVisit =
          pending.find((a) => (toMinutes(a.scheduledTime) ?? 0) >= nowMinutes) ||
          pending[0] ||
          null;

        // Status: check-in real > em horário (agenda) > disponível > offline
        let statusKey: StatusKey;
        if (tech.currentActivityStatus === "emExecucao") statusKey = "emExecucao";
        else if (tech.currentActivityStatus === "aCaminho") statusKey = "aCaminho";
        else if (bySchedule) statusKey = "scheduled";
        else if (tech.status === "online" && tech.gpsStatus === "ativo") statusKey = "online";
        else statusKey = "offline";

        // Cidade/UF da ATIVIDADE do agendamento (não a base/localização do
        // técnico). Usa a atividade atual; se não houver, a próxima/pendente.
        const locationActivity = current || nextVisit;
        let location = "";
        if (locationActivity) {
          const city = (locationActivity.clientCity || "").trim();
          const state = (locationActivity.clientState || "").trim();
          if (city && state && !city.toUpperCase().includes(state.toUpperCase())) {
            location = `${city}/${state}`;
          } else {
            location = city || state;
          }
        }

        const totalToday = techActivities.length;
        const doneToday = techActivities.filter((a) => a.status === "concluido").length;

        return {
          tech,
          statusKey,
          current,
          currentDisplayName: current ? displayName(current) : null,
          nextVisit,
          nextVisitName: nextVisit ? displayName(nextVisit) : null,
          location,
          totalToday,
          doneToday,
        };
      })
      .sort((a, b) => {
        const r = STATUS_META[a.statusKey].rank - STATUS_META[b.statusKey].rank;
        if (r !== 0) return r;
        return a.tech.name.localeCompare(b.tech.name);
      });
  }, [technicians, activities, now]);

  const activeCount = rows.filter(
    (r) => r.statusKey === "emExecucao" || r.statusKey === "aCaminho" || r.statusKey === "scheduled"
  ).length;

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-2xl flex items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin" />
          Carregando Painel...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen bg-slate-950 text-white flex flex-col overflow-hidden"
      data-testid="painel-tv-container"
    >
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            title="Voltar"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-rose-500" />
              Painel de Campo — ASTEC
            </h1>
            <p className="text-sm text-slate-400">
              Acompanhamento de assistentes técnicos em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800">
            <Users className="h-5 w-5 text-rose-400" />
            <span className="text-lg font-semibold">{activeCount}</span>
            <span className="text-sm text-slate-400">em campo</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 tabular-nums">
            <Clock className="h-5 w-5 text-slate-400" />
            <span className="text-lg font-semibold">
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800"
            title={lastUpdate ? `Última atualização: ${lastUpdate.toLocaleTimeString("pt-BR")}` : undefined}
          >
            {wsConnected ? (
              <Wifi className="h-5 w-5 text-emerald-400" />
            ) : (
              <WifiOff className="h-5 w-5 text-slate-500" />
            )}
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            title="Tela cheia"
            data-testid="button-fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Tabela */}
      <main className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 text-sm uppercase tracking-wide">
            <tr className="border-b border-slate-800">
              <th className="text-left font-semibold px-6 py-4 w-[22%]">Técnico</th>
              <th className="text-left font-semibold px-6 py-4 w-[14%]">Status</th>
              <th className="text-left font-semibold px-6 py-4 w-[22%]">Cliente atual</th>
              <th className="text-left font-semibold px-6 py-4 w-[16%]">Atividade</th>
              <th className="text-left font-semibold px-6 py-4 w-[12%]">Cidade/UF</th>
              <th className="text-left font-semibold px-6 py-4 w-[14%]">Próxima visita</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-slate-500 text-lg">
                  Nenhum técnico encontrado.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const meta = STATUS_META[row.statusKey];
              return (
                <tr
                  key={row.tech.technicianId}
                  className={`border-b border-slate-800/60 ${
                    idx % 2 === 0 ? "bg-slate-900/40" : "bg-transparent"
                  }`}
                  data-testid={`row-tech-${row.tech.technicianId}`}
                >
                  {/* Técnico */}
                  <td className="px-6 py-4 align-top">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-10 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.tech.color || "#64748b" }}
                      />
                      <div className="min-w-0">
                        <div className="text-lg font-semibold truncate">{row.tech.name}</div>
                        <div className="text-sm text-slate-400 truncate">
                          {row.tech.team || "—"}
                          {row.totalToday > 0 && (
                            <span className="ml-2 text-slate-500">
                              · {row.doneToday}/{row.totalToday} hoje
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 align-top">
                    <div className={`flex items-center gap-2 font-medium ${meta.text}`}>
                      <span className={`h-3 w-3 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </div>
                    {row.current && formatTime(row.current.scheduledTime) && (
                      <div className="mt-1 ml-5 text-sm text-slate-400 tabular-nums">
                        {formatTime(row.current.scheduledTime)}
                        {formatTime(row.current.endTime) && ` às ${formatTime(row.current.endTime)}`}
                      </div>
                    )}
                  </td>

                  {/* Cliente atual */}
                  <td className="px-6 py-4 align-top">
                    {row.current ? (
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 text-slate-500 shrink-0 mt-1" />
                        <span className="text-base line-clamp-2">{row.currentDisplayName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  {/* Atividade */}
                  <td className="px-6 py-4 align-top">
                    {row.current ? (
                      <span className="text-base text-slate-200 line-clamp-2">
                        {row.current.activityTypeName}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  {/* Cidade/UF */}
                  <td className="px-6 py-4 align-top">
                    {row.location ? (
                      <span className="text-base text-slate-300 line-clamp-2">{row.location}</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  {/* Próxima visita */}
                  <td className="px-6 py-4 align-top">
                    {row.nextVisit ? (
                      <div className="flex items-start gap-2 min-w-0">
                        <CalendarClock className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-base font-medium tabular-nums">
                            {formatTime(row.nextVisit.scheduledTime) || "—"}
                          </div>
                          <div className="text-sm text-slate-400 line-clamp-2">
                            {row.nextVisitName}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500">Sem visitas</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>

      {/* Legenda */}
      <footer className="shrink-0 flex items-center justify-center gap-6 px-6 py-3 bg-slate-900 border-t border-slate-800 text-sm text-slate-400">
        {(Object.keys(STATUS_META) as StatusKey[]).map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${STATUS_META[key].dot}`} />
            {STATUS_META[key].label}
          </div>
        ))}
      </footer>
    </div>
  );
}
