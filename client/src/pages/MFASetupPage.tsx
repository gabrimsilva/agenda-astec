import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, AlertCircle, Loader } from "lucide-react";

export default function MFASetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"loading" | "qrcode" | "confirm" | "success">(
    "loading"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // QR Code Step
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);

  // Confirm Step
  const [totpCode, setTotpCode] = useState("");

  // Get token from localStorage
  const token = localStorage.getItem("token");

  // Generate MFA on component mount
  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    generateMFA();
  }, [token, navigate]);

  const generateMFA = async () => {
    try {
      const response = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Erro ao gerar MFA");
        return;
      }

      setQrCode(data.qrCode);
      setSecret(data.secret);
      setBackupCodes(data.backupCodes);
      setStep("qrcode");
    } catch (err: any) {
      setError(err.message || "Erro ao conectar com servidor");
    }
  };

  const handleConfirmMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          totpCode,
          secret,
          backupCodes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Código TOTP inválido");
        setLoading(false);
        return;
      }

      setStep("success");
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Erro ao confirmar MFA");
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🔐 ASTEC</h1>
          <p className="text-gray-600 mt-2">Configurar Autenticação de Dois Fatores</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader size={48} className="text-blue-600 animate-spin mb-4" />
              <p className="text-gray-600">Gerando QR Code...</p>
            </div>
          )}

          {step === "qrcode" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Passo 1: Escaneie o QR Code
                </h2>
                <p className="text-gray-600">
                  Use o Microsoft Authenticator para escanear este código
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-8 flex justify-center mb-8">
                {qrCode && (
                  <img
                    src={qrCode}
                    alt="QR Code"
                    className="w-64 h-64 border-2 border-gray-200 rounded"
                  />
                )}
              </div>

              {/* Manual Entry */}
              <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  Se não conseguir escanear, insira manualmente:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-white border border-gray-300 rounded font-mono text-sm text-center">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(secret)}
                    className="p-2 hover:bg-blue-100 rounded transition"
                  >
                    {copiedCode ? (
                      <Check size={20} className="text-green-600" />
                    ) : (
                      <Copy size={20} className="text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Backup Codes */}
              <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Códigos de Backup</p>
                    <p className="text-sm text-gray-600">
                      Salve estes códigos em um local seguro. Use-os se perder acesso ao
                      Authenticator.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, idx) => (
                    <code
                      key={idx}
                      className="p-2 bg-white border border-amber-200 rounded text-sm font-mono text-center cursor-pointer hover:bg-amber-50"
                      onClick={() => copyToClipboard(code)}
                    >
                      {code}
                    </code>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(backupCodes.join("\n"))
                  }
                  className="w-full mt-3 text-sm text-amber-700 hover:text-amber-900 font-medium"
                >
                  Copiar todos os códigos
                </button>
              </div>

              {/* Next Button */}
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Próximo: Verificar Código →
              </button>
            </>
          )}

          {step === "confirm" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Passo 2: Verifique o Código
                </h2>
                <p className="text-gray-600">
                  Digite o código que aparece no seu Authenticator para confirmar
                </p>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleConfirmMFA} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Código TOTP (6 dígitos)
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full text-center text-4xl tracking-widest px-4 py-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || totpCode.length < 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader size={20} className="animate-spin" />}
                  {loading ? "Verificando..." : "Confirmar e Ativar MFA"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setStep("qrcode")}
                className="w-full mt-4 text-gray-600 hover:text-gray-900 font-medium py-2"
              >
                ← Voltar
              </button>
            </>
          )}

          {step === "success" && (
            <>
              <div className="text-center">
                <div className="text-6xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  MFA Ativado com Sucesso!
                </h2>
                <p className="text-gray-600 mb-8">
                  Sua conta agora está protegida com autenticação de dois fatores
                </p>

                {/* Security Tips */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8 text-left">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    ✨ Dicas de Segurança:
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✓ Mantenha seu Microsoft Authenticator sempre sincronizado</li>
                    <li>✓ Guarde seus códigos de backup em local seguro</li>
                    <li>✓ Notifique o administrador se perder acesso ao Authenticator</li>
                    <li>✓ Ative notificações push no seu celular</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
                >
                  Ir para Dashboard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
