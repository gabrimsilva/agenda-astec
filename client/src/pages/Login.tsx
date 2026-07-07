import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Globe, User as UserIcon, Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";

const APP_VERSION = "2.0.0";

type Ambiente = "producao" | "homologacao" | "dev";

const AMBIENTES: { value: Ambiente; label: string; host: string; dot: string }[] = [
  { value: "producao", label: "Produção", host: "erp.renner.com.br", dot: "bg-rose-500" },
  { value: "homologacao", label: "Homologação", host: "erp-homol.renner.com.br", dot: "bg-amber-500" },
  { value: "dev", label: "Dev", host: "erp-desenv.renner.com.br", dot: "bg-sky-500" },
];

export default function Login() {
  const [ambiente, setAmbiente] = useState<Ambiente>("producao");
  const [host, setHost] = useState(AMBIENTES[0].host);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"datasul" | "astec">("datasul");
  const [email, setEmail] = useState("");
  const { loginDatasul, login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      const redirectPath = user.role === "admin" ? "/relatorios" : "/minha-agenda";
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  const selectAmbiente = (a: Ambiente) => {
    setAmbiente(a);
    const found = AMBIENTES.find((x) => x.value === a);
    if (found) setHost(found.host);
  };

  const ambienteLabel = AMBIENTES.find((a) => a.value === ambiente)?.label || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "astec") {
      if (!email || !password) {
        toast({ title: "Campos obrigatórios", description: "Preencha e-mail e senha.", variant: "destructive" });
        return;
      }
      setIsLoading(true);
      try {
        await login(email.trim(), password);
        toast({ title: "Login realizado", description: "Bem-vindo ao ASTEC!" });
      } catch (error: any) {
        toast({ title: "Erro no login", description: error.message || "Credenciais inválidas.", variant: "destructive" });
        setIsLoading(false);
      }
      return;
    }

    if (!username || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha usuário e senha do Datasul.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      await loginDatasul(username.trim(), password, host.trim());
      toast({ title: "Login realizado", description: "Bem-vindo ao ASTEC!" });
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message || "Não foi possível autenticar via Datasul.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#0B1220] px-4 py-12">
      {/* Brilhos ambientes */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-rose-300/25 dark:bg-rose-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-200/20 dark:bg-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-rose-200/20 dark:bg-rose-400/10 blur-3xl" />
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm lg:max-w-md space-y-6">
        {/* Logo + header */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-16 w-16 flex items-center justify-center rounded-2xl shadow-xl"
            style={{ backgroundColor: "#E11D48" }}
          >
            <img src="/renner-logo.png" alt="Renner" className="h-11 w-11 object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
              Renner · Datasul
            </h1>
            <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">ERP TOTVS</p>
          </div>
        </div>

        {/* Card */}
        <div className="relative rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-rose-400 to-emerald-400" />
          <form onSubmit={handleSubmit} className="p-6 lg:p-7 space-y-5">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Bem-vindo de volta</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {mode === "datasul" ? "Acesse o painel Datasul · TOTVS" : "Acesso ASTEC (e-mail e senha)"}
              </p>
            </div>

            {mode === "datasul" && (
            <>
            {/* Ambiente */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Ambiente</Label>
              <div className="grid grid-cols-3 gap-2">
                {AMBIENTES.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => selectAmbiente(a.value)}
                    data-testid={`button-ambiente-${a.value}`}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-sm font-medium transition-all ${
                      ambiente === a.value
                        ? "border-rose-300 bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${a.dot}`} />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aviso de produção */}
            {ambiente === "producao" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Você está acessando o ambiente de <strong>Produção</strong>. Certifique-se antes de continuar.
                </p>
              </div>
            )}

            {/* Host */}
            <div className="space-y-2">
              <Label htmlFor="host" className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Host
              </Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-host"
                  className="h-11 pl-9 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Usuário */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Usuário
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="username"
                  placeholder="usuário do ERP"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                  data-testid="input-username"
                  className="h-11 pl-9 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            </>
            )}

            {mode === "astec" && (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  E-mail
                </Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu.email@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    data-testid="input-email"
                    className="h-11 pl-9 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
            )}

            {/* Senha */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="senha do ERP"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  data-testid="input-password"
                  className="h-11 pl-9 pr-10 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ backgroundColor: "#E11D48", color: "white" }}
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : mode === "datasul" ? (
                `Entrar · ${ambienteLabel}`
              ) : (
                "Entrar"
              )}
            </Button>

            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "datasul" ? "astec" : "datasul"));
                setPassword("");
              }}
              className="w-full text-center text-xs text-slate-500 hover:text-rose-600 transition-colors"
              data-testid="button-toggle-login-mode"
            >
              {mode === "datasul"
                ? "Acessar com e-mail e senha (ASTEC)"
                : "Voltar ao login via Datasul"}
            </button>

            <div className="pt-1 flex items-center justify-center gap-2 text-[10px] text-slate-400">
              <span>ASTEC · Renner Coatings</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="font-medium" style={{ color: "#E11D48" }}>
                v{APP_VERSION}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
