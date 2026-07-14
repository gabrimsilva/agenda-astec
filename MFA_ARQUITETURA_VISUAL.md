# 🔐 MFA - Arquitetura Visual

## Estrutura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENTE (React/Browser)                     │
│                                                                  │
│  LoginPage.tsx  │  MFASetupPage.tsx  │  MFASettingsModal.tsx   │
│  - Email/Senha  │  - QR Code         │  - Gerenciar MFA       │
│  - TOTP Input   │  - Secret Manual   │  - Backup Codes        │
│  - OAuth Button │  - Confirmação     │  - Disable MFA         │
│                                                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP/JSON
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js + Express)                    │
│                                                                  │
│  auth-routes.ts (11 endpoints)                                 │
│  ├─ POST /auth/login                                           │
│  ├─ POST /auth/verify-mfa                                      │
│  ├─ POST /auth/mfa/setup                                       │
│  ├─ POST /auth/mfa/confirm                                     │
│  ├─ GET  /auth/mfa/status                                      │
│  ├─ POST /auth/mfa/disable                                     │
│  ├─ GET  /auth/microsoft                                       │
│  ├─ GET  /auth/microsoft/callback                              │
│  └─ ...mais 3                                                  │
│                                                                  │
│  Utilitários:                                                   │
│  ├─ mfa-manager.ts (TOTP, Backup Codes)                        │
│  ├─ microsoft-auth.ts (OAuth 2.0)                              │
│  └─ auth.ts (JWT, Hash)                                        │
│                                                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ SQL/Drizzle
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  DATABASE (PostgreSQL Neon)                     │
│                                                                  │
│  users table                                                    │
│  ├─ id, email, password (hashed)                               │
│  ├─ mfa_enabled (boolean)                                      │
│  ├─ mfa_secret (base32 TOTP)                                   │
│  ├─ mfa_backup_codes (JSON array)                              │
│  ├─ microsoft_azure_id (OAuth)                                 │
│  └─ updated_at (timestamp)                                     │
│                                                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ↓                 ↓
        ┌──────────────────┐  ┌──────────────────┐
        │  Azure AD        │  │  Microsoft Graph │
        │  OAuth 2.0       │  │  API             │
        │  Login           │  │  Get User Info   │
        │  MFA             │  │                  │
        └──────────────────┘  └──────────────────┘
```

---

## Fluxo de Autenticação

### 1. Login Simples (Sem MFA)

```
┌─────┐
│User │
└──┬──┘
   │ POST /auth/login
   │ (email + password)
   ↓
┌─────────────────┐
│ Backend         │
│ ├─ Validate     │
│ ├─ Check MFA    │
│ └─ Generate JWT │
└────────┬────────┘
         │
         ↓ (token)
    ✅ Success
    └─ Dashboard
```

### 2. Login com MFA (TOTP)

```
┌─────┐
│User │
└──┬──┘
   │ 1. POST /auth/login (email + password)
   ↓
┌─────────────────────────┐
│ Backend                 │
│ ├─ Validate password    │
│ ├─ Check MFA enabled    │
│ └─ Return mfaRequired   │
└─────────────────────────┘
   │
   ↓ 2. Show TOTP input
┌──────────────────────────┐
│ Client (TOTP Input Screen)
│ User copies code from    │
│ Microsoft Authenticator  │
└──────────────────────────┘
   │ 3. POST /auth/verify-mfa (userId + TOTP)
   ↓
┌─────────────────────────┐
│ Backend                 │
│ ├─ Validate TOTP        │
│ ├─ Check backup code    │
│ └─ Generate JWT         │
└────────┬────────────────┘
         │
         ↓ (token)
    ✅ Success
    └─ Dashboard
```

### 3. Setup de MFA

```
┌─────┐
│User │
└──┬──┘
   │ 1. POST /auth/mfa/setup
   ↓
┌─────────────────────────┐
│ Backend                 │
│ ├─ Generate TOTP secret │
│ ├─ Generate QR code     │
│ └─ Gen 10 backup codes  │
└─────────────────────────┘
   │
   ↓ 2. Display QR + Secret
┌──────────────────────────────┐
│ Client (MFA Setup Screen)     │
│ User scans QR with            │
│ Microsoft Authenticator       │
└──────────────────────────────┘
   │ 3. User gets TOTP code (6 digits)
   ↓
┌──────────────────────────────┐
│ Client (Confirm TOTP Screen) │
│ User enters 6-digit code     │
└──────────────────────────────┘
   │ 4. POST /auth/mfa/confirm (TOTP + secret)
   ↓
┌─────────────────────────┐
│ Backend                 │
│ ├─ Validate TOTP        │
│ ├─ Save secret to DB    │
│ └─ Enable MFA           │
└────────┬────────────────┘
         │
         ↓
    ✅ MFA Enabled!
```

### 4. Microsoft OAuth (SSO)

```
┌─────┐
│User │
└──┬──┘
   │ 1. Click "Login com Microsoft"
   ↓
┌─────────────────────────┐
│ Backend                 │
│ GET /auth/microsoft     │
└────────┬────────────────┘
         │
         ↓ Redirect to Azure AD
┌──────────────────────────┐
│ Azure Active Directory   │
│ ├─ User login            │
│ ├─ MFA validation        │
│ └─ Return auth code      │
└──────────────────────────┘
   │
   ↓ Callback: /auth/microsoft/callback?code=...
┌─────────────────────────┐
│ Backend                 │
│ ├─ Exchange code        │
│ ├─ Get access token     │
│ ├─ Fetch user from MS   │
│ ├─ Create/Update in DB  │
│ └─ Generate local JWT   │
└────────┬────────────────┘
         │
         ↓ Redirect com token
    ✅ Dashboard
```

---

## Componentes React

```
client/src/pages/
├── LoginPage.tsx
│   ├─ State: step (credentials/mfa)
│   ├─ Form de email/senha
│   ├─ Form de TOTP
│   ├─ Botão Microsoft OAuth
│   └─ Erro handling
│
├── MFASetupPage.tsx
│   ├─ State: step (loading/qrcode/confirm/success)
│   ├─ QR code display
│   ├─ Secret manual
│   ├─ Backup codes
│   ├─ TOTP confirmation
│   └─ Success screen

client/src/components/
├── MFASettingsModal.tsx
│   ├─ State: MFA status
│   ├─ Backup codes count
│   ├─ Disable MFA option
│   └─ Password confirmation
│
├── ProtectedRoute.tsx (criar)
│   ├─ Check localStorage.token
│   └─ Redirect /login if invalid
│
└── ProfileMenu.tsx (integrar)
    └─ Button para MFASettingsModal
```

---

## Endpoints API

### Públicos (sem JWT)
```
GET  /auth/test              → Criar usuário de teste
POST /auth/login             → Email/Senha login
POST /auth/verify-mfa        → Validar TOTP code
GET  /auth/microsoft         → Iniciar OAuth Microsoft
GET  /auth/microsoft/callback → OAuth callback
```

### Protegidos (requer JWT)
```
POST /auth/mfa/setup         → Gerar QR code
POST /auth/mfa/confirm       → Confirmar MFA
POST /auth/mfa/disable       → Desabilitar MFA
GET  /auth/mfa/status        → Ver status MFA
```

---

## Fluxo de Dados (Senha → JWT)

```
Password Input
    ↓
bcrypt.hash() → Stored in DB (never reversible)
    ↓
On Login:
bcrypt.compare(input, stored)
    ↓
generateToken(user)
    ↓
JWT signed with SESSION_SECRET
    ↓
Payload: { userId, username, role, iat, exp }
    ↓
Client: localStorage.setItem("token", jwt)
    ↓
All requests: Authorization: Bearer {jwt}
```

---

## Fluxo de Dados (TOTP)

```
POST /auth/mfa/setup
    ↓
speakeasy.generateSecret()
    ├─ name: "ASTEC (user@email.com)"
│   ├─ issuer: "ASTEC"
    ├─ length: 32
    └─ Output: base32 secret
    ↓
QRCode.toDataURL(otpauth_url)
    ↓
Client scans QR with Authenticator
    ↓
Authenticator stores secret
    ↓
Every 30 seconds: generateTOTP(secret) → 6 digits
    ↓
User enters code + secret in /auth/mfa/confirm
    ↓
speakeasy.totp.verify(secret, code, window: 2)
    ├─ Accepts current ±1 window (60 sec tolerance)
    └─ Returns: true/false
    ↓
If valid: Save to DB + Enable MFA
```

---

## Segurança em Camadas

```
Layer 1: HTTPS/TLS
└─ Todos os dados em trânsito criptografados

Layer 2: PASSWORD
├─ Bcrypt 10 rounds
└─ Salt automático

Layer 3: JWT
├─ Assinado com SESSION_SECRET
├─ TTL: 7 dias
└─ Verified em cada request

Layer 4: TOTP
├─ RFC 6238
├─ 6 dígitos
├─ 30 segundos
└─ ±30 segundos window

Layer 5: BACKUP CODES
├─ 10 códigos aleatórios
├─ One-time use
└─ Descartáveis após uso

Layer 6: OAUTH
├─ Azure AD gerencia MFA
├─ Server-to-server token exchange
└─ Microsoft Authenticator validation
```

---

## Database Schema Update

```sql
ALTER TABLE users ADD COLUMN (
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret TEXT,                    -- base32 string
  mfa_backup_codes TEXT,              -- JSON: ["ABC123", "XYZ789", ...]
  microsoft_azure_id TEXT,            -- OAuth user ID
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_mfa_enabled ON users(mfa_enabled);
```

---

## Arquivo Environment

```env
# Autenticação
SESSION_SECRET=sua_chave_super_secreta_32_chars_minimo

# Azure/Microsoft
AZURE_CLIENT_ID=seu-client-id-do-azure
AZURE_TENANT_ID=seu-tenant-id-ou-common
AZURE_CLIENT_SECRET=seu-client-secret

# URLs
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# Database (se aplicável)
DATABASE_URL=postgresql://user:pass@host/db
```

---

## Timeline de Implementação

```
Hora 0-1:   Preparação + Instalação
            ├─ npm install dependencies
            └─ Configurar .env

Hora 1-2:   Backend Integration
            ├─ Copiar arquivos server/
            ├─ Registrar rotas
            └─ Testar com Postman

Hora 2-4:   Frontend Integration  
            ├─ Copiar componentes React
            ├─ Atualizar rotas
            └─ Testar no navegador

Hora 4-5:   Testes Completos
            ├─ Todos os cenários
            ├─ Mobile responsivo
            └─ Tratamento de erros

Hora 5-7:   Deploy
            ├─ Build
            ├─ Deploy backend
            └─ Deploy frontend

Hora 7-9:   Rollout + Suporte
            ├─ Treinamento colaboradores
            ├─ Suporte inicial
            └─ Monitoramento
```

---

**Visualização criada:** Julho 2026
**Status:** ✅ Arquitetura documentada e pronta
