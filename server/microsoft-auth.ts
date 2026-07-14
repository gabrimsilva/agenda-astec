import { ConfidentialClientApplication, AuthorizationUrlRequest } from "@azure/msal-node";
import axios from "axios";

// Configurar MSAL (Microsoft Authentication Library)
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || "test-client-id",
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || "common"}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET || "test-secret",
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel: number, message: string) {
        console.log(`[MSAL] ${message}`);
      },
      piiLoggingEnabled: false,
      logLevel: 2, // Info
    },
  },
};

let cca: ConfidentialClientApplication | null = null;

// Inicializar MSAL apenas se tiver credenciais
export function initMSAL() {
  if (msalConfig.auth.clientId !== "test-client-id") {
    cca = new ConfidentialClientApplication(msalConfig);
    console.log("✅ MSAL inicializado com Azure AD");
  } else {
    console.log("⚠️  MSAL em modo demo (sem credenciais do Azure)");
  }
}

// Gerar URL de autenticação Microsoft
export function getMicrosoftLoginUrl(redirectUri: string): string {
  if (!cca) {
    throw new Error("MSAL não inicializado. Configure AZURE_CLIENT_ID, AZURE_TENANT_ID e AZURE_CLIENT_SECRET");
  }

  const authCodeUrlParameters: AuthorizationUrlRequest = {
    scopes: ["user.read"],
    redirectUri,
  };

  return cca.getAuthCodeUrl(authCodeUrlParameters) as any;
}

// Trocar código de autorização por token
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  idToken?: string;
  email: string;
  name: string;
  mfaVerified: boolean;
}> {
  if (!cca) {
    throw new Error("MSAL não inicializado");
  }

  const tokenRequest = {
    code,
    scopes: ["user.read"],
    redirectUri,
  };

  try {
    const response = await cca.acquireTokenByCode(tokenRequest);

    if (!response || !response.accessToken) {
      throw new Error("Falha ao obter token de acesso");
    }

    // Buscar informações do usuário
    const userInfo = await getMicrosoftUserInfo(response.accessToken);

    return {
      accessToken: response.accessToken,
      idToken: response.idToken,
      email: userInfo.mail || userInfo.userPrincipalName,
      name: userInfo.displayName,
      mfaVerified: true, // Microsoft Authenticator valida MFA no login
    };
  } catch (error: any) {
    console.error("Erro ao trocar código por token:", error.message);
    throw error;
  }
}

// Buscar informações do usuário do Microsoft Graph
async function getMicrosoftUserInfo(accessToken: string): Promise<any> {
  try {
    const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("Erro ao buscar info do usuário:", error.message);
    throw error;
  }
}

// Validar token Microsoft (refresh se necessário)
export async function validateMicrosoftToken(accessToken: string): Promise<boolean> {
  try {
    const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return !!response.data;
  } catch (error) {
    return false;
  }
}
