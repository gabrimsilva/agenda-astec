import React, { useState, useEffect } from "react";
import { X, Loader, AlertCircle, Shield } from "lucide-react";

interface MFAStatus {
  enabled: boolean;
  hasSecret: boolean;
  backupCodesCount: number;
}

interface MFASettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

export default function MFASettingsModal({
  isOpen,
  onClose,
  token,
}: MFASettingsModalProps) {
  const [step, setStep] = useState<"status" | "disable">("status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mfaStatus, setMFAStatus] = useState<MFAStatus | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchMFAStatus();
    }
  }, [isOpen]);

  const fetchMFAStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/auth/mfa/status", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      setMFAStatus(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar status MFA");
      setLoading(false);
    }
  };

  const handleDisableMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Erro ao desabilitar MFA");
        setLoading(false);
        return;
      }

      // Success
      setPassword("");
      setStep("status");
      setTimeout(() => {
        fetchMFAStatus();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Erro ao desabilitar MFA");
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield size={24} className="text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">
              Configurações de Segurança
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader size={40} className="text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Carregando...</p>
          </div>
        ) : step === "status" ? (
          <>
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {mfaStatus && (
              <div className="space-y-4">
                {/* MFA Status */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-gray-900">
                      Autenticação de Dois Fatores
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        mfaStatus.enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {mfaStatus.enabled ? "✓ Ativado" : "✗ Desativado"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {mfaStatus.enabled
                      ? "Sua conta está protegida com Microsoft Authenticator"
                      : "Ative MFA para melhorar a segurança da sua conta"}
                  </p>
                </div>

                {/* Backup Codes */}
                {mfaStatus.enabled && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle
                        size={20}
                        className="text-amber-600 mt-0.5 flex-shrink-0"
                      />
                      <div>
                        <p className="font-medium text-gray-900 mb-1">
                          Códigos de Backup Restantes
                        </p>
                        <p className="text-sm text-amber-700">
                          {mfaStatus.backupCodesCount} código(s) disponível(eis)
                        </p>
                        <p className="text-xs text-amber-600 mt-2">
                          Se perder acesso ao Authenticator, você pode usar um
                          código de backup para recuperar sua conta.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {mfaStatus.enabled && (
                    <button
                      type="button"
                      onClick={() => setStep("disable")}
                      className="w-full px-4 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg font-medium transition"
                    >
                      Desabilitar MFA
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Disable MFA Form */}
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900 mb-1">Atenção</p>
                <p className="text-sm text-red-700">
                  Desabilitar MFA reduzirá a segurança da sua conta. Você só
                  precisará de email e senha para fazer login.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleDisableMFA} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirme sua senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("status");
                    setPassword("");
                    setError("");
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader size={18} className="animate-spin" />}
                  {loading ? "Desabilitando..." : "Desabilitar"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
