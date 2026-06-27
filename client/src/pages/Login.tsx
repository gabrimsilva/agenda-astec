import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, ArrowRight } from "lucide-react";

const APP_VERSION = "1.0.0";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      const redirectPath = user.role === "admin" ? "/relatorios" : "/minha-agenda";
      console.log(`[Login] User authenticated as ${user.role}, redirecting to ${redirectPath}`);
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha email e senha.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      toast({
        title: "Login realizado",
        description: "Bem-vindo ao ASTEC!",
      });
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message || "Credenciais inválidas. Tente novamente.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#0B1220] px-4 py-12">
      {/* Brilhos ambientes (blobs desfocados) */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-rose-300/25 dark:bg-rose-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-200/20 dark:bg-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-rose-200/20 dark:bg-rose-400/10 blur-3xl" />
      {/* Textura de pontinhos (dot grid) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="relative z-10 w-full max-w-sm lg:max-w-md space-y-6 lg:space-y-8">
        {/* Logo e Header */}
        <div className="flex flex-col items-center gap-4 lg:gap-5">
          {/* Logo Container */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-50 animate-pulse" style={{ background: 'radial-gradient(circle, rgba(225,29,72,0.65), transparent 70%)' }} />
            <div 
              className="relative h-20 w-20 lg:h-24 lg:w-24 flex items-center justify-center rounded-2xl shadow-xl"
              style={{ backgroundColor: '#E11D48' }}
            >
              <img 
                src="/renner-logo.png" 
                alt="Renner" 
                className="h-14 w-14 lg:h-16 lg:w-16 object-contain"
              />
            </div>
          </div>
          
          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl lg:text-5xl font-bold text-slate-800 dark:text-white tracking-tight">
              ASTEC
            </h1>
            <div className="space-y-1">
              <p className="text-sm lg:text-base text-slate-500 dark:text-slate-300 font-medium">
                Sistema de Agenda - Assistentes Técnicos
              </p>
              <p className="text-xs lg:text-sm font-semibold tracking-wide" style={{ color: '#E11D48' }}>
                RENNER COATINGS
              </p>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-900/5 overflow-hidden">
          {/* Barra de gradiente no topo do card (detalhe do RDS/crédito) */}
          <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-rose-400 to-emerald-400" />
          <CardHeader className="p-5 lg:p-6 pb-2">
            <CardTitle className="text-xl lg:text-2xl font-semibold">Bem-vindo</CardTitle>
            <CardDescription className="text-sm">
              Entre com suas credenciais para acessar o sistema
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="p-5 lg:p-6 pt-2 space-y-4 lg:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-email"
                  autoComplete="email"
                  className="h-11 lg:h-12 text-sm bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Senha
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-password"
                  autoComplete="current-password"
                  className="h-11 lg:h-12 text-sm bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-primary/20 transition-all"
                />
              </div>
            </CardContent>
            <CardFooter className="p-5 lg:p-6 pt-2 flex flex-col gap-4 lg:gap-5">
              <Button
                type="submit"
                className="w-full h-11 lg:h-12 text-sm lg:text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                style={{ 
                  backgroundColor: '#E11D48',
                  color: 'white'
                }}
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 lg:h-5 lg:w-5 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="ml-2 h-4 w-4 lg:h-5 lg:w-5" />
                  </>
                )}
              </Button>
              
              {/* Footer Info */}
              <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-col items-center gap-1 text-center">
                  <p className="text-xs text-muted-foreground">
                    Sistema ASTEC - Renner Coatings
                  </p>
                  <div className="flex items-center gap-2 text-[10px] lg:text-xs text-muted-foreground/70">
                    <span>© {new Date().getFullYear()}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span className="font-medium" style={{ color: '#E11D48' }}>
                      Versão {APP_VERSION}
                    </span>
                  </div>
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
