import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader } from "lucide-react";

interface LoginStep {
  type: "credentials" | "mfa" | "mfa_setup";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>({ type: "credentials" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Credentials step
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // MFA step
  const [userId, setUserId] = useState("");
  const [totpCode, setTotpCode] = useState("");

  // Handle login with credentials
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Erro ao fazer login");
        setLoading(false);
        return;
      }

      // Check if MFA is required
      if (data.mfaRequired) {
        setUserId(data.userId);
        setStep({ type: "mfa" });
        setLoading(false);
        return;
      }

      // MFA not required, save token and redirect
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Erro ao conectar com servidor");
      setLoading(false);
    }
  };

  // Handle MFA verification
  const handleMFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          totpCode,
          useBackupCode: false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Código TOTP inválido");
        setLoading(false);
        return;
      }

      // Success
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Erro ao verificar MFA");
      setLoading(false);
    }
  };

  // Handle Microsoft OAuth login
  const handleMicrosoftLogin = () => {
    window.location.href = "/api/auth/microsoft";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ASTEC</h1>
          <p className="text-gray-600 mt-2">Sistema de Gestão Técnica</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {step.type === "credentials" && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Fazer Login
              </h2>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-gray-400"
                    >
                      {showPassword ? (
                        <EyeOff size={20} />
                      ) : (
                        <Eye size={20} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader size={20} className="animate-spin" />}
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-300"></div>
                <span className="text-gray-500 text-sm">ou</span>
                <div className="flex-1 h-px bg-gray-300"></div>
              </div>

              {/* Microsoft OAuth Button */}
              <button
                onClick={handleMicrosoftLogin}
                className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 21 21"
                  fill="currentColor"
                >
                  <path d="M0 0h10v10H0z" />
                  <path d="M11 0h10v10H11z" />
                  <path d="M0 11h10v10H0z" />
                  <path d="M11 11h10v10H11z" />
                </svg>
                Entrar com Microsoft 365
              </button>

              {/* Footer */}
              <p className="text-center text-gray-600 text-sm mt-6">
                Primeira vez?{" "}
                <a href="#" className="text-blue-600 hover:underline">
                  Contate o administrador
                </a>
              </p>
            </>
          )}

          {step.type === "mfa" && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Verificação de Dois Fatores
              </h2>
              <p className="text-gray-600 mb-6">
                Digite o código do seu Microsoft Authenticator
              </p>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleMFASubmit} className="space-y-4">
                {/* TOTP Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código TOTP (6 dígitos)
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full text-center text-3xl tracking-widest px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    O código muda a cada 30 segundos
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || totpCode.length < 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader size={20} className="animate-spin" />}
                  {loading ? "Verificando..." : "Verificar"}
                </button>
              </form>

              {/* Backup Code Option */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    // Mostrar tela de backup code
                    console.log(\"Usar código de backup\");\n                  }}
                  className=\"text-sm text-blue-600 hover:underline\"
                >
                  Usar código de backup ao invés?
                </button>
              </div>

              {/* Back Button */}
              <button
                type=\"button\"
                onClick={() => {
                  setStep({ type: \"credentials\" });
                  setTotpCode(\"\");
                  setError(\"\");
                }}
                className=\"w-full mt-4 text-gray-600 hover:text-gray-900 font-medium py-2\"
              >
                ← Voltar
              </button>
            </>
          )}
        </div>

        {/* Footer Info */}
        <div className=\"text-center mt-8 text-gray-600 text-sm\">
          <p>🔒 Sua conexão é segura e criptografada</p>
        </div>
      </div>
    </div>
  );
}
