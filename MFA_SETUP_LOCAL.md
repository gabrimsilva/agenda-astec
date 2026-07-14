# 🔐 MFA com Microsoft Authenticator - Setup Local

## ✅ O que foi implementado

### 1. **OAuth 2.0 + Microsoft Authenticator (SSO)**
   - Integração com Azure AD / Microsoft 365
   - Login corporativo com MFA automático
   - Rota: `GET /auth/microsoft` → `GET /auth/microsoft/callback`

### 2. **TOTP MFA (Time-based One-Time Password)**
   - Geração de secret TOTP
   - Validação de códigos do Authenticator
   - Backup codes para recuperação
   - Armazenamento seguro no banco

### 3. **Schema do Banco Atualizado**
   Campos adicionados na tabela `users`:
   - `mfaEnabled` - Flag se MFA está ativo
   - `mfaSecret` - Secret TOTP (base32)
   - `mfaBackupCodes` - Códigos de backup (JSON)
   - `microsoftAzureId` - ID do Azure AD
   - `updatedAt` - Timestamp de atualização

---

## 🚀 Como Testar Localmente

### Passo 1: Instalar Dependências

```bash
npm install @azure/msal-node speakeasy qrcode axios
```

### Passo 2: Criar Arquivo `.env` com Variáveis

```env
# Autenticação
SESSION_SECRET=sua_chave_secreta_jwt_aqui

# Azure/Microsoft 365 (opcional para teste básico)
AZURE_CLIENT_ID=seu_client_id_aqui
AZURE_TENANT_ID=common
AZURE_CLIENT_SECRET=seu_client_secret_aqui

# URLs
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

### Passo 3: Executar Servidor

```bash
npm run dev
```

### Passo 4: Testar Endpoints

#### 📝 Teste 1: Criar Usuário de Teste

```bash
curl http://localhost:3000/auth/test
```

Resposta:
```json
{
  "message": "✅ Usuário de teste criado",
  "credentials": {
    "email": "teste@astec.com",
    "password": "teste123"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### 🔓 Teste 2: Login Sem MFA

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@astec.com",
    "password": "teste123"
  }'
```

Resposta (sem MFA):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "abc123...",
    "email": "teste@astec.com",
    "name": "Usuário Teste",
    "role": "assistente"
  }
}
```

#### 🛠️ Teste 3: Configurar MFA

```bash
curl -X POST http://localhost:3000/auth/mfa/setup \
  -H "Authorization: Bearer seu_token_jwt" \
  -H "Content-Type: application/json"
```

Resposta:
```json
{
  "qrCode": "data:image/png;base64,iVBORw0KGg...",
  "secret": "JBSWY3DPEBLW64TMMQ======",
  "backupCodes": ["ABC12345", "XYZ98765", ...],
  "message": "Escaneie o QR code com Microsoft Authenticator"
}
```

#### 📱 Teste 4: Confirmar MFA (após escanear QR)

1. **Abrir Microsoft Authenticator no celular**
2. **Escanear QR code** ou inserir manualmente o secret
3. **Copiar código TOTP** (muda a cada 30 segundos)
4. **Enviar para API:**

```bash
curl -X POST http://localhost:3000/auth/mfa/confirm \
  -H "Authorization: Bearer seu_token_jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "totpCode": "123456",
    "secret": "JBSWY3DPEBLW64TMMQ======",
    "backupCodes": ["ABC12345", "XYZ98765", ...]
  }'
```

Resposta:
```json
{
  "message": "✅ MFA ativado com sucesso!",
  "backupCodes": ["ABC12345", "XYZ98765", ...]
}
```

#### 🔑 Teste 5: Login COM MFA Ativado

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@astec.com",
    "password": "teste123"
  }'
```

Resposta (MFA necessário):
```json
{
  "mfaRequired": true,
  "message": "Digite o código do Microsoft Authenticator",
  "userId": "abc123..."
}
```

Então, validar TOTP:
```bash
curl -X POST http://localhost:3000/auth/verify-mfa \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "abc123...",
    "totpCode": "654321",
    "useBackupCode": false
  }'
```

Resposta (sucesso):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "abc123...",
    "email": "teste@astec.com",
    "name": "Usuário Teste",
    "role": "assistente"
  },
  "message": "✅ Autenticação com sucesso"
}
```

#### 📊 Teste 6: Verificar Status de MFA

```bash
curl -X GET http://localhost:3000/auth/mfa/status \
  -H "Authorization: Bearer seu_token_jwt"
```

Resposta:
```json
{
  "enabled": true,
  "hasSecret": true,
  "backupCodesCount": 10
}
```

---

## 🎯 Fluxo de Autenticação

### Sem MFA
```
1. POST /auth/login (email + senha)
   ↓
2. Validar credenciais
   ↓
3. Retornar JWT token
```

### Com MFA Habilitado
```
1. POST /auth/login (email + senha)
   ↓
2. Validar credenciais
   ↓
3. Retornar mfaRequired: true + userId
   ↓
4. POST /auth/verify-mfa (userId + TOTP code)
   ↓
5. Validar código TOTP
   ↓
6. Retornar JWT token
```

### Microsoft OAuth Flow
```
1. GET /auth/microsoft
   ↓ (Redireciona para login Microsoft)
2. Usuário faz login no Azure AD
   ↓ (Microsoft Authenticator valida MFA)
3. Redireciona para /auth/microsoft/callback
   ↓
4. Trocar código por token
   ↓
5. Criar/atualizar usuário no banco
   ↓
6. Redirecionar para frontend com JWT
```

---

## 📱 Configurando Microsoft Authenticator (Celular)

### No Android / iOS:

1. **Abra Microsoft Authenticator**
2. **Toque em "Adicionar conta"**
3. **Escolha "Outra conta"** ou **"QR code"**
4. **Escaneie o QR code** da tela de setup
5. **Pronto!** O código aparecerá automaticamente

### Usando Secret Manualmente:
```
Se o QR não ler, use este secret:
JBSWY3DPEBLW64TMMQ======

Tipo: TOTP (Time-based)
Algoritmo: SHA1
Dígitos: 6
Período: 30 segundos
```

---

## 🔧 Integração Frontend (Próximo Passo)

### Tela de Login:
```tsx
// 1. Input email + senha
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

// 2. Fazer login
const handleLogin = async () => {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  
  const data = await res.json();
  
  if (data.mfaRequired) {
    // Mostrar tela de TOTP
    setShowMfaScreen(true);
    setUserId(data.userId);
  } else {
    // Guardar token e redirecionar
    localStorage.setItem("token", data.token);
    navigate("/dashboard");
  }
};
```

### Tela de MFA:
```tsx
// 1. Input do código TOTP
const [totpCode, setTotpCode] = useState("");

// 2. Validar TOTP
const handleMfaVerify = async () => {
  const res = await fetch("/api/auth/verify-mfa", {
    method: "POST",
    body: JSON.stringify({ userId, totpCode }),
  });
  
  const data = await res.json();
  
  if (data.token) {
    localStorage.setItem("token", data.token);
    navigate("/dashboard");
  }
};
```

### Setup de MFA (Primeira vez):
```tsx
// 1. Gerar QR code
const handleSetupMfa = async () => {
  const res = await fetch("/api/auth/mfa/setup", {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  const data = await res.json();
  
  // 2. Mostrar QR code
  setQrCode(data.qrCode);
  setBackupCodes(data.backupCodes);
  
  // 3. Após escanear, solicitar confirmação
  setShowMfaConfirm(true);
};

// 4. Confirmar setup
const handleConfirmMfa = async () => {
  const res = await fetch("/api/auth/mfa/confirm", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      totpCode,
      secret: qrCodeSecret,
      backupCodes,
    }),
  });
  
  const data = await res.json();
  alert("MFA ativado! Salve seus códigos de backup.");
};
```

---

## ⚠️ Notas Importantes

### Segurança:
- ✅ Senhas hasheadas com bcrypt (10 rounds)
- ✅ JWTs assinados com SESSION_SECRET
- ✅ TOTP secrets armazenados em base32
- ✅ Backup codes descartáveis (one-time use)

### Variáveis Obrigatórias:
- `SESSION_SECRET` - Para assinar JWTs

### Variáveis Opcionais (Microsoft OAuth):
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_SECRET`

### Recuperação de Conta:
- Se usuário perder acesso ao Authenticator
- Pode usar um dos 10 **backup codes**
- Cada backup code é válido uma única vez

---

## 🐛 Troubleshooting

### Erro: "MSAL não inicializado"
→ Configure as variáveis do Azure ou deixe em modo demo

### Erro: "Código TOTP inválido"
→ Verifique se o relógio do celular está sincronizado
→ Tente usar um backup code

### Erro: "Session expirada"
→ Token JWT expirou (7 dias)
→ Faça login novamente

---

## 📋 Arquivos Criados

```
server/
├── microsoft-auth.ts      ← OAuth 2.0 + Microsoft Authenticator
├── mfa-manager.ts         ← Geração/validação TOTP + Backup codes
├── auth-routes.ts         ← Rotas de autenticação
└── middleware.ts          ← Atualizado com verifyToken

shared/
└── schema.ts              ← Tabela users com campos MFA

MFA_SETUP_LOCAL.md         ← Este arquivo
```

---

## ✨ Próximos Passos

1. **[ ] Testar endpoints com curl/Postman**
2. **[ ] Atualizar UI com telas de login/MFA**
3. **[ ] Integrar Microsoft Authenticator no celular**
4. **[ ] Testar com seus 12 colaboradores**
5. **[ ] Fazer deploy em produção**
6. **[ ] Habilitar MFA obrigatório para todos**

---

**Status:** ✅ Implementação local concluída
**Pronto para testar:** Sim, execute `npm run dev` e comece a testar os endpoints
