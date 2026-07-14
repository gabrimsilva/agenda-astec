import { Router, type Response } from "express";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, generateToken, type AuthPayload, verifyToken } from "./auth";
import { 
  generateMFASecret, 
  validateTOTPCode, 
  validateAndUseBackupCode,
  saveMFASecret,
  disableMFA,
  isMFAEnabled,
  getMFAStatus
} from "./mfa-manager";
import { initMSAL, getMicrosoftLoginUrl, exchangeCodeForToken } from "./microsoft-auth";
import type { AuthRequest } from "./middleware";

export const authRouter = Router();

// Inicializar MSAL na startup
initMSAL();

// ═══════════════════════════════════════════════════════════════════
// 🔐 LOGIN TRADICIONAL COM MFA
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/login
 * Login com email/senha
 * Se MFA está ativado, retorna mfaRequired: true
 */
authRouter.post("/auth/login", async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha obrigatórios" });
    }

    // Buscar usuário
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    // Validar senha
    const passwordValid = await comparePassword(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    // Verificar se MFA está ativado
    if (user.mfaEnabled) {
      // Retornar resposta indicando que MFA é necessário
      return res.json({
        mfaRequired: true,
        message: "Digite o código do Microsoft Authenticator",
        userId: user.id, // para validação posterior
      });
    }

    // Se MFA não está ativado, gerar token normal
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error: any) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

/**
 * POST /api/auth/verify-mfa
 * Validar código TOTP do Microsoft Authenticator
 */
authRouter.post("/auth/verify-mfa", async (req: AuthRequest, res: Response) => {
  try {
    const { userId, totpCode, useBackupCode } = req.body;

    if (!userId || !totpCode) {
      return res.status(400).json({ error: "userId e TOTP code obrigatórios" });
    }

    // Buscar usuário
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || !user.mfaSecret) {
      return res.status(401).json({ error: "MFA não configurado" });
    }

    let mfaValid = false;

    // Tentar validar TOTP normal
    if (!useBackupCode) {
      mfaValid = validateTOTPCode(user.mfaSecret, totpCode);
    }

    // Se código normal não funcionou, tentar backup code
    if (!mfaValid && useBackupCode) {
      mfaValid = await validateAndUseBackupCode(userId, totpCode);
    }

    if (!mfaValid) {
      return res.status(401).json({ error: "Código TOTP inválido" });
    }

    // MFA validado! Gerar token
    const token = generateToken(user);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role 
      },
      message: "✅ Autenticação com sucesso"
    });
  } catch (error: any) {
    console.error("Erro na verificação MFA:", error);
    res.status(500).json({ error: "Erro ao verificar MFA" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 🔑 CONFIGURAÇÃO DE MFA (SETUP)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/mfa/setup
 * Gerar secret TOTP e QR code
 * Requer autenticação
 */
authRouter.post("/auth/mfa/setup", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.userId),
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Gerar secret e QR code
    const { secret, qrCode, backupCodes } = await generateMFASecret(user.email);

    res.json({
      qrCode,
      secret, // Para backup manual
      backupCodes, // Mostrar ao usuário para salvar
      message: "Escaneie o QR code com Microsoft Authenticator ou outra app 2FA",
    });
  } catch (error: any) {
    console.error("Erro ao gerar MFA setup:", error);
    res.status(500).json({ error: "Erro ao configurar MFA" });
  }
});

/**
 * POST /api/auth/mfa/confirm
 * Confirmar MFA após validar código
 * Requer autenticação + TOTP code
 */
authRouter.post("/auth/mfa/confirm", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const { totpCode, secret, backupCodes } = req.body;

    if (!totpCode || !secret || !backupCodes) {
      return res.status(400).json({ error: "TOTP code, secret e backup codes obrigatórios" });
    }

    // Validar que o código gerado é correto
    const isValid = validateTOTPCode(secret, totpCode);
    if (!isValid) {
      return res.status(401).json({ error: "Código TOTP inválido. Tente novamente" });
    }

    // Salvar secret no banco
    await saveMFASecret(req.user.userId, secret, backupCodes);

    res.json({ 
      message: "✅ MFA ativado com sucesso!",
      backupCodes, // Relembrá-lo de salvar os códigos de backup
    });
  } catch (error: any) {
    console.error("Erro ao confirmar MFA:", error);
    res.status(500).json({ error: "Erro ao confirmar MFA" });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Desabilitar MFA
 * Requer autenticação + senha para confirmar
 */
authRouter.post("/auth/mfa/disable", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Senha obrigatória" });
    }

    // Validar senha
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.userId),
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const passwordValid = await comparePassword(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    // Desabilitar MFA
    await disableMFA(req.user.userId);

    res.json({ message: "✅ MFA desativado com sucesso" });
  } catch (error: any) {
    console.error("Erro ao desabilitar MFA:", error);
    res.status(500).json({ error: "Erro ao desabilitar MFA" });
  }
});

/**
 * GET /api/auth/mfa/status
 * Obter status de MFA do usuário
 * Requer autenticação
 */
authRouter.get("/auth/mfa/status", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const status = await getMFAStatus(req.user.userId);
    res.json(status);
  } catch (error: any) {
    console.error("Erro ao obter status MFA:", error);
    res.status(500).json({ error: "Erro ao obter status MFA" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 🔐 MICROSOFT AUTHENTICATOR / OAUTH
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/microsoft
 * Redirecionar para login Microsoft
 */
authRouter.get("/auth/microsoft", (req: AuthRequest, res: Response) => {
  try {
    const redirectUri = `${process.env.BACKEND_URL || "http://localhost:3000"}/auth/microsoft/callback`;
    const authUrl = getMicrosoftLoginUrl(redirectUri);
    res.redirect(authUrl);
  } catch (error: any) {
    console.error("Erro ao gerar URL Microsoft:", error);
    res.status(500).json({ 
      error: "Erro ao iniciar login Microsoft. Certifique-se de configurar AZURE_CLIENT_ID e outras variáveis." 
    });
  }
});

/**
 * GET /api/auth/microsoft/callback
 * Callback após autenticação Microsoft
 */
authRouter.get("/auth/microsoft/callback", async (req: AuthRequest, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}?error=${error}&description=${error_description}`);
    }

    if (!code) {
      return res.status(400).json({ error: "Código de autorização não recebido" });
    }

    const redirectUri = `${process.env.BACKEND_URL || "http://localhost:3000"}/auth/microsoft/callback`;

    // Trocar código por token
    const tokenData = await exchangeCodeForToken(code as string, redirectUri);

    // Buscar ou criar usuário
    let user = await db.query.users.findFirst({
      where: eq(users.email, tokenData.email),
    });

    if (!user) {
      // Criar novo usuário (primeiro login)
      const [newUser] = await db
        .insert(users)
        .values({
          email: tokenData.email,
          name: tokenData.name,
          password: "", // Microsoft OAuth não usa senha local
          role: "assistente",
          mfaEnabled: true, // Microsoft Authenticator já é MFA
          microsoftAzureId: tokenData.idToken || "",
        })
        .returning();

      user = newUser;
    } else {
      // Atualizar com ID do Azure se não tiver
      if (!user.microsoftAzureId && tokenData.idToken) {
        await db
          .update(users)
          .set({ microsoftAzureId: tokenData.idToken })
          .where(eq(users.id, user.id));
      }
    }

    // Gerar JWT local
    const token = generateToken(user);

    // Redirecionar para frontend com token
    const frontendUrl = new URL(process.env.FRONTEND_URL || "http://localhost:5173");
    frontendUrl.searchParams.append("token", token);
    frontendUrl.searchParams.append("method", "microsoft");

    res.redirect(frontendUrl.toString());
  } catch (error: any) {
    console.error("Erro no callback Microsoft:", error);
    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}?error=auth_failed&message=${encodeURIComponent(error.message)}`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════
// 📊 ENDPOINTS DE TESTE/DEBUG
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/test
 * Testar autenticação (apenas em desenvolvimento)
 */
authRouter.get("/auth/test", async (req: AuthRequest, res: Response) => {
  try {
    // Criar usuário de teste se não existir
    let user = await db.query.users.findFirst({
      where: eq(users.email, "teste@astec.com"),
    });

    if (!user) {
      const hashedPassword = await hashPassword("teste123");
      [user] = await db
        .insert(users)
        .values({
          email: "teste@astec.com",
          name: "Usuário Teste",
          password: hashedPassword,
          role: "assistente",
        })
        .returning();
    }

    // Gerar token
    const token = generateToken(user);

    res.json({
      message: "✅ Usuário de teste criado",
      credentials: {
        email: "teste@astec.com",
        password: "teste123",
      },
      token,
      instructions: [
        "1. Faça login com email: teste@astec.com",
        "2. Use a senha: teste123",
        "3. Se MFA está desativado, receberá token imediatamente",
        "4. Se MFA está ativado, será solicitado o código TOTP",
      ],
    });
  } catch (error: any) {
    console.error("Erro no teste:", error);
    res.status(500).json({ error: error.message });
  }
});

export default authRouter;
