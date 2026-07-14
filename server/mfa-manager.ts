import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * TOTP MFA Manager
 * Gerencia geração de secrets, validação de códigos e QR codes
 */

// Gerar secret TOTP para novo usuário
export async function generateMFASecret(email: string, appName: string = "ASTEC"): Promise<{
  secret: string;
  qrCode: string;
  backupCodes: string[];
}> {
  // Gerar secret
  const secret = speakeasy.generateSecret({
    name: `${appName} (${email})`,
    issuer: appName,
    length: 32,
  });

  // Gerar QR Code (formato otmizado para Microsoft Authenticator)
  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

  // Gerar backup codes (10 códigos para recuperação)
  const backupCodes = generateBackupCodes(10);

  return {
    secret: secret.base32!,
    qrCode,
    backupCodes,
  };
}

// Validar código TOTP
export function validateTOTPCode(secret: string, token: string): boolean {
  try {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2, // Permite 2 janelas de 30s = 60s de margem
    });

    return !!verified;
  } catch (error) {
    return false;
  }
}

// Validar backup code e remover do banco
export async function validateAndUseBackupCode(
  userId: string,
  backupCode: string
): Promise<boolean> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) return false;

    const codes = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes) : [];
    const codeIndex = codes.indexOf(backupCode);

    if (codeIndex === -1) return false;

    // Remover código usado
    codes.splice(codeIndex, 1);

    await db.update(users).set({
      mfaBackupCodes: JSON.stringify(codes),
    }).where(eq(users.id, userId));

    return true;
  } catch (error) {
    console.error("Erro ao validar backup code:", error);
    return false;
  }
}

// Gerar códigos de backup
function generateBackupCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}

// Salvar secret TOTP no banco
export async function saveMFASecret(userId: string, secret: string, backupCodes: string[]): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        mfaSecret: secret,
        mfaBackupCodes: JSON.stringify(backupCodes),
        mfaEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error("Erro ao salvar MFA secret:", error);
    throw error;
  }
}

// Desabilitar MFA
export async function disableMFA(userId: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        mfaSecret: null,
        mfaBackupCodes: null,
        mfaEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error("Erro ao desabilitar MFA:", error);
    throw error;
  }
}

// Verificar se MFA está ativado
export async function isMFAEnabled(userId: string): Promise<boolean> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return user?.mfaEnabled ?? false;
  } catch (error) {
    return false;
  }
}

// Obter status de MFA do usuário
export async function getMFAStatus(userId: string): Promise<{
  enabled: boolean;
  hasSecret: boolean;
  backupCodesCount: number;
}> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { enabled: false, hasSecret: false, backupCodesCount: 0 };
    }

    const backupCodes = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes) : [];

    return {
      enabled: user.mfaEnabled ?? false,
      hasSecret: !!user.mfaSecret,
      backupCodesCount: backupCodes.length,
    };
  } catch (error) {
    console.error("Erro ao obter status MFA:", error);
    return { enabled: false, hasSecret: false, backupCodesCount: 0 };
  }
}
